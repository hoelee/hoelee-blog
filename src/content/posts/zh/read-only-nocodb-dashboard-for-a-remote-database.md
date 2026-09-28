---
title: "给另一台机器上的数据库配一个 NocoDB 只读看板"
description: "把 NocoDB 直接指向另一台机器上的 MySQL/MariaDB，一行数据都不用复制 —— 以及我踩到的 Docker SNAT 源 IP 陷阱和两个 API 陷阱。"
pubDate: 2026-09-29
category: devops
tags: ["nocodb", "mysql", "mariadb", "docker", "networking", "dashboard"]
ogImage: /og/read-only-nocodb-dashboard-for-a-remote-database.png
banner: /banners/read-only-nocodb-dashboard-for-a-remote-database.png
draft: false
---

我的报告应用把每一条留资、每一张订单都写进一台小 VM 上的 MariaDB。真正在跑这门生意的人想**看**这些行 —— 筛选、排序、导出 —— 但不想 SSH 进 VM，也不想每次都来问我。

最直觉的答案是做一个表格风格的后台界面。最糟的答案是把数据复制一份。这篇写的是我最后落地的配方：**让 NocoDB 直接指向真库，用的账号只能 `SELECT`** —— 外加三个吃掉我半下午的坑，其中一个是 Docker 网络事实，在任何「容器访问局域网」的场景里都会咬人，不只是这一次。

## 为什么不把行同步进 NocoDB？

给业主做看板有三条路，另两条也是正路，只是各有代价：

1. **应用写入时顺手推一份到 NocoDB 的 API。** 每条记录写两次、两边都要处理失败，而且推送第一次失败的那一刻，看板就开始悄悄漂移 —— 它变成了一个「通常是对的」的第二数据源。
2. **cron 定时同步。** 同样的重复数据，再加一个延迟窗口，再加一个「谁赢了」的问题：有人在看板里改了行怎么办？
3. **把数据库当作 NocoDB 的外部数据源。** 零重复、永远实时、一份连接配置。看板**就是**这个库，只是换了个方式看。

我选了第 3 条。代价说在前面：数据库的端口必须能被 NocoDB 所在的主机访问到，而且 NocoDB 手上会有一个数据库凭据。只要这个凭据是「只读 + 限定一个来源主机」的账号，这两点都可以接受 —— 后面的内容就是怎么把它做出来。

## 没人提醒你的坑：数据库到底看到哪个 IP

这是我最先做错的地方，而且它和 NocoDB 无关。

我的 NocoDB 跑在群晖 NAS 的 Docker 里，位于一个自定义 bridge 网络（`bridge_hoelee`，容器 IP `172.16.0.4`）。它要连的 MariaDB 在另一台机器 `192.168.1.124` 上 —— 在 bridge 子网之外。

我的第一反应是给容器子网授权：

```sql
-- 错的（更准确说：没用）：容器自己的 IP 根本不是服务端看到的地址
CREATE USER 'nocodb_ro'@'172.16.0.%' IDENTIFIED BY '<password>';
```

它永远匹配不上。当容器连接**自己 bridge 网络之外**的地址时，流量会经宿主机做 NAT 出去 —— Docker 的 masquerade 规则把源地址改写成**宿主机**的 IP。数据库看到的是 `192.168.1.1`（NAS），不是 `172.16.0.4`（容器）。

别推理，去量。在**同一个 bridge 上任意一个容器**里跑一条 `SELECT` 就能得到真相，十秒钟的事：

```bash
docker exec mysql-server mysql -h192.168.1.124 -unocodb_ro -B -e "SELECT CURRENT_USER();"
# nocodb_ro@192.168.1.1        <- 宿主机 IP，不是容器 IP
```

（口令用 `MYSQL_PWD` 传，别用 `-p<password>`：写在命令行里会进 `ps` 输出和 shell 历史。）

知道来源地址之后，授权就是一行 —— **一个 host、一个库、一个权限**：

