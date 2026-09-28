---
title: "How I Vet an Open-Source Dependency Before Betting On It"
description: "Six checks that catch a repo which doesn't do what its docs claim — grep for the feature, read the doc's target branch, check the tier gate and the payment rail."
pubDate: 2026-09-29
category: devops
tags: ["open-source", "due-diligence", "oidc", "self-hosting", "docker"]
ogImage: "/og/vetting-an-open-source-dependency-before-you-bet-on-it.png"
banner: "/banners/vetting-an-open-source-dependency-before-you-bet-on-it.png"
draft: false
---

I was handed a 1,300-line architecture spec for a partner program. It read like a
plan: consistent, cross-referenced, confident. It named a self-hosted
open-source engine as the attribution and commission layer, and it assumed three
things about that engine — that it spoke OIDC so my existing identity provider
could log partners in, that its commission rules covered the five shapes the
business needed, and that its white-label feature was shipped.

Ten minutes of `curl` and `grep` later, two of those were false and the third was
half-true. None of that is unusual. The README describes the *product*; the
repository describes the *software*. The gap between those two is exactly where
integration projects die — and it is cheap to measure before you write any code.

## The problem, phrased as the question I'd actually search for

**How do I know an open-source project does what its documentation claims before
I build on it?**

A spec is a claim *about other software*. The more polished the spec, the more its
assumptions read like facts — this one cited sources, defined stable IDs, and had
a source-of-truth matrix. What it never did was check whether the engine down the
chain implemented the features being assigned to it. So before installing
anything, I went looking for those specific features.

## What I tried first, and why it wasn't enough

**1. Read the README end to end.** It sells the pipeline well:
`click → identity → event → attribution → commission → payout`. It never once
says which authentication protocol the app speaks. For a feature you *need*,
silence isn't neutral — but an absent mention is easy to skim past when the rest
of the page is convincing.

**2. Searched the web.** Several of my queries returned nothing usable. The
project is a few months old and its SEO surface is thin. For software that's
fine — the source *is* the documentation. It just means the reading has to happen
in the repo, not in a blog post.

**3. Found a 78 KB feature design doc and assumed the feature shipped.** It was
labelled "FINAL, post-review", listed three reviewers, and carried a date. I took
that as proof. That was the worst inference of the three, and the easiest to check.

## The six checks that actually settled it

### 1. Read the repo's vital signs before any feature claim

```bash
curl -s -H "User-Agent: hermes" https://api.github.com/repos/<owner>/<repo> \
  | grep -E '"created_at"|"pushed_at"|"stargazers_count"|"forks_count"|"open_issues_count"|"archived"|"spdx_id"'
```

What came back: MIT, created 2026-04-23, last push 2026-09-10, 8 stars, 3 forks,
15 open issues, not archived. Read the same as: **real, still moving, and very
small** — one vendor, which also sells a hosted tier. Now I know how much of my
business I want resting on it *before* I start grading its features.

### 2. Grep for the feature instead of reading for it

```bash
grep -in 'oidc\|sso\|saml' README.md ARCHITECTURE.md docs/*.md | wc -l
```

Zero hits. The app authenticates with its own magic-link sessions and
per-persona API keys; it does not speak OIDC at all. That one line of output
killed a phase of the plan — "put the portal behind our SSO provider" — which
would otherwise have surfaced weeks later, mid-integration, with a partner
already invited. Reading for a feature you can't find is how you lose an
afternoon; grepping makes the absence loud.

### 3. Read the target branch line at the top of a feature doc

```bash
head -5 docs/white-label-custom-domains.md
```

`Target branch: multi-tenant`. The doc is a design for a branch that is not the
default branch — it describes work in flight, so the feature is not in the code
you would install. A finished-looking document with reviewers and dates can
document something unshipped. That isn't dishonesty; it's what design docs are.

### 4. Read the data model, not the feature list

The commission section named exactly two rule types — `percent` (with a recurring
flag) and `fixed`. The business spec had enumerated five. That gap isn't a bug;
it's a modelling job I'd have to do in configuration instead of expecting from
the product:

| Spec assumed | What the engine actually has |
|---|---|
| first-order bonus | a `fixed` rule on the first event |
| event-specific rules (`lead` vs `invoice_paid`) | one rule per campaign — so: two campaigns |
| recurring commission | `percent` + `recurring: true` |
| percentage | `percent` ✅ |
| fixed | `fixed` ✅ |

Two rule primitives, five behaviours — workable, but only if you design for it up
front instead of discovering it during implementation.

### 5. Check which paid tier gates the feature you need

For the database tool in the same stack, the edition table was blunt:

| Feature I needed | Community (free) | Enterprise (paid) |
|---|---|---|
| API tokens, so I can automate it | ✅ | ✅ |
| SSO / OIDC | ❌ | ✅ |
| Page designer, hide branding, 2FA | ❌ | ✅ |

The thing I wanted for the partner-facing door (SSO) sits behind the commercial
gate, while the thing I wanted for automation (an API token) is free. Knowing
which side of the wall each requirement falls on changes the design — before
you've designed around it.

### 6. Check that the money rail works in your country

The payout model was `stripe_connect | manual`, and self-hosted mode was
documented as "operator manages out-of-band" — i.e. you move the money yourself.
Stripe Connect is not how Malaysian businesses pay partners, so that one line
decided the entire deployment shape: self-host mode, manual payouts, and event
ingestion pushed from my own order system rather than leaning on the provider's
payment integration. That line is never on a marketing page, and it mattered more
than any feature.

### Then: ask the fallback question before you need it

"What if the feature I need isn't there?" For the missing SSO the answer was:
don't put login in the app, put it in front of the app. authentik's proxy
provider exists to protect "applications that do not support native
authentication protocols such as OIDC, SAML, or LDAP", and it injects
`X-authentik-username` and `X-authentik-groups` headers upstream, so the reverse
proxy can do the gating. That turned "no SSO support" from a disqualification
into an afternoon of config.

## What I'd do differently

- **Write the requirement list first, then go look for it.** Five lines — the
  features *I* need — and search for those. Starting from the README's feature
  list means grading the software on the vendor's exam.
- **Treat "a doc exists" as different from "a feature ships".** Read the branch
  line.
- **Grep, don't read.** Presence is cheap to prove; absence is the thing you're
  hunting.
- **Decide the fallback before the decision**, so a missing feature becomes a
  design change rather than a surprise.
- **Pin the commit.** This project's README says its API is "stable but
  unversioned" and there is no OpenAPI description anywhere in the tree. There's
  no contract to compile against, so the commit hash *is* the contract — the
  endpoints I use go into my own docs, and upgrades get a regression pass.

## The result

Six assumptions corrected in about ten minutes of `curl` and `grep`, before a
single line of integration code existed. The project stayed viable — but
reshaped: no OIDC, manual payouts, a pinned commit, and a plan that no longer
depends on a feature sitting on an unmerged branch.

The spec wasn't wrong to be optimistic. It was wrong to be unverified, and that's
the cheapest thing on the whole project to fix.

---

**Building on a self-hosted stack, and want a second pair of eyes on whether
those features will actually be there when you integrate?** That's the kind of
review I do.

[WhatsApp +60 12-797 2969](https://wa.me/60127972969) ·
[me@hoelee.com](mailto:me@hoelee.com?subject=Open-source%20dependency%20review) ·
[hoelee.com](https://hoelee.com)
