---
title: "Shipping an AI Photo Editor as a WordPress Plugin: 22 Versions of Hard Lessons"
description: "From a single HTML file to a shipped WordPress plugin: the fal.ai async queue, a watermark that must never silently fail, optional lead capture, and five bugs that only appeared in production."
pubDate: 2026-09-18
category: case-studies
tags: [wordpress, php, fal-ai, docker, ai-image, javascript]
ogImage: /og/shipping-an-ai-photo-editor-as-a-wordpress-plugin.png
banner: /banners/shipping-an-ai-photo-editor-as-a-wordpress-plugin.png
draft: false
---

A few weeks ago I [wrote about the proof of concept](/posts/ai-furniture-compositing-with-flux-kontext/): one
`index.html`, no backend, two furniture photos in, a staged room scene out. It
answered the question it was built to answer — *can you keep the real product and
only generate the room around it?* — and it left one obvious question open.

That PoC ended with the words *"before committing to the full WordPress plugin."*
This post is about the plugin. It went from version `0.0.1` to `0.0.22` across 58
commits, and almost none of that work was the AI part.

## Why it matters (for a business owner, not a developer)

The PoC's limitation was that it lived in a single HTML file with the API key in
the source. That's fine for a demo you email a client. It is not fine for
something a furniture shop puts on their own website, where:

- **The API key cannot be in the browser.** Anyone can view-source and drain your
  fal.ai credit. It has to live server-side, behind a settings screen an admin
  controls.
- **Nobody wants to babysit a generation.** The visitor uploads, waits, gets a
  picture. If the process dies halfway, the shop owner should never hear about it.
- **Photos of customers must not leak.** An anonymous visitor's source photo must
  never end up in the public Media Library, and a result must never be public
  unless *that visitor* opted in to sharing it.
- **Output needs a watermark.** Otherwise you're running a free AI photo service
  for the entire internet.
- **The owner needs to capture the lead.** An AI tool that produces a pretty
  picture and no contact details is a toy. Attached to a form + webhook, it's a
  lead pipeline for a furniture business.

Every one of those five points is a *product* requirement, and every one of them
cost more code than the AI call itself.

## Architecture: the boring parts that make it work

The plugin is a normal WordPress plugin — PHP prefix `hre_`, namespace `HRE`,
custom tables created with `dbDelta()` on activation, an autoloader, no Composer
runtime dependency. The interesting decisions are elsewhere.

### Generation is asynchronous, always

fal.ai jobs take 15–20 seconds. PHP-FPM request timeouts, `max_execution_time`,
and impatient visitors make synchronous generation a losing bet. So the flow is a
queue-and-poll:

```
visitor uploads  →  POST /uploads         →  normalize → start vision analysis
visitor picks    →  GET  /prompts/{cat}   →  per-style prompts
visitor confirms →  POST /jobs            →  fal queue submit (returns uuid)
browser polls    →  GET  /jobs/{uuid}     →  status: queued | processing | done
```

The visitor never waits on a provider. The job row carries the fal request id, and
a poll either finds a finished result or shows genuine progress. The front end is
a small state machine over a session cookie, so a mid-wizard refresh restores
where the visitor was.

### Ownership is the session cookie, not an ID in the URL

Anonymous visitors have no accounts, which makes authorization easy to get wrong.
The rule I settled on: **every read resolves through the caller's own session
hash**, never through an ID accepted from the client.

- `GET /preview` streams the caller's *own* normalized upload. There is no path or
  URL parameter at all — a stranger requesting it gets a 404 because their session
  has no file. This also keeps private storage paths out of every JSON payload.
- `GET /jobs/{uuid}` looks the job up *by session hash + uuid*. Guessing a UUID
  from another browser returns nothing.

That's one decision that removes an entire class of "I changed the id in the URL
and saw someone else's photo" bugs.

### The watermark is a hard requirement, so a fallback must never be silent

This is the bug that taught me the most. The watermark step does a GD
`imagecopyresampled` composite. If it ever fails, the tempting "resilient" move is:

```php
// DON'T do this
if ( ! $watermarked ) {
    rename( $stage, $final );   // ship the un-watermarked file
}
```

