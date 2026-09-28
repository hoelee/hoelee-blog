---
title: "逐页验证一份 19 页的 PDF 报告"
description: "如何逐页验证生成的 PDF 报告：用浏览器打印同一份 HTML 作基线，逐页比对几何尺寸，把每一处偏差都压到 2pt 以内。"
pubDate: 2026-09-28
updatedDate: 2026-09-29
category: engineering
tags: [php, codeigniter, pdf, css, print, testing]
ogImage: /og/verifying-a-pdf-report-page-by-page.png
banner: /banners/verifying-a-pdf-report-page-by-page.png
draft: false
---

你怎么知道一份生成出来的 PDF 每一页都真的正确——不只是第一页？
我维护着一个 CodeIgniter 4 应用：输入一个人的出生信息，生成一份
中文命理/生命密码报告——十九张密排的 A4 sheet，封面、数字图表、
方向九宫格、「一到九」的个人特征页。以前这份报告按网站原本的设计
交付：操作员在浏览器里按 Ctrl+P，手工另存成 PDF。我把它换成了
服务端渲染（mPDF），一夜之间，产品的质量取决于一个我看不见
如何排版的引擎。

这就是这个问题可被搜索的版本：如何把一份多页 PDF 报告逐页地、
用数字而不是肉眼，去和浏览器自己的打印输出对版？这个过程抓到
了真实的 bug——包括一行被渲染成 2.5pt、从第二页起几乎看不见的
页眉——最后全部十九页与浏览器基线的偏差都压进了 2pt。

## 为什么「看起来没问题」不算测试

没有人能用肉眼验证一份 19 页的报告。过去的流程是：打开 PDF，
扫一眼封面，交付。第 17 页标题漂移、页脚插图压住版权行、页眉
小到读不出来——快速翻一遍永远发现不了，而花钱买报告的顾客
看到的是全尺寸。

天真的做法会失败，是结构性的原因。服务端 PDF 渲染器不会像
浏览器那样排你的 HTML：分页、页边距、基线、字距全都会漂移——
而且不存在一个「看起来没问题」的测试，能让你在下周有人改了
CSS 之后再跑一次。我第一次单趟渲染出来是 27 页，而设计预期
是 19 页：mPDF 没有 CSS 裁剪，而 sheet 靠 `overflow: hidden`
藏住溢出。报告的 `@page` 规则更糟：mPDF 为这条规则本身
翻了一页，19 张 sheet 炸成 12,789 页。页数都不稳定，所以
「扫一眼第一页」不是验证——是碰运气。

## 基线：让浏览器去打印你的 HTML

操作员的 Ctrl+P，就是 Chrome 用打印 CSS 打印报告自己的 HTML。
所以参照标准不是「我觉得它应该长什么样」，而是浏览器自己的
打印输出——在同一台机器、同一套网页字体下生成。做法：把报告
目录用本地静态服务起起来（字体必须同源，否则 webfont 拒绝
加载），再用 headless Chrome 打印。报告 CSS 声明了
`@page { margin: 0 }`，所以浏览器输出是无边距满幅，再配合
`-webkit-print-color-adjust: exact` 保住背景图——等价于操作员
勾选「背景图形」：

```bash
python -m http.server 8123 --bind 127.0.0.1 --directory <report-dir>

"C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu \
  --no-pdf-header-footer --user-data-dir=%TEMP%\chromeprofile --virtual-time-budget=30000 \
  --print-to-pdf=chrome-win.pdf "http://127.0.0.1:8123/report-local.html"
```

然后在 VM 上，用同一份 HTML 出服务端版本：

```bash
php tools/pdf-render.php /tmp/report-v10.html /tmp/mpdf.pdf
```

## 逐页比对，而不是整体对比

以浏览器的 PDF 为基准，我在 Windows 这边用
`uv run --with pymupdf` 逐页对比两份文档：页面尺寸、文字条数、
图片包围盒（x0/y0/宽/高）、附图说明文字的 y 坐标。判定阈值：
**偏差 ≤2pt（0.7mm）算对齐**；超过 5pt 就要查根因。而且只比
「同一元素在两份 PDF 里的差」——永远不要比绝对页数，因为页数
一致是前提，不是测试本身。

## 逐页比对抓到了什么

下面每个 bug 都有可测量的前后数字，而且都修在库或模板里——
不是用管道糊过去。

**看不见的页眉行。** 从第二页起每页顶部有一行小字，用户直接
反馈说小到读不出来。页眉是一个 `font-size: 10px` 的 div，
里面套一张 auto 宽的 table，第一格写着 `width: 100%`。mPDF
把这解读成「表格超宽」，于是连同字号一起把整行缩到三分之一：
**2.5pt，而 Chrome 是 7.5pt**。修法（`fixPageHeaderTables()`）：
给表格显式宽度 + 显式字号（px→pt），并去掉第一格的
`width: 100%`：

