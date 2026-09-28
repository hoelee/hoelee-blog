---
title: "Synology 电子表格 API 是一个容器，不是一个 API 端点"
description: "如何在 Synology Office 电子表格上做自动化：官方的 spreadsheet-api 容器，以及四个陷阱——一个假的\"未安装\"、凭据正确却报 401、永远无法通过认证的 2FA，还有一堵权限墙。"
pubDate: 2025-08-20
updatedDate: 2026-09-26
category: devops
tags: [synology, dsm, docker, portainer, rest-api, spreadsheet, debugging, self-hosting]
ogImage: /og/synology-spreadsheet-api-is-a-container.png
banner: /banners/synology-spreadsheet-api-is-a-container.png
draft: false
---

我想要的东西很普通：从我 NAS 上的电子表格读一个单元格，把一个单元格写回去，然后从另一端得到一张图表——不用打开 Excel，也不用把公司的数据送到某个云 API。

我跑着一台 Synology DS1821+，装好了 Synology Office（`Spreadsheet` 套件），所以这看起来是个已解决的问题。它确实是个已解决的问题。只是要穿过四个相互矛盾的假信号才能找到真正的答案，而且其中有一个我中途得出的结论错得相当彻底，值得写下来。

## 为什么这件事值得写

如果你自托管，总有一天你需要一个服务去和同一台机器上的另一个服务对话。这篇帖子里的故障模式并不只属于 Synology——它们就是"厂商把东西寄来了，但不在你会去找的地方"这个问题的通用形态：

1. **API 清单里缺一条，不等于这个 API 不存在。** 我枚举了 1,515 个 API，得出结论说这个功能不存在。其实它是一个容器。
2. **我信任的两个诊断工具在撒谎。** `synopkg` 把一个正在运行的套件报成"未开启"，`ps` 给我看了一台空荡荡、却正在服务生产流量的机器。
3. **范围最精准的凭据失败，看起来却像是你的错。** 密码验证过正确还返回 `401`，几乎总是关于你把请求发到了*哪里*，而不是你发了*什么*。
4. **权限模型在认证之后才咬人。** 你可以完美登录，却仍然对每个文件都收到 `403`，原因在于文件所在的位置。

如果以上任何一条听起来耳熟，这篇帖子的后半部分就是能跑通的完整配置。

## 文档说了什么，以及它为什么把我带偏

Synology 宣传"Office Suite APIs"——面向 Drive、Spreadsheet、MailPlus 和 Calendar 的 REST API。营销页面上逐字列出了我想要的正是这些：

- "读取并写入某个范围内的单元格样式。"
- "新增、重命名、删除表格，并把工作表导出为 CSV 文件。"
- "创建、读取、导出和删除电子表格。执行批量更新……"

文档本身藏在 Synology 账户登录后面——这是很常见的事，不是什么丑闻——但它意味着搜索引擎先找到的是承诺，而不是契约。

于是我自己在 NAS 上找。DSM 暴露了一个网关 API 目录，你可以直接问它存在什么：

```bash
curl -s "http://192.168.1.1:8081/webapi/query.cgi?api=SYNO.API.Info&query=all" \
  | python -c "import json,sys; d=json.load(sys.stdin)['data']; print(len(d), 'APIs')"
```

```
1515 APIs
```

一千五百一十五个。其中出现了 `SYNO.Office.*`——但只有快照和一个"最近使用的公式"列表：

```
SYNO.Office.Sheet.Snapshot
SYNO.Office.Sheet.Snapshot.History
SYNO.Office.Sheet.MruFc
```

没有 values 端点。没有 styles 端点。没有写入端点。我把整个目录过滤了一遍，找任何提到 sheet 或 cell 的东西，结果一无所获，然后我得出结论——并且告诉了托我建这个东西的人——**这台 NAS 没有单元格级的电子表格 API。**

那个结论是错的。我想把错在哪说清楚，因为那个推理错误才是可以复用的部分：**我把一个发现面当成了全部。** 网关目录列出的是 DSM 自己的 Web 网关服务的 API。Office Suite API 不由那个网关提供。它是一个独立服务，作为一个独立产物发布，因此对我跑的那次查询不可见。

## 陷阱一：把正在运行的服务报成未安装的工具

