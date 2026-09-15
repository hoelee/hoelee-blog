---
title: "Why Unraid Hangs When You Stop the Array With a Swapfile — and the Fix"
description: "My Unraid array stop hung forever at unmounting disks because an 8 GB btrfs swapfile pinned /mnt/cache. Root cause, the /boot/config/stop trap, and two User Scripts that fix it."
pubDate: 2026-09-15
category: devops
tags: [unraid, swap, btrfs, zram, docker, user-scripts]
ogImage: /og/unraid-stop-array-hangs-on-swapfile.png
banner: /banners/unraid-stop-array-hangs-on-swapfile.png
draft: false
---

I added an 8 GB swapfile to my Unraid server — my cache pool is a btrfs RAID1,
and the kernel refuses a swapfile that lives directly on a multi-device btrfs
filesystem, so it goes through a loop device, the standard workaround. Swap
worked. Memory pressure dropped. Everything was fine… until the day I stopped
the array.

The WebUI sat on **"Retry unmounting user shares…"** forever. The cache pool
would not release. Docker was stopped, VMs were shut down, shares were
unmounted — and still, `umount /mnt/cache` failed with *target is busy*,
every five seconds, indefinitely. The only way out was a reboot.

This is the story of finding out why, the trap I fell into on the way
(`/boot/config/stop` does **not** run when you click Stop), and the two-script
fix that survives every stop/start cycle since.

## The problem, phrased the way you'd Google it

If you landed here from a search, you're probably typing one of these:

- *"unraid stop array stuck retry unmounting user shares"*
- *"umount /mnt/cache target is busy unraid"*
- *"unraid swapfile stop array hang"*
- *"unraid won't stop array after adding swap"*

Same bug. The short version: **a swapfile — or its loop device — is held open
by the kernel's swap subsystem, and Unraid's array-stop sequence has no step
that turns swap off before it unmounts disks.** The mount is busy because the
kernel itself is using it, and it will keep using it until someone runs
`swapoff`. Nobody does.

## What I tried, and why it failed

### Attempt 1: reboot, stop array again — hung again

Obviously. The swapfile was still configured in `/boot/config/go`, so every
boot recreated the loop device and enabled swap on it. Every stop hit the same
wall. At least this confirmed it was deterministic, not a one-off stuck
process.

### Attempt 2: put a `swapoff` in `/boot/config/stop`

This is the classic trap, and the Unraid docs make it look like the right
answer. The `stop` script exists precisely for "run cleanup before disks go
away" — and it does run, **but only during a full shutdown or reboot**.

I checked on my own box (Unraid 7.1.4): `/boot/config/stop` is invoked by
`rc.local_shutdown`, which is called from `rc.6`. Clicking **Stop** in the
WebUI goes through a completely different path — `emhttpd` fires a series of
*events* — and `rc.6` is never involved. No shutdown, no `stop` script, no
`swapoff`. The array stop still hung.

### Attempt 3: read what the GUI Stop actually does

This is where the real answer lives. Unraid's event dispatcher (`emhttp_event`)
runs hook scripts in a documented sequence when the array stops:

```text
stopping → stopping_libvirt → stopping_docker → stopping_svcs
        → unmounting_disks → stopping_array → stopped
```

Two facts matter:

1. The unmount happens at `unmounting_disks`. **Any swapoff must fire at
   `stopping_svcs` or earlier** — one event before the unmount.
2. These events are exactly what the **User Scripts** plugin exposes as
   schedule options ("At Stopping of Array" = `stopping_svcs`, "At Startup of
   the array" / "At First Array Start only" = `array_started` /
   `disks_mounted`). No new code needed — the automation surface already
   exists.

### The subtle part: `/proc/swaps` lies about loop-backed swap

Here's the gotcha that makes even a "correct-looking" cleanup script fail.
My `/boot/config/go` set swap up like this (the standard btrfs-RAID1 recipe):

```bash
# /boot/config/go — the original (broken-on-stop) setup
mkdir -p /mnt/cache
MOUNTPOINT=/mnt/cache
SWAPFILE=${MOUNTPOINT}/swapfile

# Wait for the cache pool to be mounted
while [ ! -f "${SWAPFILE}" ]; do
  sleep 1
done

# Btrfs RAID1 rejects direct swapfiles: loop device + NOCOW
chattr +C "${SWAPFILE}"
LOOPDEV=$(losetup -f)
losetup -p 100 "${LOOPDEV}" "${SWAPFILE}"
swapon -p 1 "${LOOPDEV}"
```

Now look at what the kernel reports while that's active:

```console
$ cat /proc/swaps
Filename                Type        Size      Used    Priority
/dev/loop0              partition   8388604   0       -2

$ swapon --show
NAME       TYPE SIZE USED PRIO
/dev/loop0 partition  8G   0B   -2
```

**The filename is `/dev/loop0`, not `/mnt/cache/swapfile`.** So a cleanup
script like this one:

```bash
# WRONG — silently does nothing for loop-backed swap
grep -q '/mnt/cache/swapfile' /proc/swaps && swapoff /mnt/cache/swapfile
```

