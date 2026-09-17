---
title: "Upgrading n8n v1 to v2: Seven Deprecations in One Log File"
description: "My self-hosted n8n 1.x to 2.40.1 upgrade surfaced seven silent breakages at once — a telemetry schema rejection, deprecated webhook vars, and a DB override that quietly disabled the AI sandbox."
pubDate: 2026-09-18
category: devops
tags: [n8n, docker, upgrade, self-hosting, debugging, automation]
ogImage: /og/n8n-v1-to-v2-upgrade-gotchas.png
banner: /banners/n8n-v1-to-v2-upgrade-gotchas.png
---

I run n8n as the automation backbone for my self-hosted stack — it handles
file-delivery permissions, database backups, and a text-to-speech API that a
reading app depends on. It had been sitting on the `1.123.x` line for the
better part of a year, quietly doing its job.

Then I pulled `n8nio/n8n:2.40.1` and restarted the container. The upgrade
itself took about ninety seconds. Understanding what it *broke* took the rest
of the evening — and almost all of it was already written down in a single log
file that n8n prints on boot. I just hadn't read it carefully enough the first
time.

This is that log file, decoded, so you can plan your own v1 → v2 jump instead
of discovering these at 11 PM.

## Why it matters

Major-version upgrades of an automation platform are different from upgrading
a leaf service. n8n is *the thing that runs everything else*: if it comes up
broken, your backups, your access-control syncs, and your internal APIs all
stop with it. Worse, most of what breaks in v2 doesn't throw an error — it
logs a deprecation notice once and then quietly does something different.

The seven items below are the ones that actually applied to a real, messy,
production-shaped install. Three of them changed behavior in my stack. One of
them silently turned a feature *off*.

## Start here: n8n tells you what's wrong at boot

Before touching a single workflow, read the container log from the top. On a
fresh v2 boot, n8n prints an explicit deprecation block:

```text
There are deprecations related to your n8n setup. Please take the recommended
actions to update your configuration:
 - WEBHOOK_URL -> Use N8N_WEBHOOK_URL instead, which sets the base URL for
   both test and production webhooks.
 - N8N_UNVERIFIED_PACKAGES_ENABLED -> The default for this variable will
   change to `false` in a future version.
 - N8N_RUNNERS_MODE -> Internal task runner mode is deprecated and will be
   removed in a future version.
 - N8N_RUNNERS_TASK_TIMEOUT -> The default for this variable will be reduced
   from 300 (5 minutes) to 60 (1 minute) in a future version.
 - N8N_COMPRESSION_NODE_MAX_DECOMPRESSED_SIZE_BYTES -> The default will be
   reduced from 2 GiB to 256 MiB in a future version.
 - N8N_COMPRESSION_NODE_MAX_ZIP_ENTRIES -> The default will be reduced from
   5000 to 1000 in a future version.
```

That block is your migration checklist. Six of my seven gotchas are in it.

## 1. Your env values can now fail *schema validation*

Here is the one that confused me most, because it looked like a nonsense error:

```text
Telemetry event "Instance started" failed schema validation:
execution_variables.executions_data_save_on_error: Invalid option:
expected one of "all"|"none"
```

I had `EXECUTIONS_DATA_SAVE_ON_ERROR=error` set — a value that was perfectly
legal in v1, and that I'd chosen deliberately, because saving *only* failed
executions is the sane default for a busy instance. In v2 that value is no
longer in the allowed set, which is now `all` or `none`.

The failure mode is the interesting part. It didn't crash. It didn't even warn
in a way that reads like an error at a glance — it emitted a *telemetry schema
validation* message, which sounds like an n8n-internal problem, not a
configuration problem of mine. The setting was effectively ignored.

The fix is to move that intent somewhere coherent: pick a legal value and
control volume with pruning instead.

```env
EXECUTIONS_DATA_SAVE_ON_ERROR=all
EXECUTIONS_DATA_SAVE_ON_SUCCESS=none
EXECUTIONS_DATA_PRUNE=true
EXECUTIONS_DATA_MAX_AGE=336
EXECUTIONS_DATA_PRUNE_MAX_COUNT=10000
```

**Lesson:** in v2, treat your environment variables as a typed interface with
a schema. An invalid value may be dropped silently rather than rejected loudly.

## 2. `WEBHOOK_URL` is deprecated for `N8N_WEBHOOK_URL`

If you publish webhooks behind a reverse proxy — which you almost certainly do,
because that's how they become reachable — the base URL variable is load-bearing.
It's what makes n8n report the *public* webhook path instead of
`http://localhost:5678/...`.

The old name still works today, so this one won't bite immediately. But note
the wording: the new variable sets the base URL for **both test and production
webhooks**. In my setup those had drifted apart in behavior, which is exactly
the class of bug this consolidation is meant to eliminate.

```env
# before (still functional, deprecated)
WEBHOOK_URL=https://auto.example.com/

# after
N8N_WEBHOOK_URL=https://auto.example.com/
```

## 3. Internal task runner mode is going away — and mine was already broken

This one was sitting in my logs the whole time, several lines above the
deprecation block, and I'd been reading past it for months:

```text
Failed to start Python task runner in internal mode. because Python 3 is
missing from this system. Launching a Python runner in internal mode is
intended only for debugging and is not recommended for production.
```

If any workflow of yours uses a **Python** Code node, it has not been running
in internal mode at all — there's no Python in the stock image. JavaScript
Code nodes are fine (a JS runner registers normally), which is why this can go
unnoticed indefinitely: everything *looks* healthy.

v2 makes the direction of travel explicit: switch to `external` mode and share
an auth token with a separate launcher process.

