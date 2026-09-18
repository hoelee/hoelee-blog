---
title: "Your Own Speech-to-Text Server: Faster Than Typing, Private by Default"
description: "I run a self-hosted speech-to-text API on a single GPU PC. Dictation works from Windows, iPhone, iPad and Android — private, unlimited, and about 5x faster than typing."
pubDate: 2026-09-19
category: case-studies
tags: [whisper, cuda, stt, n8n, nginx, self-hosting, ai]
ogImage: /og/self-hosted-speech-to-text-api.png
banner: /banners/self-hosted-speech-to-text-api.png
---

Typing is the slowest thing most offices do all day. An average person types
40 words per minute; they *speak* 130. Every email, quotation, report, support
reply and chat message in your business pays that tax — and the tax is usually
paid by whoever is fastest at the keyboard.

Speech-to-text removes it. But the version most people adopt has two problems:
it costs a monthly subscription per seat, and it ships your voice — your
internal discussions, customer names, pricing, contracts — to someone else's
cloud.

So I built the other version: **one speech-to-text API running on a single
desktop PC in my office, with my own GPU doing the work.** My development PC,
my iPhone, an iPad and Android phones all dictate through it. It's faster than
typing, it's unlimited, and nothing leaves my network.

This is how it works — including the four traps that cost me most of a day.

## Why this matters

Speech-to-text is the highest-leverage office automation that isn't an AI
chatbot. Concretely, what a self-hosted setup buys you:

- **Roughly 5x the throughput of typing.** At 130 wpm spoken versus ~40 wpm
  typed, dictating a 500-word email is about 4 minutes of talking instead of
  12 minutes of typing. Someone who writes 10 emails a day gets an hour back —
  every day.
- **Cost scales with hardware, not headcount.** Cloud dictation is priced per
  user per month, forever. This one runs on hardware you own. Add the tenth
  employee and the marginal cost is zero.
- **Unlimited length, no quota anxiety.** No minute caps, no "you've reached
  your monthly limit" at 4pm on a Friday.
- **Your audio stays yours.** Medical notes, legal drafts, HR conversations,
  customer pricing — voice is sensitive by default. Self-hosted means the
  transcription never leaves the building.
- **It works in whatever app already has focus.** Not a separate transcribe-then-
  paste website — a keyboard you use inside Outlook, WhatsApp Web, your CRM,
  or your own internal tools.

If you run an office where people write all day, this is the same class of win
as moving from dial-up to broadband, and it costs a GPU you may already own.

## What you need

| Piece | What I used | Notes |
|---|---|---|
| GPU machine | Desktop PC with an RTX 3060 (12 GB) | Any NVIDIA card with ≥6 GB VRAM works; it can be a normal work PC |
| Whisper build | `whisper.cpp` with CUDA | Free, open source |
| Model | `large-v3` (~2.9 GB) | Best accuracy; smaller models use less VRAM |
| Delivery layer | n8n + nginx gateway | Adds auth, so the endpoint can be shared safely |
| Clients | Desktop app, iPhone, iPad, Android | Any client that speaks OpenAI's transcription API |

The PC doesn't have to be dedicated. Mine also runs development work,
local LLM inference and image generation — the model loads when a request
arrives and unloads when idle, so it isn't permanently holding VRAM.

## The architecture

The important design decision is that **the phones never talk to the GPU
directly.** There's a gatekeeper in between that handles authentication,
so the GPU itself stays on a private network.

```text
   iPhone / iPad / Android / Work PCs
                 │
                 │  HTTPS + per-device API key
                 ▼
     ┌───────────────────────────┐
     │  https://stt.example.com  │   public HTTPS entry
     │  reverse proxy            │
     └─────────────┬─────────────┘
                   ▼
     ┌───────────────────────────┐
     │  nginx gateway container  │   strips/forwards auth, fixed routes
     └─────────────┬─────────────┘
                   ▼
     ┌───────────────────────────┐
     │  n8n workflow             │   validates the key → 401/403 if wrong
     │  (no audio ever logged)   │
     └─────────────┬─────────────┘
                   ▼
     ┌───────────────────────────┐
     │  whisper.cpp on the PC    │   GPU transcription
     │  :20129  →  {"text": …}   │
     └───────────────────────────┘
```

Four layers, each doing one job: the proxy terminates TLS, the gateway fixes
routing, n8n authorises, whisper transcribes. The result is
`POST /v1/audio/transcriptions` — the same shape OpenAI uses, which means any
OpenAI-compatible client works with zero custom code.