在找到真正的答案之前，我花了不少时间确信这个软件根本没在跑。两条命令让这个说法看起来很成立。

第一条是 Synology 自己的套件状态查询：

```bash
sudo synopkg is_onoff SynologyDrive
sudo synopkg is_onoff Spreadsheet
```

```
SynologyDrive isn't turned on, [262]
Spreadsheet isn't turned on, [262]
```

与此同时两个套件都明摆着在服务请求。`SynologyDrive` 自己的状态文件里是 `status=enabled`，Office 的守护进程也在进程表里——一个任务守护进程、一个跑在 `office` 用户账户下的连接池，还有网关 worker。在这套 DSM 版本上，`is_onoff` 根本不是一个可靠的答案。

第二条命令更糟，因为那是我自己的失误：

```bash
ps w | grep -iE "office|drive|pgbouncer"
```

```
(no output)
```

那看起来像一台死机。它不是。**在 DSM 上，不带 `sudo` 的 `ps` 只会显示你自己的进程。** 用 root 重跑一遍，画面就反转了：

```bash
sudo ps aux | grep -E "office|pgbouncer|synoscgi" | grep -v grep
```

它们全都在。我用两条根本不可能让我看到真相的命令，"证明"了两次这套栈是挂的：

> 如果要从这篇帖子里带走一个习惯：当一个诊断工具说"什么都没有在跑"时，先检查这个诊断工具到底有没有权限看到任何东西。

## 陷阱二：没有启动错误信息的容器

真正的答案，在我停止相信自己亲手得出的证据之后，出现在 Docker Hub 上：`synology/spreadsheet-api`。它不是 Office 套件的一部分，也不是网关端点。它自己的描述说得很清楚：

> "Spreadsheet API 不是 Office 套件的一部分。这个镜像在客户端和 DSM 之间提供代理服务。每个 worker 专属于单个用户和单个电子表格。"

兼容性表格把镜像标签对到 Office 版本上，这是第一件要查的事，因为配对不是可选的：

| Docker 镜像标签 | 所需的 Synology Office 版本 |
|---|---|
| `3.4.1` | 3.7.0 或更高 |
| `3.3.2` | 更老的版本 |

Synology 还警告不要把镜像和 Office 放在同一台机器上，因为每个 worker 会把整个电子表格加载进内存。我仍然把它跑在同一个 DSM 上，并加了内存上限——这是有意的取舍，不是推荐做法。

然后我跑了它，它立刻死掉，吐出一段这个：

```
/app/dist/index.js:424
}`;var ot=UD(function(){return Ht($,qe+"return "+Ee).apply(e,H)});...
```

一段压缩过的 JavaScript——最没用的一类错误信息。真相一旦找到，其实很平常：**`AUTH_SECRET` 是必填项，而且没有默认值。** 它给会话令牌签名。没有它，服务就起不来，而且没法告诉你为什么。

要可靠地读出容器的真实要求，而不是听它的启动噪音，直接向打包产物要答案：

```bash
docker run --rm --entrypoint grep synology/spreadsheet-api:3.4.1 \
  -ohE '.{0,80}process\.env\.PORT.{0,80}' /app/dist/index.js
```

```js
serverPort: parseInt(process.env.PORT) || 3e3,
serverHost: process.env.HOST || "0.0.0.0",
workerTimeout: parseInt(process.env.WORKER_TIMEOUT) || 600*1e3,
```

一行就给出配置契约：`AUTH_SECRET` 给令牌签名，`PORT` 默认 `3000`，`HOST` 默认 `0.0.0.0`，worker 十分钟后回收。它还自带一份 OpenAPI 规范和 Swagger UI，这个我后面会再说到。

## 陷阱三：密码被证明正确，却收到 401

容器跑起来之后，认证成了下一堵墙。这是请求，这是它返回的东西：

```bash
curl -s -X POST http://192.168.1.1:8791/spreadsheets/authorize \
  -H 'Content-Type: application/json' \
  -d '{"username":"<service-account>","password":"<password>","host":"192.168.1.1:5001","protocol":"https"}'
