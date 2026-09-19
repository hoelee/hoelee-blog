import type { APIRoute } from 'astro';
import { SITE } from '../config';

/**
 * robots.txt — served from the origin so Cloudflare merges its managed
 * block instead of substituting the placeholder Content Signals Policy.
 *
 * Policy here: allow classic search (this blog is a name-search / GEO play)
 * and allow the citation crawlers that power AI Overviews / ChatGPT Search /
 * Perplexity, because being cited is the point of the two-lane strategy in
 * docs/seo-reference.md. Block only the training-only harvesters that give
 * no referral traffic back.
 */
export const GET: APIRoute = () => {
  const body = `# robots.txt — blog.hoelee.com
# Policy: index freely. Allow citation/answer engines, block training-only harvesters.

User-agent: *
Allow: /

# Pagefind's search shards are build artifacts, not content.
Disallow: /pagefind/

# AI trainers that send no traffic back (blocked).
User-agent: CCBot
Disallow: /

User-agent: Bytespider
Disallow: /

User-agent: Amazonbot
Disallow: /

User-agent: Applebot-Extended
Disallow: /

# Deliberately ALLOWED (cite us, don't train on us — enforced by Cloudflare
# Content-Signal below): Googlebot / Google-Extended (AI Overviews, Gemini),
# OAI-SearchBot / GPTBot (ChatGPT Search), PerplexityBot, ClaudeBot, Bingbot.

# Content signals: machine-readable preference statements (contentsignals.org).
User-Agent: *
Content-Signal: search=yes, ai-input=yes, ai-train=no

Sitemap: ${SITE.url}/sitemap-index.xml
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
