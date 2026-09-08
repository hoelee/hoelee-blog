# Project State & Enhancement Backlog

Living list of what's done and what's next for blog.hoelee.com. Work through these **one by one** — don't batch unrelated changes. Check off items as they land.

**Status key:** ✅ done · 🔵 in progress · ⬜ not started

> **How to resume the project:** start at the top-most ⬜ item in the **Execution Plan** (§2) below and work downward. Each step is self-contained, has a "done when" criterion, and references the governing doc. Don't jump ahead — earlier steps unlock later ones.

---

## 1. Done (foundation)

- ✅ Astro 5 static + Markdown, Gitea Actions CI/CD → nginx → Cloudflare (deployed)
- ✅ Design system: hoelee.com brand palette, Inter + JetBrains Mono, light/dark, sticky nav, code copy button
- ✅ Brand "Mr Hoelee" (replaced "hoelee.dev")
- ✅ Author card + `Person`/`ProfilePage` JSON-LD (E-E-A-T), article meta, reading time, related posts
- ✅ Full SEO: canonical, Open Graph (+dims), twitter:card, favicon (all sizes), RSS + sitemap
- ✅ Category pages (`/categories/`, `/categories/[category]/`)
- ✅ Locale scheme: English flat in `posts/`, Chinese in `posts/zh/` (lang derived from folder)
- ✅ Language switcher in nav — links to the **same post** in the other language (auto-matches by `zh/` prefix)
- ✅ Locale-aware nav labels (EN/ZH)
- ✅ Dark mode default (light opt-in via toggle)
- ✅ Case study "How I Host This Blog"
- ✅ Chinese translation of the case study (`posts/zh/how-i-host-this-blog.md`)
- ✅ hello-world intro post
- ✅ Case study "How I Built the DigiKedai Telegram AI Bot" + Chinese twin (`posts/zh/how-i-built-the-digikedai-telegram-bot/`)
- ✅ Business framing corrected (website design & development = primary; email hosting = secondary)
- ✅ Knowledge guides in `docs/` + README index + `hoelee-blog` skill
- ✅ Both repos public (Gitea + GitHub) with title/description/homepage/topics + `v1.0.0` release

---

## 2. Execution Plan (work top → bottom, one step at a time)

> This plan comes from a full research pass (Sept 2026) comparing blog.hoelee.com against reference developer blogs (Simon Willison, Josh Comeau, Dan Abramov/overreacted, Julia Evans) + industry surveys. Priority is fixed: **identity & content → discovery → polish.** Don't reorder unless the user says so.

### Phase A — Identity (highest ROI, ~2–3 hrs total)

**Step A1 — Add a real author photo (headshot).**
The #1 gap vs. every reference blog: the avatar is a letter "M" placeholder and there's no photo anywhere on the site. Every credible personal dev blog has a human face.
- [ ] User provides one headshot (square, ≥800×800 for avatar; also source for og).
- [ ] Replace `avatar` letter with the photo in: nav/brand (optional), author card (About + every post), `ProfilePage` JSON-LD `image`.
- [ ] Add the photo to `og-default.png` template so the default share card has a face.
- **Governing doc:** `design-guide.md` §2 (author box), §5 (E-E-A-T name+photo consistency).
- **Done when:** a real face renders in the author card on About + every post; `curl` shows no 404 for the asset.

**Step A2 — Align the homepage title & hero framing.**
The `<title>` says "engineering, DevOps & self-hosting" but the hero says "full-stack developer and DevOps engineer" — two slightly different framings.
- [ ] Pick one line (recommend: "full-stack developer & DevOps engineer") and use it in both `<title>`/meta description and hero paragraph.
- **Done when:** homepage title, meta description, and hero all say the same thing about who Hoelee is.

**Step A3 — Add a "Start here" / featured posts route.**
New visitors land on reverse-chronological "Latest posts" with no guidance to the best content (Julia Evans' Favorites, Josh Comeau's featured posts both solve this).
- [ ] Add a "Start here" (or "Featured") section on the homepage surfacing 2–3 flagship case studies.
- [ ] Optionally add a `/favorites` or `/start-here` page (defer the dedicated page until ≥6 strong posts; the homepage strip is the immediate win).
- **Done when:** homepage shows a featured/start-here strip above or beside "Latest posts".

### Phase B — Content (80% of value; the long game)

