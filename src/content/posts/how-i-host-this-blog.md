---
title: "How I host this blog: Astro, Gitea Actions, and self-hosted CI/CD"
description: "A walkthrough of the end-to-end pipeline that builds and serves this site — git-as-CMS, a self-hosted runner on my unRaid server, and Cloudflare in front."
pubDate: 2026-09-06
category: case-studies
tags: [astro, gitea, ci-cd, self-hosting, docker, cloudflare]
lang: en
---

This blog is itself a project I built to demonstrate the kind of work I do.
Here's the full pipeline, so the architecture is transparent.

## The stack

- **Astro 5** — static site generated from Markdown.
- **Git as the CMS** — every post is a `.md` file with YAML frontmatter, versioned in [git.hoelee.com](https://git.hoelee.com/hoelee/hoelee-blog).
- **Gitea Actions** — a self-hosted CI runner (`act_runner`) on my unRaid server builds the site on every push to `main`.
- **nginx** — a dedicated container serves the static `dist/` output.
- **Cloudflare** — the tunnel exposes it publicly, and the CDN caches everything.

## Why static + git?

A technical blog has no dynamic content. Writing in Markdown, reviewing via
pull request, and rebuilding on merge gives me:

1. Full version history of every word I publish.
2. No database or admin panel to secure or patch.
3. Near-perfect performance — pre-built HTML, no server-side rendering.

## The deploy flow

```
git push → Gitea webhook → act_runner picks up the job
  → npm ci → astro build → copy dist/* to docroot → nginx serves it
```

The whole thing runs on hardware in my homelab, which is exactly the point —
this is a live demo of the DevOps work I describe elsewhere.

## Coming up

Future posts will cover the individual pieces in depth: the `act_runner`
container setup, the Cloudflare cache rules, and the i18n routing for the
Chinese side of this site.
