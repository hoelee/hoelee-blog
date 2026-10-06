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
- ✅ **Live re-audit of the Sept research recorded (§2 Phase E + §4), 2026-09-29** — 53 posts × 2 languages, 127 sitemap URLs, 133/133 internal links 200

---

## 2. Execution Plan (work top → bottom, one step at a time)

> This plan comes from a full research pass (Sept 2026) comparing blog.hoelee.com against reference developer blogs (Simon Willison, Josh Comeau, Dan Abramov/overreacted, Julia Evans) + industry surveys. Priority is fixed: **identity & content → discovery → polish.** Don't reorder unless the user says so.
>
> **⚠ Re-checked against the live site 2026-09-29 (§4).** Parts of Phase A/C/D are stale — **C1, D1 and B2b are DONE.** The measured bottleneck is no longer content; it is **distribution / visibility**. Per user decision on 2026-09-29, **Phase E is inserted at the TOP of the queue — start there**, then work the still-open A/C items.

### Phase E — Distribution & visibility (added 2026-09-29 from the live re-audit — DO THESE FIRST)

The Sept research assumed the constraint was identity + content. Measured on 2026-09-29 that is no longer true:
53 posts live in both languages, 127 sitemap URLs, and all **133 internal links** across the home, archive,
category, about and ZH pages return **200**. The site is built and healthy — almost nobody can find it, and there
is no instrumentation to tell whether anyone does. Full evidence table in §4.

**Step E1 — Analytics + the search-performance loop.** ⬜

There is **no analytics of any kind**: home, post, about and ZH pages were grepped for GA/GTM, Plausible, Umami,
Matomo, Clarity, PostHog and Cloudflare's `beacon.min.js` — zero hits. Without it, "did this post get read" is
unanswerable, and the job-hunt thesis can't be verified. Decisions (2026-09-29):

| Option | Verdict |
|---|---|
| **Cloudflare Web Analytics** | ✅ **Primary.** Free with no event/traffic cap, **cookieless** (no consent banner, no CLS cost), one snippet in the base layout — and it reports Core Web Vitals field data, which the Sept report's CWV item otherwise has no way to check. |
| **Google Search Console** | ✅ **Not optional, and half-done already.** `hoelee.com` carries a `google-site-verification=…` TXT record, so a **domain property** already covers `blog.hoelee.com`. Unconfirmed: whether `https://blog.hoelee.com/sitemap-index.xml` was ever submitted. Only the GSC UI can answer that. |
| **Umami** (self-hosted on DSM — MIT, ~1 M events/month free cloud tier) | 🔵 Optional later, only if per-event funnels or full data ownership are wanted. |
| GA4 / Plausible CE | ❌ Skip — GA4 brings weight + a consent banner; Plausible CE needs Postgres **and** ClickHouse. |

- [ ] Enable CF Web Analytics for the zone and add the beacon to the base layout's `<head>` (belt-and-braces vs CF auto-injection).
- [ ] Confirm the GSC domain property covers the blog, submit `sitemap-index.xml`, and re-check "Discovered / Indexed" counts ~a week later.
- **Done when:** a pageview from a second device shows up in CF Web Analytics, and GSC lists the sitemap as Submitted with the post URLs Discovered.
- **Governing doc:** `seo-reference.md`.

**E1 progress — self-hosted Umami deployed 2026-09-29 ✅ (deploy only; not yet public, not yet wired to the blog)**

| Item | State |
|---|---|
| Stack | DSM Portainer **stack 284 `umami`** (endpoint 2), container `umami`, host port **5410 → 3000**, network `bridge_hoelee` |
| Image | `ghcr.io/umami-software/umami:postgresql-latest` → resolved **v3.4.0** (Node 22.23.2). ⚠ v3 publishes versioned tags on `docker.umami.is`, but ghcr only carries rolling tags (`postgresql-v*` stops at 2.16) — record the running version before any upgrade or there is no tag to roll back to |
| Database | **Reused the shared instance**: stack 139 `postgres` → `postgres-server` (PG 17.10, `Etc/UTC`). New role + DB `umami` (login only, **not** superuser). `CREATE EXTENSION pgcrypto` works because PG 13+ treats it as trusted. ⚠ Data lives in `/volume1/docker/postgres-server/data` next to authentik / n8n / tubesync / crowdsec — same fate if that volume is restored |
| Env | `DATABASE_URL`, `APP_SECRET`, `TWO_FACTOR_ENCRYPTION_KEY`, `CLIENT_IP_HEADER=x-forwarded-for`, `DISABLE_TELEMETRY=1`, `DISABLE_UPDATES=1`, `MCP_ENABLED=1`, `TZ=Asia/Kuala_Lumpur`. No `cpus:` (DSM has no CFS quota) |
| Verified on LAN | `/api/heartbeat` → `{"ok":true}` (first hit 6.1 s cold, then 66 ms), `/login` 200, container `healthy`, prisma migrations created **16 tables** |
| Ops notes | `/volume1/docker/umami/README.md` |
| **Public URL** | **https://stats.hoelee.com** live 2026-09-29 — DNS **A → 180.73.9.11** (the user's usual path, **not** through Cloudflare) → router 443 → DSM nginx reverse proxy (`ReverseProxy.json` key `8df2ab4d-ff73-47a0-b5ad-5a09957e6402`, frontend `stats.hoelee.com:443` → **`localhost:10000`** = the authentik outpost since the SSO cut-over) → `http://umami:3000`. Cert = Let's Encrypt `CN=stats.hoelee.com`, 2026-09-28 → 2026-12-27; `http://` → 308. Public allowlist via `skip_path_regex` only: `/script.js` 200, `POST /api/send` 200/400, `/api/heartbeat` 200; every dashboard path 302 → `auth.hoelee.com` |
| **Client IP fix** | ⚠ Because traffic does **not** pass Cloudflare, `CLIENT_IP_HEADER` was changed `cf-connecting-ip` → **`x-forwarded-for`** (what DSM nginx sets) on 2026-09-29, stack re-PUT and verified in the running container. Without it every visit would be attributed to the proxy. Consequence of no CF: no WAF/rate-limit/bot protection on this hostname |
| ✅ **Hardening (A+B) done 2026-09-29** | (A) Default `admin`/`umami` replaced with a random 20-char password (`C:\Users\hoelee\.secrets\umami-admin.txt`) and `APP_SECRET` rotated → every previously issued session invalidated. Verified: old password **401**, new password **200**, old token **401**. (B) New stack **285 `umami-gateway`** (`nginx:1.29-alpine`, holds host port **5410** = what the DSM vhost targets) — public allowlist is exactly `/script.js`, `/api/send`, `/api/heartbeat`; **everything else 403**. Umami itself no longer publishes a public port; the dashboard moved to **LAN-only `192.168.1.1:5411`** (stack 284 republished `5411:3000`), which is unreachable from the internet — verified from the VPS: TCP 5411 closed/filtered, TCP 443 open. ⚠ **Superseded later the same day by the SSO gate below** — the DSM vhost now points at the outpost, so stack 285 is no longer in the public path but is **left running as the rollback** |
| ⚠ Gate design constraint found | **HTTP basic auth cannot be used here**: the Umami front end sends `Authorization: Bearer <jwt>` on its own API calls, and a browser sends only one `Authorization` header — Bearer replaces Basic, so a basic-auth gate 401s every API call and the dashboard breaks. If a *remote* dashboard is ever wanted, **one hostname is still enough** — either rely on Umami's own login (+ enable 2FA) or put cookie auth (authentik forward-auth / oauth2-proxy) on this same hostname with skip-paths for the tracker (the `traefik-login-numerology` pattern). A second hostname (tracker vs admin) is the PostHog/Sentry-scale ingest-vs-app split, not a requirement. `stats-admin.hoelee.com` was only a hypothetical and was never created (NXDOMAIN verified) |
| End-to-end tracker verified | A real pageview POSTed through the **public** gate was recorded: 1 pageview / 1 visitor, with `country=MY, region=MY-07, city=George Town`, browser chrome, os Windows 10 — proving the `X-Forwarded-For` chain (DSM nginx → gate → Umami) works and geo needs no Cloudflare headers. The temporary test website was deleted afterwards (website list back to 0) |
| Still open | (a) CF Web Analytics still not enabled (independent of Umami — it is the zero-code option and would also give Core Web Vitals field data). (b) GSC sitemap submission still unconfirmed — only the GSC UI answers it. (c) ✅ **Resolved 2026-09-30** — the tracker is wired into three sites (see Step B2j) and pageviews are landing with real geo + referrer; "recording" is no longer in doubt, only the CF/GSC half of E1 remains |
| Dashboard login | **Two ways in** (since the SSO cut-over): <https://stats.hoelee.com> — authentik SSO first, then the app's own login — or the LAN break-glass <http://192.168.1.1:5411>. Credentials: `admin` + the random password in `C:\Users\hoelee\.secrets\umami-admin.txt` (agent-set 2026-09-29; change it in Settings → Profile if you prefer). Per-account 2FA is available (`TWO_FACTOR_ENCRYPTION_KEY` already set) |

