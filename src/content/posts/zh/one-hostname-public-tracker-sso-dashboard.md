---
title: "公开的埋点与要 SSO 的仪表盘，怎么共用一个域名"
description: "埋点必须公开，仪表盘绝不能公开。我用 authentik 的 proxy provider 加路径放行规则，把两者放在同一个域名上——不用第二个子域，也不用第二个证书。"
pubDate: 2026-09-30
category: devops
tags: ["umami", "authentik", "sso", "nginx", "docker", "privacy"]
ogImage: "/og/one-hostname-public-tracker-sso-dashboard.png"
banner: "/banners/one-hostname-public-tracker-sso-dashboard.png"
draft: false
---

几乎每个统计工具都长成一个尴尬的形状：负责**收集**数据的那一半，必须让陌生人的浏览器在每次打开页面时都能访问；负责**展示**数据的那一半，必须只有我能访问。

通常这意味着两个域名：一个公开的埋点入口，一个私有的仪表盘。我不想要两个域名。我只想要一条 DNS 记录、一张证书、一件要记住的事——同时能在吉隆坡某家酒店的 wifi 上打开仪表盘，而不用把一个登录页发布到公网。

下面就是最后跑通的形状，以及两个让「看起来完全正常」的配置连续半小时返回 404 的坑。

## 约束清单

- **埋点必须公开。** `script.js` 和两个收集端点由每个访客的浏览器抓取。如果它们被鉴权挡住，你就什么都收不到，而且好几天都不会发现。
- **仪表盘绝不能公开。** 它显示每个访客的国家、城市、来源和页面路径。一个默认管理员登录挂在公网 URL 上，就是送给任何在证书透明度日志里翻到你子域的人。
- **没有泛解析 DNS。** `*.hoelee.com` 不解析，所以每个域名都是一条显式 DNS 记录加一张证书。第二个域名是实打实的工作量，还让我要维护的攻击面翻倍。
- **这个域名不走 Cloudflare。** 它是一条直指我家路由器的 A 记录，所以没有 WAF、没有 bot 防护，也没有 `CF-Connecting-IP` 头可以依赖。下面所有东西都只能靠普通 nginx 头工作。

## 方案一：两个域名

业界常见的拆法是 PostHog 和 Sentry 的做法：`i.posthog.com` 收数据，`app.posthog.com` 看数据。当收集端由 CDN 承载、每秒几千请求、而应用端是个有状态数据库客户端时，这是真需求。我的博客一天只有个位数访问。我是在抄一个解决「我没有的问题」的架构，代价是第二条 DNS 记录、第二张证书、第二个会坏的地方。

两个域名是**规模**的答案，不是**需求**。一个域名就能同时承载两者，按路径分开就行。

## 方案二：nginx basic auth（这个方案行不通，原因值得记下来）

我第一反应是用最便宜的挡法：在统计应用前面放一个 nginx 容器，除了三个埋点路径以外全挂 `auth_basic`。四行配置，我以前用过。

它会把仪表盘彻底弄坏，而且坏的方式足够让人困惑，值得写下来。

应用自己的前端会用 bearer token 调自己的 API：

```
GET /api/websites HTTP/1.1
Authorization: Bearer <token>
```

浏览器每个请求只发**一个** `Authorization` 头。当前端加上它的 bearer token 时，这个头就**顶掉**了 basic auth 的凭据——于是网关读到的是一个 bearer token，却期望它是 base64 的 user:password，判定为未鉴权，返回 401。仪表盘的外壳能加载（那个请求带着 basic auth），然后每一个 API 调用都失败。你得到的是一个渲染出框架、里面什么都没有的界面，读起来像「统计工具坏了」，而不是「我的网关在跟我的应用打架」。

基于 cookie 的鉴权没有这个问题，因为凭据放在 `Cookie` 头里，应用自己的 token 永远不会碰它。所以：要么 cookie 鉴权，要么不要网关。

## 方案三：nginx 白名单网关（能用，但仪表盘变成只能内网访问）

下一版彻底去掉 basic auth，把网关做成纯白名单：`/script.js`、`/api/send`、`/api/heartbeat` 放行，其余一律 403。这确实安全——埋点公开，仪表盘根本不可达——如果你只在自己网络里看数据，这完全可以作为最终方案。

