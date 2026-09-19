---
title: "Replacing RDPGuard With IPBan: The Traps Nobody Documents"
description: "I migrated from paid RDPGuard 7.8.7 to open-source IPBan 4.1.0 — and hit three undocumented traps, including an uninstaller that would have silently unbanned 12 attackers."
pubDate: 2026-09-19
category: devops
tags: [windows, security, rdp, ipban, rdpguard, brute-force, firewall, self-hosting]
ogImage: /og/replacing-rdpguard-with-ipban.png
banner: /banners/replacing-rdpguard-with-ipban.png
draft: false
---

Anyone who has put a Windows machine on the public internet with Remote Desktop enabled knows the drill. Within minutes of the port being reachable, the log fills with failed logins from rented servers all over the world. Something has to block them automatically.

I ran **RDPGuard 7.8.7** for years. It worked. But it's paid, closed-source, and I was three major versions behind. So I replaced it with **IPBan** — MIT-licensed, maintained since 2011, about 2,200 stars on GitHub, and genuinely the closest thing to a drop-in replacement.

The migration took an evening. Three of the steps were undocumented and one of them would have quietly **removed protection for twelve active attackers**. This is what actually happened.

## Why this matters

RDP exposed to the internet is not a "maybe someone will try" risk. On this machine, IPBan detected and banned **16 distinct attacker IPs in its first hour** — including one that walked a dictionary of administrator usernames and two that guessed the machine owner's actual name as the login. That's a targeted attack, not ambient noise.

If you run RDPGuard, IPBan, or anything similar, two things in this post will matter to you even if you never migrate:

1. **Uninstalling a blocker can unban your attackers.** Most tools own a firewall rule. Remove the tool, lose the rule, lose the bans.
2. **The config key you think controls ban duration probably doesn't.** Both tools in this story have a key that *sounds* right and does something else.

## What I was running

RDPGuard installed as two services plus three processes:

```
RdpGuardService   C:\Program Files (x86)\RdpGuard\rdpguard-svc.exe
RdpGuardProxy     ...\RDPGuardProxyServer\RDPGuardProxyServer.exe
```

It was doing its job. Its firewall rule held **12 blocked IPs**, each with a per-ban XML record in `C:\ProgramData\RdpGuard\blocked_ips\` capturing the IP, the attempted username, and the protocol.

That last part turned out to be the most important thing I checked.

## Trap 1: The uninstaller would have unbanned everyone

RDPGuard owns a Windows Firewall rule named `rdpguard-e1e259c5-local`. All twelve bans live in that one rule.

Here's the problem: when you uninstall RDPGuard, that rule goes with it. The uninstaller has no reason to distinguish "unsafe tool" from "useful ban list" — it just removes what it created. Uninstall first, and you'd have handed twelve known attackers a clean slate.

So before touching the uninstaller, I exported the bans and fed them into IPBan. IPBan reads a plain `ban.txt` file in its service folder — one IP per line — and consumes it on the next cycle:

```bash
# C:\app\IPBan\ban.txt — one IP per line
118.70.185.179
121.162.129.47
163.47.35.89
183.80.60.33
20.57.167.231
202.165.14.28
45.131.194.223
45.141.233.12
45.146.54.21
5.181.86.179
5.181.86.60
61.216.137.152
```

IPBan picked it up within seconds, deleted the file itself, and rewrote its own rule:

```
19:22:00  Updating firewall with 12 entries...
19:22:00  Firewall entries updated: 118.70.185.179:add, 121.162.129.47:add,
          163.47.35.89:add, 183.80.60.33:add, 20.57.167.231:add, 202.165.14.28:add,
          45.131.194.223:add, 45.141.233.12:add, 45.146.54.21:add, 5.181.86.179:add,
          5.181.86.60:add, 61.216.137.152:add