**E1 progress — SSO gate wired 2026-09-29 ✅ (authentik `forward-auth`-style proxy in front of the dashboard; tracker stays public)**

The user asked for the dashboard to be reachable remotely **without** publishing an Umami login page, i.e. one hostname, SSO on the dashboard, tracker open. Built on the existing authentik instance (`auth.hoelee.com`, 2026.8.2) instead of a second container:

| Item | State |
|---|---|
| authentik objects | proxy provider **pk 64 `Provider Proxy Stats`** (`mode=proxy`, `external_host=https://stats.hoelee.com`, `internal_host=http://umami:3000`, `skip_path_regex` = `^/script\.js$` + `^/api/send` + `^/api/heartbeat$` + `^/mcp(/|$)`) + application **`umami-stats`** (launch URL + 512×512 logo, see below). Attached to the **embedded outpost** `e16274ac-a3ad-4c21-bb16-4a5d32570bc6` (20th provider) |
| Per-app login flow | **`auth-stats`** (designation `authentication`, 4 stages: identification → password → mfa-validation → user-login), so the SSO page for this app is its own branded screen and **not** shared with the other 19 apps. Provider `authentication_flow` points at it |
| App icon | ⚠ In this build the application icon field is **`meta_icon`** (not `icon` — PATCHing `icon` silently no-ops). Uploaded with the house convention `application-icons/umami.png` via `POST /admin/file/` (multipart, `usage=media`), then `PATCH /core/applications/umami-stats/ {"meta_icon": "application-icons/umami.png"}` → `meta_icon_url` `/files/media/public/application-icons/umami.png` verified 200 (21,989 B PNG) |
| DSM cut-over | vhost `…c378795c2acb.w3conf` §2731 `proxy_pass http://localhost:5410` → **`http://localhost:10000`** (the outpost) + `ReverseProxy.json` `"port" : 5410` → `10000`; backups `*.bak-20260929-sso-stats-sso`. Both edits asserted unique first (`grep -c 5410` = 1 in each file), `nginx -t` clean, reloaded |
| ⚠ Pitfall found | **`mode=proxy` is required here, `forward_single` breaks it**: `forward_single` leaves `internal_host` empty, so the outpost has no upstream — the SSO redirect chain looks perfectly healthy while **every app path silently 404s** (`/script.js` 404 with `x-powered-by: authentik`). `proxy` + `internal_host=http://umami:3000` is also what HA (pk 6) / NocoDB (pk 62) use |
| ⚠ Other pitfall | After any provider change the **embedded outpost needs ~1–2 min to pick up the new config**; before that, `/` answers `302 → /flows/-/default/authentication/` and app paths 404. Judging the wiring before that window expires gives a false "it's broken" |
| Verified from the public internet (2026-09-29) | anonymous `/` → 302 → `/outpost.goauthentik.io/start` → `auth.hoelee.com/if/flow/auth-stats/…` → **200** (same shape as the working `auth-mysql` chain); `/login`, `/api/websites` → 302 gated; `/script.js` **200**, `/api/heartbeat` **200**, `POST /api/send` **400 app-level** |
| End-to-end tracker through the SSO path | temp website + 2 pageviews POSTed to `https://stats.hoelee.com/api/send` → recorded **2 pageviews / 1 visitor / 1 session**, `country=MY, region=MY-07, city=George Town`, referrer metric `google.com` → **the outpost does not break `X-Forwarded-For`, geo still works**; temp website deleted |
| MCP over the public URL (added 2026-09-29, same day) | `^/mcp(/|$)` appended to the provider's `skip_path_regex` (done via `ak shell` ORM — the `hermes3` API token was dead by then, and the ORM write is the same model path the API uses). Verified: `POST https://stats.hoelee.com/mcp` with `Authorization: Bearer umami_…` + `Accept: application/json, text/event-stream` → **200**, `Content-Type: text/event-stream`, chunked, `x-powered-by: authentik`, `tools/list` returns the tool table, `tools/call list_websites` → `count: 0`; **no key → 401** (`Missing bearer API key`, i.e. the request reaches Umami, not the SSO gate); dashboard paths still 302, tracker paths unchanged. ⚠ `x-api-key:` does **not** work for Umami's API/MCP — only `Authorization: Bearer` |
| **Tracker wired into the two sites (2026-09-29) ✅** | Website records created: `blog.hoelee.com` → `1817d8f6-0e49-4b9a-a50d-307e4f2962c7`, `www.digikedai.com` → `61b57143-f3f4-4353-9ede-9c615146de84`. Snippet added to `blog/src/layouts/BaseLayout.astro` (commit **de17bea**, pushed Gitea+GitHub, Gitea Actions → live in ~1 min; covers EN **and** ZH since both use the layout) and to `dsm-resource-management/www/src/layouts/Base.astro` (CF Pages via `./deploy.sh`, deployment `4d3d6aa6.digikedai.pages.dev`). Both tags carry `is:inline` (Astro would otherwise process the script) + `data-domains` so local dev never reports. Verified live HTML on both domains contains the `data-website-id`; verified end-to-end with a **real Chrome** (Canary CDP 9222): blog `/` + `/zh/` → 4 pageviews/2 visitors, digikedai `/` + `/products/` → 2 pageviews/1 visitor, geo `MY / MY-07 / George Town`, chrome/Windows 10; then `POST /api/websites/<id>/reset` cleared the test rows (both back to 0) |
| ⚠ **Verification pitfall: headless browsers are ignored** | Umami drops bot/headless user agents — `HeadlessChrome/151` (DSM browserless) → `200 {"beep":"boop"}` and **nothing stored**; a normal Chrome UA → `200 {"cache":…}` and stored. So `beep boop` = *ignored*, not success, and an empty dashboard after a headless test is not a bug. Verify tracking with a **real** browser (Canary CDP 9222: `curl -X PUT "http://127.0.0.1:9222/json/new?<url>"`), or at least a normal-UA curl |
| Not done yet | CF Web Analytics beacon + GSC `sitemap-index.xml` submission (both independent of Umami) |
| Known trade-off (honest) | (1) SSO protects the *dashboard route*, but Umami has **no OIDC**, so after SSO the user still sees **Umami's own login page** — double login, expected, one-click after the first time (2FA is available per-account in Settings → Profile; `TWO_FACTOR_ENCRYPTION_KEY` already in the stack env). (2) `<http://192.168.1.1:5411>` remains a **LAN break-glass path that bypasses SSO** (still needs Umami credentials; verified closed from the internet) — delete/close it if that is not wanted. (3) If the authentik outpost goes down, the dashboard goes down with it (tracker too — but the site keeps loading, the tracker fails silently) |
| Rollback | Start the gate again (`sudo /usr/local/bin/docker start umami-gateway`, or start stack 285 in Portainer) → re-point the vhost + `ReverseProxy.json` to `5410` → reload nginx. Backups of both files sit next to the originals. (The gate container is now **`Exited (0)`** — it was stopped once the outpost took over, so port 5410 is free; the stack is kept as the rollback asset) |
| Note | The `hermes3` authentik API token expired mid-session (DB says `expires 2026-09-28 22:17:08Z`); the leftover self-test account was removed through authentik's own ORM (`ak shell`), so no admin-group test user is left behind |

