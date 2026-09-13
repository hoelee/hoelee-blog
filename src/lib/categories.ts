/**
 * Category metadata — single source of truth for the 7 official categories.
 * Names + descriptions in EN/ZH, one accent color per category (used by the
 * terminal-style illustration on the categories page).
 *
 * The enum itself stays in src/content.config.ts (zod); this file adds the
 * human-facing copy and ordering for listing pages.
 */

export const CATEGORY_SLUGS = [
  'ai',
  'case-studies',
  'devops',
  'engineering',
  'notes',
  'tutorials',
  'web3',
] as const;

export type CategorySlug = (typeof CATEGORY_SLUGS)[number];

interface CategoryMeta {
  slug: CategorySlug;
  /** Display name (Title Case EN / 中文) */
  name: { en: string; zh: string };
  /** One-paragraph description of what lives in this category */
  blurb: { en: string; zh: string };
  /** Accent color for the category illustration (terminal prompt / glyph) */
  accent: string;
}

export const CATEGORY_META: Record<CategorySlug, CategoryMeta> = {
  ai: {
    slug: 'ai',
    name: { en: 'AI', zh: '人工智能' },
    blurb: {
      en: 'n8n workflows, Telegram bots, local LLMs, the Mem0 memory stack and TTS — AI automations I have actually shipped, mostly on self-hosted hardware.',
      zh: 'n8n 工作流、Telegram 机器人、本地大模型、Mem0 记忆栈与语音合成——真正落地运行过的 AI 自动化，大部分跑在自己托管的基础设施上。',
    },
    accent: '#0e94ff',
  },
  'case-studies': {
    slug: 'case-studies',
    name: { en: 'Case Studies', zh: '案例研究' },
    blurb: {
      en: 'How I built X, end to end: the problem, the debugging story, the fix and the measured result. This is my working portfolio.',
      zh: '「我是如何构建 X」的完整实录：问题、踩坑、修复与可衡量的结果。这是我的实战作品集。',
    },
    accent: '#3fb950',
  },
  devops: {
    slug: 'devops',
    name: { en: 'DevOps', zh: 'DevOps' },
    blurb: {
      en: 'Docker & Portainer, Traefik, Cloudflare tunnels, a ~140-container NAS homelab, backups and monitoring — my most hands-on, differentiated material.',
      zh: 'Docker/Portainer、Traefik、Cloudflare 隧道、约 140 个容器的 NAS 家庭机房、备份与监控——我最硬核、实操最深的领域。',
    },
    accent: '#295cff',
  },
  engineering: {
    slug: 'engineering',
    name: { en: 'Engineering', zh: '工程开发' },
    blurb: {
      en: 'Java & Spring, PHP and WordPress deep dives — how production web applications are really put together, from the code up.',
      zh: 'Java/Spring、PHP 与 WordPress 深度解析——生产级 Web 应用从代码层面开始的真实构建方式。',
    },
    accent: '#7c9cff',
  },
  notes: {
    slug: 'notes',
    name: { en: 'Notes', zh: '随记' },
    blurb: {
      en: 'Short, low-friction entries: fixes, gotchas and link roundups from day-to-day work. Quick reads that save someone an afternoon.',
      zh: '简短速记：问题修复、避坑记录与链接精选，来自日常开发的第一手经验。三分钟读完，省一个下午。',
    },
    accent: '#ff7ab6',
  },
  tutorials: {
    slug: 'tutorials',
    name: { en: 'Tutorials', zh: '教程' },
    blurb: {
      en: 'Beginner-friendly, follow-along how-tos. Copy the commands, run them, get a working result — then understand why it worked.',
      zh: '面向初学者的跟练教程：复制命令、动手运行、得到可用结果——再弄懂它为什么能work。',
    },
    accent: '#f5a524',
  },
  web3: {
    slug: 'web3',
    name: { en: 'Web3', zh: 'Web3' },
    blurb: {
      en: 'Solidity, Foundry, ERC-20/721 — honestly framed learning projects on testnets, not production DeFi.',
      zh: 'Solidity、Foundry、ERC-20/721——在测试网上如实记录的学习项目，而非生产级 DeFi。',
    },
    accent: '#b026ff',
  },
};

/** Ordered list of all categories (alphabetical by slug). */
export const ALL_CATEGORIES: CategoryMeta[] = CATEGORY_SLUGS.map((s) => CATEGORY_META[s]);

/** Safer lookup that tolerates unknown strings (e.g. old post data). */
export function categoryMeta(slug: string): CategoryMeta | undefined {
  return (CATEGORY_META as Record<string, CategoryMeta | undefined>)[slug];
}