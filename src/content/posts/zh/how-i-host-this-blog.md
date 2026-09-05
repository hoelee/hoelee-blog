---
title: "我是如何托管这个博客的：Astro、Gitea Actions 与自托管 CI/CD"
description: "这篇文章完整拆解了这个网站背后的构建与部署管线——以 Git 作为 CMS、跑在 unRaid 服务器上的自托管 runner，以及最前端的 Cloudflare。"
pubDate: 2026-09-06
category: case-studies
tags: [astro, gitea, ci-cd, self-hosting, docker, cloudflare]
---

这个博客本身，就是我用来说明「我到底会做什么」的一个项目。下面是完整的
管线，让整个架构一目了然。源代码公开在
[git.hoelee.com/hoelee/hoelee-blog](https://git.hoelee.com/hoelee/hoelee-blog)，
可以对照着这篇文章一起看。

## 技术栈

- **Astro 5** —— 从 Markdown 生成静态站点。
- **Git 即 CMS** —— 每一篇文章都是一个带 YAML frontmatter 的 `.md` 文件，版本管理在 Gitea 里。
- **Gitea Actions** —— 一个跑在我 unRaid 服务器上的自托管 CI runner（`act_runner`），每次 push 到 `main` 都会自动构建站点。
- **nginx** —— 一个独立的容器负责对外提供静态的 `dist/` 输出。
- **Cloudflare** —— 隧道把它暴露到公网，CDN 负责缓存一切。

## 为什么选「静态 + Git」？

技术博客没有任何动态内容。用 Markdown 写作、用 pull request 评审、合并后重新构建，带给我的是：

1. 我发布过的每一个字的完整版本历史。
2. 没有需要加固、打补丁的数据库或后台管理面板。
3. 接近完美的性能——预构建的 HTML，没有任何服务端渲染。

## 部署流程

```
git push → Gitea webhook → act_runner 领取任务
  → npm ci → astro build → 拷贝 dist/* 到站点根目录 → nginx 提供服务
```

整个过程都跑在我 homelab 自己的硬件上——这正是重点：它就是我别处所描述的
DevOps 工作的一个活生生的演示。

## docker-compose 配置

下面是这套栈的大致形态。这是本地/源站这一侧（Gitea + runner + nginx）；
公网暴露由 Cloudflare 通过隧道单独处理，所以这里的任何东西都不需要公网 IP
或开放端口。

```yaml
# docker-compose.yml — Gitea + act_runner + nginx（博客站点根目录）
services:
  gitea:
    image: gitea/gitea:1.27
    container_name: gitea
    environment:
      - USER_UID=1000
      - USER_GID=1000
    volumes:
      - ./gitea-data:/data
      - /etc/timezone:/etc/timezone:ro
      - /etc/localtime:/etc/localtime:ro
    ports:
      - "3000:3000"
      - "2222:22"          # SSH（可选——我用 HTTPS）
    restart: unless-stopped

  act_runner:
    image: gitea/act_runner:0.2.13
    container_name: act_runner
    environment:
      - GITEA_INSTANCE_URL=http://gitea:3000
      - GITEA_RUNNER_REGISTRATION_TOKEN=${RUNNER_TOKEN}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock   # runner 需要它来拉起构建任务
      - ./runner-data:/data
    depends_on:
      - gitea
    restart: unless-stopped

  nginx-blog:
    image: nginx:alpine
    container_name: nginx-blog
    volumes:
      - ./html:/usr/share/nginx/html:ro             # astro 构建产物就落到这里
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
    restart: unless-stopped
```

CI 任务（`deploy.yml`）先在 runner 上构建出 `dist/`，然后 `cp -r dist/*` 到
与 nginx 容器共享的 `./html` 卷里。Cloudflare 的隧道守护进程（`cloudflared`）
指向 `nginx-blog`——那是唯一暴露到公网的东西。

有两件事值得特别说明，它们都花了我不少时间：

1. **`act_runner` 需要挂载 Docker socket**（`/var/run/docker.sock`）才能拉起
   构建任务——没有它，任务会一直卡在排队状态。
2. **runner 的 `GITEA_RUNNER_REGISTRATION_TOKEN`** 是 Gitea 的一个 *Actions
   secret*（workflow 里写成 `${{ secrets.PAT }}`），绝不会硬编码在仓库里——
   所以这个仓库可以放心地公开。

## 安装时的坑（真实经历，来自我的 commit 历史）

把这条管线跑通并不顺利——这个仓库的 git 历史就是一本「坑记录」。真正花时间的
有四个：

1. **Gitea 上没有 `actions/checkout`。** Gitea 的 `act_runner` 不自带 GitHub
   marketplace 的那些 action。我的第一个 workflow 立刻就失败了——因为压根没有
   东西去 checkout 仓库。解决办法：去掉 `actions/checkout` 这一步，手动 clone：
   ```yaml
   - name: Checkout
     run: |
       git config --global --add safe.directory '*'
       git clone --depth 1 "https://hoelee:${{ secrets.PAT }}@git.hoelee.com/hoelee/hoelee-blog.git" .
   ```

2. **`GITHUB_TOKEN` 注入无法通过 clone 的身份验证。** 默认的 runner token
   不足以 `git clone` 一个私有仓库，所以任务在 checkout 阶段就失败了。解决办法：
   创建一个专门的 **Personal Access Token**，并在 workflow 里引用为
   `${{ secrets.PAT }}`——绝不要硬编码进去（这也是为什么这个仓库可以放心公开）。

3. **Gitea 与 `act_runner` 的版本不匹配。** 我花了三个 commit
   （"test gitea 1.24.7 + act_runner 0.2.13" → "gitea 1.25.5" → "gitea 1.27.3 +
   runner 3.3.2"）才让 runner 成功注册并领取任务。教训是：**让 runner 与 Gitea
   的主版本号匹配**——runner 比 Gitea 落后一个主版本，就会静默注册失败。

4. **runner 需要 `config_file` 环境变量。** 只有显式传入配置文件路径，runner
   才会连到正确的实例。

每一个都是「挠头一小时、修复一行代码」——而这恰恰是一篇博客文章最该帮后来人
省下的东西。