```sql
CREATE USER 'nocodb_ro'@'192.168.1.1' IDENTIFIED BY '<password>';
GRANT SELECT ON appdb.* TO 'nocodb_ro'@'192.168.1.1';
FLUSH PRIVILEGES;
```

给看板账号两条我建议照做的规矩：

- **绝不复用应用自己的数据库账号。** 应用的账号能 `INSERT`/`UPDATE`/`DELETE`，看板的不能。万一这个凭据从浏览器会话里漏出去，影响面是「有人能读数据」，而不是「有人能改写生意」。
- **授权到确切的来源地址，不要通配。** `'192.168.1.1'` 就一行字，而且经得起 `SHOW GRANTS` 复核。

## 用 API 建外部数据源

NocoDB（我这边镜像是 `nocodb/nocodb:2026.09.0`，监听 `10380`）有 meta API；workspace token 存在它自己元数据库的 `nc_api_tokens` 表里。建一个外部 MySQL 数据源的调用长这样：

```bash
curl -s -X POST "$NC/api/v2/meta/bases/$BASE/sources" \
  -H "xc-token: $TOKEN" -H 'Content-Type: application/json' \
  -d '{
        "type": "mysql2",
        "title": "app-vm",
        "config": {
          "client": "mysql2",
          "connection": {
            "host": "192.168.1.124", "port": 3306,
            "user": "nocodb_ro", "password": "<password>",
            "database": "appdb"
          }
        }
      }'
# {"id":"joblzodc9u91flnkw"}
```

这个返回有两个意外：

1. **拿到的是 job id，不是数据源。** 建源是异步的。而且**没有**任何查询 job 状态的路由 —— 我试了 `/api/v2/jobs/{id}`、`/api/v1/db/meta/jobs/{id}`、`/api/v2/meta/jobs/{id}`、`/api/v1/jobs/{id}`，四个全是 404。别在那儿轮询，去验证结果。
2. **它会把那个库里已有的表全部自动同步进 base。** 你不需要一张张加表。几秒之后，我的四张表已经全在 base 里了。

我最后用的验证方式是读数据源列表、看 `meta`：

```
source budabxoawz5lwn9 type=mysql2 order=1 meta=None
source b2sdp3iw0ed1bgo type=mysql2 order=2 meta={'dbVersion': '10.11.19-MariaDB-ubu2404'}
```

那个 `dbVersion` 是**对端**服务器回显的版本，所以它既是「连接成功」的证据，也顺手提醒你对面是 MariaDB 而不是 MySQL。

之后读行就是正常的 records API：

```bash
curl -s -H "xc-token: $TOKEN" \
  "$NC/api/v2/tables/m01ejjhhne1h59z/records?limit=1" | jq '.pageInfo.totalRows'
```

## 陷阱：`POST /meta/bases/{id}/tables` 不是「挂载这张表」

因为表是自动出现的，我就以为那条建表路由是同一件事的**手动**版本 —— 从指定数据源挂一张已有的表。并不是。`POST /api/v2/meta/bases/{baseId}/tables` 是**在 base 的默认源里新建一张空表**。我传了四个表名，结果在 NocoDB 自己的内部数据库里多出四张空表：`nc_pd1g___leads`、`nc_pd1g___orders` 之类。

它们能干净删掉（`DELETE /api/v2/meta/tables/{tid}`），而且因为真表在外部源里，什么也没坏。但这是个很好的例子：**一个名字暗示「连接」、行为却是「新建」的 API 路由。** 对外部源来说，你想要的同步在建源那一刻就已经做完了。

## 只读源要付的代价

只读是设计目标，但它确实有两个看得见的后果，我宁愿写下来而不是假装不存在。

**你改不动表的元数据。** 我想把 leads 表的主显示列改成姓名，NocoDB 自动挑的是一个去重哈希。把列提升为主显示列时返回：

```
400 {"error":"ERR_DATABASE_OP_FAILED","message":"This request couldn't be processed by the database..."}
```

列顺序和显示与否，去视图（UI）里调。这是外观问题，不是数据问题。