**Step E2 — Wire the two sites together (www.hoelee.com → blog).** ⏸ Deferred by user 2026-09-29

Measured: **all six pages of www.hoelee.com** (home, `/zh-hans/`, `/about-mrhoelee/`, T&C, support, privacy) contain
**zero** references to `blog.hoelee.com`, while the blog links out to www.hoelee.com. The older, more established
domain passes no authority and offers no click-path to the portfolio — one-way.

⚠ **User decision 2026-09-29: www.hoelee.com needs a full overhaul; do NOT patch it piecemeal now.** Fold this link
into that overhaul (together with the v2.1 audit finding that its agency framing conflicts with the job hunt).
Tracked here so it isn't lost.

**Step E3 — Syndicate 2–3 flagship posts.** ⬜ (report §9 "Month 2+ — promote": never executed)

`seo-reference.md` already carries the syndication policy (cross-post with canonical back to the original domain);
nothing has ever been syndicated, so the 53 posts only exist for people who already know the URL.

- [ ] Cross-post to dev.to with `<link rel="canonical">` pointing at the original: `how-i-built-the-digikedai-telegram-bot`, `one-prometheus-for-unraid-synology-and-a-vps`, `self-hosting-mem0`.
- [ ] One LinkedIn share per flagship (same photo + name identity as the blog).
- **Done when:** each dev.to copy is live with the canonical set, and each has one LinkedIn post.

**Step E4 — Chinese-side routes and nav are broken.** ⬜ (extends Step C4)

