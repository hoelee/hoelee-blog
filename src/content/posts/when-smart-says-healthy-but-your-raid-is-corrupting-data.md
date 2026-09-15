---
title: "When SMART Says Healthy and Your RAID Is Silently Corrupting Data"
description: "A btrfs RAID1 pool on two healthy-looking NVMe drives quietly corrupted a Windows VM. How I caught it, the checksum forensic that proved it, and why I replaced both drives."
pubDate: 2026-09-16
category: devops
tags: [unraid, btrfs, nvme, raid, storage, data-loss, troubleshooting]
ogImage: /og/when-smart-says-healthy-but-your-raid-is-corrupting-data.png
banner: /banners/when-smart-says-healthy-but-your-raid-is-corrupting-data.png
---

Every storage guide tells you the same thing: trust SMART, check the event
log, and believe your filesystem. My hardware disagreed. In September 2026 a
btrfs RAID1 pool — two mirrored enterprise NVMe drives that said **"healthy"**
in every tool I could run — was quietly feeding my Windows 11 VM all-zero
bytes. Not visibly failing. Silently corrupting.

This is the full story: how the corruption surfaced, the checksum that gave
it away, and why the answer was "replace both drives, don't trust SMART".

## Why this matters

A corrupting disk is the worst kind of storage failure because it's the
easiest to miss:

- **SMART looked perfect.** Zero media errors, ~100% spare, on drives rated
  for heavy enterprise write loads.
- **The pool had redundancy.** btrfs RAID1 mirrored every block across two
  drives. Redundancy means nothing when *both* members lie the same way.
- **The failure was silent.** No red warning in the Unraid array status, no
  failing drive, no hardware event — just VM reads slowly returning garbage
  until a backup restore became the only option.

If your data only gets corrupted when nothing looks wrong, "backup" is not
paranoia — it's the entire ballgame. This incident is why a testable,
verified restore beats any array status screen.

## The setup

- **unRaid 7.x** on an Intel i9-13900K, with a Windows 11 VM as the primary
  workstation (GPU passed through).
- **Cache pool:** two **Samsung PM9A3 3.84 TB** NVMe drives in **btrfs RAID1**.
  Both from the **same production batch** (same controller/firmware
  revision, `GDC7702Q`).
- The Windows VM's virtual disks (`vdisk1.img`, `vdisk2.img`) lived on that
  pool, in the `domains/` share — plus **Docker's data root**.
- The VM's vdisks were **not** `NOCOW` — so every read was validated against
  a btrfs checksum. That setting ended up being the reason I caught it at all.

## The symptom

I started noticing cache reads were crawling, and host commands were stalling:
`cat`, reading `/proc/loadavg`, even `docker image ls` were timing out. The
corrupt NVMe was being hammered at **45–75 MB/s of reads**, and every read
saturating the drive stalled the whole host's I/O. A `docker system prune`
that should have finished in seconds just hung.

Then the real problem surfaced: the Windows VM began throwing read errors and
data that came back was **wrong** — files that were full of zero bytes,
checksum failures in the guest, and ultimately an unbootable primary VM.

## The forensic: `csum 0x8941f998`

On btrfs, when a read fails verification the kernel logs a checksum mismatch
for the affected extent. The same value kept recurring:

```text
btrfs: checksum verify failed on <device> wanted 0x8941f998 found <other>
```

That specific value was the first real clue. **`0x8941f998` is the CRC32C of
a block of zeros.** It has to be — it came up every time, across unrelated
files and inodes. What was happening wasn't random bit rot; the drive was
returning **all-zero blocks**, consistently, and those zero-filled reads were
exactly what btrfs was failing to verify:

- Check the value: `crc32c` of a zero-filled extent matches `0x8941f998`.
- It's the same value again and again → reads were **deterministically**
  producing empty data, not occasionally flipping bits.

