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
    lang: z.enum(['en', 'zh']).default('en'),
    ogImage: z.string().optional(),
  }),
});

export const collections = { posts };
