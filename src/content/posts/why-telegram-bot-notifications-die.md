---
title: "Why Telegram Bot Notifications Die: IPv6, DNS, and a 400 That Took a Day"
description: "A debugging story: a Dockerized telegram monitor whose sendPhoto calls returned 400 from nginx/1.30.1 while getMe worked fine — an IPv6-only DNS answer, a wrong extra_hosts IP, and a multipart join that corrupted JPEG bytes."
pubDate: 2026-09-09
category: devops
tags: [docker, telegram, python, dns, ipv6, debugging, portainer]
---

I run a small monitoring bot that watches Carousell for newly-listed
listings and pings me on Telegram when something fresh appears. One day it
stopped pinging. The container was healthy, the scraper was still archiving
listings into NocoDB — but every notification died with the same three
characters in the log:

```
telegram sendPhoto failed: 400 ... nginx/1.30.1
```

That string, `nginx/1.30.1`, became the villain of a day-long debugging
session. This is the story of how a deceptively small bug turned out to be
three separate problems stacked on top of each other — and how I'd find each
one faster next time.

## The problem

The bot had two jobs: **collect** listings, and **notify** me. Collection
worked. Notification didn't. The log said `400 Bad Request` and pointed at a
server identifying itself as `nginx/1.30.1`.

My first assumption was textbook: **something in the network is intercepting
the request.** `nginx/1.30.1` is not a header I associated with Telegram's
API. A 400 with an HTML body (Telegram returns JSON even on errors) smelled
like a local reverse proxy or a VPN gateway rejecting traffic before it ever
left the machine.

Assumptions like that are cheap. They're also wrong a lot. Let me walk
through what I actually found.

## What I tried, and why each thing failed

### Round 1: it must be DNS / IPv6

I checked `getMe` from inside the container. It worked. Then I checked
`sendMessage`. It failed. Same token, same container, one method up, one down.

The giveaway was in how the two endpoints resolved:

```
# inside the container
$ getent hosts api.telegram.org
2001:67c:4e8:f004::9   api.telegram.org
```

The container resolved `api.telegram.org` to **IPv6 only** — a single `AAAA`
record and no `A` record. The container ran on a Docker bridge network with
**no IPv6 connectivity**. So every request that needed `api.telegram.org` was
trying to reach an IPv6 address it had no route to.

The fix looked obvious: pin the IPv4 address with `extra_hosts`. I did, and
the DNS answer became exactly what I expected:

```
149.154.167.220   api.telegram.org
```

And the notifications **still failed.** Same 400. My proud fix did nothing.

### Round 2: I picked the wrong IP

Here's a mistake worth remembering: I hard-coded `149.154.167.220` from
memory. When I finally queried a public resolver, the real `A` record for
`api.telegram.org` was different:

```
149.154.166.110   api.telegram.org   # what DNS actually says
149.154.167.220   api.telegram.org   # what I hard-coded
```

`167.220` is *inside* Telegram's IP range (`149.154.160.0/20`), so it's not
"wrong" in the sense of being somebody else's server — but it's not the
active endpoint, and bot-API traffic to it behaved unpredictably. I switched
to `166.110`. It still failed. So the IP wasn't the whole story either.

### Round 3: the same command, two different outcomes

This was the moment the whole thing got weird. Inside one container, at
almost the same second:

- the **long-running monitor process** (`PID 1`) → `sendPhoto` failed, 400
- a **fresh `docker exec` process** running identical code → `sendPhoto`
  succeeded, 200

Same container. Same code. Same payload. Same second.

I ruled out token, chat_id, emoji in the caption, Unicode quotes, image
format, environment variables, and the image URL itself — I download-tested
the photo and it was a perfectly valid JPEG. Nothing in the code differed
between the two paths.

When you hit a contradiction like that — "identical inputs, opposite
outputs" — the answer is usually that the inputs *aren't* identical. But
finding the difference took one more frame change.

### Round 4: `nginx/1.30.1` is Telegram

I re-read the raw 400 response instead of assuming. The response was an HTML
"400 Bad Request" page, and the `Server` header was `nginx/1.30.1`.

