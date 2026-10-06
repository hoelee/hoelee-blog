---
title: "The Upstream Was Deleted, Then Came Back as a Rewrite"
description: "My production reading service runs a build whose official Docker Hub repo returns 404. Then upstream came back — 233 commits, a new language, no releases. How to tell dead from rewriting."
pubDate: 2026-10-06
category: devops
tags: ["docker", "self-hosting", "upstream", "maintenance", "registry"]
ogImage: "/og/the-upstream-was-deleted-then-came-back-rewritten.png"
banner: "/banners/the-upstream-was-deleted-then-came-back-rewritten.png"
draft: false
---

`docker pull hectorqin/reader` returns **404**. That is the project my
production reading service runs on: a small invite-only library I host for
my family and a handful of paying readers, serving books every day, with a
text-to-speech pipeline I built on top of it so the read-aloud button speaks
in proper neural voices.

The 404 is not the interesting part. On **2026-09-16** that same repository
was re-initialised from scratch — the commit message is `chore: 初始化仓库`,
"initialise repository" — and sixteen days later it carried **233 commits**,
a different language, a different port, a different database engine and a
different container registry. The project I depend on did not die. It was
**replaced by a rewrite** under the same name, the same URL and the same
11,036 stars.

So: **how do you tell whether an upstream project is dead — and what do you
do when it comes back as a different application?**

## The setup, because the details are why this mattered

The app is a self-hosted reading server. Hash-routed Vue SPA in the browser,
Kotlin and Spring Boot on the server, per-user JSON config on disk, and one
feature I had deliberately built a whole pipeline around: **HTTP
text-to-speech**. The reader proxies read-aloud requests to a URL you
configure, so the voices are not baked into the app — mine point at two n8n
webhooks that mint short-lived Azure and Google credentials and synthesise
the audio. Nine engines show up in the voice picker because of that, not
because the app shipped them.

I also run my own nginx gateway container in front of the app — the public
landing page, the social card, the bilingual switch and an English-UI layer
all live there rather than inside the app's image. That decision, made for
branding reasons, is the reason this whole incident stayed boring. I'll come
back to it.

## What I found when I went looking for an upgrade

Three options, and none of them was "upgrade":

| Option | What it actually is | Why I didn't take it |
|---|---|---|
| The official image | `hectorqin/reader` on Docker Hub | Gone. The repository returns 404; `docker pull` fails |
| The maintained fork | `changshengyu/reader`, pinned at `2.5.4` | Built on the last fully open snapshot. Its read-aloud uses the browser's own `speechSynthesis` only — no HTTP speech. No `httpTTS` string anywhere in its history, and `/reader3/httpTts` 404s on it. My nine engines would vanish |
| A rebuild published by someone else | `liangnianzhi/reader.hectorqin:latest-20250525` | **This is what I run.** The only still-pullable 3.x build that kept HTTP speech. Last updated 2025-09-05, three tags total, published by a user who is not the original author |

I pinned that tag, tarred up the data directory, and mirrored the source
into my own Git server so the code I depend on existed somewhere I control.
Then I wrote down the one line that decides whether any future image is even
a candidate: **does it still speak the TTS protocol my pipeline
implements?**

That was the state of things: a running service on an image whose official
home had been deleted, surviving as somebody's rebuild.

## Then upstream came back

Verified on 2026-10-06, straight from the GitHub API and the registry:

| Signal | Value |
|---|---|
| Repo | `hectorqin/reader` — alive, AGPL-3.0, default branch `main` |
| Stars / forks | 11,036 / 5,471 |
| Last push | 2026-10-02 |
| Commits | **233** — and the oldest is `chore: 初始化仓库`, dated **2026-09-16** |
| Releases / tags | **0 / 0** |
| Docker Hub | still **404** |

The 2021 history is gone. The `created_at` timestamp still reads 2021-08-13
because GitHub keeps that field when a repository is re-populated, but the
git history begins on 2026-09-16 with an empty-repository commit. There is
also a ghost of the deletion still sitting on the old branch: fetch
`master`'s README and its entire contents are the single word `deleted`.

And the code behind those 233 commits is not my app's codebase continued. It
is a different application that happens to keep the name:

| | What I run (3.x) | What upstream is now |
|---|---|---|
| Runtime | Kotlin, Spring Boot + Vert.x | TypeScript, Node |
| Port | 8080 | 5888 |
| Data | `/storage/data`, per-user JSON | `/data`, SQLite (`reader.db`) |
| Configuration | environment variables + per-user JSON files | the admin UI, persisted in the database |
| Container image | Docker Hub, namespace deleted | `cnb.cool/hectorqin/reader:main` |
| Scope | books | books **and** movies, series, music, audiobooks, OPDS, OpenList, PWA, an Android client |

Three details are worth pulling out of that table, because each one has a
consequence:

