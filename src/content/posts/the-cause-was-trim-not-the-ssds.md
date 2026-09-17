---
title: "The Corruption Came Back on Different Drives — the Cause Was TRIM, Not the SSDs"
description: "Two weeks after a btrfs RAID1 pool corrupted on healthy-looking NVMe drives, the same all-zero checksum reappeared on a different drive stack. The culprit was queued TRIM (NCQ) on Seagate IronWolf 110 SSDs — a firmware bug FreeBSD blacklisted but Linux never did. How I caught it and the fix."
pubDate: 2026-09-18
category: devops
tags: [unraid, btrfs, trim, ssd, raid, data-loss, smart, troubleshooting, seagate]
ogImage: /og/the-cause-was-trim-not-the-ssds.png
banner: /banners/the-cause-was-trim-not-the-ssds.png
---

Two weeks ago I published how a btrfs RAID1 pool on two healthy-looking Samsung
PM9A3 NVMe drives silently corrupted a Windows VM — reads returning
**all-zero** blocks that no single bad drive could explain. That investigation
ended with an honest shrug: the drives tested clean, the strongest suspect was
the shared M.2 riser.

Then it happened again. On *different* drives, on a *different* bus. The exact
same checksum fingerprint. This time I found the root cause — and it wasn't
the SSDs.

## Why this matters

If you run Unraid (or any Linux box) with a btrfs RAID1 pool on SATA SSDs and
auto-TRIM enabled, this post is a heads-up: **queued TRIM was silently
destroying both mirrors of my pool, in the same places, simultaneously.** RAID
redundancy gives you zero protection against it. And SMART — which flagged a
drive as *failing* through all of this — had nothing to do with the actual
corruption.

---

## The setup

- **unRaid 7.x** on an Intel i9-13900K.
- **Pool `ssd`**: two **Seagate IronWolf 110 960 GB** SATA SSDs
  (`ZA960NM10001`, serials `HKR02TFK` + `HKR02L9P`) in **btrfs RAID1**,
  mounted at `/mnt/ssd`, holding Docker's data root (`/var/lib/docker`) and
  the Windows 11 VM's virtual disk (`domains/Win11Enterprise/vdisk1.img`).
- The VM's vdisk is **not** `NOCOW`, so btrfs validates every read against a
  checksum — the same setting that caught the previous incident.

