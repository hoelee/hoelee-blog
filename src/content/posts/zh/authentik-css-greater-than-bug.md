---
title: "一个字符让我的 authentik CSS 静默失效"
description: "我的 authentik 自定义 CSS 看起来完全正确，也匹配到了目标元素，却毫无效果。原因是一个 > 字符被 authentik 转义成了无效文本。"
pubDate: 2026-09-20
category: devops
tags: ["authentik", "css", "self-hosting", "debugging", "browser"]
ogImage: /og/authentik-css-greater-than-bug.png
banner: /banners/authentik-css-greater-than-bug.png
draft: true
---

我花了一个下午去查一条本该三十秒解决的 CSS 规则。

我想隐藏 authentik 登录页脚里的一行——硬编码的「Powered by
authentik」署名。这条规则在我做过的其他项目里从来都是有效的：

```css
ul.pf-c-list > li:last-child {
    display: none !important;
}
```

它毫无作用。不是「看起来有点不对」——那个元素依然完整地显示着。下面
是我追过的四个错误答案、唯一正确的答案，以及我本该第一个就做的调试
动作。

## 为什么这不只是一行页脚的问题

如果你自托管 authentik，曾经把 CSS 粘进
**System → Brands → Custom CSS** 却完全没效果，那你多半以为自己哪里
写错了。你几乎肯定没写错。样式表被接收、被存储、被送到浏览器、也被
解析了——然后静默失效，你够得着的任何日志里都没有报错。

这是最糟糕的一类 bug：没有反馈回路。这篇文章把这条回路还给你。

## 错误答案 #1：这是 shadow DOM，CSS 进不去

我的第一个假设。现代 Web Component 常常把标记藏在 shadow root 后面，
普通的文档 CSS 无法跨越那道边界。authentik 的登录页确实由
Web Component 渲染——我在页面源码里见过 `<ak-flow-executor>` 和
`<ak-drawer>`——所以这看起来显然是答案。

我从打包好的 bundle 里把组件定义读出来确认：

```js
var oe = class extends L {
    createRenderRoot() { return this }
    render() { ... }
}
```

`createRenderRoot(){ return this }` 意味着**没有 shadow root**——组件
直接渲染进 light DOM。普通 CSS 完全可以作用于它。

错误答案。继续。

## 错误答案 #2：CSS 根本没被注入

下一个理论：我的 CSS 压根没进到页面里。我在返回的 HTML 里搜了一个
自己规则里的特征类名：

```
<style data-id="brand-css">.ak-login-container{ padding-top: 16vh; ... }
```

它就在那里，一次就搜到了。authentik 把品牌 CSS 作为
`<style data-id="brand-css">` 块注入到文档头部。注入是正常的。

错误答案。

## 错误答案 #3：优先级问题——PatternFly 赢了

听起来合理。authentik 的界面基于 PatternFly，它带有风格强势的列表
样式。我的规则用了 `!important`，但 `!important` 只在同一个级联层
（layer）内有效——如果 PatternFly 的规则也是 `!important` 且在更靠
后的层里，我的就会输。

到这里我停止猜测，开始实测。我用无头浏览器加载页面，直接问 DOM：

```js
const host = document.querySelector('ak-brand-links');
const li = host.querySelector('li[data-kind="text"]');
return {
  display: getComputedStyle(li).display,
  matchesDataKind: li.matches('ul.pf-c-list > li[data-kind="text"]'),
  matchesLastChild: li.matches('ul.pf-c-list.pf-m-inline > li:last-child'),
};
```

返回结果：

```
display:          "list-item"   ← 没有被隐藏
matchesDataKind:  true          ← 我的选择器是正确的
matchesLastChild: true          ← 这条也正确
```

选择器匹配到了元素，CSS 却没生效。这种组合只有在一种情况下可能：
浏览器解析到的那张样式表里，已经没有我写的那条规则了。

## 错误答案 #4：（没有了——我直接读解析后的 CSS）

于是我读回浏览器 **CSS 解析器**实际登记的规则，而不是页面源码里
写了什么：

```js
for (const sheet of document.styleSheets) {
  if (sheet.ownerNode.getAttribute('data-id') === 'brand-css') {
    for (const rule of sheet.cssRules) console.log(rule.cssText);
  }
}
```

```
"ul.pf-c-list u003e li[data-kind=\"text\"], ul.pf-c-list.pf-m-inline u003e li:last-child { display: none !important; }"
```

找到了。**`u003e`。**

`>` 字符——在我的 CSS 里写对了、在数据库里存对了、API 也返回对了
——被渲染进 HTML 时变成了字面文本 `u003e`。不是 `>` 字符，而是
`u`、`0`、`0`、`3`、`e` 这六个字符。

于是浏览器试着解析这个选择器：

```
ul.pf-c-list u003e li[data-kind="text"]
```

