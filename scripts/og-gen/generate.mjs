#!/usr/bin/env node
/**
 * og-gen — generate a 1200x630 OG image for a blog post.
 *
 * Usage:
 *   node scripts/og-gen/generate.mjs <slug>
 *
 * Reads the post's frontmatter from src/content/posts/<slug>.md (title,
 * category, tags), fills the HTML template, and renders it to
 * public/og/<slug>.png via headless Chrome.
 *
 * Terminal content (the red "error" line + green "fix" line) is looked up in
 * TERMINALS below by slug; fall back to a generic default if absent.
 *
 * Requirements: Google Chrome installed at the default Windows path.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

const slug = process.argv[2];
if (!slug) {
  console.error('Usage: node scripts/og-gen/generate.mjs <slug>');
  process.exit(1);
}

// ---------- per-post terminal content (tune per post) ----------
// Each entry renders inside the terminal box. Use these tokens:
//   {cmd}  → a normal command line
//   {err}  → a red error line
//   {fix}  → a green fix line
const TERMINALS = {
  'why-telegram-bot-notifications-die': `
    <div class="line"><span class="prompt">$</span><span class="cmd">docker exec monitor python check_notify.py</span></div>
    <div class="line"><span class="prompt">&nbsp;</span><span class="err">telegram sendPhoto failed: 400 nginx/1.30.1</span></div>
    <div class="line"><span class="prompt">$</span><span class="cmd">fix = IPv6 · DNS · multipart</span><span class="fix">→ delivered ✓</span></div>`,

  'hello-world': `
    <div class="line"><span class="prompt">$</span><span class="cmd">git init hoelee-blog · first commit</span></div>
    <div class="line"><span class="prompt">&nbsp;</span><span class="fix">technical writing · self-hosting · build log</span></div>
    <div class="line"><span class="prompt">$</span><span class="cmd">about → blog.hoelee.com</span></div>`,

  'how-i-host-this-blog': `
    <div class="line"><span class="prompt">$</span><span class="cmd">git push origin main</span></div>
    <div class="line"><span class="prompt">&nbsp;</span><span class="fix">Gitea Actions → unRaid runner → nginx → Cloudflare ✓</span></div>
    <div class="line"><span class="prompt">$</span><span class="cmd">git-as-CMS · zero-downtime deploy</span></div>`,

  'how-i-built-the-digikedai-telegram-bot': `
    <div class="line"><span class="prompt">$</span><span class="cmd">user:"does this course have a free trial?"</span></div>
    <div class="line"><span class="prompt">&nbsp;</span><span class="fix">bot → yes, here's your account ✓ (24/7, no human)</span></div>
    <div class="line"><span class="prompt">$</span><span class="cmd">grammY · LiteLLM · Cloudflare tunnel</span></div>`,

  'authentik-major-upgrade-gotchas': `
    <div class="line"><span class="prompt">$</span><span class="cmd">docker compose pull authentik-worker</span></div>
    <div class="line"><span class="prompt">&nbsp;</span><span class="err">authorization_flow not found · SSO broken</span></div>
    <div class="line"><span class="prompt">$</span><span class="cmd">uptime: 2025.8 → 2026.8</span><span class="fix">fixed ✓</span></div>`,

  'why-your-headless-browser-cant-scrape-everything': `
    <div class="line"><span class="prompt">$</span><span class="cmd">browserless → goofish search</span></div>
    <div class="line"><span class="prompt">&nbsp;</span><span class="err">非法访问 · product list stuck "loading…"</span></div>
    <div class="line"><span class="prompt">$</span><span class="cmd">carousell: server-rendered JSON</span><span class="fix">→ parsed ✓</span></div>`,

  'the-nocodb-attachment-that-wouldnt-update': `
    <div class="line"><span class="prompt">$</span><span class="cmd">PATCH image path → 300 rows backfill</span></div>
    <div class="line"><span class="prompt">&nbsp;</span><span class="err">path unchanged · keep the id, keep the old URL</span></div>
    <div class="line"><span class="prompt">$</span><span class="cmd">strip id · replace() suffix</span><span class="fix">→ updated ✓</span></div>`,

  'using-chinese-llm-apis-from-malaysia': `
    <div class="line"><span class="prompt">$</span><span class="cmd">curl tokenrhythm.studio/v1/chat/completions</span></div>
    <div class="line"><span class="prompt">&nbsp;</span><span class="err">403 · mainland CN phone required</span></div>
    <div class="line"><span class="prompt">$</span><span class="cmd">Alipay RMB · OpenAI-compatible key</span><span class="fix">→ ¥68 credit ✓</span></div>`,

  'how-to-verify-a-hosting-provider-before-you-buy': `
      <div class="line"><span class="prompt">$</span><span class="cmd">curl -s rdap.org/domain/vps.tld | jq .events</span></div>
      <div class="line"><span class="prompt">&nbsp;</span><span class="err">registration: 2026-05 · "trusted since 2012"</span></div>
      <div class="line"><span class="prompt">$</span><span class="cmd">AUP grep tor · reviews · retention</span><span class="fix">→ verdict ✓</span></div>`,

    'how-i-vetted-20-vps-providers-with-parallel-subagents': `
      <div class="line"><span class="prompt">$</span><span class="cmd">fan-out → 3 subagents × 20 providers</span></div>
      <div class="line"><span class="prompt">&nbsp;</span><span class="fix">whois · AUP · reviews · retention — in parallel</span></div>
      <div class="line"><span class="prompt">$</span><span class="cmd">merge scorecard · rank · audit trail</span><span class="fix">→ verdict ✓</span></div>`,

  'automating-cyberpanel-without-the-ui': `
    <div class="line"><span class="prompt">$</span><span class="cmd">POST /api/verifyConnection</span></div>
    <div class="line"><span class="prompt">&nbsp;</span><span class="err">404 · API prefix dropped in v2</span></div>
    <div class="line"><span class="prompt">$</span><span class="cmd">csrftoken → /verifyLogin → fetchWebsitesList</span><span class="fix">→ sites ✓</span></div>`,

  'hardening-a-tor-onion-service': `
    <div class="line"><span class="prompt">$</span><span class="cmd">wget -qO- ipv4.icanhazip.com</span></div>
    <div class="line"><span class="prompt">&nbsp;</span><span class="err">bind: permission denied · CapEff=0 on :80</span></div>
    <div class="line"><span class="prompt">$</span><span class="cmd">internal:true · :8080 · SocksPort 0</span><span class="fix">→ zero egress ✓</span></div>`,

  'syncing-a-self-improving-ai-agent-across-machines': `
    <div class="line"><span class="prompt">$</span><span class="cmd">git pull --ff-only origin main</span></div>
    <div class="line"><span class="prompt">&nbsp;</span><span class="err">refusing: local divergence · never --force</span></div>
    <div class="line"><span class="prompt">$</span><span class="cmd">diff -rq live skills · merge on conflict</span><span class="fix">→ synced ✓</span></div>`,

  'best-ai-video-generators-2026': `
    <div class="line"><span class="prompt">$</span><span class="cmd">video_gen --free --compare --2026</span></div>
    <div class="line"><span class="prompt">&nbsp;</span><span class="err">"free" = 4 deals · credits ≠ seconds · Sora 2 sunset 09-24</span></div>
    <div class="line"><span class="prompt">$</span><span class="cmd">fix = LTX-2.3 test embed · pricing checked 2026-09-11</span><span class="fix">→ shipped ✓</span></div>`,

  'ai-furniture-compositing-with-flux-kontext': `
    <div class="line"><span class="prompt">$</span><span class="cmd">fetch fal-ai/flux-pro/kontext/multi · 2 photos in</span></div>
    <div class="line"><span class="prompt">&nbsp;</span><span class="err">toDataURL: tainted canvas · may not be exported</span></div>
    <div class="line"><span class="prompt">$</span><span class="cmd">enhance_prompt:false · same-origin paths</span><span class="fix">→ 1 room out ✓</span></div>`,

  'how-i-made-my-own-songs-with-suno-ai': `
    <div class="line"><span class="prompt">$</span><span class="cmd">suno "indie folk · playful whistles · sprite-girl vocals"</span></div>
    <div class="line"><span class="prompt">&nbsp;</span><span class="fix">lyrics + metatags → 7 songs shipped ✓</span></div>
    <div class="line"><span class="prompt">$</span><span class="cmd">v6: section edits · single-line swaps · voices</span></div>`,

  'passbolt-hang-three-failure-modes': `
    <div class="line"><span class="prompt">$</span><span class="cmd">curl -I https://pass.hoelee.com</span></div>
    <div class="line"><span class="prompt">&nbsp;</span><span class="err">504 · ERR_TOO_MANY_REDIRECTS · fingerprint null</span></div>
    <div class="line"><span class="prompt">$</span><span class="cmd">mount passbolt.php · full fingerprint</span><span class="fix">→ fixed ✓</span></div>`,

  'scraping-bot-walled-marketplace-warm-browser-session': `
    <div class="line"><span class="prompt">$</span><span class="cmd">CDP → shopee search "used phone" · client marketplace monitor</span></div>
    <div class="line"><span class="prompt">&nbsp;</span><span class="err">/verify captcha · empty product cards</span></div>
    <div class="line"><span class="prompt">$</span><span class="cmd">warm session · 7s pacing · sweep.py</span><span class="fix">→ 20+ listings ✓</span></div>`,

  'unraid-stop-array-hangs-on-swapfile': `
      <div class="line"><span class="prompt">$</span><span class="cmd">unraid → stop array · swapfile on /mnt/cache</span></div>
      <div class="line"><span class="prompt">&nbsp;</span><span class="err">umount: target is busy · /proc/swaps says /dev/loop0</span></div>
      <div class="line"><span class="prompt">$</span><span class="cmd">swapoff -a + losetup -j at stopping_svcs</span><span class="fix">→ clean stop ✓</span></div>`,

    'when-smart-says-healthy-but-your-raid-is-corrupting-data': `
        <div class="line"><span class="prompt">$</span><span class="cmd">scrub → re-read vdisk1.img</span></div>
        <div class="line"><span class="prompt">&nbsp;</span><span class="err">csum 0x8941f998 = CRC32C(zeros) · recurring</span></div>
        <div class="line"><span class="prompt">$</span><span class="cmd">self-heal rewrite does NOT stick</span><span class="fix">→ replace both drives ✓</span></div>`,

      'self-hosting-mem0-memory-stack': `
              <div class="line"><span class="prompt">$</span><span class="cmd">curl -X POST :20015/memories · X-Api-Key</span></div>
        <div class="line"><span class="prompt">&nbsp;</span><span class="err">infer=true → LLM hop · slow write</span></div>
        <div class="line"><span class="prompt">$</span><span class="cmd">infer=false · pgvector · LiteLLM gateway</span><span class="fix">→ remembers across chats ✓</span></div>`,

    'shipping-an-ai-photo-editor-as-a-wordpress-plugin': `
      <div class="line"><span class="prompt">$</span><span class="cmd">wp plugin list · hre-ai-remix 0.0.1 → 0.0.22</span></div>
      <div class="line"><span class="prompt">&nbsp;</span><span class="err">404 …/wp-json/hre/v1<span class="hl">admin</span>/photos — rest_url() has no trailing slash</span></div>
      <div class="line"><span class="prompt">$</span><span class="cmd">fix = '/admin/…' · 58 commits · 4 were the AI</span><span class="fix">→ shipped ✓</span></div>`,

    'n8n-v1-to-v2-upgrade-gotchas': `
      <div class="line"><span class="prompt">$</span><span class="cmd">pull n8nio/n8n:2.40.1 · restart · upgrade took 90s</span></div>
      <div class="line"><span class="prompt">&nbsp;</span><span class="err">telemetry schema: executions_data_save_on_error rejected</span></div>
      <div class="line"><span class="prompt">$</span><span class="cmd">read the boot log · pin timeouts + limits</span><span class="fix">→ 7 fixed ✓</span></div>`,

    'self-healing-digital-goods-entitlements': `
      <div class="line"><span class="prompt">$</span><span class="cmd">nocodb → n8n W1–W5 → alist role scopes</span></div>
      <div class="line"><span class="prompt">&nbsp;</span><span class="err">public hostname: 60s latency → nginx 504 → retry storm → 503</span></div>
      <div class="line"><span class="prompt">$</span><span class="cmd">http://nocodb:10380 · 30ms · W4 repairs drift 03:00</span><span class="fix">→ self-healing ✓</span></div>`,

    'running-tts-as-a-service-with-token-sidecars': `
      <div class="line"><span class="prompt">$</span><span class="cmd">reading app → GET /webhook/mtts?pass=…&text=…</span></div>
      <div class="line"><span class="prompt">&nbsp;</span><span class="err">azure token expires in ~10min · google in ~1h</span></div>
      <div class="line"><span class="prompt">$</span><span class="cmd">2 cron sidecars write accesstoken.txt · 570s / 3500s</span><span class="fix">→ 1 year uptime ✓</span></div>`,

    'the-cause-was-trim-not-the-ssds': `
      <div class="line"><span class="prompt">$</span><span class="cmd">btrfs device stats /mnt/ssd</span></div>
      <div class="line"><span class="prompt">&nbsp;</span><span class="err">corruption_errs sdd1=27 sdb1=31 · csum 0x8941f998 = CRC32C(zeros) · both mirrors</span></div>
      <div class="line"><span class="prompt">$</span><span class="cmd">diskAutotrim="off" · remount,nodiscard · scrub</span><span class="fix">→ 0 new errors ✓</span></div>`,

    'that-dying-ssd-was-just-a-bad-sata-cable': `
      <div class="line"><span class="prompt">$</span><span class="cmd">mkfs.btrfs -K -f /dev/sdd1</span></div>
      <div class="line"><span class="prompt">&nbsp;</span><span class="err">WRITE FPDMA QUEUED timeouts · superblock magic doesn't match</span></div>
      <div class="line"><span class="prompt">$</span><span class="cmd">swap SATA cable/port · rerun mkfs</span><span class="fix">→ clean · 0 errors ✓</span></div>`,
  };

TERMINALS['self-hosted-speech-to-text-api'] = `
    <div class="line"><span class="prompt">$</span><span class="cmd">whisper-server --host 0.0.0.0 --port 20129 · large-v3 · RTX 3060</span></div>
    <div class="line"><span class="prompt">&nbsp;</span><span class="err">connect ETIMEDOUT 192.168.1.123:20129 — bound to 127.0.0.1 only</span></div>
    <div class="line"><span class="prompt">$</span><span class="cmd">bind 0.0.0.0 · firewall LocalSubnet · n8n key gate</span><span class="fix">→ 130 wpm ✓</span></div>`;

TERMINALS['replacing-rdpguard-with-ipban'] = `
    <div class="line"><span class="prompt">$</span><span class="cmd">ipban --install-service</span></div>
    <div class="line"><span class="prompt">&nbsp;</span><span class="err">Unrecognized command or argument '--install-service'</span></div>
    <div class="line"><span class="prompt">$</span><span class="cmd">sc.exe create IPBAN type= own start= auto binPath= ...</span><span class="fix">→ AUTO_START ✓</span></div>`;

TERMINALS['patching-workbench-26-for-mariadb'] = `
    <div class="line"><span class="prompt">&nbsp;</span><span class="err">TypeError: on_session_message() missing 1 required argument</span></div>
    <div class="line"><span class="prompt">$</span><span class="cmd">select @@gtid_mode · MariaDB 10.11</span></div>
    <div class="line"><span class="prompt">&nbsp;</span><span class="err">ERROR 1193: Unknown system variable 'gtid_mode'</span></div>
    <div class="line"><span class="prompt">$</span><span class="cmd">3 patches · 4 connections</span><span class="fix">→ connected ✓</span></div>`;

const DEFAULT_TERMINAL = `
  <div class="line"><span class="prompt">$</span><span class="cmd">engineering · devops · self-hosting</span></div>
  <div class="line"><span class="prompt">&nbsp;</span><span class="fix">read the full post →</span></div>`;

TERMINALS['why-i-still-bought-a-local-gpu'] = `
    <div class="line"><span class="prompt">$</span><span class="cmd">agent run --task build-from-spec --iterations 50</span></div>
    <div class="line"><span class="prompt">&nbsp;</span><span class="err">api: 50 calls · $12.40 · quota may change</span></div>
    <div class="line"><span class="prompt">&nbsp;</span><span class="fix">local: 50 calls · $0.00 · runs on my card</span></div>
`;

// ---------- read frontmatter ----------
const postPath = join(ROOT, 'src', 'content', 'posts', `${slug}.md`);
if (!existsSync(postPath)) {
  console.error(`Post not found: ${postPath}`);
  process.exit(1);
}
const raw = readFileSync(postPath, 'utf8');
const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
const get = (key) => {
  const m = fm.match(new RegExp(`^${key}\\s*:\\s*(.+)$`, 'm'));
  if (!m) return undefined;
  let v = m[1].trim();
  // strip quotes
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
  return v;
};
const title = get('title') || slug.replace(/-/g, ' ');
const category = get('category') || 'devops';
const tagsRaw = get('tags') || '[]';
let tags = [];
// tags is a YAML flow array: [docker, telegram, "cloudflare"]
const stripped = tagsRaw.replace(/^\[|\]$/g, '');
tags = stripped
  .split(',')
  .map((s) => s.trim().replace(/^["']|["']$/g, ''))
  .filter(Boolean);

// ---------- build template substitutions ----------
// split the long title into two balanced lines for readability
const words = title.split(' ');
const mid = Math.ceil(words.length / 2);
const line1 = words.slice(0, mid).join(' ');
const line2 = words.slice(mid).join(' ');
// escape HTML
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// title size: short titles can be larger
const titleLen = title.length;
const titleSize = titleLen > 60 ? 40 : titleLen > 40 ? 46 : 52;
const titleHtml = `${esc(line1)}<br>${esc(line2)}`;

const terminalHtml = TERMINALS[slug] || DEFAULT_TERMINAL;

const tagsHtml = tags.map((t) => `<span>#${esc(t)}</span>`).join('');

const logoPath = 'file:///' + join(ROOT, 'public', 'logo-square.png').replace(/\\/g, '/');

// the tag chip shows "<category> · <kind>"; kind is a human label for the section.
// Were KIND to be hardcoded, every non-devops post would carry a wrong label.
const KIND_BY_CATEGORY = {
  engineering: 'Engineering',
  devops: 'DevOps',
  ai: 'AI',
  web3: 'Web3',
  tutorials: 'Tutorials',
  'case-studies': 'Case Study',
  notes: 'Notes',
};
const kind = KIND_BY_CATEGORY[category] || category;

let tpl = readFileSync(join(__dirname, 'template.html'), 'utf8');
tpl = tpl
  .replace('{{TITLE_SIZE}}', String(titleSize))
  .replace('{{LOGO_PATH}}', logoPath)
  .replace('{{CATEGORY}}', esc(category === kind.toLowerCase() ? category : kind))
  .replace('{{KIND}}', '')
  .replace('{{TITLE_HTML}}', titleHtml)
  .replace('{{TERMINAL_HTML}}', terminalHtml)
  .replace('{{TAGS_HTML}}', tagsHtml);

// write temp html
mkdirSync(join(ROOT, '.og', 'gen'), { recursive: true });
const htmlPath = join(ROOT, '.og', 'gen', `${slug}.html`);
writeFileSync(htmlPath, tpl);

// render with headless Chrome
const chrome = process.env.CHROME_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const outPng = join(ROOT, '.og', 'gen', `${slug}.png`);
try {
  execSync(`"${chrome}" --headless --disable-gpu --force-device-scale-factor=1 --window-size=1200,900 --virtual-time-budget=3000 --screenshot="${outPng}" "file:///${htmlPath.replace(/\\/g, '/')}"`, { stdio: 'pipe' });
} catch (e) {
  console.error('Chrome render failed:', e.message);
  process.exit(1);
}

// move to public/og/
const publicDir = join(ROOT, 'public', 'og');
mkdirSync(publicDir, { recursive: true });
const finalPng = join(publicDir, `${slug}.png`);

sharp(outPng)
  .extract({ left: 0, top: 0, width: 1200, height: 630 })
  .toFile(finalPng)
  .then(() => {
    console.log(`✓ OG image generated: public/og/${slug}.png`);
  })
  .catch((e) => {
    console.error('crop failed:', e.message);
    process.exit(1);
  });
console.log(`  title: ${title}`);
console.log(`  category: ${category} | tags: ${tags.join(', ')}`);