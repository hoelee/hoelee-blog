# banner-gen — per-post banner/hero image generator

Generates a branded 1600×900 (16:9) banner image for a blog post — shown at
the top of the article, above the title. Matches the site's cobalt-blue
branding and the "terminal / debugging" visual language (siblings with
`scripts/og-gen/`, which produces the 1200×630 social-share image).

## Usage

```bash
node scripts/banner-gen/generate.mjs <post-slug>
```

Reads the post's category from frontmatter, fills `template.html`, renders
with headless Chrome, and writes `public/banners/<slug>.png`.

Then add `banner: /banners/<slug>.png` to the post frontmatter (en + zh) —
`[...slug].astro` renders it above the H1 title.

## Customizing content

Each post's banner content lives in `BANNERS` in `generate.mjs`, keyed by
slug, with three parts:

- `titlebar` — the terminal window's title-bar text
- `lines` — terminal body rows: `{ t, text }` where `t` ∈
  `cmd` · `dim` · `err` (red) · `ok` (green) · `hl` (amber) · `prompt` (`$`)
- `flow` — bottom pipeline steps: `{ n: '1', label: '...', err?: true }`

No entry → a generic default banner.

## Requirements

- Google Chrome at `C:\Program Files\Google\Chrome\Application\chrome.exe`
  (`CHROME_PATH` to override).
- Node 20+.

## Relationship to og-gen

- og-gen → `public/og/<slug>.png` (1200×630, 2:1) for social sharing.
- banner-gen → `public/banners/<slug>.png` (1600×900, 16:9) for the article
  hero. The banner is a "filled" visual (terminal + flow pipeline), not a
  poster — avoid large empty margins.