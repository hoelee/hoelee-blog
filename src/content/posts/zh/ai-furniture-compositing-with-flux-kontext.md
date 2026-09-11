---
title: "我如何用 FLUX.1 Kontext 打造 AI 家具合成演示"
description: "用 fal.ai FLUX.1 Kontext 把家具产品照合成到风格化房间场景——多图端点、tainted canvas 的修复，以及为什么必须关掉 prompt enhancement。"
pubDate: 2026-09-11
category: case-studies
tags: [fal-ai, flux, ai-image, javascript, canvas, ecommerce]
ogImage: /og/ai-furniture-compositing-with-flux-kontext.png
banner: /banners/ai-furniture-compositing-with-flux-kontext.png
---

一位家具客户带着一个每个小电商卖家最终都会撞上的问题来找我：他们的产品图都是**孤立的产品照**——一张白底桌子、一张白底椅子——但顾客不会从一片白茫茫的虚无里买家具，他们买的是*房间*。给每个产品、每种室内风格都拍一次实体棚拍，对一个人的生意来说根本不可能。

需求是：拿两张产品照（一张餐桌、一把椅子），把它们一起放进一个可信的、高级感的室内场景——生成出来的，而不是拍出来的。这篇文章讲的就是我为验证这件事可行而做的概念验证：我选的模型，以及三个差点把它搞砸的 bug。

## 为什么选 FLUX.1 Kontext——以及那个关键的端点

第一反应自然是通用文生图模型：*「一张餐桌和一把椅子放在现代客厅里」*。可当客户说*「不——是我的桌子、我的椅子，就是我产品页上那一款」*时，这个思路就崩了。生成一个相似品毫无价值；重点是要让**真实产品原封不动**，只改变它周围的房间。

