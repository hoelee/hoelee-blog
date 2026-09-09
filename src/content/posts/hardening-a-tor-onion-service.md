---
title: "Hardening a Tor Onion Service: What Actually Matters"
description: "An audit of a Dockerized onion service, the obfs4 misconception, and the five silent failures that turned out to be the real risk — with fixes and the tests that prove them."
pubDate: 2026-09-09
category: devops
tags: [tor, docker, security, self-hosting, networking]
---

Someone recently told me to add obfs4 to my Dockerized onion service, "for the server side." It's a well-intentioned suggestion and a common mistake. This post is about what I found when I actually audited the stack instead: which of my hardenings had silently rotted, which ones were wrong about how Docker works, and what ended up mattering.

**TL;DR:** obfs4 does nothing for an onion service's server. The real risks were: an application container with full outbound internet access, a disabled host firewall, a config file that had never been reloaded, and a tor version behind a security release. All fixable with boring tooling.

## The obfs4 misconception

obfs4 is a *pluggable transport* — it disguises **client→Tor** traffic so that censored-network users (DPI, blocking regimes) can reach the Tor network at all. It runs on bridges, which are entry relays with disguised traffic.

An onion service's server has no use for it. The server connects to the Tor network as a client: it builds circuits to guards and registers itself with introduction points. That traffic uses standard Tor link protocol, and there is no "server-side obfs4" mode. Adding an obfs4 bridge container to your stack does exactly zero for your origin IP. (It's also impossible behind CGNAT anyway — a bridge needs a publicly reachable port.)

What actually protects an onion service origin:

1. **The protocol itself.** Visitors never learn your IP — they don't connect to you; your tor instance connects out and rendezvous happens inside the network.
2. **Vanguards-lite.** Built into Tor ≥ 0.4.7, this defends against guard-discovery attacks where an attacker forces circuits until they observe your guard. You get it by simply *running a current Tor*.
3. **Not leaking the origin through every other channel.** This is where most home setups actually fail — and it has nothing to do with Tor configuration.

## The audit

The stack: a file browser web app served exclusively through a Tor hidden service, both in Docker. tor → app over a private network, no published ports on either container. That part was already textbook.

Layer by layer, here's what I found:

### ✅ What was already right

- **No published ports.** The app and tor were reachable only inside their Docker network.
- **Tor hardening basics.** `cap_drop: ALL`, `no-new-privileges`, non-root user, `SocksPort 0`, no ORPort/exit config.
- **The right app image.** The original file browser project is unmaintained; the stack used its actively-maintained fork ("FileBrowser Quantum"), which is also designed to run as a non-root user.

### ❌ What was quietly broken

**1. The app container had full internet egress.** I ran a one-liner inside the container against a public IP echo service and got my home IP back. There had *been* an iptables-based block task, but the rules were gone — the host firewall had flushed them at some point (interface changes, container-manager restarts, platform updates all do this silently). The lesson: **container isolation built on host iptables that nothing re-applies and nothing alarms on is not isolation.**

**2. The host firewall itself was off.** INPUT/FORWARD policy ACCEPT everywhere, a few dozen ports listening on 0.0.0.0 across the rest of the machine's services. For an onion service, this is the realistic deanonymization path: not exotic traffic analysis, but ordinary compromise of a clearnet-facing service — after which the attacker just reads your onion keys off the disk. Guard the keys' home before you worry about guard discovery.

**3. The running tor didn't match its config file.** The on-disk torrc said `SocksPort 0`; the process had been up for days and was still listening on 127.0.0.1:9050. Somebody (me) had edited the file and never restarted the container. Low impact here — container-local, nothing else could reach it — but it's a good reminder that *the config file it's running is not the config file on disk*.

**4. Tor was one security release behind.** Not dramatic on its own, but the newer releases carried fixes around parsing of malformed relay descriptors — my logs had the exact warn-spam signatures, and it disappeared after the upgrade. I treat security releases as mandatory for a box that hosts sensitive keys.

## The fixes

### Zero egress by design, not by script

The core change: put both containers on a Docker network with `internal: true`, and give only the tor container a second NIC for reaching the Tor network.

```yaml
networks:
  service_net:
    driver: bridge
    internal: true        # no gateway, no masquerade, no route out
  egress:
    external: true        # ordinary bridge with internet
```

The app now has **no route anywhere** — not to the internet, not to the LAN, not even to the host. `internal: true` removes the gateway entirely, so there's no iptables to flush, no boot task to forget, no silent decay. If the app is compromised, the attacker gets a socket to tor and nothing else. This is enforced by Docker's own networking, which is also why it survives reboots and daemon restarts.

