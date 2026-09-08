---
title: "Why Your Headless Browser Can't Scrape Everything"
description: "Two second-hand marketplaces, two very different walls: Goofish blocks a headless browser with 'illegal access' while Carousell keeps serving data. The lesson is to read how a page delivers data before you reach for Playwright."
pubDate: 2026-09-10
category: case-studies
tags: [scraping, playwright, browserless, docker, goofish, carousell, anti-bot]
ogImage: /og/why-your-headless-browser-cant-scrape-everything.png
banner: /banners/why-your-headless-browser-cant-scrape-everything.png
---

I hit the same wall a few weeks apart, on two different second-hand marketplaces,
and the contrast taught me more about scraping than a year of tutorials did.

On **Carousell**, a headless browser pulled freshly-listed products into a database
with prices, conditions, and photo URLs — no problem, running for months. On
**Goofish (闲鱼)**, the exact same setup returned the same three words every time:

```
为了保障您的体验，请使用正常浏览器访问闲鱼~
(translation: "to protect your experience, please use a normal browser")
```

Two marketplaces, one browser, opposite outcomes. This is the story of *why*, and
the one decision that would have saved me most of a day if I'd made it first.

## The goal, badly framed

I wanted to search Goofish for products and pull the results out — titles, prices,
links. The obvious first answer is "use a headless browser." It's the answer
everyone gives: render the page with Playwright or Puppeteer, wait for the
JavaScript, read the DOM.

So I built exactly that. I deployed a self-hosted `browserless` container — a
ready-made headless-Chrome-as-an-API — and pointed it at Goofish search. Then I
spent hours trying every lever the tool exposes:

- `--disable-blink-features=AutomationControlled` to hide the automation flag
- patching `navigator.webdriver` to `undefined` via `evaluateOnNewDocument`
- a realistic Chrome user-agent
- a `stealth` launch option

Each time, the product list stayed stuck at "loading…" — the page frame rendered,
the header rendered, the footer rendered, but the actual listings never populated.
The HTML came back with zero prices and zero product links.

Meanwhile I had a memory nagging me: my Carousell monitor grabs the same kind of
data with *no* stealth, *no* anti-detection tricks, and it works flawlessly. Why?

## The frame change: read how the data gets to the page

The answer wasn't in the browser flags. It was in **how each site delivers its data**.

**Carousell embeds its search results in the page's initial payload.** The server
sends the listings as JSON baked into the HTML (a `__PRELOADED_STATE__`-style blob).
The JavaScript enhances them afterward, but a plain HTTP request already contains
everything — product ID, title, price, photos. A scraper can parse that JSON out of
the raw HTML without ever rendering anything.

**Goofish delivers nothing server-side.** Its search results are fetched *after*
the page loads, from a signed API endpoint. That endpoint requires:

- a signature the app computes from request parameters and a secret
- anti-bot checks that flag a headless browser's fingerprint (WebDriver detection,
  CDP artifacts, canvas/audio fingerprints)

Strip the signature away, and the API returns nothing. Strip the browser off, and
the page returns "illegal access."

That single distinction — **server-rendered JSON vs. a signed async API** — is the
whole game. It tells you in one minute whether "render the page in a browser" will
take you an afternoon or a month.

## Why the headless browser hit a wall on Goofish

The honest reality: **an open-source, self-hosted browser is not a stealth tool.**

`browserless` (the container I deployed) is a *generic* renderer. Its free tier
renders pages, executes JavaScript, takes screenshots, converts PDFs. The
anti-detection features — real `stealth` mode, captcha solving, unblocked proxies —
are explicitly the **paid Cloud/Enterprise** tier. The message in their docs is
unambiguous.

So I was asking a general-purpose renderer to beat a platform whose entire
business depends on defeating automated clients. That's not a configuration bug;
it's a mismatch between the tool and the adversary.

To actually scrape Goofish I'd have to choose one of a few much heavier paths:

1. **Reverse the app's signing algorithm** and call the search API directly. This
   is how the serious scrapers do it — but the signature changes, so it's an
   ongoing maintenance cost, not a one-time build.
2. **Buy a third-party data API** (Alibaba Cloud's marketplace and similar sell
   `item_search` endpoints). Clean data, but you pay per call and you're at the
   mercy of the vendor.
3. **Drive a real, logged-in browser at low frequency** and hope the rate stays
   under the radar. Works for occasional manual checks, useless for reliable
   monitoring at scale.

None of these are "spin up a container and go." That's the point.

## The reusable checklist

Before I touch Playwright again on a new target, I now answer three questions in
order:

1. **Where does the data actually live?** Open the page with JavaScript disabled
   (or read the raw HTML). If the data is in the HTML, I don't need a browser at
   all — I need an HTTP client and a parser. The browser is waste.
2. **If it's not in the HTML, what does the async request look like?** Open
   DevTools → Network, find the XHR/fetch that returns the data, and read its
   headers and query params. Is there a signature? Is it stable, or does it change
   per request?
3. **Is there a signed API?** If yes, stop. Decide up front whether the target is
   worth either (a) reverse-engineering the sign, or (b) paying a data vendor. If
   neither, the honest answer is "this costs more than it's worth" — and *knowing*
   that in the first hour is itself a win.

Most scraping guides skip all three and jump straight to "install Puppeteer."
That's the expensive path, the one that burns a day discovering the hard way what
a 60-second investigation would have told you.

## What I'd do differently

- **Disable JavaScript before reaching for a browser.** It's the single fastest
  signal for "server-rendered vs. client-fetched." Ten seconds, no setup.
- **Don't buy stealth from a generic renderer.** Stealth is either a product you
  pay for (browserless Cloud, ScrapingBee, etc.) or something you build and
  maintain. It is not a checkbox in an open-source container.
- **Distinguish "rendering" from "extraction."** A headless browser returns HTML;
  it does not hand you structured product fields. Even when rendering works,
  someone still has to write the selectors or the `evaluate` script. That's a
  separate task — plan for it, don't assume it's free.

## The result

The contrast sharpened into a rule I now apply to every project: **decide whether
the target is server-rendered or API-gated before choosing a tool.** On Carousell
(server-rendered), a plain HTTP parser has archived thousands of listings with
prices and photos for months. On Goofish (signed API), I stopped after an honest
look at the effort and the maintenance burden — which is itself the right
outcome for a project where a manual search once in a while does everything I
needed.

A headless browser is the right tool *sometimes* — for screenshots, PDFs, taking
over a human session, or targets that render server-side. It is not a universal
scraping key, and treating it as one is the expensive mistake.

---

## Want me to look at a site before you commit to scraping it?

Most scraping projects fail in the first hour because nobody checked whether the
target even *lets* data be scraped cheaply. I do that check before writing any
code — and I build the monitors, notification pipelines, and self-hosted
infrastructure that actually run. If you're eyeing a data source and want to know
if it's an afternoon or a month, let's talk:

- 📱 **WhatsApp:** [+60 12-797 2969](https://wa.me/60127972969)
- 📧 **Email:** [me@hoelee.com](mailto:me@hoelee.com)
- 🌐 **Website:** [hoelee.com](https://hoelee.com)