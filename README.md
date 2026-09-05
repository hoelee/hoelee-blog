# hoelee-blog

My personal technical blog — where I write about what I build and learn.

Built with [Astro](https://astro.build) 5 + Markdown, deployed via self-hosted Gitea CI/CD to an nginx container on my unRaid server, served through Cloudflare tunnel + CDN. Live at `blog.hoelee.com`.

## Purpose (read this first)

This blog exists so that when a recruiter, hiring manager, or freelance client Googles **"Lee Teong Hoe"**, they land on a stream of concrete technical work that proves I can build things — plus a clear, trustworthy picture of who I am. It backs the job hunt **and** the freelance funnel (Upwork / Fiverr / Codeable).

- 67% of hiring managers check a candidate's online presence before deciding (Stack Overflow 2025).
- SEO is a long game — while posts rank, the blog doubles as a portfolio and inbound-lead magnet.

Every decision below optimizes for **credibility + discoverability + speed of shipping**, not monetization or vanity traffic.

## Stack

- **Framework:** Astro 5 (static output, zero runtime JS by default)
- **Content:** Markdown + MDX, versioned in git
- **i18n:** English (default) + Chinese (`zh`) — English-first
- **CI/CD:** Gitea Actions → `act_runner` on unRaid → nginx container
- **Host:** nginx on unRaid → Cloudflare tunnel → Cloudflare CDN

## Structure

```
src/
  content/
    posts/          # English posts (flat)
      zh/           # Chinese posts (subfolder -> /posts/zh/<slug>/)
  pages/
    index.astro     # homepage
    posts/[...slug].astro   # post template
    about.astro
  layouts/
    BaseLayout.astro
  lib/
    lang.ts         # derives en/zh from folder path
docs/
  content-guide.md  # what to write, what to avoid (READ before writing a post)
  design-guide.md   # what the design must have, what to avoid (READ before touching UI)
  seo-reference.md  # E-E-A-T / name identity, SEO + GEO checklist, syndication
  ops-runbook.md    # pipeline, publish steps, build pitfalls, health checks
  project-state.md  # enhancement backlog (Tier 1/2/3) — work through one by one
```

## Knowledge guides (my rules of thumb)

| Doc | When to read |
|---|---|
| [`docs/content-guide.md`](docs/content-guide.md) | Before writing/planning any blog post — categories, post types, the "hard job → post" template, and the anti-patterns. |
| [`docs/design-guide.md`](docs/design-guide.md) | Before changing theme, layout, typography, color, or SEO markup. |
| [`docs/seo-reference.md`](docs/seo-reference.md) | Before adding posts/`<head>` markup or debugging search visibility. |
| [`docs/ops-runbook.md`](docs/ops-runbook.md) | Before debugging CI/CD, deployment, or hosting. |
| [`docs/project-state.md`](docs/project-state.md) | To see what's next — the prioritized enhancement backlog. |

## Write a post

1. Create `src/content/posts/<slug>.md` (English) or `src/content/posts/zh/<slug>.md` (Chinese) with frontmatter (see content guide — **no `lang:` field**, it's derived from the folder).
2. Push to `main`.
3. CI builds and deploys automatically.

## Categories

`engineering` · `devops` · `ai` · `web3` · `tutorials` · `case-studies` · `notes`

## Conventions

- **Repo publishing order:** push to git.hoelee.com (Gitea) first, then GitHub. (My standing convention.)
- **Language:** English posts flat in `posts/`; Chinese posts in `posts/zh/`; no Malay.
- **Theme:** defaults to dark mode (light is opt-in via the toggle).
- **No overclaiming** — especially Web3 (learning projects, not production DeFi).
- **Name identity is consistent everywhere:** "Lee Teong Hoe" / "Mr Hoelee" + same photo + same `sameAs` handles across blog, LinkedIn, GitHub, git.hoelee.com.