`u003e` 不是组合器。这个选择器是无效的。在逗号分隔的选择器列表里，
无效的那一条会被整条丢弃，所以对浏览器而言这条规则根本不存在
——而对*正确*的选择器字符串调用 `matches()` 依然返回 `true`，这就
是为什么那个元素看起来像是匹配上了什么。

## 修复方式

把 authentik 品牌 CSS 里所有的子代组合器（`>`）删掉，改用后代选择器
——把 `>` 换成空格：

```css
/* 失效 —— > 会变成字面文本 "u003e"，整条规则被丢弃 */
ul.pf-c-list > li[data-kind="text"] {
    display: none !important;
}

/* 有效 —— 后代组合器可以原样通过 */
ul.pf-c-list li[data-kind="text"] {
    display: none !important;
}
```

这就是全部修复——删掉一个字符。

### 这个转义是从哪来的

`\u003E` 是 JSON/JavaScript 对 `>` 的编码方式。authentik 的 Django
模板把品牌配置渲染成一个 JavaScript 对象字面量，而在这个过程里，
某个 HTML/JS 转义器被作用到了 `branding_custom_css` 字符串上。反斜杠
和 `u` 在这个路径的某处被拆开了，于是浏览器收到的是 `u003e`
——没有反斜杠的转义序列——而不是 `>`。

存进去的值是对的。API 的返回也是对的。只有渲染出来的页面是错的：

```bash
# API 返回的内容 —— 正确
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://auth.hoelee.com/api/v3/core/brands/" \
  | python -c "import sys,json;print([b['branding_custom_css'] for b in json.load(sys.stdin)['results']][0])"
# → ul.pf-c-list > li[data-kind="text"] { ... }     ← > 在这里是完整的

# 浏览器实际收到的 —— 已损坏
curl -sL https://auth.hoelee.com/ | grep -o 'ul.pf-c-list[^;]*'
# → ul.pf-c-list \u003E li[data-kind="text"]        ← 被转义了
```

这就是为什么这个 bug 几乎搜不到：任何人通过 API、数据库或后台界面
去调试，看到的都是一张完全正确的样式表。

### 哪些字符能活下来，哪些不能

我探测了哪些字符会被破坏，以便知道还需要避开什么：

| 字符 | 渲染为 | 是否安全 |
|---|---|---|
| `>` | `u003e` | ❌ 选择器失效 |
| `;` | `;` | ✅ |
| `"` | `"` | ✅ |
| `{` `}` `:` | 不变 | ✅ |

实际上只有子代组合器会受影响，因为 `>` 是这些字符里唯一出现在 CSS
*选择器*中的——其余几个只出现在声明里，而声明会被完整保留。

## 在真实浏览器里验证修复

不要通过重读页面源码来验证——那正是陷阱。直接问浏览器元素的几何信息：

```js
const li = document.querySelector('li[data-kind="text"]');
return {
  display: getComputedStyle(li).display,
  visible: li.getBoundingClientRect().height > 0,
};
```

```
display: "none"
visible: false
```

元素已经消失了。这是真实测量，不是推断。

## 我会怎么做不同

**当一个选择器匹配得上、样式却不生效时，立刻去读
`styleSheets[i].cssRules`。** 这一步之前的全部尝试都只是猜测，本来
可以完全跳过。解析后的规则列表是浏览器的基准事实——它用一行就能
告诉你，你*写下*的规则是否就是*存在*的那条规则。

下次我会用的具体顺序：

1. 元素存在且匹配吗？ → `element.matches(selector)`
2. 规则存在于解析后的样式表里吗？ → `cssRules`
3. 这之后才去考虑优先级、级联层和 `!important`

我把这三步做了个反序，这就是为什么花掉了一个下午。

第二条教训更窄，但值得记下来：**转义类 bug 长在「存数据的层」和
「渲染数据的层」之间。** 在做任何其他检查之前，先把这两端的值都看
一遍。我看了数据库，又看了 API，然后断定 CSS 没问题。而 bug 在我
去看的第三个地方。

## 结果

删掉一个字符，隐藏一行页脚，得到一条已经回本的调试规则：在同一次
会话里，我用三分钟就在另一条规则里找到了类似的不匹配——因为我直接
去了 `cssRules`，而不是继续猜。

如果你自托管 authentik，而品牌 CSS 曾经静默失效过——先检查有没有
`>`。

---

## 需要为你的业务做这件事吗？

如果你需要自托管 SSO、加固过的登录页，或者需要有人来排查你现有的
基础设施，这正是我在做的工作。

- **WhatsApp：** [011-797 2969](https://wa.me/60127972969) —— 点击对话
- **Email：** [me@hoelee.com](mailto:me@hoelee.com?subject=Self-hosted%20SSO%20enquiry)
- **网站：** [hoelee.com](https://www.hoelee.com)

我为马来西亚的中小企业搭建 authentik 单点登录、自托管 Docker 环境、
反向代理与隧道——并把过程中学到的东西写下来。
