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

  'how-to-verify-a-hosting-provider-before-you-buy': `
    <div class="line"><span class="prompt">$</span><span class="cmd">curl -s rdap.org/domain/vps.tld | jq .events</span></div>
    <div class="line"><span class="prompt">&nbsp;</span><span class="err">registration: 2026-05 · \"trusted since 2012\"</span></div>
    <div class="line"><span class="prompt">$</span><span class="cmd">AUP grep tor · reviews · retention</span><span class="fix">→ verdict ✓</span></div>`,
};

const DEFAULT_TERMINAL = `
  <div class="line"><span class="prompt">$</span><span class="cmd">engineering · devops · self-hosting</span></div>
  <div class="line"><span class="prompt">&nbsp;</span><span class="fix">read the full post →</span></div>`;

// ---------- read frontmatter from the post ----------
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

let tpl = readFileSync(join(__dirname, 'template.html'), 'utf8');
tpl = tpl
  .replace('{{TITLE_SIZE}}', String(titleSize))
  .replace('{{LOGO_PATH}}', logoPath)
  .replace('{{CATEGORY}}', esc(category))
  .replace('{{KIND}}', 'DevOps')
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
  execSync(`"${chrome}" --headless --disable-gpu --force-device-scale-factor=1 --window-size=1200,630 --virtual-time-budget=3000 --screenshot="${outPng}" "file:///${htmlPath.replace(/\\/g, '/')}"`, { stdio: 'pipe' });
} catch (e) {
  console.error('Chrome render failed:', e.message);
  process.exit(1);
}

// move to public/og/
const publicDir = join(ROOT, 'public', 'og');
mkdirSync(publicDir, { recursive: true });
const finalPng = join(publicDir, `${slug}.png`);
execSync(`copy /Y "${outPng}" "${finalPng}"`, { stdio: 'pipe' });

console.log(`✓ OG image generated: public/og/${slug}.png`);
console.log(`  title: ${title}`);
console.log(`  category: ${category} | tags: ${tags.join(', ')}`);