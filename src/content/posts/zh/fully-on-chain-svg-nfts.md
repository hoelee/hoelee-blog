---
title: "全链上 SVG NFT：把艺术作品放进合约里"
description: "如何用 Foundry 铸造全链上 SVG NFT：把 SVG 图片 base64 编码进合约，tokenURI() 动态生成 data URI 元数据，并从链上状态切换表情。"
pubDate: 2024-10-08
updatedDate: 2026-09-29
category: web3
tags: [solidity, foundry, erc721, nft, svg, base64, onchain]
ogImage: /og/fully-on-chain-svg-nfts.png
banner: /banners/fully-on-chain-svg-nfts.png
draft: false
---

每个 NFT 都有两半。代币本身 —— 余额、授权、所有权 —— 住在合约里，
和链一样永久。艺术是另一回事：`tokenURI()` 返回一个字符串，而大多数
集合里，这个字符串指向*别处*：一个 `ipfs://` CID，一个 HTTPS URL。
代币是永久的，它指向的东西，却是一个没有任何合约能控制的外部依赖。

这是一个学习项目，不是生产代码 —— README 里写得很明白 —— 而且这里的
一切都跑在 Sepolia 测试网上。我把它写下来，是因为全链上这个模式确实
有用，下面的数字都是真实的，代码也小到可以一口气读完。

## 如何铸造一个艺术作品永不消失的 NFT？

如果你是个刚学 Solidity 的新手，拿这个问题去搜，大部分答案都会把你
引向 IPFS，再配一句关于 pinning 的 shrug。对小尺寸的艺术品，有更好的
答案：把艺术*放进合约里*，编码好，然后给钱包一个完整的 `data:` URI，
让元数据 JSON 和图片都在同一个字符串里。这样一来，艺术作品就是链上
的字节，和代币本身没有区别。

做法有两种。你可以把原始 SVG 存进合约，每次调用 `tokenURI()` 时才做
base64 编码 —— 部署更便宜，每次读取稍微多花点 gas。或者，你可以在
部署时一次性编码，存下成品 `data:image/svg+xml;base64,` 字符串。我的
`MoodNft` 用的是第二种，因为它还要根据链上状态在两张图之间切换，
而这一切正是**动态 NFT** 的最佳入门。

## 我先尝试的做法：一个只存 URI 的 ERC-721

起点是常规的 NFT 合约。我的叫 `BasicNft`：

```solidity
contract BasicNft is ERC721 {
    error BasicNft__TokenUriNotFound();
    uint256 private s_tokenCounter;
    mapping(uint256 => string) private s_tokenIdToUri;

    constructor() ERC721("Hoelee", "HOE") {
        s_tokenCounter = 0;
    }

    function mintNft(string memory tokenUri) public {
        s_tokenIdToUri[s_tokenCounter] = tokenUri;
        _safeMint(msg.sender, s_tokenCounter);
        s_tokenCounter = s_tokenCounter + 1;
    }

    function tokenURI(
        uint256 tokenId
    ) public view override returns (string memory) {
        if (ownerOf(tokenId) == address(0)) {
            revert BasicNft__TokenUriNotFound();
        }
        return s_tokenIdToUri[tokenId];
    }
}
```

它刻意做得非常小。`mintNft(tokenUri)` 把你给的字符串按代币存起来，
`tokenURI` 原样返回；如果代币从未被铸造，就触发一个自定义错误
（比带字符串的 `require` 更省 gas，也自带文档）。我用自己的名字命名
集合，因为重点是光明正大地学习：`ERC721("Hoelee", "HOE")`。

这个合约对 URI 指向什么没有任何意见 —— OpenZeppelin 的 `ERC721` 基类
也没有 —— 所以艺术住在 URI 所在的地方。

## IPFS 托管艺术的诚实问题

对 `BasicNft` 来说，流程是标准的：把元数据 JSON 放到 IPFS 上，把它的
`ipfs://<CID>` 交给合约，让钱包和市场通过网关去解析。渲染能成功，依赖
两件事一直成立：**有人持续 pin 住那个 CID**，并且**某个网关持续提供
它**。这两件事都在任何合约的控制范围之外。pin 一旦掉了，代币还在 ——
只是再也没有艺术了。