```

The ban records also turned out to be worth reading rather than deleting. Two of the twelve had tried the usernames `HOELEE01` and `HOELEE1` — the machine owner's actual handle, guessed. One had cycled `Administrator` → `Administrador` → `Admin`. That's reconnaissance aimed at a specific person, and it's the kind of detail you'd never know you'd lost if you let the uninstaller run first.

## Trap 2: `--install-service` does not exist

The official install path for IPBan is a PowerShell script that pulls the latest release into `C:\Program Files\IPBan` and registers the service. I deliberately skipped it, because I'd already unzipped a specific version to `C:\app\IPBan` and wanted to keep that config and database.

So I tried the obvious thing:

```
DigitalRuby.IPBan.exe --install-service
```

IPBan 4.1.0's CLI is minimal. Here is the entire command list:

```
Commands:
  version             Get ipban software version
  info                Get information about hosting OS
  migrate             Migrate other provider to ipban.override.config
  logfiletest <file>  Test a log file with regexes for failures and successes
  list                List currently banned IPs (State=Active/in firewall)
  unban <ip>          Request UNBAN for an IP or for all currently banned IPs
  ban <ip>            Request BAN for an IP
```

No `--install-service`. No `--service`. Nothing service-related at all. IPBan is designed to be installed by the script, and when you don't use the script, service registration is on you.

The answer is `sc.exe`, which the project's own uninstall script hints at (`sc.exe stop IPBAN` / `sc.exe delete IPBAN`):

```bash
sc.exe create IPBAN type= own start= auto ^
  binPath= "C:\app\IPBan\DigitalRuby.IPBan.exe" DisplayName= "IPBan"
```

**The spacing in `sc.exe` is load-bearing.** `type= own`, `start= auto`, and `binPath= "..."` each require **a space after the `=`**. Omit it and `sc` parses your argument as a single token and fails. This is a genuine footgun: it looks like a typo, and therefore looks optional.

Two deliberate differences from the official script:

| | Official installer | What I used |
|---|---|---|
| Path | `C:\Program Files\IPBan` | `C:\app\IPBan` (existing dir, config preserved) |
| Startup | `delayed-auto` | `auto` — starts earlier at boot, better for an exposed RDP box |

Verifying it landed, four ways:

```bash
$ sc.exe qc IPBAN
SERVICE_NAME: IPBAN
        TYPE            : 10  WIN32_OWN_PROCESS
        START_TYPE      : 2   AUTO_START
        BINARY_PATH_NAME: C:\app\IPBan\DigitalRuby.IPBan.exe
        SERVICE_START_NAME : LocalSystem
```

And the Windows Event Log confirms the registration independently — event ID 7045:

```
A service was installed in the system.
Service Name:  IPBAN
Service Start Type: auto start
Service Account: LocalSystem
```

One cosmetic wart: because `sc create` got no `DisplayName=`, the service's display name is the bare `IPBAN` rather than a friendly string. Harmless, but it looks unfinished in `services.msc`.

## Trap 3: `ExpireTime` is not the ban duration

This is the one I got wrong first, and it's the one most likely to bite anyone tuning either tool.

I wanted a 24-hour ban. I searched the config, found `ExpireTime`, and nearly changed it. The actual key is **`BanTime`**:

```xml
<!-- The duration of time to ban an ip address (DD:HH:MM:SS) -->
<add key="BanTime" value="01:00:00:00"/>
```

`ExpireTime` does something else entirely — it's how long a *failed-login count* is remembered before it resets to zero:

```xml
<!-- The duration after the last failed login attempt that the ip is forgotten
     (count reset back to 0). Set to 00:00:00:00 to use max duration. -->
<add key="ExpireTime" value="01:00:00:00"/>
```

Both default to `01:00:00:00`, which makes them look interchangeable. They are not. Set `ExpireTime` when you meant `BanTime` and your ban durations never change — you've just quietly changed how long attackers accumulate strikes.

Format is `DD:HH:MM:SS`. So 24 hours is `01:00:00:00`, and `00:00:00:00` means "9999 days," i.e. effectively permanent.

There's a second red herring. Every `<LogFile>` block in `ipban.config` carries its own `<FailedLoginThreshold>` element — and **all 25 of them are `0`**, meaning "use the global default." The global key that actually governs is:

```xml
<!-- Number of failed logins before banning the ip address -->
<add key="FailedLoginAttemptsBeforeBan" value="5"/>
```

Changing the per-log elements would have done nothing at all.

## How to tune IPBan without losing your settings

IPBan splits configuration in two:

| File | Role |
|---|---|
| `ipban.config` | Shipped defaults. **Overwritten on update — never edit.** |
| `ipban.override.config` | Your settings. Merges over the top. Edit this one. |

My working `ipban.override.config`:

```xml
<appSettings>
  <!-- Never ban these. Whitelist beats blacklist. -->
  <add key="Whitelist"
       value="192.168.1.0/24,100.64.0.0/10,127.0.0.1,:?::1"/>

  <!-- Ban after 3 failed logins (default is 5) -->
  <add key="FailedLoginAttemptsBeforeBan" value="3"/>

  <!-- Ban duration, DD:HH:MM:SS. 01:00:00:00 = 24 hours -->
  <add key="BanTime" value="01:00:00:00"/>
