---
title: "Why Your CDP Clicks Silently Fail: Smooth Scroll, Minimised Windows, and JS-Dispatched Events"
description: "Three reasons a Chrome DevTools Protocol click reports success and does nothing: a stale rect from smooth scrolling, a minimised window that drops coordinate input, and a page that received the click but rejected it."
pubDate: 2025-03-19
updatedDate: 2026-09-29
category: devops
tags: [cdp, chrome, react, browser-automation, debugging, python]
ogImage: /og/why-your-cdp-clicks-silently-fail.png
banner: /banners/why-your-cdp-clicks-silently-fail.png
draft: false
---

If you drive a web app with the Chrome DevTools Protocol, you have met this failure: your script reports `clicked @591,361`, the element is there, the click landed — and nothing happens. No exception, no console error, no change on the page.

I spent an evening on exactly this while automating a marketplace's seller admin panel, and the three causes I found are worth writing down, because they are all invisible to the code that reports the click.

## Cause 1: a stale rect, because the page scrolls smoothly

The obvious click helper looks like this:

```python
r = self.ev("""(()=>{const e=%s; e.scrollIntoView({block:'center'});
  const b=e.getBoundingClientRect();
  return JSON.stringify({x:b.left+b.width/2, y:b.top+b.height/2});})()""")
self.click_xy(json.loads(r)["x"], json.loads(r)["y"])
```

Scroll into view, read the element's rectangle, click its centre. Correct — unless the page has `scroll-behavior: smooth` (very common in modern UI kits). Then `scrollIntoView()` starts an **animation**, and `getBoundingClientRect()` in the same tick returns the position the element is *about to leave*. Your click goes to where the element was, lands on whatever is there, and the log tells you it clicked the coordinates you asked for.

The fix is two lines — turn smooth scrolling off, then re-read the rect:

```python
self.ev("""(()=>{document.documentElement.style.scrollBehavior='auto';
  if(document.body) document.body.style.scrollBehavior='auto'; return 'ok';})()""")
moved = self.ev("""(()=>{const e=%s; if(!e) return 'no';
  e.scrollIntoView({block:'center', behavior:'instant'}); return 'ok';})()""" % sel)
time.sleep(0.35)                      # let layout settle
# then read the rect (and retry a couple of times if the element is not there yet)
```

Two details matter. `behavior:'instant'` on `scrollIntoView` overrides the CSS; and the small wait before reading is what makes the rect trustworthy. Without the retry loop the helper still fails intermittently on elements that render a frame late — intermittent failures are the worst kind, because they make you doubt your own diagnosis.

## Cause 2: the window is minimised, and coordinate clicks are dropped

After the fix, my click helper worked in a one-off probe and then never again inside the real script. Same selector, same coordinates, same page. The difference turned out to be visibility:

```
document.visibilityState → "hidden"
document.hasFocus()      → true
```

CDP-synthesised mouse events at coordinates are unreliable when the target tab is not the active tab of a visible window — the browser may accept them, throttle them, or route them nowhere. Note that `hasFocus()` returns `true` even when the document is hidden, so it is not a useful check; `document.hidden`/`visibilityState` is.

Two fixes, and I use both:

```python
def activate(self):                 # bring the tab to the front of its window
    self.cdp("Page.bringToFront")
    time.sleep(0.2)

def click_js(self, sel):            # click by dispatching events from inside the page
    return self.ev("""(()=>{const e=%s; if(!e) return 'no';
      ['mousedown','mouseup','click'].forEach(k=>
        e.dispatchEvent(new MouseEvent(k,{bubbles:true,cancelable:true,view:window})));
      return 'js-clicked';})()""" % sel)
```

`Page.bringToFront` fixes the common case. But the JS-dispatched click is the one that never fails: it does not depend on the window being visible, and React's root-level event listener receives it exactly as it receives a real click, because the events bubble to the same root. A date-picker input that opened maybe one time in five with coordinate clicks opens **every** time this way.

The trade-off to know: dispatching events skips hit-testing, so it will also “click” an element a user could not reach (covered, scrolled off, zero-opacity). That is a feature here — and a trap if you use it to paper over a layout bug — so I keep coordinate clicking for anything visual and reach for `click_js` when the widget is a custom control.

## Cause 3: the page received the click and rejected it

This is the one that wasted the most time, because the symptom is identical to causes 1 and 2: click fires, nothing changes.

Distinguishing them takes one injected listener:

```js
window.__ev = [];
['mousedown','mouseup','click'].forEach(k =>
  document.addEventListener(k, e => window.__ev.push(k + ':' + e.target.tagName), true));
```

- Events recorded → the input path works. The problem is in the app (cause 3), or in how you read the result (see below).
- Nothing recorded → causes 1 or 2.

With the listener armed I clicked `Confirm` and the buffer filled up — so the click was fine, and the app was saying no. The reason was in text I had not thought to look at:

> “Please create a new shop welcome voucher after the existing one is expired.”

The form refuses a second voucher of that type. No field-level red text, no toast in the first 500 ms, the URL unchanged. **The rejection was real and the click was innocent.**

Two more tools for this class of bug:

```js
document.elementFromPoint(x, y)        // what is actually on top at that coordinate?
document.querySelectorAll('button').length   // how many match your selector?
```

The second one caught a subtle one: the portal leaves a **hidden** `Confirm` button in the DOM from the collapsed date-panel, so `.pop()` returned the invisible duplicate and the click went nowhere visible. Filter by visibility *and* size:

```python
"[...document.querySelectorAll('button')].filter(b=>/^Confirm$/.test(b.innerText.trim())"
" && b.offsetParent!==null && b.getBoundingClientRect().width>0).pop()"
```

## And the fourth failure I only found by re-reading

There is a class of “failure” that is not one: **the write succeeded and your read is stale.** I concluded a create had been silently refused because the list page did not show it immediately, clicked again, and later discovered the voucher had existed the whole time — the list just lagged about ten minutes. The lesson generalises: after a write, the only trustworthy verdict is a read-back *after* a real waiting period, and “no visible change” means *unknown*, not *failed*.

## The checklist

1. Turn off smooth scrolling; scroll with `behavior:'instant'`; wait, then read the rect.
2. Call `Page.bringToFront` before clicking; treat `document.hidden` as the signal, not `hasFocus()`.
3. For custom widgets, dispatch `mousedown`/`mouseup`/`click` from JS rather than clicking coordinates.
4. Arm an event listener to prove whether input arrived before you blame the app.
5. Count your selectors — hidden duplicates are common in component libraries.
6. After a write, wait and re-read; never re-click a submit you have not verified.

None of this is exotic, but every item is invisible in a log line that says `clicked @591,361`. If you are building automation against an admin panel you do not control, the click is the least reliable part of the pipeline — and the one most likely to be blamed last.

I build and debug this kind of browser automation for a living — self-hosted services, Docker and Traefik stacks, and the odd scraped-but-bot-walled marketplace. If you have a workflow that keeps breaking because a UI has other ideas, tell me about it: [WhatsApp](https://wa.me/60127972969) · [me@hoelee.com](mailto:me@hoelee.com?subject=Browser%20automation%20debugging) · [hoelee.com](https://hoelee.com).
