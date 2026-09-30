---
title: "Loop Engineering Without a Coding Agent: The 11 Cron Jobs That Run My Business"
description: "Loop engineering is 2026's term for designing the system that prompts and checks an agent. I applied it to a business, not a codebase: 11 cron jobs, 8 with no AI at all."
pubDate: 2026-10-01
category: case-studies
tags: ["loop-engineering", "ai-agents", "cron", "self-hosting", "automation", "monitoring"]
ogImage: "/og/loop-engineering-without-a-coding-agent.png"
banner: "/banners/loop-engineering-without-a-coding-agent.png"
draft: false
---

Every article about "loop engineering" is about a coding agent. Claude Code,
Codex, `/goal`, `/loop`. The examples are always the same shape: an agent
refactoring a repository overnight while you sleep.

I don't have that problem. I run a small web studio — websites, hosting,
self-hosted infrastructure — and my loops keep the *business* alive, not a
codebase. Eleven scheduled jobs run on this machine: an endpoint watchdog
that fires every five minutes, mail triage twice a day, a shop-voucher
audit, a disk-corruption check, a domain-expiry reminder, a guard that
notices when an upgrade silently reset my proxy headers.

Eight of those eleven contain no AI at all.

## Why this matters more than the agent does

A website that is down at 2am is a client who finds out before I do. An
expiring domain is a live business that stops receiving mail. A corrupt SSD
is a week of my work. None of these announce themselves; they all wait
quietly until someone looks.

A loop is that someone. It turns "I should check on that" into "something
checks on that, forever, and only speaks when there is news." The business
outcome is not magic autonomy — it is that I stopped being the monitoring
system. I get a Telegram message when something is actually wrong, and
silence when it isn't.

That is the whole value proposition, and it is worth being precise about it,
because the 2026 hype around loops promises considerably more.

## What loop engineering actually is

The term arrived in June 2026. Peter Steinberger posted that you shouldn't
be prompting coding agents anymore — you should be designing the loops that
prompt them. Boris Cherny, who leads Claude Code at Anthropic, put it even
shorter: *"I don't prompt Claude anymore. I have loops running that prompt
Claude. My job is to write loops."* Addy Osmani published the essay that
gave the practice a name, and Anthropic made it official on June 30 with a
taxonomy of four loop types.

It is the newest ring of a ladder that keeps wrapping itself: **prompt
engineering** (2022–24, *did I say it clearly?*), **context engineering**
(2025, *does it see the right thing?*), **harness engineering** (early 2026,
*does it keep doing it right?*), and **loop engineering** (2026, *does it
run without me?*). Nothing replaced anything. I still write prompts, usually
inside a script.

Nobody has to adopt the word. The Register called it the latest buzzword in
June and made two fair points: agents have always been loops, and the
companies selling tokens are the companies most excited about loops that
spend tokens unattended. One widely-read report claimed a $1.3M monthly bill
for an always-on loop setup. Even Osmani's own essay ends with the caveat
that matters: *"The loop changes the work, it does not delete you from it."*

My loops cost me almost nothing, and the reason is the first design rule
below.

## The inventory

| Job | Trigger | What proves it worked | Model? |
|---|---|---|---|
| Endpoint watchdog (7 targets, self-heal) | every 5 min | HTTP/TCP probe + control probe | no — script |
| Disk-corruption watchdog | daily 10:00 | SMART counters vs baseline | no |
| Domain-expiry reminder | daily 09:00 | 30-day / 7-day thresholds | no |
| Mail triage (`me@hoelee.com`) | 09:30 + 18:30 | unread mail, deduped | **yes** |
| Shop voucher audit | daily 09:00 | read-only portal scrape | **yes** |
| Real-IP + bot-block regression guard | hourly :20 | config invariants + log ratios | no |
| unRaid SSD watchdog | daily 10:00 | counter deltas | no |
| Mailbox health | monthly | IMAP/SMTP connect | no |
| Memory backup | weekly | archive written | no |
| Package version check | daily 09:00 | npm latest vs local | no |
| Research checkpoint reminder | 1st + 15th | reads project state, reminds me | **yes** |