我自己的铸造脚本就是这有多随意的最佳证据。`Interactions.s.sol` 里带了
四个示例 URI：两个原生的 `ipfs://` CID，两个
`https://gateway.pinata.cloud/ipfs/...` URL。
README 在这个话题上的原话是：优先用原生 CID 形式，这样资产不依赖任何
单一网关。原文是：
"so the asset resolves independent of any single gateway"
网关 URL 是彻头彻尾的单一故障点。原生 CID 好一点，但它仍然依赖某个 pin 存在。

而保存下来的铸造日志显示，`BasicNft` 的 0 号代币实际存进去的是：

```text
ipfs://QmW1aRxvAngY22wrxyrUYSriekkHQMcXA3D1mjHgBc5ge6?filename=MrHoelee.png
```

这个 CID 指向的是一个我自己都没在跑的 pin。我没法保证那个节点 —— 或者
现在 pin 着它的任何人 —— 一直在线。「代币是永久的」和「艺术只是一句
承诺」之间的这道裂缝，正是我想要消除的东西。

## 修复方案：部署时把艺术编码进合约

`MoodNft` 把艺术本身存进合约。编码在部署脚本里完成：它读取 `img/`
下的两个 SVG 文件，在构造函数被调用之前，就把每一个都变成
`data:image/svg+xml;base64,` URI：

```solidity
function run() external returns (MoodNft) {
    string memory svgSmile = vm.readFile("img/smile.svg");
    string memory svgSad = vm.readFile("img/sad.svg");
    string memory imageUriSmile = svgToImageUri(svgSmile);
    string memory imageUriSad = svgToImageUri(svgSad);

    vm.startBroadcast();
    MoodNft moodNft = new MoodNft(imageUriSmile, imageUriSad);
    vm.stopBroadcast();

    return moodNft;
}

function svgToImageUri(
    string memory svg
) public pure returns (string memory) {
    string memory baseURL = "data:image/svg+xml;base64,";
    string memory svgBase64Encoded = Base64.encode(
        bytes(string(abi.encodePacked(svg)))
    );

    return string(abi.encodePacked(baseURL, svgBase64Encoded));
}
```

两个细节很关键。`vm.readFile` 是 Foundry 的 cheatcode，在脚本运行期间
从磁盘读文件，所以合约里永远不会出现手写生成再粘贴进去的 base64 块
—— 链上的艺术可以被证明就是 `img/` 里的艺术。而 `Base64` 来自
OpenZeppelin 的 utils，我也不用自己写编码器。

构造函数随后把两个现成的 URI 存为状态：

```solidity
constructor(
    string memory happySvgImageUri,
    string memory sadSvgImageUri
) ERC721("MoodNft", "MN") {
    s_tokenCounter = 0;
    s_sadSvgImageUri = sadSvgImageUri;
    s_happySvgImageUri = happySvgImageUri;
}
```

`mintNft()` 不收任何 URI：它 `_safeMint` 铸造，把新代币记为
`Mood.HAPPY`，存进 `mapping(uint256 => Mood)`，然后计数器加一。
艺术在部署那一刻就定下来了，而不是铸造的时候。

## tokenURI 动态构建整个 NFT

这就是模式的核心：

```solidity
function tokenURI(
    uint256 tokenId
) public view override returns (string memory) {
    string memory imageURI;
    if (s_tokenIdToMood[tokenId] == Mood.HAPPY) {
        imageURI = s_happySvgImageUri;
    } else {
        imageURI = s_sadSvgImageUri;
    }

    string memory tokenMetadata = string.concat(
        '{"name":"',
        name(), // You can add whatever name here
        '", "description":"An NFT that reflects the mood of the owner, 100% on Chain!", ',
        '"attributes": [{"trait_type": "moodiness", "value": 100}], "image":"',
        imageURI,
        '"}'
    );

    string memory tokenURIJson = string(
        abi.encodePacked(
            _baseURI(),
            Base64.encode(
                bytes(abi.encodePacked(tokenMetadata))
            )
        )
    );
    return tokenURIJson;
}

function _baseURI() internal pure override returns (string memory) {
    return "data:application/json;base64,";
}
```