## The build

Whisper needs CUDA and a CMake toolchain. On Windows that's three installs and
a build:

```bash
git clone https://github.com/ggerganov/whisper.cpp
cd whisper.cpp
cmake -B build -DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=86
cmake --build build --config Release -j
```

Then fetch the model and run it:

```bash
# large-v3, ~2.9 GB
cd models && sh ./download-ggml-model.sh large-v3 && cd ..
./build/bin/Release/whisper-server.exe \
  -m models/ggml-large-v3.bin \
  --host 0.0.0.0 --port 20129 \
  --convert
```

`--convert` matters more than it looks: it lets the server accept MP3 and
other compressed formats by shelling out to ffmpeg, instead of forcing every
client to send raw WAV. Most mobile apps send compressed audio.

The server is now a working transcription API. Everything after this point
is about making it safe to reach from a phone.

## Trap 1: CUDA Toolkit installs an incomplete compiler

The CUDA Toolkit installer's default component selection includes `nvcc` — but
*not* the pieces `nvcc` needs to actually compile. My first two CMake runs both
failed on missing headers, and the errors pointed at my build config rather
than at a partial toolchain.

The fix is to add three components explicitly:

```text
crt_13.x      → C runtime headers (the missing <crt/host_config.h>)
nvvm_13.x     → contains cicc, the actual CUDA compiler backend
cublas_13.x   → cuBLAS, required to link at runtime
```

Symptom to watch for: `nvcc --version` succeeds, but the build fails immediately
with a missing-header error. A working `nvcc` is not a working toolkit.

## Trap 2: it listens on localhost, so your firewall is innocent

Whisper's default bind is `127.0.0.1` — loopback only. Nothing else on the
network can reach it, no matter what your firewall says.

I lost real time here, because I assumed a firewall problem and tested the
firewall repeatedly (including turning it off entirely) while the actual cause
was the bind address. Loopback-only is *defined* to refuse every other
interface.

```bash
# what it looks like when the port is live but not exposed
netstat -an | grep 20129
#   TCP    127.0.0.1:20129    0.0.0.0:0    LISTENING     ← only you can reach it
```

Change the bind, and the picture changes:

```bash
--host 0.0.0.0
```

```text
   TCP    0.0.0.0:20129     0.0.0.0:0    LISTENING      ← the network can reach it
```

**Check the bind before you touch the firewall.** The two failures present
identically — a connection that times out — and only one of them is a firewall
problem.

One related gotcha: Windows Firewall profiles can re-enable themselves. A rule
scoped to `Private,Domain` will silently stop working on a network Windows has
since reclassified as *Public*, and an update that re-enables a profile has the
same effect. Scope the rule to the LAN subnet rather than to a profile name:

```powershell
New-NetFirewallRule -DisplayName 'Whisper STT' -Direction Inbound -Action Allow `
  -Protocol TCP -LocalPort 20129 -Profile Any -RemoteAddress LocalSubnet
```

`-RemoteAddress LocalSubnet` keeps it reachable from your office while staying
unreachable from the internet — which is the correct posture even with auth in
front.

## Trap 3: n8n throws away your audio (twice)

Putting n8n in the path is deliberate — it's where the API key check lives — but
it has two behaviours that silently break a proxy.

**First: Code nodes discard binary data.** My workflow was Webhook → Code
(validate key) → HTTP Request (forward audio). The Code node returned JSON, and
n8n's binary payload — the audio itself — never made it past it. Subsequent
error: *"Make sure that the previous node outputs a binary file."*

n8n's Webhook node accepts multipart uploads and stores them as binary. To
preserve that through an auth check, the Code node must pass the binary
reference through explicitly, not just return JSON. And the key name is not
what you'd guess:

```text
┌──────────────┬────────────────────────────┐
│ input field  │ binary key in n8n          │
├──────────────┼────────────────────────────┤
│ file         │ data0                      │
│ (second)     │ data1                      │
└──────────────┴────────────────────────────┘
```

The multipart field is named `file`, but n8n indexes it as `data0`. Forwarding
`$binary.data` fails; `$binary.data0` works.

**Second: execution logging stores the audio.** By default n8n persists
execution data — including binary payloads — which means every dictation is
written to the workflow database. For audio that's unacceptable. Disabling it:

```json
"settings": { "saveDataSuccessExecution": "none" }
```

⚠ **This is the trap with teeth.** If you edit a workflow via the n8n API and
omit the `settings` object, the update **silently resets it** and you go back to
logging audio. Nothing warns you. Verify after every workflow change:

```bash
curl -s -H "X-N8N-API-KEY: $KEY" \
  http://localhost:5678/api/v1/workflows/<id> \
  | jq '.settings'
