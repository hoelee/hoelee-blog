---
title: "Fully On-Chain SVG NFTs: Putting the Artwork Inside the Contract"
description: "How to mint fully on-chain SVG NFTs with Foundry: base64-embed the artwork in the contract, build data URI metadata in tokenURI(), and flip moods on-chain."
pubDate: 2024-10-08
updatedDate: 2026-09-29
category: web3
tags: [solidity, foundry, erc721, nft, svg, base64, onchain]
ogImage: /og/fully-on-chain-svg-nfts.png
banner: /banners/fully-on-chain-svg-nfts.png
draft: false
---

Every NFT has two halves. The token itself — balances, approvals, ownership —
lives in the contract and is as permanent as the chain. The artwork is a
different story. `tokenURI()` returns a string, and for most collections that
string points *somewhere else*: an `ipfs://` CID, an HTTPS URL. The token is
permanent. The thing it points to is a dependency nobody's contract controls.

This project is a learning repo, not production work — the README says exactly
that — and everything here ran against the Sepolia testnet. I am writing it
up because the fully on-chain pattern is genuinely useful, the numbers below
are real, and the code is small enough to read in one sitting.

## How do you mint an NFT whose artwork cannot disappear?

If you search that question as a new Solidity developer, most answers route
you to IPFS with a shrug about pinning. There is a better answer for small
art: put the art *in* the contract, encoded, and hand the wallet a complete
`data:` URI that contains the metadata JSON and the image in one string. Then
the artwork is just bytes on the chain, no different from the token itself.

There are two ways to do it. You can store the raw SVG in the contract and
base64-encode it every time `tokenURI()` is called — cheaper to deploy, a
little more gas per read. Or you can encode the SVG once at deploy time and
store the finished `data:image/svg+xml;base64,` strings. My `MoodNft` does
the second, because it also flips between two images from on-chain state, and
the whole thing is a gentle introduction to **dynamic NFTs**.

## What I tried first: an ERC-721 that stores a URI

The starting point is the conventional NFT contract. Mine is `BasicNft`:

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

It is deliberately tiny. `mintNft(tokenUri)` stores whatever string you
hand it, per token; `tokenURI` returns that string; a custom error fires
if the token was never minted (cheaper than a string `require`, and
self-documenting).
I named the collection after myself, because the point was learning with a
straight face: `ERC721("Hoelee", "HOE")`.

The contract has no opinion about what the URI points to — neither does
OpenZeppelin's `ERC721` base — so the art lives wherever the URI lives.

## The honest problem with IPFS-hosted art

For `BasicNft` the flow is the standard one: put a metadata JSON on IPFS,
hand the contract its `ipfs://<CID>`, and let wallets and marketplaces
resolve it through a gateway. Rendering works as long as two things stay
true: **someone keeps a pin of that CID alive**, and **some gateway keeps
serving it**. Both are outside anyone's contract. If the pin drops, the token
still exists — it just has no art.

My own mint script is exhibit A of how sloppy this gets. `Interactions.s.sol`
carries four example URIs: two raw `ipfs://` CIDs and two
`https://gateway.pinata.cloud/ipfs/...` URLs. The README's own note on the
topic says to prefer the raw CID form "so the asset resolves independent of
any single gateway." A gateway URL is a single point of failure, full stop.
The raw CID is better, but it still depends on a pin existing somewhere.

And the saved mint log shows what actually got stored for token 0 of
`BasicNft`:

```text
ipfs://QmW1aRxvAngY22wrxyrUYSriekkHQMcXA3D1mjHgBc5ge6?filename=MrHoelee.png
```

That CID is a pointer to a pin I did not run. I cannot promise that node —
or whoever pins it now — stays up. That gap between "the token is permanent"
and "the art is a promise" is exactly what I wanted to remove.

## The fix: encode the artwork at deploy time

`MoodNft` stores the art itself. The deploy script does the encoding, reading
the two SVG files from `img/` and turning each into a
`data:image/svg+xml;base64,` URI before the constructor is even called:

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

Two details matter. `vm.readFile` is a Foundry cheatcode that reads a file
from disk during the script run, so the contract never contains a base64 blob
that was hand-generated and pasted — the art on chain is provably the art in
`img/`. And `Base64` comes from OpenZeppelin's utils, so I am not writing an
encoder myself.

The constructor then stores both ready-made URIs as state:

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

`mintNft()` takes no URI at all: it `_safeMint`s, records the new token as
`Mood.HAPPY` in a `mapping(uint256 => Mood)`, and increments a counter. The
art was decided at deploy time, not at mint time.

## tokenURI builds the whole NFT on the fly

This is the heart of the pattern:

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

Walk through what that returns: the `"image"` field inside the JSON is
itself a `data:image/svg+xml;base64,` URI — the art, not a pointer to art.
The whole metadata JSON is then base64-encoded, and `_baseURI()` prepends
`data:application/json;base64,`, so `tokenURI()` returns one self-contained
string. A wallet decodes it and has the name, the description, the attributes
and the image bytes with nothing left to fetch. There is no IPFS, no HTTPS,
no gateway in the entire chain of custody.

## flipMood: a dynamic NFT from on-chain state

Because the mood is *state*, changing state changes the art:

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

The gate is owner *or* approved address — `getApproved()` comes free from
`ERC721` — and anyone else gets `MoodNft__NotOwnerOfToken()`. Flip it, and
`tokenURI` starts returning the other image for the same token id. Same
token, different face, all of it on chain. That is the smallest possible
dynamic NFT, and a good place to start thinking about art driven by
game state or on-chain events.

