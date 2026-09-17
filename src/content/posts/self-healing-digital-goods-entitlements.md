---
title: "Self-Healing Access Control for Digital Goods: NocoDB, n8n, and AList"
description: "How I built a five-workflow entitlement system that grants, expires, and continuously repairs customer file access — with a build-time code-sharing trick and a public endpoint designed to leak nothing."
pubDate: 2026-09-18
category: case-studies
tags: [n8n, nocodb, alist, access-control, docker, automation, digital-goods]
ogImage: /og/self-healing-digital-goods-entitlements.png
banner: /banners/self-healing-digital-goods-entitlements.png
---

I sell digital products — files, artwork, licensed assets — and deliver them
through a self-hosted file portal. The hard problem was never storage. It was
**entitlement**: making sure that when someone buys, they get exactly the
folders they paid for, for exactly as long as they paid for, and that when
they stop paying, the access actually goes away.

Doing that by hand works for the first ten customers. It does not work for a
hundred, and it fails in a specific and nasty way: silently. Nothing errors
when a subscription expires and the customer keeps downloading. You just keep
serving files to someone who stopped paying months ago.

So I built it as five n8n workflows that treat access as **derived state** —
computed from my business database, applied to the file server, and
continuously re-verified. Here's the architecture, the code-sharing trick that
makes it maintainable, and the security reasoning behind the one public
endpoint.

## Why it matters

For a digital-goods business, access control *is* the product. You're not
protecting a warehouse; you're protecting the thing you sold. Two failure modes
cost real money:

- **Under-granting** — a paying customer can't reach what they bought, and you
  find out from an angry message rather than a monitoring alert.
- **Over-granting** — expired or revoked customers keep access, and the leak
  is invisible until someone resells your catalog.

Manual administration guarantees both, eventually. The fix is to stop treating
a grant as a *thing you do* and start treating it as a *function of your data*:
given the customer's current purchases, what should they be able to reach right
now? Compute it, apply it, and then prove it's still true on a schedule.

## The shape of the system

Five workflows, each with one job:

| Workflow | Trigger | Responsibility |
|---|---|---|
| **W1** — Customer Provision & Status Lifecycle | NocoDB webhook (customer row) | Create/update the file-server user; enable or disable on status change |
| **W2** — CustomerProduct Sync | NocoDB webhook (purchase row) | Recompute and apply that customer's allowed paths |
| **W3** — Expiry Sync | Cron, every 5 minutes | Sweep expiring entitlements; deselect paths that lapsed |
| **W4** — Daily Full Reconciliation | Cron, 03:00 + manual webhook | Compare *desired* vs *actual* for everyone; repair drift; log | 
| **W5** — Footer Purchase Check | Public GET webhook | Let the portal show a customer their own purchases; read-only |

The data lives in **NocoDB** (a self-hosted Airtable-style database) as
Customers, CustomerProducts, Products, Resources, and AccessGrants. The file
server is **AList**, which gives each customer a user and a role whose
`permission_scopes` is a list of paths.

The crucial design decision: **NocoDB is the business source of truth. AList is
only enforcement state.** Sync runs one way. A manual tweak in the AList admin
UI is not a configuration change — it's drift, and W4 repairs it back.

## The algorithm: what *should* this customer have?

Everything hinges on one function. Desired paths for a customer is the union of
two sources:

1. Every resource reachable from an **active, not-yet-expired** purchase.
2. Every resource granted directly via an **active, not-yet-expired** manual grant.

The interesting case is a resource reachable through *two* different products.
If a customer bought Product A (expires in 30 days) and Product B (expires in
200 days) and both include the same folder, the correct expiry is the **latest**
one — buying more of something should never shorten your access to it.

```js
// For each product's resources, keep the MAX expiry per path.
for (const c of cps) {
  if (c.status && c.status !== 'active') continue;
  if (c.expires_at && String(c.expires_at) <= today) continue; // expired
  const pid = linkId(c.product);
  if (!pid) continue;
  const res = (await ncGet(ctx,
    `/api/v2/tables/${T_PROD}/links/${LNK_PROD_RES}/records/${pid}`)).list || [];
  const exp = c.expires_at;
  for (const r of res) {
    const p = resPath[r.Id];
    if (!p) continue;
    const cur = desired[p];
    if (!cur || !cur.expires || (exp && exp > cur.expires)) {
      desired[p] = { expires: exp || null, permission: cur?.permission ?? 0 };
    }
  }
}
```

