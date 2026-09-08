# Post-Writing Guideline

A single reference for writing a post on blog.hoelee.com. Read this **before** creating or editing any post. It consolidates the style, locale, and frontmatter rules — the "how to write it correctly the first time" checklist.

> Broader *what-to-write* strategy (categories, post types, cadence, anti-patterns) lives in `content-guide.md`. This file is the *how* — mechanics and style.

---

## 1. File location & language (enforced by code)

| Language | Path | URL |
|---|---|---|
| English | `src/content/posts/<slug>.md` | `/posts/<slug>/` |
| Chinese | `src/content/posts/zh/<slug>.md` | `/posts/zh/<slug>/` |

- **Do NOT set a `lang:` field** in frontmatter — language is derived from the folder.
- English is primary. Chinese is selective (2–3 flagship case studies). No Malay.
- To make a Chinese translation of a post, give it the **same filename** in the `zh/` folder — the language switcher auto-links them. If filenames differ, add a `translation: "zh/<other-slug>"` field to link them manually.

---

## 2. Title style — Title Case

All English post titles use **Title Case** (capitalize the first letter of every significant word):

- ✅ `How I Host This Blog: Astro, Gitea Actions, and Self-Hosted CI/CD`
- ✅ `Hello, World — About This Blog`
- ❌ `How I host this blog: ...`

Exceptions stay lowercase (articles, prepositions, conjunctions — but our house style capitalizes them after punctuation like `—` or `:` for a clean look): "About", "This", "And", "and" are all acceptable; be **consistent**.

Chinese titles need no capitalization change.

---

## 3. Frontmatter shape

```yaml
---
title: "How I Built the DigiKedai Telegram AI Bot"   # Title Case
description: "A ~155-char meta description with the target keyword."
pubDate: 2026-09-06
updatedDate: 2026-09-10                    # optional, when revised
category: case-studies                      # one of the 7 below
tags: ["telegram", "n8n", "docker", "cloudflare"]
translation: "zh/how-i-built-digikedai-bot" # optional, only if slug differs from zh counterpart
ogImage: "/og/digikedai-bot.png"            # optional, 1200×630 custom image
draft: false                                 # true = hidden from build
---
```

### Categories (the only 7 allowed)
`engineering` · `devops` · `ai` · `web3` · `tutorials` · `case-studies` · `notes`

---

## 4. The "hard job → post" template

When you finish a difficult piece of work, use this shape — it's simultaneously a tutorial, a case study, and a proof-of-expertise:

```
① The problem        → phrased as the searchable question a learner would type
② What I tried & why it failed → the debugging story (no one else can copy this)
③ The fix            → runnable code/config, explained
④ What I'd do differently → shows judgment
⑤ The result         → one quantified outcome
```

---

## 5. Language & identity rules

- **Business framing:** website design & development is the primary business; email hosting is a **side offering** — never describe it as "an email-hosting business".
- **Name:** "Lee Teong Hoe" / "Mr Hoelee" — identical across blog, LinkedIn, GitHub, git.hoelee.com.
- **No overclaiming**, especially Web3 (learning projects, not production DeFi).

---

## 6. Code blocks

- Wrap code in fenced blocks with the language tag (```yaml, ```bash, ```ts).
- Keep code/commands in their **original language** (don't translate code or commands inside a Chinese post).
- The copy button is added automatically by the layout — no action needed.

---

## 7. Publish flow

1. Write the `.md` file in the correct folder (see §1).
2. `npm run build` locally to confirm it compiles (optional but recommended).
3. Commit + push to both remotes:
   ```bash
   git push origin main && git push github main
   ```
4. Gitea Actions CI builds and deploys automatically; verify with `curl -I https://blog.hoelee.com/posts/<slug>/` → 200.

## 8. i18n sync — Chinese translation (do this automatically, every post)

Every post gets a Chinese translation, **every time**, without being asked:

1. **Translate every post.** Any new post gets a Chinese version at `src/content/posts/zh/<same-slug>.md` — **same filename**, so the language switcher auto-links the two (no `translation:` field needed).
2. **Keep EN and ZH in sync.** If you edit the English post (add a section, fix a fact, update a link), make the **same edit** to the Chinese version in the same commit. Never let the two versions drift.
3. **Translate the *frontmatter* too** — title and description go to Chinese, but `category`, `tags`, and `pubDate` stay identical to the English post (they're data, not prose).
4. **Code/commands stay in English** inside the Chinese post (see §6) — only the prose around them is translated.
5. **Every case study ends with a hire CTA** (in the post body, not frontmatter): a "Want this for your business?" section. The contact must be **one-tap, not plain text** — a clickable WhatsApp link (`https://wa.me/60127972969`) and a `mailto:` link (`mailto:me@hoelee.com?subject=...`), plus `hoelee.com` — and it should **name the concrete service offered** (e.g. "I build Telegram support bots like this one", "I set up self-hosted monitoring pipelines"), so a reader can tap straight through and ask for that specific thing. This is a business blog — every flagship post doubles as a lead magnet.
6. **Case studies open with a "why it matters" section** (the business benefit: saves money, 24/7, converts browsers, remembers customers) before the technical architecture.

**Verify after build:** the English page links to `/posts/zh/<slug>/` and the Chinese page links back to `/posts/<slug>/` (the auto language-switch).