Eleven loops, eight of them with no model anywhere in the path. That ratio
is not an accident and it is not modesty — it is the single most useful
thing I learned.

## Rule 1 — if the check is deterministic, do not spend a model on it

My package version check used to be an agent job. It ran for weeks and
failed 29 times in a row before I stopped ignoring the notifications. The
cause was almost funny: an agent-mode job records the model it was created
with, and when my global default model later changed, the job refused to run
at all rather than silently adopt the new one. It printed `[drift_skip]` and
exited. Twenty-nine times.

The task itself is trivial: fetch `registry.npmjs.org/<pkg>/latest`, compare
it with the local version, print something only if the remote is newer.
There is no judgment in that. So I rewrote it as 125 lines of Python with an
explicit exit path for every branch, and set the job to `no-agent` — the
script's stdout is delivered as the notification, no LLM in the loop.

It has run green ever since. Anthropic's own guidance says the same thing in
one line: *"Use scripts for deterministic work — running a script is cheaper
than reasoning through the steps."* I'd add the stronger version: if the
stop condition is a string comparison, a model in that loop can only
introduce failure modes, and it will, at 3am, silently.

The measured difference in my own fleet: 8 of 11 loops run with zero tokens.
The three that use a model all need judgment I cannot express as code — is
this email important, is this voucher about to overspend, is this project
stalled.

## Rule 2 — the verifier must be able to fail loudly about itself

The second thing I got wrong for a long time: a watchdog that only speaks
when something is broken is indistinguishable from a watchdog that has
stopped working. Both are silent.

So every script in the fleet has one contract: **exit code 0 means
"measured, here is what I found" and exit code 1 means "I could not measure"
— and exit 1 is never silent.** A missing config file, an unparseable state
file, an unwritable state directory, an unexpected exception: all of them
print a `CANNOT MEASURE` line and exit 1. The runner wraps `main()` in a
blanket handler that catches anything I failed to anticipate, because the
one failure mode I cannot tolerate is a checker that has quietly died.

The endpoint watchdog goes further, and this is my favourite piece of the
whole setup. Before it judges anything, it probes a **control target** —
`https://one.one.one.one/`. If that fails, the problem is my own uplink or
DNS, not my servers, and the watchdog reports instead of acting. Without
that gate, a router reboot would look exactly like seven simultaneous
outages, and an automated loop would have cheerfully restarted a perfectly
healthy VM in the middle of it.

A verifier that cannot tell "broken" from "I can't see" will eventually take
a destructive action during a network outage. I would rather it know the
difference.

The number I like quoting from this loop: it has ticked **1,618 times**
without a false alarm, because two consecutive failures are required before
anything is called down, a group that stays down is re-reported on a slow
cadence rather than every tick, and recovery is announced once with the
downtime window.

## Rule 3 — give it the smallest autonomy that still helps

The tempting design is "the loop fixes things." The design that survives
contact with production has three tiers, and each loop sits in exactly one:

**Tier 1 — report only.** Most of my loops. They observe and tell me. Nothing they do can break anything, which means I can deploy them on a Friday.

**Tier 2 — propose, human confirms.** The shop-voucher audit runs daily and is *read-only by contract*. The prompt forbids creating or editing a voucher even if the script prints a proposal, because vouchers on that platform have no draft state: confirming means live and escrowed, with money attached. The loop's job is to hand me a decision I can make in ten seconds.

**Tier 3 — act, within an allowlist.** Exactly one loop in the fleet acts, and the conditions are narrow: it restarts a VM only when the guest is *unreachable from the hypervisor* (verified by ping and ARP from the host), never when the guest is up but its service is failing — that is a bug to fix, not a machine to bounce. A three-run cooldown prevents a restart loop. And it never runs at all when the control probe failed.

The pattern generalises: **each tier up must earn its right with a verifier
I trust more than the agent.** Am I allowed to walk away? Only if the thing
that decides "done" is something I would trust in a post-mortem.

That third-tier restraint is also what the shops on the receiving end of
these loops require. A marketplace audit that "helpfully" fixed its own
findings would have been a compliance problem, not a win.

## Trap 1: a loop that fails forever looks exactly like a loop with nothing to report