```

```json
{"error":"Unauthorized"}
```

`401 Unauthorized`，而我用的正是刚刚登录过 DSM 的密码。最自然的解读——密码错了、账户错了——是一条死路，而我真走了进去：重新敲一遍密码，在 DSM 登录页试那个账户（能登录），把 HTTPS 换成 HTTP 端口（同样 401）。

真正的问题出在 `host` 字段。这个服务反过来问*你*该对着哪个 DSM 做认证，然后自己跟那个 host 做一次 TLS 握手。我给它的是一个裸 IP 地址，而用那个名字出示的证书和地址不匹配，于是握手失败——代理把一个失败的握手报成 `Unauthorized`，跟密码错误一模一样。

换成一个持有有效证书的主机名，立刻就修好了：

```bash
curl -s -X POST http://192.168.1.1:8791/spreadsheets/authorize \
  -H 'Content-Type: application/json' \
  -d '{"username":"<service-account>","password":"<password>","host":"cloud.example.com","protocol":"https"}'
```

```json
{"token":"eyJhbGciOi...","host":"cloud.example.com"}
```

> **如果你的 Synology API 登录返回 401 而你又确定密码是对的，去查 `host`：它必须是一个容器能接受其证书的名字。一个裸的局域网 IP 不行。**

它返回的令牌是 JWT，有效期 28 天，绑定一个 DSM 会话——所以 DSM 重启或账户被强制登出，它就会失效。集成中途突然冒出来的 `401`，当作"重新授权"来对待，而不是"凭据变了"。

## 陷阱四：2FA 永远无法认证

这个是如果你事先不知道就会浪费最多时间的一个，所以直说：**登录 schema 里没有一次性验证码字段。**

```yaml
AuthorizationBody:
  properties:
    username: {type: string}
    password: {type: string}
    host:     {type: string}
    protocol: {type: string}
```

没有 OTP，没有应用密码，没有令牌交换。如果账户开了两步验证，这个 API 会永远返回 `401`——密码正确也一样，换哪个 host 都一样。唯一可行的安排是开一个关掉 2FA 的专用服务账户，权限只限定在它需要的文件夹——这本来就是更好的做法，也是我一开始就该做的，而不是先用我自己的管理员账户去试。

## 进得来之后：权限陷阱

认证不等于授权。等我的服务账户能登录了，针对我真正关心的那个电子表格的每次调用都返回：

```json
{"statusCode":403,"code":"403","error":"Forbidden","message":"Permission denied"}
```

仔细读一下，它信息量很大：`403 Permission denied` 意味着**文件存在，但你无权拿到。** 一个错误的 ID 会返回别的东西：

```json
{"statusCode":404,"code":"404","error":"Not Found","message":"Spreadsheet not found"}
```

两种不同的失败，两种不同的修法，把两者混为一谈就要白花一个小时。我的问题是位置问题：那个电子表格建在 Synology Drive 的个人 **My Drive** 里，在磁盘上是 `/volume1/homes/<user>/Drive/Document/…`。个人主目录别的 DSM 账户够不着——权限设置不行，共享文件夹的技巧也不行，因为它根本不在任何共享文件夹里。修法是把这个文件移进一个共享文件夹并在那里授予读写权限，或者用 Drive 把那个特定文件分享给服务账户并授予编辑权。

## 修复：一整套能跑通的配置

容器，配上一个真正的密钥和内存上限：

```yaml
services:
  spreadsheet-api:
    image: synology/spreadsheet-api:3.4.1
    container_name: spreadsheet-api
    restart: always
    environment:
      AUTH_SECRET: "<long-random-string>"
      PORT: "3000"
      HOST: "0.0.0.0"
    ports:
      - "8791:3000"
    mem_limit: 2g
```

一条只属于 DSM 的注意事项：DSM 上任何 compose 文件都别写 `cpus:`。它的内核没有 CPU CFS 调度器，这个键会被静默忽略——你得到的是有 CPU 限制的错觉，其实没有任何限制。

然后 API 就能用了，而且形态很讨喜。登录，创建或指定一个电子表格，读写范围：

```bash
TOKEN=$(curl -s -X POST http://192.168.1.1:8791/spreadsheets/authorize \
  -H 'Content-Type: application/json' \
  -d '{"username":"<acct>","password":"<pw>","host":"cloud.example.com","protocol":"https"}' \
  | python -c "import json,sys; print(json.load(sys.stdin)['token'])")

