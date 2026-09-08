---
title: "Authentik 2025.8 to 2026.8: The Breakable Parts Nobody Warns You About"
description: "A year's worth of authentik major-version upgrade pain: storage mount changes, RBAC session cleanup, trusted proxies, and the authorization_flow vs authentication_flow mix-up that broke SSO."
pubDate: 2026-09-09
category: devops
tags: [authentik, sso, docker, portainer, self-hosting, oidc, upgrade]
---

I run authentik as the single sign-on gate in front of my self-hosted stack —
email, dashboard, Synology apps, a remote-access outpost. For a long while it
sat on **2025.8.3**, and a year of releases piled up. This is the story of
bringing it all the way to **2026.8.1** in one sitting, and everything that
broke along the way — especially the one mistake that took Single Sign-On
completely offline and made every internal app ask for a password again.

## Why upgrade at all

Version 2025.8.3 wasn't broken. But it had fallen far enough behind that a
stack of CVEs had landed in the releases after it, and I was getting ready to
do per-application branding. authentik's own policy is that you can't jump
major versions — it enforces a stepwise path. So the plan was:

```
2025.8.3 → 2025.10 → 2025.12 → 2026.2 → 2026.5 → 2026.8
```

Six hops, one at a time, with a migration and a health-check between each.
Before touching anything, the one non-negotiable step: **back up the database**.
authentik doesn't support downgrades. If a migration half-runs, you're restoring
from dump, not rolling back an image tag.

```bash
sudo docker exec authentik-postgres pg_dump -U authentik authentik > authentik-backup.sql
```

## Pitfall 1: Portainer is the source of truth, not the compose file

My first instinct was to edit the `docker-compose.yml` on disk and `up` it.
Wrong. The stack is managed by **Portainer** (stack 143), which keeps the real
compose and the real environment variables in its own store. The `.env` on disk
was stale — its `PG_PASS` didn't match what Portainer actually ran.

The correct update path is via the Portainer API, not the filesystem:

