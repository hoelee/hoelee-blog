---
title: "Why I Still Bought a GPU to Run AI When Claude and GPT Are Obviously Stronger"
description: "Claude Opus and GPT are stronger than anything I can run locally. Here is the cost, control, and uptime argument for owning a GPU anyway — with real numbers."
pubDate: 2026-09-21
category: ai
tags: [local-llm, gpu, llama-cpp, lm-studio, agents, self-hosting, cost]
ogImage: /og/why-i-still-bought-a-local-gpu.png
banner: /banners/why-i-still-bought-a-local-gpu.png
draft: false
---

I have a house full of self-hosted infrastructure — Docker stacks, a NAS, a
tunnel, a small army of cron jobs. And I still pay for frontier models.

So when people find out I run local models too, the question is always the same:
*Claude and GPT are stronger. Local models are a pain to set up, slower, and
often just worse. So why did you spend money on a GPU?*

If you are only comparing raw model capability, I agree with you completely.
When I hit a genuinely new problem, do complex reasoning, plan a product
architecture, or kick off a long agent run, I still reach for Claude or GPT
first. I did not deploy local models because I think they have beaten the
closed frontier.

I did it because of a different problem that only showed up *after* AI got good
enough to depend on. Everything I built started sitting on a service I do not
control.

---

## The problem is not capability — it is dependency

How many tokens you get, what a plan costs, which regions can buy the commercial
service, when the model version changes under you — none of that is the user's
decision. Anthropic has regional restrictions of its own; some markets cannot
buy Claude's commercial service directly. OpenAI's plans, quotas and model
lineup keep shifting. These are commercial services, so of course they change.

That was fine when ChatGPT was something I opened occasionally to ask a
question. If it was unavailable today, I would ask tomorrow and lose nothing.

It stopped being fine once I started using AI to write code, run agents,
analyze documents, handle support, organize company data, and wire models into
workflows that run every day. When AI moves from *chat tool* to *infrastructure*,
the question changes. It is no longer "which model is smarter?" It becomes:

> "If I depend on this model today, and its terms change tomorrow, does my work
> still run?"

That is why I think the stronger the closed models get, the more valuable a
local model becomes. Precisely *because* they are so good, people hand them more
and more work. And the deeper the dependency, the more of your operation someone
else controls.

There is a second-order version of this that rarely gets said plainly. Every big
lab talks about AI safety, model risk, and restricting certain content, regions
or use cases — while all of them keep racing to make models stronger, because
capability *is* the competitive advantage. Nobody stops, because if you stop,
someone else does not.

So what actually gets controlled is rarely whether AI keeps developing. It is
who may use it, how, how much, and how far the vendor is willing to go. For an
individual, that reads like a terms-of-service page. For a business, it is
**supplier risk**. If your core process and every agent, tool and data pipeline
around it are pinned to one vendor, you are not just buying tokens — you are
handing over part of the steering wheel.

---

## "But local models are worse" — yes, and that is the wrong comparison

This is the most honest objection, and it is true. Put a model that fits on a
24GB or 32GB consumer card against Claude Opus and it loses on complex tasks. No
argument.

But the comparison most people run is wrong. The question is not *can Qwen beat
Claude*. It is:

> **Is the capability gap large enough to justify using the most expensive model
> for this task, forever?**

Because the trade is not symmetric. A 20–30B model is meaningfully behind the
frontier — and costs one to two orders of magnitude less per token, or runs on
hardware you already own. Different ratio, different decision.

### I treat capability as a threshold, not a ranking

If a task is below some capability line, it cannot be done at all — use the
strong model. But once a model crosses that line, the things that decide how I
actually work stop being benchmark scores and become cost, speed, whether it can
run for hours, and whether I control the system.

Concretely, here is how it splits for me:

| Task | What I reach for |
|---|---|
| Vague problem, no clear direction yet | Frontier model — a wrong early call invalidates everything downstream |
| Product architecture, data model, acceptance criteria | Frontier model |
| Scaffolding a project to a fixed spec, editing files, running tests, fixing failures | Local model |
| Long-running agents, retries, batch jobs, bulk content | Local model |

The important shift is the second block. Once direction is settled and the agent
is *executing a spec*, a single task may call a model 20–50 times. Do all fifty
calls need the most expensive model on the market? Usually not. The agent is not
deciding what the product should be — it is following specifications that are
already written. If a local model understands those specs and knows how to use
the tools, it has crossed the working threshold.

