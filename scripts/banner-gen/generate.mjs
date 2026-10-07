#!/usr/bin/env node
/**
 * banner-gen — generate a 1600×900 (16:9) banner/hero image for a blog post.
 *
 * Usage:
 *   node scripts/banner-gen/generate.mjs <slug> [--all]
 *
 * Reads the post's frontmatter, fills the template, renders with headless
 * Chrome, and writes public/banners/<slug>.png.
 *
 * Each post's content (titlebar, terminal lines, flow steps) is defined in
 * BANNERS below, keyed by slug. Falls back to a generic default.
 *
 * The post frontmatter then needs `banner: /banners/<slug>.png` so the
 * article renders it above the title ([...slug].astro does this).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

const slug = process.argv[2];
if (!slug) {
  console.error('Usage: node scripts/banner-gen/generate.mjs <slug> | --all');
  process.exit(1);
}

// ---------- per-post banner content ----------
// lines: [{ t: 'cmd'|'dim'|'err'|'ok'|'hl'|'prompt', text }]
// flow: [{ n: '1', label: '...', err?: true }]
const BANNERS = {
  'why-telegram-bot-notifications-die': {
    titlebar: 'root@dsm — carousell-monitor',
    lines: [
      { t: 'dim', text: '2026-09-08 20:45:41' }, { t: 'prompt', text: 'INFO' }, { t: 'cmd', text: 'scraping "uniform" — 49 cards parsed' },
      { t: 'dim', text: '2026-09-08 20:45:42' }, { t: 'prompt', text: 'INFO' }, { t: 'cmd', text: '2 new listings → archiving to NocoDB' },
      { t: 'dim', text: '2026-09-08 20:45:44' }, { t: 'prompt', text: 'WARN' }, { t: 'err', text: 'telegram sendPhoto failed: 400 nginx/1.30.1' },
      { t: 'dim', text: '2026-09-08 20:45:44' }, { t: 'prompt', text: 'WARN' }, { t: 'err', text: 'telegram sendMessage failed: 400 nginx/1.30.1' },
      { t: 'prompt', text: '$', },
      { t: 'cmd', text: 'getent hosts api.telegram.org' },
      { t: 'hl', text: '2001:67c:4e8:f004::9' }, { t: 'dim', text: 'api.telegram.org   ← IPv6 only, no A record' },
      { t: 'prompt', text: '$' },
      { t: 'cmd', text: 'fix = extra_hosts → IPv4 · multipart join → binary-safe' },
      { t: 'prompt', text: '' }, { t: 'ok', text: '→ delivered ✓' },
    ],
    flow: [
      { n: '1', label: 'Collect listings' },
      { n: '2', label: 'sendPhoto 400', err: true },
      { n: '3', label: 'DNS → IPv6 only' },
      { n: '4', label: 'multipart fix' },
      { n: '5', label: 'delivered ✓' },
    ],
  },

  'authentik-major-upgrade-gotchas': {
    titlebar: 'root@dsm — authentik upgrade',
    lines: [
      { t: 'prompt', text: '$' }, { t: 'cmd', text: 'docker compose pull authentik-worker' },
      { t: 'dim', text: 'Pulling authentik:2026.8.1 ... done' },
      { t: 'prompt', text: '$' }, { t: 'cmd', text: 'docker compose up -d && docker logs -f authentik' },
      { t: 'err', text: 'authorization_flow not found · SSO broken' },
      { t: 'dim', text: 'trusted_proxy_cidrs was reset · storage mount changed' },
      { t: 'prompt', text: '$' }, { t: 'cmd', text: 'fix = authorization_flow → authentication_flow' },
      { t: 'prompt', text: '' }, { t: 'ok', text: '→ SSO restored ✓' },
    ],
    flow: [
      { n: '1', label: '2025.8 → 2026.8' },
      { n: '2', label: 'SSO broken', err: true },
      { n: '3', label: 'flow renamed' },
      { n: '4', label: 'trusted proxy' },
      { n: '5', label: 'restored ✓' },
    ],
  },

  'using-chinese-llm-apis-from-malaysia': {
    titlebar: 'root@dsm — llm cost watch',
    lines: [
      { t: 'prompt', text: '$' }, { t: 'cmd', text: 'deepseek-v4-flash · off-peak' },
      { t: 'dim', text: '$0.15 / 1M in · $0.60 / 1M out — cached input ~20× less' },
      { t: 'prompt', text: '$' }, { t: 'cmd', text: 'tokenrhythm ¥68 → GLM-5.3 · Qwen3.8-Max · Kimi K2.7-Code' },
      { t: 'err', text: 'wall: RMB payment · mainland CN phone verification' },
      { t: 'prompt', text: '$' }, { t: 'cmd', text: 'fix = Alipay top-up · email-signup platforms' },
      { t: 'prompt', text: '' }, { t: 'ok', text: '→ ~US$10 credit ≈ a month of agent work ✓' },
    ],
    flow: [
      { n: '1', label: 'RMB via Alipay' },
      { n: '2', label: 'CN phone wall', err: true },
      { n: '3', label: 'OpenAI-compatible key' },
      { n: '4', label: '¥68 credit' },
      { n: '5', label: 'agents run ✓' },
    ],
  },

  'how-i-host-this-blog': {
    titlebar: 'root@unraid — deploy pipeline',
    lines: [
      { t: 'prompt', text: '$' }, { t: 'cmd', text: 'git push origin main' },
      { t: 'dim', text: '→ git.hoelee.com/hoelee/hoelee-blog' },
      { t: 'prompt', text: 'INFO' }, { t: 'cmd', text: 'Gitea Actions → build (Astro 5)' },
      { t: 'prompt', text: 'INFO' }, { t: 'cmd', text: 'npm ci && npm run build → dist/' },
      { t: 'prompt', text: 'INFO' }, { t: 'cmd', text: 'deploy → unRaid runner → nginx' },
      { t: 'ok', text: '✓ served via Cloudflare (cache + SSL)' },
      { t: 'dim', text: 'git-as-CMS · zero-downtime deploy' },
    ],
    flow: [
      { n: '1', label: 'git push' },
      { n: '2', label: 'Gitea Actions' },
      { n: '3', label: 'Astro build' },
      { n: '4', label: 'unRaid nginx' },
      { n: '5', label: 'Cloudflare' },
    ],
  },

  'how-i-built-the-digikedai-telegram-bot': {
    titlebar: 'DigiKedai — AI support bot',
    lines: [
      { t: 'prompt', text: '>' }, { t: 'cmd', text: 'user: "does this course have a free trial?"' },
      { t: 'prompt', text: '¶' }, { t: 'ok', text: 'bot: yes — here\'s your trial account ✓' },
      { t: 'dim', text: '(answered in < 2s, no human in the loop)' },
      { t: 'prompt', text: '>' }, { t: 'cmd', text: 'user: "which package should I buy?"' },
      { t: 'prompt', text: '¶' }, { t: 'ok', text: 'bot: recommends + provisions a free account' },
      { t: 'prompt', text: '$' }, { t: 'cmd', text: 'stack = grammY · LiteLLM · Cloudflare tunnel · 24/7' },
    ],
    flow: [
      { n: '1', label: 'User asks' },
      { n: '2', label: 'grammY webhook' },
      { n: '3', label: 'LiteLLM' },
      { n: '4', label: 'AI answers' },
      { n: '5', label: 'provisions ✓' },
    ],
  },

  'when-smart-says-healthy-but-your-raid-is-corrupting-data': {
    titlebar: 'root@unraid — cache pool scrub',
    lines: [
      { t: 'dim', text: 'btrfs RAID1 · 2× Samsung PM9A3 NVMe · same batch' },
      { t: 'prompt', text: '$' }, { t: 'cmd', text: 'btrfs scrub /mnt/cache' },
      { t: 'err', text: 'csum 0x8941f998 recurring = CRC32C(zero block)' },
      { t: 'prompt', text: '$' }, { t: 'cmd', text: 'self-heal rewrite → does NOT stick' },
      { t: 'err', text: 'write-path corruption · SMART stays clean' },
      { t: 'prompt', text: '$' }, { t: 'cmd', text: 'fix = restore VM + replace both drives' },
    ],
    flow: [
      { n: '1', label: 'SMART clean' },
      { n: '2', label: 'csum zeros', err: true },
      { n: '3', label: 'self-heal no-stick' },
      { n: '4', label: 'restore VM' },
      { n: '5', label: 'replace both ✓' },
    ],
  },

  'self-hosting-mem0-memory-stack': {
    titlebar: 'root@dsm — mem0 memory stack',
    lines: [
      { t: 'prompt', text: '$' }, { t: 'cmd', text: "curl -X POST :20015/memories -H X-Api-Key" },
      { t: 'dim', text: 'user_id + text → mem0 extracts & stores' },
      { t: 'prompt', text: '¶' }, { t: 'ok', text: '→ remembers across sessions ✓' },
      { t: 'prompt', text: '$' }, { t: 'cmd', text: 'stack = mem0-api + LiteLLM + pgvector(pg17)' },
      { t: 'err', text: 'infer=true → LLM hop · slow writes' },
      { t: 'prompt', text: '' }, { t: 'ok', text: 'self-hosted · data stays on LAN ✓' },
    ],
    flow: [
      { n: '1', label: 'POST /memories' },
      { n: '2', label: 'store fact' },
      { n: '3', label: 'search' },
      { n: '4', label: 'feed context' },
      { n: '5', label: 'remembers ✓' },
    ],
  },

  'hardening-a-tor-onion-service': {
    titlebar: 'root@tor-host — onion service audit',
    lines: [
      { t: 'prompt', text: '$' }, { t: 'cmd', text: 'wget -qO- ipv4.icanhazip.com   # from inside the app' },
      { t: 'err', text: '→ home IP returned · iptables block silently gone' },
      { t: 'prompt', text: '$' }, { t: 'cmd', text: 'cap_add: NET_BIND_SERVICE · keep :80' },
      { t: 'err', text: 'listen tcp :80: bind: permission denied · CapEff=0' },
      { t: 'prompt', text: '$' }, { t: 'cmd', text: 'networks: internal:true · port 8080 · SocksPort 0' },
      { t: 'ok', text: '→ bad address ✓ · zero egress ✓ · all containers healthy ✓' },
    ],
    flow: [
      { n: '1', label: 'Audit egress', err: true },
      { n: '2', label: 'internal:true' },
      { n: '3', label: 'non-root :8080' },
      { n: '4', label: 'healthchecks' },
      { n: '5', label: 'verify ✓' },
    ],
  },

  'hello-world': {
    titlebar: '~/hoelee-blog — first commit',
    lines: [
      { t: 'prompt', text: '$' }, { t: 'cmd', text: 'git init hoelee-blog && git add -A' },
      { t: 'prompt', text: '$' }, { t: 'cmd', text: 'git commit -m "Hello, world"' },
      { t: 'ok', text: '[main 0000001] Hello, world ✓' },
      { t: 'dim', text: 'technical writing · self-hosting · build log' },
      { t: 'prompt', text: '$' }, { t: 'cmd', text: 'about → blog.hoelee.com' },
    ],
    flow: [
      { n: '1', label: 'Why this blog' },
      { n: '2', label: 'what I build' },
      { n: '3', label: 'self-hosting' },
      { n: '4', label: 'learn in public' },
    ],
  },

  'why-your-headless-browser-cant-scrape-everything': {
    titlebar: 'root@dsm — headless browser vs anti-bot',
    lines: [
      { t: 'prompt', text: '$' }, { t: 'cmd', text: 'browserless → goofish.com search?q=iPhone15' },
      { t: 'err', text: '非法访问 · "please use a normal browser"' },
      { t: 'dim', text: 'stealth flag · patched navigator.webdriver · real UA → still blocked' },
      { t: 'prompt', text: '$' }, { t: 'cmd', text: 'curl carousell search → parse __PRELOADED_STATE__' },
      { t: 'ok', text: 'listings + price + photos ✓ (no browser, no stealth)' },
      { t: 'hl', text: 'server-rendered JSON ≠ signed async API' },
      { t: 'prompt', text: '' }, { t: 'ok', text: 'read the data path before choosing a tool ✓' },
    ],
    flow: [
      { n: '1', label: 'goofish' },
      { n: '2', label: 'signed API', err: true },
      { n: '3', label: 'carousell' },
      { n: '4', label: 'server JSON', err: false },
      { n: '5', label: 'parsed ✓' },
    ],
  },

  'the-nocodb-attachment-that-wouldnt-update': {
    titlebar: 'root@dsm — nocodb backfill',
    lines: [
      { t: 'prompt', text: '$' }, { t: 'cmd', text: 'PATCH image path = fullsize_url' },
      { t: 'dim', text: '200 OK — but readback still shows the old thumbnail' },
      { t: 'prompt', text: '$' }, { t: 'cmd', text: 'grep image.json | jq .id' },
      { t: 'hl', text: 'id present → NocoDB resolves by id, ignores new path' },
      { t: 'prompt', text: '$' }, { t: 'cmd', text: 'drop id + signedPath · url.replace("_progressive_thumbnail","")' },
      { t: 'prompt', text: '' }, { t: 'ok', text: '300 rows updated ✓' },
    ],
    flow: [
      { n: '1', label: 'patch path' },
      { n: '2', label: 'id keeps old', err: true },
      { n: '3', label: 'strip id' },
      { n: '4', label: 'replace() suffix' },
      { n: '5', label: 'updated ✓' },
    ],
  },

  'how-to-verify-a-hosting-provider-before-you-buy': {
    titlebar: '~/hosting-due-diligence',
    lines: [
      { t: 'prompt', text: '$' }, { t: 'cmd', text: 'whois vps.tld | grep -i created' },
      { t: 'err', text: 'registration: 2026-05 — homepage says \"since 2012\"' },
      { t: 'dim', text: 'a \"since\" claim on a young domain is never verifiable' },
      { t: 'prompt', text: '$' }, { t: 'cmd', text: 'curl AUP | grep -iE \"tor|reverse proxy|tunnel\"' },
      { t: 'hl', text: 'found: \"TOR nodes\", \"anonymizing services\" → hard no' },
      { t: 'prompt', text: '$' }, { t: 'cmd', text: 'trustpilot trend · r/hosting · retention clause' },
      { t: 'prompt', text: '' }, { t: 'ok', text: '→ verdict ✓' },
    ],
    flow: [
      { n: '1', label: 'domain age' },
      { n: '2', label: '\"since\" claim', err: true },
      { n: '3', label: 'read AUP' },
      { n: '4', label: 'reputation' },
      { n: '5', label: 'verdict ✓' },
    ],
  },

  'how-i-vetted-20-vps-providers-with-parallel-subagents': {
    titlebar: '~/vendor-due-diligence — fan-out',
    lines: [
      { t: 'prompt', text: '$' }, { t: 'cmd', text: 'delegate → 3 subagents, 20 providers' },
      { t: 'dim', text: 'batch A: 5 · batch B: 6 · batch C: 9 (parallel)' },
      { t: 'info', text: 'each → WHOIS · AUP · privacy · pricing · reviews' },
      { t: 'prompt', text: '$' }, { t: 'cmd', text: 'merge → one scorecard' },
      { t: 'hl', text: 'aup flags: "TOR nodes" · domain-age mismatch · metered cap' },
      { t: 'prompt', text: '' }, { t: 'ok', text: '→ ~20 providers audited in 3h ✓' },
    ],
    flow: [
      { n: '1', label: 'checklist' },
      { n: '2', label: '3 subagents' },
      { n: '3', label: 'parallel fetch' },
      { n: '4', label: 'scorecard' },
      { n: '5', label: 'verdict ✓' },
    ],
  },

  'automating-cyberpanel-without-the-ui': {
    titlebar: 'root@cyberpanel — reverse-engineering the v2 API',
    lines: [
      { t: 'prompt', text: '$' }, { t: 'cmd', text: 'curl -X POST .../api/verifyConnection' },
      { t: 'err', text: '404 — the /api/ prefix was dropped in v2' },
      { t: 'dim', text: 'docs say adminUser/adminPass · panel says "This request need session."' },
      { t: 'prompt', text: '$' }, { t: 'cmd', text: 'GET / → csrftoken → POST /verifyLogin (X-CSRFToken)' },
      { t: 'hl', text: 'loginStatus: 1 · session cookie set' },
      { t: 'prompt', text: '$' }, { t: 'cmd', text: 'POST /websites/fetchWebsitesList' },
      { t: 'ok', text: '→ all sites + SSL expiry ✓ (no UI)' },
    ],
    flow: [
      { n: '1', label: 'docs 404', err: true },
      { n: '2', label: 'session wall' },
      { n: '3', label: 'CSRF token' },
      { n: '4', label: 'verifyLogin' },
      { n: '5', label: 'sites ✓' },
    ],
  },

  'syncing-a-self-improving-ai-agent-across-machines': {
    titlebar: '~/hermes — sync agent across machines',
    lines: [
      { t: 'prompt', text: '$' }, { t: 'cmd', text: 'git pull --ff-only origin main' },
      { t: 'err', text: 'refusing: local divergence · never --force' },
      { t: 'dim', text: 'distribution repo skills/ is a COPY, not the live dir' },
      { t: 'prompt', text: '$' }, { t: 'cmd', text: 'diff -rq live ~/skills  repo copy' },
      { t: 'hl', text: 'Only in live/: hermes-profile-sync   ← created after last push' },
      { t: 'prompt', text: '$' }, { t: 'cmd', text: 'stage real skills only · commit · push · verify' },
      { t: 'ok', text: '→ edbf7ac on both ends ✓ · 172 skills · 49MB junk stripped' },
    ],
    flow: [
      { n: '1', label: 'pull --ff-only' },
      { n: '2', label: 'diff 3-way', err: true },
      { n: '3', label: 'merge / ask' },
      { n: '4', label: 'push' },
      { n: '5', label: 'verify ✓' },
    ],
  },

'ai-furniture-compositing-with-flux-kontext': {
    titlebar: 'client — furniture compositing PoC',
    lines: [
      { t: 'prompt', text: '$' }, { t: 'cmd', text: 'POST fal-ai/flux-pro/kontext/multi · 2 photos in' },
      { t: 'err', text: 'toDataURL: tainted canvas · may not be exported' },
      { t: 'prompt', text: '$' }, { t: 'cmd', text: 'fix = same-origin paths · enhance_prompt:false · name objects' },
      { t: 'prompt', text: '' }, { t: 'ok', text: '→ 1 staged room out ✓ ($0.04, ~17s)' },
    ],
    flow: [
      { n: '1', label: '2 photos in' },
      { n: '2', label: 'tainted canvas', err: true },
      { n: '3', label: 'same-origin fix' },
      { n: '4', label: 'prompt anchoring' },
      { n: '5', label: '1 room out ✓' },
    ],
  },

  'shipping-an-ai-photo-editor-as-a-wordpress-plugin': {
    titlebar: 'wp-admin — AI Remix Photo plugin',
    lines: [
      { t: 'prompt', text: '$' }, { t: 'cmd', text: 'wp plugin list · hre-ai-remix 0.0.1 → 0.0.22' },
      { t: 'err', text: '404 …/v1admin/photos — rest_url() has no trailing slash' },
      { t: 'dim', text: 'routes in is_admin() ✗ · watermark silent-fallback ✗' },
      { t: 'prompt', text: '$' }, { t: 'cmd', text: "join REST with '/admin/…' · log root cause · warn admin" },
      { t: 'prompt', text: '' }, { t: 'ok', text: '→ 22 releases · 58 commits · 4 were the AI ✓' },
    ],
    flow: [
      { n: '1', label: 'PoC → plugin' },
      { n: '2', label: 'v1admin 404', err: true },
      { n: '3', label: 'silent watermark', err: true },
      { n: '4', label: 'server-side gates' },
      { n: '5', label: '0.0.22 ✓' },
    ],
  },

  'best-ai-video-generators-2026': {
    titlebar: '~/blog — AI video free vs paid 2026',
    lines: [
      { t: 'prompt', text: '$' }, { t: 'cmd', text: 'compare cloud APIs vs open weights' },
      { t: 'err', text: '"free" = 4 different deals · credits ≠ seconds' },
      { t: 'dim', text: 'Sora 2 app gone 04-26 · API sunset 09-24' },
      { t: 'prompt', text: '$' }, { t: 'cmd', text: 'LTX-2.3 via PinkCherry · demo clip ↓' },
      { t: 'prompt', text: '' }, { t: 'ok', text: '→ 11 tools · pricing checked 2026-09-11 ✓' },
    ],
    flow: [
      { n: '1', label: 'free credits' },
      { n: '2', label: 'cloud APIs' },
      { n: '3', label: 'open weights' },
      { n: '4', label: 'LTX-2.3 test' },
      { n: '5', label: 'pick one ✓' },
    ],
  },

  'how-i-made-my-own-songs-with-suno-ai': {
      titlebar: 'hoelee@studio — suno v6 · 7 songs',
      lines: [
        { t: 'prompt', text: '$' }, { t: 'cmd', text: 'write lyrics · craft style prompt (200 chars)' },
        { t: 'prompt', text: 'INFO' }, { t: 'cmd', text: '[Verse][Chorus][Bridge] · [Whispered][Belted]' },
        { t: 'prompt', text: 'INFO' }, { t: 'cmd', text: 'generate 3–5 takes → keep best' },
        { t: 'prompt', text: 'WARN' }, { t: 'err', text: 'AI vocalist mispronounces 忘川 — respell test clip' },
        { t: 'prompt', text: '$' }, { t: 'cmd', text: 'v6: section edit · single-line swap · voices' },
        { t: 'prompt', text: '' }, { t: 'ok', text: '→ 7 songs hosted · embedded above ✓' },
      ],
      flow: [
        { n: '1', label: 'lyrics first' },
        { n: '2', label: 'style prompt' },
        { n: '3', label: 'metatags' },
        { n: '4', label: 'iterate takes' },
        { n: '5', label: 'ship ✓' },
      ],
    },

    'passbolt-hang-three-failure-modes': {
      titlebar: 'root@dsm — passbolt incident',
      lines: [
        { t: 'prompt', text: '$' }, { t: 'cmd', text: 'GET / → 504 Gateway Timeout (every minute, worse under load)' },
        { t: 'prompt', text: 'WARN' }, { t: 'err', text: 'cron: job is still running since ... (1m elapsed)' },
        { t: 'prompt', text: 'WARN' }, { t: 'err', text: 'SMTP Setting errors: fingerprint null' },
        { t: 'prompt', text: '$' }, { t: 'cmd', text: 'fix = bind-mount passbolt.php · full fingerprint · remove ssl.force' },
        { t: 'prompt', text: '' }, { t: 'ok', text: '→ cron 0.4s · UI 302 · healthcheck green ✓' },
      ],
      flow: [
        { n: '1', label: '504 hang' },
        { n: '2', label: 'fingerprint null', err: true },
        { n: '3', label: 'mount config' },
        { n: '4', label: 'redirect loop', err: true },
        { n: '5', label: 'fixed ✓' },
      ],
    },

    'unraid-stop-array-hangs-on-swapfile': {
          titlebar: 'root@unraid — array stop incident',
          lines: [
            { t: 'prompt', text: '$' }, { t: 'cmd', text: 'WebUI → Stop array · swapfile lives on /mnt/cache (btrfs RAID1)' },
            { t: 'prompt', text: 'WARN' }, { t: 'err', text: 'Retry unmounting user shares… · umount: target is busy (every 5s, forever)' },
            { t: 'prompt', text: 'WARN' }, { t: 'err', text: '/proc/swaps lists /dev/loop0 — grep swapfile never matches' },
            { t: 'prompt', text: '$' }, { t: 'cmd', text: 'fix = User Scripts: swapoff -a + losetup -j/-d at stopping_svcs · swapon at disks_mounted' },
            { t: 'prompt', text: '' }, { t: 'ok', text: '→ clean unmount on first try · swap survives stop/start ✓' },
          ],
          flow: [
            { n: '1', label: 'stop array' },
            { n: '2', label: 'EBUSY loop', err: true },
            { n: '3', label: 'losetup -j' },
            { n: '4', label: 'swapoff hook' },
            { n: '5', label: 'clean stop ✓' },
          ],
        },

        'the-cause-was-trim-not-the-ssds': {
                  titlebar: 'root@unraid — ssd pool trim watch',
                  lines: [
                    { t: 'prompt', text: 'WARN' }, { t: 'err', text: 'raw read error rate (failing now) is 19665 — sdd SMART trip' },
                    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'btrfs device stats /mnt/ssd' },
                    { t: 'prompt', text: 'WARN' }, { t: 'err', text: 'corruption_errs sdd1=27 sdb1=31 · csum 0x8941f998 = CRC32C(zeros) · both mirrors' },
                    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'fix = diskAutotrim="off" · remount,nodiscard · scrub' },
                    { t: 'prompt', text: '' }, { t: 'ok', text: '→ scrub #2: corrected 0 · counters flat · cause = queued TRIM firmware bug ✓' },
                  ],
                  flow: [
                    { n: '1', label: 'SMART trip' },
                    { n: '2', label: 'zeros on both mirrors', err: true },
                    { n: '3', label: 'queued TRIM' },
                    { n: '4', label: 'autotrim off' },
                    { n: '5', label: 'scrub clean ✓' },
                  ],
                },

                'that-dying-ssd-was-just-a-bad-sata-cable': {
                  titlebar: 'root@unraid — sdd mkfs attempt',
                  lines: [
                    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'mkfs.btrfs -K -f /dev/sdd1' },
                    { t: 'prompt', text: 'WARN' }, { t: 'err', text: 'ata7.00: WRITE FPDMA QUEUED timeout · NCQ disabled · lost async page write' },
                    { t: 'prompt', text: 'WARN' }, { t: 'err', text: 'ERROR: superblock magic doesn\'t match · smartctl -H timeout' },
                    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'fix = new SATA cable + different port · rerun the same mkfs' },
                    { t: 'prompt', text: '' }, { t: 'ok', text: '→ clean format · 8 GiB fio verify=crc32c err=0 · device stats all zero ✓' },
                  ],
                  flow: [
                    { n: '1', label: '"dying" SSD' },
                    { n: '2', label: 'FPDMA timeouts', err: true },
                    { n: '3', label: 'cable/port swap' },
                    { n: '4', label: 'rerun mkfs' },
                    { n: '5', label: 'clean ✓' },
                  ],
                },
              };

  const DEFAULT_BANNER = {
    titlebar: 'root@host — shell',
    lines: [
      { t: 'prompt', text: '$' }, { t: 'cmd', text: 'engineering · devops · self-hosting' },
      { t: 'prompt', text: '' }, { t: 'ok', text: 'read the full post →' },
    ],
    flow: [
      { n: '1', label: 'start' }, { n: '2', label: 'work' }, { n: '3', label: 'ship' },
    ],
  };

BANNERS['n8n-v1-to-v2-upgrade-gotchas'] = {
  titlebar: 'root@dsm — n8n v1 → v2 migration',
  lines: [
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'docker pull n8nio/n8n:2.40.1 · container up in 90s' },
    { t: 'prompt', text: 'INFO' }, { t: 'cmd', text: 'v1.123.x → v2.40.1 · 17 workflows · 7 active' },
    { t: 'prompt', text: 'WARN' }, { t: 'err', text: 'Telemetry failed schema validation: executions_data_save_on_error' },
    { t: 'prompt', text: 'WARN' }, { t: 'err', text: 'Failed to start Python task runner — Python 3 missing' },
    { t: 'prompt', text: 'WARN' }, { t: 'err', text: 'Sandbox: enabled=false (DB override; env was enabled=true)' },
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'N8N_WEBHOOK_URL · pin TASK_TIMEOUT=300 · pin compression limits' },
    { t: 'prompt', text: 'INFO' }, { t: 'cmd', text: 'storage rename flagged for v3 · migrate + remount together' },
    { t: 'prompt', text: '' }, { t: 'ok', text: '→ 7 deprecations resolved · downstream workflows intact ✓' },
  ],
  flow: [
    { n: '1', label: 'pull v2' },
    { n: '2', label: 'read boot log' },
    { n: '3', label: 'schema reject', err: true },
    { n: '4', label: 'pin defaults' },
    { n: '5', label: 'verified ✓' },
  ],
};

BANNERS['self-healing-digital-goods-entitlements'] = {
  titlebar: 'root@dsm — entitlement lifecycle (W1–W5)',
  lines: [
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'nocodb webhook → n8n compute → alist role scopes' },
    { t: 'prompt', text: 'INFO' }, { t: 'cmd', text: 'desired = union(active purchases, direct grants) · MAX expiry wins' },
    { t: 'prompt', text: 'INFO' }, { t: 'cmd', text: 'shared/effective-grants.js inlined at build · 4 workflows' },
    { t: 'prompt', text: 'WARN' }, { t: 'err', text: 'public hostname: >60s → nginx 504 → 1s retries → pool → 503' },
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'http://nocodb:10380 (30ms, no tunnel) → cascade gone' },
    { t: 'prompt', text: 'INFO' }, { t: 'cmd', text: 'W3 sweeps every 5min · W4 repairs drift 03:00 + verifies' },
    { t: 'prompt', text: 'INFO' }, { t: 'cmd', text: 'W5 public: CORS-locked, minimal fields, no HMAC theatre' },
    { t: 'prompt', text: '' }, { t: 'ok', text: '→ repair verified · reconcile log empty when healthy ✓' },
  ],
  flow: [
    { n: '1', label: 'grant' },
    { n: '2', label: 'expire' },
    { n: '3', label: 'drift', err: true },
    { n: '4', label: 'repair' },
    { n: '5', label: 'verify ✓' },
  ],
};

BANNERS['running-tts-as-a-service-with-token-sidecars'] = {
  titlebar: 'root@dsm — tts service · 1 year uptime',
  lines: [
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'reader → GET /webhook/{mtts,gtts}?pass=…&text=…&speed=…' },
    { t: 'prompt', text: 'INFO' }, { t: 'cmd', text: 'azure speech F0 · google cloud cmn-CN-Wavenet-A' },
    { t: 'prompt', text: 'WARN' }, { t: 'err', text: 'token stored in workflow → 401 after 10min (azure) / 1h (google)' },
    { t: 'prompt', text: '$' }, { t: 'cmd', text: '2 cron sidecars → accesstoken.txt on shared volume' },
    { t: 'prompt', text: 'INFO' }, { t: 'cmd', text: 'refresh 570s / 3500s · margin before expiry' },
    { t: 'prompt', text: 'INFO' }, { t: 'cmd', text: 'map speed 5–50 → -20%…+150% · strip trailing newline' },
    { t: 'prompt', text: 'INFO' }, { t: 'cmd', text: '8 neural voices selected by integer index' },
    { t: 'prompt', text: '' }, { t: 'ok', text: '→ secrets in zero workflows · still running ✓' },
  ],
  flow: [
    { n: '1', label: 'webhook' },
    { n: '2', label: 'read token' },
    { n: '3', label: 'synthesize' },
    { n: '4', label: 'audio/wav' },
    { n: '5', label: '1yr ✓' },
  ],
};

BANNERS['self-hosted-speech-to-text-api'] = {
  titlebar: 'root@gpu-pc — whisper.cpp',
  lines: [
    { t: 'cmd', text: 'netstat -an | grep 20129' },
    { t: 'ok',  text: 'TCP  127.0.0.1:20129  LISTENING   ← only this PC' },
    { t: 'dim', text: 'iPhone · iPad · Android · work PCs ?' },
    { t: 'cmd', text: '--host 0.0.0.0 + firewall -RemoteAddress LocalSubnet' },
    { t: 'ok',  text: 'TCP  0.0.0.0:20129    LISTENING   ← reachable' },
    { t: 'cmd', text: 'n8n gate: Authorization header → per-device key' },
    { t: 'err', text: 'bad key                              → 403' },
    { t: 'hl',  text: '{"text":"…"}  large-v3 on RTX 3060 · 130 wpm' },
  ],
  flow: [
    { n: '1', label: 'phone dictates' },
    { n: '2', label: 'HTTPS + key' },
    { n: '3', label: 'n8n gate' },
    { n: '4', label: 'GPU transcribe' },
    { n: '5', label: '5x typing ✓' },
  ],
};

BANNERS['replacing-rdpguard-with-ipban'] = {
  titlebar: 'root@win11 — ipban service',
  lines: [
    { t: 'cmd', text: 'sc.exe qc IPBAN' },
    { t: 'ok',  text: 'START_TYPE : 2  AUTO_START   ✓' },
    { t: 'dim', text: 'RdpGuard 7.8.7 — paid, closed, 3 versions behind' },
    { t: 'err', text: 'uninstall → rule rdpguard-… deleted → 12 bans LOST' },
    { t: 'cmd', text: 'ban.txt → IPBan import (12 ipv4)' },
    { t: 'ok',  text: 'Updating firewall with 12 entries...' },
    { t: 'err', text: "ipban --install-service → 'Unrecognized command'" },
    { t: 'hl',  text: '16 attackers blocked · zero protection gap' },
  ],
  flow: [
    { n: '1', label: 'export bans' },
    { n: '2', label: 'sc.exe install' },
    { n: '3', label: 'whitelist LAN' },
    { n: '4', label: '16 blocked ✓' },
  ],
};

BANNERS['patching-workbench-26-for-mariadb'] = {
  titlebar: 'root@win11 — workbench 26.7.0',
  lines: [
    { t: 'cmd', text: 'workbench → mariadb 192.168.1.124:3306' },
    { t: 'err', text: 'TypeError: on_session_message() missing 1 arg' },
    { t: 'dim', text: 'the error handler crashed reporting the error' },
    { t: 'err', text: "ERROR 1193: Unknown system variable 'gtid_mode'" },
    { t: 'dim', text: 'MariaDB 10.11 → nversion 101119 · major >= 8 guard passes' },
    { t: 'cmd', text: 'patch replication.py · DbSession.py · SetupTasks.py' },
    { t: 'err', text: "ERROR 1193: 'explain_json_format_version' — again" },
    { t: 'hl',  text: '4 connections · mysqlsh proved the server was fine' },
  ],
  flow: [
    { n: '1', label: 'mysqlsh test' },
    { n: '2', label: 'fix handler' },
    { n: '3', label: '3 patches' },
    { n: '4', label: 'connected ✓' },
  ],
};

BANNERS['why-i-still-bought-a-local-gpu'] = {
  titlebar: 'root@unraid — local inference',
  lines: [
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'llama-server -m qwen3.8-27b-Q6_K.gguf --n-gpu-layers 99' },
    { t: 'dim', text: '24GB VRAM · ~1300 tok/s prefill · 40 tok/s decode' },
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'agent run --task build-from-spec --iterations 50' },
    { t: 'err', text: 'frontier api: 50 calls · metered · quota can change' },
    { t: 'ok',  text: 'local gpu:  50 calls · $0.00 · runs as long as I want' },
    { t: 'hl',  text: 'use the frontier to DECIDE, local compute to BUILD' },
  ],
  flow: [
    { n: '1', label: 'frontier plans' },
    { n: '2', label: 'spec locked' },
    { n: '3', label: 'local agents run' },
    { n: '4', label: '50× iterations' },
    { n: '5', label: 'fixed cost ✓' },
  ],
};

BANNERS['migrating-codeigniter-iis-to-openlitespeed'] = {
  titlebar: 'root@cyberpanel — docroot public/',
  lines: [
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'cp -r app/ public/ → docroot = public_html/public' },
    { t: 'dim', text: 'on IIS these routes only ever answered 302 (SSO) — the code never ran' },
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'curl -sI http://new-host/lifecode' },
    { t: 'err', text: 'Fatal error: Call to undefined function env() · Constants.php' },
    { t: 'err', text: 'Fatal error: Cannot call constructor · Welcome.php' },
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'pure constants only · override initController()' },
    { t: 'prompt', text: '' }, { t: 'ok', text: '→ 19-page A4 report renders ✓' },
  ],
  flow: [
    { n: '1', label: 'IIS → OpenLiteSpeed' },
    { n: '2', label: '500 on /lifecode', err: true },
    { n: '3', label: 'SSO had hidden it' },
    { n: '4', label: 'two fatal fixes' },
    { n: '5', label: 'report renders ✓' },
  ],
};

BANNERS['upgrading-codeigniter-46-to-47'] = {
  titlebar: '~/numerology-report — composer update',
  lines: [
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'composer update codeigniter4/framework' },
    { t: 'ok', text: '4.6.3 → 4.7.4 · upgrade guide read · 8 breaking changes audited' },
    { t: 'dim', text: 'none of the documented changes applied to this codebase' },
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'php spark routes' },
    { t: 'err', text: 'Undefined property: Config\\App::$permittedURIChars' },
    { t: 'err', text: 'Undefined property: Config\\Format::$jsonEncodeDepth' },
    { t: 'ok', text: 'merge project-space configs by hand → routes + report OK ✓' },
  ],
  flow: [
    { n: '1', label: '4.6 → 4.7' },
    { n: '2', label: 'guide: 8 changes' },
    { n: '3', label: 'none applied' },
    { n: '4', label: '2 undefined props', err: true },
    { n: '5', label: 'merge configs ✓' },
  ],
};

BANNERS['read-only-nocodb-dashboard-for-a-remote-database'] = {
  titlebar: 'root@dsm — nocodb · bridge_hoelee',
  lines: [
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'docker exec mysql-server mysql -h192.168.1.124 -e "SELECT CURRENT_USER();"' },
    { t: 'err',  text: 'nocodb_ro@192.168.1.1   ← the host IP, not 172.16.0.4' },
    { t: 'dim',  text: 'container egress is SNAT-ed through the host' },
    { t: 'cmd',  text: 'nocodb → POST /meta/bases/{id}/sources · mysql2' },
    { t: 'hl',   text: 'meta.dbVersion = 10.11.19-MariaDB-ubu2404  → connected' },
    { t: 'prompt', text: '$' }, { t: 'cmd', text: "GRANT SELECT ON appdb.* TO 'nocodb_ro'@'192.168.1.1'" },
    { t: 'err',  text: 'DROP command denied — read-only enforced by the database' },
    { t: 'ok',   text: '4 tables live · 0 rows duplicated ✓' },
  ],
  flow: [
    { n: '1', label: 'NocoDB → VM db' },
    { n: '2', label: 'SNAT → host IP', err: true },
    { n: '3', label: 'SELECT-only grant' },
    { n: '4', label: 'source auto-sync' },
    { n: '5', label: 'live dashboard ✓' },
  ],
};

BANNERS['adding-english-mode-to-a-chinese-only-web-app'] = {
  titlebar: 'root@dsm — reader-gateway · nginx:alpine',
  lines: [
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'curl -s book.hoelee.com/index.html | head -1' },
    { t: 'err',  text: '<html lang="en">   ← but the UI is 100% Chinese' },
    { t: 'dim',  text: 'browsers key the translate prompt off that attribute' },
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'sub_filter  lang="en"  →  lang="zh-CN"' },
    { t: 'hl',   text: 'no API exists to trigger browser translation from JS' },
    { t: 'cmd',  text: 'gate-en.js · 871 zh→en labels · longest-first matching' },
    { t: 'dim',  text: 'MutationObserver follows the Vue re-renders' },
    { t: 'ok',   text: '→ 88% of UI labels English · app untouched ✓' },
  ],
  flow: [
    { n: '1', label: 'Chinese-only SPA' },
    { n: '2', label: 'lang="en" lie', err: true },
    { n: '3', label: 'fix at the proxy' },
    { n: '4', label: 'EN pill + dictionary' },
    { n: '5', label: 'English UI ✓' },
  ],
};

BANNERS['vetting-an-open-source-dependency-before-you-bet-on-it'] = {
  titlebar: 'root@dsm — due diligence · 6 checks',
  lines: [
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'curl -s api.github.com/repos/getcoherence/openpartner' },
    { t: 'dim',  text: 'MIT · created 2026-04 · 8 stars · 15 open issues' },
    { t: 'prompt', text: '$' }, { t: 'cmd', text: "grep -in 'oidc\\|sso\\|saml' README.md ARCHITECTURE.md docs/*.md" },
    { t: 'err',  text: '0 hits   ← the spec assumed OIDC for partner login' },
    { t: 'hl',   text: 'Community: API tokens ✓ · SSO ✗ (Enterprise only)' },
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'selfhost mode · manual payouts · pin the commit' },
    { t: 'ok',   text: '→ 6 assumptions corrected before integration ✓' },
  ],
  flow: [
    { n: '1', label: '1,306-line spec' },
    { n: '2', label: 'repo vital signs' },
    { n: '3', label: 'grep the feature' },
    { n: '4', label: 'tier + rail fit' },
    { n: '5', label: 'fallback decided ✓' },
  ],
};

BANNERS['authentik-forward-auth-gate-wasnt-live'] = {
  titlebar: 'root@dsm — forward-auth · two ingress layers',
  lines: [
    { t: 'prompt', text: '$' }, { t: 'cmd', text: "curl -sk -H 'Host: app.example.com' https://localhost/" },
    { t: 'err',  text: '302 → /outpost.goauthentik.io/start   ← looks gated' },
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'curl -sI https://app.example.com/' },
    { t: 'err',  text: 'x-powered-by: Express   ← the app answered, not the outpost' },
    { t: 'hl',   text: 'the tunnel rule went straight to the container — nginx never saw the request' },
    { t: 'dim',  text: 'grep -c "proxy_pass :10000"  →  11 vhosts share that port' },
    { t: 'cmd',  text: 'verify from outside · read which layer replied' },
    { t: 'ok',   text: '→ one line to revert · ten gates left intact ✓' },
  ],
  flow: [
    { n: '1', label: 'vhost → outpost' },
    { n: '2', label: 'tunnel → app', err: true },
    { n: '3', label: 'x-powered-by told' },
    { n: '4', label: 'count the port' },
    { n: '5', label: 'gate verified ✓' },
  ],
};

BANNERS['nocodb-sso-is-a-licensed-feature'] = {
  titlebar: 'root@dsm — nocodb CE 2026.09.0',
  lines: [
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'NC_SSO=oidc  NC_SSO_OIDC_ISSUER=https://auth…' },
    { t: 'dim',  text: 'enforced at boot — the vars are wired in, not vestigial' },
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'docker run --name nc-sso-test -p 10399:8080  (no NC_DB → SQLite)' },
    { t: 'err',  text: 'curl /auth/oidc  →  ### UNCAUGHT EXCEPTION ###  exits(1)' },
    { t: 'hl',   text: 'one unauthenticated GET is enough to stop the instance' },
    { t: 'dim',  text: 'CE mode · meta=MySQL (licensing needs Postgres) · fork 0.255.2' },
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'gate at the edge instead · prod container never touched' },
    { t: 'ok',   text: '→ OIDC SSO is Business+ · one sentence, not an afternoon ✓' },
  ],
  flow: [
    { n: '1', label: 'NC_SSO vars', err: true },
    { n: '2', label: 'throwaway box' },
    { n: '3', label: '/auth/oidc dies' },
    { n: '4', label: 'licence + Postgres' },
    { n: '5', label: 'edge gate ✓' },
  ],
};

BANNERS['why-chrome-forgets-its-tabs-in-a-container'] = {
  titlebar: 'root@dsm — chrome · CDP 9222 · session restore',
  lines: [
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'docker restart chrome' },
    { t: 'err',  text: '["chrome://newtab/"]   ← every tab gone' },
    { t: 'dim',  text: 'restore_on_startup=1 · RestoreOnStartup policy  ✓ both set' },
    { t: 'err',  text: 'exit_type=Crashed  ← the browser never exits cleanly' },
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'tabs_keeper.py · snapshot 60s · replay /json/new' },
    { t: 'ok',   text: '→ restored 2/2 tabs ✓' },
  ],
  flow: [
    { n: '1', label: 'blank tab' },
    { n: '2', label: 'flag ✗' },
    { n: '3', label: 'preference ✗' },
    { n: '4', label: 'policy ✗' },
    { n: '5', label: 'keeper ✓' },
  ],
};

BANNERS['smartctl-exit-code-32-skips-the-disks-that-matter'] = {
  titlebar: 'root@unraid — disk health · textfile collector',
  lines: [
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'for dev in /dev/sd?; do smartctl -A "$dev"' },
    { t: 'err',  text: 'rc=32   ← "OK, but attributes were below threshold"' },
    { t: 'dim',  text: 'treated as unreadable → disk skipped' },
    { t: 'err',  text: '2 of 4 SSDs missing · the marginal ones' },
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'fatal=$(( rc & ~(32 | 64) ))  · rc as a metric' },
    { t: 'ok',   text: '→ 4/4 disks collected ✓' },
  ],
  flow: [
    { n: '1', label: 'rc=32', err: true },
    { n: '2', label: 'skip ✗' },
    { n: '3', label: '2/4 disks' },
    { n: '4', label: 'mask bits' },
    { n: '5', label: '4/4 ✓' },
  ],
};

BANNERS['why-your-grafana-dashboard-shows-no-data'] = {
  titlebar: 'root@grafana — 41 panels · No data',
  lines: [
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'curl -s prometheus:9090/api/v1/targets' },
    { t: 'ok',   text: 'all 7 targets: up' },
    { t: 'err',  text: 'every panel: "No data"' },
    { t: 'dim',  text: 'my check substituted the values by hand ✓  ← bug invisible' },
    { t: 'prompt', text: '$' }, { t: 'cmd', text: '$nodename = label_values(...{nodename=~"$nodename"})' },
    { t: 'err',  text: '← variable filters on itself → 0 options' },
    { t: 'ok',   text: '→ no self-reference + saved current · 21/25 ✓' },
  ],
  flow: [
    { n: '1', label: 'targets up' },
    { n: '2', label: 'panels ✗' },
    { n: '3', label: 'variables' },
    { n: '4', label: 'self-ref' },
    { n: '5', label: '21/25 ✓' },
  ],
};

BANNERS['your-disk-full-alert-is-lying'] = {
  titlebar: 'root@monitor — alert rules · 16 total',
  lines: [
    { t: 'err',  text: 'ALERT filesystem >90% · 500 GB still free' },
    { t: 'err',  text: 'ALERT memory >90% used · 4.8 GB available' },
    { t: 'err',  text: 'ALERT CPU steal >25% · host fine at 41%' },
    { t: 'dim',  text: 'always true · never actionable' },
    { t: 'dim',  text: 'and each one trains you to skim' },
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'alert on the consequence, not the ratio' },
    { t: 'ok',   text: '→ free <25 GB · MemAvailable <512 MB ✓' },
  ],
  flow: [
    { n: '1', label: '% full ✗', err: true },
    { n: '2', label: '% used ✗', err: true },
    { n: '3', label: 'steal ✗' },
    { n: '4', label: 'absolute' },
    { n: '5', label: 'silent ✓' },
  ],
};

BANNERS['one-prometheus-for-unraid-synology-and-a-vps'] = {
  titlebar: 'root@unraid — prometheus · 7 targets · 25.5k series',
  lines: [
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'sum(node_filesystem_size_bytes)' },
    { t: 'err',  text: '64 TB "total"  ← one NAS volume counted 3×' },
    { t: 'err',  text: 'KVM guest: no cpufreq → 0 series' },
    { t: 'err',  text: 'nodename = 9f9afcccc962  ← container ID' },
    { t: 'dim',  text: 'cAdvisor: systemd slices reported as containers' },
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'dedup · textfile · hostname pin' },
    { t: 'ok',   text: '→ 47 cores · 158 GHz · 142 GB · 155 containers ✓' },
  ],
  flow: [
    { n: '1', label: '3 views', err: true },
    { n: '2', label: 'dedup ✓' },
    { n: '3', label: 'guest gap' },
    { n: '4', label: 'textfile' },
    { n: '5', label: 'one screen ✓' },
  ],
};

BANNERS['synology-spreadsheet-api-is-a-container'] = {
  titlebar: 'root@dsm — office suite api',
  lines: [
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'curl .../SYNO.API.Info&query=all' },
    { t: 'ok',   text: '1515 APIs · SYNO.Office has no cell endpoint' },
    { t: 'err',  text: '→ "the NAS has no spreadsheet API"   ← wrong' },
    { t: 'dim',  text: 'synopkg is_onoff SynologyDrive' },
    { t: 'err',  text: 'not turned on  ← while its daemons were serving traffic' },
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'docker pull synology/spreadsheet-api:3.4.1' },
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'POST /spreadsheets/authorize' },
    { t: 'err',  text: '401 Unauthorized · host must be an FQDN with a valid cert' },
    { t: 'ok',   text: '→ read · write · csv · xlsx ✓' },
  ],
  flow: [
    { n: '1', label: '1515 APIs' },
    { n: '2', label: 'no endpoint', err: true },
    { n: '3', label: 'it is a container' },
    { n: '4', label: '401 to FQDN' },
    { n: '5', label: 'cells ✓' },
  ],
};

BANNERS['synology-api-401-with-the-correct-password'] = {
  titlebar: 'root@dsm — authorize · 401',
  lines: [
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'POST /spreadsheets/authorize · correct password' },
    { t: 'err',  text: '401 {"error":"Unauthorized"}' },
    { t: 'dim',  text: 'host = 192.168.1.1:5001   ← cert does not match the IP' },
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'host = cloud.example.com · protocol = https' },
    { t: 'ok',   text: '200 → token · JWT · 28 days ✓' },
    { t: 'dim',  text: '2FA account: no OTP field in AuthorizationBody' },
    { t: 'err',  text: '→ 401 on every host, every correct password' },
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'use a dedicated service account, 2FA off' },
  ],
  flow: [
    { n: '1', label: '401', err: true },
    { n: '2', label: 'password fine' },
    { n: '3', label: 'host / cert' },
    { n: '4', label: 'FQDN + https' },
    { n: '5', label: 'token ✓' },
  ],
};

BANNERS['reading-a-containers-own-api-docs'] = {
  titlebar: 'root@dsm — the image is the source of truth',
  lines: [
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'docker run --rm --entrypoint cat $IMG /app/public/openapi.yml' },
    { t: 'ok',   text: 'OpenAPI 3.1 · 15 endpoints · AuthorizationBody schema' },
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'entrypoint grep $IMG -rhoE process.env.[A-Z_]+ /app/dist' },
    { t: 'hl',   text: 'AUTH_SECRET · PORT · HOST · USER_TIMEOUT · WORKER_TIMEOUT' },
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'curl registry-1.docker.io/v2/.../blobs/<config>' },
    { t: 'dim',  text: 'Entrypoint: docker-entrypoint.sh   Cmd: node dist/index.js' },
    { t: 'ok',   text: '→ contract known before pulling a byte ✓' },
  ],
  flow: [
    { n: '1', label: 'docs gated' },
    { n: '2', label: 'cat the spec' },
    { n: '3', label: 'grep env vars' },
    { n: '4', label: 'registry blob' },
    { n: '5', label: 'contract ✓' },
  ],
};

BANNERS['fully-on-chain-svg-nfts'] = {
  titlebar: 'foundry — sepolia · the art lives in the contract',
  lines: [
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'forge script script/DeployMoodNft.s.sol --broadcast' },
    { t: 'prompt', text: 'IPFS' }, { t: 'err', text: 'BasicNft stores a URI — art depends on a pin + a gateway' },
    { t: 'prompt', text: 'ON-CHAIN' }, { t: 'cmd', text: 'Base64.encode(vm.readFile("img/smile.svg")) at deploy' },
    { t: 'prompt', text: 'DEPLOY' }, { t: 'ok', text: 'BasicNft@0x84F0… · 4102 bytes of code · 868,596 gas' },
    { t: 'prompt', text: 'MINT' }, { t: 'cmd', text: 'mintNft() → 181,874 gas · tokenId 0 belongs to the minter' },
    { t: 'prompt', text: 'FLIP' }, { t: 'err', text: 'flipMood(0) by a non-owner → MoodNft__NotOwnerOfToken' },
    { t: 'prompt', text: 'FLIP' }, { t: 'ok', text: 'owner flips → HAPPY ⇄ SAD, straight from on-chain state' },
    { t: 'prompt', text: '' }, { t: 'hl', text: 'metadata + art inside the contract · no gateway lookup' },
  ],
  flow: [
    { n: '1', label: 'draw the SVG' },
    { n: '2', label: 'base64 at deploy' },
    { n: '3', label: 'data: URI metadata' },
    { n: '4', label: 'owner flips mood ✓' },
  ],
};

BANNERS['why-my-on-chain-nft-art-changed-on-windows'] = {
  titlebar: 'windows — one byte rewrites the artwork',
  lines: [
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'vm.readFile("img/smile.svg") → Base64.encode' },
    { t: 'prompt', text: 'WIN' }, { t: 'err', text: 'core.autocrlf rewrites the SVG with CRLF on checkout' },
    { t: 'prompt', text: '$' }, { t: 'cmd', text: "printf 'a\\nb' | base64   → YQpi" },
    { t: 'prompt', text: '$' }, { t: 'cmd', text: "printf 'a\\r\\nb' | base64 → YQ0KYg==" },
    { t: 'prompt', text: 'SILENT' }, { t: 'err', text: 'editor identical · git status clean · forge never warns' },
    { t: 'prompt', text: 'FIX' }, { t: 'cmd', text: 'img/*.svg text eol=lf   in .gitattributes' },
    { t: 'prompt', text: 'SAME' }, { t: 'ok', text: 'Windows and Linux checkouts encode identical bytes' },
    { t: 'prompt', text: '' }, { t: 'hl', text: 'assert the encoded URI in a test — art stays reproducible ✓' },
  ],
  flow: [
    { n: '1', label: 'read the bytes' },
    { n: '2', label: 'CRLF injected' },
    { n: '3', label: 'base64 differs' },
    { n: '4', label: 'eol=lf pinned ✓' },
  ],
};

BANNERS['chainlink-vrf-v2-lottery-contract'] = {
  titlebar: 'anvil — raffle · vrf v2.5 + automation',
  lines: [
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'forge test --match-contract RaffleTest' },
    { t: 'prompt', text: 'VRF' }, { t: 'err', text: 'InsufficientBalance() — the mock subscription held no funds' },
    { t: 'prompt', text: 'FIX' }, { t: 'cmd', text: 'fundSubscription + addConsumer before the tests run' },
    { t: 'prompt', text: 'KEEP' }, { t: 'cmd', text: 'checkUpkeep → true once the interval has elapsed' },
    { t: 'prompt', text: 'DRAW' }, { t: 'cmd', text: 'performUpkeep → requestRandomWords · state = CALCULATING' },
    { t: 'prompt', text: 'VRF' }, { t: 'ok', text: 'fulfillRandomWords → randomWords[0] % players.length' },
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'forge snapshot → the full draw costs 335,011 gas' },
    { t: 'prompt', text: '' }, { t: 'hl', text: 'testnet learning project · not production money-handling code' },
  ],
  flow: [
    { n: '1', label: 'pay to enter' },
    { n: '2', label: 'timer trips upkeep' },
    { n: '3', label: 'VRF returns proof' },
    { n: '4', label: 'winner paid ✓' },
  ],
};

BANNERS['verifying-a-pdf-report-page-by-page'] = {
  titlebar: 'dsm — mPDF vs the browser print',
  lines: [
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'php tools/pdf-verify.php /tmp/report-v10.html --expect=19' },
    { t: 'prompt', text: 'BUG' }, { t: 'err', text: 'page header rendered at 2.5pt — invisible past page 1' },
    { t: 'prompt', text: 'BUG' }, { t: 'err', text: 'stripSheetMargins also clipped .invoice-sheet' },
    { t: 'prompt', text: 'BUG' }, { t: 'err', text: 'footer art off by 30–490pt — absolute only honoured at top level' },
    { t: 'prompt', text: 'FIX' }, { t: 'cmd', text: 'per-sheet render · match only a standalone .sheet rule' },
    { t: 'prompt', text: 'FIX' }, { t: 'cmd', text: 'hoistPinnedArt() + SetHTMLFooter() for the pinned artwork' },
    { t: 'prompt', text: 'PASS' }, { t: 'ok', text: '19/19 pages MATCH · every deviation ≤ 2pt' },
    { t: 'prompt', text: '' }, { t: 'hl', text: '20,225,818 bytes · 19 pages · 10.4s · essence 7 pages PASS' },
  ],
  flow: [
    { n: '1', label: 'render per sheet' },
    { n: '2', label: 'print baseline' },
    { n: '3', label: 'diff geometry' },
    { n: '4', label: '≤ 2pt ✓' },
  ],
};

BANNERS['jpa-version-field-lost-update'] = {
  titlebar: 'spring boot — two editors, one row',
  lines: [
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'GET /api/posts/1 → { id: 1, version: 3 }' },
    { t: 'prompt', text: 'A' }, { t: 'ok', text: 'PUT version 3 → 200 · the row is now version 4' },
    { t: 'prompt', text: 'B' }, { t: 'err', text: 'PUT version 3 → would overwrite A and still answer 200' },
    { t: 'prompt', text: 'FIX' }, { t: 'cmd', text: '@Version on the entity → UPDATE … WHERE version = 3' },
    { t: 'prompt', text: 'JPA' }, { t: 'err', text: 'ObjectOptimisticLockingFailureException' },
    { t: 'prompt', text: 'API' }, { t: 'ok', text: 'PostVersionConflictException → 409 Conflict' },
    { t: 'prompt', text: '$' }, { t: 'cmd', text: './mvnw test → integration test asserts the conflict path' },
    { t: 'prompt', text: '' }, { t: 'hl', text: 'stale writes fail loudly · the client re-reads instead of clobbering' },
  ],
  flow: [
    { n: '1', label: 'read v3' },
    { n: '2', label: 'A saves' },
    { n: '3', label: 'B saves stale' },
    { n: '4', label: '409 ✓' },
  ],
};
BANNERS['one-hostname-public-tracker-sso-dashboard'] = {
  titlebar: 'root@dsm — stats.hoelee.com · authentik outpost',
  lines: [
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'curl -sI https://stats.hoelee.com/script.js' },
    { t: 'ok',   text: '200 — the tracker stays public for every visitor' },
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'curl -sI https://stats.hoelee.com/' },
    { t: 'dim',  text: '302 → auth.hoelee.com/if/flow/auth-stats/   (SSO)' },
    { t: 'err',  text: 'mode=forward_single → app paths 404 behind a "healthy" SSO chain' },
    { t: 'hl',   text: 'in proxy mode the outpost IS the reverse proxy' },
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'skip_path_regex · ^/script\\.js$  ^/api/send  ^/api/heartbeat$' },
    { t: 'ok',   text: 'mode=proxy + internal_host → one hostname, no second subdomain ✓' },
  ],
  flow: [
    { n: '1', label: 'tracker public' },
    { n: '2', label: 'dashboard gated' },
    { n: '3', label: 'one hostname' },
    { n: '4', label: 'skip paths' },
    { n: '5', label: 'verified ✓' },
  ],
};

BANNERS['loop-engineering-without-a-coding-agent'] = {
  titlebar: 'root@hermes — 11 cron loops, 8 with no model',
  lines: [
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'hermes cron list → 11 loops running this machine' },
    { t: 'prompt', text: 'INFO' }, { t: 'cmd', text: '8 of 11: no LLM · script stdout delivered as the notice' },
    { t: 'prompt', text: 'WARN' }, { t: 'err', text: 'agent-mode job: [drift_skip] × 29 runs — silent when broken' },
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'rewrite as plain script · exit 1 = CANNOT MEASURE' },
    { t: 'prompt', text: 'INFO' }, { t: 'cmd', text: 'control probe first · 2-fail threshold · 3-run cooldown' },
    { t: 'prompt', text: 'INFO' }, { t: 'cmd', text: 'state beside the script: run_no · fails · down_since' },
    { t: 'prompt', text: 'INFO' }, { t: 'cmd', text: 'tiers: report only → propose → act inside an allowlist' },
    { t: 'prompt', text: '' }, { t: 'ok', text: '→ 1,618 ticks · 0 false alarms · self-healed a hung VM ✓' },
  ],
  flow: [
    { n: '1', label: 'trigger' },
    { n: '2', label: 'probe' },
    { n: '3', label: 'drift', err: true },
    { n: '4', label: 'verify' },
    { n: '5', label: 'act ✓' },
  ],
};

BANNERS['stop-writing-agent-prompts-for-deterministic-work'] = {
  titlebar: 'root@hermes — deterministic check, no model',
  lines: [
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'registry.npmjs.org/<pkg>/latest  vs  local version' },
    { t: 'prompt', text: 'WARN' }, { t: 'err', text: 'agent mode: [drift_skip] × 29 — died before it could speak' },
    { t: 'prompt', text: '' }, { t: 'dim', text: 'silent-because-healthy  ==  silent-because-crashed' },
    { t: 'prompt', text: '$' }, { t: 'cmd', text: 'rewrite: exit 0 = measured · exit 1 = CANNOT MEASURE' },
    { t: 'prompt', text: 'INFO' }, { t: 'cmd', text: 'script stdout delivered as the notice · no LLM in the path' },
    { t: 'prompt', text: 'INFO' }, { t: 'cmd', text: 'the test: write down what success AND failure print' },
    { t: 'prompt', text: 'INFO' }, { t: 'cmd', text: 'number or string → script · "it depends" → model + verifier' },
    { t: 'prompt', text: '' }, { t: 'ok', text: '→ 8 of 11 loops now carry no model ✓' },
  ],
  flow: [
    { n: '1', label: 'compare' },
    { n: '2', label: 'agent ✗', err: true },
    { n: '3', label: 'script' },
    { n: '4', label: 'exit 1 ≠ silent' },
    { n: '5', label: 'green ✓' },
  ],
};

BANNERS['running-production-infrastructure-solo'] = {
  titlebar: "root@hoe-lee — three hosts, one operator",
  lines: [
    { t: 'prompt', text: "$" }, { t: 'cmd', text: "docker ps — three hosts, one operator" },
    { t: 'prompt', text: "DSM" }, { t: 'cmd', text: "86 containers · 44 stacks — storage, SSO, services" },
    { t: 'prompt', text: "unRaid" }, { t: 'cmd', text: "37 containers · 21 stacks — CI runner, monitoring" },
    { t: 'prompt', text: "VPS" }, { t: 'cmd', text: "39 containers · 13 stacks — mail, public sites" },
    { t: 'prompt', text: "WARN" }, { t: 'err', text: "cAdvisor count inflated · one volume counted three times" },
    { t: 'prompt', text: "$" }, { t: 'cmd', text: "verify_infra.py — re-measure, never remember" },
    { t: 'prompt', text: "" }, { t: 'ok', text: "162 containers · 78 compose stacks ✓" },
    { t: 'prompt', text: "" }, { t: 'dim', text: "a number you cannot re-check is not a number you can defend" },
  ],
  flow: [
    { n: '1', label: "3 hosts" },
    { n: '2', label: "162 ctrs" },
    { n: '3', label: "monitor lied", err: true },
    { n: '4', label: "re-measure" },
    { n: '5', label: "honest ✓" },
  ],
};

BANNERS['the-upstream-was-deleted-then-came-back-rewritten'] = {
  titlebar: "root@dsm — reader · the upstream came back",
  lines: [
    { t: 'prompt', text: "$" }, { t: 'cmd', text: "docker pull hectorqin/reader" },
    { t: 'err', text: "→ 404   the official image is gone from Docker Hub" }, { t: 'prompt', text: "$" },
    { t: 'cmd', text: "git log --oneline | tail -1" }, { t: 'err', text: "233 commits, oldest: 初始化仓库  (2026-09-16)" },
    { t: 'hl', text: "Kotlin/Spring + Vert.x  →  TypeScript/Node · :8080 → :5888" }, { t: 'dim', text: "registry moved to cnb.cool — no tags, no releases" },
    { t: 'prompt', text: "$" }, { t: 'cmd', text: "keep the front door outside the app image" },
    { t: 'ok', text: "→ readers unaffected · migration plan written ✓" },
  ],
  flow: [
    { n: '1', label: "orphaned image" },
    { n: '2', label: "404 on Docker Hub", err: true },
    { n: '3', label: "233 commits, new language" },
    { n: '4', label: "a rewrite = a new app" },
    { n: '5', label: "tested migration plan ✓" },
  ],
};

BANNERS['putting-a-front-door-on-an-app-you-cant-modify'] = {
  titlebar: "root@dsm — reader-gateway · nginx:alpine",
  lines: [
    { t: 'prompt', text: "$" }, { t: 'cmd', text: "curl -s book.example.com/index.html | wc -c" },
    { t: 'err', text: "5879 — a shell: one empty div, everything else drawn by JS" }, { t: 'prompt', text: "$" },
    { t: 'cmd', text: "body-rewrite? · patch the bundle? · fork it?" }, { t: 'err', text: "nothing in the bytes to rewrite" },
    { t: 'hl', text: "a second container owns the public port" }, { t: 'cmd', text: "location = / → my page · location / → the app · resolver at request time" },
    { t: 'dim', text: "app port → 127.0.0.1:7778 · branding via the app's own CSS hook" }, { t: 'ok', text: "→ front page · og card · 中/EN · vendor links gone ✓" },
  ],
  flow: [
    { n: '1', label: "blank login box" },
    { n: '2', label: "client-rendered SPA", err: true },
    { n: '3', label: "gateway container" },
    { n: '4', label: "page + 3 injections" },
    { n: '5', label: "front door ✓" },
  ],
};

BANNERS['every-player-stuttered-the-file-was-fine'] = {
  titlebar: "root@media - the file was blameless",
  lines: [
    { t: 'prompt', text: "$" }, { t: 'cmd', text: "tsconv --file 5YkGHtaduGU" },
    { t: 'dim', text: "container: 5818/5818 frames @ 0.040000 s" }, { t: 'dim', text: "decode: rc=0, zero errors printed" },
    { t: 'err', text: "pictures: 106 frames wrong (SSIM 0.33)" }, { t: 'prompt', text: "$" },
    { t: 'cmd', text: "-hwaccel cuda -c:v av1" }, { t: 'ok', text: "0 wrong frames  SSIM 1.000000" },
    { t: 'hl', text: "gate: structure AND content, then replace" }, { t: 'dim', text: "65/65 affected files re-encoded" },
  ],
  flow: [
    { n: '1', label: "decode" },
    { n: '2', label: "encode" },
    { n: '3', label: "verify" },
    { n: '4', label: "content" },
    { n: '5', label: "replace" },
  ],
};

// ---------- read frontmatter ----------
const postPath = join(ROOT, 'src', 'content', 'posts', `${slug}.md`);
let category = 'devops';
if (existsSync(postPath)) {
  const raw = readFileSync(postPath, 'utf8');
  const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
  const c = fm.match(/^category\s*:\s*(.+)$/m)?.[1]?.trim();
  if (c) category = c.replace(/["']/g, '');
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// render terminal lines
function renderLines(lines) {
  // group into visual lines: each entry has t + text; consecutive dim/prompt/cmd share a row
  let html = '';
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.t === 'prompt') {
      // prompt may be followed by a cmd/err/ok/hl/dim on same row
      const next = lines[i + 1];
      const promptClass = l.text === '$' ? 'prompt' : 'prompt';
      let row = `<span class="${promptClass}">${esc(l.text) || '&nbsp;'}</span>`;
      if (next && next.t !== 'prompt') {
        row += `<span class="${next.t}">${esc(next.text)}</span>`;
        i += 1;
      }
      html += `<div class="line" style="margin-top:6px;">${row}</div>`;
    } else {
      html += `<div class="line" style="margin-top:6px;"><span class="${l.t}">${esc(l.text)}</span></div>`;
    }
    i += 1;
  }
  return html;
}

function renderFlow(flow) {
  let html = '';
  flow.forEach((s, idx) => {
    html += `<div class="step${s.err ? ' err-step' : ''}"><span class="num">${s.n}</span>${esc(s.label)}</div>`;
    if (idx < flow.length - 1) html += `<div class="arrow">→</div>`;
  });
  return html;
}

const cfg = BANNERS[slug] || DEFAULT_BANNER;
const logoPath = 'file:///' + join(ROOT, 'public', 'logo-square.png').replace(/\\/g, '/');

let tpl = readFileSync(join(__dirname, 'template.html'), 'utf8');
tpl = tpl
  .replace('{{CATEGORY}}', esc(category))
  .replace('{{SLUG}}', esc(slug))
  .replace('{{LOGO_PATH}}', logoPath)
  .replace('{{TITLEBAR}}', esc(cfg.titlebar))
  .replace('{{TERMINAL_HTML}}', renderLines(cfg.lines))
  .replace('{{FLOW_HTML}}', renderFlow(cfg.flow));

mkdirSync(join(ROOT, '.og', 'gen'), { recursive: true });
const htmlPath = join(ROOT, '.og', 'gen', `${slug}-banner.html`);
writeFileSync(htmlPath, tpl);

const chrome = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const outPng = join(ROOT, '.og', 'gen', `${slug}-banner.png`);
try {
  execSync(`"${chrome}" --headless --disable-gpu --force-device-scale-factor=1 --window-size=1600,900 --virtual-time-budget=3000 --screenshot="${outPng}" "file:///${htmlPath.replace(/\\/g, '/')}"`, { stdio: 'pipe' });
} catch (e) {
  console.error('Chrome render failed:', e.message);
  process.exit(1);
}

const publicDir = join(ROOT, 'public', 'banners');
mkdirSync(publicDir, { recursive: true });
const finalPng = join(publicDir, `${slug}.png`);
execSync(`copy /Y "${outPng}" "${finalPng}"`, { stdio: 'pipe' });

console.log(`✓ Banner generated: public/banners/${slug}.png`);
console.log(`  category: ${category}`);