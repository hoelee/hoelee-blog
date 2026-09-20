---
title: "The Character That Silently Broke My authentik CSS"
description: "My authentik custom CSS looked correct, matched the right elements, and did nothing. The cause was a single > character that authentik escapes into invalid text."
pubDate: 2026-09-20
category: devops
tags: ["authentik", "css", "self-hosting", "debugging", "browser"]
ogImage: /og/authentik-css-greater-than-bug.png
banner: /banners/authentik-css-greater-than-bug.png
draft: true
---

I spent an afternoon on a CSS rule that should have taken thirty seconds.

I wanted to hide one line in the authentik login page footer — the
hardcoded "Powered by authentik" credit. The rule I wrote has worked in
every other project I've touched:

```css
ul.pf-c-list > li:last-child {
    display: none !important;
}
```

It did nothing. Not "it looked slightly off" — the element stayed
fully visible. What follows is the four wrong answers I chased, the one
correct answer, and the debugging move I should have made first.

## Why this matters beyond one footer line

If you self-host authentik and have ever pasted CSS into
**System → Brands → Custom CSS** and seen zero effect, you have probably
concluded you did something wrong. You almost certainly didn't. The
stylesheet is accepted, stored, served to the browser, and parsed — and
then silently fails, with no error in any log you can reach.

That is the worst kind of bug: no feedback loop. This post gives you the
loop back.

## Wrong answer #1: it's shadow DOM, so CSS can't reach it

My first assumption. Modern web components often hide their markup
behind a shadow root, and normal document CSS cannot cross that
boundary. The authentik login page is rendered by web components — I had
seen `<ak-flow-executor>` and `<ak-drawer>` in the page source — so this
felt obviously right.

I read the component definition out of the shipped bundle to confirm:

```js
var oe = class extends L {
    createRenderRoot() { return this }
    render() { ... }
}
```

`createRenderRoot(){ return this }` means **no shadow root** — the
component renders into the light DOM. Ordinary CSS reaches it just fine.

Wrong answer. Moving on.

## Wrong answer #2: the CSS isn't being injected at all

Next theory: my CSS never made it into the page. I grepped the served
HTML for a distinctive class from my rule:

```
<style data-id="brand-css">.ak-login-container{ padding-top: 16vh; ... }
```

It was there, first try. authentik injects brand CSS as a `<style
data-id="brand-css">` block in the document head. Injection was working.

Wrong answer.

## Wrong answer #3: specificity — PatternFly is winning

Plausible. authentik's UI is built on PatternFly, which ships opinionated
list styles. My rule used `!important`, but `!important` only wins within
the same cascade layer — and if PatternFly's rule were also `!important`
in a later layer, mine would lose.

This is where I stopped guessing and started measuring. I loaded the page
in a headless browser and asked the DOM directly:

```js
const host = document.querySelector('ak-brand-links');
const li = host.querySelector('li[data-kind="text"]');
return {
  display: getComputedStyle(li).display,
  matchesDataKind: li.matches('ul.pf-c-list > li[data-kind="text"]'),
  matchesLastChild: li.matches('ul.pf-c-list.pf-m-inline > li:last-child'),
};
```

The answer:

```
display:          "list-item"   ← not hidden
matchesDataKind:  true          ← my selector IS correct
matchesLastChild: true          ← and so is this one
```

The selectors matched the element. The CSS still didn't apply. That
combination is only possible if the stylesheet the browser parsed no
longer contains the rule I wrote.

## Wrong answer #4: (there wasn't one — I read the parsed CSS)

So I read back what the browser's **CSS parser** had actually
registered, not what the page source said:

```js
for (const sheet of document.styleSheets) {
  if (sheet.ownerNode.getAttribute('data-id') === 'brand-css') {
    for (const rule of sheet.cssRules) console.log(rule.cssText);
  }
}
```

```
"ul.pf-c-list u003e li[data-kind=\"text\"], ul.pf-c-list.pf-m-inline u003e li:last-child { display: none !important; }"
```

There it is. **`u003e`.**

The `>` character — written correctly in my CSS, stored correctly in the
database, returned correctly by the API — was rendered into the HTML as
the literal text `u003e`. Not the `>` character. The six characters
`u`, `0`, `0`, `3`, `e`.

So the browser tried to parse this selector:

```
ul.pf-c-list u003e li[data-kind="text"]
```