---

## Agents turn a small price difference into a large one

With chat, you ask once and get one answer. If Claude costs many times more than
a local model, you barely notice.

Agents are not one call. A task can invoke the model twenty times, fifty times;
it fails and reruns. The per-token price gap gets multiplied by every call.

And anyone who has actually built these pipelines knows the expensive part is
not the final run — it is the testing before it. You rewrite the prompt, swap
tooling, re-chunk the data, adjust the workflow, and run the same thing ten or
twenty times. That is normal.

On metered API calls, I feel it: *I am burning money right now.* On my own card,
there is still electricity and hardware cost, but running an agent five times or
fifty times does not add a line to an invoice. That difference changes my
behavior — it decides whether I dare keep testing. Most stable AI workflows are
not written correctly the first time. They get there after failing enough times
that you find out where they break.

The value of local compute is that you move that trial-and-error into a fixed
cost. That is a different question from "how much does a million tokens cost."

---

## Open models crossed the useful line, and the line keeps moving

Three years ago, running a model on a consumer card that could genuinely do work
for you was a research project. Today, 20–30B models — quantized — handle real
work on 24GB and 32GB cards. Go up in VRAM and language, image, and now portions
of video generation become self-hostable too.

The important part is not "open source finally won." It is that work which used
to be closed-model-only keeps falling inside the range that local hardware can
do acceptably. If three years ago two of ten jobs could run locally, and today
four or five can, that ratio alone has changed the value of owning the hardware.

And when I buy a GPU, I am not buying a specific model. Models change. If a
better coding model ships next month, I swap weights. If a better quantization
scheme lands in six months, the same card suddenly fits a model it could not run
before. What I actually bought is **compute I control**; the models on top of it
are disposable.

That is the structural difference. A closed model is stronger — and also exactly
the version one company currently chooses to offer you, at terms it currently
chooses. Local hardware is weaker — but as long as the card holds up, I decide
which model runs today, which version I switch to, and how long it runs.

---

## Fixed compute vs. renting compute

If AI stays a question-and-answer tool, I do not think most people need a GPU at
all. But that is clearly not the direction. Agents run for long stretches. Image
and video models want bulk generation. Companies hand more fixed processes to
AI. We are not just *using models more often* — models are becoming a continuously
working compute unit.

At that point, owning part of the capacity and renting every execution become
**two different cost structures**. Low usage: renting is obviously more
convenient. High, steady usage: owning lets you control and predict cost.

It also buys something no API can sell you — control. When the machine is mine,
I can point it at internal data, connect my own tools, and run agents for hours
without checking whether a vendor's plan, quota or limits changed overnight.
Once AI is inside real company processes, this stops being about saving tokens.
Some data should not leave the environment it lives in. Some agent permissions
should not be handed wholesale to an external service. If the model runs on my
own hardware, data, tools, permissions and execution can be designed together.
*That* is what I mean by control — not merely having the weights on disk.

---

## What I actually evaluate now

I no longer judge a local model by "it is dumber than Claude, therefore
worthless." Four questions, in order:

1. **Does this model clear my working threshold** for this specific job?
2. **How many times will this task execute?**
3. **Does it need heavy trial-and-error, or long agent runs?**
4. **Does the data or system need to stay in my own environment?**

When those stack up, a local model — even one that is not the strongest — can be
the better tool for that slice of work. And as open models improve, that slice
keeps getting bigger.

So what I am bullish on is not one model or one GPU. It is the trend: **more AI
work becomes doable on hardware you own.** A consumer card that used to run only
language models now runs agents, image generation, video. Better models and
better inference frameworks keep giving the same metal new jobs.

Hardware depreciates, new cards get more expensive — that is real. But the model
is not locked in. As long as the machine has enough compute, I can keep swapping
in newer open models.

---

## The short version

I no longer compare "which model is smarter." I compare **how much capability
this job needs, how many times it will run, and how much control I am willing to
leave in someone else's hands.**

Where I need frontier reasoning, I pay for the frontier. But when work becomes
high-volume, continuous and predictable — and a local model has crossed the
usable threshold — there is no reason to keep paying frontier prices for every
single step.

In one line:

> Use the frontier model to decide what to build. Use local compute to build it
> a thousand times.

That is why I bought the GPU.
