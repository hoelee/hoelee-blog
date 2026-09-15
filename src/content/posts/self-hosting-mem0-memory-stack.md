---
title: "How I Self-Hosted a Mem0 Memory Stack (So My AI Agent Remembers)"
description: "A private, self-hosted memory layer for AI agents — mem0 API + LiteLLM + PostgreSQL with pgvector on a Synology NAS. Semantic memory under your control, not a third party's."
pubDate: 2026-09-16
category: case-studies
tags: [mem0, docker, postgres, pgvector, litellm, ai, sharing]
ogImage: /og/self-hosting-mem0-memory-stack.png
banner: /banners/self-hosting-mem0-memory-stack.png
---

An AI agent that forgets everything between conversations is a tool you have
to reintroduce yourself to every session. My AI assistant (the one that runs
this very blog's workflow) used to start each chat from zero — until I gave it
a **memory layer**: a self-hosted [mem0](https://mem0.ai) stack that stores
facts it learns, retrieves them semantically, and survives across sessions.

This is the story of how I self-hosted it on my Synology NAS — private, fully
under my control, no data leaving my LAN.

## Why this matters

A memory layer changes what an agent can actually *do* for a business:

- **It stops re-answering the same questions.** Remember a customer's granted
  trial, their product, their last support issue — and the next conversation
  picks up where the last one ended.
- **It makes "personalization" real.** A bot that recalls your customer's
  preferences and history is a bot that feels like a person. That's not
  prompt-sugar; it's a stored, searchable record.
- **It keeps control of your data.** Every "memory" I dislike about hosted
  memory services is solved by running the stack yourself — the facts live
  in my own PostgreSQL, on my own NAS, behind my own network.

For anyone running AI agents (support bots, research assistants, personal
automation) the question isn't *should* the agent remember — it's whether the
memory is a private asset or a third party's.

## What mem0 does

Mem0 is "memory in a box" for LLM apps. Instead of you hand-rolling an
embeddings table and a similarity search, it gives you a small API that does
the three things memory needs:

1. **Add a memory** — `POST /memories` with a fact or a conversation; it
   extracts, dedupes, and stores it (optionally classified by an LLM).
2. **Search** — `GET /search` with a query returns the most relevant stored
   facts, ranked by semantic similarity.
3. **User scoping** — memories belong to a `user_id`, so you can keep memory
   per customer, per project, or per conversation without cross-talk.

The "memory" is the extracted fact. The "retrieval" is vector similarity. You
get the agent even if you never touch a vector database yourself.

## The stack

Three containers on my Synology DS1821+, as a Portainer compose stack:

- **mem0 API** — the memory service itself (custom local build), listening
  on port `20015`.
- **LiteLLM** — the LLM gateway in front of whatever model does the fact
  extraction. I can swap the underlying model without touching mem0's config.
- **PostgreSQL 17 + pgvector** — the database. `pgvector/pgvector` bundles
  Postgres with the vector extension as a first-class citizen, so semantic
  search lives in the same DB as everything else.

```text
┌──────────────┐      /search & /memories       ┌──────────────────┐
│ AI agent /   │ ──── X-Api-Key + JSON ───────▶ │  mem0 API :20015 │
│ Hermes / bot │                                └────────┬─────────┘
└──────────────┘                                         │ pgvector
                                                         ▼
                                             PostgreSQL 17 + pgvector
┌──────────────┐     model calls (extract)    ┌──────────────────┐
│ OpenAI etc.  │ ◀───────── LiteLLM ──────────│ fact-classifier  │
└──────────────┘                              └──────────────────┘
```

A representative compose looks like this:

```yaml
services:
  mem0-postgres:
    image: pgvector/pgvector:pg17
    environment:
      POSTGRES_USER: mem0
      POSTGRES_PASSWORD: ${MEM0_DB_PASSWORD}
      POSTGRES_DB: mem0
    volumes:
      - ./data/pg:/var/lib/postgresql/data
    restart: unless-stopped

  mem0-litellm:
    image: ghcr.io/berriai/litellm:main-stable
    command: ["--config", "/app/config.yaml"]
    volumes:
      - ./litellm-config.yaml:/app/config.yaml
    restart: unless-stopped

  mem0-api:
    build: ./mem0-api
    environment:
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      OPENAI_API_BASE: http://mem0-litellm:4000/v1   # go through the gateway
      MEM0_API_KEY: ${MEM0_API_KEY}                  # X-Api-Key for /search & /memories
      POSTGRES_URL: postgresql://mem0:${MEM0_DB_PASSWORD}@mem0-postgres/mem0
    ports:
      - "20015:8000"
    restart: unless-stopped
```

(Mine is built from the mem0 repo with the model/fact-extraction directed
through LiteLLM; the exact image tag is me maintaining a local build, and I
keep the real API key out of the compose file — it's an env secret.)

## Using it

Once it's up, the API is refreshingly small. Add a fact (fast, verbatim):

```bash
curl -X POST http://192.168.1.1:20015/memories \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: $MEM0_API_KEY" \
  -d '{
    "user_id": "customer-2211",
    "text": "Customer 2211 prefers email over WhatsApp for order updates."
  }'
```

Retrieve the most relevant memories later:

```bash
curl -X POST http://192.168.1.1:20015/memories/search \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: $MEM0_API_KEY" \
  -d '{
    "user_id": "customer-2211",
    "query": "how should I reach this customer?",
    "limit": 5
  }'
```

Then inject the returned facts into the agent's system prompt (or context)
before it answers. That's the whole loop: **store facts, retrieve what's
relevant, use it in the next reply.**

### The `infer` gotcha that cost me a day

- `POST /memories` with the **default `infer=true`** runs the LLM fact
  extractor — it classifies and cleans each memory. That's smart but **slow**,
  and every call costs a model round-trip.
- If I just want the agent to note something verbatim and fast (user said
  "please call me Andy"), I pass **`infer=false`** — no LLM hop, near-instant
  storage.

The route of my stack is `/search` and `/memories` **without a `/v1` prefix**
(an early wrapper that assumed `/v1` 404'd for a while), and auth is a plain
`X-Api-Key` header. Small details, but they cost me time to discover.

## What I'd do differently

- **Set `infer=false` for routine logging from day one.** Only run the LLM
  extractor on the facts that matter; the default inference mode makes every
  write pricey for no benefit on throwaway notes.
- **Treat the API key as a real secret.** It gets embedded in agent configs
  and compose envs, so I keep it out of the compose file and inject it via
  environment secrets.
- **Put the DB on a disk I trust.** Mem0 is only as durable as its Postgres.
  I run it on my NAS's protected volumes, with a backup job — because a
  memory layer that forgets is worse than none.

## The result

A private, self-hosted memory layer answered by two small HTTP calls. My
agent now remembers customers, preferences, and decisions across sessions —
and because the stack sits in my own PostgreSQL behind my own network, none
of that leaves my control.

If you run AI agents that keep forgetting their context, self-hosting mem0
is one of the highest-value, lowest-friction upgrades you can make — and you
can do it without sending your memory to someone else's database.

---

## Want a memory-enabled AI setup for your business?

I build and self-host AI agents, memory stacks, websites, and infrastructure
for businesses. If you'd like your assistant to actually *remember* your
customers — or you want to talk about hiring me — I'd love to help:

- 📱 **WhatsApp:** [+60 12-797 2969](https://wa.me/60127972969)
- 📧 **Email:** [me@hoelee.com](mailto:me@hoelee.com)
- 🌐 **Website:** [hoelee.com](https://hoelee.com)