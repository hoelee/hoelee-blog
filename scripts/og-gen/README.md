# og-gen — per-post OG image generator

Generates a branded 1200×630 social-share image for a blog post, matching the
site's cobalt-blue `#295cff` branding, the `logo-square.png` mark, and the
"terminal / debugging" visual style.

## Usage

```bash
node scripts/og-gen/generate.mjs <post-slug>
```

Reads frontmatter (`title`, `category`, `tags`) from
`src/content/posts/<slug>.md`, fills `template.html`, renders with headless
Chrome, and writes `public/og/<slug>.png`.

The post's frontmatter needs `ogImage: /og/<slug>.png` so the blog serves it
(layout already renders `og:image` + width/height; PostList shows it as a
card thumbnail).

## Customizing the terminal box

Each post shows a "terminal" panel (the red error / green fix lines). Add an
entry keyed by slug in `TERMINALS` inside `generate.mjs`, using these tokens:

```html
<div class="line"><span class="prompt">$</span><span class="cmd">command</span></div>
<div class="line"><span class="prompt">&nbsp;</span><span class="err">error line</span></div>
<div class="line"><span class="prompt">$</span><span class="cmd">fix</span><span class="fix">→ done ✓</span></div>
```

No entry → a generic default terminal.

## Requirements

- Google Chrome at `C:\Program Files\Google\Chrome\Application\chrome.exe`
  (override with `CHROME_PATH` env var).
- Node 20+.

## Notes

- PNG (not JPG) is intentional: for flat UI/terminal art, PNG is smaller and
  sharper than JPG (see commit history).
- The `logo-square.png` referenced lives at `public/logo-square.png`.