Note the boundary: `<= today`. **Expiring today counts as expired.** Off-by-one
on an expiry check is the difference between a subscription period and a free
extra day, and if you're not explicit about it you'll get it wrong in the
customer's favour.

## The problem: n8n Code nodes can't share code

Here's the constraint that shaped the whole codebase. n8n Code nodes are
self-contained: there's no `require`, no `import`, no filesystem access to a
shared module. So the obvious structure — one grants algorithm, called by W1,
W2, W3, and W4 — is exactly what the platform prevents.

Copy-pasting that function into four nodes would have been a guaranteed
maintenance disaster. Four copies of an expiry rule is four chances for them to
disagree, and a system that computes access four different ways is worse than
no system.

The fix was to make the sharing happen at **build time** instead of run time:

- `shared/effective-grants.js` is the single source of truth, and it's written
  to be self-contained: no `require`, no `process.exit`, no top-level `return`
  outside a function. It also takes its config through a `ctx` argument
  (`{ $env, helpers }`) rather than reaching for globals — which has the happy
  side effect that it's **unit-testable outside n8n entirely**.
- `gen_w1.js`, `gen_w2.js`, `gen_w3.js`, `gen_w4.js` read that file, inline it
  into the workflow's Code node body, and update the workflow.

The result is one algorithm, four workflows, zero runtime dependencies — and a
version of the function that I can test with plain Node before it ever touches
a live system. The code is duplicated in *artifacts* but never in *sources*,
which is the same tradeoff a bundler makes.

One n8n-specific wrinkle worth knowing: **custom environment variables are only
reliably readable via `$env` inside a Code node — `process.env` is not
dependable there.** That's why every workflow has an explicit "Load Env" node
that lifts the values it needs onto the item, rather than reading config
wherever it's convenient.

## Making expiry safe to automate

W3 runs every five minutes and reconciles expiring entitlements. Two details
make it safe to let a cron job modify live access:

**It only disables when access genuinely ran out.** A naive "if no desired
paths, disable the user" rule is dangerous — it will happily disable a
brand-new customer who simply hasn't been granted anything yet. The guard is
explicit:

```js
// Only disable when a customer that HAD scopes now has none.
// currentPaths.length > 0 avoids killing a fresh, not-yet-granted customer.
const shouldDisable = AUTO_DISABLE && nowEmpty
  && cust.status === 'active' && currentPaths.length > 0;
```

**It has a dry-run mode.** `W3_DRY_RUN=true` on the container (or a query
parameter on the manual webhook for W4) makes the sweep compute and report its
plan while performing **zero writes**. Being able to ask "what would you do?"
before letting a schedule do it is the single most useful safety feature I've
added to any automation.

```js
const DRY_RUN = ($env.W3_DRY_RUN || '').toLowerCase() === 'true';
```

## The daily repair: assuming you'll drift

W4 is the workflow I'd argue is the real product. It runs at 03:00, walks every
customer, and compares desired state against actual state — then repairs the
difference and **verifies the repair**.

The drift matrix it handles:

- **Should be active** → user must exist (looked up *by username first*, to
  avoid creating duplicates if a stored ID was lost), be enabled, and carry
  exactly the computed role scopes.
- **Should be inactive** → disabled, with scopes emptied. Pending customers
  stay without a user entirely — no auto-creation.
- **Dangling references** → a stored user or role ID points at a record that no
  longer exists. Look it up by name, adopt it if found, recreate if not.
- **Username drift** → detected and *logged*, never destructive-migrated.

Every repair is verified by re-reading the file server's state afterwards. A
failed verification is logged as `verify_failed` rather than assumed successful,
and the reconciliation log only receives **drift, repair, and error rows** —
healthy customers produce nothing. That last choice is what makes the log
usable: if it's empty, everything is fine, and you don't have to read past a
thousand "no change" lines to find the one that matters.

## The public endpoint, and why there's no HMAC

W5 lets the file portal's footer show a signed-in customer their own purchases
and expiry dates. It's a **public** webhook, and the security reasoning is the
part I'm most deliberate about.

The obvious instinct is to sign requests with an HMAC. I didn't, and the reason
is worth stating plainly: **the key would have to ship to the browser, so the
signature would be theatre.** A shared secret that every client holds protects
nothing — it just adds ceremony that makes the endpoint *look* verified.

