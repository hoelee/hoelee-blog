import type { CollectionEntry } from 'astro:content';

type Post = CollectionEntry<'posts'>;

/**
 * Effective "last updated" timestamp for a post — `updatedDate` when present,
 * else `pubDate`. Used to sort listings newest-first by *update time*, so a
 * revised post resurfaces to the top.
 */
export function updatedAt(post: Post): Date {
  return post.data.updatedDate ?? post.data.pubDate;
}

/** Sort posts newest-first by update time (updatedDate ?? pubDate). */
export function sortByUpdated(posts: Post[]): Post[] {
  return [...posts].sort((a, b) => updatedAt(b).valueOf() - updatedAt(a).valueOf());
}