1. Update the image tags in the compose content.
2. `docker pull` the new images *first* (so the API call doesn't time out mid-pull).
3. `docker stop` + `docker rm` the running containers (fixed `container_name`
   will otherwise collide on redeploy).
4. `PUT /api/stacks/143?endpointId=2` with the new `StackFileContent` + `Env`.

I hit the colliding-container error, the pull-timeout error, and a network-attach
problem where the rebuilt `authentik-server` only joined one of its two networks
and couldn't resolve `postgres-server`. Each one is a five-minute fix once you
know what you're looking at, but together they ate the better part of the evening.

## Pitfall 2: the storage mount moved (2025.12)

Up to 2025.12, brand assets lived under `/media/` and were served at `/media/...`.
After 2025.12, the storage layout changed: files moved to a `/data/media`
structure served under a new `/files/media/public/<name>?token=...` URL with a
JWT signature. My containers were still mounting `./media:/media`, so every
logo, favicon, and background image 404'd the moment I crossed that version.

The fix is the documented migration:

```bash
mkdir -p data && mv media data/media
```

…and change the mounts to `./data:/data`. The new file backend also refuses to
work unless `/data` is an actual mount point — the earlier version of my fix
used a symlink, which the backend's `is_mount()` check rejected with
`No file management backend configured`.

## Pitfall 3: RBAC migration leaves a poisoned session table

2025.12 removed the old `authentik_core.User_groups` model in favor of the RBAC
rework. The migration ran clean, but **old sessions** still held references to
the deleted model. Result: the login page kept throwing
`LookupError: App 'authentik_core' doesn't have a 'User_groups' model`.

Not `django_session` — that was empty. The real culprit was authentik's own
`authentik_core_session` table. Clearing it (and the other session tables)
forced everyone to log in again and cleared the error:

```sql
TRUNCATE authentik_core_session;
```

One side effect worth knowing: this also invalidates every OIDC refresh token
your apps were holding. They'll bounce the user to a fresh login once, then
recover. It's a one-time annoyance, not a bug.

## Pitfall 4: trusted proxies are now opt-in (2026.8)

2026.8 tightened the default forwarded-header handling. Previously authentik
trusted all the private ranges; now it only trusts what you list explicitly.
Behind a Synology reverse proxy forwarding to `localhost`, that means:

```yaml
environment:
  AUTHENTIK_LISTEN__TRUSTED_PROXY_CIDRS: 127.0.0.0/8,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,::1/128
```

Skip this and the proxy headers get rejected, which surfaces as auth failures
that look like almost anything except what they actually are.

## Pitfall 5: the one that broke SSO — authorization_flow vs authentication_flow

This was the expensive mistake, and it's the kind of thing that's easy to get
wrong if you're doing per-application branding.

A provider in authentik has **two** flow fields, and they mean different things:

```python
# "Flow used for authentication when the associated application is
#  accessed by an un-authenticated user."      ← the LOGIN page
authentication_flow = models.ForeignKey(...)

# "Flow used when authorizing this provider."  ← the OAuth consent page
authorization_flow = models.ForeignKey(...)
```

- `authentication_flow` is the **login page**. This is where you put a
  per-application flow to customise the title and background.
- `authorization_flow` is the **consent/authorize step** for a user who is
  *already* logged in.

I wanted different background images per app, so I created one flow per
application and pointed the provider's `authorization_flow` at it. Instant
breakage: a user who was already authenticated still got walked through the
full identification → password → MFA flow every time they opened another app.
Single Sign-On was, effectively, gone.

The fix was a single UPDATE to put the two fields back where they belong:

```sql
UPDATE authentik_core_provider
SET authorization_flow_id = '1d85b1b1-...',   -- explicit-consent flow
    authentication_flow_id = 'aa##-per-app-flow'
WHERE ...;
```

And the branding itself — the per-app background and title — goes on the
**flow's own** `background` and `title` fields (writable since 2026.8), not on
the brand's domain match.

There was a second, related gotcha hiding behind this one. When I created the
18 per-app flows, they all landed with `designation=authentication`, and my
`auth.hoelee.com` brand had `flow_authentication` set to `NULL`. authentik's
fallback when a brand has no explicit auth flow is to pick the first
authentication flow **by slug, alphabetically** — which happened to be
`auth-agent`, not `default-authentication-flow`. So the root login page started
showing my agent's background image. Setting the brand's `flow_authentication`
to the real default flow fixed it.

And one more that compounds with the RBAC pitfall: creating a flow sets its
`background` but **not its stages** — `stages` is read-only on the flow object.
An empty flow with no stage bindings is exactly what produced an infinite
redirect loop on the login page earlier in the migration. Stage bindings are
created separately:

```
POST /api/v3/flows/bindings/   # { target: "<flow pk>", stage: "<stage pk>", order: N }
```

## What I'd do differently

The whole ordeal came down to three preventable patterns:

1. **Never guess at a field's semantics** — I treated `authorization_flow` as
   "the login flow" when the source-of-truth is the model definition, which
   spells out the difference in the field's own docstring.
2. **Keep the API surface at arm's length** — API tokens kept expiring mid-run
   with every server restart, so I ended up doing the critical fixes directly
   against the database with `psql`. Reliable, but worth scripting *before*
   the cluster is on fire, not during.
3. **One breaking change per restart** — I tried to reason about storage,
   RBAC, and proxy changes all in one go. Each would have been trivial if
   isolated and verified independently.

## The result

authentik now runs **2026.8.1** — current, patched, all containers healthy —
with 18 applications each showing their own background and title on the login
page, and SSO working across every subdomain. Seventeen of the applications I
use daily went from "asks me to log in again every time I switch apps" back to
"log in once, move freely."

The lesson worth carrying: a major-version upgrade on auth infrastructure is
roughly 10% "change the image tag" and 90% "the data model, storage layout,
and proxy rules all shifted underneath you." Back up, go one version at a time,
and when something behaves in a way that makes no sense, read the field name
again before you reach for another config.