---
title: "给自己改不了源码的应用装一扇前门"
description: "我自托管阅读服务的门面，是一个中文登录框；而应用本身是客户端渲染的 SPA，我改不动。于是我在它前面加了一个容器：nginx、一个双语页面，和三行注入。"
pubDate: 2025-06-24
updatedDate: 2026-10-06
category: devops
tags: ["nginx", "docker", "self-hosting", "seo", "branding"]
ogImage: "/og/putting-a-front-door-on-an-app-you-cant-modify.png"
banner: "/banners/putting-a-front-door-on-an-app-you-cant-modify.png"
draft: false
---

我的阅读服务，访客打开看到的第一样东西是一个中文登录框。没有说明这个站是什么，没有邀请码说明，没有品牌，链接分享出去也没有社交卡片，搜索引擎也没有任何值得收录的东西。就是一个登录弹窗，上面一首诗。

这个服务是我给家人和几位付费读者跑的，所以「新读者第一眼看到什么」不是装饰问题，它就是产品本身。而我改不了它——它背后是别人的代码：一个 hash 路由的 Vue 单页应用，界面不归我管，版本按别人的节奏发布。

**那么问题来了：怎么给一个自己改不了的自托管应用套上自己的首页、品牌和语言处理，既不 fork 它，也不做一个下次镜像更新就碎掉的包装层？**

## 先说为什么那些「显然的做法」都不行

**直接改应用的 HTML。** 没东西可改。这一步很多人都跳过，但它决定了后面整套方案：

```bash
curl -s https://book.example.com/index.html | wc -c
# 5879 — and the body is <div id="app"></div>
```

这个页面只是一个外壳，所有按钮、文字和弹窗都是之后由 JavaScript 画出来的。所以既没有标记可以改进，也没有东西可以重排。

**在代理层重写响应。** 这个最诱人——Traefik 或 nginx 的响应体重写中间件。它失败的理由和上面一样：body 重写只能重写**body 里存在的东西**，而 body 里只有一个空 div 和一个 script 标签。这条值得当成一条通用规则记住，在任何时候伸手去用反向代理的 body 重写功能之前先做一次：

> 用 `curl` 拿到原始响应，grep 一下你想干掉的那个字符串。如果它不在你收到的字节里，那么内容是客户端渲染的，body 重写就是错的工具——你需要的是 CSS 或 JS，并且注入到应用会加载的地方。

**改压缩后的 bundle。** 技术上可行，因为编译产物我看得到。但每次镜像更新都会带来重新构建（有时还重新压缩）的 bundle，于是这就变成一份对着别人的代码库长期维护的活。而且它的失败方式最糟糕：静默、在生产环境、在某个不相干的升级之后。

**把我自己的页面塞进应用的镜像里。** 这样我的落地页、SEO 标签和社交卡片就绑死在别人的发布节奏上，上游一个坏构建能把我整扇前门一起带走。我最不想做的事，就是让我的品牌依赖他们的 Dockerfile。

所以：不放进应用里，不重写应用，也不 fork。放在它**前面**。

## 方案：多一个容器，让它持有对外端口

这条 stack 里有两个服务。应用不对外暴露任何公开端口；一个极小的 `nginx:alpine` 网关持有它，并决定每个请求是什么：

```yaml
services:
  reader:
    # the app: loopback-only port kept for debugging, never public
    # (127.0.0.1:7778:8080)
    networks: [bridge_hoelee]

  reader-gateway:
    image: nginx:alpine
    ports:
      - "7777:80"          # the only public door
    networks: [bridge_hoelee]
    volumes:
      - /volume1/docker/reader/gateway/conf/default.conf:/etc/nginx/conf.d/default.conf:ro
      - /volume1/docker/reader/gateway/html:/usr/share/nginx/html:ro
```

nginx 那一侧短到可以整段读完。有意思的决定不在路由本身，而在路由周围那四行：

```nginx
# resolve the app at request time, not at startup
resolver 127.0.0.11 valid=10s ipv6=off;
set $reader_upstream http://reader:8080;

location = / {                 # the front page: exact match, bare root only
    root /usr/share/nginx/html;
    try_files /index.html =404;
    add_header Cache-Control "no-store" always;
}

location / {                   # everything else: the app, untouched
    proxy_pass $reader_upstream;
    client_max_body_size 1024m;   # uploads still work through the middle box
}
```

