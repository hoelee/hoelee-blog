# Ops & Deploy Runbook — blog.hoelee.com

How this blog is built, deployed, and kept alive. Read when debugging CI/CD, deployment, or hosting.

---

## Pipeline

```
Markdown (src/content/posts) → Astro build (dist/) → Gitea Actions → act_runner on unRaid
  → nginx container → Cloudflare tunnel → Cloudflare CDN → blog.hoelee.com
```

- **Repo:** `git.hoelee.com/hoelee/hoelee-blog` (push here first, then GitHub — standing convention).
- **Runner:** `act_runner` on unRaid (verified working: Gitea 1.27.3 + runner 3.3.2, PAT-secret pipeline).

---

## Write & publish a post

1. Create `src/content/posts/<slug>.md` with frontmatter (see `content-guide.md` §6).
2. Push to `main`.
3. CI builds `dist/` and deploys to the nginx container automatically.
4. Verify live: `curl -I https://blog.hoelee.com/<slug>` → expect 200.

---

## Build pitfalls (from prior Astro work — check these first)

- **No JSX helper components in frontmatter** — inline JSX directly in `.map()` calls, or the build fails with `Expected ">" but found "class"`.
- **Import depth** — `src/pages/*.astro` use `../layouts/…`; subdirs use `../../`. Wrong level = `Could not resolve`.
- **Footer must render AFTER `<main>`** — a shared header+footer component renders footer above content otherwise.
- **`npm install` scripts blocked** can leave esbuild's binary missing → check `npm warn install-scripts` at install time.

---

## Verify before shipping a layout change

Headless-Chrome screenshot + vision check on **both** 390px and 1280px:

```bash
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
"$CHROME" --headless --disable-gpu --window-size=1280,2400 \
  --screenshot="$(cygpath -w $LOCALAPPDATA/Temp/blog.png)" \
  --virtual-time-budget=4000 "http://localhost:4321/"
```

Overflow diagnosis (real numbers, not screenshot guessing): check `scrollWidth > innerWidth` via CDP `Runtime.evaluate`.

---

## Hosting notes

- Static output = trivial to serve from any nginx/OpenLiteSpeed dir. Cloudflare in front gives CDN + HTTPS + DDoS.
- Cloudflare Pages **git integration supports GitHub/GitLab only — not Gitea**. Current setup (Gitea → self-hosted runner → nginx) sidesteps this entirely and is the reason the pipeline is the way it is.
- Full self-hosting also avoids Cloudflare Pages' 25MB/file, 20k-files limits — a decision already baked into this architecture.

---

## Health checks

- `curl -I https://blog.hoelee.com/` → 200, correct `content-type`.
- `curl https://blog.hoelee.com/sitemap.xml` → lists all published posts.
- `curl https://blog.hoelee.com/rss.xml` → non-empty.
- DNS: `blog.hoelee.com` resolves through Cloudflare (proxy enabled).

## Pitfall: premature poll caches a 16-day 404

The origin serves `Cache-Control: max-age=1382400` (16 days), and Cloudflare caches
negative (404) responses too. If you curl a freshly-deployed URL **before the CI deploy
finishes**, Cloudflare caches that 404 for 16 days — the page itself returns 200 but its
`og`/`banner` PNGs 404 with `cf-cache-status: HIT`.

- **Detect:** the bare URL 404s but `?v=<timestamp>` (cache-buster) returns 200 → origin is
  fine, edge cache is stale.
- **Fix:** purge the Cloudflare zone cache. Zone-level token (`Zone.Cache Purge` perm, lives
  in the cloudflare-pages-deploy skill) → `POST /zones/8c8b2359766ac853602b91dd851c630e/purge_cache`
  with `{"purge_everything":true}`. See that skill for the exact curl.
- **Prevent:** after `git push`, `sleep` ~60–90s before the first bare-URL check, or validate
  with `?cb=$(date +%s)` first so you never register a 404 into edge cache.
