---
title: "验证完全正确的 Forward-Auth 网关——其实并未上线"
description: "我的 authentik forward-auth 网关在宿主机上返回了干净的 302 跳转到登录页，公网 URL 却仍然直接服务应用。这个主机名有两条入口层，而我只改了其中一条。"
pubDate: 2026-09-29
category: devops
tags: ["authentik", "forward-auth", "cloudflare", "nginx", "docker", "self-hosting"]
ogImage: /og/authentik-forward-auth-gate-wasnt-live.png
banner: /banners/authentik-forward-auth-gate-wasnt-live.png
draft: false
---

网关搭好了，检查也跑了，通过了。

```
HTTP/1.1 302 Found
location: https://app.example.com/outpost.goauthentik.io/start?rd=...
x-powered-by: authentik
```

未认证的请求被推到了我的 authentik 登录页。带品牌定制、正确、可用。我正准备继续下一件事——除了我自己有一条规矩：任何面向用户的东西，都要用用户的方式去访问它，也就是从外部、走公网。于是我照做了。

```
GET https://app.example.com/          → 200
x-powered-by: Express
```

应用直接应答了。没有登录页、没有重定向、没有网关。完全同一个主机名，一条请求路径被拦住了，另一条门户大开——取决于请求是从哪里进入我的网络的。

这就是我的一整天：问题不在 SSO 配置——那是好的——而在于这个事实：**一个主机名可以由不止一层入口来服务，而我只拦截了其中一层**。

## 为什么这不只是我这一个应用的事

如果你自托管的东西在隧道、反向代理或两者后面，你多半已经做过这个假设：*「服务我域名的是反向代理。」*这个假设一直成立，直到它不再成立，而且它失效的方向最危险——你改的一切看起来都是对的，因为你检查的那条路径确实是对的。

这种失效模式天生就是无声的。没有报错、没有日志行、没有任何提示。你的配置检查能通过，是因为你检查的正是你自己改过的那份配置。而真正的流量——你想要保护的流量——根本不会碰到它。

事后我在同一台宿主机上又发现了两个同样的网关，带着同样的潜在问题，用同样的方式搭建，等着某个信任它们的人。

## 背景：给一个没有 SSO 的应用加 SSO

这个应用是我 NAS 上的一个自托管数据库界面（Docker，发布在宿主端口上，位于 nginx 和 Cloudflare Tunnel 后面——我家实验室的常见形态）。我想在它前面加一道登录墙，让「能从公网访问得到」不再意味着「任何人猜中主机名就能看到登录表单、开始猜密码」。

应用自己的文档宣称支持 SSO。我会把这篇的重点放在入口陷阱上，许可的故事放到另一篇里讲，但简要版本是：宣传的 SSO 是付费许可功能，开源构建带有代码路径但不带使用许可，而过去填补这个空白的社区 fork 已经两年没人维护了。二十分钟调研、两个被放弃的方案、一个结论：**这个应用永远不会为我做 SSO，所以网关必须放在它前面。**

这是件正常且早已被反复实践过的事。authentik 管它叫 proxy provider，流程是：

1. **一个 login flow**——给这个应用用的，有自己的标题、自己的背景，这样落到登录页的用户知道自己是在为哪个系统做认证。
2. **一个 proxy provider**——这个对象知道应用的外部主机名（`https://app.example.com`）和内部地址（`http://app-container:8080`）。
3. **一个 application**——把两者关联起来，挂在内置 outpost 上。outpost 才是真正接收流量、检查会话、并在登录后把请求代理到应用内部主机的组件。
4. **入口（ingress）**——把那个主机名指向 outpost 而不是应用。

第 1–3 步都在 authentik 里，属于配置。第 4 步决定这一切是否真实有效，而我恰恰错在这一步。

第 1–3 步还有两个小坑，因为它们浪费过我的时间：

**对 proxy provider 做部分 PATCH 会被拒绝。**只更新一个字段就会返回：

```json
{"internal_host": ["Internal host cannot be empty when forward auth is disabled."]}
```

