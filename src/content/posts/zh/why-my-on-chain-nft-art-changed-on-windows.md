---
title: "为什么在 Windows 上克隆后，我的链上 NFT 图像变了"
description: "为什么我在 Windows 上克隆后链上 NFT 的图像变了：core.autocrlf 往 vm.readFile 读取的 SVG 里注入 CRLF，base64 编码随之改变，而一个 eol=lf 规则就修好了它。"
pubDate: 2026-08-19
category: web3
tags: [foundry, solidity, svg, base64, git, windows, crlf]
ogImage: /og/why-my-on-chain-nft-art-changed-on-windows.png
banner: /banners/why-my-on-chain-nft-art-changed-on-windows.png
draft: false
---

一个完全链上的 NFT，其作品本该是永久的。图像不是某个随时可能被
下架的 URL —— 它是一段 base64 字符串，在部署时写入合约存储，
之后永远无法改变。所以这个问题几乎是自己冒出来的：这样的作品
怎么会变？而且还是静默地变？

在我这个例子里，答案是：作品从来就不是一串固定的字符。它取决于
部署脚本在**执行部署的那台机器**上恰好从磁盘读到的字节 —— 而在
Windows 上，Git 会在脚本看到那些字节之前，悄悄地改写它们。

这事发生在一个小小的 Foundry 学习项目里，做的是一枚「心情」
NFT：一个 ERC-721，作品可以在笑脸 SVG 和哭脸 SVG 之间切换，
两者都编码在合约自身中。图像 URI 在部署时由 `img/` 目录里的源
文件拼出来，所以这些文件的逐字节内容就是作品本身。下面就是一条
坏掉的换行符，如何差点让这幅作品变成「因机器而异」。

## 我遇到的事：部署脚本编码的是「读到的字节」

部署脚本用几行就干完了全部活：

```solidity
string memory svgSmile = vm.readFile("img/smile.svg");
string memory svgSad = vm.readFile("img/sad.svg");
string memory imageUriSmile = svgToImageUri(svgSmile);
string memory imageUriSad = svgToImageUri(svgSad);
```

`vm.readFile` 返回一个字符串，`Base64.encode` 把这**一模一样的
字节**变成 `data:image/svg+xml;base64,...` URI，构造函数把两个
URI 永久存入存储。「链上」在这里是字面意思：部署机器上文件当时的
字节，如今就是合约数据 —— 永久地。部署时 SVG 哪怕差一个字节，
就是另一幅作品，在合约存续期内焊死不动。

我担心的这个差异来自 Git 的 `core.autocrlf`。Windows 上的 Git
安装通常会把人工作区里的文本文件改写成 CRLF 换行，即使仓库里存
的是 LF。SVG 是文本文件。CRLF 和 LF 是不同的字节，而 base64 对
不同字节的编码也不同。两行命令就能证明：

```bash
printf 'a\nb' | base64    # YQpi
printf 'a\r\nb' | base64  # YQ0KYg==
```

一个回车符，就改变了编码后的载荷。这类失败最讨厌的地方在于：
没有任何东西会告诉你。SVG 在任何一个编辑器里看起来都一模一样。
`git status` 依然干净，因为 Git 在比较文本时先做了换行归一化。
Foundry 也不在意 —— 它不解析 SVG，只是编码字节 —— 所以在任何
机器上都没有报错、没有警告。写进合约的作品，就这样静默地取决于
执行部署的是哪台机器。

## 修法：.gitattributes 里的一条规则

修法是一个文件、一条规则，而那段注释同样重要：

```gitattributes
# Force LF line endings for asset files read by forge scripts (vm.readFile)
# so the working tree always matches what's stored in git, regardless of
# core.autocrlf / Windows checkout behavior.
img/*.svg text eol=lf
```

为什么有效：`text` 告诉 Git 把这些文件当作文本并做归一化，所以
仓库里它们永远以 LF 存储。`eol=lf` 则把这些人路径的工作区检出
钉死在 LF 上，覆盖任何机器上的 `core.autocrlf` 设置。两个属性
合在一起意味着：在一台 `core.autocrlf=true` 的 Windows 机器上，
`img/*.svg` 依然以 LF 检出 —— 所以 `vm.readFile` 永远返回作者
提交时的那组字节，base64 URI 跨平台可复现。

