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
- ✅ Language switcher in nav — links to the **same post** in the other language (auto-matches by `zh/` prefix; falls back to section landing when no translation)
- ✅ Locale-aware nav labels (EN: Posts/Categories/About/RSS; ZH: 文章/分类/关于/RSS)
- ✅ Dark mode default (light is opt-in via toggle)
- ✅ Case study post "How I Host This Blog" — docker-compose sample + real install gotchas (from commit history)
- ✅ Chinese translation of the case study (`posts/zh/how-i-host-this-blog.md`)
- ✅ hello-world intro post — "What I write about" skills map + corrected business framing
- ✅ Business framing corrected everywhere: website design & development = primary; email hosting = secondary (not the focus)
- ✅ Knowledge guides in `docs/` (content, design, seo, ops, post-guideline) + README index + `hoelee-blog` skill
- ✅ Both repos public (Gitea + GitHub) with title/description/homepage/topics + `v1.0.0` release

---

## Tier 1 — Content (80% of value; do this first)

- ⬜ **Write the 2 flagship case studies** — highest ROI, these are the portfolio:
  - ⬜ "How I Built the DigiKedai Telegram AI Bot" (DSM Docker + Cloudflare tunnel webhook + LiteLLM)
  - ⬜ "Self-Hosting a Mem0 Memory Stack" (API + LiteLLM + pgvector)
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
- ⬜ **Dedicated `/zh/posts/` and `/zh/categories/` archive pages** — currently zh nav links point to `/zh/` landing; split into real archives when Chinese content grows

---

## Tier 3 — Polish / later

- ⬜ **Google Search Console submission** — submit `sitemap-index.xml` for faster indexing
- ⬜ **Newsletter / email capture** — only after real traffic exists

---

## Conventions (non-negotiable)

- Push git.hoelee.com first, then GitHub
- English-first; Chinese selective (2–3 flagship case studies); no Malay
- No overclaiming, especially Web3
- Name identity: "Lee Teong Hoe" / "Mr Hoelee" + same photo + same `sameAs` handles everywhere
- Business framing: website design & development is primary; email hosting is secondary
- See `docs/post-guideline.md` for post-writing rules (title case, locale structure, frontmatter, etc.)
