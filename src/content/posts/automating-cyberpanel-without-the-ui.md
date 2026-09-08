---
title: "Automating CyberPanel Without the UI: Reverse-Engineering an Undocumented v2 API"
description: "CyberPanel v2 killed the documented JSON API and left only the Angular UI's own session+CSRF endpoints. Here's the exact auth flow and how I found the real functions behind the pages."
pubDate: 2026-09-09
category: devops
tags: [cyberpanel, api, reverse-engineering, automation, django, self-hosting, curl]
ogImage: /og/automating-cyberpanel-without-the-ui.png
banner: /banners/automating-cyberpanel-without-the-ui.png
---

I run CyberPanel 2.4.4.1 inside an Ubuntu VM on my home lab to host a handful
of small sites. It sits at `https://panel.hoelee.com`, reverse-proxied to an
internal box. Recently I wanted to script two things against it — list my
sites and delete one — without opening the browser. This is the story of
finding that the "official" API doesn't exist anymore, and reverse-engineering
the real one from what the Angular UI quietly calls under the hood.

## The problem: the documented API is gone

Every search result, the Apiary docs, and the Knowledge Base point you at the
same thing — a JSON API where you `POST` your `adminUser` and `adminPass` to
`/api/verifyConnection`:

```bash
# What the old docs tell you to do. This does NOT work on CyberPanel v2.
curl -k -X POST https://panel.hoelee.com:8090/api/verifyConnection \
  -d '{"adminUser":"admin","adminPass":"...","serverUserName":"..."}'
```

On CyberPanel v2 (2.4.x), this returns nothing useful. The `/api/` prefix is
the legacy surface — it was dropped. There's no `adminUser`/`adminPass`
exchange anymore. The official documentation is simply out of date, which is
the first trap: you can spend a long time trusting docs that describe a
version you're not running.

## What I tried, and why it failed

**Attempt 1 — trust the docs.** `POST /api/verifyConnection` with credentials,
exactly as Apiary says. Result: 404. The route doesn't exist.

**Attempt 2 — hammer the obvious paths.** I tried `/api/`, `/verifyLogin` with
an `email` field, a bare `GET` on a few guesses. I got back a response I kept
misreading:

```
"This request need session."
```

That message is actually *good news* — it means the API **is** mounted and
reachable, it just refuses to talk without a valid session. The endpoint isn't
missing; the auth is different.

**Attempt 3 — the CSRF wall.** I finally sent the right fields to
`/verifyLogin` and hit a hard **403 Forbidden**. That's the part that stalls
most people: POSTs to a Django-backed panel are protected by a CSRF token, and
a bare JSON POST with no token gets dropped before your credentials are even
looked at.

The breakthrough was treating the panel not as "a thing with an API" but as
**a Django app with an Angular front-end** — and then just watching what the
front-end sends.

## The fix: the real auth flow

The whole thing is three steps, all with plain `curl` (and `-k` since the
panel uses a self-signed cert):

### 1. Grab the CSRF token from the login page

Django sets a `csrftoken` cookie on the very first GET. That cookie's value is
the token you echo back in a header on every write:

```bash
curl -sk -c /tmp/cp_cookies.txt "https://192.168.1.124:8090/" -o /dev/null
CSRF=$(grep csrftoken /tmp/cp_cookies.txt | awk '{print $7}')
```

### 2. Log in to get a session cookie

`POST /verifyLogin` with a JSON body and the CSRF token in an `X-CSRFToken`
header:

```bash
curl -sk -b /tmp/cp_cookies.txt -c /tmp/cp_cookies.txt \
  -X POST "https://192.168.1.124:8090/verifyLogin" \
  -H "Content-Type: application/json" \
  -H "X-CSRFToken: $CSRF" \
  -H "Referer: https://192.168.1.124:8090/" \
  -d '{"username":"admin","password":"...","languageSelection":"EN","twofa":""}'
# => {"userID": 1, "loginStatus": 1, "error_message": "None"}
```

`loginStatus: 1` means the session cookie is now valid. The `Referer` header
matters more than you'd expect — some of these views check it.

### 3. Call the data endpoints

The "API" is just the same POST endpoints the Angular UI calls.
`/<module>/<function>`, same cookie jar, same `X-CSRFToken` + `Referer`:

