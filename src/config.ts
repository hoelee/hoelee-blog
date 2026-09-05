// Single source of truth for site identity — used by BaseLayout for
// SEO/JSON-LD. Keep these EXACTLY consistent with LinkedIn / GitHub /
// git.hoelee.com (name-identity is a personal-brand SEO factor).
export const SITE = {
  name: 'Mr Hoelee',
  author: 'Lee Teong Hoe',          // canonical name — same everywhere
  handle: 'Mr Hoelee',
  url: 'https://blog.hoelee.com',
  title: 'Mr Hoelee — engineering, DevOps & self-hosting',
  description:
    'Personal blog of Lee Teong Hoe (Mr Hoelee) — full-stack engineering, DevOps & self-hosting, AI automation, and Web3 experiments.',
  locale: 'en',
  lang: 'en',
  email: 'me@hoelee.com',
  linkedin: 'https://www.linkedin.com/in/hoelee',
  github: 'https://github.com/hoelee',
  gitea: 'https://git.hoelee.com/hoelee',
  website: 'https://www.hoelee.com',
  twitter: '', // add if you have one
} as const;
