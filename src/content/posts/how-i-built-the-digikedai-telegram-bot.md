---
title: "How I Built the DigiKedai Telegram AI Bot"
description: "A customer-support AI bot that answers questions and provisions free-trial accounts over Telegram and WhatsApp — TypeScript, grammY, a Cloudflare tunnel webhook, and a self-hosted LiteLLM gateway."
pubDate: 2026-09-06
category: case-studies
tags: [telegram, docker, cloudflare, litellm, typescript, ai]
ogImage: /og/how-i-built-the-digikedai-telegram-bot.png
---

Digi Kedai sells digital products — online courses, ebooks, and templates — and
every sale involves a stream of the same customer questions: *"does this course
have a free preview?", "how do I get my account?", "which package should I
buy?"*. Answering them manually doesn't scale for a one-person business. So I
built an AI customer-support bot that answers those questions around the clock
and can even hand out free-trial accounts without a human in the loop.

This is the story of how it went together — the architecture, the LLM wiring,
and the bugs that ate an afternoon each.

## Why a business needs a bot like this

Before the architecture, the *why*. A support bot isn't a gimmick — it changes
the economics of a small business:

- **Saves money on staff.** Every routine question a bot answers is one your
  team doesn't have to. Digi Kedai gets the equivalent of a round-the-clock
  support agent for a fraction of the cost of hiring one.
- **Answers instantly, 24/7.** Customers ask at midnight and on weekends. A bot
  replies in seconds, in their language — no queues, no "we'll get back to you".
- **Converts browsers into buyers.** The bot doesn't just answer — it *upsells*.
  A "does this have a free trial?" question turns into a claimed trial account
  in a couple of taps, with no human in the loop.
- **Never forgets a customer.** Long-term memory means repeat customers are
  greeted like regulars, not strangers.
- **Scales with your catalogue.** Add a product and the bot already knows it —
  no retraining, no new FAQ pages.

For a one-person business like Digi Kedai, that's the difference between losing
sales at 2 a.m. and closing them.

## The stack

- **TypeScript + Node 20** running as a single container on my Synology NAS.
- **grammY** — a lightweight Telegram Bot framework, wired in webhook mode.
- **Hono** — a tiny HTTP server that receives webhooks and answers `/health`.
- **Cloudflare tunnel** — `bot.digikedai.com` routes straight into the container;
  no public IP, no open ports.
- **LiteLLM** — a self-hosted gateway in front of the actual model, so I can swap
  providers or add fallbacks without touching bot code.
- **PostgreSQL** — conversation and user-memory storage, shared with my mem0 stack.

## The architecture

```
Customer → Telegram/WhatsApp → Cloudflare tunnel → bot.digikedai.com
  → Hono POST /<secret>/webhook → grammY handler
    → save to PostgreSQL → Agent.respond (system prompt + retrieved catalog facts + last 20 msgs)
      → LiteLLM (model alias "mem0-openai") → persist + reply
```

A few decisions worth explaining:

**A Cloudflare tunnel into the container, with no Traefik hop.** My homelab is
behind CGNAT, so nothing is publicly reachable without a tunnel. The webhook URL
lives behind a **secret path segment** (`/<secret>/webhook`) so Telegram's
updates only land if the caller knows the secret — a cheap first line of defense
on top of Telegram's own token auth.

**The model is addressed by a LiteLLM *alias*, never a raw model name.** The bot
calls `mem0-openai`; LiteLLM maps that to the real model (with an OpenRouter
fallback behind it). The bot never needs to know which provider is actually
serving the request. I set `temperature: 0.4` and a `45s` timeout.

