---
title: "Putting a Front Door on an App You Can't Modify"
description: "A self-hosted app whose front page was a Chinese login box — and a client-rendered SPA I couldn't edit. So I added a second container: nginx, a bilingual page, and three injected lines."
pubDate: 2025-06-24
updatedDate: 2026-10-06
category: devops
tags: ["nginx", "docker", "self-hosting", "seo", "branding"]
ogImage: "/og/putting-a-front-door-on-an-app-you-cant-modify.png"
banner: "/banners/putting-a-front-door-on-an-app-you-cant-modify.png"
draft: false
---

The first thing a visitor to my reading service saw was a Chinese login box.
No explanation of what the site was, no invitation information, no branding,
no social card when the link was shared, and nothing a search engine could
sensibly index. Just a login dialog with a poem above it.

I run that service for my family and a handful of paying readers, so "what
does a new reader see first" is not a cosmetic question — it is the product.
And I could not change it, because the app behind it is somebody else's
code: a hash-routed Vue single-page application whose interface I do not
control and whose releases arrive on their schedule, not mine.

**How do you put your own front page, branding and language handling on a self-hosted app you can't edit — without forking it and without a wrapper that breaks on the next image update?**

## Why the obvious fixes don't work

**Edit the app's HTML.** There is nothing there to edit. This is the part people skip, and it decides the whole approach:

```bash
curl -s https://book.example.com/index.html | wc -c
# 5879 — and the body is <div id="app"></div>
```

The page ships as a shell. Every button, label and dialog is drawn later by
JavaScript. So there is no markup to improve and nothing to reorder.

**Rewrite the response in the proxy.** This is the tempting one — Traefik or nginx middlewares that rewrite response bodies. It fails for the same reason: a body rewrite can only rewrite what is *in the body*, and what's in the body is an empty div and a script tag. This is worth internalising as a general rule before you reach for any reverse-proxy rewrite feature:

> `curl` the raw response and grep for the string you want gone. If it isn't in the bytes you receive, the content is client-rendered and a body rewrite is the wrong tool — you need CSS or JS, injected somewhere the app will load it.

**Patch the minified bundle.** Technically possible, since I can see the compiled files. But every image update ships rewritten — and sometimes re-minified — bundles, so the patch is a permanent maintenance duty against a codebase I don't own. It also breaks in the worst way: silently, in production, after an unrelated upgrade.

**Put my page inside the app's image.** Now my landing page, SEO tags and social card are coupled to somebody else's release cadence, and a bad upstream build takes my front door down with it. The thing I wanted least was to make my brand depend on their Dockerfile.

So: not inside the app, not a rewrite of the app, and not a fork. In front
of it.

## The design: one extra container that owns the public port

The stack has two services. The app publishes no public port; a tiny
`nginx:alpine` gateway owns it and decides what each request is:

```yaml
services:
  reader:
    # the app: loopback-only port kept for debugging, never public
    # (127.0.0.1:7778:8080)
    networks: [bridge_hoelee]

  reader-gateway:
    image: nginx:alpine
    ports:
      - "7777:80"          # the only public door
    networks: [bridge_hoelee]
    volumes:
      - /volume1/docker/reader/gateway/conf/default.conf:/etc/nginx/conf.d/default.conf:ro
      - /volume1/docker/reader/gateway/html:/usr/share/nginx/html:ro
```

The nginx side is short enough to read in full. The interesting decisions
are the four lines around the routing, not the routing itself:

```nginx
# resolve the app at request time, not at startup
resolver 127.0.0.11 valid=10s ipv6=off;
set $reader_upstream http://reader:8080;

location = / {                 # the front page: exact match, bare root only
    root /usr/share/nginx/html;
    try_files /index.html =404;
    add_header Cache-Control "no-store" always;
}

location / {                   # everything else: the app, untouched
    proxy_pass $reader_upstream;
    client_max_body_size 1024m;   # uploads still work through the middle box
}
```

**Resolve the upstream at request time.** With a literal `proxy_pass http://reader:8080`, nginx resolves that name once, at startup, and refuses to start if it can't — so the front page would go down whenever the app is restarting or being replaced. Using a variable plus Docker's embedded DNS resolver (`127.0.0.11`) defers resolution to each request. The gateway boots fine with the app stopped, which matters the first time you recreate the app and the last time you debug at midnight.

**Keep the app's own port for debugging, and move it in one pass.** The app still publishes `127.0.0.1:7778:8080` on loopback — reachable from the host over SSH, invisible to the internet. When I made that switch, the old container had to release the public port in the *same* stack update that gave it to the gateway; splitting it into two deploys fails to bind.

**Don't let the middle box become the new limit.** The gateway sets `client_max_body_size 1024m` because the app accepts large book uploads. A proxy in front of an app with file uploads is a classic way to introduce a bug that only appears on the one day somebody uploads something big.

**Different cache lifetimes per route.** The root page is `no-store` (I edit it directly on disk and want the change live on refresh), the social image is cached for a day, the injected script for five minutes. One line each.

## The page itself

It is a single self-contained HTML file: no web fonts, no CDN, no build
step. That's not minimalism for its own sake — it means the front door has
no third-party dependency that can be slow, blocked or discontinued, and it
renders from cache when the network is down.

Two decisions inside it are worth copying:

**Both languages live in the DOM at once.** Every string exists twice — a `.zh` span and an `.en` span — and one attribute on `<html>` decides which set is visible through CSS. The default follows the browser's language, a `?lang=en` / `?lang=zh` query parameter overrides it, and the choice is remembered in `localStorage`. Because both languages are in the HTML, a search engine indexes both, which a JavaScript-based switcher would not achieve.