serializer 会重新校验整个对象，而一个没有 internal host 的 proxy provider 是无效的——所以只更新一个字段会失败，就像你清空了一个根本没碰过的字段一样。把标识字段和你正在改的字段一起发送：

```bash
curl -s -X PATCH "$AUTH/api/v3/providers/proxy/$PK/" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"mode":"proxy","external_host":"https://app.example.com",
       "internal_host":"http://app-container:8080","skip_path_regex":""}'
```

**authentik API token 可能在会话中途过期。**正常用了一个小时后，每个调用都开始返回 `403 {"detail":"Token invalid/expired"}`。注意这个状态码：`403` 的意思是「我们知道你是谁，但你不能这么做」——只有响应体才会告诉你 token 已经死了。如果你在脚本里缓存了 token，当调用开始失败时，去数据库里重新读一次，而不要假定是权限问题。

## 陷阱：我验证的是我改过的那一层

这是我运行的检查，在宿主机本机：

```bash
curl -sk -o /dev/null -w '%{http_code} -> %{redirect_url}' \
  -H 'Host: app.example.com' https://localhost/
# 302 -> https://app.example.com/outpost.goauthentik.io/start?rd=...
```

这是一个*好*检查。它证明了 nginx 的 vhost 在服务 outpost、outpost 认得这个主机名、provider 已经关联到 application、login flow 是活的。我配置的一切，一条命令就全部证明了是正确的。

但它对「公网流量是否真的到达那个 vhost」什么都证明不了。

原因如下。我的主机名由**两条**相互独立的入口路径服务：

| 路径 | 谁在服务它 | 落在哪里 |
|---|---|---|
| 家里 IP → nginx (443) | 我改过的那个 vhost | outpost ✅ |
| Cloudflare Tunnel (`cloudflared`) | 隧道自身配置里的一条规则 | 直连应用的端口 ❌ |

隧道的 ingress 是一个按主机名求值的小型有序列表：

```
app.example.com     -> http://app-container:8080     ← straight to the app
*                   -> http_status:404
```

那条规则是几年前写的，当时的目标只是「让它能被访问到」。它从来没提过 nginx，因为没必要。于是我漂亮的 vhost 就待在真实请求路径的旁边，拦截着一条公网流量根本不走的路线。

两条路径甚至在同一个主机名上应答，所以 URL 上没有任何线索暗示这中间的差别。

**最后让问题暴露出来的是一个响应头。**被拦截的那次检查返回 `x-powered-by: authentik`，公网那次返回 `x-powered-by: Express`。同一个 URL、同一秒钟，两个不同的服务器在应答。当你怀疑自己盯错了层时，去读响应头——它们会说出应答的软件是谁，而这正是你想问的问题。

与其靠猜，不如直接看自己隧道的规则（用 Cloudflare 的 API，而不是控制台）：

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID/configurations" \
  -H "Authorization: Bearer $CF_TOKEN" \
  | python -c "import sys,json; [print(r.get('hostname','*'), '->', r.get('service','')) for r in json.load(sys.stdin)['result']['config']['ingress']]"
