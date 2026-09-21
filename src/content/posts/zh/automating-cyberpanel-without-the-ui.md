---
title: "不用界面管理 CyberPanel：逆向一个没有文档的 v2 API"
description: "CyberPanel v2 砍掉了有文档的 JSON API，只留下 Angular 界面自己调用的 session + CSRF 端点。这篇文章讲清确切的认证流程，以及我怎么从页面背后挖出真正的函数。"
pubDate: 2026-09-09
category: devops
tags: [cyberpanel, api, reverse-engineering, automation, django, self-hosting, curl]
ogImage: /og/automating-cyberpanel-without-the-ui.png
banner: /banners/automating-cyberpanel-without-the-ui.png
---

我在家庭实验里的一台 Ubuntu 虚拟机里跑着 CyberPanel 2.4.4.1，用来托管几个小站，
入口是 `https://panel.hoelee.com`，反向代理到内网的一台机器。最近我想不打开浏览器、
直接用脚本做两件事：列出我的站点、删掉其中一个。这篇文章讲的就是我怎么发现"官方
API"根本已经不存在了，然后从 Angular 界面偷偷调用的那些请求里把真正的 API 逆向出来。

## 问题：有文档的 API 已经没了

网上每一个搜索结果、Apiary 文档、还有 Knowledge Base，都指向同一套东西——一个 JSON
API，把 `adminUser` 和 `adminPass` 通过 `POST` 发给 `/api/verifyConnection`：

```bash
# 旧文档教你这么干。在 CyberPanel v2 上这根本行不通。
curl -k -X POST https://panel.hoelee.com:8090/api/verifyConnection \
  -d '{"adminUser":"admin","adminPass":"...","serverUserName":"..."}'
```

在 CyberPanel v2（2.4.x）上，这只会返回一堆没用的东西。`/api/` 前缀是遗留的旧接口，早
就被砍掉了。已经没有 `adminUser`/`adminPass` 那套交换了。官方文档就是过时了——这是第
一个陷阱：你很容易花上一大把时间去信一套描述的并不是你正在跑的那个版本的文档。

## 我试了什么，以及为什么失败

**第一次尝试——信文档。** 按 Apiary 说的，带上凭据 `POST /api/verifyConnection`。结果：
404。这个路由根本不存在。

**第二次尝试——硬猜路径。** 我试了 `/api/`、带一个 `email` 字段的 `/verifyLogin`、
还有几个瞎猜的裸 `GET`。拿回一个我一开始老是读错的响应：

```
"This request need session."
```

这句话其实是**好消息**——它说明 API **是**挂着的、能连上的，只是没有有效会话就拒绝
跟你说话。端点没缺，缺的是认证方式不一样。

**第三次尝试——CSRF 这堵墙。** 我终于把正确的字段发给 `/verifyLogin`，结果撞上一个
硬邦邦的 **403 Forbidden**。这是卡住绝大多数人的地方：发往 Django 后端面板的 POST 都
受 CSRF token 保护，一个不带 token 的裸 JSON POST 会在你的凭据都没被看上一眼之前就被
丢掉了。

突破口在于：别把面板当成"一个带 API 的东西"，而是当成**一个带 Angular 前端的 Django
应用**——然后只要盯着前端到底发了什么就行。

## 修复：真正的认证流程

整件事就三步，全部用普通的 `curl`（加上 `-k`，因为面板用的是自签证书）：

### 1. 从登录页拿到 CSRF token

Django 在第一次 GET 时就会设一个 `csrftoken` cookie。这个 cookie 的值就是你要在每次写
操作时用头部回显回去的 token：

```bash
curl -sk -c /tmp/cp_cookies.txt "https://192.168.1.124:8090/" -o /dev/null
CSRF=$(grep csrftoken /tmp/cp_cookies.txt | awk '{print $7}')
```

### 2. 登录，拿到会话 cookie

`POST /verifyLogin`，带上 JSON body，并在 `X-CSRFToken` 头部带上 CSRF token：

```bash
curl -sk -b /tmp/cp_cookies.txt -c /tmp/cp_cookies.txt \
  -X POST "https://192.168.1.124:8090/verifyLogin" \
  -H "Content-Type: application/json" \
  -H "X-CSRFToken: $CSRF" \
  -H "Referer: https://192.168.1.124:8090/" \
  -d '{"username":"admin","password":"...","languageSelection":"EN","twofa":""}'
# => {"userID": 1, "loginStatus": 1, "error_message": "None"}
```

`loginStatus: 1` 说明会话 cookie 现在有效了。`Referer` 头部比你想的还重要——有
些 view 会去检查它。

### 3. 调用数据端点

所谓"API"，其实就是 Angular 界面调用的那几个 POST 端点。`/<module>/<function>`，同
一个 cookie jar，同一个 `X-CSRFToken` + `Referer`：