I did exactly that. It's silent, it has no log line, and it means the plugin
happily serves un-watermarked results while the admin screen says "watermark: on."
The owner found out weeks later by noticing a photo without a watermark.

The fix was three parts:

1. **Log the root cause, not the nearest symptom.** `apply()` returned
   `hre_no_watermark_source` — a downstream error. The real cause was that the
   watermark source resolution chain (`site_logo` → `get_theme_mod('custom_logo')`)
   had no logo to resolve. I added a `block_reason()` diagnostic that re-walks the
   chain and returns a *specific* message per failure branch.
2. **Surface it in the admin.** A persistent `notice-warning` says the watermark
   is enabled but won't be applied, plus the concrete reason. No log-reading
   required.
3. **Make the failure visible to me in testing.** A standalone probe composites a
   known watermark onto a known base and samples a pixel inside the expected
   watermark rectangle — proving the transform path itself works, which separates
   "the feature is broken" from "the feature is unconfigured."

**Rule I now follow:** when a best-effort branch masks a non-negotiable transform,
it must log the concrete reason *and* warn in the admin UI. A silent fallback that
degrades a required feature is not resilience — it's a bug with good manners.

### Lead capture: off by default, asynchronous when on

Lead capture is a master toggle. Off, the plugin collects nothing and the wizard
behaves exactly as before. On, the visitor's configured fields are required before
generation, stored in a custom table, and forwarded to a webhook.

Two decisions worth copying:

- **The field list is admin-defined and fully dynamic** — `{key, label, type,
  required, placeholder, options[]}` — so the front form renders itself from
  config. The defaults (name, phone, email, message, consent) are just a starting
  point the owner can replace entirely.
- **Webhook delivery is scheduled, never inline.** The visitor must not wait on
  someone else's endpoint:

```php
wp_schedule_single_event( time() + 5, 'hre_lead_webhook', array( $lead_id ) );
```

Delivery retries three times with linear backoff, then marks the record `failed`.
The admin list shows a status badge (pending / retrying / delivered / failed) plus
the attempt count, and — this matters — the plugin's data retention rule keeps
*delivered* leads but purges undelivered ones on the normal schedule, because an
undelivered lead is just PII sitting in your database.

### The provider kill switch has to be enforced server-side

The admin can disable the image provider and set a message that visitors see
instead of the generate button. Greying out the checkbox is UX; the enforcement is
a check at the top of the job-creation endpoint:

```php
if ( ! (bool) Settings::get( 'fal_provided' ) ) {
    return $this->error_response( 'hre_provider_disabled', $msg, 503 );
}
```

Same for the lead gate. The browser gate is UX. The server gate is the product.

## The five bugs that only showed up in the real install

This is the part no article about "building an AI plugin" ever includes, and it's
where most of the 58 commits went.

### 1. Admin REST routes registered inside `is_admin()` silently 404

Registering admin routes only when `is_admin()` is true looks correct and is
completely broken: **REST requests report `is_admin() === false`**, so the routes
are never registered and every call returns `404 "No route was found matching the
URL and request method"` — which reads exactly like a URL typo, not a registration
bug. Register at plugin boot; the `permission_callback` (capability + nonce) is
what gates access.

### 2. `rest_url()` has no trailing slash

The one that cost me the most recent afternoon. `rest_url()` returns
`https://example.com/wp-json/my-plugin/v1/` — the trailing slash is on the
*namespace*, and the next path segment must start with its own slash. Concatenating
without one:

```js
const rest = window.hreAdmin.rest;      // ".../wp-json/hoelee-ai-photo-remix/v1"
fetch( rest + 'admin/photos/' + id )    // ❌ ".../v1admin/photos/123"
fetch( rest + '/admin/photos/' + id )   // ✅
```

`.../v1admin/photos/123` is a 404 with no browser console error, so the
`catch` block fires and the UI shows the generic *"Something went wrong."* It had
quietly broken **four** endpoints — photo pagination, photo delete, the webhook
test button, and lead resend. The fix is one character per call site; the
diagnosis took far longer, because the failure mode is indistinguishable from a
server error. Prove it with two curls: the correct join returns `403` (route
exists, nonce missing), the broken one returns `404`.

