---
title: "Passbolt UI Kept Hanging — Three Failure Modes From One Missing Config File"
description: "My self-hosted Passbolt returned 504s for weeks: a null GPG fingerprint stalled email delivery, a container recreate wiped the fix, and ssl.force behind a proxy caused a redirect loop."
pubDate: 2026-01-07
updatedDate: 2026-09-13
category: devops
tags: [passbolt, docker, gpg, smtp, reverse-proxy, portainer]
ogImage: /og/passbolt-hang-three-failure-modes.png
banner: /banners/passbolt-hang-three-failure-modes.png
---

I run Passbolt — an open-source password manager for teams — on a Synology
NAS in Docker, behind an nginx reverse proxy. For a stretch of weeks it
developed a nasty habit: the web UI would hang, return `504 Gateway Timeout`,
and refuse to hand over a password right when I needed it. This is the story
of chasing that hang to its root — and the twist where my own "fix" caused a
brand-new failure mode.

## Why it matters

A password manager is the one app you cannot afford to be flaky. When I'm
mid-conversation with a client and need a server credential, a loading spinner
is not an option. The symptoms looked random — sometimes up, sometimes
504 — but the cause turned out to be a single missing file, plus two mistakes
stacked on top of it. If you self-host Passbolt in Docker, one of these three
is probably in your future.

## The symptom: cron hangs, and the UI follows

Passbolt runs a cron job every minute that processes its email queue — account
recovery links, share notifications, test messages. Normally it completes in
under a second. Mine was taking 30–60 seconds every single run.

Why does that matter? Behind the scenes Passbolt serves the web UI through a
pool of PHP-FPM workers. When the cron job stalls on email sending, it ties up
a worker. Enough stalled crons, and the pool is exhausted — so ordinary page
requests queue up, nginx times out, and you get the 504.

The logs told the story plainly:

```text
not starting: job is still running since ... (1m elapsed)
```

## Root cause 1: a null GPG fingerprint

Passbolt stores its SMTP settings encrypted with the server's GPG key. To use
them, it needs to know which key to decrypt with — a value read from
`passbolt.gpg.serverFingerprint`. That value comes from a config file,
`/etc/passbolt/passbolt.php`.

That file didn't exist.

Without it, the fingerprint resolved to `null`, GPG decryption of the SMTP
settings failed, and every cron iteration that tried to send mail hung on the
failure. The healthcheck surfaced it as:

```text
SMTP Setting errors: ... setDecryptKeyFromFingerprint():
Argument #1 ($fingerprint) must be of type string, null given
```

There was also one genuinely dead email in the queue — an old `SMTP timeout`
record that had exhausted its retries months ago and would never send. It got
re-scanned every minute, adding to the stall.

```sql
DELETE FROM email_queue WHERE sent = 0 AND send_tries >= 4;
```

## Root cause 2: the fix that didn't survive (the relapse)

Here's the part that stung. I had fixed this exact bug once before — by
creating `/etc/passbolt/passbolt.php` *inside the container*. Two weeks later
the hang came back, and the file was gone.

The reason: I'd recreated the container during maintenance, and a Docker
container's writable layer is **ephemeral by design**. Anything written to the
filesystem inside the container (rather than into a mounted volume) vanishes on
recreate. My fix had the shelf life of the container, not of the deployment.

The durable version is three pieces that all live *outside* the container:

1. A config file on the host, bind-mounted into the image at
   `/etc/passbolt/passbolt.php`:

```php
<?php
return [
    'App' => [
        'fullBaseUrl' => env('APP_FULL_BASE_URL', 'https://pass.example.com'),
    ],
    'passbolt' => [
        'gpg' => [
            'serverFingerprint' => 'A3DD9B762D48722C10CF88DDB5372E46A54E1419',
        ],
    ],
];
```

2. The bind mount in compose — the part that makes it survive recreate:

```yaml
volumes:
  - /volume1/docker/passbolt/session-config/passbolt.php:/etc/passbolt/passbolt.php:ro
```

3. The correct environment variable name. I'd been using
   `PASSBOLT_GPG_SERVER_FINGERPRINT`, which Passbolt silently ignores. The
   real variable is `PASSBOLT_GPG_SERVER_KEY_FINGERPRINT` — and it wants the
   **full 40-character** fingerprint, not a truncated one:

```yaml
PASSBOLT_GPG_SERVER_KEY_FINGERPRINT: "A3DD9B762D48722C10CF88DDB5372E46A54E1419"
```

## Root cause 3: the redirect loop I caused myself

With the hang fixed, I upgraded Passbolt from 5.14.3 to 5.15.0. Then, browsing
to `https://pass.example.com/`, the browser threw:

```text
ERR_TOO_MANY_REDIRECTS
```

I assumed the upgrade had broken something. It hadn't. The culprit was
`ssl.force`, which I'd left in my config file:

```php
'passbolt' => [
    'ssl' => [
        'force' => true,
    ],
],
```

Passbolt's SSL-force middleware inspects the request's scheme, and behind a
TLS-terminating reverse proxy that scheme is **always `http`** — because the
proxy (nginx) terminates the TLS connection, then forwards plain HTTP to the
container. So the middleware sees `http`, dutifully redirects to
`https://same-url`, nginx forwards it back as `http`, and the cycle repeats
forever.

The fix is to understand who owns SSL. If your reverse proxy already enforces
HTTPS at the edge, the app must **not** try to force it again. Removing
`ssl.force` from the config (leaving TLS to nginx) broke the loop immediately.

The general rule, which applies well beyond Passbolt to any app behind a
reverse proxy: **either** the proxy terminates TLS, **or** the app does — never
both, and never configure `ssl.force` in the app while the proxy already
handles it.

## What I'd do differently

1. **Config lives in volumes, not in containers.** The moment I wrote a file
   into `docker exec`, I'd committed to redoing it on the next recreate. The
   reflex should be: does this need to survive a `docker compose up`? Then it
   goes in a bind mount, not the writable layer.
2. **Read the actual variable names.** The fingerprint env var cost me a clean
   diagnosis because I trusted a wrong name that Passbolt ignored without
   complaint. When a config value "doesn't work," check the upstream reference
   for the exact key before assuming anything else is wrong.
3. **Test the public URL, not just the healthcheck.** The healthcheck passed
   every time and missed the redirect loop entirely because it never exercised
   the real public path through the proxy. A two-second `curl -I` against the
   live URL would have caught it instantly.

## The result

The hang is gone: cron completes in under a second (down from 30–60s), the
email queue is clear, and the web UI responds in milliseconds instead of
504-ing. Passbolt is now running the current 5.15.0, with every GPG and SMTP
healthcheck green — and the fix is written in a way that survives the next
container recreate.

The lesson worth carrying: a self-hosted service that "sometimes hangs" is
rarely a mystery. It's usually one missing config value, surfaced three
different ways. Fix the config, not the symptom.

---

## Want stable self-hosted infrastructure for your business?

If you run services like Passbolt, a password manager, email, or a dashboard
and they're flaky — hanging UIs, 504s, mysteries that vanish on restart — I
diagnose and fix exactly these problems. I work with Docker, reverse proxies,
and self-hosted stacks, and I hand everything back documented so the next
person (or future you) isn't left guessing.

Reach me at [me@hoelee.com](mailto:me@hoelee.com) or WhatsApp
[+60 12-797 2969](https://wa.me/60127972969), or see what I do at
[hoelee.com](https://hoelee.com).