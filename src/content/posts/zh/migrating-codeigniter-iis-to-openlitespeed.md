---
title: "把 CodeIgniter 4 应用从 IIS 迁移到 OpenLiteSpeed"
description: "我把一个 17,000 行的 CodeIgniter 4 应用从 Windows IIS 搬到了 CyberPanel 上的 OpenLiteSpeed。迁移后冒出两个致命错误——而 IIS 一直靠 SSO 把它们藏着。"
pubDate: 2026-09-20
category: engineering
tags: [codeigniter, php, openspeedway, cyberpanel, iis, migration, litespeed, linux]
ogImage: /og/migrating-codeigniter-iis-to-openlitespeed.png
banner: /banners/migrating-codeigniter-iis-to-openlitespeed.png
draft: true
---

我维护着一个数字命理报告生成器：一个 CodeIgniter 4 应用，接收出生日期和姓名，跑一遍命理引擎，渲染出 19 页 A4 报告。它在 Windows Server + IIS 上跑了很多年。2026 年 9 月，我把它迁到 CyberPanel 上的 OpenLiteSpeed，跑在 Linux 上，换了个域名。

迁移本身没什么好说的——拷文件、把 docroot 指向 `public/`、装依赖。真正值得写下来的是：**新主机上第一个未认证请求，就在两条路由上直接致命崩溃——而这两条路由在 IIS 上"一直好好的"。**

两个 bug 都是真的。两个从一开始就存在于 IIS 上。两个都看不见，因为 IIS 在出问题的路由前面恰好挡了一层 authentik SSO。

## 为什么这件事重要

如果你的自托管应用前面挂了一层认证网关，那这层网关做的事不止是保护数据——它同时**在帮你藏 bug**。任何"只对未认证用户出错"的东西永远不会以未认证身份运行，所以永远不会报错。而它会在最糟的时刻暴露：你迁移的时候、你拆掉网关的时候、你把路由暴露到公网的时候。

我这个应用，就"健康"了整整几年。我把新域名指过去的那一刻，两条路由返 HTTP 500。代码一行没改。唯一变的是网关没了。

两个修复加起来大概二十分钟。找到它们花了两个小时——因为真正的错误信息被 CodeIgniter 的 CLI 错误渲染器挡在了后面。

## 环境

这是一个相当普通的 CI4 项目，但有一个不太常见的架构细节：报告引擎不是库，而是**同一台主机上的 HTTP 端点**。控制器拼一个请求，`curl` 回自己域名的 `/api/single`，引擎返回算好的 JSON 数值，控制器再把它渲染成可打印的报告。

正是这个"自调用"设计，让 IIS 上必须有 `CONST_IIS_INTERNAL_BASE`。这点我后面会回来说——它才是真正有意思的部分。

| | 迁移前 | 迁移后 |
|---|---|---|
| 操作系统 | Windows Server | Ubuntu (CyberPanel) |
| Web 服务器 | IIS | OpenLiteSpeed 1.9.0 |
| PHP | 8.4 (Windows 版) | 8.4.25 (lsphp84) |
| Docroot | `C:\inetpub\calc.hoelee.com` | `/home/<域名>/public_html/public` |
| 认证网关 | authentik SSO 挡 `/lifecode`、`/api/*` | 无 |

## 第一步：docroot 指向 `public/`，不是项目根目录

CI4 是两段式目录结构。`app/`、`vendor/`、`writable/` 和 `.env` 都在项目根目录，只有 `public/` 本该对 Web 可见。

CyberPanel 建的站点根目录叫 `public_html`。我的第一反应是把整个项目解压进 `public_html`，docroot 不动。

**那样会把 `app/`、`vendor/`、`.env` 文件和 `writable/` 的 session 数据全部暴露在 HTTP 之下。** 这个项目的 `.env` 里有一个 webhook 凭证。任何人猜到 `/../.env`——或者干脆直接请求 `/.env`，因为这文件就躺在被服务的目录下面——就拿到了。