**Step B1 — Write the 2nd flagship case study: "Self-Hosting a Mem0 Memory Stack".**
The Mem0 flagship is already the single highest-value unwritten post in the backlog.
- [ ] Write `src/content/posts/self-hosting-mem0.md` (category `case-studies`).
- [ ] Write Chinese twin `src/content/posts/zh/self-hosting-mem0.md` (same filename → auto language-switch).
- [ ] Follow the "hard job → post" template (§4 content-guide) + open with "why it matters" + end with hire CTA (§8 post-guideline).
- **Governing doc:** `content-guide.md` §4/§8, `post-guideline.md` §8.
- **Done when:** both EN + ZH pages live, language-switch works, hire CTA present.

**Step B2 — Write 2–3 short "gotcha" posts (Google-friendly, compound over time).**
- [ ] "The Traefik forward-auth gotcha that cost me a day"
- [ ] "Site-to-site OpenVPN behind CGNAT"
- [ ] "Fixing the WordPress /cv 301→404 chain" (from own audit)
- **Governing doc:** `content-guide.md` §3 (post type #3), `post-guideline.md`.
- **Done when:** ≥2 gotcha posts live (these are `notes`/`devops`, no Chinese translation required per §8).

**Step B3 — Adopt the "hard job → post" habit.**
Every solved problem becomes a `notes` entry the same week.
- [ ] Revisit cadence target: 2 posts/month → 1/week (`content-guide.md` §5).
- **Done when:** 3 consecutive months hit the 2-posts/month floor.

### Phase C — Discovery & structure (Tier 2)

**Step C1 — Per-post custom OG images (at least for case studies).**
Currently every post shares the generic 14KB `og-default.png` — flagship posts share the same bland card as category pages.
- [ ] Build a branded 1200×630 OG template (name + face + title).
- [ ] Generate a custom `ogImage` for each case study (frontmatter `ogImage:` field already supported).
- **Governing doc:** `design-guide.md` §2/§3, `content-guide.md` §6 (ogImage field).
- **Done when:** each case study's `og:image` is unique and 1200×630.

**Step C2 — Tag pages** (`/tags/[tag]/` archive pages for fine-grained discovery + internal linking).
- [ ] Add tag archive routes (tags currently render as labels only).
- **Done when:** clicking a tag on any post opens a working `/tags/<tag>/` page.

**Step C3 — Categories page shows all 7 categories** (not just those with posts), with "0 posts / coming soon" for empty ones — signals intended coverage.
- **Done when:** `/categories/` lists all 7 categories including empty ones with a placeholder.

**Step C4 — Dedicated `/zh/posts/` and `/zh/categories/` archive pages.**
- [ ] Split zh nav from `/zh/` landing into real archives once Chinese content grows (≥4 zh posts).
- **Done when:** zh nav links to real `/zh/posts/` + `/zh/categories/` archives.

### Phase D — Polish / later (Tier 3)

**Step D1 — Search** (AstroPaper-style fuzzy search). Low priority until >20 posts.
**Step D2 — Google Search Console submission** — submit `sitemap-index.xml` for faster indexing.
**Step D3 — Newsletter / email capture** — only after real traffic exists (agree: do NOT add yet).

---

## 3. Research Findings Snapshot (Sept 2026)

What the reference blogs do that blog.hoelee.com should mirror, ranked:

| Finding | Reference example | Status on blog.hoelee.com |
|---|---|---|
| Real name + photo + one-line identity | All four | ⚠️ name ✅, photo ❌ (letter "M") — **Step A1** |
| Focused thesis (one sentence on what it's about) | Julia Evans, Simon Willison | ⚠️ has it, but title/hero drift — **Step A2** |
| Honesty about what you *don't* know | Simon, Dan Abramov | ✅ strong (DigiKedai "bugs that ate an afternoon") |
| Specific detail: code, diagrams, numbers, bug stories | All four | ✅ strong |
| Consistent cadence (slow is fine, dead is not) | Julia (~monthly), Simon (daily) | ⚠️ only 3 posts, all Sept 4–6 — **Phase B** |
| "Start here" / Favorites route | Julia Evans, Josh Comeau | ❌ — **Step A3** |
| RSS + sitemap + clean SEO | All four | ✅ |
| Per-post OG images | Josh Comeau | ❌ — **Step C1** |
| Search (once >15–20 posts) | Josh Comeau | ❌ deferred — **Step D1** |

---

## 4. Conventions (non-negotiable)

- Push git.hoelee.com first, then GitHub
- English-first; Chinese selective (2–3 flagship case studies); no Malay
- No overclaiming, especially Web3
- Name identity: "Lee Teong Hoe" / "Mr Hoelee" + same photo + same `sameAs` handles everywhere
- Business framing: website design & development is primary; email hosting is secondary
- English post titles use Title Case
- See `docs/post-guideline.md` for post-writing rules; `docs/content-guide.md` for strategy; `docs/design-guide.md` for UI
