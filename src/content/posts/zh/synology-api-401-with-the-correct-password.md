---
title: "密码正确，Synology API 登录却返回 401，问题出在哪"
description: "两种原因，同一个报错：Office Suite API 对 TLS 握手失败和受 2FA 保护的账号返回完全相同的错误。三条命令就能区分，不必折腾一下午。"
pubDate: 2025-09-10
updatedDate: 2026-09-26
category: notes
tags: [synology, dsm, rest-api, tls, 2fa, debugging, authentication]
ogImage: /og/synology-api-401-with-the-correct-password.png
banner: /banners/synology-api-401-with-the-correct-password.png
draft: false
---

你搭好了 Synology 的 Office Suite API，把凭据发过去，得到的却是：

```json
{"error":"Unauthorized"}
```

然后你用这组密码登录 DSM 验证——一切正常。你重新输入一遍，改用 HTTP 而不是 HTTPS，怀疑是不是账号缺了什么找不到的权限。这些全都是白费功夫，因为在这套 API 上，密码正确却返回 `401` 的原因恰好只有两个，而这两个都不是密码的问题。

## 原因一：`host` 字段必须是一个名字，且证书要能被容器接受

这个 API 是自配置的：每次登录调用时，由你来告诉*它*要对哪台 DSM 进行认证。

```bash
curl -s -X POST http://<api-host>:8791/spreadsheets/authorize \
  -H 'Content-Type: application/json' \
  -d '{"username":"acct","password":"pw","host":"192.168.1.1:5001","protocol":"https"}'
```

```json
{"error":"Unauthorized"}
```

代理会与那个 `host` 自行完成 TLS 握手。裸 IP 地址通常拿到的证书是为某个主机名签发的，于是握手失败——而失败的握手会被报告为 `Unauthorized`，和密码错误一模一样。响应里没有任何线索指向 TLS。

同样的请求、同样的凭据，把 `host` 换成一个持有有效证书的名字：

```bash
-d '{"username":"acct","password":"pw","host":"cloud.example.com","protocol":"https"}'
```

```json
{"token":"eyJhbGciOi...","host":"cloud.example.com"}
```

修复方法就这么多。**规则：`host` 的值必须是一个 FQDN，且其证书能被容器接受；如果端口不是该协议默认端口，也要一并写上。**

## 原因二：双重认证在这里永远行不通

第二个原因是结构性的。登录的 schema 只有四个字段，没有一次性验证码字段：

```yaml
AuthorizationBody:
  properties:
    username: {type: string}
    password: {type: string}
    host:     {type: string}
    protocol: {type: string}
```

没有 OTP，没有应用专用密码，也没有设备令牌交换。启用了 2FA 的账号，无论在哪个 `host` 上、无论密码多正确，都会永远返回 `401`。请改用关闭了 2FA 的专用服务账号，并把权限范围限定在它需要的文件夹上。

## 三条命令区分二者

别靠猜——用不了一分钟就能把两种原因分开。

**1. `host` 是否可达，并且是否为该名字提供了有效证书？**

```bash
curl -sS -o /dev/null -w '%{http_code} %{ssl_verify_result}\n' https://cloud.example.com/
```

非零的 `ssl_verify_result` 指向原因一。（在信任该证书的机器上，同一命令返回 `0`。）

**2. API 到底有没有应答？它对乱写的垃圾请求是不是也这么拒绝？**

```bash
curl -s -o - -w '\n%{http_code}\n' -X POST http://<api-host>:8791/spreadsheets/authorize \
  -H 'Content-Type: application/json' \
  -d '{"username":"nobody","password":"wrong","host":"cloud.example.com","protocol":"https"}'
```

```json
{"error":"Unauthorized"}
401
```

和你失败的那次调用输出一样——这正是关键。它证明服务是活的，并且 `401` 是它对*所有*认证失败的通用回答，TLS 失败也不例外。如果容器宕了，你得到的是连接错误而不是 `401`，所以这一步也能排除"API 没在运行"。

**3. 一个关闭了 2FA 的账号在好用的 `host` 上能成功吗？** 如果非 2FA 服务账号能用而你的管理员账号不行，那就是原因二。

## 相关的坑：几周后才冒出来的 `401`

你拿到的 token 是一个有效期 28 天的 JWT，但它绑定在 DSM 会话上。DSM 重启，或该账号被强制登出，都会让它提前失效。所以昨天还能用的调用今天返回 `401`，意思是"重新认证"，而不是"我的凭据变了"——先检查 token 的年龄，再去找配置回归的问题。

而且登录进去之后，别把下一道墙和这一道搞混：`403 Permission denied` 表示文件存在但账号拿不到（通常是文件放在个人的 `My Drive` 主目录里，其他 DSM 账号都访问不到）；`404 Spreadsheet not found` 则表示 ID 写错了。不同的问题，不同的修法。

完整的搭建过程——容器、compose 文件、可用的调用，以及我踩过的四个坑——都在 [Synology Spreadsheet API 是一个容器，不是一个 API 端点](/posts/synology-spreadsheet-api-is-a-container/) 里。

---

*我为马来西亚的中小企业构建自托管的集成和内部工具——[WhatsApp](https://wa.me/60127972969) 或 [邮件](mailto:me@hoelee.com?subject=Synology%20API%20integration)。更多信息见 [hoelee.com](https://hoelee.com)。*