```env
N8N_RUNNERS_MODE=external
N8N_RUNNERS_AUTH_TOKEN=<a long random string>
```

**Lesson:** "internal mode is deprecated" is the headline, but the real
finding is that a runner type can be *silently non-functional* for months.
Check `docker logs` for the runner registration line, not just for up/down.

## 4. Task timeout drops from 300s to 60s

This is the one I'd flag hardest for anyone with slow workflows:

```text
N8N_RUNNERS_TASK_TIMEOUT -> The default for this variable will be reduced
from 300 (5 minutes) to 60 (1 minute) in a future version.
```

Be honest about your own workloads. Do you have a Code node that loops over
thousands of records, or an HTTP call to a slow upstream? Mine do — a nightly
reconciliation walks every customer and calls an external API per record. On a
future upgrade, that stops at sixty seconds with no config change on my side.

Set it explicitly now, while you're already in the file:

```env
N8N_RUNNERS_TASK_TIMEOUT=300
```

The general principle for every deprecation of the form "the default will
change": **if you rely on the current default, pin it explicitly.** Otherwise
the upgrade is a silent behavior change, and you'll debug it as a bug rather
than recognise it as a stale default.

## 5 & 6. Two compression-node limits shrink (2 GiB → 256 MiB, 5000 → 1000 entries)

These two travel together and matter only if you use compression/decompression
nodes on large payloads — which is easy to end up doing when you're shuttling
database dumps or archives through a workflow.

```text
N8N_COMPRESSION_NODE_MAX_DECOMPRESSED_SIZE_BYTES -> reduced from 2 GiB to
256 MiB in a future version.
N8N_COMPRESSION_NODE_MAX_ZIP_ENTRIES -> reduced from 5000 to 1000 in a
future version.
```

An eighth of the memory ceiling and a fifth of the entry limit. Nothing errors;
the node just refuses at a threshold you didn't set. Pin both if you're near
either.

## 7. The storage path renames in v3 — and you have a volume mounted at the old one

Not a v2 breakage, but v2 warns about it, and it's the one with real data-planning
implications:

```text
Deprecation warning: The storage directory "/home/node/.n8n/binaryData" will
be renamed to "/home/node/.n8n/storage" in n8n v3. To migrate now, set
N8N_MIGRATE_FS_STORAGE_PATH=true. If you have a volume mounted at the old
path, update your mount configuration after migration.
```

Read that last sentence again: *if you have a volume mounted at the old path,
update your mount configuration after migration.* If you set the migration flag
and keep your old bind mount, you now have two directories and your binary data
lives in whichever one the container is actually pointed at. Do the rename and
the mount change in the same maintenance window — not one now, one "later".

## The one that wasn't in the log: my AI sandbox disabled itself

Here's the finding that had nothing to do with a deprecation notice, and that
I'd never have caught without reading the full boot sequence:

```text
Sandbox: enabled=false provider=n8n-sandbox (DB override; env was enabled=true
provider=n8n-sandbox)
```

My environment said enabled. The database said otherwise. **The database won.**

The env var was `N8N_INSTANCE_AI_SANDBOX_ENABLED=true`, and it was still set
correctly on the container. But a value persisted in n8n's own configuration
store overrode it at startup — and the only place that conflict is reported is
inside a parenthetical in a log line.

This is a genuinely valuable debugging lesson beyond n8n: when a feature is off
despite the env var being obviously right, suspect a **persisted settings layer
that outranks your environment**. The container config is not always the last
word. Grep for the feature name in the logs, and don't stop at the env value.

## What I'd do differently

1. **Read the boot log before declaring the upgrade done.** Every deprecation
   that mattered to me was printed on startup, in one block, on the first run.
   My v1 habit was to check "is it up, do the workflows run" — which is exactly
   the check that misses all seven of these.
2. **Treat "the default will change" as a to-do, not a warning.** Five of the
   seven items are future-default changes. Pinning them now costs one edit and
   converts a mystery outage later into a config diff.
3. **Diff the container config against n8n's own stored config.** The sandbox
   override taught me that env is one of two inputs, not the source of truth.
   When behavior and configuration disagree, believe the behavior and go find
   the higher-priority layer.
4. **Pin the image tag and keep the previous one.** I jumped v1 → `2.40.1`
   directly. Having the old image on disk is what makes a rollback a
   `docker run` instead of a rebuild.

## The result

n8n is on 2.40.1 with the full deprecation block resolved: the schema-invalid
value corrected, `N8N_WEBHOOK_URL` in place, the JS runner registering cleanly,
and the task timeout and compression limits pinned so the next upgrade is a
no-op rather than a surprise.

Everything downstream kept working — the file-permission syncs, the nightly
backups, the text-to-speech endpoint. That's the outcome worth aiming for with
an upgrade like this: not "it came back up", but "it came back up *and* the
next three upgrades are already paid for".

The uncomfortable part is how much of it I could have known in advance. n8n
handed me the entire list, unprompted, at startup. The upgrade was never the
hard part — reading the output was.

---

## Running automation you'd rather not babysit?

I build and maintain self-hosted automation — n8n workflows, Docker stacks,
and the glue between apps that were never designed to talk to each other. If
you're facing a major version upgrade, or you have automation that works until
it doesn't, I plan the migration, do it in a maintenance window, and document
every config decision so the next upgrade is boring.

Reach me at [me@hoelee.com](mailto:me@hoelee.com?subject=n8n%20upgrade) or
WhatsApp [+60 12-797 2969](https://wa.me/60127972969), or see what I do at
[hoelee.com](https://hoelee.com).
