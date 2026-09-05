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