**That nginx is Telegram's own edge.** Telegram's API sits behind nginx
(version 1.30.1), and when a request is malformed *before* it reaches their
application layer, nginx itself answers with a plain 400 page — no JSON, no
friendly error code.

That reframed everything. The request wasn't being intercepted. It was
**reaching Telegram, and Telegram's nginx was rejecting it as malformed.**

And the malformed thing was the one part I hadn't scrutinized: the
`sendPhoto` multipart body.

## The fix

My original code built the multipart body like this — the kind of
"obviously fine" line that ships a subtle bug:

```python
body = b"\r\n".join(body_lines)
```

That `join` looks convenient, but a JPEG is **binary data**. Its bytes include
`\r\n` byte sequences in the middle of the image data. Joining with `\r\n`
as the delimiter corrupts the exact bytes that are supposed to be the image
payload. Telegram receives a body whose multipart boundaries are broken, so
its nginx rejects the request with a 400 before the bot API ever parses it.

The correct approach is to assemble the body field by field, keeping binary
data untouched:

```python
boundary = "----tg" + token_hex(8)

parts = []
parts.append(f"--{boundary}\r\n".encode())
parts.append(b'Content-Disposition: form-data; name="chat_id"\r\n\r\n')
parts.append(f"{chat_id}\r\n".encode())

parts.append(f"--{boundary}\r\n".encode())
parts.append(b'Content-Disposition: form-data; name="caption"\r\n\r\n')
parts.append(f"{caption}\r\n".encode())

parts.append(f"--{boundary}\r\n".encode())
parts.append(
    b'Content-Disposition: form-data; name="photo"; '
    b'filename="image.jpg"\r\nContent-Type: image/jpeg\r\n\r\n'
)
parts.append(image_bytes)          # ← binary stays binary
parts.append(b"\r\n")

parts.append(f"--{boundary}--\r\n".encode())

body = b"".join(parts)             # join bytes, not lines
```

The difference is `b"".join(parts)` instead of `b"\r\n".join(...)`: each part
is already a complete chunk with its own framing, and we concatenate them
verbatim rather than inserting a delimiter *between every element*.

There's a second, higher-level fix worth naming: **stop asking Telegram to
download the image for you.** My earlier code passed the image as a *URL* and
let Telegram fetch it:

```python
tg("sendPhoto", {"photo": image_url, "caption": caption})
```

That means Telegram's servers have to reach out to the source CDN — and if
that CDN is flaky or geo-blocks Telegram's crawlers, you get intermittent
failures that are impossible to reproduce locally. Downloading the image
yourself, then uploading the bytes, removes an entire class of flakiness and
gives you a chance to validate the bytes before you send them.

## What I'd do differently

1. **Read the raw response, not the assumption.** `nginx/1.30.1` sat in logs
   for hours while I chased phantom proxies. Look up who owns the header
   before inventing a man-in-the-middle.
2. **Verify a hard-coded IP against a live resolver.** Memory is not DNS.
   `dig +short api.telegram.org` takes three seconds and would have saved me
   a whole round.
3. **Treat "identical inputs, opposite outputs" as a lie.** The inputs were
   never identical — the two processes differed somewhere I wasn't looking.
   The honest move is to diff the bytes, not the code.
4. **Never hand-join binary data with a text delimiter.** `b"\r\n".join()` on
   a mix of text and JPEG is a corruption bug waiting to happen.

## The result

After the multipart fix, the monitor pushed a real notification through on
the next tick — image and all. I also folded in a retry queue so a failed
notification stays marked un-sent and is retried 30 seconds later instead of
silently vanishing. The whole episode cost the better part of a day, but it
turned into exactly the kind of bug I'll never trip over twice.

---

*The bot is a personal project, but the lesson generalizes to any service
that relies on outbound notifications. If you've got a monitor, a scraper, or
an alert pipeline that needs to reach people reliably, let's talk — I build
and fix these for a living.*

**WhatsApp +60 12-797 2969 · me@hoelee.com · hoelee.com**