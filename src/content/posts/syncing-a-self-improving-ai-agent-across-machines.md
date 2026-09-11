---
title: "Syncing a Self-Improving AI Agent Across Machines"
description: "How I sync my Hermes agent's skills, config, and cron jobs between two PCs with a git-backed profile distribution — and why I sync manually instead of on a cron."
pubDate: 2026-09-11
category: case-studies
tags: [hermes, git, gitea, ai-agents, devops, sync]
ogImage: /og/syncing-a-self-improving-ai-agent-across-machines.png
banner: /banners/syncing-a-self-improving-ai-agent-across-machines.png
---

My agent learns. Every time I walk it through a non-trivial workflow — how to
publish to Gitea, how to troubleshoot a flaky Docker container, how to write a
Shopee listing — it saves that as a *skill*: a reusable procedure it loads the
next time the task comes up. Over a few months that grew to 172 skills across
twenty categories. They're my second brain.

The problem: that brain lives on one machine. When I sit down at my other PC,
the agent is *dumber* — it doesn't know what I taught it on the first one.

This is the story of how I made the agent's knowledge follow me between
machines, why the obvious approach would have silently destroyed work, and the
one decision that turned out to matter most.

## Why this matters

If you run any self-improving agent — Hermes, Claude Code, Codex, Cursor — you
have this exact problem. The agent accumulates knowledge locally, and none of it
moves. You either re-teach it on every machine (pointless) or you let the two
copies drift until they contradict each other (worse).

Solving it properly means three things, and they're the same three things any
engineer cares about when syncing *any* state:

- **A shared source of truth** — one canonical copy both machines pull from.
- **No silent data loss** — a sync that can't clobber work you did on the other
  machine.
- **A decision point** — when two machines changed the same thing, *you* pick,
  not the tool.

Get those three right and your agent is genuinely the same person on both
machines. Get them wrong and you spend a weekend reconstructing a skill a bad
`--force` wiped out.

## The three official mechanisms

Hermes ships three ways to move an agent, and they answer different questions:

| Need | Mechanism | Command |
|---|---|---|
| Just skills | Skills Hub "tap" (a git repo of `SKILL.md` folders) | `hermes skills tap add` + `install` |
| Whole agent, versioned, pullable | **Profile distribution** (git repo + `distribution.yaml`) | `hermes profile install` / `update` |
| One-off move / backup | Export file (`.tar.gz`) | `hermes profile export` / `import` |

For "same agent on two machines," the **profile distribution** is the durable
answer. It packages the whole agent — SOUL, config, skills, cron — as a git
repo, and the other machine pulls updates with one command.

I already run Gitea (git.hoelee.com) for everything else, so a distribution
repo there was the natural fit. No new tooling, no new accounts, and it plays
by the same Gitea-first convention I use for every project.

## The trap I almost walked into

The distribution installer has a safety property that *sounds* like a
limitation but is exactly what saves you: **it refuses to install into the
`default` profile.** You must give it a named profile.

That's not an annoyance. The second PC already had its own agent with
project-specific skills. If I'd installed the distribution *over* it — or used
`--force`, which overwrites an existing profile — I'd have deleted that
machine's local work. The `default`-refusal is the guardrail that forces you to
install *alongside* the existing agent, then merge.

Which is the real lesson of this whole exercise: **the merge is the product.**
The sync isn't "copy files." It's reconciling two agents that both think
they're the source of truth.

## The layout fact that would have clobbered me

Here's the subtle part, and it's the kind of thing that looks fine until it
isn't.

The distribution repo holds a **copy** of the skills tree — it is *not* the
live directory. The live skills live in `~/AppData/Local/hermes/skills/` (where
the agent actually writes); the repo copy is a snapshot I push. They are two
separate trees that drift.

So a sync actually has **three parties**, not two:

```
live skills dir  ←→  repo copy (D:\dev\hoelee-agent-dist\skills)  ←→  Gitea remote
```

A skill I create after the last push exists *only* in the live dir. If I'd
assumed the repo copy was authoritative and "synced" from it, I'd have
silently deleted that skill. The first thing I do before any sync is diff the
two trees:

```bash
diff -rq ~/AppData/Local/hermes/skills D:/dev/hoelee-agent-dist/skills
```

Divergence is *normal*, not an error. The whole discipline is knowing which of
the three parties is ahead and reconciling deliberately.

## Why I sync manually, not on a cron

This was the decision that mattered most, and it came down to the conflict
policy. I want two-way sync — both machines edit skills — and when both edit
the *same* skill, I want to **keep both and pick myself**, not have a tool
silently drop one.

That policy is inherently interactive. A cron job that auto-pulls either
overwrites work or fires when I'm not looking. So I made the trigger manual: I
say *"sync skills"*, the agent runs it, and it **stops and asks me on any
conflict**. It's not laziness — it's that the merge decision is mine to make,
and automation can't make it for me.

The flow I documented (and now run) is:

```bash
# 1. Pull remote into the repo copy, fast-forward only — never force
cd D:\dev\hoelee-agent-dist && git pull --ff-only origin main

# 2. Reconcile live dir ↔ repo copy
diff -rq ~/AppData/Local/hermes/skills D:/dev/hoelee-agent-dist/skills

# 3. Stage only real skill content (never the curator junk)
# 4. Commit + push, then verify the remote actually has it
git ls-remote origin main   # must match local HEAD
```

If the pull refuses, or a diff shows the same skill changed on both sides, I
stop and decide. Never `--force`, never a reset.

## The junk that was silently bloating the repo

One concrete number from the first packaging: my skills directory was **57 MB**,
but only **~8 MB** was actual skill content. The rest was runtime state the
agent's curator writes constantly — a 40 MB hub index cache, curator backups,
usage tracking, a ledger.

None of that belongs in a shared repo. It changes daily, it's machine-local,
and it would have made every sync a noisy mess. A `.gitignore` strips it:

```gitignore
# skill runtime junk — never ship
skills/.hub/
skills/.curator_backups/
skills/.curator_ledger.jsonl
skills/.usage.json
skills/.bundled_manifest
```

The moment you package a self-improving agent, you discover it's not just
files — it's files *plus* a layer of bookkeeping you have to keep out. Same
lesson as a `.gitignore` for `node_modules`, but for your own memory.

## What I'd do differently

- **Think about the trigger before the mechanism.** I spent effort deciding
  distribution-vs-export before I'd answered "do I want this manual or
  automated?" — and the answer to that question *changed* the mechanism. If I'd
  known I wanted manual, conflict-aware sync from the start, I'd have designed
  the script that way on day one.
- **Treat the copy-vs-live distinction as a named invariant.** I discovered it
  by diffing; it should have been a line in my notes from the first `cp -r`.
- **Decide per-machine `user_id` up front** for memory. Skills sync via git,
  but episodic memory (mem0) is a separate backend — two machines either share
  one memory bucket or keep separate ones, and that's a one-line config choice
  I should have made explicit earlier.

## The result

I now have one git repo — `git.hoelee.com/hoelee/hoelee-agent-dist` — holding
172 skills, my config, SOUL, and cron jobs. The other machine installs it into
a named profile, merges its own skills in, and we stay in sync with a manual
trigger that asks me on every conflict. The first real sync pushed a
skill that existed only on the live machine, verified it landed (`edbf7ac` on
both ends), and left every existing skill untouched.

The honest takeaway for anyone syncing an agent: the *files* are easy — git
does the heavy lifting. The hard parts are the guardrails: the `--force` you
must never run, the copy you must never mistake for the source of truth, and
the conflict you must never let a tool resolve silently.

---

## Want this for your own agent setup?

I build self-hosted AI infrastructure — agents, bots, and automation — for
businesses and individuals. If you're running an agent across machines (or want
to start), or need a hand with self-hosted tooling, I'd love to talk:

- 📱 **WhatsApp:** [+60 12-797 2969](https://wa.me/60127972969)
- 📧 **Email:** [me@hoelee.com](mailto:me@hoelee.com?subject=Agent%20sync%20setup)
- 🌐 **Website:** [hoelee.com](https://hoelee.com)