My silent-when-healthy convention is what makes these loops tolerable — no
daily status spam, only real news. It also hid a job that had failed **29
consecutive times**, because a failed run and a clean run both delivered
nothing to my phone.

Two things fixed it, and they apply to any unattended loop:

- **A distinct "I could not measure" path** (Rule 2). It would have surfaced the drift on the first run instead of the twenty-ninth.
- **Check the runner's own history, not just the inbox.** The job's execution log had the evidence the whole time; I trusted the absence of a notification instead. Now, when I add a loop, I check its first few runs explicitly rather than waiting for it to tell me something.

If your loop has ever been "quiet for a while", go look at its last ten runs
before you conclude it is working.

## Trap 2: a verifier that deletes production data

This one still stings. I had an end-to-end test script for a delivery
pipeline, and its cleanup step ran an unconditional `DELETE FROM orders`. It
was written to clean up after itself and it did — along with the seven real
orders that happened to be in the same table, and their generated PDFs, with
no backup to restore from.

The lesson is not "test on a copy" (true, but I had). It is narrower and
harder: **a verifier is a program with permissions, and its write path needs
the same scrutiny as the thing it is verifying.** A loop I trust to run
unattended must only be destructive to what it created itself. Every
verification script in the fleet now scopes its cleanup to rows carrying its
own marker — `WHERE id IN ($MINE)` or `WHERE recipient LIKE '%@example.com'`
— and one of them did get rewritten after that incident for exactly this
reason.

Osmani's point about comprehension debt lands here. The more smoothly the
loop runs, the less you read its output — and the day it is wrong, nobody
was watching. I read the diffs these loops produce. That habit is the entire
remaining job.

## What I deliberately did not automate

One of the eleven loops does nothing but remind me, twice a month, that a
research project exists and here are the commands to run next. It fetches
nothing, writes nothing, opens no browser. A loop's job is to keep *a* loop
turning — not necessarily its own.

That is the honest boundary. These eleven jobs buy back attention and catch
failures early; they do not run the business. The client emails still get
answered by me. The price still gets confirmed by me. What changed is that I
no longer spend any part of my day wondering whether something is broken.

## What I would do differently

- **Start with the report-only tier and stay there longer.** I wrote one acting loop before I had the control probe and the cooldown, which is a mistake I got lucky on rather than deserved to avoid.
- **Add the "cannot measure" exit path to the first version of every script.** Retrofitting it across eleven jobs took an evening; it is one `try/except` in each.
- **Check the runner's execution log on day one**, not when a notification feels overdue.
- **Write the state file before you need it.** Every loop here keeps a small JSON next to it — tick number, last-known status, when something went down. A loop with no external state cannot tell you what it knew last time, which is most of what "did this recover?" means.

## The result

Eleven loops, eight of them running with no model and therefore no token
bill, covering seven monitored endpoints, a mailbox, a shop portal, a RAID
array and a set of proxy invariants that a CyberPanel or DSM upgrade can
silently reset. The endpoint watchdog has completed 1,618 consecutive ticks
and has self-healed a hung VM from unreachable to healthy without me
touching it. The most expensive job in the fleet is a daily version check
that costs nothing and would have kept failing forever if I hadn't read its
history.

If you are self-hosting anything for money, the useful version of "loop
engineering" is not a fleet of agents. It is one cron job with a stop
condition you can test, a verifier that says when it cannot see, an exit
path for the failure you did not anticipate — and permission to do the
smallest thing that helps. Start with the one thing you check manually every
week, and make it load-bearing.

## Want this for your business?

If you are running a website or an online shop and the answer to "is it up
right now?" is "I'd have to check" — I build exactly this: self-hosted
watchdogs, uptime and certificate monitoring, automated backups with
verification, and mail triage that only pings you when something actually
needs you. No SaaS subscription per host, no dashboard you have to remember
to open.

**WhatsApp: [+60 12-797 2969](https://wa.me/60127972969)** · **Email: [me@hoelee.com](mailto:me@hoelee.com?subject=Self-hosted%20monitoring%20and%20automation)** · **[hoelee.com](https://hoelee.com)**

Website design and development is my main line of work; self-hosted
infrastructure, monitoring and automation is the other half of it.