跟着走一遍它返回的东西：JSON 里的 `"image"` 字段本身就是一个
`data:image/svg+xml;base64,` URI —— 是艺术本身，不是指向艺术的指针。
然后整个元数据 JSON 再做一次 base64 编码，`_baseURI()` 在前面加上
`data:application/json;base64,`。于是 `tokenURI()` 返回一个完全
自包含的字符串。钱包解码它，就同时拿到名字、描述、属性和图片字节，
没有任何东西还需要去取。整条链路里没有 IPFS、没有 HTTPS、没有网关。

## flipMood：由链上状态驱动的动态 NFT

因为情绪就是*状态*，改变状态就改变了艺术：

```solidity
function flipMood(uint256 tokenId) public {
    if (
        getApproved(tokenId) != msg.sender && ownerOf(tokenId) != msg.sender
    ) {
        revert MoodNft__NotOwnerOfToken();
    }
    if (s_tokenIdToMood[tokenId] == Mood.HAPPY) {
        s_tokenIdToMood[tokenId] = Mood.SAD;
    } else {
        s_tokenIdToMood[tokenId] = Mood.HAPPY;
    }
}
```

门槛是持有者*或*被授权地址 —— `getApproved()` 来自 `ERC721`，免费获得
—— 其他人一律得到 `MoodNft__NotOwnerOfToken()`。翻转之后，同一个
token id 的 `tokenURI` 就开始返回另一张图。同一个代币，不同的面孔，
全部在链上。这是最小可能的动态 NFT，也是思考「由游戏状态或链上事件
驱动的艺术」时很好的起点。

## 测试教会我的 Solidity 细节

**Solidity 里不能用 `==` 比较两个 `string`。** Solidity 只能比较值
类型；`string` 是动态字节数组。惯用修法是比较哈希，我的测试文件甚至
用注释写明了这一点：

```solidity
// string is array of bytes can't directly compare
// we can compare: bool, uint256, address, bytes32
assert(
    keccak256(abi.encodePacked(expectedName)) ==
        keccak256(abi.encodePacked(actualName))
);
```

统一用哈希比较：
`keccak256(abi.encodePacked(a)) == keccak256(abi.encodePacked(b))`
这个模式在测试套件里到处都是，也是链上需要比较字符串时伸手就该拿的。

**测试分两层。** 数一遍仓库里的测试函数：四个测试合约，一共六个测试。
`MoodNftTest` 是纯单元测试：直接用常量 base64 URI 构造 `MoodNft`。
另外三个 —— `DeployMoodNftTest`、`BasicNftTest`、
`MoodNftIntegrationTest` —— 实例化部署脚本并调用
`deployer.run()`，走的都是真实路径：在真正的 `img/*.svg` 上执行
`vm.readFile`、编码、部署。也就是说，连「单元」部署测试都在拿真实的
艺术文件验证 base64 流水线。

**身份伪装是两个 cheatcode。** `makeAddr("HOELEE")` 是从标签推导出的
确定性假地址 —— 不需要管理任何密钥。`vm.prank(USER)` 让*下一次*调用
看起来来自那个地址。两者配合，不需要钱包就能走通正常路径：

```solidity
function testFlipTokenToSad() public {
    vm.prank(USER);
    moodNft.mintNft();

    vm.prank(USER);
    moodNft.flipMood(0);

    assertEq(
        keccak256(abi.encodePacked(moodNft.tokenURI(0))),
        keccak256(abi.encodePacked(SAD_SVG_URI))
    );
}
```

**铸造脚本应该找到合约，而不是硬编码地址。** `Interactions.s.sol` 用
`DevOpsTools.get_most_recent_deployment("BasicNft", block.chainid)`，
它会读 `broadcast/` 日志，返回当前链上该合约最近一次部署的地址：

