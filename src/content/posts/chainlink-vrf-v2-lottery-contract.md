---
title: "An Automated Lottery Contract on Chainlink VRF v2.5 and Automation"
description: "Building a lottery on Chainlink VRF v2.5 and Automation: why the draw can't be rigged, a full contract walkthrough, and the mock-funding bug that broke it."
pubDate: 2024-12-10
updatedDate: 2026-09-29
category: web3
tags: [solidity, chainlink, vrf, foundry, hardhat, blockchain]
ogImage: /og/chainlink-vrf-v2-lottery-contract.png
banner: /banners/chainlink-vrf-v2-lottery-contract.png
draft: false
---

Can you run a lottery on-chain that nobody can rig — not the players, not the
miners, and not even the person who deployed it? That was the question I was
trying to answer when I built `Raffle.sol`, and it is the reason this project
uses a blockchain oracle at all.

The short answer is yes, with two honest conditions. The randomness has to
come from somewhere the contract itself cannot predict or reroll, and the
draw has to happen without a human pressing a button — because a human with
a button can choose *when* to draw, and "when" is already an attack. This
post walks through the contract, the bug that broke the draw, how I test it,
and where I would do things differently. It is a learning project, not
production money-handling code — I say that up front because the post's
credibility depends on it.

## Why this is one of the few genuinely good uses of an oracle

A contract cannot produce its own randomness. `blockhash` of the current
block is predictable, `block.timestamp` is chosen by whoever mines the
block, and any pure-Solidity "random" function is deterministic — every
player can recompute it. An on-chain lottery therefore needs an oracle, and
this is one of the few cases where an oracle is not a weakness but the whole
point.

Chainlink VRF (Verifiable Randomness Function) returns a random number with a
proof that the contract verifies on-chain. The contract cannot predict the
number before it arrives and cannot reroll it after — the number is committed
before the draw, and the module that produced it cannot see who entered. That
is exactly the property a lottery needs and the property no hash of the block
can give you.

The second half is Chainlink Automation. Nodes watch the contract and call
`checkUpkeep` on a timer; when it says "yes, draw now", they call
`performUpkeep`. The contract's own docstring describes the goal better than I
can:

```solidity
// Enter the lottery (paying some amount)
// Pick a random winner (verifiably random)
// Winner to be selected every X minutes -> completely automated
// Chainlink Oracle -> Randomness, Automated Execution (Chainlink Keeper)
```

No keeper nodes, no human — the contract answers the question "should a winner
be drawn right now?" and the oracle acts on the answer.

## What I tried, and the bug that broke the draw

The project is `hardhat-smartcontract-lottery`: one `Raffle` contract, tested
with both Hardhat and Foundry, deployed and verified on Sepolia. The setup
was the usual VRF v2.5 dance: create a subscription at vrf.chain.link, fund
it, deploy the consumer, add it to the subscription, then register an
Automation upkeep on a 30-second interval (the interval, the 0.01 ETH
entrance fee, and the 500,000-gas callback limit all live in `HelperConfig`).

The draw broke, and invisibly from inside the contract. Locally, the VRF mock
accepted the request without complaint — then the fulfillment reverted. The
repo's own history records the failure — the fix landed in a commit message
that literally reads "Fixed InsufficientBalance VRF Mock" — and the traces
are still in the test files. Next to the `fulfillRandomWords` calls in the
Foundry tests there is a comment that just says `// InsuficientBalance()`,
and the hardhat test has a longer, sadder one:
`// Here cannot run, always InsufficientBalance()`.

What I had not understood is that the mock is not laxer than mainnet — it
enforces the same invariant. Before it will serve a request, the subscription
must exist, hold a balance, and have the raffle registered as a consumer, and
the LINK has to actually move. The mock tracks the subscription's balance the
way the coordinator does — the JS test reads `getSubscription(...).balance`
back to confirm it — and on a real chain your wallet sends LINK to the
coordinator with `transferAndCall` so the subscription is credited. My
subscription was either empty or the consumer was not yet attached, and the
fulfillment legitimately bounced.

The fix lives in the test setup: the Foundry `setUp()` mints 100 LINK and
funds the subscription *before any test runs* (`LINK_BALANCE = 100 ether`):

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

The deploy scripts fund real chains the same way — `FundSubscription` sends
`FUND_AMOUNT` (3 LINK) with `transferAndCall`:

```solidity
LinkToken(linkToken).transferAndCall(vrfCoordinatorV2_5, FUND_AMOUNT, abi.encode(subId));
```