```

```
git.example.com   -> http://192.168.1.6:6880
app.example.com   -> http://app-container:8080
bot.example.com   -> http://bot-container:8080
*                 -> http_status:404
```

看了一整天 nginx 之后，答案就躺在一行里。

### 通往修复路上的权限墙

编辑那条规则需要一个带 **Account → Cloudflare Tunnel → Edit** 权限的 token。我的没有这个权限，而且任何 zone 级 token 都无法替代：隧道是 account 级的对象，所以 Zone 级的 token 连*读取*都会失败，报 `1001 Not authorized`。如果你只有 zone 级 token，那就改用控制台：**Zero Trust → Networks → Tunnels → 你的隧道 → Public Hostnames**，把规则的 service 改成你的 outpost。

对我来说，正确的目标是与 `cloudflared` 同处一个 Docker 网络的 outpost：

```
app.example.com  ->  http://authentik-server:9000
```

outpost 读取 `Host` 头（隧道会原样保留它）来选择 application，然后按 provider 配置里的内部主机做代理。整个改动就这么点：一个 service 值。我在 authentik 里搭的一切本来都是对的——只是从来不在那条路径上。

## 可选 SSO：拦住界面，放行 API

当网关真正挡在流量前面之后，下一个问题就是 API。主机名级的网关分不清脚本和浏览器，所以只带 token 的 API 调用会被重定向到登录页——它们不会以 JSON 报错失败，而是收到一页 HTML。

如果你想要人类走 SSO、机器不走 SSO，authentik 的 proxy provider 提供一个按路径豁免的配置。界面里叫 **Unauthenticated Paths**；API 字段是 `skip_path_regex`：

```json
{"skip_path_regex": "^/api/.*"}
```

在我自己的实例上验证的结果，同一主机名、同一会话：

| 请求 | 无会话 | 结果 |
|---|---|---|
| `/` 和 `/dashboard` | 是 | `302` → authentik 登录页 |
| `/api/v1/health` | 是 | `200`，来自应用 |
| `/api/v2/tables/.../records` + API token | 是 | `200`，带真实数据 |

在依赖它之前，有两个值得知道的注意事项。这个豁免在 outpost 层生效，所以和 CDN 上的路径拆分不同，它在**每一条**入口路径上都有效。而且它不是按用户区分的：网关作用在请求上，而不是人身上。不存在「某些用户可以跳过 SSO」——要么一条路径对所有人豁免，要么所有人都需要会话。

我先是用了同一个思路的更简单版本：**在网关存在之前，把所有机器调用者从公网主机名上移走。**我的自动化之前一直通过公网 URL 调用应用，毫无必要地被路由到 Cloudflare 再绕回我自己的网络。把它指向容器名（`http://app-container:8080`）缩短了路径、去掉了一种失效模式，也意味着网关不可能弄坏它。如果一道登录墙就能让你的集成瘫痪，那说明这个集成本来就在依赖门是开着的。

## 实话实说：这不是单点登录

关于 forward-auth 网关到底给了你什么，我得直说，因为「SSO」这个词把它说大了。

outpost 知道你是谁，应用不知道。除非应用能够消费上游身份——基于 header 的认证，或原生的 OIDC/SAML——否则网关放你进来之后，它还是会显示自己的登录表单。所以用户体验是：先登录 authentik，再登录应用。

对已经登录 authentik 的用户来说，第一步常常是静默的。但它依然是两套系统、两个会话生命周期、两处可能输错密码的地方。就我而言，应用没有 header 认证，它自己的 OIDC 又是付费许可功能，所以这道网关只是在原有那扇门前面外加了一道——登录次数一点都没减少。

对某些部署来说，这是一笔划算的交易：保留应用自己的登录给它的用户，同时让公网接触不到登录表单。但如果你真正想要的是「我的团队只输一次密码」，那就是一笔糟糕的交易。所以对我来说，诚实的答案是把整个东西重新关掉。

## 正确地回滚（以及救下另外十个应用的算术）

拆除网关这一步，我差点造成比我想防止的故障大得多的宕机。

nginx 的改动是一个大型生成 vhost 文件里的一行。最直接的回滚就是把端口换回去：

```bash
# DON'T — this is the version that would have hurt
sed -i 's#proxy_pass http://localhost:10000;#proxy_pass http://localhost:10380;#' vhost.conf
```

在运行之前，我数了数有多少个 server block 指向同一个端口：

```bash
grep -c 'proxy_pass http://localhost:10000;' vhost.conf
# 11
```

11 个。我的应用只是其中之一。**另外还有十个应用都经由那个 outpost 被网关拦着**，一次无差别的替换会同时悄悄拆掉它们所有人的门——包括那些在做真实认证工作的应用。这个「修复」看起来会像是成功的，同时却会拆掉我家实验室大部分认证。

我实际做的是：

