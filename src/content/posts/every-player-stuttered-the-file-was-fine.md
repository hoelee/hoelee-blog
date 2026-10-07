---
title: "Every Player Stuttered on the Same Video. The File Was Blameless."
description: "Same HEVC file, same stutter in VLC, Chrome and an iPad — offline. The container timing was perfect. The pictures were not: NVDEC's legacy AV1 wrapper was returning frames from the wrong timestamps."
pubDate: 2026-10-08
category: devops
tags: [ffmpeg, nvdec, hevc, transcoding, video]
ogImage: /og/every-player-stuttered-the-file-was-fine.png
banner: /banners/every-player-stuttered-the-file-was-fine.png
draft: false
---

## The question I could not answer

A converted video stuttered. Not badly — a hitch every few seconds, then it
carried on. The kind of thing you blame on Wi-Fi.

Except it happened on an iPad Pro M1 playing the file **offline**, in VLC,
and in Chrome on a desktop. Different decoders, different platforms, same
periodic hitch. The original download played perfectly everywhere. So the
network was out, the device was out, and the file was in.

I spent a long time measuring the file, and every measurement said the file
was fine. It was not fine. It was a faithful re-encode of a decoder bug.

## Step 1: measure the container, not the picture

The converted file is HEVC Main 8-bit in MP4 (`hvc1`), 3840×2160, 25 fps,
yuv420p, bt709, average 15.49 Mbps, 232.8 seconds, 5819 frames, `moov`
before `mdat`.

Everything about its timeline is textbook:

```text
frame intervals       5818 of 5818 = exactly 0.040000 s
duplicate PTS         0
negative PTS          0
gaps > 1.5x median    0
edit list (ctts)      5796 entries  (not a flat list)
has_b_frames          2
A/V start offset      0.000 s
B-frame pattern       I B B B P B B B ...  (744 groups, all 3 B-frames)
```

A flat `ctts` — every presentation offset set to zero — is the classic way a
re-encode ends up with PTS sitting in decode order, and it makes players
drop roughly a quarter of the frames. That is what I expected to find. It
was not there.

Full decode, both verbosity levels:

```bash
ffmpeg -v warning -i converted.mp4 -f null -
ffmpeg -v error   -i converted.mp4 -f null -
```

Both exit 0, both print nothing, 174 seconds of wall time for 232 seconds of
video. No corrupt frames, no missing references, no non-monotonic DTS.

The GOP looked different from the source (24 keyframes, a constant 10.0 s,
because `hevc_nvenc` defaults to `-g 250`; the source has 59 keyframes at an
average 3.88 s) and the bitrate was 17% higher than the source — but the
source's own peak was higher than the output's, so neither explains a hitch
every few seconds.

**Everything measurable in the container was correct.** Which is the point
where you have to stop measuring the container.

## Step 2: compare pictures, from two different decoders

If the timing is right and the file still looks wrong, the question becomes
whether the *pictures* are right. I compared the source file decoded two
ways, frame by frame, with SSIM:

```bash
# software decode of the source
ffmpeg -i source.mkv -vf "scale=640:360" -f rawvideo -pix_fmt yuv420p sw.yuv

# the same frames through NVDEC's AV1 path
ffmpeg -c:v av1_cuvid -i source.mkv -vf "scale=640:360" -f rawvideo -pix_fmt yuv420p hw.yuv
```

106 frames out of 5819 disagree — 1.8% — with SSIM as low as **0.330**. Not
uniform noise: the interval histogram peaks at about every 30 frames.

Two control tests made it worse and better at the same time:

- **Deterministic.** Decoding the same source twice through `av1_cuvid`
gives SSIM 1.000000 between the two runs. This is not a race; every
conversion will weld the same bad frames into the output.
- **Not all AV1.** A 1080p AV1 sample decoded identically through both paths
(SSIM 1.000000). A second 4K AV1 stream did not. It is stream-dependent.

