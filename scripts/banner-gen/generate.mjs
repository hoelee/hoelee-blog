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