1. **先给当前状态拍快照**，让回滚本身也可回滚：`cp -a vhost.conf vhost.conf.bak-$(date +%Y%m%d-%H%M)-revert`。
2. **拿原始改动前做的备份来 diff，找到确切的那一行。**那次 diff 只显示了一行改动，正好证明我到底动过多少。
3. **只编辑那一行**，然后重新和原始备份 diff，要求结果与备份完全一致再继续。
4. **更新第二个文件**——它镜像同一份设置：NAS 自己的反向代理数据库，会在 DSM 事件发生时重新生成 vhost。我只编辑了那一个键，写入前断言了主机名，绝不整文件恢复。
5. `nginx -t`，然后 reload。

然后还有一个让我又怀疑了二十分钟的细节：

```bash
nginx -s reload && sleep 2 && curl -sk -H 'Host: app.example.com' https://localhost/
# still 302 -> /outpost.goauthentik.io/start
```

回滚看起来像是失败了。其实没有。reload 后几微秒发出的请求，仍可能由正在排空（draining）的旧 worker 应答。几秒后的重测返回 `200 x-powered-by: Express`——直连应用，网关消失了。

**如果配置改动看起来没有生效，先停一拍再重测，然后再去找第二个原因。**在这种速度的请求面前，「配置错了」和「旧进程还在应答」根本无法区分。

## 我会怎么做不同

1. **在为某个主机名搭建任何东西之前，先列出它的每一条入口路径。**我的检查清单现在有四问，按这个顺序问：
   - 这个主机名是否经过 CDN/隧道代理？如果是，它们的规则才是真正起作用的——先查它们，不要留到最后。
   - 反向代理的 vhost 说了什么？
   - 平台是否在别处镜像了这个 vhost、并且可能重新生成它？
   - 是否还有另一个跳点（VPS、第二层代理、厂商隧道）带着一份自己的路由表副本？
2. **从外部验证，并且验证是哪个软件应答的。**在宿主机上用带 `Host:` 头的 `curl` 只能证明你的配置*自洽*。只有来自公网的请求，再加上 `x-powered-by`/`server` 响应头，才能证明它*真的在生效*。
3. **在搭建网关之前，先搞清楚应用能否消费上游身份。**如果不能，你是在加一道登录而不是减一道——这是个要主动做的决定，而不是事后才发现的问题。
4. **替换之前先数一数。**任何你要全局替换的端口或主机名，出现的次数很可能比你想象的多。`grep -c` 只花一秒钟，却能避免一次宕机。
5. **快照、diff、只改一行、再 diff。**备份的唯一职责是回答「我改了多少？」——而一次 diff 就能精确地回答它。

## 结果

网关是能工作的。但它对每个真实用户都不可见，而在我搞清楚它实际交付了什么——在一个本来就有一道登录的应用前面又加了一道——之后，我把它重新关掉了：清空一个字段、取消关联一个 application、恢复一行配置，用一次来自我网络之外的请求做了验证。

两个第一天就能揪出整个问题的检查，大约只要三十秒：

```bash
curl -sI https://app.example.com/ | grep -i '^x-powered-by'   # who is actually answering?
curl -s  https://app.example.com/ -o /dev/null -w '%{http_code}\n'  # what does a stranger get?
```

如果答案和你配置里说的对不上，那你就是在改错误的层。这值得在你为此花掉一整天之前就知道——更不用说在告诉任何人网关已上线之前了。

---

## 需要为你的业务做这件事吗？

如果你需要在内部工具前面加单点登录、把自托管的应用安全地暴露到公网，或者需要有人审计到底是哪条入口路径在真正服务你的域名——这正是我在做的工作。

- **WhatsApp：** [011-797 2969](https://wa.me/60127972969) —— 点击对话
- **Email：** [me@hoelee.com](mailto:me@hoelee.com?subject=Reverse%20proxy%20%26%20SSO%20enquiry)
- **网站：** [hoelee.com](https://www.hoelee.com)

我为马来西亚的中小企业搭建 authentik 单点登录、加固反向代理和 Cloudflare 隧道、自托管 Docker 环境——并把过程中学到的东西写下来。