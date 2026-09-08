---
title: "Authentik 从 2025.8 升级到 2026.8：那些没人提醒你会坏掉的部分"
description: "一年份的 authentik 大版本升级踩坑记录：存储挂载变更、RBAC 会话清理、可信代理，以及 authorization_flow 与 authentication_flow 搞混导致 SSO 彻底瘫痪。"
pubDate: 2026-09-09
category: devops
tags: [authentik, sso, docker, portainer, self-hosting, oidc, upgrade]
---

我把 authentik 当作自托管体系前面的单点登录闸门——邮箱、仪表盘、Synology
应用、远程访问 outpost 都在它后面。很长一段时间它停在 **2025.8.3**，一年的
版本更新堆积成山。这篇文章记录我是怎么一口气把它升到 **2026.8.1** 的，以及
沿途每一步坏掉的地方——尤其是我犯的那个让单点登录彻底瘫痪、逼每个内部
应用都重新要密码的错误。

## 什么是 authentik，为什么要用它？

authentik 是一个开源的**身份提供商（IdP）**——反复回答同一个问题的那个组件：
*「这个人是谁，允许他进来吗？」* 你可以把它想成整栋应用大楼的前门。与其让每个
应用都跑自己那套用户名/密码页面（还有自己那一堆 bug、自己的「忘记密码」流程、
自己的二次验证），不如让所有应用都来问 authentik。

它支持真实部署里真正用得上的协议：

- **OIDC / OAuth2** —— 现代单点登录标准（「用 Google 登录」底层用的就是它）。
- **SAML** —— 企业标准（Grafana、Jira，或任何老旧的业务系统都能接）。
- **LDAP** —— 让只认 LDAP 的老客户端和 NAS 也能加入。
- **Proxy / forward-auth** —— 通过反向代理挡在应用前面，请求还没碰到应用就已经
  完成了鉴权。

实际的好处，按重要性排序：

1. **一个登录通行所有。** 登录一次，在每一个应用之间自由穿梭。用户不用再记一打
   密码（也不用再陪着一堆由此而来的客服工单）。
2. **一个地方收紧安全。** MFA、密码策略、会话限制、账户找回，都在 authentik 里
   配一次——而不是每个应用各自重新实现一遍。
3. **一个地方做审计。** 每一个登录、每一个应用、每一个用户，都在同一个日志里。
   出问题时，这就是「我们以为没事」和「我们有证据」之间的区别。
4. **自包含、可自托管。** 数据归你所有。没有按人头收费、随团队规模膨胀的 SaaS
   费，也没有锁定——它是 AGPL 许可，跑在 Docker 里。

对一个运营着二十几个服务（邮箱、仪表盘、NAS 应用、内部工具）的小企业或独立
开发者来说，authentik 就是「每个应用各有一个脆弱密码」和「一道加固过的前门」之间
的区别。

## 为什么要升级

2025.8.3 本身没坏。但它落后太久，后面的版本里已经累积了一堆 CVE 漏洞修复，
而且我正准备做按应用区分品牌。authentik 自己的策略是不允许跨大版本跳级——
它强制要求逐级走。所以计划是：

```
2025.8.3 → 2025.10 → 2025.12 → 2026.2 → 2026.5 → 2026.8
```

六跳，一次一步，每步之间跑一次迁移 + 一次健康检查。动手之前，有一个绝对
不能省的步骤：**备份数据库**。authentik 不支持降级。如果迁移只跑了一半，
你是从备份恢复，而不是回滚镜像 tag。

```bash
sudo docker exec authentik-postgres pg_dump -U authentik authentik > authentik-backup.sql
```

## 坑 1：Portainer 才是真相源，不是 compose 文件

我的第一反应是编辑磁盘上的 `docker-compose.yml` 然后 `up`。错的。这个 stack
是由 **Portainer**（stack 143）管理的，真正的 compose 和环境变量都保存在它
自己的存储里。磁盘上的 `.env` 早就过时了——它的 `PG_PASS` 跟 Portainer 实际
运行的对不上。

正确的更新路径是走 Portainer API，而不是文件系统：

1. 更新 compose 内容里的镜像 tag。
2. **先** `docker pull` 新镜像（这样 API 调用不会在拉取中途超时）。
3. `docker stop` + `docker rm` 正在运行的容器（否则固定的 `container_name`
   会在重新部署时冲突）。
4. 用新的 `StackFileContent` + `Env` 调 `PUT /api/stacks/143?endpointId=2`。

我撞上了容器名冲突错误、拉取超时错误，还有一个网络连接问题——重建后的
`authentik-server` 只接入了它两个网络里的一个，导致无法解析 `postgres-server`。
一旦你看懂了门道，每个问题都是五分钟的修复；但凑在一起，耗掉了我大半个晚上。

## 坑 2：存储挂载迁移了（2025.12）

在 2025.12 之前，品牌资源放在 `/media/` 下，通过 `/media/...` 提供服务。
2025.12 之后存储结构变了：文件迁移到 `/data/media` 结构，通过一个新的
`/files/media/public/<name>?token=...` URL（带 JWT 签名）提供服务。我的容器
还在挂载 `./media:/media`，所以我一跨过那个版本，每个 logo、favicon、背景图
全部 404。

修复方式就是官方文档里的迁移：

```bash
mkdir -p data && mv media data/media
```

……然后把挂载改成 `./data:/data`。新的文件后端还要求 `/data` 必须是一个真正的
挂载点才肯工作——我最开始的修复用的是符号链接，结果后端 `is_mount()` 检查
直接报错 `No file management backend configured`。

## 坑 3：RBAC 迁移留下一张被污染的表