Two VM vdisks were affected (`vdisk1.img` inode 2358574, `vdisk2.img` inode
2362817), which fit the picture: a storage layer was returning zeros instead
of the data it was asked to read.

## The tell: self-heal "fixes" that never stuck

btrfs RAID1 is supposed to be self-healing: read a bad block on one member,
reconstruct it from the mirror, and rewrite the good data back. But as I
scrubbed and re-read the same (still all-zero) data, it became clear the
**rewrites were not sticking**. Each rebuild "succeeded" and the very next
read of the same extent produced zeros again.

That's the critical distinction:

- A drive that only **fails to read** is a read problem — self-heal should
  recover it from the mirror.
- **A drive that also accepts and silently stores garbage** is a *write* or
  *controller* problem — the mirror can't save you, because both paths agree
  on the wrong answer.

When self-heal rewrites keep not sticking, you're no longer in "one bad
sector" territory. You're in "the device is lying about writes" territory,
and RAID redundancy won't help.

## Why both drives had to go

The data pointed at a **hardware defect in the same-batch drives**, not a
wear or one-off event:

- SMART was clean (0 media errors, ~100% spare, and `nvme0` had written
  roughly 586 TiB — heavy, but on a drive rated for enterprise workloads).
- The two drives were **same-batch, same controller/firmware** (`GDC7702Q`).
- Corruption hit **both** RAID1 members in correlated fashion — the whole
  point of mirroring (survive one drive dying) failed because both were dying
  the same way, in lockstep.

With a correlated, batch-level defect, keeping one "healthy-looking" drive as
the surviving member is a false economy. **I restored the Windows VM from
backup and replaced both drives.**

## What I did in parallel: move the data off that pool

Before the drives were replaced, anything still worth reading had to come off
the failing pool — and it had to be **verified**, not assumed:

- **Docker's data root** moved off the cache: `docker` was relocated to
  `/mnt/user/docker` (on `disk1`, overlay2). The whole tree was verified by
  matching **path, size, and mtime** for all **3,997,569 files** against a
  byte-comparison.
- The cache's `isos/`, `system/`, and `swapfile` moved to `disk1`; the
  `isos/` set (~13 GB) was checked with `diff -rq` → **EXIT=0**, no
  differences.
- Everything moved was compared against the source **before** the cache copy
  was deleted — never delete a copy you haven't verified.

The read-side corruption (all-zero blocks) and the write-side corruption
(self-heal not sticking) meant I trusted nothing from that pool without a
mirror, a checksum, or a fresh backup to compare against.

## What I'd do differently

1. **Test-restore the VM backup before needing it.** I'd verified backups
   existed, but a corruption incident is not the time to first learn your
   restore procedure. A scheduled test-restore catches both backup failure
   *and* silent storage corruption.
2. **Treat same-batch drives as one drive.** Both PM9A3s came from the same
   batch with the same firmware. For a married cache pool (or any RAID1)
   that's a correlated-failure risk — prefer drives of different production
   batches or at least hammer-test the pair before trusting a mirror.
3. **Detect, don't just hope.** btrfs checksums are what surfaced this
   through the noise. The `NOCOW`-less vdisk config meant the filesystem was
   validating every read; a pool of checksummed data is the difference
   between "caught it and restored" and "shipped corrupted files for months".
4. **Don't trust SMART for flash.** For a healthy-looking NVMe that still
   corrupts, the event count says nothing — the firmware-level defect can be
   invisible to every SMART attribute.

## The result

One Windows VM restored from backup, both confirmed-failing drives replaced,
and Docker's data root safely off the pool. The cost was a few days of noise
and a rescue effort — but it was contained because the corruption was caught
by checksums, not wallowed in for weeks.

The lesson that sticks: **with storage, "redundant" is only as good as your
least-trustworthy member.** Two disks that fail together are not a mirror —
they're a single point of failure wearing two serial numbers. Verify your
restores, checksum your data, and when a drive's *rewards* of zeros keep
reappearing, replace the whole set.

---