Then the decisive comparison — which side does the converted file match?

| Comparison | Mean SSIM | Minimum | Frames below 0.98 |
|---|---|---|---|
| Converted HEVC vs software decode of the source | 0.99091 | **0.330** | **106** |
| Converted HEVC vs NVDEC decode of the source | **0.99742** | 0.991 | **0** |

The converted file agrees with the *wrong* decode, frame for frame. It is
not a bad encode. It is an accurate encode of the wrong pictures.

A single extracted frame shows it plainly: frame 546 through software decode
is a wide shot of a choir; through `av1_cuvid` it is a close-up from a
different moment in the video — and the converted file has the close-up.

## Step 3: the fix is one line

The bug is not the hardware. It is the legacy decoder wrapper. `av1_cuvid`
is an old-style wrapped decoder; the modern hardware path goes through
`hwaccel`:

```bash
# before
-c:v av1_cuvid

# after
-hwaccel cuda -hwaccel_output_format cuda -c:v av1
```

Same stream, same source, 1500 frames compared against the software
reference:

```text
-hwaccel cuda -c:v av1        SSIM 1.000000   (bit-identical, every frame)
vp9_cuvid vs libvpx-vp9       SSIM 0.99991    (0 frames below 0.98 - unaffected)
```

Encoding speed did not change: a 30-second 4K slice in 24.1 s, 1.24×
realtime either way.

To be precise about the scope: this is a bug in the `*_cuvid` wrapper for
**AV1** on this driver/library combination, reproducible on demand. It says
nothing about your GPU's AV1 decoder — the hardware path is clean.

## Step 4: make it impossible to ship again

The uncomfortable part is that my pipeline *had* a verification step. It
checked the duration, the resolution, the codec, the frame rate and the
frame rhythm — all container properties. Every one of them passed on a file
with 106 wrong frames.

So the pipeline is now five steps, and the fourth one is the picture check:

```text
decode -> encode -> verify structure -> verify content -> replace the file
```

The content gate compares the output's frames against a software decode of
the source (both sides decoded sequentially, cropped by timestamp), and uses
the defect's *shape* rather than a single-frame threshold:

- fail if any frame falls below 0.85
- fail if more than 1% of frames fall below 0.95
- fail if the mean falls below 0.98
- ignore near-flat frames (SSIM is meaningless on frames that are almost
entirely black — two nearly-black frames can score 0.25 while being visually
identical)

Those numbers are calibrated against measured data, not intuition. Good
encodes in this library sit at 0 frames of 1500 below 0.95. The defective
files sit at 2.9% of frames below 0.85 with a depressed mean. A perfectly
good 4K60 encode of a dance video once measured min 0.949 — a single frame
below 0.95, at a hard cut — which a single-frame threshold would have
rejected forever.

Scoped to the library: 75 files had AV1 originals in the snapshots, 65 of
them (87%) failed the content gate. All 65 were re-encoded from the pristine
snapshot originals — never from the already-corrupted file — and every one
landed with min SSIM 0.997–0.999.

## What I would do differently

1. **"It decodes without errors" is not a quality check.** Decoding a frame
successfully says nothing about whether it is the *right* frame. The picture
comparison is the check that found it. 2. **Compare against a second
decoder, not against your expectations.** A software decode is free and it
is the reference. If your hardware path disagrees with it, you have found
something worth understanding. 3. **Verify the output against the source,
not the source's metadata.** 4. **Do not assume the modern and legacy
hardware paths are the same code.** `av1_cuvid` and `-hwaccel cuda -c:v av1`
reach the same silicon through different plumbing. A bug in one is not a
verdict on the hardware. 5. **A gate that fails safe is worth more than a
gate that never fails.** My first gate rejected that 4K60 encode. The file
was fine and the gate was wrong — but the failure cost one wasted encode,
not a bad file in the library.

The stutter is gone. Not because the encoder got better, but because the
decoder stopped lying.