2025.12 为了 RBAC 重构，删除了旧的 `authentik_core.User_groups` 模型。迁移
本身跑得很干净，但**旧会话**仍然引用着这个已删除的模型。结果：登录页一直抛
`LookupError: App 'authentik_core' doesn't have a 'User_groups' model`。

不是 `django_session`——那张表是空的。真正的元凶是 authentik 自己的
`authentik_core_session` 表。清空它（以及其他 session 表）强制所有人重新登录，
错误也随之消失：

```sql
TRUNCATE authentik_core_session;
```

有个副作用值得知道：这也会让你各应用持有的所有 OIDC refresh token 失效。它们
会把你弹去重新登录一次，然后恢复。这是一次性的麻烦，不是 bug。

## 坑 4：可信代理现在变成了显式选择（2026.8）

2026.8 收紧了默认的转发头处理。之前 authentik 信任所有内网段；现在它只信任
你显式列出的那些。在转发到 `localhost` 的 Synology 反向代理后面，意味着：

```yaml
environment:
  AUTHENTIK_LISTEN__TRUSTED_PROXY_CIDRS: 127.0.0.0/8,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,::1/128
```

跳过这一步，代理头就会被拒绝，表现出来的认证失败症状，跟你实际上遇到的问题
长得几乎完全不像。

## 坑 5：那个搞坏 SSO 的——authorization_flow 和 authentication_flow 搞混

这是最贵的一个错误，而且如果你要做按应用区分品牌，特别容易搞混。

authentik 里的 provider 有**两个** flow 字段，含义完全不同：

```python
# "未登录用户访问关联应用时用的认证 flow"    ← 登录页
authentication_flow = models.ForeignKey(...)

# "授权这个 provider 时用的 flow"           ← OAuth 授权确认页
authorization_flow = models.ForeignKey(...)
```

- `authentication_flow` 是**登录页**。你要给每个应用定制标题和背景，应该把
  各自独立的 flow 放在这里。
- `authorization_flow` 是**已登录**用户的授权确认（consent）步骤。

我想要每个应用不同的背景图，于是给每个应用建了一个 flow，然后把 provider 的
`authorization_flow` 指向它。瞬间就坏了：一个已经认证的用户，每次打开另一个
应用，还是会被拖过完整的识别 → 密码 → MFA 流程。单点登录，实际上等于没了。

修复就是一条 UPDATE，把两个字段放回它们该在的位置：

```sql
UPDATE authentik_core_provider
SET authorization_flow_id = '1d85b1b1-...',   -- explicit-consent flow
    authentication_flow_id = 'aa##-per-app-flow'
WHERE ...;
```

而品牌本身——按应用区分的背景和标题——是放在 **flow 自身**的 `background` 和
`title` 字段上（2026.8 起可写），而不是放在 brand 的域名匹配上。

这个坑后面还藏着一个相关的坑。我创建那 18 个按应用区分的 flow 时，它们全都
落成 `designation=authentication`，而我的 `auth.hoelee.com` brand 的
`flow_authentication` 是 `NULL`。authentik 在一个 brand 没有显式认证 flow 时的
回退逻辑，是**按 slug 字母序**选第一个 authentication flow——碰巧就是
`auth-agent`，而不是 `default-authentication-flow`。于是根登录页开始显示我
agent 的背景图。把 brand 的 `flow_authentication` 设成真正的默认 flow 才修好。

还有一个跟 RBAC 坑叠加的问题：创建 flow 会设置它的 `background`，但**不会设置
它的 stages**——`stages` 在 flow 对象上是只读的。一个没有任何 stage 绑定的空
flow，正是迁移早期登录页无限重定向循环的罪魁祸首。stage 绑定是单独创建的：

```
POST /api/v3/flows/bindings/   # { target: "<flow pk>", stage: "<stage pk>", order: N }
```

## 我会怎么做得不一样

整场折腾归结为三个本可避免的模式：

1. **绝不要靠猜字段的语义**——我把 `authorization_flow` 当成了「登录 flow」，
   而真相源是模型定义，字段自己的 docstring 里就把区别写得明明白白。
2. **跟 API 表面保持距离**——每次服务器重启，API token 都中途过期，结果关键
   修复我直接用 `psql` 对着数据库做了。可靠，但应该在集群着火**之前**就脚本化，
   而不是着火的时候。
3. **每次重启只处理一个破坏性变更**——我试图一口气推理存储、RBAC、代理的
   全部变化。每一个如果单独隔离、独立验证，都会很简单。

## 结果

authentik 现在跑着 **2026.8.1**——最新、已打补丁、所有容器健康——18 个应用各自
在登录页显示自己的背景和标题，SSO 在每个子域都正常工作。我日常用的 17 个应用，
从「每次切换应用都要重新登录」回到了「登录一次，畅通无阻」。

值得记住的教训：认证基础设施的大版本升级，大概 10% 是「改镜像 tag」，90% 是
「数据模型、存储结构、代理规则在你脚下全都挪了位」。做好备份，一次走一个版本，
当某个东西表现得完全不合理时，伸手去抓下一份配置之前，先把字段名再念一遍。

---

## 想为你的企业搭一套单点登录？

如果你正在运营好几个内部应用——仪表盘、邮箱服务器、工单系统、文件服务器——而
你的团队还在一个个分开登录（或者到处重复用同一个密码），我搭设和维护的正是这类
基础设施。我会帮你部署 authentik、接到你现有的应用上、加上 MFA，确保「登录一次」
真的能跑通——最后还会给你一份交接文档，让你永远不会被锁死。

联系我：[me@hoelee.com](mailto:me@hoelee.com)，或 WhatsApp
[+60 12-797 2969](https://wa.me/60127972969)，看看我在
[hoelee.com](https://hoelee.com) 做的东西。