`u003e` is not a combinator. The selector is invalid. An invalid selector
in a comma-separated list is discarded, so the rule never existed as far
as the browser was concerned — while `matches()` on the *correct*
selector string still returned `true`, which is why the element looked
like it matched something.

## The fix

Remove every child combinator from authentik brand CSS. Use a descendant
selector instead — a single space instead of `>`:

```css
/* BROKEN — the > becomes literal text "u003e" and the
   selector is discarded */
ul.pf-c-list > li[data-kind="text"] {
    display: none !important;
}

/* WORKS — descendant combinator passes through intact */
ul.pf-c-list li[data-kind="text"] {
    display: none !important;
}
```

That is the whole fix. One character deleted.

### Where the escaping comes from

`\u003E` is how JSON/JavaScript encodes `>`. authentik's Django templates
render the brand config as a JavaScript object literal, and a HTML/JS
escaper is being applied to the `branding_custom_css` string. Backslash
and the `u` get separated somewhere in that path, so the browser receives
`u003e` — the escape without its backslash — instead of `>`.

The stored value is correct. The API response is correct. Only the
rendered page is wrong:

```bash
# What the API returns — correct
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://auth.hoelee.com/api/v3/core/brands/" \
  | python -c "import sys,json;print([b['branding_custom_css'] for b in json.load(sys.stdin)['results']][0])"
# → ul.pf-c-list > li[data-kind="text"] { ... }     ← > is intact here

# What the browser receives — corrupted
curl -sL https://auth.hoelee.com/ | grep -o 'ul.pf-c-list[^;]*'
# → ul.pf-c-list \u003E li[data-kind="text"]        ← escaped
```

This is why the bug is nearly unreachable by searching: anyone debugging
via the API, the database, or the admin UI sees a perfectly correct
stylesheet.

### What survived and what didn't

I probed which characters get mangled, to know what else to avoid:

| Character | Renders as | Safe? |
|---|---|---|
| `>` | `u003e` | ❌ breaks the selector |
| `;` | `;` | ✅ |
| `"` | `"` | ✅ |
| `{` `}` `:` | unchanged | ✅ |

Only the child combinator is affected in practice, because `>` is the
only one of these that appears in a CSS selector — the others only appear
in declarations, which are preserved.

## Verifying the fix in a real browser

Do not verify by re-reading the page source — that was the trap. Ask the
browser for the element's geometry:

```js
const li = document.querySelector('li[data-kind="text"]');
return {
  display: getComputedStyle(li).display,
  visible: li.getBoundingClientRect().height > 0,
};
```

```
display: "none"
visible: false
```

The element is gone. That is a real measurement, not an inference.

## What I'd do differently

**When a selector matches but the styles don't apply, read
`styleSheets[i].cssRules` immediately.** Everything before that step was
speculation I could have skipped. The parsed rule list is the
browser's ground truth — it tells you in one line whether the rule you
*wrote* is the rule that *exists*.

The specific ordering I'd use next time:

1. Does the element exist and match? → `element.matches(selector)`
2. Is the rule present in the parsed stylesheet? → `cssRules`
3. Only then consider specificity, layers, and `!important`

I did those in the opposite order, which is why it took an afternoon.

The second lesson is narrower but worth writing down: **escaping bugs
live between the layer that stores data and the layer that renders it.**
Check the value at both ends before you check anything else. I looked at
the database, then at the API, and concluded the CSS was fine. The bug
was in the third place I looked.

## The result

One character deleted, one footer line hidden, and a debugging rule
that has already paid for itself: in the same session it took me three
minutes to find a similar mismatch in a different rule, because I went
straight to `cssRules` instead of guessing.

If you self-host authentik and your brand CSS has ever silently done
nothing — check for a `>` first.

---

## Want this for your business?

If you need self-hosted SSO, a hardened login page, or someone to debug
the infrastructure you already run, that's the work I do.

- **WhatsApp:** [011-797 2969](https://wa.me/60127972969) — tap to chat
- **Email:** [me@hoelee.com](mailto:me@hoelee.com?subject=Self-hosted%20SSO%20enquiry)
- **Website:** [hoelee.com](https://www.hoelee.com)

I set up authentik single sign-on, self-hosted Docker stacks, reverse
proxies and tunnels for small businesses in Malaysia — and I write up
what I learn while doing it.
