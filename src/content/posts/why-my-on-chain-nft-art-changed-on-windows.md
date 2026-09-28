---
title: "Why My On-Chain NFT Art Changed When I Cloned It on Windows"
description: "Why my on-chain NFT art changed on Windows: core.autocrlf injects CRLF into the SVG files vm.readFile encodes, the base64 differs, and eol=lf fixes it."
pubDate: 2026-08-19
category: web3
tags: [foundry, solidity, svg, base64, git, windows, crlf]
ogImage: /og/why-my-on-chain-nft-art-changed-on-windows.png
banner: /banners/why-my-on-chain-nft-art-changed-on-windows.png
draft: false
---

A fully on-chain NFT's artwork is supposed to be permanent. The image is
not a URL someone can unpin — it is a base64 string stored in the
contract's storage at deploy time, and after that it cannot change. So
the question writes itself: how can artwork like that change at all, let
alone silently?

In my case the answer was: the art was never a fixed string. It was
whatever bytes my deploy script happened to read from disk on the machine
that ran the deploy — and on Windows, Git quietly rewrites those bytes
before the script ever sees them.

I hit this in a small Foundry learning project built around a "mood"
NFT: an ERC-721 whose artwork flips between a smiling SVG and a sad SVG,
both encoded in the contract itself. The image URIs are built at deploy
time from source files in `img/`, so the byte-for-byte content of those
files is the artwork. Here is how one bad line ending nearly made that
art machine-dependent.

## What I hit: the deploy encodes whatever bytes it reads

The deploy script does the whole job in a few lines:

```solidity
string memory svgSmile = vm.readFile("img/smile.svg");
string memory svgSad = vm.readFile("img/sad.svg");
string memory imageUriSmile = svgToImageUri(svgSmile);
string memory imageUriSad = svgToImageUri(svgSad);
```

`vm.readFile` returns a string, `Base64.encode` turns those exact bytes
into a `data:image/svg+xml;base64,...` URI, and the constructor stores
both URIs forever. "On-chain" here is literal: whatever bytes the file
had on the deploying machine are now the contract's data — permanently.
A one-byte difference in the SVG at deploy time is a different artwork,
baked in for the life of the contract.

The difference I was worried about comes from Git's `core.autocrlf`.
A Windows Git install commonly rewrites text files with CRLF line
endings in the working tree, even when the repository stores LF. SVG
files are text. CRLF and LF are different bytes, and base64 encodes
different bytes differently. Two lines prove it:

```bash
printf 'a\nb' | base64    # YQpi
printf 'a\r\nb' | base64  # YQ0KYg==
```

One carriage return changes the encoded payload. Now the nasty part of
this failure class: nothing announces it. The SVG looks identical in
every editor. `git status` stays clean, because Git compares text after
normalising line endings. Foundry does not care either — it is not
parsing the SVG, just encoding bytes — so no error, no warning, on any
machine. The art baked into the contract silently depends on which
machine ran the deploy.

## The fix: one rule in .gitattributes

The fix is a single file with a single rule, and the comment matters:

```gitattributes
# Force LF line endings for asset files read by forge scripts (vm.readFile)
# so the working tree always matches what's stored in git, regardless of
# core.autocrlf / Windows checkout behavior.
img/*.svg text eol=lf
```

Why this works: `text` tells Git to treat those files as text and
normalise them, so in the repository they are always stored with LF.
`eol=lf` then pins the working-tree checkout of those paths to LF,
overriding whatever `core.autocrlf` says on any machine. The two
attributes together mean that on a Windows box with
`core.autocrlf=true`, `img/*.svg` are still checked out with LF — so
`vm.readFile` always returns the same bytes the author committed, and
the base64 URI is deterministic across platforms.

One precision: the rule governs checkout of those paths, and
normalisation when files are added. It did not rewrite the source SVGs
— they were already committed with LF, and the rule does not touch blob
content. What it prevents is the divergence on every checkout after it
lands.

The same commit fixed a second thing that was silently wrong: a typo in
the `remappings` entry in `foundry.toml`. The mapping is what makes
`@openzeppelin/contracts/...` imports resolve to the submodule, so a
typo there breaks the build with an error that has nothing to do with
the code I wrote:

```toml
remappings = ["@openzeppelin/contracts=lib/openzeppelin-contracts/contracts"]
```

## Two traps sitting right next to this one

### Trap 1: vm.readFile refuses to run without fs_permissions

`vm.readFile` is an *fs cheatcode* — Foundry will not let a script touch
the filesystem unless the path is explicitly granted in `foundry.toml`:

```toml
fs_permissions = [
    { access = "read", path = "./img/" },
    { access = "read", path = "./broadcast" },
]
```

Read access to `./img/` is for the SVGs; `./broadcast` is there so the
mint script's DevOpsTools helper can find the latest deployment log.
Without the grant the deploy fails at the first read — another
near-silent failure, because the error points at the cheatcode, not at
your code.

### Trap 2: DevOpsTools needs ffi = true

The interaction scripts import DevOpsTools from `foundry-devops` to
locate the last deployment instead of hardcoding an address. That import
needs Foundry's `ffi` cheatcode enabled, so the config carries it with
an explanatory comment:

```toml
ffi = true # For use of DevOpsTools import from lib/foundry-devops/src/DevOopsTools.sol
```

`ffi` is a real privilege grant — it lets scripts run arbitrary shell
commands — so it deserves that comment, and it is worth knowing exactly
which import requires it before you enable it.

## What I'd do differently

Two habits would have caught this earlier and would catch the next
line-ending regression:

1. **Assert on the encoded bytes in a test.** The integration tests
   already run the real deploy script, so the harness exists. A unit
   test that asserts `vm.readFile("img/smile.svg")` — or the final image
   URI — equals the expected LF-encoded base64 string would make a CRLF
   regression fail `forge test` loudly, instead of quietly shipping
   different art to a chain.
2. **Pin `eol=lf` for every asset directory a script reads as bytes.**
   The trap is not specific to SVG. If a script embeds JSON metadata or
   any other text asset, the same thing happens. As a rule of thumb:
   anything read with an fs cheatcode gets a `.gitattributes` rule
   before the script is committed.

## The result

After the fix, the base64 payload is identical on a Windows checkout and
a Linux checkout — one string, computed on two machines, byte for byte
equal — so the deployed contract's art is reproducible rather than
machine-dependent. That is the whole point of on-chain art, and it
turned out to be one file, one rule, and one `printf` away from being
quietly broken.

Honest scope: this is a learning project — a small, heavily commented
contract and deploy script run against a local Anvil node and the
Sepolia testnet, not production code. But "works on my machine" is a
bug report, and the fix here is the same discipline a production
deployment needs: know exactly what bytes your tooling is shipping.

I do full-stack web development for a living — front-end, back-end,
self-hosted deployment — and this class of byte-level, cross-platform
debugging is exactly what shipping software involves. If your project
needs a developer who checks the bytes, not just the diff, tell me about
it: [WhatsApp](https://wa.me/60127972969) ·
[me@hoelee.com](mailto:me@hoelee.com?subject=Full-stack%20web%20development)
· [hoelee.com](https://hoelee.com).