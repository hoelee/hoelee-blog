---
title: "Does Re-encoding to HEVC Actually Shrink Your Files? I Measured It."
description: "A measured comparison of HEVC encoders on real files: NVENC at cq27 made two of three files bigger, software x265 landed 10–22% smaller at matched quality, and one 1080p source shrank 49% while another shrank 17%."
pubDate: 2026-10-08
category: tutorials
tags: [ffmpeg, hevc, x265, nvenc, video]
ogImage: /og/does-hevc-actually-shrink-your-files.png
banner: /banners/does-hevc-actually-shrink-your-files.png
draft: false
---

## The assumption worth testing

"Convert it to HEVC, the files get smaller." It is repeated often enough
that nobody measures it. I had a reason to: a library of 582 course videos
where re-encoding had made files **bigger** in 50 of 54 cases, with the
average output at 111% of the original.

So I measured. Real files, one variable at a time, quality checked against
the source rather than assumed.

The short version:

- Re-encoding a **H.264** source to HEVC at matched quality shrank files by
**33–66%** — but the spread is huge and depends on the source, not just its
bitrate.
- A common "good quality" hardware setting (`hevc_nvenc` at cq27) made **two
of three** test files *larger* than the source.
- At matched quality, **software x265 is 10–22% smaller than NVENC**. Hardware
encoding buys time, not size.
- Re-encoding an already-efficient source (VP9/AV1 from YouTube) buys
nothing. It grows.

## Method: measure at equal quality, or don't bother

Comparing "output bitrate" alone is meaningless — any encoder can hit a low
bitrate by throwing quality away. The measurement has to hold quality fixed.

I encode a 60-second window of each source at several settings, and for each
output:

1. measure the output's **video bitrate** as a percentage of the source's
video bitrate (not the file size — audio is excluded so the two are
comparable), and 2. measure **SSIM against the source**, frame by frame,
downscaled to 480×270 for a stable metric, reporting min and mean.

One prerequisite: the harness must be self-consistent. Comparing a file with
*itself* through the same code path must return SSIM 1.0000. When mine did not
— it returned 0.87 on a file compared with itself, because one side was
decoded from a mid-file seek on an open-GOP source — I could have "measured"
anything and believed it.

```bash
# self-test: this must print 1.000000, or your comparison is lying to you
ffmpeg -i any.mp4 -f rawvideo -pix_fmt yuv420p a.yuv
ffmpeg -i any.mp4 -f rawvideo -pix_fmt yuv420p b.yuv
ffmpeg -i a.yuv -i b.yuv -lavfi ssim -f null -
```

## Results

Three real sources from the library I was working on, all 25–30 fps H.264,
video bitrate as a percentage of the source's video bitrate:

| Setting | 1080p music (2720 kbps, bpp 0.0437) | 720p (1208 kbps, bpp 0.0437) | 1080×1920 vertical (4490 kbps, bpp 0.0722) |
|---|---|---|---|
| `hevc_nvenc` cq27 | 72.4% (min SSIM 0.9963) | **115.2%** (0.9935) | **119.3%** (0.9930) |
| `hevc_nvenc` cq30 | 51.0% (0.9945) | 82.6% (0.9907) | 83.8% (0.9901) |
| `hevc_nvenc` cq31 | 43.0% (0.9941) | 72.9% (0.9894) | 74.3% (0.9890) |
| `hevc_nvenc` cq30 + AQ/lookahead | 55.8% (0.9958) | 88.1% (0.9914) | 84.4% (0.9935) |
| `libx265` crf26 | **33.7%** (0.9927) | **56.7%** (0.9879) | **67.0%** (0.9913) |
| `libx265` crf28 | 26.4% (0.9910) | 45.0% (0.9852) | 53.2% (0.9888) |

Four things fall out of that table.

**1. The famous default is the wrong default.** cq27 is where a lot of the
internet lands when it says "HEVC, high quality" — and on two of three files
it produced a *bigger* video stream than the source it was replacing. That
is not an argument that HEVC is worse than H.264. It is an argument that a
fixed quality knob calibrated on your own test clip means nothing on someone
else's encode.

**2. The shrink depends on the source's efficiency, not its bitrate.** Samples
1 and 2 have identical bpp (bits per pixel per second) — 0.0437 — and one
shrank 49% where the other shrank 17%. The 720p file was already a decent
encode; the 1080p one was a fat one. Same bpp, different headroom. bpp is
still the cheapest first filter (it told me which *files* to re-encode), but
it does not predict the ratio.

**3. Software x265 beats NVENC on size, at equal quality.** Compare the rows
at similar SSIM: cq31 vs crf26 (min SSIM 0.9894 vs 0.9927 on the 720p file)
— 72.9% vs 56.7%. That is a 22% smaller file at a *higher* measured quality.
Across the set, analysis gives roughly **10–22%** extra saving. NVENC is not
worse at encoding; it is optimized for throughput. If your constraint is
disk, spend CPU; if it is time, spend GPU.

**4. Audio becomes the floor.** Sample 1's video stream dropped to 33.7% of
the source's video bitrate — but the *file* only reached 53.1% of the
original size on the full-length test, because after that drop the AAC audio
(matched to the source's audio bitrate, as iOS requires AAC in MP4) was
about 43% of the output's total bitrate. Once the video is this compressed,
the audio track is the next lever — and it is a much smaller one.

## What this means for VP9/AV1 sources

Everything above is about **H.264** sources. The modern YouTube formats are
a different story, and I measured that too: 14 sampled AVC1 sources had a
median bpp of 0.053 (the "compatibility ladder" YouTube serves to devices
that cannot do VP9/AV1 is generous), while the VP9/AV1 renditions of the
same material sit far lower. Re-encodable headroom: plenty on H.264, none on
VP9/AV1.

On a library of YouTube-sourced VP9/AV1 files, re-encoding with a hardware
encoder at cq27 produced files at **105–112%** of the originals — measurably
worse than leaving them alone. The correct action there is `-c copy`: keep
the video stream bit-identical and re-encode only the audio container (MP3
in MP4 is not playable on iOS; AAC is).

## The decision rules I actually use now

1. **Classify by bpp before encoding anything.** Bits per pixel per second
(`video_bitrate / (width × height × fps)`). It is one ffprobe call and it
separates "there is headroom here" from "leave it alone" better than
resolution or filesize does. 2. **Never re-encode a source that is already
efficient.** Copy the video stream, fix the audio if it needs it, and move
on. A re-encode cannot create headroom that is not there. 3. **Set quality,
not bitrate — then verify against the source.** A metric compared frame by
frame, with a self-test proving your harness works. 4. **Choose the encoder
by your bottleneck.** Disk → x265 (10–22% smaller at equal quality). Time →
NVENC. 5. **Cap the output.** Whatever you do, assert the result is not
bigger than the source. That single assertion would have caught the entire
111% problem before it touched 54 files. 6. **Remember the audio.** After
aggressive video compression, the audio track can be the largest remaining
component of the file.

## The measured outcome

On the 582-file library, with the tiering above and the read-back
verification I described elsewhere:

- **copy tier** (efficient sources, video bit-identical): ~100% of the
original — by design, quality preserved exactly.
- **mid tier** (NVENC, cq31): landed around **72%**.
- **fat tier** (x265, crf26): landed **33–44%**, median **39%**.

That is the honest answer to "does HEVC shrink my files": it depends on what
you are re-encoding, and the only way to know your number is to measure it
on your own files with quality held fixed.