这正是 **FLUX.1 Kontext**（通过 [fal.ai](https://fal.ai)）专门解决的问题：以图生图，参考图*锚定*产品，提示词描述场景。但有个坑让我耗掉一个下午：这里有**两个**端点。

| 端点 | 参考图输入 | 用途 |
|---|---|---|
| `fal-ai/flux-pro/kontext` | `image_url`（单张） | 编辑 / 重新语境化一张图 |
| `fal-ai/flux-pro/kontext/multi` | `image_urls`（数组） | **合并多张参考图** |

我需要把*两个独立产品融合进一个场景*，所以普通 `kontext` 不够——它只吃一张参考图。`multi` 变体接受参考图数组，这才是「桌子 + 椅子 → 一个房间」能成立的关键。它被标记为实验版，但这件事上它是唯一的选择。

## 用一个纯 HTML 文件调用 fal.ai——不用 SDK，不用服务器

做概念验证我不想搭后端。fal.ai 暴露了一个纯 REST 队列 API，所以一个 `index.html` 配 vanilla JavaScript 就能搞定全部。但这是三步，不是一步：

```js
// 1. 提交——返回 request_id + 轮询 URL
const submit = await fetch(
  "https://queue.fal.run/fal-ai/flux-pro/kontext/multi",
  {
    method: "POST",
    headers: {
      Authorization: "Key " + FAL_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: "...",
      image_urls: [tableDataUrl, chairDataUrl],
      enhance_prompt: false,
    }),
  }
);
const { request_id, status_url, response_url } = await submit.json();

// 2. 轮询状态直到 COMPLETED（约 5–30 秒）
let status;
do {
  await new Promise((r) => setTimeout(r, 2000));
  status = (await (await fetch(status_url, {
    headers: { Authorization: "Key " + FAL_KEY },
  })).json()).status;
} while (status === "IN_QUEUE" || status === "IN_PROGRESS");

// 3. 取结果
const result = await (await fetch(response_url, {
  headers: { Authorization: "Key " + FAL_KEY },
})).json();
// result.images[0].url 就是生成的图片
```

有两件事我很早就验证了，因为它们决定了「单文件」方案成不成立：

1. **CORS 是开放的。** `queue.fal.run` 返回宽松的 `access-control-allow-origin`，并允许 `authorization` 头，所以浏览器可以直接调用，无需代理。我在写任何 UI 之前就用 preflight 确认了这一点。
2. **本地图以 base64 data URI 传入。** fal.ai 的 `image_urls` 接受 `data:` URI，所以我根本不需要先把客户的照片传到存储桶——demo 直接读文件、压缩，然后塞进请求体。

## Canvas 压缩层

手机照片有 5–10 MB。两张这样、再 base64 编码，请求体会膨胀到无法使用，生成也会变慢。所以提交前，demo 会把每张图过一遍 `<canvas>` 来缩放并重新编码：

```js
async function imgToDataURI(file, maxSize = 1024, quality = 0.85) {
  const img = await createImageBitmap(file); // 或 new Image()
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", quality); // 每张约 200–400 KB
}
```

一张 7 MB 的手机照变成约 300 KB 的 JPEG。上传快，模型处理也快。

## Bug #1 ——「Tainted canvases may not be exported」

demo 在我脑子里能跑，在浏览器里却不行。我一点「生成」就收到：

> `Failed to execute 'toDataURL' on 'HTMLCanvasElement': Tainted canvases may not be exported.`

这是浏览器的安全边界，不是 fal.ai 的问题。当你用 `file://` 打开页面、并用 `<img src="chair.jpg">` 加载一张*本地*图片时，那张图属于**不透明源**。它一被画到 canvas 上，canvas 就变成 *tainted*，`toDataURL()` 拒绝导出——浏览器不会让网页读回一张它无法证明有权读取的文件的像素。

有两个修复，我在不同阶段都用过：

1. **把默认图以 base64 data URI 内嵌进 HTML 源码。** data URI 不会污染 canvas，所以即使从磁盘双击打开也能跑。
2. **走 HTTP、用同源相对路径**（`src="chair.jpg"`）。一旦页面和图片同源，canvas 就保持干净。这是真实部署的正确答案——demo 现在跑在一个 URL 上，而不是双击打开的文件。

通用规则：**只要任何不透明源的图片碰到 canvas，`toDataURL` 立刻报错。** 如果你要加载本地文件，要么内嵌，要么走 HTTP。不改浏览器安全设置，没有第三条路。

## Bug #2 —— API key 就在 HTML 里

对 demo 来说这可以容忍；对任何公开的东西来说这是个洞。客户端 `fetch` 里的 `Key` 头意味着 key 就在页面源码里，任何人按 F12 就能读到。给我交给客户的概念验证没问题，上生产就不可接受。

真正 WordPress 插件（下一阶段）的计划是把 key 挪到**服务端 PHP**：插件的端点去做带鉴权的 fal.ai 调用并返回图片，浏览器只跟插件自己的路由对话。demo 证明了管线能跑通；插件会把秘密放回秘密该待的地方。

## Bug #3 —— 输出看起来「像第二张图」

这是让我怀疑 `multi` 到底能不能用的那个。我换了一张新桌子图、生成，结果看起来跟椅子参考图几乎一模一样——好像模型直接忽略了桌子、复制了椅子。

在怪模型之前，我先查了一件可证伪的事：**`multi` 到底是在合成，还是只是在回显某一张输入？** 我用感知哈希和平均像素差对比了生成图和两张源图：

| 对比 | 平均像素差（0 = 相同） | dHash 距离 |
|---|---|---|
| 结果 vs 桌子 | 55.7 | 31 |
| 结果 vs 椅子 | 55.3 | 29 |
| 桌子 vs 椅子 | 69.3 | 30 |

结果离两张输入都*很远*——端点是真在合成新场景，不是复制。所以「像椅子」的问题不在 API，而在**输入和提示词**。

三个叠加的原因：

1. **参考图不一致。** 最初的 `chair.jpg` 是一张完整的「桌+椅」*场景*照，不是干净的单椅——于是模型看到一张图就已经满足「桌+椅同框」，就倾向照着它来。
2. **按位置指代不可靠。** Kontext 按图片*内容*匹配，而不是数组顺序。说「第一张图」/「第二张图」并不能可靠地映射到「桌子」/「椅子」。修复是直接*命名物体*——*「the dining table」*和*「the chair」*——让模型自己去匹配正确的参考图。
3. **prompt enhancement 开着。** fal.ai 的 `enhance_prompt`（默认关，但我一直惦记着它）会把你的提示词改写成更丰富的审美描述——当目标是*「别重新解读产品」*时，这正好帮倒忙。我把它钉死为 `false`，让模型遵守字面提示词，而不是添油加醋。

## 最终起作用的提示词

客户的核心要求很严格：**原样保留家具**，只去发明房间。这需要一段把大部分篇幅花在*阻止*重新解读、而不是描述风格上的提示词：

> Create a photorealistic interior photograph using the exact dining table and
> exact chair from the reference images. Preserve both furniture pieces exactly
> as shown — do not redesign, recolor, repaint, restyle, replace, or reinterpret
> either product. Keep their original geometry, proportions, construction,
> material, finish, texture, and color exactly unchanged.
>
> Place the chair naturally beside the dining table in a realistic dining
> position, slightly pulled under the table and properly aligned with it.
> Maintain realistic scale, perspective, and physical contact with the floor.
> The chair and table must look photographed together in the same real room,
> with natural contact shadows — not composited or pasted together.
>
> Preserve the true original color. Do not allow the room lighting, wall or
> floor colors, or grading to alter the furniture.
>
> Set the scene in a spacious modern living room with floor-to-ceiling windows
> and subtle warm afternoon daylight. Use restrained, neutral interior colors.
>
> Photorealistic commercial furniture photography, realistic camera
> perspective, natural proportions, high detail.

demo 里内置了六段这样的提示词，每种场景风格一段（现代客厅、温馨餐厅、北欧风、侘寂风、以及干净的影棚），每一段只改「set the scene」那一节。

## 结果

一个 `index.html`，没有后端、没有 SDK——两张产品照进，一个布置好的房间出，**每张图 $0.04**，生成约 15–20 秒。客户现在有了一个能拿给*他们*顾客看的可用预览，带场景选择器和可编辑提示词，然后再决定是否投入完整的 WordPress 插件。

这个概念验证回答了一个它生来就要回答的问题：**是的，你可以保留真实产品、只生成它周围的房间**——只要你尊重那三条真正要紧的约束：每个产品一张干净的参考图、按物体命名（而非按位置）的提示词、以及 `enhance_prompt: false`。

## 我会做不同的地方

- **第一天就要求干净的单品参考图。** 下游的每一种失败模式——「像某一张图」的问题、比例漂移——都能追溯到不一致的源照片。我会在碰任何模型之前，先发一份给客户的简短说明（「每张照片一个产品、纯色背景、没有其他家具」）。
- **先显式关掉 `enhance_prompt`。** 我浪费了一次生成，就因为 enhancement 把我精心写的「别重新解读」改写成恰恰相反的东西。
- **在写 UI 之前先用真实 preflight 验证 CORS。** 两行 `curl` 的事，却能给整个架构决策祛除风险。

---

## 想为你的产品目录做这个吗？

我为电商企业构建 AI 图像管线、WordPress 插件，以及自托管基础设施。如果你想把产品摆进风格化的房间场景——或者想雇我做类似的 AI 集成——我非常乐意交流：

- 📱 **WhatsApp：** [+60 12-797 2969](https://wa.me/60127972969)
- 📧 **邮箱：** [me@hoelee.com](mailto:me@hoelee.com?subject=AI%20product%20image%20compositing)
- 🌐 **网站：** [hoelee.com](https://hoelee.com)
