---
title: "Using Chinese LLM APIs From Malaysia: What Actually Works"
description: "Using Chinese LLM APIs (GLM-5.3, DeepSeek V4) from Malaysia: how I paid in RMB, handled phone verification, and which providers actually work."
pubDate: 2026-09-11
category: ai
tags: [llm, api, deepseek, glm, alipay, malaysia]
ogImage: /og/using-chinese-llm-apis-from-malaysia.png
banner: /banners/using-chinese-llm-apis-from-malaysia.png
draft: false
---

Chinese frontier models — GLM-5.3, DeepSeek V4, Qwen3.8-Max, Kimi K3 — now
score close to Claude on coding benchmarks while costing a fraction of Western
frontier APIs. For a solo developer or a small business running AI automation,
that price difference is the difference between "AI that pays for itself" and
"AI that's too expensive to run."

But using them from Malaysia means crossing three walls first: paying in RMB,
passing mainland-China phone verification, and (on some platforms) real-name
(实名) registration. This is what I actually did, what broke, and what I'd do
differently.

## Why bother?

Chinese API pricing is often 3–10× cheaper than the equivalent Western model.
As of this writing, DeepSeek's V4.1 Flash is around **US$0.15–0.30 per 1M
input tokens and US$0.60–1.20 per 1M output tokens** (off-peak hours are half
price; cached input is ~20× cheaper still). A US$10 top-up goes a long way —
tens of millions of tokens for agent workloads if you route carefully.

The catch: most of these platforms are built for mainland developers. That
means Chinese payment rails and, frequently, a mainland phone number for SMS
verification.

## Wall #1 — paying in RMB

I already had my own Alipay account, which is the payment method most of these
platforms accept (Alipay top-up on the platform itself, or Alipay to pay a
gateway). The problem is keeping RMB in it from Malaysia.

I reload my Alipay RMB balance through an exchange contact I've used for many
top-ups. It's a common gray-market route in Malaysia — do your own due
diligence, and never send more than you're comfortable losing. Once the RMB is
in Alipay, paying for API credits is exactly like paying for anything else in
China.

## Wall #2 — phone verification

**TokenRhythm (基元律动)** — the gateway I use most — requires a mainland China
phone number for registration. There's no way around that requirement on their
side, and I won't recommend dodging it. If you don't have access to a mainland
number, platforms like DeepSeek (email signup) or BytePlus ModelArk (Singapore,
USD billing) let you skip this wall entirely — more on those below.

What made TokenRhythm worth the hassle:

- **One API key, OpenAI-compatible.** It aggregates GLM-5.3, Qwen3.8-Max,
  DeepSeek V4, Kimi K2.7-Code, MiniMax, and Seed models behind a standard
  `https://tokenrhythm.studio/v1` endpoint. Any agent that speaks OpenAI-style
  APIs (OpenCode, Claude Code, LiteLLM, my own bots) just works.
- **Referral credits.** Registering through an invite link gets you ¥68 (~US$10)
  in free credit; referring another registration gets you another ¥68. The
  reward unlocks after you install their desktop app (OpenSquilla) and make at
  least one call from it — after that, the same API key works in any agent.
- **The credit is real money.** ¥68 (about US$10) covered roughly a month of
  light agent work, or about a week of heavy sessions, with DeepSeek V4 Pro
  through the gateway. DeepSeek's pricing is genuinely very good, so the credit
  goes further than you'd expect.

## The gotcha nobody warns you about

Promotional credit on these platforms is **time-limited, not a balance**.
TokenRhythm's new-user credit expires 30 days after it's granted — my first
batch expired on 2026-09-03 with some still unused. Don't register and hoard
the credit for "later". Spend it, or lose it.

Also worth knowing: DeepSeek is retiring its V4 Pro model on **September 14,
2026** — after that, `deepseek-v4-pro` requests are served by V4.1 Flash and
billed at Flash prices. That's good news for cost, just don't expect the Pro
behaviour to stay the same (other replacements will come).

## What actually works, in order of friction

1. **DeepSeek directly** — email signup, no China phone, no real-name.
   Cheapest per-token of anything I use. The official docs list the current
   rates with a peak/off-peak split.
2. **TokenRhythm (基元律动)** — best model menu for the money, OpenAI-compatible,
   but you need the mainland phone number and an invite link for the ¥68 credit.
3. **BytePlus ModelArk** — ByteDance's international platform: Singapore
   entity, USD billing, no China phone, and data processed in Malaysia/Singapore
   region. Slightly pricier per token, far less friction.
4. **OpenCode Go** — US$10/month flat for a curated roster of open coding
   models (GLM, DeepSeek, Kimi, Qwen, MiniMax) with roughly 6× the usage value.
   Not Chinese-billing at all, which is exactly its point.

## What I'd do differently

- **Check the verification requirements before signing up.** Email-only
  platforms (DeepSeek) or international platforms (BytePlus, OpenCode Go) avoid
  the phone wall completely. Only reach for the mainland-phone platforms when
  their model menu or price genuinely beats the alternatives.
- **Burn promotional credit immediately.** It's a 30-day lease, not a balance.
- **Start with a small recharge.** Test the actual model on your real workload
  for a week before committing.
- **Re-check prices before each top-up.** Chinese API pricing moves fast — DeepSeek
  cut prices permanently this year, GLM runs periodic flash promos, and deals
  appear and vanish weekly. Never assume last month's price is this month's.

## The result

I now run my AI automation — Telegram support bots, agentic coding sessions,
background LLM jobs — on Chinese LLM APIs for roughly the price of a coffee per
week of active use. The ¥68 TokenRhythm credit alone covered a month of light
use (a week of heavy work), and a US$10 DeepSeek top-up lasts even longer at
V4.1 Flash prices.

The walls are real, but they're payment-rail and verification walls — not
quality walls. If you're building AI features for a business that needs to
actually make money, the Chinese frontier APIs are worth the setup.

---

## Want AI automation like this for your business?

I build AI-powered automations, Telegram/WhatsApp support bots, websites, and
self-hosted infrastructure for Malaysian businesses — and I set up the cheapest
LLM routing so your running costs stay small. If that could help your business,
I'd love to talk:

- 📱 **WhatsApp:** [+60 12-797 2969](https://wa.me/60127972969)
- 📧 **Email:** [me@hoelee.com](mailto:me@hoelee.com)
- 🌐 **Website:** [hoelee.com](https://hoelee.com)
