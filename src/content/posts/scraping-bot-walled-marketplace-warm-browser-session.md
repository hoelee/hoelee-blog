---
title: "Scraping a Bot-Walled Marketplace With a Warm Browser Session"
description: "How I scraped Shopee's bot-walled listings with a warm headless-Chrome session over CDP — fail-fast health checks, split-wait rendering, and why I refused to parallelize it."
pubDate: 2026-09-13
category: engineering
tags: ["scraping", "cdp", "headless-chrome", "anti-bot", "shopee", "python"]
ogImage: "/og/scraping-bot-walled-marketplace-warm-browser-session.png"
draft: false
---

I set out to do something that sounds simple: list all the second-hand M.2 NVMe SSDs on a marketplace, sorted by price, so I could buy the cheapest one.

The result was nothing like a clean `requests` + BeautifulSoup script. It was a week-long fight against an anti-bot wall, a warm browser session held together with duct tape, and — the part I didn't expect — a hard lesson about why you cannot just "parallelize" a scraper by throwing more agents at it.

This is that story, told in the order I lived it: the problem, everything I tried that failed, the thing that finally worked, and what I'd do differently.

## The problem, phrased the way someone would actually search it

> "How do I scrape product listings from a site that blocks headless browsers?"

Or, more honestly: **how do you scrape a marketplace that has already made scraping its sole job description?** Shopee doesn't politely serve HTML to `curl`. It detects automation, throws a `/verify` captcha, and silently serves you a page that looks fine but contains nothing.

My requirement list was small:

- Search for "used SSD", filter to "used condition only", filter to M.2 NVMe (not SATA/mSATA), filter to ≥128 GB.
- Extract every listing's capacity variants and prices.
- Sort by price ascending.
- Do it without a `chromedriver` Farm of a hundred headless instances, because I don't own a hundred residential IPs.

Everything after this point is the debugging story.

## What I tried, and why it failed

### Attempt 1: cold headless Chrome via CDP — "just point Chrome's remote debugger at it"

I launched Chrome with `--headless --remote-debugging-port=9222`, connected with the Chrome DevTools Protocol, and navigated to a search URL. It felt clever for about ten seconds.

**Failure:** the page loaded, but every product card was empty. The DOM was a shell. Shopee had fingerprinted the headless browser (no real GPU, no real user-agent fingerprint consistency, `navigator.webdriver` flag) and redirected me into a `/verify` captcha loop I never got past. Cold headless profiles hit the wall immediately.

The lesson is boring but important: **anti-bot systems don't care how good your selectors are if the browser itself is lying about what it is.**

### Attempt 2: parallel subagents — "just spawn N workers"

This was the one I really wanted to work. I have a multi-agent setup. The natural instinct is: spawn five agents, each scraping a different search query, gather the results, merge.

**Failure:** all of them attach to the *same* browser session. They don't get their own browser — they get their own *tab* in one shared Chrome instance, or worse, they all fight over the same single tab. Every `Page.navigate` un-does the previous agent's context. And critically:

1. **The warm session is a shared resource.** There is one Canary profile that isn't flagged. Five agents navigated the same tab in an interleaved order, which is indistinguishable — to Shopee — from one browser doing rapid-fire navigation. That's exactly the behavior that *triggers* the wall.
2. **Anti-bot pacing is cumulative.** My working setup depends on ~7-second gaps between navigations to look human. Five agents navigating concurrently means five navigations hitting the same session with effectively zero gap.

So the "horizontal scaling" instinct — more workers — is actively hostile to the one thing keeping me alive: looking human. The concurrency ceiling here isn't CPU or memory. It's **one warm browser, one tab at a time.**

### Attempt 3: trusting the "Buy With Voucher" button for the price

Once I had listings rendering, I assumed the buy button's label contained the price. On most marketplaces it does. On this render, the button said `Add To Cart` / `Buy Now`. My regex for "Buy With Voucher … RM…" matched nothing, and I went around in circles for a while before actually reading the DOM.

**Failure:** the price on Shopee product pages isn't in the button. It's rendered as **split spans** — `RM` in one element, `84` in another, `00` in a third — so a naive leaf-text match returns fragments, or a **range** (`RM125.00 - RM155.00`) when the listing has multiple variants.

### Attempt 4: clicking variant options to get an exact price

For a single-axis variant selector (e.g. one dropdown of capacities — 128GB / 256GB / 512GB), clicking one option collapses the price to a single value, and my extraction worked.

**Failure:** for a **two-axis** selector (brand × capacity), clicking the first axis (a brand) locks a price, but adding the second axis (a capacity) *un-collapses* it back to the product-wide range. The panel renders the range of all purchasable combinations, not the exact combination I selected, and the "selected" state is marked by a class that also matches every other option box. There is no reliable way to know which combination I actually locked.

I spent real time on this before accepting the honest answer: **for genuinely two-axis listings, the correct data is the price range, not a guessed per-combination number.** Shipping a fragile override that "sometimes works" would be worse than reporting an honest range.

## The fix — what actually worked