正确做法是解压进 `public_html`，然后把 vhost 的 docroot 往下一层，改成 `public_html/public`：

```bash
# 解压成 app/、vendor/、.env 位于 public_html 之下
cd /home/<域名>/public_html
tar -xzf /tmp/deploy.tar.gz

# docroot 必须是 public_html/public，不是 public_html
sudo sed -i 's#/home/<域名>/public_html\$#/home/<域名>/public_html/public#' \
  /usr/local/lsws/conf/vhosts/<域名>/vhost.conf

sudo /usr/local/lsws/bin/lshttpd -t
sudo systemctl restart lsws
```

这是整个迁移里最重要的一步，也是大多数教程跳过的一步。其他什么都不做，这一步也得做。

## 第二步：IIS 藏起来的两个致命错误

### 致命错误一 —— `env()` 调用得太早

第一个 500 完全没有响应体。这不太寻常——CI4 正常会渲染点东西出来。一个空白的 500 通常意味着 PHP 在框架的错误处理器装上之前就死了。

CI4 的启动流程会在 `Boot::bootWeb()` 里很早加载 `app/Config/Constants.php`（通过 `Boot::loadConstants()`）。而这件事发生在 **`Common.php` 助手文件加载之前**——`env()` 就定义在那个文件里。

所以这一行：

```php
// app/Config/Constants.php —— 错误写法
define('CONST_fullBase', env('hoelee.fullBase'));
```

会失败于：

```
Fatal error: Uncaught Error: Call to undefined function env()
in app/Config/Constants.php:96
```

规则是绝对的：**`Constants.php` 里只能放普通常量。** 不能有 `env()`、不能有 `getenv()`、不能有配置助手。如果你真需要依赖环境的值，就定义到启动流程更靠后的位置——或者把这个常量降级成 fallback，真正的值后面再读。

我做的正是后者。`CONST_fullBase` 变回普通字符串，消费它的助手函数改为**先**查框架自己的 `app.baseURL`（那个才是 `.env` 驱动的）：

```php
// app/Helpers/hoelee_helper.php
function getFullBase(bool $selfCall = false): string
{
    // .env 驱动的 baseURL 优先；CONST_fullBase 只是 fallback
    if ($selfCall && defined('CONST_IIS_INTERNAL_BASE') && CONST_IIS_INTERNAL_BASE) {
        return rtrim(CONST_IIS_INTERNAL_BASE, '/');
    }
    $appBase = config('App')->baseURL;
    if ($appBase) return rtrim($appBase, '/');
    if (defined('CONST_fullBase') && CONST_fullBase) return rtrim(CONST_fullBase, '/');
    return '';
}
```

**这个是我自己搞出来的。** 同一周做凭证清理重构时引入的——我把一个硬编码 URL 挪进 `.env`，然后在 `Constants.php` 里用 `env()` 读它。在我机器上是通的，因为本地 `.env` 走的是另一条路径被读到。干净启动下它从来没通过。我是在**部署测试**后一小时内抓到的；如果只是代码审查，很可能就这么放过去了。

### 致命错误二 —— CI4 控制器里的 `parent::__construct()`

第二个失败在 `/lifecode`。这个是应用里**原本就存在**的 bug，不是我引入的。

绕过 CLI 渲染器之后，真正的报错是：

```
Error: Cannot call constructor
```

CI4 的基础类 `CodeIgniter\Controller` **根本没有构造函数**。它实现的是 `initController()`，由框架把 request、response、logger 三个对象传进去。标准写法是：

```php
// CI4 的正确写法
public function initController(
    RequestInterface $request,
    ResponseInterface $response,
    LoggerInterface $logger
) {
    parent::initController($request, $response, $logger);
    // 你的初始化代码
}
```

但 `Lifecode.php` 和 `ApiEn.php` 用的是传统构造函数，还在调 `parent::__construct()`：