```bash
curl -sk -b /tmp/cp_cookies.txt \
  -X POST "https://192.168.1.124:8090/websites/fetchWebsitesList" \
  -H "Content-Type: application/json" \
  -H "X-CSRFToken: $CSRF" \
  -H "Referer: https://192.168.1.124:8090/" \
  -d '{"page":1,"recordsToShow":50}'
```

这把我所有站点都吐出来了，带 SSL 状态、磁盘占用、PHP 版本，还有每个站离证书过期还剩
几天。同样的套路能删站：

```bash
curl -sk -b /tmp/cp_cookies.txt \
  -X POST "https://192.168.1.124:8090/websites/submitWebsiteDeletion" \
  -H "Content-Type: application/json" \
  -H "X-CSRFToken: $CSRF" \
  -H "Referer: https://192.168.1.124:8090/" \
  -d '{"websiteName":"blog.hoelee.com"}'
```

## 最耗时间的两个坑

**1. `/api/...` 那个 404 从来不是网络问题——是时代搞错了。** `/api/` 前缀属于旧 API。
现代 CyberPanel 用的是根相对路径 `/<module>/<function>`，没有 `/api/` 这一段。一旦我不
再去找"API"，而是去找 UI 自己的路由，一切就都对上了。

**2. 列表响应是双重编码的 JSON。** `fetchWebsitesList` 返回的东西长这样：

```json
{ "data": "[{\"domain\":\"...\",\"ssl\":{\"days\":17}, ...}]" }
```

`data` 这个 key 是一个 **JSON 编码的字符串**，不是一个数组。你要是直接把它喂给 `jq`
再 `.[]`，拿不到任何有意义的东西。得先剥掉一层：

```bash
curl ... | jq -r .data | jq      # 先把字符串解出来，再解析一次
```

## 怎么找到其它端点

函数名不是随便起的——它们直接对应 CyberPanel 源码里的 Django view 函数（GitHub 上
`usmannasir/cyberpanel`，`stable` 分支）。相关文件是 `websiteFunctions/views.py`、
`mailFunctions/views.py`、`manageSSL/views.py` 等等。所以流程是：

1. 在 UI 里找到那个页面（比如"创建站点"）。
2. 打开浏览器 network 面板，看它 POST 到哪个 URL——或者去对应的 `views.py` 里 grep 那
   个 view 名。
3. 用你的会话 + CSRF 头部，调用同一个 `/<module>/<function>` 路径。

有个很有用的区分：`GET /<module>/<page>` 通常返回**那个 UI 页面的 HTML**，而**数据**
来自对一个姊妹函数的 POST。如果你 GET 一个页面拿回来的是 markup，那你还没找到真正的
端点——继续找那个 AJAX 调用。

## 我会怎么做不一样

1. **从前端而不是文档入手。** 盯着 Angular 应用的网络请求，本来能帮我省掉"盲信过时
   Apiary 文档"这整段弯路。对于它自己的 API 来说，UI 永远是真话。
2. **把 "This request need session." 当信标，不是错误。** 前几次我把它读成"端点错了"，
   其实它是"端点对了，会话状态不对"。
3. **把登录一次性脚本化成一个可复用的 helper。** 会话 cookie 会在 VM 重启和过期时死掉，
   所以每一次零散的 `curl` 都得从头来。一个能登录、抓 cookie、遇到
   `"This request need session."` 就重新登录的小 wrapper，能把整场操作从"摸索"变成
   "可复现"。

## 结果

现在我能完全从 shell 里列出、创建、删除我 CyberPanel 面板上的站点——不需要浏览器、不
需要 GUI——而且整个带认证的 API 面都敞开来供脚本化了（SSL、邮件、DNS、cron）。我是靠
丢掉文档、观察真实请求、再把这些请求映射回它们的 Django view 来做到的，而
`cyberpanel` 模块和会话流程现在也进了我自己的自动化工具箱。

更大的教训是："没有文档"很少意味着"不可能"。当一个工具暴露了 web UI，那个 UI 就是它
API 的一份活的、精确的参考——你只需要去看它到底发了什么。

---

## 想把你的服务器管理脚本化吗？

如果你还在点托管面板——更糟的是，在好几台服务器上重复做同样的手动步骤——我专门自动化
这类事情：把重复的后台操作变成一份测试过的脚本或一个小的内部工具，接到你现有的技术栈
上，并附上交接说明，让你永远不会被锁死。不管是 CyberPanel、cPanel、Docker，还是定制
的后台，凡是有 web UI 的，几乎都能脱离 UI 去驱动它。

联系我 [me@hoelee.com](mailto:me@hoelee.com?subject=Scripting%20my%20server%20admin) 或
WhatsApp [+60 12-797 2969](https://wa.me/60127972969)，或者到
[hoelee.com](https://hoelee.com) 看看我做什么。