```bash
curl -sk -b /tmp/cp_cookies.txt \
  -X POST "https://192.168.1.124:8090/websites/fetchWebsitesList" \
  -H "Content-Type: application/json" \
  -H "X-CSRFToken: $CSRF" \
  -H "Referer: https://192.168.1.124:8090/" \
  -d '{"page":1,"recordsToShow":50}'
```

That returned every one of my sites, with SSL status, disk usage, PHP version,
and per-site days-until-cert-expiry. The same pattern deletes a site:

```bash
curl -sk -b /tmp/cp_cookies.txt \
  -X POST "https://192.168.1.124:8090/websites/submitWebsiteDeletion" \
  -H "Content-Type: application/json" \
  -H "X-CSRFToken: $CSRF" \
  -H "Referer: https://192.168.1.124:8090/" \
  -d '{"websiteName":"blog.hoelee.com"}'
```

## The two gotchas that ate most of the time

**1. The 404 on `/api/...` was never a network problem — it was the wrong era.**
The `/api/` prefix belongs to the old API. Modern CyberPanel uses
root-relative `/<module>/<function>` with no `/api/` segment. Once I stopped
looking for an "API" and started looking for the UI's own routes, everything
snapped into place.

**2. List responses are double-encoded JSON.** `fetchWebsitesList` returns
something shaped like:

```json
{ "data": "[{\"domain\":\"...\",\"ssl\":{\"days\":17}, ...}]" }
```

The `data` key is a **JSON-encoded string**, not an array. If you pipe it
straight into `jq` and try `.[]`, you get nothing sensible. You have to unwrap
one layer first:

```bash
curl ... | jq -r .data | jq      # unwrap the string, then parse again
```

## How to find the other endpoints

The function names aren't random — they map directly to Django view functions
in the CyberPanel source (`usmannasir/cyberpanel` on GitHub, `stable` branch).
The relevant files are `websiteFunctions/views.py`, `mailFunctions/views.py`,
`manageSSL/views.py`, and so on. So the workflow is:

1. Find the page in the UI (say, "Create Website").
2. Open the browser's network tab and watch what URL it POSTs to — or grep the
   matching `views.py` for the view name.
3. Call the same `/<module>/<function>` path with your session + CSRF headers.

A useful distinction: a `GET /<module>/<page>` usually returns the **HTML of
the UI page**, while the **data** comes from a POST to a sibling function. If
you GET a page and get markup back, you haven't found the real endpoint yet —
keep looking for the AJAX call.

## What I'd do differently

1. **Start from the front-end, not the docs.** Watching the Angular app's
   network requests would have saved me the whole "trust the obsolete Apiary
   docs" detour. The UI is always the ground truth for its own API.
2. **Treat "This request need session." as a beacon, not an error.** The first
   few times I read it as "wrong endpoint" when it was really "right endpoint,
   wrong session state."
3. **Script the login once into a reusable helper.** The session cookie dies
   on VM reboot and on expiry, so every one-off `curl` started from scratch.
   A tiny wrapper that logs in, captures the cookie, and re-logins on
   `"This request need session."` would have made the whole session repeatable
   instead of exploratory.

## The result

I can now list, create, and delete sites on my CyberPanel panel entirely from
the shell — no browser, no GUI — and the whole authenticated API surface is
open for scripting (SSL, mail, DNS, cron). I found this by scrapping the docs,
watching the real requests, and mapping them back to their Django views, and
the `cyberpanel` module + session flow now lives in my own automation toolkit.

The broader lesson: "it's not documented" rarely means "it's not possible."
When a tool exposes a web UI, that UI is a living, exact reference for the API
— you just have to watch what it actually sends.

---

## Want your server administration scripted?

If you're clicking through a hosting panel — or worse, doing the same manual
steps across several servers — I automate exactly this kind of thing: turn
repetitive admin into a tested script or a small internal tool, wired to your
existing stack, with a handover so you're never locked in. Whether it's
CyberPanel, cPanel, Docker, or a bespoke dashboard, if it has a web UI, it can
almost certainly be driven without one.

Reach me at [me@hoelee.com](mailto:me@hoelee.com?subject=Scripting%20my%20server%20admin) or WhatsApp
[+60 12-797 2969](https://wa.me/60127972969), or see what I do at
[hoelee.com](https://hoelee.com).