---
title: "How I Host This Blog: Astro, Gitea Actions, and Self-Hosted CI/CD"
description: "A walkthrough of the end-to-end pipeline that builds and serves this site — git-as-CMS, a self-hosted runner on my unRaid server, and Cloudflare in front."
pubDate: 2026-09-06
category: case-studies
tags: [astro, gitea, ci-cd, self-hosting, docker, cloudflare]
---

This blog is itself a project I built to demonstrate the kind of work I do.
Here's the full pipeline, so the architecture is transparent. The source is
public at [git.hoelee.com/hoelee/hoelee-blog](https://git.hoelee.com/hoelee/hoelee-blog)
— read it alongside this post.

## The stack

- **Astro 5** — static site generated from Markdown.
- **Git as the CMS** — every post is a `.md` file with YAML frontmatter, versioned in Gitea.
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

## The docker-compose setup

Here's the shape of the stack. This is the local/origin side (Gitea + the
runner + nginx); Cloudflare handles public exposure separately via a tunnel,
so nothing here needs a public IP or open ports.

```yaml
# docker-compose.yml — Gitea + act_runner + nginx (blog docroot)
services:
  gitea:
    image: gitea/gitea:1.27
    container_name: gitea
    environment:
      - USER_UID=1000
      - USER_GID=1000
    volumes:
      - ./gitea-data:/data
      - /etc/timezone:/etc/timezone:ro
      - /etc/localtime:/etc/localtime:ro
    ports:
      - "3000:3000"
      - "2222:22"          # SSH (optional — I use HTTPS)
    restart: unless-stopped

  act_runner:
    image: gitea/act_runner:0.2.13
    container_name: act_runner
    environment:
      - GITEA_INSTANCE_URL=http://gitea:3000
      - GITEA_RUNNER_REGISTRATION_TOKEN=${RUNNER_TOKEN}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock   # runner spawns build jobs
      - ./runner-data:/data
    depends_on:
      - gitea
    restart: unless-stopped

  nginx-blog:
    image: nginx:alpine
    container_name: nginx-blog
    volumes:
      - ./html:/usr/share/nginx/html:ro             # astro build output lands here
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
    restart: unless-stopped
```

The CI job (`deploy.yml`) builds `dist/` on the runner, then `cp -r dist/*`
into the `./html` volume shared with the nginx container. Cloudflare's tunnel
daemon (`cloudflared`) points at `nginx-blog` — that's the only thing exposed
to the internet.

Two things worth calling out that cost me time:

1. **`act_runner` needs the Docker socket** (`/var/run/docker.sock`) mounted to
   spawn build jobs — without it, jobs sit queued forever.
2. **The runner's `GITEA_RUNNER_REGISTRATION_TOKEN`** is a Gitea *Actions
   secret* (`${{ secrets.PAT }}` in the workflow), never a hardcoded value in
   the repo — so the repo stays safe to make public.

## The installation pain (real, from my commit history)

Getting this pipeline working was *not* smooth — the git history of this repo
is a log of the gotchas. The four that cost real time:

1. **No `actions/checkout` on Gitea.** Gitea's `act_runner` does not ship
   GitHub's marketplace actions. My first workflow failed immediately — there
   was nothing to check out the repo. Fix: drop the `actions/checkout` step
   and clone manually:
   ```yaml
   - name: Checkout
     run: |
       git config --global --add safe.directory '*'
       git clone --depth 1 "https://hoelee:${{ secrets.PAT }}@git.hoelee.com/hoelee/hoelee-blog.git" .
   ```

2. **`GITHUB_TOKEN` injection doesn't authenticate the clone.** The default
   runner token wasn't enough to `git clone` a private repo, so jobs failed on
   checkout. Fix: create a dedicated **Personal Access Token** and reference it
   as `${{ secrets.PAT }}` — never hardcode it in the workflow (that's also why
   this repo is safe to make public).

3. **Gitea ↔ `act_runner` version mismatch.** I burned three commits
   ("test gitea 1.24.7 + act_runner 0.2.13" → "gitea 1.25.5" → "gitea 1.27.3 +
   runner 3.3.2") before the runner would register and pick up jobs. The
   lesson: **match the runner to the Gitea major version** — a runner one major
   version behind a newer Gitea silently fails to register.

4. **`config_file` env for the runner.** The runner needed its config path
   passed explicitly before it would connect to the right instance.

Each of these was a "one-line fix after an hour of head-scratching" — which is
exactly the kind of thing a blog post should save the next person from.