说精确一点：这条规则管的是这些路径的检出，以及文件加入仓库时的
归一化。它并没有改写源 SVG —— 那些文件本来就是以 LF 提交的，
规则也不碰 blob 内容。它阻止的是规则落地之后、每一次检出时可能
发生的分歧。

同一个 commit 还修了第二件静默出错的东西：`foundry.toml` 里
`remappings` 的一个拼写错误。这条映射决定了
`@openzeppelin/contracts/...` 的导入如何解析到子模块，所以一个
错字就会让构建失败，而报错和我写的代码毫无关系：

```toml
remappings = ["@openzeppelin/contracts=lib/openzeppelin-contracts/contracts"]
```

## 紧挨着的两个坑

### 坑一：没有 fs_permissions，vm.readFile 拒绝执行

`vm.readFile` 是一个 *fs cheatcode* —— 除非
在 `foundry.toml` 里显式授权路径，否则 Foundry
不允许脚本触碰文件系统：

```toml
fs_permissions = [
    { access = "read", path = "./img/" },
    { access = "read", path = "./broadcast" },
]
```

对 `./img/` 的读权限是为了 SVG；`./broadcast` 是为了让铸造脚本
里的 DevOpsTools 助手能找到最近的部署日志。没有授权，部署会在
第一次读取时就失败 —— 这又是一种近乎静默的失败，因为报错指向
cheatcode，而不是你的代码。

### 坑二：DevOpsTools 需要 ffi = true

交互脚本会导入 `foundry-devops` 里的 DevOpsTools 来定位上一次
部署，而不是硬编码一个地址。这个导入需要启用 Foundry 的 `ffi`
cheatcode，所以配置里带着它，并附了一句说明注释：

```toml
ffi = true # For use of DevOpsTools import from lib/foundry-devops/src/DevOopsTools.sol
```

`ffi` 是货真价实的权限授予 —— 它让脚本可以运行任意 shell 命令
—— 所以那句注释是应得的；在开启它之前，值得先弄清楚究竟是哪个
导入需要它。

## 如果重来，我会怎么做

两个习惯能更早抓住这个问题，也能抓住下一条换行符回归：

1. **在测试里断言编码后的字节。** 集成测试已经会跑真正的部署
   脚本，框架是现成的。加一个单元测试，断言
   `vm.readFile("img/smile.svg")` —— 或者最终的图像 URI —— 等于
   预期的 LF 编码 base64 字符串，那么 CRLF 回归就会让 `forge test`
   大声失败，而不是悄悄把另一幅作品送上链。
2. **凡是脚本按字节读取的资源目录，都钉上 `eol=lf`。** 这个坑
   不只属于 SVG。如果脚本要内嵌 JSON 元数据或任何其他文本资源，
   同样的事情照样发生。经验法则：任何用 fs cheatcode 读的东西，
   在脚本提交之前，先给它配一条 `.gitattributes` 规则。

## 结果

修复之后，base64 载荷在 Windows 检出和 Linux 检出上完全一致 ——
同一串字符串，在两台机器上各自算一遍，逐字节相等 —— 所以部署
出来的合约作品是可复现的，而不是因机器而异的。这正是链上作品的
全部意义所在；而它差一点就被一个文件、一条规则、一次 `printf`
就能证明的问题悄悄毁掉。

坦白说清范围：这是一个学习项目 —— 小而注释详尽的合约与部署
脚本，跑在本地 Anvil 节点和 Sepolia 测试网上，不是生产代码。
但「在我机器上是好的」本身就是一条 bug 报告，而这个修法背后
的纪律，正是生产部署需要的：精确知道你的工具链在发什么字节。

我平时做全栈网站开发 —— 前端、后端、自托管部署 —— 而这一类
字节级、跨平台的排障，正是真正上线软件时会遇到的事。如果你的
项目需要一个不只盯 diff、还盯着字节的开发者，跟我说说：
[WhatsApp](https://wa.me/60127972969) ·
[me@hoelee.com](mailto:me@hoelee.com?subject=Full-stack%20web%20development)
· [hoelee.com](https://hoelee.com)。