Three pieces, all small, all learned the hard way.

### 1. A warm, human-paced browser session (the foundation)

Don't fight the wall. Use a browser profile that has already logged in and browsed normally — a "warm" profile. Navigate with real 7-second gaps. It is slower and it is the only thing that reliably survives.

```python
# not real code — the *shape* of it. Navigate, then wait like a human.
goto_url(target)
time.sleep(7)   # human pacing, non-negotiable
wait_for_selector(".shopee-search-item-result__item")
```

### 2. Fail fast, don't time out

Before any scrape, hit the CDP HTTP endpoint and check the session state. If Canary is down or the tab is sitting on `/verify`, abort in ~1 second instead of wasting 40 seconds on a "did not render" timeout.

```python
import json, urllib.request

def session_healthy():
    try:
        tabs = json.load(urllib.request.urlopen("http://127.0.0.1:9222/json"))
    except Exception:
        return False
    for t in tabs:
        if t.get("type") == "page" and "/verify" in t.get("url", ""):
            return False   # captcha wall — re-warm the session, don't scrape
    return True
```

This one change turned "silent 40-second dead-ends" into "instant, actionable failure."

### 3. The right price selector: deepest pure-RM node

The buy button is a lie. The price is the **deepest element whose text is a pure RM value** — a range (`RM125.00 - RM155.00`) before a variant is selected, a single value (`RM84.00`) after. Walk the DOM and take the deepest element whose text matches:

```python
import re

RM = re.compile(r"^RM\s?[\d,.]+(\s?[-–]\s?RM\s?[\d,.]+)?$")

def find_price(root):
    best, depth = None, -1
    for el in root.querySelectorAll("*"):
        txt = (el.textContent or "").strip()
        if txt and RM.match(txt) and " " not in txt.split("RM")[0]:
            d = depth_of(el)
            if d > depth:
                best, depth = el, d
    return best.textContent.strip() if best else None
```

That's the whole trick. No brittle class names. No guessing. A node whose entire text *is* a price is the price.

## The result — one quantified outcome

From a single warm session, in one serial pass, I extracted **20+ used-NVMe listings with per-variant prices**, filtered to M.2 NVMe ≥128GB, sorted by price. The cheapest real target — a 256GB M.2 NVMe — surfaced at **RM84**, alongside several 256GB options in the RM125–175 range. One command (`sweep.py <url1> <url2> ...`) now re-checks the whole shortlist and dumps JSONLines.

But the number I'm most glad about is this: **zero captchas.** The warm-session + human-pacing + fail-fast combo survived the entire sweep without tripping `/verify` once.

## What I'd do differently

1. **I'd write the fail-fast health check first**, before a single scraping line. It's thirty seconds of work that saves forty seconds per future failure.
2. **I'd resist the parallelization instinct day one.** The answer to "the scraper is slow" is "bundle more work into one serial pass" (batch search, `sweep.py` over many URLs), not "more workers." Shared browser state makes concurrency worse, not better.
3. **I'd accept the two-axis limitation immediately** and report ranges, instead of burning an afternoon on a selector that can't be made reliable.
4. **I'd stop guessing DOM structure and probe it.** Almost every mistaken assumption (`/i.` vs `-i.` in the URL path, `Buy With Voucher` as the price anchor, "the filter is a real `<input>` checkbox") came from *not reading the actual DOM first*.

## The reusable pieces

All of this became a small, standalone toolkit — each script is one self-contained `python x.py ...` call:

| Script | What it does |
|---|---|
| `search.py` | Coarse search → listing cards |
| `used_search.py` | Clicks the "Used" condition checkbox, verifies `USED_ITEM` in the URL, extracts |
| `detail.py` | Pulls per-variant prices from a product page (deepest-RM-node method + split-wait) |
| `sweep.py` | Batch detail over N URLs in one session, dedupes by item-id, writes JSONLines, prints a table |
| `cdp_common.py` | Shared health check + navigation helpers |

The genuinely reusable lesson isn't the Shopee-specific selectors — it's the *posture*: **assume the page is lying about its DOM, fail fast, and scale by batching, not by parallel workers.**

---

*This is a real debugging session, not a tutorial written after the fact. The scraping toolkit and every one of these failures happened while actually hunting for a cheap SSD — I kept the parts that generalize and cut the parts that only matter to one Malaysian marketplace at one point in time.*

---

## Want this for your business?

I build custom scraping and data-extraction pipelines — warm-session CDP scrapers, bot-wall-aware crawlers, and batch price-monitoring sweeps — as well as full-stack web apps (PHP/CodeIgniter, Java/Spring, React/TypeScript) and self-hosted automation (n8n, Telegram bots, Docker on NAS).

If you need product or price data off a site that fights back, tap through and tell me what you're trying to extract:

- 💬 [WhatsApp](https://wa.me/60127972969) — message me directly
- ✉️ [Email](mailto:me@hoelee.com?subject=Custom%20scraping%20pipeline) — tell me the site + the data
- 🌐 [hoelee.com](https://hoelee.com) — see what else I build