Live ZH pages: the nav renders 「文章」→ `/zh/` (fallback; `/zh/posts/` **404s**) and 「关于」→ `/zh/` — i.e. the
Chinese nav's *About* link is wrong even though `/zh/about/` itself returns 200 and is in the sitemap. `grep
'/zh/about/'` finds **no inbound link anywhere on the site**, so the ZH About page is orphaned.

- [ ] Build the `/zh/posts/` archive; point 「文章」 at it and 「关于」 at `/zh/about/`.
- **Done when:** `/zh/posts/` 200, both ZH nav labels point at the right routes, and `/zh/about/` is reachable by clicking from `/zh/`.

**Step E5 — `og:locale` is wrong on all 53 Chinese pages.** ⬜

ZH post pages emit `<meta property="og:locale" content="en">` with `og:locale:alternate = en_US`.

- **Done when:** ZH pages emit `zh_CN` (`en_US` as the alternate), EN pages unchanged.

**Step E6 — Cloudflare is not caching the HTML.** ⬜

A post page returns `cf-cache-status: DYNAMIC` and `strict-transport-security: max-age=0`. A static site behind CF
should be edge-cached — lower TTFB and less origin traffic through the tunnel.

- [ ] Add a cache rule for `blog.hoelee.com` (cache HTML, honour origin `last-modified`) and take a decision on HSTS.
- **Done when:** a repeat request shows `cf-cache-status: HIT` **and** a deploy still goes live within ~1 minute.

**Step E7 — Content-volume guardrail.** ⬜ ongoing

53 posts shipped in ~4 weeks (30 dated 2026-09). The volume itself is the "content-farm" signal `content-guide.md`
§7 warns about, even though every post traces to real logs/commits. Two rules:

- Keep the existing per-post "every claim traces to a source file or log" check — do not relax it for volume.
- **Never stack more than ~3–5 posts on one `pubDate`** (worst day so far: 2026-09-18 with 5). Spreading a batch by
  backdating into archive gaps is the sanctioned method.

**Step E8 — Small hygiene backlog.** ⬜

- [ ] `scraping-bot-walled-marketplace-warm-browser-session`: OG card exists, **banner 404s** (no `banner:` in frontmatter, no PNG). Generate it or accept it as the one exception.
- [ ] `authentik-css-greater-than-bug` (the `>` bug) is complete in EN + ZH but still `draft: true` since 2026-09-20 — the last item in the draft bank; publish it with images.
- [ ] `og-default.png` has **no face**; the homepage and category pages share it. Regenerate after Step A1 (same source asset).
- **Done when:** no page references a 404 image, the draft bank is empty, and the default share card matches the A1 photo.

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

**Step B1 — Write the 2nd flagship case study: "Self-Hosting a Mem0 Memory Stack".** ✅ Done 2026-09-16
The Mem0 flagship is already the single highest-value unwritten post in the backlog.
- [x] Write `src/content/posts/self-hosting-mem0.md` (category `case-studies`).
- [x] Write Chinese twin `src/content/posts/zh/self-hosting-mem0.md` (same filename → auto language-switch).
- [x] Follow the "hard job → post" template (§4 content-guide) + open with "why it matters" + end with hire CTA (§8 post-guideline).
- **Governing doc:** `content-guide.md` §4/§8, `post-guideline.md` §8.
- **Done when:** ✅ both EN + ZH pages live, language-switch works, hire CTA present.

**Step B1b — Write the self-hosted STT case study.** ✅ Done 2026-09-19
`self-hosted-speech-to-text-api.md` (EN + ZH): whisper.cpp on GPU + n8n auth gate +
nginx gateway, with the four build traps and the "5x faster than typing" business case.
- [x] EN + ZH posts, custom OG + banner, hire CTA.
- **Done when:** ✅ both pages build, language-switch verified, images generated.

**Step B2 — Write 2–3 short "gotcha" posts (Google-friendly, compound over time).**
- [x] "Replacing RDPGuard With IPBan: The Traps Nobody Documents" (EN + ZH, `devops`, 2026-09-19) — the uninstaller that unbans 12 attackers, `--install-service` doesn't exist in v4.1.0, `ExpireTime` vs `BanTime`. Both images custom.
- [x] "When Your Database Client Lies to You: Patching Workbench 26 for MariaDB" (EN + ZH, `devops`, 2026-09-19) — a client whose error handler crashed while reporting its own errors, masking every real failure; three patches to Oracle's bundled code, all stemming from `major >= 8` being an invalid MySQL-vs-MariaDB test. Both images custom.
- [x] "Why Chrome Forgets Its Tabs in a Container — And How I Fixed It" (EN + ZH, `devops`, 2026-09-29) — the container kills the browser, so it never sees a clean exit and *no* restore mechanism fires (flag, hand-edited `Preferences`, `RestoreOnStartup` policy all verified failing); the 60-second snapshot keeper that fixed it, plus the stale `Singleton*` and `custom-cont-init.d` permission traps. Both images custom.
- [x] "The Forward-Auth Gate That Verified Perfectly — and Wasn't Live" (EN + ZH, `devops`, 2026-09-29) — the B2 forward-auth item, delivered with a better villain than Traefik: the gate passed every local check (302 → outpost, branded login page) while the public URL served the app directly, because that hostname is served by a Cloudflare tunnel rule that bypasses nginx; adds `skip_path_regex` (SSO for the UI, open API), the "count before you substitute" revert trap (11 vhosts share the outpost port) and the same-second reload race. Custom OG + banner, hire CTA, commit `e7e4ee5`.
- [ ] "Site-to-site OpenVPN behind CGNAT"
- [ ] "Fixing the WordPress /cv 301→404 chain" (from own audit)
- **Governing doc:** `content-guide.md` §3 (post type #3), `post-guideline.md`.
- **Done when:** ≥2 gotcha posts live (these are `notes`/`devops`, no Chinese translation required per §8).
- ⚠ **Note:** `post-guideline.md` §8 (newer) says *every* post gets a ZH twin — the "no Chinese required" note above is stale. The RDPGuard post was published EN + ZH.

**Step B2b — Draft bank.** ✅ Both published 2026-09-27 (EN + ZH, with OG + banner, verified 200 on 2026-09-29) — `migrating-codeigniter-iis-to-openlitespeed` and `upgrading-codeigniter-46-to-47`. The publish recipe below stays valid for the next draft. Remaining draft: `authentik-css-greater-than-bug` (**E8**).
Two finished posts (EN + ZH, each with frontmatter pointing at OG + banner paths) sitting in the repo but
**not built or listed** — `draft: true` excludes them from all listings and generates no pages.

| Slug | Category | Status | Assets |
|---|---|---|---|
| `migrating-codeigniter-iis-to-openlitespeed` | `engineering` | drafted, unpublished | OG + banner PNGs **not yet generated** |
| `upgrading-codeigniter-46-to-47` | `notes` | drafted, unpublished | OG + banner PNGs **not yet generated** |

**To publish one later:**
1. Flip `draft: true` → `draft: false` in **both** `src/content/posts/<slug>.md` and `src/content/posts/zh/<slug>.md`.
2. Set the real `pubDate` (currently `2026-09-20`, the draft date) in both files.
3. Generate its images: `node scripts/og-gen/generate.mjs <slug>` and `node scripts/banner-gen/generate.mjs <slug>` (add a `TERMINALS[slug]` / `BANNERS[slug]` entry first for the custom panel).
4. `npm run build`, commit, `git push origin main`.
5. Verify both URLs return 200 and the language switcher links them.

- **Why these two:** `engineering` had only 1 post and `tutorials` only 1 — the blog was ~all `devops`/`case-studies`. These put PHP/CodeIgniter (the actual day-job stack) on the blog, which is what a PHP full-stack recruiter searches for.
- **Governing doc:** `content-guide.md` §3/§4, `post-guideline.md` §8.
- **Done when:** both are published live with EN+ZH, custom OG + banner, and verified 200.

**Step B2c — (unplanned) Publish "No API for Browser Translation" — the English-mode story.** ✅ Done 2026-09-29
`adding-english-mode-to-a-chinese-only-web-app` (category `engineering`, EN + ZH): the `<html lang="en">` lie that
suppressed the browser's translate prompt, the fact that no browser-translate API exists, and the gateway-injected
dictionary + floating EN button (871 labels, 77–88% measured coverage). Custom OG + banner, hire CTA, commit `8a9ba6a`.
- **Why:** `engineering` was the thinnest published category, and the story is a rare, searchable gotcha with hard numbers.
- **Done when:** ✅ both pages 200, language switch links both ways, sitemap hreflang pair, RSS entry, OG + banner served.

**Step B2d — (unplanned) Publish "How I Vet an Open-Source Dependency Before Betting On It".** ✅ Done 2026-09-29
`vetting-an-open-source-dependency-before-you-bet-on-it` (category `devops`, EN + ZH): the six checks that
corrected six assumptions from a 1,306-line architecture spec — repo vital signs via the GitHub API, grepping for
the feature instead of reading for it (OIDC/SSO/SAML → 0 hits), reading a feature doc's target branch
(white-label lives on `multi-tenant`, not `main`), reading the data model rather than the feature list
(`percent`/`fixed` vs five assumed rule types), the Community-vs-Enterprise tier gate (API tokens free, SSO paid),
and whether the money rail works in-country (selfhost + manual payouts, not Stripe Connect). Custom OG + banner,
hire CTA, commit `8711136`.
- **Why:** forms a due-diligence cluster with `how-to-verify-a-hosting-provider-before-you-buy` and
  `how-i-vetted-20-vps-providers-with-parallel-subagents` — those cover vendors you *pay*, this covers code you
  *depend on*. `devops` is the most differentiated category.
- **Done when:** ✅ both pages 200, language switch links both ways, OG + banner served (1200×630 / 1600×900),
  listing order monotonic on `/posts/`, `/` and `/zh/`, Gitea Actions task `success`.
- ⚠ **Overlap to watch:** two parallel in-flight posts cover adjacent material
  (`nocodb-sso-is-a-licensed-feature`, `authentik-forward-auth-gate-wasnt-live`). If those publish, add
  cross-links so the trio reads as a series rather than repetition.

**Step B2f — (unplanned) Publish the agent-safety + CDP-automation pair.** ✅ Done 2026-09-29
Two posts from the DigiKedai voucher-automation session, both backdated into the archive's empty 2025
stretch (EN + ZH, custom OG + banner, commit `170f5cc`):

| Slug | Category | pubDate | updatedDate | What it is |
|---|---|---|---|---|
| `i-let-an-agent-manage-my-shopee-vouchers` | `ai` | 2025-07-08 | 2026-09-29 | the audit → propose → auto design, the `mode: propose` gate, and the list-lag mistake that created an unplanned RM140 voucher |
| `why-your-cdp-clicks-silently-fail` | `devops` | 2025-03-19 | 2026-09-29 | stale rect from `scroll-behavior: smooth`, coordinate clicks dropped on a hidden window, JS-dispatched events — and how to tell the three causes apart |

- **Why 2025 dates:** 2025-01 → 2025-10 was completely empty in the archive (nearest neighbours:
  2024-09-24 and 2025-11-12). Backdating fills a real gap; `updatedDate` keeps `lastmod` / `dateModified`
  honest (post-guideline backdating rule). Neither post carries a date-, month- or version-pinned sentence —
  verified with `grep -nE "20[0-9]{2}|January|…|tonight|this week"` **before** moving the date.
- ⚠ **B2's gotcha list is still open:** the three bullets there (Traefik forward-auth, OpenVPN behind CGNAT,
  WordPress `/cv` 301→404 chain) remain unstarted; `why-your-cdp-clicks-silently-fail` counts as an extra.
- ⚠ **Generator entries deliberately NOT committed.** Another session had uncommitted edits in
  `scripts/og-gen/generate.mjs` / `scripts/banner-gen/generate.mjs`, so the `TERMINALS` / `BANNERS` entries for
  these two slugs were applied through throwaway `generate.local.mjs` copies (deleted afterwards) and the images
  were committed as static files. **Re-add the four entries below** the next time one of these images must be
  regenerated, or when the next post needs a panel in the same style:

````js
TERMINALS['i-let-an-agent-manage-my-shopee-vouchers'] = `
    <div class="line"><span class="prompt">$</span><span class="cmd">python voucher_watch.py --auto</span></div>
    <div class="line"><span class="prompt">&nbsp;</span><span class="err">Confirm clicked · voucher not in the list — the list was 10 min stale</span></div>
    <div class="line"><span class="prompt">&nbsp;</span><span class="cmd">mode=propose</span><span class="fix">→ waiting for price confirmation ✓</span></div>`;

TERMINALS['why-your-cdp-clicks-silently-fail'] = `
    <div class="line"><span class="prompt">$</span><span class="cmd">cdp click '.picker-item input'</span></div>
    <div class="line"><span class="prompt">&nbsp;</span><span class="err">clicked @591,361 · nothing happened · document.hidden=true</span></div>
    <div class="line"><span class="prompt">&nbsp;</span><span class="cmd">bringToFront + dispatch MouseEvent</span><span class="fix">→ picker opens ✓</span></div>`;

BANNERS['i-let-an-agent-manage-my-shopee-vouchers'] = {
  titlebar: 'unraid — shopee voucher watch',
  lines: [
    { t: 'cmd', text: 'python voucher_watch.py --auto' },
    { t: 'dim', text: 'vouchers have no draft state — Confirm = live + escrow' },
    { t: 'err', text: 'Confirm clicked · not in list · judged "refused" · clicked twice more' },
    { t: 'ok',  text: 'it existed — the voucher list was ~10 min behind' },
    { t: 'err', text: 'cost: one unplanned RM14/29 voucher · exposure RM140' },
    { t: 'cmd', text: 'policy: mode=propose · cap RM300/month' },
    { t: 'ok',  text: 'PROPOSAL RM9.60 / min RM18 × 20 → WAITING FOR PRICE' },
    { t: 'hl',  text: 'agent-created vouchers since the gate: 0 · 4 live' },
  ],
  flow: [
    { n: '1', label: 'read-only audit' },
    { n: '2', label: 'propose params' },
    { n: '3', label: 'human confirms' },
    { n: '4', label: 'create once ✓' },
  ],
};

BANNERS['why-your-cdp-clicks-silently-fail'] = {
  titlebar: 'canary — seller centre via CDP',
  lines: [
    { t: 'cmd', text: "click '.picker-item.end-picker input'" },
    { t: 'err', text: 'clicked @591,361 · picker never opened' },
    { t: 'dim', text: 'scroll-behavior: smooth → rect read mid-animation' },
    { t: 'ok',  text: 'scrollBehavior=auto + behavior:instant → rect is real' },
    { t: 'err', text: 'document.hidden=true → coordinate clicks dropped' },
    { t: 'cmd', text: "['mousedown','mouseup','click'].forEach(dispatchEvent)" },
    { t: 'ok',  text: 'picker opens every time · Confirm lands ✓' },
    { t: 'hl',  text: '3 causes · 1 injected listener tells them apart' },
  ],
  flow: [
    { n: '1', label: 'arm listener' },
    { n: '2', label: 'elementFromPoint' },
    { n: '3', label: 'JS-dispatch click' },
    { n: '4', label: 'opens every time ✓' },
  ],
};
````
- **Done when:** ✅ both pages 200 (EN + ZH), language switch links both ways, OG + banner served
  (1200×630 / 1600×900), listing order monotonic on `/posts/`, `/` and `/zh/`, Gitea Actions task `success`,
  and `git status` clean of other sessions' files.

**Step B3 — Adopt the "hard job → post" habit.**
Every solved problem becomes a `notes` entry the same week.
- [ ] Revisit cadence target: 2 posts/month → 1/week (`content-guide.md` §5).
- **Done when:** 3 consecutive months hit the 2-posts/month floor.

**Step B2e — (unplanned) Two posts out of the SSO / forward-auth session.** ✅ Done 2026-09-29
Same working session that wired (and then deliberately rolled back) an authentik forward-auth gate in front of a
self-hosted app produced two posts:

| Slug | Category | What it argues | Commit |
|---|---|---|---|
| `authentik-forward-auth-gate-wasnt-live` | `devops` | the gate verified perfectly from the host while the public URL bypassed it — two ingress layers per hostname; verify from outside and read which software answered (`x-powered-by`) | `e7e4ee5` |
| `nocodb-sso-is-a-licensed-feature` | `notes` | the OIDC env vars are real and enforced at boot, but the feature is Business+; on an unlicensed build an unauthenticated `GET /auth/oidc` throws and exits(1); MySQL meta blocks licensing; the "drop-in" community fork is abandoned (0.255.2, 2024-10-29) | `2d0de72` |

- Both EN + ZH, custom OG + banner, hire CTA; both link to each other (one-way: the NocoDB post links to the gate post).
- **Why:** the trap is rare and genuinely searchable (`authentik forward auth`, `nocodb sso self-hosted`), and both are
  first-person debugging stories with measured evidence — the moat per `content-guide.md` §7.
- **Done when:** ✅ 4 pages 200 with expected content, language switch links both ways, 4 images served as `image/png`.

**Step B2f — (unplanned) Four monitoring posts out of one Prometheus/Grafana session.** ✅ Done 2026-09-29
One working session that unified monitoring across unRaid + Synology DSM + a VPS produced four posts. All four are
**backdated** into the 2026-03-25 → 2026-09-04 archive gap (that stretch had no posts) with `updatedDate: 2026-09-29`
holding the real date, so the sitemap `lastmod` stays honest and listings still sort by `pubDate`:

| Slug | Category | pubDate | What it argues |
|---|---|---|---|
| `smartctl-exit-code-32-skips-the-disks-that-matter` | `notes` | 2026-04-14 | `smartctl`'s exit status is a bitfield, not a boolean: `rc=32` means "SMART OK, attributes were below threshold in the past". An `if ! smartctl` guard skipped 2 of 4 SSDs — exactly the marginal ones. Fix: mask the informational bits (32/64), export `rc` as a metric. |
| `why-your-grafana-dashboard-shows-no-data` | `devops` | 2026-05-17 | A template variable defined as `label_values(...{nodename=~"$nodename"})` filters on itself → 0 options → `$node` empty → every panel No data while all targets are `up`. Also: why hand-substituting variable values during verification hides exactly this bug, and `$__all` ≠ `.*` in automated panel checks. |
| `your-disk-full-alert-is-lying` | `devops` | 2026-06-24 | Percentage thresholds on multi-TB volumes fire while 500 GB remains; 92% "memory used" with 4.8 GB available is cache, not pressure. Alert on consequences: bytes free, `MemAvailable`, steal >50%. Includes the "keep the comparison in the threshold condition" rule and the mount-selector exclusions. |
| `one-prometheus-for-unraid-synology-and-a-vps` | `case-studies` | 2026-07-29 | The flagship: node_exporter vs cAdvisor coverage matrix; `name!=""` for cAdvisor's non-container cgroups; "total storage" counting one NAS volume three times (`/volume1`, `/opt`, CIFS re-mount) and the dedup selector; a KVM guest exporting no CPU frequency at all (textfile collector, distinct metric name, merged with `or`); a container reporting its own ID as `nodename`. Result: 7 targets, 47 cores / 158 GHz / 142 GB / 64 TB / 155 containers on one screen. |

- All four EN + ZH, custom OG + banner, hire CTA naming "self-hosted monitoring pipelines"; no post carries an absolute
  date or "recently/as of" phrasing, which is what made the backdating safe (per `post-guideline.md` backdating rule).
- **Why:** the blog had **zero** Prometheus/Grafana/monitoring posts while `content-guide.md` §2 lists monitoring under
  `devops`, "my most differentiated material" — and `monitoring`/`grafana no data`/`smartctl exit code` are heavily
  searched by exactly the audience this blog targets.
- **Done when:** ✅ 8 pages 200 with expected content, language switch links both ways, 8 images served as `image/png`,
  archive order still monotonic on `/posts/`, the homepage and `/zh/`.

**Step B2g — (unplanned) Three posts out of the Synology Office / spreadsheet-API session.** ✅ Done 2026-09-29
One session spent making a Synology NAS read, write and chart spreadsheets produced three posts. All three are
**backdated** into the 2024-09-24 → 2025-11-12 gap — the widest stretch in the archive with no posts — with
`updatedDate: 2026-09-26` holding the real date, so `lastmod` stays honest and listings still sort by `pubDate`:

| Slug | Category | pubDate | What it argues |
|---|---|---|---|
| `synology-spreadsheet-api-is-a-container` | `devops` | 2025-08-20 | The flagship. Enumerating the DSM gateway (1,515 APIs) showed no cell-level Office endpoint, so I concluded the NAS had no spreadsheet API — **wrong**: it ships as the container `synology/spreadsheet-api` (image tag ↔ Office version table). Plus two diagnostics that lied (`synopkg is_onoff` reporting a running package as "not turned on"; `ps` without `sudo` on DSM listing only your own processes, which made a live stack look dead), a required `AUTH_SECRET` whose absence crashes with a minified stack trace, a `401` with provably correct credentials, 2FA that can never authenticate, `403` vs `404` semantics, a personal `My Drive` unreachable by any service account, and the verified fix — read/write/CSV/`.xlsx` with Synology's own engine evaluating the formulas, then a chart out the far end. |
| `synology-api-401-with-the-correct-password` | `notes` | 2025-09-10 | The two causes of a `401` when the password is right: `host` must be an FQDN whose certificate the proxy accepts (a bare LAN IP fails its TLS handshake, and a failed handshake is reported identically to a bad password), and a 2FA account can never sign in (`AuthorizationBody` has no OTP field). Includes the three-command triage that separates them, and why a token that worked yesterday returns `401` today — it's bound to the DSM session, not just to a 28-day clock. |
| `reading-a-containers-own-api-docs` | `notes` | 2025-10-01 | Extract a container's contract from the artifact instead of the vendor's page: `--entrypoint cat` the bundled OpenAPI spec, `--entrypoint grep` the bundle for the env-var contract and the defaults, read Env/Entrypoint/Cmd from the registry config blob without pulling a byte, decode the real listening port from `/proc/net/tcp`, and run detached to read startup logs without hanging the shell. |

- All three EN + ZH, custom OG + banner (centering **measured**, not eyeballed: gapAbove/gapBelow 47/49, 76/78,
  106/108, `delta=2px`, `overflow=0`), hire CTA naming self-hosted integrations; the two `notes` posts link up to
  the flagship with a relative link.
- **Why:** the search results for `synology spreadsheet api` / `spreadsheet-api docker` are Synology's own Hub page,
  a German how-to and two MCP wrappers — nothing covers the failure modes, and the "vendor tool told me the wrong
  thing" shape matches the blog's strongest existing genre (`patching-workbench-26-for-mariadb`,
  `when-smart-says-healthy-but-your-raid-is-corrupting-data`).
- **Done when:** ✅ 6 pages 200 with expected content, language switch links both ways, 6 images served as
  `image/png`, archive order still monotonic on `/posts/`, the homepage and `/zh/`.

**Step B2h — (unplanned) Audit + backdate of the six posts that landed on 2026-09-29.** ✅ Done 2026-09-29
One publishing day put **six** EN posts on the same `pubDate`, so `/posts/` opened with a single-day dump. Each was
checked for date-, month- and version-pinned prose before its frontmatter was touched; two carried no pins and were
moved into the archive's empty months with `updatedDate: 2026-09-29` holding the real date:

| Slug | Category | pubDate → updatedDate | Why it was safe / blocked |
|---|---|---|---|
| `adding-english-mode-to-a-chinese-only-web-app` | `engineering` | 2025-06-11 → 2026-09-29 | no absolute date, month name, version or relative-time phrasing anywhere in EN or ZH; fills the empty 2025-06 |
| `authentik-forward-auth-gate-wasnt-live` | `devops` | 2026-08-12 → 2026-09-29 | no pins. `nocodb-sso-is-a-licensed-feature` links *back* to it, so it must stay dated earlier than 2026-09-29 (it does), and the "licensing story in its own write-up" forward reference now reads as weeks rather than months. Fills the empty 2026-08 |

- **The four that had to stay on 2026-09-29, and the exact sentence that pins them:**
  - `read-only-nocodb-dashboard-for-a-remote-database` — image tag `nocodb/nocodb:2026.09.0` **and** a returned row
    timestamp `2026-09-27 01:54:16+00:00` → floor 2026-09-27.
  - `nocodb-sso-is-a-licensed-feature` — same `2026.09.0` image tag → floor 2026-09-01.
  - `vetting-an-open-source-dependency-before-you-bet-on-it` — quotes the GitHub API as "last push 2026-09-10"
    → floor 2026-09-11.
  - `why-chrome-forgets-its-tabs-in-a-container` — the setup table names `Chrome 154` (≈ Oct 2026 on Chrome's
    cadence) and the post links back to `scraping-bot-walled-marketplace-warm-browser-session` (2026-09-13) as
    something already written → floor 2026-09-13.
- **Still empty, and therefore the spare slots for the next batch:** 2024-10 → 2025-02 (five months) and 2025-04/05.
- **Done when:** ✅ build clean, `lastmod` = 2026-09-29 for all four URLs (EN + ZH), listing order still monotonic
on `/posts/`, the homepage and `/zh/`, both article pages render the historical date.

**Step B2i — (unplanned) The web3 category, plus two engineering posts.** ✅ Done 2026-09-29
`web3` had **zero** posts and no route at all: `/categories/` rendered its card with the label
"0 posts · coming soon" as a *non-link*, and `/categories/web3/` returned **404** (Astro only emits a
category detail route once the category has posts). A Gitea sweep found seven real web3 repos whose
commits date to **2024-08-15 → 2024-08-19**, which is also why those posts could be backdated honestly.
Five posts shipped (EN + ZH, custom OG + banner, hire CTA):

| Slug | Category | pubDate | updatedDate | Source repo |
|---|---|---|---|---|
| `fully-on-chain-svg-nfts` | `web3` | 2024-10-08 | 2026-09-29 | `foundry-nft` — `MoodNft.sol`, `DeployMoodNft.s.sol` |
| `why-my-on-chain-nft-art-changed-on-windows` | `web3` | 2026-08-19 | — | `foundry-nft` — the `.gitattributes` fix commit |
| `chainlink-vrf-v2-lottery-contract` | `web3` | 2024-12-10 | 2026-09-29 | `hardhat-smartcontract-lottery` — `Raffle.sol` |
| `verifying-a-pdf-report-page-by-page` | `engineering` | 2026-09-28 | 2026-09-29 | `numerology-report` — `docs/pdf-pipeline.md` |
| `jpa-version-field-lost-update` | `engineering` | 2026-08-19 | — | `springboot-hoelee-demo` — `@Version` |

- **Why these dates:** the two 2024 posts fill the empty 2024-10 and 2024-12 archive months with the real
  work date and `updatedDate` holding the true date, so `lastmod` stays honest. The two 2026-08-19 posts use
  the real work date rather than joining the 2026-09-29 pile-up. `verifying-a-pdf-report-page-by-page` was
  moved **one day** to 2026-09-28 for the same reason — it was the fifth post landing on 2026-09-29.
- ⚠ **Date pins were re-checked before moving any date.** The only `202[0-9]` hits in the two backdated
  posts are inside the contract address `0xc2022b56…`, not dates. All cited figures were traced to source:
  `868596` / `4102 bytes` / `993568` gas / `0.000535185588997216 ETH` / block `6522146` / mint `181874`
  (deploy + mint logs), `335011` gas (`.gas-snapshot`), `2.5pt→7.5pt` + `20,225,818` bytes + `30–490pt`
  (`docs/pdf-pipeline.md`; the `27 pages` / `12,789 pages` figures live in `app/Libraries/ReportPdf.php`
  lines 21 and 196, **not** in the doc), `@Version` + `POST_VERSION_CONFLICT` in the Spring demo.
- ⚠ **The `TERMINALS` / `BANNERS` entries for all five slugs ARE committed this time** (unlike B2f, which had
  to hide them in this file because a parallel session held uncommitted generator edits). Both generators
  were verified clean and the diffs purely additive (30/0 and 100/0) before editing.
- Banner centering **measured, not eyeballed**: all five at 8 rows, `gapAbove`/`gapBelow` within 2px,
  `overflow=0`, `scrollHeight == clientHeight == 636`.
- **Done when:** ✅ 2 new category routes (`/categories/web3/`, `/zh/categories/web3/`), build 127 pages clean,
  all 10 post URLs + 10 images 200, language switch both ways, listing order monotonic on `/posts/`, `/`, `/zh/`.

**Step B2j — (unplanned) One post out of the analytics/SSO session, plus the tracker wired into three sites.** ✅ Done 2026-09-30

The analytics session (Step E1) produced one flagship post and the material to justify it:

| Slug | Category | pubDate | Commit | Live |
|---|---|---|---|---|
| `one-hostname-public-tracker-sso-dashboard` | `devops` | 2026-09-30 | `54d8cce` | EN + ZH + OG + banner all **200** |

- **Angle:** "public ingest, private dashboard" on **one hostname** — the authentik proxy provider +
  `skip_path_regex` pattern, written up as the *correct* counterpart to `authentik-forward-auth-gate-wasnt-live`
  (which documented the gate that was never live). The two posts cross-reference the same instance from
  opposite directions, which is exactly the compounding an authentik series is supposed to do.
- **Two traps are the post's core value** (both cost real time in this session): (1) cloning a working
  provider that used `mode=forward_single` leaves `internal_host` empty, so the SSO chain is textbook-correct
  while **every app path 404s** — the tell is `x-powered-by: authentik` on the 404; (2) the embedded outpost
  needs **1–2 minutes** to pick up a provider change and answers `302 → /flows/-/default/authentication/`
  plus 404s until it does, which reads as "the wiring is broken".
- Also in the post: why nginx basic auth can never gate this app (the browser carries one `Authorization`
  header, so the app's own bearer token displaces Basic and every API call 401s), the honest trade-offs
  (double login — no OIDC in the app; dashboard is as available as the outpost; one LAN break-glass port),
  and the public-internet verification table (including `POST /api/send` returning an **app-level 400** rather
  than a gate 403 — proof the request reaches the app).
- **Generators committed with the post** (both clean, diffs additive-only 5/0 and 21/0): 3-line `TERMINALS`
  entry, 8-row `BANNERS` entry with the 5-step flow.
- **Verified:** build clean (129 pages, Pagefind 2 languages), 14 content assertions on the deployed pages
  (framing, both traps, CTA, language switch both ways, tracker tag, og + banner), listing order monotonic
  with the new post newest (2026-09-30), Gitea Actions run **122 success**, EN/ZH/OG/banner 200 within a minute.
- ⚠ **Not done:** no synthetic pageview this time — the real-Chrome CDP window (9222) was closed by the time
  the post shipped, and the house rule is to verify analytics with a real browser rather than a headless one.
  The page carries the tracker (asserted in the HTML), so the first real visit is what will show up.

**Tracker now wired into three sites (E1 progress, 2026-09-30)** — the analytics deployment is no longer
"installed, not collecting":

| Site | website ID | Where the snippet lives | Deploy path |
|---|---|---|---|
| `blog.hoelee.com` | `1817d8f6-0e49-4b9a-a50d-307e4f2962c7` | `src/layouts/BaseLayout.astro` (EN + ZH share it) | Gitea Actions, ~1 min |
| `www.digikedai.com` | `61b57143-f3f4-4353-9ede-9c615146de84` | `dsm-resource-management/www/src/layouts/Base.astro` | `npm run build` + `./deploy.sh` (CF Pages) |
| `www.sifumail.com` | `9d76b8aa-486a-4e4a-b344-f1f93e9ba292` | all 4 pages' `<head>` (static site, no shared template) | `scp` to the VPS docroot `/docker/web/www.sifumail.com/public/` |

⚠ **Verification pitfall (cost me a false alarm): Umami drops bot/headless user agents.** The same payload
returns `200 {"beep":"boop"}` and stores **nothing** from `HeadlessChrome`, but `200 {"cache":"…"}` and stores
from a normal Chrome UA — so "0 pageviews after a headless test" is not a bug. Verify with a real browser.

**Step B2k — (unplanned) Two posts out of the reader/book.hoelee.com session: the upstream rewrite, and the front-door pattern.** ✅ Done 2026-10-06

| Slug | Category | pubDate | Live |
|---|---|---|---|
| `the-upstream-was-deleted-then-came-back-rewritten` | `devops` | 2026-10-06 | EN + ZH + OG + banner all **200** |
| `putting-a-front-door-on-an-app-you-cant-modify` | `devops` | **2025-06-24** (backdated) | EN + ZH + OG + banner all **200** |

- **Why these two, from the reader's own setup (stack 136) rather than a generic idea:** the existing coverage of that
  project was the translation post (`adding-english-mode-…`) and the TTS post. The untouched material was (a) the
  dependency's death-and-resurrection and (b) the gateway/front-door packaging pattern.
- ⚠ **The upstream facts changed while the skill still said "dead".** Re-verified live 2026-10-06: `github.com/hectorqin/reader`
  is **alive** — 11,036★ / 5,471 forks / AGPL-3.0 / default branch `main`, last push 2026-10-02 — but it is a
  **from-scratch rewrite**: the git history was re-initialised **2026-09-16** (`chore: 初始化仓库`) and holds **233
  commits**; Kotlin/Spring+Vert.x → **TypeScript/Node**, port 8080 → **5888**, `/storage/data` JSON → **`/data` SQLite**,
  env config → **admin-UI settings in the DB**, image moved to **`cnb.cool/hectorqin/reader:main`** (branch/commit tags,
  deliberately no `:latest`), **0 releases / 0 tags**; Docker Hub `hectorqin/reader` still **404**. Upstream's own P0
  notes admit the **image-pull + container upgrade drill was never run** and legacy-data auto-migration is unimplemented.
  The running deployment is unchanged (`liangnianzhi/reader.hectorqin:latest-20250525`). **The `hectorqin-reader` skill was
  corrected in this session** — a future session must not repeat "upstream is dead, there is no upgrade".
- **Post 1** writes that up as "dead vs rewriting" with the reusable checks (repository health ≠ artifact health; no tags
  ⇒ every upgrade is a SHA; mirror source *and* image; compare the **shape** before the features; read the maintainer's
  "not done yet" list; AGPL-3.0 if you run it for paying users).
- **Post 2** is the gateway pattern: a second `nginx:alpine` container owning the public port, the request-time
  `resolver 127.0.0.11` (so the front page survives the app being down), `client_max_body_size` preserved for uploads,
  why a proxy **body rewrite** cannot touch a client-rendered SPA, the "reload → back to the front door" injection with
  its `sessionStorage.gatePass` consume-step, the app's own CSS hook for whitelabelling, and the **silent-failure** warning
  (the injections depend on the literals `<html lang="en">` and `</head>`).
- ⚠ **Backdating rule applied to post 2 only.** Post 1 is date-pinned (its facts *are* Sept–Oct 2026) so it ships on the
  real date. Post 2 went into the empty **2025-06-25 → 2025-07-07** window at `2025-06-24`, `updatedDate: 2026-10-06`
  so `lastmod` stays honest — and it is constrained to **link backwards only** (it cross-links
  `adding-english-mode-…`, dated 2025-06-11); a forward link to a later-dated post would contradict the backdate.
- **Generators committed with the posts** (both were clean, `deletions: 0`, `node --check` OK) via
  `scripts/append_generator_entries.py`: 4-line `TERMINALS` + 8-row `BANNERS` per slug.
- **Verified after deploy:** build clean (139 pages, Pagefind 2 languages, no duplicate-id warning); `measure_og_banner.py`
  **PASS** on both (og `rows=1 overflow=0 missingHash=0`; banner 8 rows, `delta=2`, `overflow=0`); 8 live URLs 200 with the
  right content types; sitemap **139 URLs**, all four new entries `lastmod 2026-10-06` with hreflang alternates; EN and ZH
  listing rows **monotonic** with the new posts at **#2** (2026-10-06) and **#54** (2025-06-24, between 2025-07-08 and
  2025-06-11); language switch links both ways; CTA links present (Cloudflare rewrites the `mailto:` to `email-protection`
  — expected). Commit `378d55c`, pushed Gitea + GitHub, both remotes **0/0**.
- ⚠ **Reminder for the next session:** the assertion method matters — hrefs must be checked against **raw** HTML, not the
  tag-stripped text (a first pass reported the CTA and cross-links "missing" because tag-stripping removes `href`).

### Phase C — Discovery & structure (Tier 2)

**Step C1 — Per-post custom OG images.** ✅ Done (verified live 2026-09-29)
Every published post serves its own `/og/<slug>.png` (1200×630) generated by `scripts/og-gen/generate.mjs`, with the
category chip derived from frontmatter. Two leftovers only: the shared `og-default.png` still backs the homepage and
category pages (no face — folded into **A1 / E8**), and one post's banner 404s (**E8**).

**Step C2 — Tag pages** (`/tags/[tag]/` archive pages for fine-grained discovery + internal linking).
- [ ] Add tag archive routes (tags currently render as labels only).
- **Done when:** clicking a tag on any post opens a working `/tags/<tag>/` page.

**Step C3 — Categories page shows all 7 categories** (not just those with posts), with "0 posts / coming soon" for empty ones — signals intended coverage. ✅ Done 2026-09-13
- [x] `/categories/` lists all 7 categories with name, description, per-category terminal-style SVG illustration (CategoryArt/Grid components) and a post count; empty ones show "0 posts · coming soon" as a non-link.
- **Done when:** ✅ all 7 render with a placeholder for empty ones + descriptions + illustrations.

**Step C4 — Dedicated `/zh/posts/` and `/zh/categories/` archive pages.** 🔵 In progress
- [x] `/zh/categories/` index + `/zh/categories/[category]/` detail pages live (zh nav "分类" points there; PostList is locale-aware with zh-CN dates).
- [ ] `/zh/posts/` archive still missing — zh nav "文章" falls back to `/zh/` landing. ⚠ Live-measured 2026-09-29: the ZH nav's 「关于」 is **also** wrong (points at `/zh/`, not `/zh/about/`), and `/zh/about/` has **zero inbound links** — see **Step E4**, which folds into this one.
- **Done when:** zh nav links to real `/zh/posts/` + `/zh/categories/` archives.

### Phase D — Polish / later (Tier 3)

**Step D1 — Search.** ✅ Done (verified live 2026-09-29)
Pagefind is shipped: `/pagefind/pagefind.js` → 200, a search toggle in the nav on both locales, and the shards are
correctly `Disallow`ed in `robots.txt`. (Originally deferred until >20 posts.)
**Step D2 — Google Search Console submission.** → merged into **Step E1** (2026-09-29). A `google-site-verification` TXT record already exists on `hoelee.com`, so the GSC domain property exists; what is unconfirmed is whether the blog's sitemap was ever submitted.
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
| Per-post OG images | Josh Comeau | ✅ done (verify 2026-09-29 — §4) |
| Search (once >15–20 posts) | Josh Comeau | ✅ done — Pagefind live (§4) |

---

## 4. Live Audit Snapshot — 2026-09-29 (measured, not assumed)

Method: `curl` from the Windows host (direct curl to blog.hoelee.com **worked** on this date — the DSM fallback was
not needed), cross-checked against the local repo at `D:/dev/hoelee-blog`.

| Check | Measured result |
|---|---|
| Posts | **53 published EN + 53 ZH** (54 files each, 1 draft) — every published post has a ZH twin, no orphans either way |
| Sitemap | `sitemap-index.xml` → `sitemap-0.xml`, **127 URLs** (53 posts + 53 ZH + 19 landing/category + `/posts/`), `lastmod` honest; 254 `xhtml:link` hreflang alternates |
| Internal links | 133 unique internal links across home / `/posts/` / `/categories/` / about / ZH pages → **133 × 200, zero 404s** |
| `robots.txt` | Pure ASCII, allows all crawlers (search **and** AI), `Disallow: /pagefind/`, declares the sitemap |
| Search | **Pagefind live** — `/pagefind/pagefind.js` 200, nav search toggle on both locales (**D1 done**) |
| Per-post OG | Every post serves `/og/<slug>.png`; **1 post has no banner** (`scraping-bot-walled-…`) |
| Analytics | **None at all.** No GA/GTM, Plausible, Umami, Matomo, Clarity, PostHog or CF `beacon.min.js` on home, post, about or ZH pages → **E1** |
| Google Search Console | `hoelee.com` TXT `google-site-verification=g9jeE8…` exists ⇒ a **domain property** already covers the blog. Sitemap submission unverified → **E1** |
| www.hoelee.com | 6 pages, **0 references to `blog.hoelee.com`** (one-way linking) → **E2 (deferred)**. Also `/cv` is now `301 → cloud.hoelee.com` Drive share (GET 200) — the v2.1 "broken /cv" finding is **FIXED**; note `HEAD` still returns 404 (a Pretty Link quirk), so don't re-diagnose it from a HEAD |
| Author identity | Author card is still the letter avatar `<div class="avatar">M</div>` on About **and every post**; no photo anywhere on the site → **A1** |
| ZH nav | 「文章」→ `/zh/` (no `/zh/posts/` route: **404**) and 「关于」→ `/zh/` — while `/zh/about/` is 200 but **orphaned** (zero inbound links) → **E4 / C4** |
| `og:locale` | ZH pages emit `en` + alternate `en_US` → **E5** |
| Homepage | No featured/start-here strip (**A3**). `<title>` says "engineering, DevOps & self-hosting" while the hero says "full-stack developer and DevOps engineer" (**A2**, cosmetic — lowest priority) |
| Caching | `cf-cache-status: DYNAMIC` on a post page; `strict-transport-security: max-age=0` → **E6** |
| Tags | Tags render as plain labels (not links), so `/tags/<tag>/` 404s cause **no broken links** — C2 is a missed-discovery item, not a bug |
| Drafts | Exactly one: `authentik-css-greater-than-bug` (EN + ZH) → **E8** |
| Cadence | 30 posts dated 2026-09; worst single-day stack = **5** (2026-09-18) — the backdating work held, no single-day dump at the top of the feed |
| What did NOT change | The Sept report's platform verdict (Astro static) and its theme advice (AstroPaper) — the platform call still holds; the theme pick is moot because the custom theme already shipped and works |

---

## 5. Conventions (non-negotiable)

- Push git.hoelee.com first, then GitHub
- English-first; **Chinese for every post** (same filename in `posts/zh/` — `post-guideline.md` §8 wins over the older "selective" wording); no Malay
- No overclaiming, especially Web3
- Name identity: "Lee Teong Hoe" / "Mr Hoelee" + same photo + same `sameAs` handles everywhere
- Business framing: website design & development is primary; email hosting is secondary
- English post titles use Title Case
- See `docs/post-guideline.md` for post-writing rules; `docs/content-guide.md` for strategy; `docs/design-guide.md` for UI