**在请求时解析上游，而不是启动时。** 如果写成字面量 `proxy_pass http://reader:8080`，nginx 只在启动那一刻解析这个名字一次，解析不到就拒绝启动——于是应用每次重启或被替换，我的前门就跟着下线。改用变量加 Docker 内嵌 DNS（`127.0.0.11`），就把解析推迟到每个请求。应用停着的时候网关照样能启动，这件事在你第一次重建应用时很重要，在你半夜排查时也很重要。

**把应用自己的端口留给调试，而且一次改完。** 应用仍然在 loopback 上发布 `127.0.0.1:7778:8080`：从宿主机通过 SSH 能连，公网看不见。做这次切换时，旧容器必须和网关在**同一次** stack 更新里交接那个端口；拆成两次部署会绑定失败。

**别让中间那台机器变成新的限制。** 网关设置了 `client_max_body_size 1024m`，因为这个应用允许上传大体积的电子书。在一个有文件上传的应用前面加代理，是引入「只在某天有人上传大文件时才出现」的 bug 的经典方式。

**不同路由用不同缓存时长。** 首页是 `no-store`（我直接在磁盘上编辑它，希望刷新即生效），社交图缓存一天，注入脚本缓存五分钟。各一行。

## 页面本身

它是一个自包含的 HTML 文件：没有网络字体、没有 CDN、没有构建步骤。这不是为了极简而极简——它意味着这扇前门没有任何第三方依赖会变慢、被墙或停止服务，而且断网时它还能从缓存里渲染出来。

里面有两个决定值得照抄：

**两种语言同时存在于 DOM 里。** 每一句文案都出现两次——一个 `.zh` span 和一个 `.en` span——由 `<html>` 上的一个属性通过 CSS 决定显示哪一套。默认跟随浏览器语言，用 `?lang=en` / `?lang=zh` 可以覆盖，选择记在 `localStorage`。因为两种语言都在 HTML 里，搜索引擎会两种都收录，这是 JavaScript 切换器做不到的。

**邀请码故意不放在页面上。** 页面明确写着邀请码印在实体邀请卡上，而不是把它显示出来。一个公开的落地页如果泄露注册码，就等于把一个只发邀请的服务变成开放注册。

## 注入进应用的三行，以及它们为什么是重点

一个放在应用前面的落地页，如果不把接缝藏掉，看起来仍然是两个产品。应用所在的 location 块里有三条 `sub_filter` 规则负责这件事——它们在应用的外壳经过时打补丁（那 5,879 字节，是客户端渲染应用里唯一真的存在于字节中的部分）：

```nginx
location = /index.html {
    proxy_pass $reader_upstream;
    proxy_set_header Accept-Encoding "";   # sub_filter cannot rewrite a compressed body

    # 1. the app declares the wrong language, which disables browser translation
    sub_filter '<html lang="en">' '<html lang="zh-CN">';

    # 2. reload/bookmark/new tab -> back to the front door; the enter button sets the pass
    sub_filter '</head>' '<script>(function(){try{if(!navigator.onLine)return;
      if(sessionStorage.getItem("gatePass")==="1"){sessionStorage.removeItem("gatePass");return;}
      location.replace("/"+(location.hash||""));}catch(e){}})();</script></head>';
}
```

第二条才是真正有意思的。刷新、用书签打开、或者新开标签页，都应该再回到首页——我希望应用的地址表现得像一个产品，而不是把陌生人丢进应用内部、还没有出口。机制是一个 `sessionStorage` 标记：没有标记就「弹回前门」，进入按钮会先写上标记，而脚本会**消费**掉它（删掉），这样下一次刷新又会回弹。少了「消费」这一步，就会在页面和应用之间无限来回跳，那个标签页按逻辑就关不掉了。`navigator.onLine` 的判断让离线场景放行，所以应用装成 PWA 断网时照常可用。

两个花了点时间的机械细节：

