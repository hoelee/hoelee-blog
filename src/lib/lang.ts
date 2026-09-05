import type { CollectionEntry } from 'astro:content';

/**
 * Derive the post language from its slug path.
 *   posts/hello-world.md    -> 'en'  (flat)
 *   posts/zh/hello-world.md -> 'zh'  (subfolder)
 * English posts stay flat; only Chinese posts use the zh/ subfolder.
 */
export function postLang(slug: string): 'en' | 'zh' {
  return slug.startsWith('zh/') ? 'zh' : 'en';
}

export type Post = CollectionEntry<'posts'>;

/** Filter helper: non-draft English posts (for EN listing pages). */
export const isEn = (p: Post) => !p.data.draft && postLang(p.slug) === 'en';

/** Filter helper: non-draft Chinese posts (for ZH listing pages). */
export const isZh = (p: Post) => !p.data.draft && postLang(p.slug) === 'zh';