The hardhat deploy funds the subscription it just created. The lesson cost
me an evening: **a VRF mock needs a funded subscription before it will serve a
request, and checkUpkeep's own docstring says it implicitly — "Implicity, your
subscription is funded with LINK."** Randomness is not free, even in a mock.

## The fix, walked through the contract

`Raffle` inherits from two Chainlink contracts, both from the v2.5 line:

```solidity
import {VRFConsumerBaseV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";
import {AutomationCompatibleInterface} from "@chainlink/contracts/src/v0.8/automation/interfaces/AutomationCompatibleInterface.sol";

contract Raffle is VRFConsumerBaseV2Plus, AutomationCompatibleInterface {
```

The constructor takes the coordinator address, the subscription id, the gas
lane (key hash), the interval, the entrance fee, and the callback gas limit,
all `immutable` except the state that must change. Two constants matter:
`REQUEST_CONFIRMATIONS = 3` and `NUM_WORDS = 1` — the draw needs one random
word, confirmed three blocks.

**Entering.** `enterRaffle` is deliberately boring: pay >= the fee or revert
`Raffle__NotEnoughETHEntered`, and be in the `OPEN` state or revert
`Raffle__RaffleNotOpen`. Then push the sender and emit an event:

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

**Deciding whether to draw.** `checkUpkeep` is the whole Automation
contract in one line:

```solidity
bool isOpen = RaffleState.OPEN == s_raffleState;
bool timePassed = ((block.timestamp - s_lastTimeStamp) > i_interval);
bool hasPlayers = s_players.length > 0;
bool hasBalance = address(this).balance > 0;
upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers);
```

**Drawing.** `performUpkeep` is only callable by the network, but it re-checks
`checkUpkeep` anyway — an upkeep can be triggered with stale data, and defense
in depth costs nothing. If the check fails it reverts with a custom error that
embeds the evidence:

```solidity
revert Raffle__UpkeepNotNeeded(
    address(this).balance,
    s_players.length,
    uint256(s_raffleState)
);
```

The error data itself tells you which condition failed. The state then flips
and the VRF request goes out:

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

`nativePayment: false` means the request is paid in LINK from the subscription
— which is why the funding bug mattered.

**The lock.** `RaffleState` is an enum, `OPEN` and `CALCULATING`. From the
moment `performUpkeep` flips it until `fulfillRandomWords` resets it, the
raffle is `CALCULATING`, and `enterRaffle` reverts. Nobody can sneak in
between the request and the callback, so the array the randomness indexes is
exactly the set of players the randomness was drawn against. This is the
whole rig-proofing story in one enum.

**Picking the winner.** The VRF coordinator calls back into
`fulfillRandomWords`, which the contract overrides:

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

The order is deliberate and it is the Checks-Effects-Interactions pattern,
which the contract names in its own comment. The winner, the player array, the
timestamp, and the raffle state are all reset **before** the ETH transfer. If
the winner turns out to be a contract whose fallback tries to re-enter the
raffle, there is nothing left to re-enter against — the state is already fresh
and the transfer failure is handled by a custom error, not a silent `require`
string.

## How it is tested — a hybrid suite, on purpose

The repo keeps two unit suites for the same contract, because they catch
different things. The Hardhat/JS suite (`Raffle.test.js`) uses hardhat-deploy
fixtures, named accounts, and ethers event assertions — it even listens for
`WinnerPicked` in the full end-to-end test. The Foundry suite
(`RaffleTest.t.sol`) is native Solidity: it pranks the coordinator mock, warps
time with `vm.warp(block.timestamp + interval + 1)`, rolls blocks, and asserts
everything in one language. Both suites assert the same behavior
independently — the hardhat test even checks
`consumers.includes(raffle.address)` to prove the subscription is wired.

The full draw is covered end to end: enter four players, run
`performUpkeep`, grab the `requestId` from the emitted log, fulfill it
through the mock, then assert the winner got the whole pot, the raffle is
`OPEN` again, and the timestamp moved.

Around the unit layer sits the infrastructure that makes a mock-based suite
honest: a `LinkToken` mock (ERC-677, with `transferAndCall`), the
Chainlink `VRFCoordinatorV2_5Mock`, and `HelperConfig`, which builds a
per-chain `NetworkConfig`. On `LOCAL_CHAIN_ID` (31337) it deploys the mocks
and creates a subscription itself; on Sepolia and mainnet it holds the real
coordinator, gas lane, and LINK addresses. Deploy scripts exist for both
`deploy/01-deploy-raffle.js` (hardhat-deploy) and `script/DeployRaffle.s.sol`
(forge, with `CreateSubscription` / `FundSubscription` / `AddConsumer` in
`Interactions.s.sol`).