- 那个 location 里必须加 `proxy_set_header Accept-Encoding ""`，因为 `sub_filter` 无法重写压缩后的内容。它只作用于外壳的精确匹配，所以只有约 5 KB 失去压缩；应用的 JS 和 CSS 保持 gzip。
- 千万**不要**加 `sub_filter_types text/html`——那是默认值，加了 nginx 每次启动都会报一条 MIME type 重复的警告。

语言这一半值得单独一篇，也确实写了：[浏览器翻译没有 API：我给一个纯中文网页应用加上了英文模式](/posts/zh/adding-english-mode-to-a-chinese-only-web-app/) 讲的是那个属性谎言和应用内英文层。这里重要的只是这个手法的形状——把一个小补丁打在客户端渲染应用里唯一以真实标记形式到达的那一部分上。

## 用代理解决不了的品牌问题

同一类应用通常还会带上厂商自己的链接——一个 GitHub 图标、一个 Telegram 群、一个「关注我们」区块。学过前面那条规则，结论立刻就有了：这些按钮是 JavaScript 画出来的，所以没有代理重写碰得到它们，也没有 HTML 可以改。真正有效的是应用自己的扩展点。很多自托管应用都会留一个，这个应用会从它持久化卷里的某个目录加载一份自定义样式表：

```css
.bottom-icons a { display: none !important; }        /* the vendor's repo link */
.index-wrapper > :nth-child(6 of .setting-wrapper) { display: none !important; }
```

因为这份文件住在数据卷而不是镜像里，它会活过每一次镜像重建——这正是把自定义项放在发布流程够不着的地方的意义。

## 脆弱的地方，以及我现在会检查什么

**这些注入依赖两个字面量字符串：** `'<html lang="en">'` 和 `'</head>'`。如果应用未来某个版本改了其中任何一个，补丁就会静默失效：不报错，页面也不坏，只是首页回弹行为不见了，而这件事可能几周都没人发现。正因为这种失败方式，这条 stack 的运维笔记里放的是断言，而不是描述：

```bash
curl -s https://book.example.com/index.html | grep -o '<html lang="[^"]*"'   # want zh-CN
curl -s https://book.example.com/index.html | grep -c 'gatePass'             # want 1
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' https://book.example.com/og.png
```

每次应用升级之后都跑一遍。「它还能打开」不等于「我的集成还在工作」。

**永远不要手改 NAS 生成的反向代理配置。** 网关上面那一层是平台写的，它每隔几分钟就用一个新的 UUID 文件名重新生成——手改的内容活到下一次重新生成为止，然后消失，通常是在你正在查别的问题的时候。所以那一层被当成不可变的，永久指向网关的端口；我控制的一切都活在它下面。

**把这扇前门留在应用镜像之外。** 整个设计就压在这个决定上。网关是独立的容器，配置文件在宿主机上，所以一次应用镜像替换——或者，像后来发生的那样，一次换了编程语言的上游重写——都带不走首页、SEO 元数据和翻译层。

**还有：用断言，不要用眼睛。** 上面那段里每一个数字都来自 `curl` 和字节数，而不是「我看了一眼，感觉没问题」。

## 结果

应用获得了一个首页、一段邀请说明、一张社交卡片、JSON-LD、中英切换、一层英文界面，并且被去掉了厂商品牌——而它本身一行都没有改：

| 检查项 | 结果 |
|---|---|
| `/`（首页） | 200，23 KB，`Cache-Control: no-store` |
| 应用外壳 | 200，`<html lang="zh-CN">`——那个语言谎言在路上被纠正 |
| 注入脚本存在 | 1 处 |
| `/og.png` | 200，`image/png`，185 KB |
| 应用容器端口 | 只在 loopback；对外端口属于网关 |

两个容器而不是一个，大约四十行 nginx，外加一扇应用的发布周期够不着的前门。当底下那个应用永远是别人的问题时——它永远是——这就是放你自己品牌最便宜的位置。

---

**你在把自托管应用当服务来跑——给客户、给同事、给付费用户——希望它别再像个原始安装？** 在一个你不维护的应用前面加上自己的前门、品牌和语言处理，正是我在做的一类封装工作。

[WhatsApp +60 12-797 2969](https://wa.me/60127972969) ·
[me@hoelee.com](mailto:me@hoelee.com?subject=Front%20door%20for%20a%20self-hosted%20app) ·
[hoelee.com](https://hoelee.com)