### 3. A WordPress admin settings form can wipe a different tab's settings

Each admin tab posts only its own fields, but the save handler runs the *whole*
settings map. A checkbox that isn't submitted looks identical to a checkbox that
was unchecked, so saving the "limits" tab silently wrote `false` over the
"share by default" option, and saving that one cleared the entire lead-capture
configuration. The fix belongs in the sanitizer, not the forms — distinguish
"absent from this submission" from "present and empty":

```php
// present in this tab  → use the new value (a cleared field clears)
// absent from this tab → keep the current value
if ( array_key_exists( $key, $raw ) ) {
    $clean[ $key ] = sanitize( $raw[ $key ] );
}
```

I added a regression test for exactly this (seed config → save a different tab's
subset → assert the seed survived). It's the kind of bug that only exists once you
have two tabs, which is why it shipped.

### 4. A binary endpoint must not go through a JSON fetch helper

The result download is a JPEG stream. The shared `api()` helper did `res.json()`
on every response, which threw on image bytes — and a swallowing
`.catch(function(){})` ate the error, so the symptom was *"the result never shows
up"* with nothing in the console. Blob endpoints need their own raw fetch helper
that checks `res.ok`, parses JSON only on error, and returns `res.blob()` on
success.

### 5. A size limit that fires before the resize defeats the resize

The plugin downscales uploads to a working size (1920×1080 bounds). I had set the
decompression-bomb guard too low — 1 MB / 1 MP — which meant every legitimate
phone photo was rejected *before* it could be resized. Visitors saw the preview
appear and instantly de-select, reported as "the resize feature is broken."

The real lesson is UX, not numbers: the client must reject an over-limit file
*before* showing the local preview. Flash-then-disappear reads as a bug even when
the message underneath is correct. The caps now sit at 15 MB / 50 MP, high enough
that normal photos always pass and get normalized.

## What I'd do differently

- **Write the failure path first for anything the product depends on.** The
  watermark bug existed because I wrote the happy path and then hid the unhappy
  one. Now I write the "what does the owner see when this breaks" branch before
  the feature is finished.
- **Test REST joins against the live site on day one.** A two-curl check
  (`.../v1/admin/x` → 403 vs `.../v1admin/x` → 404) would have caught four broken
  endpoints in week one instead of week four. I've added it to the project's
  `AGENTS.md` so it can't recur.
- **Don't guess at a provider's API surface.** I lost time on `fal.ai/api/me`
  (which doesn't exist) before discovering the right key check is an authenticated
  `POST {}` to the queue endpoint: `401` means rejected, anything else means the
  key is fine. Read the real schema, then write the client.
- **Keep the front end to two shortcodes.** I was tempted to split the wizard into
  five shortcodes and five page-builder widgets. Keeping it as one app + one
  gallery shortcode meant every UI iteration was a single-file change, and that
  iteration speed is the reason 22 versions shipped.

## The result

A production-shaped WordPress plugin: **`0.0.22` across 22 releases**, with 10
custom database tables, an async fal.ai queue, server-side key handling, dynamic
lead capture with a retrying webhook, a role-aware photo archive, and everything
configurable from a 10-tab admin screen without touching code.

It is the difference between a demo and a product, and — the number I actually
care about — **58 commits, of which roughly four were about the AI model.** The
rest was the unglamorous work that decides whether a client can run the thing
without me: validation, retention, permissions, failure visibility, and an admin
screen that tells the truth.

---

## Want this for your business?

I build WordPress plugins, AI image pipelines, and self-hosted infrastructure for
Malaysian SMEs — and I ship them as products you can actually run, not demos you
have to babysit. If you want AI product photography, a lead-capture pipeline, or
a custom plugin for your business, I'd love to talk:

- 📱 **WhatsApp:** [+60 12-797 2969](https://wa.me/60127972969)
- 📧 **Email:** [me@hoelee.com](mailto:me@hoelee.com?subject=WordPress%20AI%20plugin%20project)
- 🌐 **Website:** [hoelee.com](https://hoelee.com)