但我想在任何地方都能看仪表盘，所以它变成了退路而不是终点。我把容器停掉但保留着，后来证明这个决定是对的：回滚只需要一次 `docker start` 加一行配置。

## 方案四：authentik proxy provider + 按路径放行

我本来就在用 authentik 给二十来个自托管应用做单点登录。它们大多用同一种方式挡：反向代理把请求转给 authentik 的 embedded outpost，outpost 检查会话 cookie，未登录的访客被 302 送到登录流程，登录后再送回来。

proxy provider 上有一个正好为这个问题准备的字段：`skip_path_regex`。一行一条正则。**任何匹配的路径都会完全不鉴权**直接转发给应用；不匹配的一律弹到 SSO 登录。于是「哪部分公开」不再是 nginx 的事，而变成了应用层的策略。

```
mode:              proxy
external_host:     https://stats.hoelee.com
internal_host:     http://umami:3000
skip_path_regex:   ^/script\.js$
                   ^/api/send
                   ^/api/heartbeat$
                   ^/mcp(/|$)
```

这就是全部策略：埋点脚本、收集端点、健康检查端点和 MCP 端点公开；这个域名上的其他所有路径都要过 SSO。

nginx 的 vhost 则从指向应用改成指向 outpost：

```nginx
location / {
    proxy_set_header Host              $http_host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_pass http://localhost:10000;   # the authentik outpost
}
```

## 坑一：一个 provider 模式，让「正常的 SSO」把整个应用变成 404

我建新 provider 的方式是克隆一个已经能用的。通常这是加应用最快也最安全的做法，而这正是我踩坑的原因。

我抄的那个 provider 用的是 `mode: forward_single`，`internal_host` 是空的。对于自带登录的应用（比如一个浏览器应用、一个自己有会话的监控界面），这是对的——outpost 只需要回答「这个访客允许吗」，应用由别的路径抵达。但它意味着 outpost **没有可代理的上游**。当你挡的应用自己没有登录（比如自托管的统计仪表盘），outpost **就是**那个反向代理，而 `internal_host` 为空时它无处可送。

症状之所以难缠，是因为鉴权那一半看起来完美：

```
$ curl -sI https://stats.hoelee.com/ | head -1
HTTP/2 302                      # → auth.hoelee.com/if/flow/auth-stats/
$ curl -s -o /dev/null -w '%{http_code}' https://stats.hoelee.com/script.js
404                             # ← 但应用不在这里
```

302 到登录流程、品牌登录页正常渲染、流程走完——而每一个应用路径都返回 404。一旦开始找，有两样东西让定位变得很快：

1. **`x-powered-by` 头会告诉你哪一跳应答的。** 那个 404 带着 `x-powered-by: authentik`，证明它是 outpost 产生的，应用根本没收到请求。没有这个头，我就会去查应用的路由。
2. **拿一个能用的 provider 对照。** 同样的匿名请求打到已知正常的应用，会停在登录流程并返回 200。我的是 404——形状一样，最后一跳不同。

修复只是一对字段：`mode: proxy` 加一个真实的 `internal_host`。

```
mode:              proxy                     # 不是 forward_single
internal_host:     http://umami:3000         # outpost 把请求代理到这个容器
```

`forward_single` = 「应用在别处，你只负责检查访客」。
`proxy` = 「你就是反向代理，把请求送到 `internal_host`」。
怎么选：问一句**谁来产生响应**。

## 坑二：outpost 需要一分钟，而它会很有说服力地骗你

改完 provider 之后，embedded outpost 需要一到两分钟才会拉到新配置。在这个窗口里，域名会这样应答：

```
302 → /flows/-/default/authentication/     # 一个默认流程，slug 是 "-"
404                                        # 所有应用路径
```

这不是新配置失败，而是旧配置还没被替换。我在这上面浪费了两次时间：一次是判断接线坏了，一次是判断模式修改没生效。现在的做法是改一处、等九十秒、然后才判断结果。把新 provider 挂到 outpost 上也一样：provider 在 API 里立刻存在，但要一分钟后才开始应答请求。

## 我实际验证了什么，以及从哪里验证

这类改动用内网自测毫无意义。我的环境里有些域名有两层入口（一个 nginx vhost，加一条直连容器的隧道规则），所以从内网发的请求可以通过，而公网路径完全绕开网关。下面全部是从公网、用真实域名测的。

