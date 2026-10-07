---
title: "It Reported Success. Nothing Had Changed."
description: "Three ways a network-mounted drive lied to my conversion pipeline: a write that silently stopped at 12.5 MB of 403 MB, a rename that never landed while the metadata said otherwise, and a size check that agreed with a corrupted copy."
pubDate: 2026-10-08
category: devops
tags: [storage, smb, verification, ffmpeg, python]
ogImage: /og/it-reported-success-nothing-had-changed.png
banner: /banners/it-reported-success-nothing-had-changed.png
draft: false
---

## The batch that looked fine

I run a conversion pipeline over a 582-file video library that lives on a
NAS and is mounted as a Windows drive letter through a third-party SMB
client (the kind that presents the share as a normal `Z:\` drive). Small
files, big media files, one writer.

The pipeline does the obvious things: stage the source locally, encode,
verify the output, upload it next to the original, replace the original. It
logged success on every step I had thought to check.

Then I started auditing the *results* instead of the log. Over a set of 30
files the pipeline had reported as done, **one had not changed at all** —
the file on the share was still the original. No error, no warning, no
failed step. The log said `ok`.

That is the failure mode this post is about: not a crash, not a corrupted
file, but a system that reports an outcome it did not achieve. If your
pipeline's success is defined by its own log, you have no idea what is
actually on disk.

## Lie 1: a write that stops early and returns success

The first one is the scariest because everything looks right at the moment
of the call.

```text
FAIL read-back mismatch
  local  = 3b7cd25d1de1  403,448,100 bytes
  remote = 6a7785351031   12,582,912 bytes
```

The upload of a 403 MB output file wrote **12.5 MB** and returned. No
exception, no non-zero exit, no short-write return code. The client's own
error — a timeout toast — appeared **asynchronously, minutes later**, long
after my code had moved on and printed its success line.

This is why a "did the write succeed?" check that trusts the API is worth
nothing on this class of storage. The write call answered a different
question ("did I hand the data to the cache?") than the one you asked ("is
the file on the other side correct?").

The fix is boring and total: hash what you wrote locally, read the file back
from the share, hash that, and compare. On a mismatch, re-upload. Twice, if
needed, with a backoff.

```python
# after uploading dst from src
if hash_file(src) != hash_file(_reread(dst)):
    retry_upload()
```

Note the deliberate cost: this reads the file over the network a second
time. For a 400 MB file that is a few seconds — against a 25-minute encode
it is rounding error. The alternative is a library where some fraction of
files are silently not what you think.

## Lie 2: a rename that does not land, with metadata that says it did

The second one hides behind a filesystem primitive you trust blindly:
`os.replace()` — atomic, same-filesystem, cannot half-happen. Except
"filesystem" here means a network client with its own metadata cache.

The sequence was: upload `show.mp4.new.mp4`, verify the hash, `os.replace()`
it over `show.mp4`, then probe the result to confirm. The probe said HEVC,
the size looked right, the run logged `ok 1085 MB -> 478 MB`.

The file on the share was **the untouched original**: H.264, 921,950,850
bytes. The replace had not been applied; the client served cached attributes
for the path, so `getsize()` and `mtime` happily described a file that no
longer existed.

The only check that survives a lying metadata cache is reading the bytes
back:

```python
os.replace(tmp, dst)                    # claim
if hash_file(dst) != hash_file(local):  # evidence
    raise VerificationError(dst)
```

After I added that step, the same audit that found 1-in-30 failures found
**zero** — and, more importantly, any future silent failure turns into a
loud one, because "the bytes at the destination do not match the bytes I
produced" is not a thing a cache can fake.

## Lie 3: a size check that agrees with a bad copy

The third one is the subtlest, because it fools *verification itself*, not
just the operation.

Staging a source file from the share into local scratch is a copy. The
natural check is "did the right number of bytes arrive?" — so the pipeline
compared byte counts. They matched.

Then, in an unrelated investigation, the same source file failed to decode
("Error splitting the input into NAL units"), and I went looking for a
corrupt file that was not there. The file was fine: 921,950,850 bytes,
healthy header, sixty seconds decoded with zero errors. The *copy* had been
truncated in a way that preserved the length, or the read had silently
returned short and been padded.

Length is not a checksum. A copy is verified when the hash of what you read
matches the hash of what is on the share — which means reading the share
twice, or hashing after the read and comparing against a hash taken on a
different occasion.

## The metric traps that made it worse

While chasing those three, my *quality* checks were lying too, in ways worth
naming because they are not specific to network storage:

- **A decode test passes on wrong pictures.** `ffmpeg -v error -i out.mp4 -f
null -` printed nothing on a file with 106 frames decoded from the wrong
timestamps. "No errors" means "no errors", not "correct".
- **SSIM is meaningless on flat frames.** Two nearly-black frames can score
0.25 while being visually identical. Any threshold that treats a single low
frame as proof of a defect will reject good encodes — and any that ignores
frames wholesale will miss real ones.
- **Seeking into an open-GOP source decodes the wrong pictures.** Comparing a
file against *itself*, with one side decoding from a mid-file seek and the
other sequentially, measured min SSIM 0.25. A false "systematic defect"
produced entirely by my own comparison harness.
- **A stream copy is not a lossless slice.** Cutting 60 seconds out of an
H.264 file with B-frames using `-ss ... -c copy` produced 1270 frames where
1500 were expected. Fine for scrubbing; fatal as a test fixture.
- **Two concurrent runs sharing a scratch directory will overwrite each
other's intermediates.** Mine had fixed filenames for the decoded raw
frames, so two gates running at once compared two different videos and
reported 100% of frames below the threshold. Every temporary path now
carries the process id.

## The discipline

None of this needs cleverness. It needs a rule: **a step is done when you
have independently observed the outcome, not when the tool reported it.**

In practice, for a pipeline that writes to a share:

1. **Read the source twice.** Stage the file, hash it, hash a fresh read of
the share, compare. Length is not evidence. 2. **Hash the upload before you
replace anything.** 3. **Hash the destination after the replace.** Cached
metadata cannot fake bytes. 4. **Verify the content, not just the
container** — compare pictures, not frame rates. 5. **Make every failure
loud.** A gate that fails safe costs one wasted encode; a gate that passes a
bad file costs a corrupted library and your trust in it. 6. **Do not
parallelise the writer.** Three jobs sharing one share and one scratch
directory produced short writes, timeouts and cross-contaminated
comparisons. When I dropped to one writer, the error rate went to zero.

The audit line I care about is not "0 errors". It is:

```text
reported=30  landed=29  not-landed=0  wrong-codec=1  gone=0
```

Every number there was produced by reading the destination, not by trusting
the log.
