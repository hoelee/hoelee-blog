---
title: "Hardening a Tor Onion Service: What Actually Matters"
description: "Out of curiosity I mirrored my portfolio and git server onto the darknet. Here's the hardening that held, the parts that silently broke, and whether it's worth offering to clients."
pubDate: 2026-09-09
category: devops
tags: [tor, docker, security, self-hosting, networking]
ogImage: /og/hardening-a-tor-onion-service.png
banner: /banners/hardening-a-tor-onion-service.png
---

I got curious about the darknet. Not the marketplaces, the boring half of it: people self-hosting things the way the internet worked before registrars and cloud dashboards, running software they control at an address they own.

The way I answer a curiosity like that is to build something, so the experiment became: mirror my own sites onto Tor. My interactive portfolio lives at [me.hoelee.com](https://me.hoelee.com), and my code lives on a Gitea instance at [git.hoelee.com](https://git.hoelee.com). Both now have darknet twins:

- `hoeleegitkcng572znkbpyffppyulsdwv3aurrzlk7y7vlhknogswoqd.onion` — the Gitea mirror
- `hoeleeaiwowgndbxswegtdzoeupz7lkkechtqmurbmnpvwa4k3vyuyid.onion` — the portfolio mirror

While I was researching how to do this right, a lot of what I read online talked up the benefits of obfs4. What actually kept my setup safe had nothing to do with that reading.

So what does actually keep an onion service safe? I went through this properly when I set the mirrors up, and again months later when I went back to check on them. Some of the setup held up. Some of it had quietly broken. And a couple of things I believed about Docker turned out to be wrong in ways I could measure.

## What actually protects the origin

Three things, and only the last one requires any work:

1. **The protocol.** Visitors never connect to your server directly. Your tor process dials out, registers the service with introduction points, and rendezvous happens inside the network. Nobody who visits gets your IP from the visit itself.
2. **Vanguards-lite.** Built into Tor since 0.4.7, this makes guard-discovery attacks (an attacker forcing circuits until they can observe your guard relay) far less practical. You get it by simply running a current Tor.
3. **Not leaking the origin through other channels.** The realistic way an onion host gets exposed is not traffic analysis. It's your own machine leaking: a clearnet service gets compromised, and the attacker just reads your onion keys off the disk. Mirroring a public site to an onion is deliberate, so content correlation doesn't bother me. What matters is that the machine holding the keys isn't also running a pile of exposed services.

## Things that quietly broke

These are the parts where re-checking my own server paid for itself.

**The app container had full internet access.** I ran a one-liner inside the container against a public IP echo service, and my home IP came back. There had been an iptables-based block for this, but the rules were gone. Host firewalls get flushed silently by interface changes, container manager restarts, platform updates. A block that nothing re-applies and nothing alarms on is not a block, it's a superstition. This convinced me to stop filtering the app's egress and remove it entirely instead (below).

**The host firewall was off.** INPUT and FORWARD policy ACCEPT, and a few dozen ports listening on all interfaces from the other services on the same machine. If any one of those gets owned, the onion keys on that disk belong to the attacker. People spend hours on Tor-specific hardening and skip this.

**The running tor didn't match its config file.** The torrc on disk said `SocksPort 0`. The process, up for days, was still listening on 127.0.0.1:9050. I had edited the file and never restarted the container. Impact here was small, since the listener was container-local. The lesson generalizes: the config file you wrote is a wish, what the process is actually doing is the truth.

**Tor was a security release behind.** Older than I'd want on a box holding sensitive keys, and my logs carried the warn-spam signatures from a relay-descriptor parsing bug the newer releases fixed. It stopped after the upgrade.

## The fixes that stayed fixed

### Zero egress, by construction

Both containers go on a Docker network with `internal: true`, and only the tor container gets a second NIC for reaching the Tor network.

```yaml
networks:
  service_net:
    driver: bridge
    internal: true        # no gateway, no masquerade, no route out
  egress:
    external: true        # ordinary bridge with internet
```

The app has no route to anything now. Not the internet, not the LAN, not even the host, because an internal network has no gateway at all. Nothing to flush, no boot task to remember, no way for it to silently decay. If the app gets compromised, the attacker gains a socket pointing at tor and nothing else. This is the one change I'd call non-negotiable for any app I run this way.

### Non-root, and the capability surprise

The image runs as non-root by default, and I wanted the app to keep listening on port 80. The standard advice is `cap_add: NET_BIND_SERVICE`. It didn't work. The container crash-looped with:

```
[FATAL] Server error: listen tcp 0.0.0.0:80: bind: permission denied
```

The reason surprised me enough that I measured it with a probe container: `grep Cap /proc/self/status` showed `CapBnd` with bit 10 (NET_BIND_SERVICE) set, and `CapEff` at zero. Docker grants capabilities to a non-root container only in the bounding set, not the effective set, and bind() checks the effective set. A non-root process running a binary without file capabilities gets an empty effective set, full stop. So the answer is boring: run on an unprivileged port inside.

```yaml
  app:
    user: "1000:1000"
    cap_drop: [ALL]
    security_opt: [no-new-privileges]
  tor:
    user: "100:101"
    cap_drop: [ALL]
    security_opt: [no-new-privileges]
```

One line on the tor side remaps the visit:

```
HiddenServicePort 80 app:8080
```

People still land on port 80 of the onion address. Only the internal port moved.

### Healthchecks that check the right thing

The tor image ships with a healthcheck that probes the SOCKS port. I had just turned SOCKS off, so healthy became unhealthy forever. Override it with the question you actually mean: is the process alive?

```yaml
healthcheck:
  test: ["CMD", "pgrep", "-x", "tor"]
```

The nginx trap was subtler. My first version used `wget --spider` against the root path. The site returned 404 (I hadn't uploaded content yet), wget exited non-zero, and the container got marked unhealthy. The check was testing the content, not the service. `nc -z 127.0.0.1 80` tests the port and nothing else.

One more thing: tor resolves its `HiddenServicePort` target at startup. If the app container isn't up yet, tor dies with "Unparseable address in hidden service port configuration" and crash-loops. I'd watched four failed starts in the old logs, unnoticed, because nothing was watching. `depends_on` in the compose file fixed the ordering.

### The ownership landmine

After generating new keys I copied the key material back through a file-share mount. The next containers crash-looped:

```
[warn] Could not open "/var/lib/tor/.../hs_ed25519_secret_key": Permission denied
```

Files written through the share are owned by the share user, not by the uid tor runs as. The fix is one command, runnable anywhere, including a throwaway container with the volume attached:

```bash
docker run --rm -v /path/libTor:/var/lib/tor alpine \
  sh -c "chown -R 100:101 /var/lib/tor && chmod -R 700 /var/lib/tor"
```

### Verify, don't believe

Every fix above ends with a test I can run myself. The egress one is my favorite, because the two probes together are convincing: the same wget that fails inside the app's network succeeds from tor's egress network.

```bash
# inside the app: with internal:true, even DNS should fail
wget -T 6 -qO- http://ipv4.icanhazip.com     # → "wget: bad address", exit 1

# same probe, on tor's egress network, as a control
wget -T 6 -qO- http://ipv4.icanhazip.com     # → <your IP>, exit 0
```

If you can't exec into a container, attach a throwaway probe container to the same network. It tests the network's properties, which is the thing you actually hardened.

## Would I offer this as a service?

I keep thinking about this, because the marginal cost is close to zero: the tor containers and their isolation are already running.

Most of my hosting clients want the opposite of an onion service. They want to be found on Google. Selling someone a website that only opens in Tor Browser means selling them secrecy they probably don't need, and it means supporting their visitors through installing Tor Browser.

But there is a real sliver of a market. Lawyers exchanging drafts, auditors, people delivering digital goods, anyone sharing an archive that should never show up in a search index. For those clients the pitch writes itself: no port forwards, no domain, no logs on some platform you don't control, just an address you physically hand to the people who should have it.

There's one trick that sells better than I expected, and it ties to a question everyone asks: can you choose how the address starts? v3 onion addresses are random, but only because the keys are. You can mine them: generate keypairs until the base32 address begins with the prefix you want. Every character costs a factor of 32 in work. Community mining tools on a modern GPU check addresses in the low millions per second, which makes an 8-character prefix a day-or-a-few-days job, 9 characters a patient weeks-long one, and 10 characters a serious multi-GPU commitment. A prefix that starts with the client's brand turns an unmemorable 56-character string into something they can verify is really yours, and in a niche where trust is the entire product, that's real value. I'd mine 8 happily, 9 for a paying client, and quote 10 with a straight face only if they're renting the GPUs.

So: as a bolt-on for a handful of specific clients, yes. As a product line, no. The market is too thin to build a funnel on, and the support burden doesn't shrink with volume. Privacy consulting with an onion attached, fine. Onion hosting as a web hosting tier, someone else's problem.

## What stuck

- **Run the tests, not the config file.** In-container probes and health states are the truth; the yaml is the intention.
- **Prefer mechanisms that can't silently unwind.** `internal: true` beats an iptables boot task every time.
- **Healthchecks are cheap. They caught a crash loop in minutes** where previously nothing watched for days.
- **The boring host firewall matters more than exotic Tor hardening.** Nobody de-anonymizes you with traffic analysis if they can just walk in through an open port.