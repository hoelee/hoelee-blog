import type { CollectionEntry } from 'astro:content';

type Post = CollectionEntry<'posts'>;

/**
 * Newest-first ordering for listings.
 *
 * Ordered by `pubDate` — the date the listing actually *renders* — so the
 * visible order always matches the visible dates. `updatedDate` is only a
 * tiebreak, for stable ordering when two posts share a publish date.
 *
 * Do NOT sort by `updatedDate ?? pubDate` here: listings display `pubDate`,
 * so a revised-and-backdated post would sort by a date it never shows and the
 * list would read out of order (e.g. "January 7, 2026" appearing above
 * "September 13, 2026").
 */
export function sortForListing(posts: Post[]): Post[] {
  return [...posts].sort((a, b) => {
    const byPub = b.data.pubDate.valueOf() - a.data.pubDate.valueOf();
    if (byPub !== 0) return byPub;
    const aUpd = a.data.updatedDate?.valueOf() ?? 0;
    const bUpd = b.data.updatedDate?.valueOf() ?? 0;
    return bUpd - aUpd;
  });
}

/**
 * Effective "last updated" timestamp for a post — `updatedDate` when present,
 * else `pubDate`. Used where *recency of editing* is what matters (e.g.
 * deciding whether a post resurfaced), NOT for rendering order.
 */
export function updatedAt(post: Post): Date {
  return post.data.updatedDate ?? post.data.pubDate;
}
