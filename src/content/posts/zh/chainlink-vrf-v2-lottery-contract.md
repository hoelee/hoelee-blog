---
title: "一个基于 Chainlink VRF v2.5 与 Automation 的自动化彩票合约"
description: "基于 Chainlink VRF v2.5 与 Automation 构建彩票合约：为什么开奖无法被操纵、完整的合约讲解，以及那个让开奖挂掉的 mock 订阅资金不足 bug。"
pubDate: 2024-12-10
updatedDate: 2026-09-29
category: web3
tags: [solidity, chainlink, vrf, foundry, hardhat, blockchain]
ogImage: /og/chainlink-vrf-v2-lottery-contract.png
banner: /banners/chainlink-vrf-v2-lottery-contract.png
draft: false
---

你能在链上运行一个没人能操纵的彩票吗——玩家不能、矿工不能，连部署它
的人也不能？这就是我写 `Raffle.sol` 时想回答的问题，也是这个项目要
用区块链预言机（oracle）的根本原因。

简短的回答是可以，但带着两个诚实的条件。随机数必须来自合约本身无法
预测、也无法重掷的地方；开奖必须没有人类按下按钮——因为一个能决定
「何时」开奖的人，「何时」本身就已经是一种攻击。这篇文章会讲合约
本身、让开奖挂掉的 bug、我是怎么测试它的，以及重做时我会改什么。
这是一个学习项目，不是处理真钱的线上代码——我开门见山说出来，
因为这篇文章的可信度就靠它。

## 为什么这是预言机少数真正有用的场景之一

合约无法自己产生随机数。当前区块的 `blockhash` 可以预测，
`block.timestamp` 由挖出区块的人决定，任何纯 Solidity 的「随机」函数
都是确定性的——每个玩家都能重算出来。链上彩票因此需要一个预言机，
而这是少数几个预言机不是弱点、反而是全部意义所在的场景。

Chainlink VRF（可验证随机函数）返回一个随机数，并附带一份合约在链上
验证的证明。合约在数字到达之前无法预测它，到达之后也无法重掷——
数字在开奖之前就已承诺，而计算出它的模块看不到谁参加了。这正是彩票
需要的性质，也是任何区块哈希都给不了的性质。

另一半是 Chainlink Automation。节点按定时器观察合约，调用
`checkUpkeep`；当它说「对，现在开奖」，节点就调用 `performUpkeep`。
合约自己的文档注释把目标说得很清楚：

```solidity
// Enter the lottery (paying some amount)
// Pick a random winner (verifiably random)
// Winner to be selected every X minutes -> completely automated
// Chainlink Oracle -> Randomness, Automated Execution (Chainlink Keeper)
```

没有 keeper 节点，没有人类——合约回答「现在该抽出赢家吗？」这个问题，
预言机按答案行动。

## 我试了什么，以及那个让开奖挂掉的 bug

项目叫 `hardhat-smartcontract-lottery`：一个 `Raffle` 合约，
用 Hardhat 和 Foundry 两套工具测试，部署并验证在 Sepolia 上。
搭建过程是常规的
VRF v2.5 流程：在 vrf.chain.link 创建订阅、充值、部署 consumer、把它
加进订阅，然后在 30 秒间隔上注册一个 Automation upkeep（间隔、0.01 ETH
入场费、50 万 gas 的回调上限，都放在 `HelperConfig` 里）。

开奖挂了，而且在合约内部完全看不见。在本地，VRF mock 毫无怨言地接受
了请求——然后 fulfill 回滚了。仓库自己的历史记录了这次失败——修复落
在一个标题为 "Fixed InsufficientBalance VRF Mock" 的提交里——痕迹至今
留在测试文件里。Foundry 测试里 `fulfillRandomWords` 调用旁的注释只写
着 `// InsuficientBalance()`，hardhat 测试里有一条更长、更惨的：
`// Here cannot run, always InsufficientBalance()`。