**The registry moved to a platform most of us have never pulled from.** The shipped compose file uses `image: ${READER_IMAGE:-cnb.cool/hectorqin/reader:main}`, and a comment explains that CI publishes **branch and commit tags and deliberately does not publish `:latest`**. So the default configuration tracks a moving branch, and the only stable reference is a commit SHA.

**Configuration left the environment.** Business settings — the HTTP speech endpoint, scan behaviour, login lifetimes, the public URL, allowed browser origins, WebDAV — now live in the admin UI and persist in the database. The docs note that on first upgrade "legacy business environment variables are imported once", and that existing database values always win. That is a one-shot import with a precedence rule, which is exactly the kind of thing you want to test on a copy instead of discovering on your live instance.

**HTTP speech came back — in a different place.** The new version documents an HTTP speech upstream again, with a synthesis URL, a token, a voices URL, a timeout and a cache limit, plus a connection test and audio preview, all configured in the admin UI. My n8n webhooks implement a protocol I designed against the old build's expectations. Whether those two shapes match is now an empirical question, not a documentation question.

## The part nobody warns you about: a rewrite is a new application

The instinct is to read "upstream is alive again, with media support and an
Android client" as *my upgrade arrived*. It isn't. A rewrite changes the
data format, the deployment surface and the configuration model at the same
time — which means the work is a migration with a schema boundary in it, not
a `docker pull` and a restart.

What convinced me to slow down was the project's own progress note. Read it
for yourself rather than taking a vendor's marketing page as the status
report, and you find the authors listing what is **not** done:

- legacy data **auto-migration and a first-run setup wizard are not implemented**;
- the **image pull and the real container upgrade drill were never executed**, because the Docker engine was not running on the build machine.

That is unusually honest documentation, and it is the single most useful
file in the repository. The people writing the rewrite are telling me the
upgrade path has been written but not walked. If they haven't walked it, I'm
certainly not walking it on the instance my readers are using, on a Tuesday,
without a copy of the data.

## What I do now, before trusting any dependency with a running service

1. **Repository health is not artifact health.** `pushed_at`, stars and
forks tell you the *source* is alive. `docker pull` on the exact tag you run
tells you the *thing you deploy* still exists. Check both, and read the
compose file to see which registry it names — mine now points at a domain I
had never opened before this week. 2. **"No releases, no tags" is a
deployment fact.** Zero tags means every upgrade is a commit hash or a
moving branch. Write the SHA in your own notes, because the upstream will
not. 3. **Mirror anything you cannot afford to lose — the source *and* the
image.** A pinned tag in someone else's namespace is a dependency on that
stranger's account staying alive. My surviving 3.x source sits in my own Git
server now, and so does the rewrite. 4. **Compare the shape before the
features.** Port, volume paths, variable names, database engine, where
configuration lives. If most of those moved, treat the new version as a new
product and plan a migration. 5. **Keep what you can't rebuild outside the
image you don't control.** My landing page, social card, language switch and
translation layer are a separate container in the same stack. That is why a
rewrite landing upstream did not disturb a single reader — the front door
cannot be broken by an app image swap. 6. **Read the maintainer's "not done
yet" list, not the feature list.** The feature list is a sales page; the
unfinished list is the risk register. 7. **Check the licence if you run it
as a service.** This one is AGPL-3.0, which is worth reading properly if you
host it for paying users rather than just yourself. 8. **An archived or
wiped repository is not the same as an abandoned project.** For months the
honest answer to "is this project dead?" was yes — the README said `deleted`
and meant it. Then somebody started again, in another language, and the
honest answer changed without the name changing.

## The result

The library is up, on the build I pinned, with readers unaffected — that was
always the goal, and it never stopped being true. What changed is that
"we're stranded on an orphaned image" became a known quantity with a plan:

- the data directory is copied, and the new image's own `backup` / `verify` / `restore` commands get run **against the copy** before anything touches the live volume;
- the TTS protocol gets tested against my existing webhooks, because if it doesn't match, the read-aloud feature is the thing I lose;
- the old image tag stays present for rollback, and I now have the source on my own server either way;
- the front door stays out of scope, because it lives in a different container and an image swap cannot reach it.

And the useful lesson is not "pin your versions", which I already did. It is
that **the question "is this project alive?" has three answers, and they can
disagree**: the repository can be alive while the image is deleted; the
README can say `deleted` while a rewrite is four weeks into existence; and
the version number can stay the same while the runtime, the port, the
database and the configuration model all change underneath it. Check each
one separately, or you will eventually plan an upgrade for an application
that no longer exists in the shape you tested.

---

**Running a self-hosted app for other people, and not sure whether the thing underneath it is still supported?** That's the kind of audit I do — dependency and image health, upgrade feasibility, and the migration plan that comes with it.

[WhatsApp +60 12-797 2969](https://wa.me/60127972969) ·
[me@hoelee.com](mailto:me@hoelee.com?subject=Self-hosted%20dependency%20audit)
· [hoelee.com](https://hoelee.com)