Trivia: one of these drives (`sdd`) is the very drive from *["I Was About to
RMA This SSD — the Fault Was a SATA Cable"](/posts/that-dying-ssd-was-just-a-bad-sata-cable/)*
— after the cable swap it formatted clean and joined this pool.

## Step 1 — a SMART "failure" that wasn't

At 02:53 the Unraid notification bell went off:

```
Unraid Ssd disk SMART health [1] — Warning [UNRAID] -
raw read error rate (failing now) is 19665   (sdd = ZA960NM10001_HKR02TFK)
```

"Failing now" is the drive declaring the attribute **worse than its
threshold** — the strongest wording SMART has. But the raw value is a red
herring on these Seagates: on IronWolf 110s, attribute 1's raw field is a
vendor-encoded composite (errors in the high half, an operation counter in the
low half). `19665 = 0x00004CD1` → high half = **0 errors**. The *normalized*
value is what tripped: `093` with a **worst of 088**, below the `090`
threshold, so the drive self-reports `FAILING_NOW` / `IN_THE_PAST` on its
SMART return status. The twin (`sdb`) showed the same shape with a raw of
only `341`.

Every real failure counter was zero: reallocated 0, grown bad block 0,
program/erase fails 0, uncorrectable ECC 0, UDMA CRC 0, SSD life left 99 %,
SMART overall **PASSED**, and a just-completed extended self-test was clean.
This is a documented IronWolf 110 behaviour — the same "Failing" flag at 100 %
lifespan hit Synology users years ago, and it's why the community treats that
model's attribute-1 trip as firmware noise unless the real counters move.

So: false alarm on the *drive*, but the alarm made me go look — and that's
when I found the real damage.

## Step 2 — the checksum that had no right to exist

`btrfs device stats /mnt/ssd`:

```
[/dev/sdd1].corruption_errs  27     [/dev/sdb1].corruption_errs  31
```

All of it confined to one file: **ino 261 = the Windows VM's vdisk**.
`dmesg` showed the same signature I'd spent a week staring at in the NVMe
incident:

```
btrfs: checksum verify failed on logical 1505629372416 mirror 1 wanted 0x8941f998
```

**`0x8941f998` is the CRC32C of 4 KiB of zeros.** The pool was reading back
empty blocks — and crucially, on **both mirrors at the same logical offsets**.
I verified it against my notes from the PM9A3 pool: identical value, identical
"deterministic zeros" behaviour, identical RAID1-defeating correlation.

That match is a fingerprint. Whatever this is, it isn't the drives and it
isn't the M.2 riser — the IronWolf pair lives on **SATA ports**, a
completely different controller path. It's the *layer above* the drives
deciding to erase the same data on both members at once. There is exactly one
mechanism in Linux that does that: **discard / TRIM**.

## Step 3 — the root cause: queued TRIM on a drive Linux never blacklisted

Unraid's pool config had auto-TRIM on, which mounts btrfs with
`discard=async` — the kernel batches frees and sends them to the drive. On
SATA SSDs that means **queued TRIM** (the `DATA SET MANAGEMENT` command
deferred as an NCQ command, `SEND FPDMA QUEUED`).

The IronWolf 110 is *known to be unstable with queued TRIM*. FreeBSD's
kernel has a documented report — [bug 264139](https://bugs.freebsd.org/264139),
*"ata: NCQ_DSM_TRIM trim method for Seagate IronWolf 110 SATA SSD hangs
drives"* — and the fix, merged in 2024, is blunt:
[commit `a6cef617660a`](https://lists.freebsd.org/archives/freebsd-fs/2024-March/003273.html):
"The Seagate IronWolf 110 SATA SSD drive has been reported to be unstable with
NCQ trim enabled."

Meanwhile Linux's own quirk list (`drivers/ata/libata-core.c`) — where the
kernel deliberately downgrades broken drives to non-queued or disabled TRIM —
contains Micron M500/M550/1100, Crucial M500/M550/MX100, Samsung 840/850/860/870
and a few others, but **no Seagate entry at all**. My own `dmesg` proved the
mechanism exists and is selective:

```
ata6.00: Model 'Samsung SSD 840 PRO Series', rev 'DXM06B0Q', applying quirks: noncqtrim zeroaftertrim
```

…applied to the *other* SSD in the box, while the two IronWolf 110s got
no quirk and full queued TRIM.

Why does that corrupt a RAID1? Because btrfs RAID1 stores the *same* free-space
map on both members — it discards the same logical extents on both drives in
the same pass. A TRIM path that invalidates more (or the wrong) LBAs on this
firmware zeroes the **same live blocks on both mirrors at once**. Your mirror
becomes two copies of the same hole: the checksum fails on both, self-heal has
nothing to copy from, and the data is gone.

> The honest caveat: FreeBSD documents *instability/hangs* from the drive
> side, and "queued TRIM erased live data" is the mechanism I infer from that
> plus the fingerprint (zeros on both mirrors, SMART-clean, CRC error counter
> untouched). It fits every observation. The proof is the test — see the
> result below.

## Step 4 — the fix (persistent, one variable at a time)

One change, applied twice — persistent config and live mount:

```bash
# /boot/config/pools/ssd.cfg   (backup: /root/ssd.cfg.bak.20260918-0329)
diskAutotrim="off"                       # was "on"

# apply live without stopping the array or Docker (36 containers stayed up)
mount -o remount,nodiscard /mnt/ssd
findmnt /mnt/ssd   # → rw,noatime,ssd,space_cache=v2   (no more discard=async)
```

Then a full read-write scrub to find out what was actually damaged:

```
scrub started 03:29:53, finished 03:53:07 (23 min)
csum_errors: 18    corrected_errors: 16    uncorrectable_errors: 2
read_errors: 0     verify_errors: 0        super_errors: 0
```

`read/verify/super = 0` is the second half of the fingerprint: the hardware
reads *fine* — nothing is failing, the stored bytes just don't match their
checksums. Of the 18 bad blocks, **16 were bad on one mirror and were healed
from the clean copy. Two uncorrectable entries were one single 4 KiB block
that was bad on both mirrors** — permanent loss, ~45.2 GiB into the VM's
vdisk (`logical 1505629372416`, file offset `48560156672`). I zero-filled
that one block so the VM's reads at least don't error; the original bytes are
unrecoverable either way.

And a wrinkle worth knowing: **`btrfs device stats` counters did not move
during the scrub** even though it found 18 errors — scrub-detected errors and
read-detected errors are tracked separately. You cannot watch only `device
stats`; you have to watch dmesg + scrub output too. (My watchdog checks all
three; the details are at the end.)

## What I'd do differently

1. **Never enable auto-TRIM on a btrfs pool without checking the drive's
   queued-TRIM record.** FreeBSD keeps a "don't TRIM this drive" list for a
   reason. Linux has the same mechanism in `libata-core.c` — an afternoon of
   grep + a `dmesg` check after the first boot beats a restored-from-backup VM.
2. **Keep TRIM on the menu, just not queued.** If you want fstrim on SATA
   SSDs, force non-queued TRIM (`libata.force=…:noncqtrim`) and verify with a
   scrub after the first trim pass. `discard=sync` does **not** help — it
   still uses the queued path on drives that advertise it.
3. **Watch all three corruption signals**, not one: `btrfs device stats`,
   `dmesg | grep 'csum failed'`, and periodic scrubs. Each can move
   independently (see above).
4. **Corroborate before joining pairs.** Same-batch, same-firmware drives are
   a correlated-failure risk; a pair sharing one firmware bug is the
   correlated-failure worst case. The mirror didn't save me either time.
5. **When buying enterprise SATA SSDs**: the drives on Linux's quirk list
   (Micron M500/M550/1100, Crucial M500/M550/MX100, Samsung 840/850/860/870)
   and anything with a documented NCQ-TRIM bug (IronWolf 110) are out.
   Samsung PM893/PM897, Micron 5400 PRO/MAX, Solidigm D3-S4610/S4620,
   WD Ultrastar DC SA620/SA630, and Kingston DC600M all carry PLP plus no
   Linux-quirk entries, and vendors that publish firmware release notes
   (Micron, Solidigm, WD, Kingston) can actually ship you a fix. NVMe
   sidesteps the SATA queued-TRIM class entirely — my PM9A3s aren't in the
   NVMe quirk table either.

## The result

One variable changed (auto-TRIM off), everything else identical. Immediately
after:

- scrub #2 (04:10–04:39): **`corrected_errors: 0`** — the 16 heal-blocks
  stayed healed, nothing new appeared during the full re-read.
- `corruption_errs` flat at sdd1=27 / sdb1=31 for hours of normal Docker +
  VM-less operation (counters had been climbing daily before).
- No new `csum failed` lines in dmesg.

The confirmation window runs a few days: Win11 VM back on (it produces the
write pattern that reproduced this), daily checks against a baseline file,
and a re-scrub on 2026-09-22. If corruption reappears with TRIM off, the next
suspect isn't the drives — it's the RAM (no ECC on this box), and memtest is
the test. If it stays quiet, the IronWolf 110 queued-TRIM firmware bug is
confirmed as the cause of both this incident and — I'd bet — a good share of
the "healthy drives corrupting my RAID" reports the forums keep collecting.

A "failing" SMART warning, a drive with zero errors, and corruption on
both mirrors of a fresh pool — every sign pointed somewhere else, and the
actual culprit was a storage feature most of us enable without a second
thought.

---

*Part of my storage-failure series: [the NVMe incident](/posts/when-smart-says-healthy-but-your-raid-is-corrupting-data/) and the [SATA cable wake-up call](/posts/that-dying-ssd-was-just-a-bad-sata-cable/).*