## Solidity details the tests taught me

**You cannot `==` two `string`s in Solidity.** Solidity only compares value
types; `string` is a dynamic array of bytes. The idiomatic fix is comparing
hashes, and my test file even documents it in a comment:

```solidity
// string is array of bytes can't directly compare
// we can compare: bool, uint256, address, bytes32
assert(
    keccak256(abi.encodePacked(expectedName)) ==
        keccak256(abi.encodePacked(actualName))
);
```

`keccak256(abi.encodePacked(a)) == keccak256(abi.encodePacked(b))` appears
all over the test suite, and it is the pattern to reach for whenever you must
compare strings on-chain.

**The test layout is two layers.** Counting the test functions in the repo
gives six tests across four test contracts. `MoodNftTest` is a pure unit
test: it constructs `MoodNft` directly with constant base64 URIs. The other
three — `DeployMoodNftTest`, `BasicNftTest`, and `MoodNftIntegrationTest` —
instantiate the deploy script and call `deployer.run()`, so they exercise the
real path: `vm.readFile` on the actual `img/*.svg`, encode, deploy. That
means even the "unit" deploy test is proving the base64 pipeline against the
real art files.

**Impersonation is two cheatcodes.** `makeAddr("HOELEE")` is a
deterministic fake address derived from a label — no keypair to manage.
`vm.prank(USER)` makes the *next* call look like it comes from that
address. Together they drive the happy path without a wallet:

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

**Mint scripts should find the contract, not hardcode it.** The
`Interactions.s.sol` mint script uses
`DevOpsTools.get_most_recent_deployment("BasicNft", block.chainid)`,
which reads the `broadcast/` logs and returns the latest deployment of
that contract on the current chain:

```solidity
address mostRecentDeployed = DevOpsTools.get_most_recent_deployment(
    "BasicNft",
    block.chainid
);
mintNftOnContract(mostRecentDeployed);
```

My own script still carries the old hardcoded Sepolia and Anvil addresses in
comments — evidence of the habit this pattern exists to kill. Get the address
from the deployment logs, or you *will* mint a stale contract someday.

## What I'd do differently

**On-chain art costs deploy gas, forever.** Every byte of both SVGs is paid
for once, at deploy time, and then lives in the contract's storage as
constructor strings. It is a one-time cost, but it is real, and it scales
with the size of the art.

**There is an upper bound on how much art fits.** EIP-170 caps a contract's
code at 24,576 bytes, and the art bytes share that budget with the logic.
Vector SVGs like the smiley and the sad face are ideal — small, crisp, and
they scale. A photograph or a 3D model will never fit, and trying to cram
realistic art in there is a waste of gas. My `BasicNft` deploy returned
`4102 bytes of code`; the `MoodNft` bytecode has two SVGs stacked on top of
that.

**Not every project should do this.** If the art is large, if the collection
needs mutable metadata, or if deploy budget matters, IPFS or a file store
with a *settable* base URI is the pragmatic default — and `ERC721`'s
`_baseURI()` hook makes that pattern easy too. The right question to ask is:
*must this art survive the death of every pinning service?* If yes and it
fits on chain, go on-chain. Otherwise, don't pay for the bytes.

**Pin the SVG line endings.** The repo pins `img/*.svg` to LF via
`.gitattributes` so the encoded bytes are deterministic; on Windows,
`core.autocrlf` would otherwise inject CRLF and silently change the encoded
art. That is exactly the kind of invisible bug that this pattern — "the art
is the bytes" — makes unforgiving.

**Use DevOpsTools from day one.** Hardcoded addresses in comments are fine
for a solo testnet learner; they are a trap the moment a second deploy
happens.

## The quantified result

The repo keeps one deployment log, and it is for `BasicNft` on Sepolia, so
these figures are exactly as recorded:

| Item | Value |
|---|---|
| Chain | `11155111` |
| Constructor trace | `[868596] → new BasicNft` |
| Deployed bytecode | `4102 bytes of code` |
| Deployment tx | `993568 gas * 0.538650187 gwei` = `0.000535185588997216 ETH` |
| Block | `6522146` |
| Deployed at | `0x84F0Ee970BD49FCf1b8Cd637EF4e4755DBE74e0E`, auto-verified on Etherscan |

The mint that stored the IPFS URI for token 0 cost `181874 gas` —
`0.000186204671471742 ETH`. So the price of putting an NFT on a testnet is
tiny; the price of the IPFS dependency is invisible until the pin dies.

And the result that matters for `MoodNft` needs no log at all: add the
deployed contract and token ID `0` as a collectible in MetaMask, and the
artwork renders straight from the on-chain base64 SVG — no IPFS gateway, no
network lookup, nothing to keep alive. For the same token id, `flipMood`
changes the face. The only "server" the art depends on is the blockchain
itself, and a full copy of that runs on any node.

## Want this kind of work?

I am a full-stack web developer and DevOps engineer. On-chain demos like
this one are where I learn, but the work I do for businesses is full-stack
web development — websites, web apps, APIs, and the self-hosted stacks and
deploy pipelines behind them. If you need a project built from scratch, or a
small on-chain proof of concept to validate an idea, tell me what you are
trying to ship: [WhatsApp](https://wa.me/60127972969) ·
[me@hoelee.com](mailto:me@hoelee.com?subject=Web%20development%20project) ·
[hoelee.com](https://hoelee.com).