```php
// 错误 —— CodeIgniter\Controller 没有 __construct()
public function __construct()
{
    parent::__construct();
    // ...
}
```

对一个没有定义 `__construct()` 的父类调 `parent::__construct()`，在 PHP 8 里是致命错误。把两个控制器改成 `initController()` 就修好了——同时要为新签名补上三个 interface 的 `use` 语句。

我没有盲信报错信息，而是先确认父类**确实**没有构造函数：

```bash
grep -n 'function __construct\|function initController' \
  vendor/codeigniter4/framework/system/Controller.php
```

只出来 `initController()`。这一步值得做——"Cannot call constructor" 在父类**有**构造函数但内部报错时也会出现，重写签名之前你得先搞清楚自己是哪种情况。

## 为什么这两个 bug 在 IIS 上都不出现

这是让我改变部署观念的部分。

在 IIS 主机上，`/lifecode` 和 `/api/*` 挡在 authentik SSO 后面。对这两条路由的未认证请求返回 **HTTP 302 跳转到 `auth.hoelee.com`**——压根不会碰到控制器。那个坏掉的构造函数从来没被执行过。这条路由大概从写出来那天就是坏的，而它从来没被要求真正处理过一次请求。

我直接对比了两台主机来确认：

```bash
curl -sI https://calc.hoelee.com/lifecode | head -1
# HTTP/2 302   <- authentik 跳转；控制器根本没运行

curl -sI http://<新主机>/lifecode | head -1
# HTTP/1.1 500  <- 没有网关；控制器运行并致命崩溃
```

那个 302 就是这个 bug 活下来的原因。应用看起来健康，只是因为它不健康的部分根本触不到。

**教训说白了就是：一条路由前面挂了认证网关，就意味着这条路由自己的代码没有任何有效的测试覆盖。** 如果你要迁移或者拆网关，请专门留出时间，用未认证身份把每一条曾被网关挡着的路由都打一遍，再宣布迁移完成。小应用上这只是十行 `curl` 循环。在我这里，它本来几秒钟就能找出这两个 bug，而不是两个小时：

```bash
for p in / /read/single /read/partner /lifecode /api/date /api/single; do
  printf '%-16s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' https://<主机>$p)"
done
```

## 第三步：那个不再是 loopback 的自调用

现在是这个架构里真正有意思的后果。

报告引擎是靠控制器 `curl` 自己的主机来调用的。在 IIS 上，`CONST_IIS_INTERNAL_BASE` 把这个调用指向 `http://localhost:7296`——loopback 接口，请求不出机器，也不碰 DNS 和 TLS。

在 LiteSpeed 上这个常量被**故意不定义**，于是 `getFullBase()` 落到 `app.baseURL`。这意味着每一次生成报告，现在都是**一个真实的对外 HTTPS 请求，打到应用自己的公网 URL，再从 Cloudflare 绕回来**。

那问题就来了：这到底能不能跑？

答案是能，但值得专门测一次，因为它的失败模式很容易误导人。这是确切的测法——**在服务器上跑**，不是在你的笔记本上：

```bash
curl -s -o /dev/null -w 'HTTPS self-call: %{http_code}\n' \
  -X POST 'https://<域名>/api/single' -d 'nameCn=test&dob=1990-01-01'
```

两个要注意的地方：

- **在服务器上跑。** 我从 Windows 机器上打同一个 URL，拿到的是 404 和 500——那是我这台机器 DNS 解析和 Cloudflare 机器人防护的产物，不是服务器的问题。在错误的主机上测试，会得出很有把握的错误结论。
- **看 JSON，不只看状态码。** 一个 200 配一个被截断的 body，比干脆失败更糟。我在信任之前先确认了响应能被解析。