### Non-root, and why `NET_BIND_SERVICE` didn't save me

The image's default user is non-root, and I wanted to keep binding port 80. Standard advice: `cap_add: NET_BIND_SERVICE`. It didn't work. The container crash-looped with:

```
[FATAL] Server error: listen tcp 0.0.0.0:80: bind: permission denied
```

The reason is worth knowing: **Docker grants capabilities to a non-root container only in the *bounding set*, not the effective set.** I verified it with a probe container — `grep Cap /proc/self/status` showed `CapBnd` containing bit 10 (NET_BIND_SERVICE) while `CapEff` was 0. A non-root process executing a binary with no file capabilities gets an empty effective set, and the kernel checks the *effective* set on bind. So instead of fighting it: run on an unprivileged port (8080) internally and map the hidden service to it.

```yaml
  app:
    user: "1000:1000"
    cap_drop: [ALL]          # hands empty; NET_BIND_SERVICE not needed on 8080
    security_opt: [no-new-privileges]
  tor:
    user: "100:101"
    cap_drop: [ALL]
    security_opt: [no-new-privileges]
```

Hidden service side, one line change:

```
HiddenServicePort 80 app:8080
```

Visitors still land on port 80 of the onion address; only the internal port moved.

### Healthchecks that check the right thing

The tor image's built-in healthcheck probes the SOCKS port. I'd just turned SOCKS off — so healthy became permanently "unhealthy." Override it with the thing you actually care about: is the process alive?

```yaml
healthcheck:
  test: ["CMD", "pgrep", "-x", "tor"]
```

For nginx the trap was subtler: I first used `wget --spider` against the root path. When the site returned 404 (I hadn't uploaded content yet), wget exits non-zero and the container was marked unhealthy — the check was testing the *content*, not the *service*. `nc -z 127.0.0.1 80` tests the port and nothing else.

Also added `depends_on` (tor waits for the app): tor resolves its `HiddenServicePort` target at startup, and if the app container isn't up yet, tor dies with "Unparseable address in hidden service port configuration" and crash-loops. I'd watched exactly that happen in the old logs — four failed starts, nobody noticed, because nothing was watching.

### The ownership landmine

After re-keying the service I copied the key material back through a file-share mount. New containers immediately crash-looped:

```
[warn] Could not open "/var/lib/tor/.../hs_ed25519_secret_key": Permission denied
```

Files written through the file share were owned by the share user, not by uid 100 that tor runs as. Fix is one command — run anywhere, including a throwaway container with the volume attached:

```bash
docker run --rm -v /path/libTor:/var/lib/tor alpine \
  sh -c "chown -R 100:101 /var/lib/tor && chmod -R 700 /var/lib/tor"
```

Rule of thumb going forward: **any key file that passed through a file share gets `chown`ed before the next container start.**

### Version hygiene

Repulled `osminogin/tor-simple:latest` → tor 0.4.9.11, the current security track. Combined with SocksPort 0 now actually *applied*, the warn-spam stopped and the listener was gone.

## Verify, don't believe

Every fix above ends with a test I can run myself:

```bash
# inside the app: with internal:true, even DNS should fail
wget -T 6 -qO- http://ipv4.icanhazip.com     # → "wget: bad address", exit 1

# same probe, on tor's egress network (control group)
wget -T 6 -qO- http://ipv4.icanhazip.com     # → <home IP>, exit 0
```

If you can't exec into a container, attach a throwaway probe container to the *same network* — it tests the network's properties, which is the thing you hardened. Final state: all containers healthy, hidden service up with the same onion address (keys on a persistent volume), zero published ports, and an app that literally cannot resolve `ipv4.icanhazip.com`.

## What I'd do next time

1. **Audit running state, not config files.** The config file is a wish; `docker inspect`, in-container `netstat`, and live egress probes are the truth.
2. **Prefer mechanisms that can't silently unwind.** `internal: true` beats an iptables boot task, always.
3. **Healthchecks are tiny observability debt payments.** The day they catch something real (mine caught a crash loop within minutes) they've paid for themselves.
4. **The boring host firewall matters more than exotic Tor hardening.** If the rest of the machine is 0.0.0.0-open, the onion's anonymity dies from a pickaxe attack, not a correlation attack.
5. **Skip the plugs, keep the transport.** Run a current Tor (vanguards-lite included), disable what you don't need, isolate egress, and you're ahead of most onion deployments — no obfs4 required.

---

*No IPs, addresses, or infrastructure specifics were harmed in the writing of this post.*