So the endpoint relies on things that actually hold:

- **CORS locked to one origin.** The response carries
  `Access-Control-Allow-Origin: https://drive.example.com`, so only the portal's
  own pages can read the response in a browser.
- **Minimal data by design.** The response returns product name, expiry date,
  display state, and public folder paths. No internal database IDs, no customer
  PII, nothing about other customers.
- **Rate limiting at the edge,** via a WAF rule on the request path, to blunt
  username enumeration.

And one subtle architectural choice: **the username comes from the caller's own
session token, decoded client-side**, rather than from a parameter the client
can set freely. The endpoint never authenticates to the file server, which
avoids a whole class of connection state and device-registration side effects
that a server-side login would introduce on every footer render.

The honest framing: this endpoint is not a trust boundary, and I don't pretend
it is. It shows a customer what they already know about themselves, over a
response shape that's useless to anyone else.

## The bug that taught me the most: public path, cascading failure

W5 originally fetched data by calling NocoDB at its **public** hostname —
through a Cloudflare tunnel. It worked in testing. Under real load it produced
this chain:

1. Public round-trip latency exceeded 60 seconds under load.
2. nginx upstream timeout fired → **504**.
3. The footer's client-side fetch had an 8-second timeout and retried **every
   second**.
4. Retries piled up connections.
5. Those connections exhausted the pool → **503** for unrelated requests.

A slow dependency became a cascading outage of a different service. The fix
was to stop crossing the internet to reach something on the same Docker
network:

```js
// n8n and NocoDB share the `bridge_hoelee` network; NocoDB listens on :10380.
// The public route added CF-tunnel jitter and could exceed the proxy timeout.
const NOCODB_URL = 'http://nocodb:10380';
```

**~30 ms internal versus 300 ms+ public, with no tunnel variance** — and the
entire failure chain disappeared, because the trigger condition (multi-second
latency) can no longer occur.

The lesson generalises well beyond this stack: **when a service and its
dependency are in the same container network, the public hostname is a bug
waiting for load.** And when you see a 503 downstream of a 504, look for a
client that retries aggressively — the retry loop is usually the amplifier, not
the original problem.

## What I'd do differently

1. **Build the drift repair first, not last.** I wrote the grant path, then the
   expiry sweep, then the reconciliation. In retrospect the reconciliation is
   what makes the other two safe to operate, and it should have existed from
   day one — because "assume you will drift" is a design stance, not a feature.
2. **Write the desired-state function before any workflow.** Having it live in
   `shared/` and be unit-testable *outside* n8n is why the whole system stayed
   coherent across four workflows. If I'd started by pasting logic into nodes,
   I'd have shipped four subtly different expiry rules.
3. **Never cross the public internet between two containers on the same host.**
   This one cost me a genuine outage, and it's a rule I now apply by default
   rather than discovering per-integration.
4. **Put the dry-run switch in from the beginning.** Adding `DRY_RUN` after the
   fact was easy; operating a scheduled job that mutates access *without* one
   was an unnecessary few weeks of nerves.

## The result

Five workflows run the full entitlement lifecycle: a purchase in the database
becomes usable access within seconds, expiries sweep every five minutes, and a
nightly full reconciliation repairs any drift and verifies each repair. The
reconciliation log is empty when everything is healthy — which, most days, is
what it says.

The design principle worth taking away is the one that made it tractable:
**stop administrating access, and start asserting it.** Define what a customer
should have as a pure function of your business data, apply that function
whenever the data changes, and re-assert it on a schedule to catch everything
else. Then the system doesn't need you to be careful — it just needs you to be
correct once, in one function.

---

## Want this for your business?

If you sell digital products and you're still granting file access by hand —
or you're not certain that expired customers lost access last month — I build
exactly this: self-hosted entitlement systems where access is computed from
your data, expires on its own, and repairs itself nightly. I work with
NocoDB, n8n, AList, and Docker, and I hand it back documented so you can
operate it without me.

Reach me at [me@hoelee.com](mailto:me@hoelee.com?subject=Access%20control%20for%20digital%20goods)
or WhatsApp [+60 12-797 2969](https://wa.me/60127972969), or see what I do at
[hoelee.com](https://hoelee.com).