**The invitation code is not on the page — deliberately.** The page explains that the code is printed on the physical invitation card and says so in plain language, rather than showing it. A public landing page that leaks the registration code turns an invite-only service into an open one.

## Three lines injected into the app, and why they're the difference

A landing page in front of an app still feels like two products unless the
seam is hidden. Three `sub_filter` rules in the app's location block do that
work — they patch the app's own shell (5,879 bytes of it) as it passes
through, which is the one part of a client-rendered app that *is* in the
bytes:

```nginx
location = /index.html {
    proxy_pass $reader_upstream;
    proxy_set_header Accept-Encoding "";   # sub_filter cannot rewrite a compressed body

    # 1. the app declares the wrong language, which disables browser translation
    sub_filter '<html lang="en">' '<html lang="zh-CN">';

    # 2. reload/bookmark/new tab -> back to the front door; the enter button sets the pass
    sub_filter '</head>' '<script>(function(){try{if(!navigator.onLine)return;
      if(sessionStorage.getItem("gatePass")==="1"){sessionStorage.removeItem("gatePass");return;}
      location.replace("/"+(location.hash||""));}catch(e){}})();</script></head>';
}
```

The second one is the interesting one. Reloading, using a bookmark, or
opening a new tab should land on the front page again — I wanted the app's
address to behave like a product, not to dump a stranger into an app
interior with no exit. The mechanism is a `sessionStorage` flag: no flag
means "bounce to the front door", the enter button sets the flag first, and
the script **consumes** it (deletes it) so the next reload bounces again.
Without that consumption step you get an infinite ping-pong between the page
and the app, and the browser tab becomes unclosable-by-logic. The
`navigator.onLine` guard lets offline use through, so the app still works as
an installed app with no network.

Two mechanical notes that cost me time:

- `proxy_set_header Accept-Encoding ""` is required in that location, because `sub_filter` cannot rewrite a body that arrived gzipped. It's scoped to an exact match on the shell so only ~5 KB loses compression; the app's JavaScript and CSS keep theirs.
- Do **not** add `sub_filter_types text/html` — that is the default, and adding it makes nginx log a duplicate MIME type warning on every start.

The language fix deserves its own post, and it got one: [No API for Browser Translation: Adding an English Mode to a Chinese-Only Web App](/posts/adding-english-mode-to-a-chinese-only-web-app/) covers the attribute lie and the in-app English layer in detail. What matters here is the shape of the trick — a small patch applied to the one part of a client-rendered app that arrives as real markup.

## The branding problem you can't solve with a proxy

The same class of app usually carries the vendor's own links — a GitHub
icon, a Telegram group, a "follow us" block. Once you know the rule from
earlier, the conclusion is immediate: those buttons are drawn by JavaScript,
so no proxy rewrite can touch them and no HTML edit exists to make. What
does work is the app's own extension point. Many self-hosted apps ship one,
and this one loads a custom stylesheet from a directory inside its
persistent volume:

```css
.bottom-icons a { display: none !important; }        /* the vendor's repo link */
.index-wrapper > :nth-child(6 of .setting-wrapper) { display: none !important; }
```

Because that file lives in the data volume rather than the image, it
survives every image rebuild — which is the whole point of putting
customisation where the release process can't reach it.

## What's fragile, and what I now check

**The injections depend on two literal strings.** `'<html lang="en">'` and `'</head>'`. If a future app version changes either one, the patch silently does nothing: no error, no broken page, just a missing front-door behaviour that nobody notices for weeks. That failure mode is why the operational notes for this stack carry the assertions instead of a description:

```bash
curl -s https://book.example.com/index.html | grep -o '<html lang="[^"]*"'   # want zh-CN
curl -s https://book.example.com/index.html | grep -c 'gatePass'             # want 1
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' https://book.example.com/og.png
```

Run them after every app upgrade. "It still loads" is not the same as "my
integration still works".

**Never hand-edit the NAS's generated reverse-proxy config.** The layer above the gateway is written by the platform, which regenerates it with a new UUID filename every few minutes — a hand edit lives until the next regeneration and then vanishes, usually while you're debugging something else. So that layer is treated as immutable and stays pointed at the gateway's port permanently; everything I control lives below it.

**Keep the front door out of the app's image.** This is the decision the whole design rests on. The gateway is a separate container with its own files on the host, so an app image swap — or, as it turned out later, an upstream rewrite in a different programming language — cannot take the front page, the SEO metadata or the translation layer with it.

**And assert, don't eyeball.** Every claim in the paragraph above came from `curl` and a byte count, not from looking at the page and deciding it seemed fine.

## The result

The app got a front page, an invitation explanation, an og card, JSON-LD, a
bilingual switch, an English-UI layer and its vendor branding removed — and
I did not modify one line of it:

| Check | Result |
|---|---|
| `/` (the front page) | 200, 23 KB, `Cache-Control: no-store` |
| The app shell | 200, `<html lang="zh-CN">` — the language lie corrected in flight |
| Injected script present | 1 occurrence |
| `/og.png` | 200, `image/png`, 185 KB |
| App container port | loopback only; the public port belongs to the gateway |

Two containers instead of one, about forty lines of nginx, and a front door
the app's own release cycle can't reach. When the app underneath is somebody
else's problem — which it always is — that's the cheapest place to put your
brand.

---

**Running a self-hosted app as a service — for clients, staff or customers — and want it to stop looking like a raw install?** Putting your own front door, branding and language handling in front of an app you don't maintain is the kind of packaging work I do.

[WhatsApp +60 12-797 2969](https://wa.me/60127972969) ·
[me@hoelee.com](mailto:me@hoelee.com?subject=Front%20door%20for%20a%20self-hosted%20app)
· [hoelee.com](https://hoelee.com)
