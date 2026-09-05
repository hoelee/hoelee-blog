# Project State & Enhancement Backlog

Living list of what's done and what's next for blog.hoelee.com. Work through these **one by one** — don't batch unrelated changes. Check off items as they land.

**Status key:** ✅ done · 🔵 in progress · ⬜ not started

---

## Done (foundation)

- ✅ Astro 5 static + Markdown, Gitea Actions CI/CD → nginx → Cloudflare (deployed)
- ✅ Design system: hoelee.com brand palette, Inter + JetBrains Mono, light/dark, sticky nav, code copy button
- ✅ Brand "Mr Hoelee" (replaced "hoelee.dev")
- ✅ Author card + `Person`/`ProfilePage` JSON-LD (E-E-A-T), article meta, reading time, related posts
- ✅ Full SEO: canonical, Open Graph (+dims), twitter:card, favicon (all sizes), RSS + sitemap
- ✅ Category pages (`/categories/`, `/categories/[category]/`)
- ✅ Locale scheme: English flat in `posts/`, Chinese in `posts/zh/` (lang derived from folder, no `lang:` frontmatter)
- ✅ Language switcher in nav (EN ↔ 中文) + `/zh/` landing page
- ✅ Dark mode default (light is opt-in via toggle)
- ✅ Case study post "how-i-host-this-blog" updated with docker-compose sample + real installation gotchas (from commit history)
- ✅ Knowledge guides in `docs/` (content, design, seo, ops) + README index + `hoelee-blog` skill
- ⬜ **Make the Gitea repo public** — verified no secrets in source or history (PAT is a `${{ secrets.PAT }}` reference, not hardcoded). Recommended: yes, public — it's a portfolio artifact. Action: flip visibility in Gitea repo settings.

---

## Tier 1 — Content (80% of value; do this first)

- ⬜ **Write the 2 flagship case studies** — highest ROI, these are the portfolio:
  - ⬜ "How I built the DigiKedai Telegram AI bot" (DSM Docker + Cloudflare tunnel webhook + LiteLLM)
  - ⬜ "Self-hosting a mem0 memory stack" (API + LiteLLM + pgvector)
- ⬜ **2–3 gotcha posts** from real debugging history (short, Google-friendly):
  - ⬜ "The Traefik forward-auth gotcha that cost me a day"
  - ⬜ "Site-to-site OpenVPN behind CGNAT"
  - ⬜ "Fixing the WordPress /cv 301→404 chain" (from own audit)
- ⬜ **"Hard job → post" habit** — every solved problem becomes a `notes` entry the same week (template in `docs/content-guide.md` §4)

---

## Tier 2 — Structural gaps

- ⬜ **Tag pages** — tags currently render as labels only; add `/tags/[tag]/` archive pages for fine-grained discovery + internal linking
- ⬜ **Categories page shows all 7 categories** (not just those with posts) — signal intended coverage; show "0 posts / coming soon" for empty ones
- ⬜ **Search** — AstroPaper-style fuzzy search (low priority until >20 posts)

---

## Tier 3 — Polish / later

- ⬜ **Verify Chinese content split** — confirm `zh/` posts don't appear in EN feed (the `isEn` helper already filters; re-check when first zh post lands)
- ⬜ **Google Search Console submission** — submit `sitemap-index.xml` for faster indexing
- ⬜ **Newsletter / email capture** — only after real traffic exists

---

## Conventions (non-negotiable)

- Push git.hoelee.com first, then GitHub
- English-first; Chinese selective (2–3 flagship case studies); no Malay
- No overclaiming, especially Web3
- Name identity: "Lee Teong Hoe" / "Mr Hoelee" + same photo + same `sameAs` handles everywhere
