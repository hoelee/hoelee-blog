import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Post metadata, read straight from the markdown at config-eval time.
// The sitemap is generated in `astro:build:done`, so the config layer resolves
// BEFORE the content collection exists - reading the files directly is the
// supported way to get post dates into `serialize()`.
// ---------------------------------------------------------------------------
const POSTS_DIR = fileURLToPath(new URL('./src/content/posts', import.meta.url));

/** Pull `key: value` pairs out of a markdown frontmatter block. */
function frontmatter(file) {
  const raw = readFileSync(file, 'utf-8');
  const end = raw.indexOf('---', 3);
  const block = end === -1 ? raw : raw.slice(0, end);
  const out = {};
  for (const line of block.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z][A-Za-z0-9_]*):\s*(.+)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

/** Normalize a frontmatter date (2026-09-04) to a sitemap lastmod (W3C). */
function isoDate(d) {
  if (!d) return undefined;
  const t = Date.parse(d);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}

// slug -> { en, zh } ISO dates. EN and ZH twins share a slug, so one entry
// serves both localized URLs; lastmod = the newest of the two.
const postDates = new Map();
{
  const collect = (dir, key) => {
    for (const file of readdirSync(dir, { withFileTypes: true })) {
      if (!file.isFile() || !file.name.endsWith('.md')) continue;
      const slug = file.name.slice(0, -3);
      const fm = frontmatter(join(dir, file.name));
      const date = isoDate(fm.updatedDate ?? fm.pubDate);
      if (!date) continue;
      const entry = postDates.get(slug) ?? {};
      entry[key] = date;
      postDates.set(slug, entry);
    }
  };
  try {
    collect(POSTS_DIR, 'en');
    collect(join(POSTS_DIR, 'zh'), 'zh');
  } catch (e) {
    console.warn('[sitemap] could not read post dates:', e.message);
  }
}

// https://astro.build/config
export default defineConfig({
  site: 'https://blog.hoelee.com',
  trailingSlash: 'always',
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'zh'],
    routing: {
      prefixDefaultLocale: false,
    },
  },
  integrations: [
    sitemap({
      // lastmod lets Google re-crawl content that actually changed instead of
      // falling back to its own heuristics. hreflang alternates in the sitemap
      // are treated as more reliable than the in-page <link rel="alternate">
      // tags when the two disagree, so both are emitted.
      serialize(item) {
        const path = new URL(item.url).pathname;
        const post = path.match(/^\/posts\/(?:zh\/)?([^/]+)\/$/);

        if (post) {
          // Post pages get lastmod; their alternates are the EN/ZH twins.
          const dates = postDates.get(post[1]);
          if (dates) item.lastmod = dates.en > dates.zh ? dates.en : dates.zh ?? dates.en;

          item.links = [
            { lang: 'en', url: `https://blog.hoelee.com/posts/${post[1]}/` },
            { lang: 'zh', url: `https://blog.hoelee.com/posts/zh/${post[1]}/` },
          ];
          return item;
        }

        // Non-post routes: pair the two landing/section pages by pathname.
        // Exception: /posts/ has no /zh/posts/ twin - the Chinese post listing
        // IS the /zh/ homepage (the ZH nav "Posts" points there), so that pair
        // is declared by hand rather than derived.
        const MANUAL = {
          '/posts/': { en: '/posts/', zh: '/zh/' },
          '/zh/': { en: '/posts/', zh: '/zh/' },
        };

        const src = /^\/zh\/(.*)$/.exec(path);
        const pair = MANUAL[path]
          ?? (src ? { en: `/${src[1]}`, zh: path } : { en: path, zh: `/zh/${path.slice(1)}` });

        item.links = [
          { lang: 'en', url: `https://blog.hoelee.com${pair.en}` },
          { lang: 'zh', url: `https://blog.hoelee.com${pair.zh}` },
        ];
        return item;
      },
    }),
  ],
});