这里藏着一个真实的取舍，我还没完全解决：走公网 URL 的自调用意味着生成报告依赖 Cloudflare 在线、每次报告多一次 TLS 握手、并且在整个过程中占用两个 PHP worker。在 LiteSpeed 上 worker 池不大的情况下，并发报告一多就可能死锁——每个请求都在等另一个请求，而后者拿不到空闲 worker。以目前的流量没问题。但在规模上去之前，这个自调用应该换成绕过 CDN 的内部路径。

## 第四步：验证真实产出，不是状态码

`/` 返 200 只证明落地页能渲染。它不证明报告引擎能用，而引擎才是整个产品。所以最后一步是端到端生成一份真报告：

```bash
curl -s -X POST 'https://<域名>/read/single' \
  -d 'nameCn=test&dob=1990-01-01&gender=m' \
  -o report.html -w 'HTTP:%{http_code} bytes:%{size_download}\n'
```

结果：**HTTP 200、99,189 字节、19 页 A4。** 我又用中文字符输入跑了一遍，把引擎的 UTF-8 路径也走通——HTTP 200、99,205 字节、19 页、姓名渲染正常、输出里零 PHP 警告。

真正有意义的检查，是新旧主机之间页数可比。它证明字体、DPI 和分页逻辑都完整地熬过了这次搬迁。

关于那个 UTF-8 测试的插曲：我第一次跑的时候返回了 500，差点就一头扎进去查 bug。原因是我自己的 shell——中文字符在进 `curl` 的路上被终端编码搞坏了，应用收到的是非法字节。把同一个请求写成服务器上的脚本再跑，编码在我控制之内，就返回了 200。**在你调试编码故障之前，先确认服务器真正收到的字节就是你打算发出去的字节。**

## 如果重来一次，我会怎么改

**迁移前就测未认证路由，而不是迁移后。** 那两个小时的排查，用一个遍历路由列表的 `curl` 循环就能完全避免。我现在把"列出所有路由、以未认证身份逐个请求、记录状态码"当成任何迁移的第零步。

**不要在 `Constants.php` 里调 `env()`。** 我在文件里留了注释专门写这件事，因为下一个人——多半是六个月后的我自己——一定会想这么干。

**迁移前先查框架版本对应的 project-space 配置。** 同一周我把 CI4 从 4.6.3 升到 4.7.4，它在两个升级指南里根本没提的属性上致命崩溃了两次：`Config\App::$permittedURIChars`（4.7 的 Router 要求）和 `Config\Format::$jsonEncodeDepth`（JSONFormatter 要求，而第二个正好打断了引擎的 JSON 自调用）。Composer 会更新 `vendor/`，但**永远**不会合并 `app/Config/*.php`，因为那些属于 project-space。我最后往 14 个配置文件里手工合并了新属性。那是另一篇文章，但迁移的教训是同一个形状：**框架会告诉你 `vendor/` 里改了什么；没有任何东西会告诉你 `app/` 里改了什么。**

**先确认 docroot，再动别的。** 如果我解压进 `public_html` 就收手，应用是能跑的——同时静静地把 `.env` 通过 HTTP 服务出去。能跑的迁移，不等于安全的迁移。

## 结果

一个晚上。六条路由全部验证 200，中英文输入的报告产出在字节层面可比，零 PHP 警告，另外还从代码库里清掉了两个长期潜伏的 bug——而这两个 bug 一直被 IIS 的认证网关遮着。

应用现在跑在 OpenLiteSpeed 上，docroot 正确分离，主机可自动化管理，凭证放在 `.env` 而不是写死在常量里。

---

**想让你的应用也做这套迁移？** 我可以在 IIS、Apache、nginx 和 LiteSpeed 之间迁移 PHP 应用——包括那些麻烦的部分：自调用架构、藏 bug 的 SSO 网关，以及会碰到 project-space 配置的框架升级。

[WhatsApp +60 12-797 2969](https://wa.me/60127972969) · [me@hoelee.com](mailto:me@hoelee.com?subject=CodeIgniter%20迁移) · [hoelee.com](https://hoelee.com)
