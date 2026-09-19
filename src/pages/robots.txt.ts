import type { APIRoute } from 'astro';
import { SITE } from '../config';

/**
 * robots.txt - served from the origin so Cloudflare merges its managed
 * block instead of substituting the placeholder Content Signals Policy.
 *
 * Policy: allow everything. This blog is a name-search / GEO play, so
 * classic search, citation engines AND AI training crawlers are all
 * welcome - being cited and being read are both wins.
 * See docs/seo-reference.md (two-lane strategy).
 *
 * ASCII-ONLY on purpose: a UTF-8 em dash in a text/plain file renders as
 * mojibake (e.g. "鈥�") in clients that read it as a legacy codepage.
 */
export const GET: APIRoute = () => {
  const body = `# robots.txt - blog.hoelee.com
# Policy: allow all crawlers. Search, citation and AI training welcome.

User-agent: *
Allow: /

# Pagefind's search shards are build artifacts, not content.
Disallow: /pagefind/

Sitemap: ${SITE.url}/sitemap-index.xml
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