```php
$pt = round((float) $m[2] * 0.75, 2);   // 10px = 7.5pt
```

**匹配过宽的外边距规则。** `.sheet { margin: 5mm auto }` 是为
屏幕预览准备的（sheet 之间的阴影缝隙）。mPDF 当真了，把
296mm 的 sheet 推到 301mm——越过 297mm 的页面——于是 sheet
在页边被切开，auto-fit 把整页缩小 3%，带白边。最直观的修法、
在样式表末尾追加一条 `.sheet { margin: 0; }`，完全没用：mPDF
对同名选择器的两条规则只认「先出现的赢」。所以库要原地改写
这条规则（`stripSheetMargins()`），而匹配器必须小心什么才算
「sheet 规则」。护栏是一个负向回顾断言：

```php
'~(?<![\w.\-])\.sheet\s*\{([^}]*)\}~i'
```

只匹配独立的 `.sheet` 规则——像 `.invoice-sheet` 这种只是名字
以 `-sheet` 结尾的选择器不会被碰，剪边距的逻辑就毁不掉无关
规则。（收据文档就是独立的单页文档，下面会讲。）

**页脚插图偏了最多 490pt。** sheet 用 `position: absolute;
bottom: Npx` 把插图钉在页底。mPDF 只在文档顶层认绝对定位，
所以进了 sheet 之后这些图片退回普通流：**高了 30–490pt**
（第 6 页偏了 213.5pt，也就是 75mm），而且**窄了 10%**
（450pt vs Chrome 的 499.5pt）——因为百分比宽度是按 sheet
的 189mm 内容盒算的，而 Chrome 按 210mm 的包含块算。修法：
把所有钉底的图片从 sheet 里抽出来，放进 mPDF 自己的 HTML
footer（`SetHTMLFooter()`）——按页锚定、不占正文流，几何
统一按页面盒换算。结果：**≤2pt**。「窄 10%」也一起消失了，
因为两者同一个根因。

**22 处居中内容全部左对齐。** 模板用旧式 `<center>` 标签
居中，而 mPDF 8 的 `Center` 标签处理器是空类——标签整个被
丢弃，所有居中的标题和表格全部左对齐（「前言」实测 x=30，
Chrome 是 x=280）。`expandCenterTags()` 把 `<center>` 改写成
`<div style="text-align:center">`，并给居中块里的表格补上
`align="center"`——因为父级的 `text-align` 传不到表格。
修复后：x=281，Chrome 280。

**行距比浏览器高 15%。** 模板的 normalize.css 声明了
`html { line-height: 1.15 }`；mPDF 不继承它，退回自己的字体
度量（1.33）。这累积成每页下半部 20–40pt 的漂移——sheet 3
甚至溢出到第二页，触发整页缩小。把 `useFixedNormalLineHeight`
设成模板自己的值之后，正文行距 15.5pt，Chrome 是 15.7。
表格还要显式加 `td, th { padding: 1px }`——mPDF 默认的
单元格内边距比浏览器大 2px。

**字体是错的。** mPDF 读不了网页用的 `.woff`，文字回退到
自带的 Sun-ExtA；而正文栈里的「微软雅黑」在 Linux 服务器上
根本不存在。我注册了三套真 TTF——标题手写体 MaShanZheng、
拉丁与数字 Roboto、正文 CJK 用 wqy-microhei——并把模板的
字体栈映射过去。一个坑：必须关掉 mPDF 的自动按脚本选字，
否则它挑「第一个支持中文的已注册字体」——整页正文都变成
手写体。

**还有一个与 mPDF 无关的 bug。** 第 7 页的主插图在**两份**
PDF 里都是破图——比对显示 Chrome 和 mPDF 里是同一个破损
占位块。模板硬编码了 `https://cdn.hoelee.com/...`，这个域名
已经不再解析（NXDOMAIN），所以每个引擎都抓不到图。把模板
改回应用自己的 base URL，并让 `localiseAssets()` 把任何
host 的 `/static/` 路径都映射到本地文件，两个引擎里的插图
都恢复了。只有并排比对才能暴露这一类 bug——单独看哪个引擎
都「正常」。

## 一张 sheet，一页