What unit tests cannot cover is acknowledged by the folder layout: the
integration tests directory is a comment skeleton naming the full pyramid —
unit, integration, fork, staging, fuzzing, formal verification. Mock control
is exactly what you lose on a real network, so the unit tests carry the
`skipFork` modifier ("Testnet cannot test with Mock, don't have Mock
control") — staging runs against real Sepolia VRF exercise the real
subscription, funding, and callback latency that a mock can only fake.

Finally, `.gas-snapshot` pins the cost of every test so a regression is caught
as a number, not a feeling. The full winner-selection test — the entire draw,
from entrance through payment — is 335,011 gas:

```text
RaffleTest:testFulfillRandomWordsPicksAWinnerResetsAndSendsMoney() (gas: 335011)
RaffleTest:testPerformUpkeepUpdatesRaffleStateAndEmitsRequestId() (gas: 222486)
RaffleTest:testCheckUpkeepReturnsTrueWhenParametersGood() (gas: 74771)
```

## The front end

The repo also carries a plain-HTML front end, `pages/1/`, which is method
one of seven the notes list for talking to a contract (HTML/JS, then Next.js
with raw ethers, web3-react, react-moralis, web3Modal, useDapp, wagmi). The
browser cannot `require("ethers")`, so the page is browserified into a
bundle:

```bash
yarn browserify pages/1/indexProperCatch.js --standalone bundle -o pages/1/dist/bundle.js
```

The error-handling page is the `ProperCatch` variant, and the name is the
point: error handling was the thing being fixed. Every async interaction —
connect, store, retrieve — is wrapped in `try/catch` that logs the error
instead of letting the promise reject unhandled, and every path checks
`typeof window.ethereum !== "undefined"` first, flipping the button text to
"Please install MetaMask" when the wallet is missing.
The earlier `index.js` sitting next to it has no `try/catch` at all, so a
rejected transaction promise simply goes unhandled in the console, and it
builds `new ethers.providers.Web3Provider(window.ethereum)` with no guard in
front of it. It is a small page, but it is the difference between a demo that
dies silently on a rejected transaction and one that tells you what happened.

## What I'd do differently

This is a testnet learning project and I want the limits on the record: no
audit, no economic attack modeling, no mainnet money. The README calls it "a
learning project note" and that is exactly what it is.

Operationally, a real lottery has an ongoing cost that a learning project
doesn't: the VRF subscription drains LINK with every request, and the
Automation upkeep needs its own LINK balance. Nobody funds that automatically
— I'd build a small watch script that tops up the subscription and alerts
when balances run low.

In the contract itself I would change four things. First, picking the winner
with `randomWords[0] % s_players.length` has modulo bias whenever the array
length does not divide 2^256 — negligible at small player counts, but a real
lottery should use rejection sampling or more than one word. Second, the
callback ignores `requestId` — the `CALCULATING` lock makes a replay
impractical, but I would store the outstanding request and verify it in
`fulfillRandomWords`. Third, the winner takes the entire balance, so the
operator earns nothing; a real lottery needs a fee or owner share built in.
Fourth, there is no pause or emergency stop — a bug would leave funds
stuck until the next draw.

## The result

One number, from the gas snapshot: the complete draw — four players entering,
the upkeep firing, the VRF mock fulfilling, the winner paid — runs at
**335,011 gas** in the Foundry suite, and the hardhat suite asserts the
same end-to-end behavior a second time. The contract is deployed and
verified on Sepolia (0xc2022b56eBC140B5FebCf9FBaB14c17db4C315C4 via the JS
deploy and 0x3a827C119e1D746bb3C7bcbbf95c55246C8CcBdd via hardhat deploy),
and the question I started with has an answer I can point at: the random
number comes from a module the contract cannot predict or reroll, the state
machine locks the raffle while the draw is in flight, and the automation
decides when.

I'm a full-stack web developer and DevOps engineer, and I build complete
applications — front end, back end, deployment, the parts that have to keep
running. If you need a full-stack web project built or an existing one
reliably deployed, get in touch: [WhatsApp](https://wa.me/60127972969) ·
[me@hoelee.com](mailto:me@hoelee.com?subject=Full-stack%20web%20development) ·
[hoelee.com](https://hoelee.com).