…matches nothing, swaps nothing off, and you're back to the hang. You have to
resolve the loop device *first* — `losetup -j <file>` does exactly that — then
`swapoff` the loop device, then detach it. The ZRAM Compressed Memory plugin
documents this same bug in its source comment, almost word for word: *"for
loop-backed swap, /proc/swaps lists /dev/loopN, not the image path — a plain
grep never matches, so swapoff never ran and the loop device kept the pool
busy forever."*

## The fix: two User Scripts

[User Scripts](https://forums.unraid.net/topic/48286-plugin-ca-user-scripts/)
is already installed on most Unraid boxes. Create two scripts:

**Script 1 — "Array Stop Swapoff"** — schedule: **At Stopping of Array**
(fires at `stopping_svcs`, one event before the unmount):

```bash
#!/bin/bash
# Release ALL swap, then detach only the loop device backing OUR swapfile.
swapoff -a 2>/dev/null
for l in $(losetup -j /mnt/cache/swapfile 2>/dev/null | awk -F: '{print $1}'); do
  losetup -d "$l" 2>/dev/null
done
```

`losetup -j` ("which loop device is attached to this file?") is the key move —
it's immune to the `/proc/swaps` naming lie. And detaching *only* our loop
device matters: a box can have other loop devices (mounted ISOs, other images)
that must survive an array stop.

**Script 2 — "Array Start Swapon"** — schedule: **At First Array Start only**
(fires at `disks_mounted`):

```bash
#!/bin/bash
# Re-create the loop-backed swap after the cache pool mounts.
[ -f /mnt/cache/swapfile ] || exit 0
LOOP=$(losetup -f)
losetup -p 100 "$LOOP" /mnt/cache/swapfile && swapon -p 1 "$LOOP"
```

Why "First Array Start only" and not plain "At Startup of the Array"? Because
`/boot/config/go` also runs at boot and would set swap up a second time. The
*first* array start after boot is covered by `go`; this script matters for the
**GUI stop → start cycle with no reboot in between** — which `go` never sees.
(In my setup I moved the swap block out of `go` entirely so the User Script is
the single source of truth — one place, both paths.)

After this: Stop → cache unmounts cleanly on the first try. Start → swap is
back. Verified across multiple stop/start cycles and reboots.

## What I'd do differently

**1. Don't put swap on a disk that's already dying.** My cache pool is a pair
of NVMe drives I've since confirmed are silently corrupting data (reads
returning all-zero blocks despite clean SMART). An 8 GB swapfile there meant
constant write wear on hardware I was about to replace — and it was the very
thing pinching my array stops during the migration. Match swap location to
disk health, not convenience.

**2. Prefer compressed RAM over disk swap when you have the CPU for it.** The
endgame on this box was the [ZRAM Compressed
Memory](https://forums.unraid.net/topic/196763-new-plugin-created-zram/)
plugin: Tier-1 swap lives in a zstd-compressed RAM-backed block device. Two
wins:

- **The hang becomes structurally impossible.** A zram device is not a mount.
  `umount /mnt/cache` can never see it, so there's nothing to release at stop
  time. (The plugin *also* ships a proper `event/stopping` hook with the
  `losetup -j` fix, if you enable its Tier-2 disk swapfile.)
- **Swap-in/out is microseconds of CPU work instead of disk I/O** — on a
  modern many-core CPU, compression is nearly free relative to even NVMe
  latency, and you save ~3:1 on the RAM the swapped pages occupy.

One caveat I learned the hard way: the plugin's auto-size (50% of RAM) gave me
a **31.3 GB** zram device on a 62 GB host that was already 90% full. That
number is an *uncompressed ceiling* — real RAM cost is capacity ÷ compression
ratio, so a full 31.3 GB zram could eat 10–30 GB of the very RAM I was short
of. On a nearly-full host, size zram fixed and modest (I went to 8 GB, the old
swapfile size, swappiness 150) so it buffers OOM instead of competing with it.

**3. Swap delays OOM; it doesn't cure it.** The honest root cause of my memory
pressure was VM RAM budgets, not a missing swapfile. Swap bought headroom and
kept the host alive during spikes — but the real fix was right-sizing guests.

## The result

Array stop went from *"hangs forever, forced reboot"* to *clean unmount on the
first attempt*, and swap now survives stop/start cycles without manual
intervention. Total fix: two shell scripts in a plugin that was already
installed. The expensive part was knowing **where** in the event sequence to
put them — and that `/proc/swaps` won't tell you the truth about loop-backed
swap.

If your Unraid array refuses to stop and you have any swap configured — file,
loop, or otherwise — `swapoff -a` from a root shell will release it
immediately, and you've confirmed the diagnosis. Then automate it before the
next reboot wipes your memory of how.

---

*Run a self-hosted stack that needs this kind of debugging — Unraid, Docker,
reverse proxies, NAS migrations? I do this for a living: [website design &
development](https://hoelee.com) is my main work, and self-hosted
infrastructure is where I go deep. Reach me on
[WhatsApp](https://wa.me/60127972969) or
[email](mailto:me@hoelee.com?subject=Unraid%20infrastructure%20help).*