```solidity
address mostRecentDeployed = DevOpsTools.get_most_recent_deployment(
    "BasicNft",
    block.chainid
);
mintNftOnContract(mostRecentDeployed);
```

我自己的脚本里还留着注释掉的 Sepolia 和 Anvil 硬编码地址 —— 这正是
这个模式存在要消灭的习惯。地址要从部署日志里拿，否则总有一天你会
给一个过期的合约铸造。

## 如果重来，我会怎么做

**链上艺术要付部署 gas，而且是永久的。** 两张 SVG 的每一个字节都在
部署时一次性付清，然后以构造函数字符串的形式永远住在合约存储里。
这是一次性成本，但它是真实的，并且随艺术尺寸增长。

**能放进去的艺术有上限。** EIP-170 把合约代码限制在 24,576 字节以内，
艺术字节要和逻辑共用这个预算。笑脸和哭脸这种矢量 SVG 是理想选择 ——
小、清晰、可缩放。照片或 3D 模型永远塞不进去，硬塞也只是浪费 gas。
我的 `BasicNft` 部署返回 `4102 bytes of code`；
`MoodNft` 的字节码还要再叠上两张 SVG。

**不是每个项目都该这么做。** 如果艺术很大、集合需要可变元数据、或者
部署预算紧张，IPFS 或文件存储加一个*可设置的* base URI 才是务实的默认
选择 —— `ERC721` 的 `_baseURI()` 钩子让这个模式也很容易。该问的正确
问题是：*这份艺术必须在所有 pin 服务都消亡后依然存活吗？* 如果是，
而且它放得进合约，那就上链。否则，别为这些字节付钱。

**锁死 SVG 的行尾。** 仓库通过 `.gitattributes` 把
`img/*.svg` 固定为 LF，保证编码后的字节是确定的；在 Windows 上，
`core.autocrlf` 会悄悄注入 CRLF，改变编码后的艺术。这种「艺术就是
字节」的模式，对这种隐形 bug 毫不留情。

**从第一天起就用 DevOpsTools。** 对单机学习来说，注释里的硬编码地址
没关系；一旦有第二次部署，它们就是陷阱。

## 量化的结果

仓库里保存了一份部署日志，是 `BasicNft` 部署到 Sepolia 的记录，所以
下面这些数字和文件里完全一致：

| Item | Value |
|---|---|
| Chain | `11155111` |
| Constructor trace | `[868596] → new BasicNft` |
| Deployed bytecode | `4102 bytes of code` |
| Deployment tx | `993568 gas * 0.538650187 gwei` = `0.000535185588997216 ETH` |
| Block | `6522146` |
| Deployed at | `0x84F0Ee970BD49FCf1b8Cd637EF4e4755DBE74e0E`, auto-verified on Etherscan |

把存了 IPFS URI 的 0 号代币铸造出来，花了 `181874 gas` ——
`0.000186204671471742 ETH`。也就是说，在测试网上把 NFT 放上去几乎不
花钱；IPFS 依赖的代价是隐形的，直到某个 pin 死掉的那一天。

而 `MoodNft` 真正重要的结果根本不需要日志：在 MetaMask 里把部署好的
合约和 0 号代币作为 collectible 添加，艺术作品就直接从链上 base64 SVG
渲染出来 —— 没有 IPFS 网关、没有网络查找、没有任何需要维持在线的东西。
同一个代币，`flipMood` 一按就换脸。艺术唯一依赖的「服务器」就是
区块链本身，而任何一个节点都跑着一份完整的链。

## 需要这类工作吗？

我是一个全栈 Web 开发者和 DevOps 工程师。这类链上 demo 是我学习的地方，
但我为企业做的工作是全栈 Web 开发 —— 网站、Web 应用、API，以及它们
背后的自托管栈和部署流水线。如果你需要一个从零开始的项目，或者想
用一个小的链上概念验证来验证想法，告诉我你想做出什么：
[WhatsApp](https://wa.me/60127972969) ·
[me@hoelee.com](mailto:me@hoelee.com?subject=Web%20development%20project) ·
[hoelee.com](https://hoelee.com)。