**The bot knows its catalogue without prices or internal paths.** A build-time
generator turns a single `catalog_sku.csv` (the source of truth) into a
TypeScript module the bot imports — SKU, name, category, size, and a product URL,
and *nothing else*. Prices are never baked in ("check the site for the current
price"), and internal resource paths never ship to the bot image. That keeps the
bundle lean and prevents the model from leaking internal structure.

## Retrieval: how the bot actually *knows* the catalogue

A generic LLM with the catalogue stuffed into a prompt would hallucinate. So the
bot retrieves first, then answers. It has a three-tier retriever:

1. **SKU token match** — `/\b[A-Z]{2,}\d{2,}\b/gi` catches exact SKUs like `CZH01`.
2. **Whole-query substring** — for short, precise queries.
3. **Per-segment matching** — splits CJK runs (stripping question particles like
   有/吗/哪些) and filters English stopwords.

The top-5 matches become the "facts" injected into the system prompt, and the
model is instructed to answer *only* from what it actually retrieved — and to say
so when it finds nothing.

This matters more than it looks. A customer asking *"does CZH01 have a free
version?"* gets a correct answer about `FREECZH01` only because the retriever,
on hitting the paid SKU, **automatically attaches its free twin** and ranks it
second. That one detail turns a "no, sorry" into the correct upsell.

## Free-trial provisioning — no human in the loop

The part I'm proudest of: the bot doesn't just *talk about* free trials, it
*issues* them. A customer can trigger it three ways — the `/trial` command, a
natural-language message like *"我要这个试用：digikedai.com/products/czh01"*, or a
deep link like `?start=CZH01`.

Rather than route through n8n, the bot writes **directly to NocoDB** — inserting
a customer row and a customer-product row. My existing webhooks pick that up and
provision the actual account automatically, so the bot never touches the file
server. The whole thing is idempotent: if a customer already has an account, it
reuses it instead of creating a duplicate; if the product insert fails, it rolls
back the customer row so a retry doesn't dead-end.

There's even a multi-account selector. If the same Telegram user has several
accounts, the bot lists them as inline buttons and asks which one to attach the
trial to.

## The bugs that ate an afternoon each

Shipping this was not smooth. Three debugging stories stand out:

**1. The infinite reply loop.** Telegram re-delivers a webhook update if the
server doesn't acknowledge it within a timeout window. My handler was running
long (LLM latency), so Telegram re-sent the same message — and the bot answered
it again, and again. The fix was `onTimeout: "return"` with a 50-second window,
which stops the redelivery spiral dead.

**2. The model alias 400.** Calling the raw model name (`gpt-5-mini`) returned a
400. Only the LiteLLM alias worked. This is now a hard rule in the repo: *the LLM
must be the alias, never the raw upstream name.*

**3. The WhatsApp "m_text" bug.** When I added a WhatsApp channel (via a browser
extension that POSTs WhatsApp Web events to a webhook), a "customize webhook
payload" setting with empty-string template values made the extension send the
literal field *name* `m_text` as the message text — so the bot replied *"I don't
understand m_text"*. The fix was to turn that setting off and use the default
payload, which the adapter reads correctly.

The honest takeaway from all three: the failures weren't in the hard parts — the
LLM or the retrieval. They were in **webhook lifecycle and payload-contract
details**, the boring edges where integrations actually break.

## Deterministic flows on top of the LLM

An LLM is great for open-ended questions and terrible for *state*. So the
conversational pieces that need reliability — buying, trial redemption, deep
links — are **deterministic state machines**, not prompt engineering:

- **Buy intent** (`order`, `want to buy`, `buy`…) is intercepted before the LLM
  and drives an inline keyboard (online store → admin → back), never a free-form
  reply.
- **Deep links** carry the SKU in a `?start=` payload, but Telegram only allows
  `A-Z a-z 0-9 _ -` there — a `:` silently breaks it. I learned that the hard way
  and switched the separator from `buy:SKU` to `buy-SKU`.
- **Off-topic messages** in WhatsApp make the model emit a sentinel (`NO_REPLY`)
  that the agent turns into *"send nothing"* — so the bot stays silent instead of
  babbling when it has nothing useful to say.

## What I'd do differently

- **Add `setMyCommands()` at startup.** The command list is defined in code, but
  I never registered it with Telegram, so the in-chat command menu was empty
  until I fixed it via the Bot API. Small, but it cost a real customer touchpoint.
- **Design the payload contract before the channel adapter.** The WhatsApp
  `m_text` bug came from trusting a customization feature I hadn't read the
  contract for.
- **Treat webhook timeouts as first-class architecture**, not an afterthought —
  the redelivery loop was avoidable if I'd thought about acknowledgement windows
  on day one.

## The result

One container on the NAS now answers customer questions across two channels
(Telegram + WhatsApp), retrieves the correct catalogue entry by SKU or by natural
language, and issues free-trial accounts end-to-end — with a prompt suite of
~175 unit tests covering the deterministic flows, retrieval, and the payload
contracts. The source lives at
[git.hoelee.com/hoelee/digikedai-bot](https://git.hoelee.com/hoelee/digikedai-bot).

If you're building your own Telegram bot backed by an LLM, the lesson is the
boring one: the model is the easy part. The webhook lifecycle, the payload
contract, and the idempotency of your provisioning are where it actually breaks —
design those first.

---

## Want a bot like this for your business?

I build custom Telegram/WhatsApp AI bots, websites, and self-hosted
infrastructure for businesses. If a bot like this could save you time and
money — or you'd like to hire me — I'd love to talk:

- 📱 **WhatsApp:** [+60 12-797 2969](https://wa.me/60127972969)
- 📧 **Email:** [me@hoelee.com](mailto:me@hoelee.com)
- 🌐 **Website:** [hoelee.com](https://hoelee.com)
