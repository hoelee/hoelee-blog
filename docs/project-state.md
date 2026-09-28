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

**Step B2b — Draft bank (written, held as `draft: true`, publish when content runs short).** ✅ Drafted 2026-09-20
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

**Step C3 — Categories page shows all 7 categories** (not just those with posts), with "0 posts / coming soon" for empty ones — signals intended coverage. ✅ Done 2026-09-13
- [x] `/categories/` lists all 7 categories with name, description, per-category terminal-style SVG illustration (CategoryArt/Grid components) and a post count; empty ones show "0 posts · coming soon" as a non-link.
- **Done when:** ✅ all 7 render with a placeholder for empty ones + descriptions + illustrations.

**Step C4 — Dedicated `/zh/posts/` and `/zh/categories/` archive pages.** 🔵 In progress
- [x] `/zh/categories/` index + `/zh/categories/[category]/` detail pages live (zh nav "分类" points there; PostList is locale-aware with zh-CN dates).
- [ ] `/zh/posts/` archive still missing — zh nav "文章" falls back to `/zh/` landing (zh post count already 17, the archive is due).
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