渲染器这么设计是有意的：库把 HTML 按 `<section class="sheet">`
切开，每张 sheet 单独渲染成一份单页文档，合并时只取第 1 页——
物理上保证「一张 sheet = 正好一页 A4」，永远不会跨页断裂。
mPDF 量中文宽度和 Chrome 略有不同，个别 sheet 会高出几毫米。
与其丢内容，库按一把缩放梯子——1.0, 1.005, 1.01, 1.02, 1.03,
1.06, 1.10, 1.15, 1.22——取第一个能落进一页的比例，缩小整张
sheet 而不是裁内容。隐藏溢出是浏览器打印做的事
（`overflow: hidden`）；一份收费产品如果 PDF 里静默丢了页内
内容，就是无声的交付事故，所以设计选择是绝不丢内容。sheet 3
现在需要 x1.005——0.5%，肉眼不可见——以前是 x1.03。

**「19/7 页」是什么意思。** 报告模板永远按固定顺序渲染十九张
sheet；「版本」是这些 sheet 上的一个过滤器，不是第二份模板。
完整版是 **19 页**；RM49 的精华版是**这 19 张里的 7 张**，
页码重编，每张入选的 sheet 都登记了一个文字标记——模板被
改动/重排导致取错页时会大声失败，而不是把错误的章节交给
顾客。两个版本走同一条管线，也用同一种方式验收：
`tools/pdf-verify.php --expect=19` 和
`--expect=7` 双双 PASS
——页数加逐页 ink 检查（ghostscript 50dpi）证明没有任何
空白页。

## 为什么收据是独立文档

收据不是报告裁剪出来的。它是自己的一份单页 A4 文档：真
16mm 页边距（报告刻意做满幅无边距）、三语、单趟渲染——
因为里面没有 sheet。它在发「已收款」邮件时才懒生成：付款
回调必须毫秒级应答，0.3–1 秒的 PDF 渲染不属于回调。它落进
同一个交付存储，文件名带 `-receipt` 后缀，永远不会和报告
文件撞名，而且幂等：重试、重寄、顾客自己来拿，拿到的都是
同一份。做它的过程从另一个方向印证了同一个论点——连单页
文档都和浏览器不一样：`<small>` 上的 `display: block`
不生效，左右并排的两张表把右列的数值裁出页面右边界，
合计行必须写在明细表内部，否则标签会浮在半空。

## 我会怎么做不一样

对版方法现在躺在项目笔记里，是一份文档化的流程，不是仓库
里的脚本——这就是差距。仓库里自动化的验收工具只证明页数和
逐页 ink，永远抓不到 2.5pt 的页眉或 15% 的行距漂移。我会把
浏览器基线比对做成仓库验证工具链里的一个脚本：用同一份
HTML 分别喂 Chrome 和库，diff 几何，任何超过 5pt 的偏差
直接失败。这样，一次让打印布局悄悄回退的 CSS 改动会在构建
时炸掉，而不是送到顾客手里。

我还会在写任何 mPDF 补偿代码之前就先出 Chrome 基线。
「用操作员用的同一个引擎打印，然后测量」才是解锁点；之后
每个修复都是机械活。还有两件诚实的遗留工作：伴侣合盘与
家庭套餐还没跑过这套逐页对版，19 页的 PDF（背景图加嵌入
字体约 20 MB）也还需要在交付前压缩。

## 结果

修复后的完整版验收：

```text
$ php tools/pdf-verify.php /tmp/report-v10.html --expect=19
out  : 20,225,818 bytes, 19 pages, 10.4s, peak 188 MB
per-page ink check: all pages have content  |  report pages=19
expected 19 pages => MATCH
RESULT: PASS
```

- **19 页 vs Chrome 基线的 19 页 — MATCH**，一张 sheet 一页，
  无跨页断裂。
- 每一项实测偏差都**在 2pt（0.7mm）以内**：第 6 页偏了
  213.5pt 的页脚插图、从 2.5pt 恢复到浏览器同款 7.5pt 的
  页眉、归位的居中标题、15.5pt vs Chrome 15.7 的正文行距、
  与网页字体一致的嵌入字体。
- ink 检查确认**没有任何空白页**，PDF 文字可提取——封面能
  读出真实文字，这对一份顾客要复制内容的报告很重要。
- 精华版：**7 页 PASS**，4.99 MB，2.8 秒。

这就是「第一页看起来没问题」和「全部十九页都在浏览器两个点
以内」的区别。前者是肉眼扫一遍就交付的结果；后者是拿浏览器
自己当测试得到的结果。

---

我平时就做这类 Web 应用与打印/PDF 报告管线，也做网站设计与
开发。如果你有一份服务器渲染的文档——报告、收据、发票——
想在它送到顾客手里之前确认每一页都正确，跟我说说：
[WhatsApp](https://wa.me/60127972969) · [me@hoelee.com](mailto:me@hoelee.com?subject=PDF%20report%20pipeline) ·
[hoelee.com](https://hoelee.com)。