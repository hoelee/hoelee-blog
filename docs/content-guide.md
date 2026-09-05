# Content Guide — what to write & what to avoid

Read this **before** planning or writing any post on blog.hoelee.com. It encodes the positioning, taxonomy, post types, cadence, and anti-patterns so every piece of content serves the two goals: get hired, and win freelance clients.

---

## 1. The job of every post

A post is not "content marketing". It is a **proof-of-expertise artifact**. After reading it, a recruiter or client should think: *"this person can actually do this, and I trust how they explain it."*

Two hard rules flow from that:
1. **Attach your identity to every post** — photo, bio, links. Anonymous content kills E-E-A-T and defeats the whole purpose.
2. **Pitch to learners, not experts.** Most search traffic comes from people learning. Write down, not up.

---

## 2. Categories (stable — don't invent new ones casually)

Use these 7 categories. Everything else is a free-form **tag** (`traefik`, `solidity`, `gitea`, `n8n`…).

| Category | What goes in it |
|---|---|
| `engineering` | Java/Spring, PHP/CodeIgniter, React/TS, WordPress deep dives |
| `devops` | Docker/Portainer, Traefik, Cloudflare tunnels, NAS, backups, monitoring — **my most differentiated material** |
| `ai` | n8n workflows, Telegram bots, local LLM (LM Studio), mem0 memory stack, TTS |
| `web3` | Solidity, Foundry/Hardhat, ERC-20/721, Chainlink — honestly framed |
| `tutorials` | Beginner-facing how-tos |
| `case-studies` | "How I built X" — the portfolio |
| `notes` | Short low-friction entries: fixes, gotchas, link roundups |

---

## 3. Post types that work (ranked by hiring ROI)

1. **"How I built X" case studies** — highest value. Recruiters read these. (DigiKedai bot, self-hosted mem0, mailcow email platform, NAS product delivery, SifuMail.)
2. **"Hard problem → solution" tutorials** — e.g. "The Traefik forward-auth gotcha that cost me a day", "Site-to-site OpenVPN behind CGNAT".
3. **Gotcha / debugging posts** — short, extremely Google-friendly, compound over time.
4. **Tool roundups & comparisons** — I have genuine first-hand material (Astro vs WP, Gitea vs GitHub, Foundry vs Hardhat).
5. **Config / recipe posts** — reusable Traefik/Docker/Pi-hole configs with explanation.

---

## 4. The "hard job done → public post" template

When I finish a difficult piece of work, publish with this shape. It is simultaneously a tutorial, a case study, and a proof-of-expertise — the highest-ROI post type I can write.

```
① The problem       → phrased as the searchable question a learner would type
② What I tried & why it failed → the debugging story (this is what no one else can copy)
③ The fix           → runnable code/config, explained
④ What I'd do differently → shows judgment, not just luck
⑤ The result        → one quantified outcome
```

---

## 5. Cadence

- **Realistic target:** 2 posts/month to start, then 1/week.
- Sonmez playbook: Month 1–2 = 1/week → Month 3 = 2/week → Month 4+ = 1–2/week mixing 500-word tactical posts with 2,000+ word guides.
- **Ship a `notes` entry anytime** I solve something — keeps the feed alive between deep posts.
- Long guides bring search traffic; short posts keep me consistent.

---

## 6. Frontmatter shape (reference)

```yaml
---
title: "How I built the DigiKedai Telegram bot"
description: "A ~155-char meta description with the target keyword."
pubDate: 2026-09-06
category: case-studies
tags: ["telegram", "n8n", "docker", "cloudflare"]
ogImage: "/og/digikedai-bot.png"   # 1200×630, custom per post
draft: false
---
```

**No `lang:` field** — language is derived from the file location:
- `posts/hello-world.md` → English (`en`)
- `posts/zh/hello-world.md` → Chinese (`zh`), served at `/posts/zh/hello-world/`

---

## 7. What to AVOID (anti-patterns)

| Anti-pattern | Why it hurts |
|---|---|
| **Anonymous / no author identity** | Kills E-E-A-T; defeats the name-search strategy. Always show photo + bio + sameAs links. |
| **Writing for experts, not learners** | Most search traffic is beginners. |
| **AI-spam / content-farm filler** | Google aggressively demotes unedited AI churn. My first-hand case studies are the moat — never dilute them with filler. |
| **Perfectionism before publishing** | Procrastination. Ship it, edit later. A dormant blog is worse than an imperfect one (mine was dormant Dec 2023 → now). |
| **Reused logo as og:image** | Every post needs its own 1200×630 image, or shares look broken. |
| **Orphaned / thin pages** | hoelee.com has ~400 orphaned image-attachment pages. Don't recreate — keep the sitemap clean. |
| **Hosting on Medium/Dev.to as primary** | Platform risk + no SEO ownership. Use them for **syndication only** (cross-post + canonical back to my domain). |
| **Overclaiming Web3 experience** | Be honest: "learning Foundry, deployed test ERC-20/721" is credible; "production DeFi engineer" is not yet. |
| **Broken resume/CV link** | About page + author bio must link a *working* resume. Fix the source of truth. |
| **Monetizing before audience** | No ads, sponsored posts, or ebooks yet. Build trust + traffic for a year first. |

---

## 8. i18n policy

- **English is primary and non-negotiable** — the whole SEO strategy targets English queries.
- **Chinese (zh):** translate only the 2–3 best case studies. Cheap differentiation, opens zh-SG/zh-MY search.
- **Malay: skip for v1** — no dev-audience demand (the main site already has a dangling Malay config; don't repeat it).

### File layout (enforced by code)

- English posts: `src/content/posts/*.md` (flat, no subfolder).
- Chinese posts: `src/content/posts/zh/*.md` (subfolder → `/posts/zh/<slug>/`).
- Language is derived from the folder (see `src/lib/lang.ts`), so **do not** set a `lang:` field in frontmatter.
- Never let "I should translate this" block publishing an English post.