```

## Trap 4: the stock nginx config hijacks port 80

I run the gateway as an nginx container. It kept returning 404s for paths that
were definitely configured — because the stock `default.conf` also declares a
server block on port 80, and it wins as the default server. My config was
loaded and correct, and simply never saw the traffic.

```dockerfile
# remove the stock config before starting
command: >
  sh -c "rm -f /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"
```

Two smaller notes from the same build, both worth knowing before you deploy to
a NAS:

- **You can't bind-mount a config file you haven't created yet** — the deploy
  fails with *"Bind mount failed: ... does not exist."* On DSM the obvious
  workaround of writing the file from inside another container doesn't work
  either, because containers see only their own mounts, never the real host
  filesystem. I ended up base64-embedding the config in the compose `command`
  and writing it at startup — no host filesystem access needed at all.
- **The `/volume1` mounts available to containers are read-only**, so the
  obvious write paths are closed.

## The authorisation model, honestly

Two layers, and it's worth being precise about what each one buys you.

**Per-device API keys.** Each device gets its own key, so revoking a lost phone
doesn't affect anyone else:

```json
{
  "iphone":  "stt_<random>",
  "ipad":    "stt_<random>",
  "laptop":  "stt_<random>"
}
```

The n8n workflow checks the `Authorization` header against this list and
returns a real 403 when it doesn't match. One subtlety: an API key in a URL
query string lands in proxy logs and browser history — keep it in the header.

**What this protects.** It stops unauthorised use of your GPU and keeps the
endpoint from being an open transcription service on the internet. What it does
not do is encrypt the audio — that's TLS at the proxy layer, which is why the
public entry point is HTTPS-only.

This is **access control for a private service**, not a hardened public API.
There's no rate limiting and no per-key quota yet. For an internal office
deployment across a handful of known devices that's proportionate; if you were
opening it to third parties you'd want limits, logging and rotation on top.

## What I'd do differently

1. **Verify the bind address first, not the firewall.** Two hours went into
   testing the wrong layer for a problem that `netstat` answers in one line.
   Both failures are "connection timed out", and I should have known that
   loopback-only refuses everything regardless of firewall state.
2. **Check what the toolkit installer actually installed.** I trusted
   `nvcc --version` as proof of a working toolchain. A compiler that runs but
   can't find its own headers is not installed, and the error message will not
   tell you that.
3. **Set logging policy before wiring the pipeline, not after.** I configured
   `saveDataSuccessExecution: none` during the build, but the same edit through
   the API would have silently re-enabled audio retention with no warning.
   Privacy settings that can be reset by an unrelated update need a verification
   step.

## The result

Four devices — a Windows development PC, an iPhone, an iPad and Android — all
dictating through one GPU on my own network. Typical transcription of a short
sentence is well under a second, and the end-to-end request through all four
layers returns a real transcript in about 2 seconds.

The measured win that matters most is memory. Because the model unloads when
idle, a toggle drops GPU usage from **4,906 MiB to 1,321 MiB** — about 3.6 GB
returned — so the machine can go back to development work, local LLM inference
or image generation, then load the model again on the next dictation.

And the honest framing on speed: **roughly 5x faster than typing** is the
correct figure for prose (130 wpm spoken vs ~40 typed). It's less dramatic for
code, where you're thinking more than typing. The gain is largest for exactly
the work offices drown in — email, documentation, notes, contracts, support
replies.

## Could this work for your office?

The pieces are unglamorous and the payoff is immediate: one machine with a GPU,
open-source software, and a delivery layer for authentication. No per-seat
subscription, no minute quotas, no audio leaving your premises — and the whole
office dictating instead of typing.

I build exactly this kind of internal infrastructure: self-hosted services with
proper auth, GPU workloads that share hardware sensibly, and the integration
layer that makes them usable from the devices your staff already carry. If you
want speech-to-text (or another internal API) running on your own hardware —
or on a workstation you already own — that's the work I do.

Reach me at [me@hoelee.com](mailto:me@hoelee.com?subject=Self-hosted%20speech-to-text)
or WhatsApp [+60 12-797 2969](https://wa.me/60127972969), or see what I do at
[hoelee.com](https://hoelee.com).