| 检查 | 结果 |
|---|---|
| 匿名 `GET /` | 302 → outpost → 该应用自己的登录流程 → **200** |
| `GET /login`、`/api/websites` | 302，被挡 |
| `GET /script.js` | **200**——埋点脚本对访客仍然加载 |
| `GET /api/heartbeat` | **200** |
| 用假 site id `POST /api/send` | **应用返回 400**，不是网关返回 403——证明请求真的到了应用 |
| 带 API key `POST /mcp` | **200**，`text/event-stream` |
| 不带 key `POST /mcp` | **401** `Missing bearer API key`——应用自己的鉴权，不是 SSO 网关 |
| 一次真实 pageview | 记录到 `country=MY region=MY-07 city=George Town`，浏览器、系统和来源都完整 |

最后一行才是关键。因为这个域名不走 Cloudflare，访客 IP 必须靠 `X-Forwarded-For` 穿过两跳代理，并且要告诉应用去读这个头（`CLIENT_IP_HEADER=x-forwarded-for`）而不是读 Cloudflare 的那个。一个数字在涨、但所有访客都被归到容器 IP 上的统计，看起来像成功，其实毫无用处。**能记录到正确的城市才是证据。**

## 我下次会怎么做

- **把上一个网关停掉，而不是删掉。** 方案三那个 nginx 白名单容器还在磁盘上，处于停止状态。回滚是 `docker start` 加 vhost 里改一行——三十秒，而不是在压力下凭记忆重建它。
- **在域名可达之前轮换应用的默认凭据，而不是之后。** 我有一个下午让公网 URL 和默认的管理员登录同时存在；而新子域几个小时内就会出现在证书透明度日志里。
- **一次只改一个字段，然后等。** 这次会话里三个错误结论，有两个来自在系统还没应用完变更时就去读结果。
- **也要测应用自己的登录流程。** SSO 通过不代表应用能用：网关可能完全正确，而它设下的会话 cookie 在下游被拒。我用 curl 验证埋点路径、用真实浏览器验证仪表盘，然后才敢说做完了。

## 说清楚取舍

- **双重登录。** 统计应用不支持 OIDC，所以 SSO 只解决了「能不能到这个路由」，应用仍会要它自己的用户名密码。每个浏览器多一次点击。真正保护数据的是应用内可以按账号开启的两步验证。
- **仪表盘的可用性等于 outpost 的可用性。** authentik 挂了，仪表盘就挂了；同时埋点会静默失败，这还能接受：页面照常打开，只是数据没落库。
- **我保留了一条后门。** 应用仍在局域网里发布一个端口，完全绕开 SSO。它从公网不可达（用外部主机验证过），仍然需要应用自己的凭据，但我宁可留着它，也不想因为一次 SSO 配置失误把自己锁在自己的统计之外。

## 结果

一个域名、一条 DNS 记录、一张证书。没有第二个子域，没有额外容器——网关就是我本来就在跑的 SSO 实例的一个功能。埋点对每个访客的浏览器可达，仪表盘对我随处可达，匿名访客看到的是登录页而不是仪表盘。

可以量化的版本：三个埋点路径加 MCP 端点对匿名请求应答正确，域名上其余所有路径 302 到 SSO，pageview 带着访客真实城市和来源落库——这也是整件事值得做的唯一理由。

如果你也在自托管统计（或任何有「公开收集端」的东西），先试试用一个域名加路径放行规则，再考虑加第二条 DNS 记录。两域名的拆法是给那些收集流量足以养一个 CDN 的公司用的架构。你的多半不是。

## 需要为你的业务做这个吗？

如果你想真正知道网站在发生什么，又不想把访客数据交给广告网络——或者你有一个绝不该从公网访问的内部工具——我可以帮你搭自托管、无 cookie 的统计，以及像这篇里那样的 SSO 网关：一个域名、不需要同意横幅、没有第三方脚本在每一页偷偷回连。

**WhatsApp：[+60 12-797 2969](https://wa.me/60127972969)** · **邮箱：[me@hoelee.com](mailto:me@hoelee.com?subject=Self-hosted%20analytics%20and%20SSO)** · **[hoelee.com](https://hoelee.com)**

网站设计与开发是我的主业；服务器加固与自托管基础设施是它的另一半。
