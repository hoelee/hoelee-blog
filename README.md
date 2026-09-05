# hoelee-blog

My personal technical blog — where I write about what I build and learn.

Built with [Astro](https://astro.build) + Markdown, deployed via self-hosted Gitea CI/CD to an nginx container on my unRaid server, served through Cloudflare.

## Stack

- **Framework:** Astro 5 (static output)
- **Content:** Markdown + MDX, versioned in git
- **i18n:** English (default) + Chinese (`zh`)
- **CI/CD:** Gitea Actions → `act_runner` on unRaid
- **Host:** nginx on unRaid → Cloudflare tunnel → Cloudflare CDN

## Structure

```
src/
  content/
    posts/          # blog posts (en + zh)
  pages/
    index.astro     # homepage
    posts/[...slug].astro   # post template
    about.astro
  layouts/
    BaseLayout.astro
```

## Write a post

1. Create `src/content/posts/<slug>.md` with frontmatter.
2. Push to `main`.
3. CI builds and deploys automatically.

## Categories

engineering · devops · ai · web3 · tutorials · case-studies · notes