我当初没明白的是：mock 并不比主网宽松——它执行着同样的不变量。在它
愿意服务请求之前，订阅必须存在、必须有余额、必须把彩票合约注册为
consumer，而且 LINK 必须真的流动。mock 和 coordinator 一样记录订阅
余额——JS 测试会读 `getSubscription(...).balance` 回来确认——而在
真实链上，你的钱包用 `transferAndCall` 把 LINK 发给 coordinator，
订阅才会入账。我的订阅要么是空的，要么 consumer 还没挂上，于是
fulfill 被合理地弹了回来。

修复在测试的 setUp 里：Foundry 的 `setUp()` 在*任何测试运行之前*铸造
100 个 LINK 并为订阅充值（`LINK_BALANCE = 100 ether`）：

```solidity
vm.startPrank(msg.sender);
if (block.chainid == LOCAL_CHAIN_ID) {
    link.mint(msg.sender, LINK_BALANCE);
    VRFCoordinatorV2_5Mock(vrfCoordinatorV2_5).fundSubscription(
        subscriptionId,
        LINK_BALANCE
    );
}
link.approve(vrfCoordinatorV2_5, LINK_BALANCE);
vm.stopPrank();
```

部署脚本在真实链上做同样的事——`FundSubscription` 用 `transferAndCall`
送出 `FUND_AMOUNT`（3 个 LINK）：

```solidity
LinkToken(linkToken).transferAndCall(vrfCoordinatorV2_5, FUND_AMOUNT, abi.encode(subId));
```

hardhat 部署脚本会给刚创建的订阅充值。这次教训花了我一个晚上：
**VRF mock 要求订阅先有资金才愿意服务请求**，而 checkUpkeep 自己的
文档注释也隐晦地这么写——"Implicity, your subscription is
funded with LINK." 随机数不是免费的，连在 mock 里也不是。

## 修复：逐段讲解合约

`Raffle` 继承自两个 Chainlink 合约，都来自 v2.5 线：

```solidity
import {VRFConsumerBaseV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";
import {AutomationCompatibleInterface} from "@chainlink/contracts/src/v0.8/automation/interfaces/AutomationCompatibleInterface.sol";

contract Raffle is VRFConsumerBaseV2Plus, AutomationCompatibleInterface {
```

构造函数接收 coordinator 地址、订阅 ID、gas lane（key hash）、间隔、
入场费和回调 gas 上限，除了必须变化的状态外全部 `immutable`。两个
常量很关键：`REQUEST_CONFIRMATIONS = 3` 和 `NUM_WORDS = 1`——
开奖只需要一个随机词，且要等三个区块确认。

**入场。** `enterRaffle` 刻意保持无聊：要么付足够的钱，否则回滚
`Raffle__NotEnoughETHEntered`；要么处于 `OPEN` 状态，否则回滚
`Raffle__RaffleNotOpen`。然后把发送者压栈，发出事件：

```solidity
if (msgValue < i_entranceFee) {
    revert Raffle__NotEnoughETHEntered();
}
if (s_raffleState != RaffleState.OPEN) {
    revert Raffle__RaffleNotOpen();
}
s_players.push(payable(msg.sender));
emit RaffleEnter(msg.sender);
```

**决定是否开奖。** `checkUpkeep` 用一行写完了整个 Automation 合约：

```solidity
bool isOpen = RaffleState.OPEN == s_raffleState;
bool timePassed = ((block.timestamp - s_lastTimeStamp) > i_interval);
bool hasPlayers = s_players.length > 0;
bool hasBalance = address(this).balance > 0;
upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers);
```

**开奖。** `performUpkeep` 只能被网络调用，但它仍然重新检查
`checkUpkeep`——upkeep 可能拿陈旧数据被触发，纵深防御不花什么成本。
检查失败时它回滚一个自定错误，错误里自带证据：

```solidity
revert Raffle__UpkeepNotNeeded(
    address(this).balance,
    s_players.length,
    uint256(s_raffleState)
);
```

错误数据本身就会告诉你哪个条件失败了。然后状态翻转，VRF 请求发出：