# read a range (sheet-qualified A1 notation)
curl -s -H "Authorization: Bearer ***" \
  "http://192.168.1.1:8791/spreadsheets/<id>/values/Sheet1!A1:C4"

# write a range, formulas included
curl -s -X PUT -H "Authorization: Bearer ***" -H 'Content-Type: application/json' \
  -d '{"values": [["Item","Qty"],["Widget",12],["Gadget",7],["Total","=SUM(B2:B3)"]]}' \
  "http://192.168.1.1:8791/spreadsheets/<id>/values/Sheet1!A1:B4"
```

两个我没想到的细节，都是对我有利的：

- **电子表格 ID 来自 Office 的 URL。** 一个位于 `…/oo/r/<spreadsheetId>` 的电子表格——包括分享链接转到的也正是这个路径——把它那一段放进 API 调用就能寻址。
- **公式是 Office 算的，不是你算的。** 把表格导出成 CSV 返回的是 `=SUM(B2:B3)` 和 `=SUMPRODUCT(B2:B3,C2:C3)` 的*求值后*结果——这些公式我从没在客户端算过。这正是用这个 API 而不是自己解析文件的全部理由：你继承了 Synology 自己的计算引擎。

有一个值得说出来的真实缺口：**没有 list 端点。** 规范声明了一个 "Statistics" 标签，却没有为它提供任何路由（`/statistics` → `404 Route not found`），也没有别的东西能枚举电子表格。你必须已经从文档的 URL 知道那个 ID。对你有意搭好的自动化来说没问题；如果你想浏览，那就没用。

## 从另一端得到一张图表

读单元格只是半件事；最初的要求里还有图表。同一个 API 能直接给你一份真正的 workbook：

```bash
curl -s -H "Authorization: Bearer ***" \
  "http://192.168.1.1:8791/spreadsheets/<id>/xlsx" -o export.xlsx
```

那会返回一个合法的 `.xlsx`——`PK` 魔数，什么都能打开。接着我自己的服务（一个小的 FastAPI 容器，里面有 LibreOffice 负责公式求值，matplotlib 负责渲染）读取范围并生成 PNG 图表和仪表盘，整条管线端到端跑通，不需要 Excel，也不需要任何云依赖：

```
Synology Office  →  spreadsheet-api  →  .xlsx export  →  chart renderer  →  PNG
```

## 重来一次我会怎么做

1. **在断定某个 Synology 功能不存在之前，先去查 Docker Hub。** 我花了不少真实时间，从一个根本不可能包含答案的 API 清单去证明一个反面结论。`synology/*` 在 Docker Hub 上，一次搜索就到。
2. **一开始就用一个关掉 2FA 的专用服务账户**，权限限定在单个共享文件夹。我先用管理员账户试，所以同一小时内同时撞上了 2FA 墙和 `403` 墙。
3. **当一个诊断工具说"什么都没有在跑"，检查它的权限。** DSM 上不带 root 的 `ps` 不是进程列表，它是你自己的进程列表，它会高高兴兴地让你得出机器已死的结论。
4. **读容器本身，别只读它的文档。** 厂商自己的运行命令在镜像页面上，但精确的默认值（`PORT` 3000，worker 超时 600 秒）和必填的 `AUTH_SECRET` 来自 grep 打包产物——一条命令，不用猜。

## 结果

在 NAS 上端到端验证：登录、创建、写单元格、读回单元格、CSV 导出和 `.xlsx` 导出全部返回 `200`，CSV 导出证明了 Office 引擎在服务端求值了 `=SUM`/`=SUMPRODUCT`。导出的 workbook 喂给图表服务，把同一份数据渲染成 PNG。四个陷阱记录在案，一个错误结论得到纠正，大约一天的活——现在我自己的硬件上有一份脚本可以驱动的电子表格。

---

*我在马来西亚为小企业做这类自托管集成——电子表格和 NAS 自动化、仪表盘，以及把你的数据留在你自己硬件上的内部工具。如果你需要这类东西，[WhatsApp 联系我](https://wa.me/60127972969) 或 [给我发邮件](mailto:me@hoelee.com?subject=Self-hosted%20spreadsheet%20automation)——也可以看看我在 [hoelee.com](https://hoelee.com) 还做些什么。*