</appSettings>
```

The whitelist deserves emphasis. IPBan watches **20 event-log queries** plus a pile of log files — not just RDP, but OpenSSH, IIS, Exchange, MSSQL, MySQL, FTP, SMTP/IMAP/POP3, VoIP/SIP, VNC, Tomcat. Any of those can trigger a ban.

If your own address isn't whitelisted, three mistyped passwords lock you out of your own machine for 24 hours. If RDP is your only remote access and the port is public, that's a real recovery problem. Whitelisted IPs are also placed in a separate **Allow** firewall rule (`IPBan_GlobalWhitelist_0`), which takes precedence.

Note that in a container or NAT'd network you can't always self-test — with your LAN and Tailscale ranges whitelisted, there's no easy way to deliberately trigger a ban from your own machine.

## Useful commands

```bash
# Watch the log live
Get-Content C:\app\IPBan\logfile.txt -Wait -Tail 20

# List currently banned IPs
C:\app\IPBan\DigitalRuby.IPBan.exe list

# Manually ban / unban
C:\app\IPBan\DigitalRuby.IPBan.exe ban 203.0.113.9
C:\app\IPBan\DigitalRuby.IPBan.exe unban 203.0.113.9
C:\app\IPBan\DigitalRuby.IPBan.exe unban all
```

Bans all live in one firewall rule that gets rewritten each cycle, so the GUI is the wrong place to look — `list` is the source of truth.

## The result

Sixteen attacker IPs blocked within the first hour, with no protection gap during the migration:

- **12 ported** from RDPGuard, so uninstalling it unblocked nothing
- **4 caught** by IPBan itself, including one that arrived mid-migration

IPBan logs `Remote ip address:` on startup, which is a neat way to confirm which of your own addresses the service considers the client. Verifying config is genuinely applied is harder than it looks — IPBan **hot-reloads** on file change and logs `Config file changed`, but it does not re-print your settings. A full restart (`Restart-Service IPBAN -Force`) requires elevation; from a non-elevated shell you get `System error 5 / Access is denied` and may wrongly conclude the restart worked when nothing happened.

## What I'd do differently

- **Export bans before uninstalling anything.** Make this step one, not an afterthought. Any tool that owns a firewall rule will take its ban list with it.
- **Read the ban records, not just the IPs.** The attempted usernames told me the attack was targeted.
- **Don't grep for a plausible key name — read the comment above it.** `BanTime` and `ExpireTime` both default to the same value, which is exactly why the wrong one survives testing.
- **Prefer `sc.exe` when the official installer would orphan your config.** If you've already unzipped a version somewhere, installing "properly" into `Program Files` leaves your database and settings behind.
- **Fix the exposure, not just the symptom.** Every tool here reacts *after* failed logins. Each attacker still gets its full threshold of guesses per ban window, from unlimited IPs. The durable fix is to not publish 3389 — restrict it to your LAN and VPN ranges and let the blocker handle the residue.

A blocker is a mitigation. If a port doesn't need to face the internet, closing it beats defending it.

## Want this for your business?

If you're running Windows servers with RDP, SQL, or mail services reachable from the internet, I set up brute-force protection like this — automated IP banning wired into the Windows Firewall, sensible thresholds, and a whitelist that keeps you from locking yourself out.

**WhatsApp: [+60 12-797 2969](https://wa.me/60127972969)** · **Email: [me@hoelee.com](mailto:me@hoelee.com?subject=RDP%20brute-force%20protection)** · **[hoelee.com](https://hoelee.com)**

Website design and development is my main line of work; server hardening and self-hosted infrastructure is the other half of it.