```solidity
s_raffleState = RaffleState.CALCULATING;

VRFV2PlusClient.RandomWordsRequest memory req = VRFV2PlusClient.RandomWordsRequest({
    keyHash: i_gasLane,
    subId: i_subscriptionId,
    requestConfirmations: REQUEST_CONFIRMATIONS,
    callbackGasLimit: i_callbackGasLimit,
    numWords: NUM_WORDS,
    extraArgs: VRFV2PlusClient._argsToBytes(
        VRFV2PlusClient.ExtraArgsV1({nativePayment: false})
    )
});

uint256 requestId = s_vrfCoordinator.requestRandomWords(req);
emit RequestedRaffleWinner(requestId);
```

`nativePayment: false` 表示这次请求用订阅里的 LINK 付费——这正是资金
bug 之所以要紧的原因。

**锁。** `RaffleState` 是一个枚举，`OPEN` 和 `CALCULATING`。从
`performUpkeep` 翻转它那一刻起，到 `fulfillRandomWords` 把它重置为止，
彩票处于 `CALCULATING`，`enterRaffle` 一律回滚。没人能在请求与回调
之间溜进来，所以被随机数索引的数组，恰好就是随机数抽取所面对的玩家
集合。防操纵的全部故事，就藏在这一个枚举里。

**抽赢家。** VRF coordinator 会回调 `fulfillRandomWords`，
合约覆写它：

```solidity
uint256 indexOfWinner = randomWords[0] % s_players.length;
address payable recentWinner = s_players[indexOfWinner];
s_recentWinner = recentWinner;
s_players = new address payable[](0);
s_lastTimeStamp = block.timestamp;
s_raffleState = RaffleState.OPEN;
emit WinnerPicked(recentWinner);

(bool success, ) = recentWinner.call{value: address(this).balance}("");
if (!success) {
    revert Raffle__TransferFailed();
}
```

这个顺序是故意的，它就是 Checks-Effects-Interactions 模式（合约自己的
注释里点了名）。赢家、玩家数组、时间戳、彩票状态全部在 ETH 转账*之前*
重置。如果赢家恰好是个合约，它的 fallback 想重新入场：没什么可重入的
对象了——状态已经全新，转账失败则由自定错误处理，而不是一句无声的
`require` 字符串。

## 它是怎么被测试的——一套故意保留的混合测试套件

仓库为同一个合约保留了两套单元测试，因为它们抓的是不同的东西。
Hardhat/JS 套件（`Raffle.test.js`）用 hardhat-deploy
fixture、命名账户和 ethers 事件断言——它甚至在完整的端到端测试里监听
`WinnerPicked`。
Foundry 套件（`RaffleTest.t.sol`）是纯 Solidity：它 prank
coordinator mock，用
`vm.warp(block.timestamp + interval + 1)` 拨
时间、roll 区块，然后用同一种语言断言一切。两套测试独立地断言
相同的行为——hardhat 测试甚至检查
`consumers.includes(raffle.address)` 来证明订阅确实
连到了合约。

完整的开奖流程是端到端覆盖的：四个玩家入场、执行 `performUpkeep`、
从发出的日志里抓 `requestId`、经由 mock 完成 fulfill，然后断言赢家拿到
整个奖池、彩票回到 `OPEN`、时间戳前进了。

单元层周围是让「基于 mock 的测试」保持诚实的设施：一个 `LinkToken`
mock（ERC-677，带 `transferAndCall`）、Chainlink
`VRFCoordinatorV2_5Mock`，以及 `HelperConfig`，它按链构建
`NetworkConfig`。在 `LOCAL_CHAIN_ID`
(31337) 上它会自己部署 mock 并创建订阅；在 Sepolia 和主网上它持有
真实的 coordinator、gas lane 和 LINK 地址。两套工具链各有一份部署脚本：
`deploy/01-deploy-raffle.js`
（hardhat-deploy），以及 `script/DeployRaffle.s.sol`
（forge，配套 `Interactions.s.sol` 里的 `CreateSubscription`、
`FundSubscription`、`AddConsumer`）。

单元测试覆盖不了的东西，文件夹布局自己就承认了：integration 测试目录
是一份注释骨架，列着完整的金字塔——unit、integration、fork、staging、
fuzzing、formal verification。Mock 控制恰恰是你在真实网络上会失去的
东西，所以单元测试带着 `skipFork` modifier（"Testnet cannot
test with Mock, don't have Mock control"）——staging 阶段对着真实
Sepolia VRF 跑，练的是真正的订阅、资金和回调延迟，这些是 mock 只能
假装的东西。

