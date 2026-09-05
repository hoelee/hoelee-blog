import { defineCollection, z } from 'astro:content';

const posts = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    category: z.enum([
      'engineering',
      'devops',
      'ai',
      'web3',
      'tutorials',
      'case-studies',
      'notes',
    ]),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    // lang is NOT set in frontmatter anymore — it's derived from the folder:
    //   posts/hello-world.md  -> en (flat)
    //   posts/zh/hello-world.md -> zh (subfolder)
    // Explicit link to the other-language version (its full slug, e.g. "zh/how-i-host-this-blog").
    // When absent, the language switch falls back to the section landing page (/ or /zh/).
    translation: z.string().optional(),
    ogImage: z.string().optional(),
  }),
});

export const collections = { posts };