**`DATETIME` 列会带上 UTC 标签。** 本地时间 01:54 写入的行，读回来是 `2026-09-27 01:54:16+00:00`。值是对的，时区后缀只是展示层的事。拿来浏览没问题，拿它做跨时区换算就错了 —— 别在它上面搭逻辑。

这里还藏着一个小小的证明：自动同步把我应用的 `migrations` 表也拉进来了（它也就是一张表）。想把它从 base 里删掉时，报的是 `DROP command denied` —— 拒绝来自**数据库**，不是 NocoDB。这就是只读授权在干活，它比任何 UI 标签都更值得当作验收依据。

## 四个值得顺手拿走的小坑

1. **认服务要看端点，不要看你记忆里的端口。** 我第一批探测打到了错的端口，返回的是 Go 风格的 `404 page not found` 正文 —— 看起来就像「这个版本 API 搬家了」。在对的端口上 `curl -s /api/v1/health` 回了 `{"message":"OK"}`，一秒钟定案。相关的一点：未认证的 NocoDB meta 调用回的是 **401**；如果你拿到 404 且正文是 Go 味道的，说明你在跟另一个进程说话。
2. **NocoDB 的 `NC_DB` 不是 DSN。** 它是 `mysql2://mysql-server:3306/?d=<db>&u=<user>&p=<password>` —— 要解析 **query string**。我按 `user:password@host` 解析，得到空 host，然后静默跳过了一整段验证。
3. **软删除的 base 会回 `404 ERR_BASE_NOT_FOUND`。** base 其实还在 `nc_bases_v2` 里（`deleted=1`），但对 API 不可见。「Not found」在这里的意思是**已删除或超出权限范围**，不是**路由写错了** —— 先去 meta 表里查一眼，别在 URL 里找错字。
4. **base 列表是按 token 的 workspace 过滤的。** workspace token 只会列出该 workspace 里活着的 base。列表短得可疑，是权限范围或软删除的症状，不是认证失败。

## 换我会怎么做

- **先量出来源地址，再写授权。** 我因为按容器的 IP 去推理，先授了一个容器子网通配。十秒钟的 `SELECT CURRENT_USER()` 就能告诉我答案，而且这是你没法可靠地从 compose 文件里推出来的事实。
- **把只读当成架构，而不是限制。** 接受看板改不动元数据，外观的活留给视图层。
- **压根别碰建表那条路由。** 建源时已经全部导入完了；多伸一次手，只是给自己制造清理工作。
- **每个消费者一个数据库账号** —— 应用、看板、备份任务各一个。看板这个凭据最可能被贴进浏览器或工单里，所以它应该是整个系统里权限最弱的那个。

## 结果

- 一个外部数据源，**四张表实时可用**（留资、订单、订单文件、代理台账），**零重复行** —— 业主看到的就是应用写入的同一批行，写进去就能看到。
- 看板账号只能对**一个库、来自一个主机**做 `SELECT`，而且这是由**数据库**保证的：NocoDB 自己发起的删表尝试返回 `DROP command denied`。
- 耗时：第一遍约 30 分钟的 API 试探；配方写下来之后约 10 分钟（授权 → 建源 → 验证 `dbVersion` → 读一行）。

如果你是要给客户做这件事，这个形态值得照抄，哪怕最后选的不是 NocoDB：**看板连的是真数据，用的账号物理上写不进去，而且两半都要验证** —— 连接是通的（`CURRENT_USER()`、`dbVersion`），账号是无害的（`DROP` 被拒）。

---

*我是 Lee Teong Hoe（Mr Hoelee）。我负责把这类自托管看板接到已有数据库上 —— 最小权限账号、NocoDB 或纯 SQL 视图、放在 Traefik 与 Cloudflare 之后，跑在 NAS 或小 VM 上。*

*需要给你的生意搭一套？[WhatsApp +60 12-797 2969](https://wa.me/60127972969)
· [me@hoelee.com](mailto:me@hoelee.com?subject=Read-only%20dashboard%20for%20my%20database)
· [hoelee.com](https://hoelee.com)*
