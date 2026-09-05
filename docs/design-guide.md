# Design Guide — what the blog UI must have & must avoid

Read this **before** touching theme, layout, typography, color, or SEO markup. Priority order is fixed: **reading experience → SEO → brand → everything else.**

---

## 1. Non-negotiables (reading experience first)

| Rule | Spec |
|---|---|
| **Measure (line length)** | 65–75 characters per line. Single biggest readability win. |
| **Body typography** | 16–17px, `line-height: 1.6–1.7`, a clean sans (Inter / system-ui / Source Sans). |
| **Headings** | A character font (Plus Jakarta Sans / Space Grotesk) or keep Inter for minimalism. |
| **Code** | Proper monospace (JetBrains Mono / Fira Code) + distinct background block + **syntax highlighting + copy button + language label**. Non-negotiable for technical posts. |
| **Light + dark mode** | Both. Dev audience splits ~50/50. |
| **Color** | 2-accent palette (primary + semantic green/red for correct/wrong in tutorials). Avoid pure black / pure white. |

---

## 2. Required components

- **Sticky header** — name/logo + nav (Blog / Categories / About / RSS).
- **Article header** — title, pub date, reading time, category + tags, author card (photo, 1–2 line bio, LinkedIn + GitHub + git.hoelee.com links).
- **Author box / ProfilePage schema** on every post (see SEO below).
- **Related posts** (3 cards) — internal linking + keeps readers on-site.
- **RSS link** in footer — how the technical audience follows me.
- **Custom og:image per post** — 1200×630, never the reused logo.

---

## 3. Responsive & media

- **Mobile-first**: design 390px, then desktop 1280px.
- **Astro Image** for automatic optimization/WebP (Core Web Vitals win).
- **Declare `og:image:width/height` explicitly** — mis-declared dimensions get preview cards rejected by WhatsApp/Telegram/LinkedIn.
- **Favicon**: reference all sizes (`.ico` + 32×32 + 192×192 PNG + apple-touch 180×180). "Favicon not showing" is usually browser cache, not a missing asset — `curl` the live files before "fixing".

---

## 4. Theme / stack decisions (settled)

- **Astro 5 static** (already scaffolded). Rationale: TypeScript/React skill surface, true static output, low attack surface, first-class i18n routing, and the repo itself is a portfolio artifact.
- **Theme base:** AstroPaper-style minimalism (light/dark, fuzzy search, RSS + sitemap defaults). Don't rebuild from scratch.
- **Skip for v1:** WordPress-headless (two systems), Next.js SSR/ISR (heavier than needed), self-built blog engine (the classic time sink).

---

## 5. SEO checklist (2026 — two lanes)

Optimize for **both** classic SEO *and* GEO (getting cited by Google AI Overviews / ChatGPT Search / Perplexity).

- **E-E-A-T first:** real `Person`/`ProfilePage` schema around the author bio, with `sameAs` → LinkedIn, GitHub, git.hoelee.com.
- **Per-post meta:** unique title (≤60 chars), description (≤155), canonical, og:image (1200×630) + `twitter:card`.
- **Sitemap.xml + RSS + robots.txt** — generated automatically.
- **Core Web Vitals:** static site → 90+ LCP/CLS/INP easy. Verify with headless-Chrome screenshot + Lighthouse on 390px **and** 1280px.
- **Internal linking:** related-posts module + link pillar posts (case studies) from every tutorial.
- **Question-shaped headings:** write H2/H3 as the actual question a learner types. Rewarded by Google *and* AI engines.
- **Name consistency:** same name ("Lee Teong Hoe" / "Mr Hoelee") + photo + handles across blog, LinkedIn, GitHub, git.hoelee.com. Fragmented identity is the #1 personal-brand SEO killer.

---

## 6. What to AVOID in design

| Anti-pattern | Why |
|---|---|
| Heavy JS / client-side rendering | Static output is the point — don't reintroduce runtime cost. |
| Reused logo as og:image | Already an issue on hoelee.com. Custom per post. |
| Anonymous/absent author card | Kills E-E-A-T. |
| Wall-of-text without code blocks | Technical posts need formatted, copyable code. |
| No RSS / sitemap | Both are free in Astro; omitting them is pure loss. |
| Orphaned pages / thin content | hoelee.com already has ~400; keep this sitemap clean. |
| Over-styled "agency look" | This is a personal engineering blog — credibility over flash. |