最后，`.gas-snapshot` 把每个测试的成本钉死，回归被当作一个数字抓
出来，而不是一种感觉。完整的抽奖测试——从入场到付款的整条开奖流程
——是 335,011 gas：

```text
RaffleTest:testFulfillRandomWordsPicksAWinnerResetsAndSendsMoney() (gas: 335011)
RaffleTest:testPerformUpkeepUpdatesRaffleStateAndEmitsRequestId() (gas: 222486)
RaffleTest:testCheckUpkeepReturnsTrueWhenParametersGood() (gas: 74771)
```

## 前端

仓库还带了一个纯 HTML 前端 `pages/1/`，它是笔记里列出的七种与合约
交互方式的第一种（HTML/JS，然后是 Next.js + 原生 ethers、web3-react、
react-moralis、web3Modal、useDapp、wagmi）。浏览器不能
`require("ethers")`，所以页面被 browserify 打包成 bundle：

```bash
yarn browserify pages/1/indexProperCatch.js --standalone bundle -o pages/1/dist/bundle.js
```

`ProperCatch` 这个文件名本身就是重点：要修的就是
错误处理。每一个异步交互——connect、store、retrieve——都包在
`try/catch` 里，把错误 log 出来而不是让 promise 无处理地 reject；每条
路径都先检查 `typeof window.ethereum !== "undefined"`，钱包缺失时把
按钮文字换成 "Please install MetaMask"。旁边的 `index.js` 旧版本里一个
`try/catch` 都没有：交易被拒绝时 promise 只会无处理地在控制台里 reject，
而且它直接 `new ethers.providers.Web3Provider(window.ethereum)`，前面没有
任何判断。它是个小页面，但它决定了 demo
在交易被拒绝时是无声死掉，还是告诉你发生了什么。

## 重做时我会改什么

这是一个测试网学习项目，我想把边界写清楚：没有审计、没有经济攻击
建模、没有主网的钱。README 管它叫「学习项目笔记」，它就是如此。

运营上，一个真彩票有个学习项目没有的持续成本：VRF 订阅每次请求都会
消耗 LINK，Automation upkeep 也要自己的 LINK 余额。没人会自动充值——
我会写一个小监控脚本，给订阅补仓、余额太低时报警。

合约内部我会改四件事。第一，用 `randomWords[0] % s_players.length` 选
赢家在数组长度不能整除 2^256 时有模偏差——玩家少时可忽略，但真彩票
应该用拒绝采样，或者多要几个词。第二，回调忽略了 `requestId`——
`CALCULATING` 锁让重放不现实，但我会存下未完成的请求，并在
`fulfillRandomWords` 里校验。第三，赢家拿走全部余额，运营者一分不赚；
真彩票需要内置手续费或所有者分成。第四，没有暂停或紧急停止——一旦
出 bug，资金要卡到下一次开奖。

## 结果

一个数字，来自 gas snapshot：完整的开奖——四人入场、upkeep 触发、
VRF mock fulfill、赢家收款——在 Foundry 套件里跑 **335,011 gas**，
hardhat 套件又把同一个端到端行为断言了一遍。合约已部署并验证在
Sepolia 上（JS 部署的 0xc2022b56eBC140B5FebCf9FBaB14c17db4C315C4，
hardhat 部署的 0x3a827C119e1D746bb3C7bcbbf95c55246C8CcBdd）。我开头的
问题有了一个能指给人看的答案：随机数来自合约无法预测或重掷的模块，
状态机在开奖进行时锁住彩票，而自动化决定何时开奖。

我是全栈 Web 开发者和 DevOps 工程师，我构建完整的应用——
前端、后端、部署，以及那些必须持续跑下去的部分。如果你需要
一个全栈 Web 项目，或想让现有项目被可靠地部署，来找我：[WhatsApp](https://wa.me/60127972969)
· [me@hoelee.com](mailto:me@hoelee.com?subject=Full-stack%20web%20development)
· [hoelee.com](https://hoelee.com)。