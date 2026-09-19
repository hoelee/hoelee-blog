---
title: "Upgrading CodeIgniter 4.6 to 4.7: The Breaking Changes the Guide Misses"
description: "The official CodeIgniter 4.7 upgrade guide lists eight breaking changes. The two that actually fataled my app weren't in it — and both are the same class of problem."
pubDate: 2026-09-20
category: notes
tags: [codeigniter, php, upgrade, composer, breaking-changes, config, framework]
ogImage: /og/upgrading-codeigniter-46-to-47.png
banner: /banners/upgrading-codeigniter-46-to-47.png
draft: true
---

I upgraded a CodeIgniter 4 app from 4.6.3 to 4.7.4. I read the upgrade guide, checked every documented breaking change against the codebase, and confirmed none of them applied. Then I ran the app and it fataled twice.

Both fatal errors were the same kind of problem, and that kind of problem is **not mentioned anywhere in the upgrade guide**. This is a short post about what actually breaks and why the guide can't warn you.

## Why this matters

Composer has a scope boundary that is easy to forget. `composer update` writes to `vendor/` — the **system scope**, the framework's own files, which it owns and can replace freely.

Your `app/Config/*.php` files are **project scope**. They are yours. Composer will never touch them, and the upgrade guide describes them as "you may want to merge these changes" rather than "this will break".

But when 4.7's framework code reads a property that your 4.6-era config class does not define, you get a fatal — not a deprecation, not a warning. The guide cannot enumerate this, because the set of properties is the intersection of *what the new framework reads* and *what your config file happens to contain*, and it has no visibility into the second half.

If you are upgrading a CI4 app more than a minor version behind, budget for this. It took me about an hour and 14 config files.

## What I checked first

The documented breaking changes in 4.7.0, and whether each applied:

| Documented change | Affects this app? |
|---|---|
| `Model::insertBatch()` / `updateBatch()` return values | No — no Models used |
| Entity casting changes | No — no Entities |
| Validation rule changes (`regex_match`, `differs`) | No |
| Encryption handler defaults | No |
| Uploaded-file / image validation behaviour | No — no uploads |
| `IncomingRequest` internal changes | No |
| Removed `Session` class properties | No — see below |
| `PageCache` constructor signature | No — see below |

Two of those needed a closer look, and both turned out to be **false alarms** worth describing, because they look identical to a real hit if you only grep:

**"Removed `Session` class properties"** — grepping for `session` in my configs lit up immediately. But the properties in question (`sessionDriver`, `sessionCookieName`, and friends) on my `Config\App` are **`Config\App`'s own properties**, which were not removed. The guide refers to properties on the `Session` class. Same word, different class.

**"`PageCache` constructor signature changed"** — I reference `pagecache` — but only as a filter alias in `Config\Filters`. That does not extend or instantiate the class, which is the only thing that breaks. A reference is not a subclass.

Both checks taught me the same thing: **grep finds *mentions*, not *usages*.** Verify the class in the match is the class the guide means, and that you actually extend or call the thing that changed.

## The two fatals that were not in the guide

Both surfaced on a clean boot. Both are properties that 4.7 framework code reads and 4.6-era config files do not define.

### 1. `Config\App::$permittedURIChars`

```
Undefined property: Config\App::$permittedURIChars
```

Required by 4.7's Router, which validates incoming URI characters against this property. Absent from a 4.6-era `App.php`, the Router throws before it routes anything.

```php
// app/Config/App.php — append to the class
/**
 * CI4 4.7 compatibility: allowed characters in a URI.
 * Required by the 4.7 Router.
 */
public string $permittedURIChars = 'a-z 0-9~%.:_\-';
```

### 2. `Config\Format::$jsonEncodeDepth`

```
Undefined property: Config\Format::$jsonEncodeDepth
```

Required by 4.7's `JSONFormatter`. This one broke the app's **report engine**, because the engine's JSON response is decoded with `json_decode()` and the failure surfaced much further downstream as a confusing parse error rather than the real "undefined property" message.

```php
// app/Config/Format.php — append to the class
/**
 * CI4 4.7 compatibility: json_encode() depth limit.
 */
public int $jsonEncodeDepth = 512;
```

That second one is worth dwelling on. The visible error was:

```
Failed to parse JSON string. Malformed UTF-8 characters
```

Which points at encoding. The actual cause was a missing config property. **If a framework error names a symptom rather than a cause, go looking for the real exception in the log before acting on the message you were given** — I lost time chasing UTF-8 that was never broken.

## How to find the rest before they bite you

Both fatal errors were found by *running* the app. Running is the reliable method, but you can get ahead of it by diffing property coverage.

The approach: parse the framework's shipped config defaults from `vendor/`, parse your project's config classes, and list properties defined in the former but missing from the latter. That gives you the whole class of problem at once instead of one fatal per restart.

```python
import re, pathlib

sys_ = pathlib.Path('vendor/codeigniter4/framework/system/Config')
app_ = pathlib.Path('app/Config')

def props(path):
    try:
        src = path.read_text(encoding='utf-8', errors='replace')
    except FileNotFoundError:
        return set()
    # public/protected/private $name = ...
    return set(re.findall(r'(?:public|protected|private)\s+(?:[\w\\\[\]|?]+\s+)?\$(\w+)', src))

# names whose properties 4.7 requires but a stale config may omit
for name in ['App', 'Cache', 'ContentSecurityPolicy', 'CURLRequest', 'DocTypes',
             'Email', 'Encryption', 'Exceptions', 'Format', 'Honeypot',
             'Migrations', 'Paths', 'Routing', 'Toolbar', 'View']:
    missing = props(sys_ / f'{name}.php') - props(app_ / f'{name}.php')
    if missing:
        print(name, '->', sorted(missing))
```

Run it against the **new** `vendor/` after `composer update` and before you boot the app. Anything it prints is a candidate fatal.

In this project it flagged 14 config files. I merged the missing properties into each one, appended in a marked block at the end of the class so existing settings and behaviour were untouched:

```php
    // ----------------------------------------------------------------
    // CI4 4.7 compatibility — properties the 4.7 framework reads.
    // Appended as a block so existing settings above are unchanged.
    // ----------------------------------------------------------------
```

Two config files the framework now ships had no counterpart at all and needed creating rather than merging: `Hostnames.php` and `WorkerMode.php`. Copy those straight from `vendor/codeigniter4/framework/app/Config/`.

## Also worth knowing before you upgrade

**Validate `app.baseURL` properly.** 4.7 throws a `ConfigException` on values 4.6 accepted. `'http://localhost/'` — which had been sitting in my local `.env` for months, working fine — now throws. Production was unaffected because it used a real URL, but any dev environment with a shorthand baseURL will refuse to boot.

**The security case is real.** 4.7.4 alone patched an uploaded-file extension bypass (`is_image` / `mime_in`), a SQL injection in `deleteBatch()`, and a path traversal in `UploadedFile::move()`. None were exploitable in this app — it does no uploads and uses no database — but all three become live the moment those features are added. Upgrading before you need those features is the cheaper order.

**PHP floor is now 8.2.** Check your host before starting, not after.

## What I'd do differently

**Run the app against the new `vendor/` before doing anything else.** `composer update`, then boot it, then fix what breaks. Reading the guide tells you what *might* change; only running tells you what *did*.

**Do the property diff as a matter of course.** It converts a serial debugging session into one report.

**Do the upgrade as its own commit, on its own.** I did, and it made the two fatals trivially bisectable — one `git show` told me exactly which change introduced each. Mixing a framework bump into a feature branch turns a five-minute diagnosis into an archaeology exercise.

**Read the changelog, not just the upgrade guide.** The guide lists what the maintainers judged *likely* to break you. The changelog lists what changed. They are not the same set, and the gap is exactly where these two fatals lived.

## The result

4.6.3 → 4.7.4 on a 17,000-line CodeIgniter app: 14 config files merged, two new config files added, two fatals found and fixed, and every route verified returning 200 — including a real report generation producing 19 A4 pages with byte-comparable output to the pre-upgrade baseline. Zero errors in the application log.

---

**Running an older CodeIgniter app?** I do framework upgrades like this one — CI4 minor bumps, PHP version migrations, and the config-merging work that the upgrade guide assumes you will figure out yourself.

[WhatsApp +60 12-797 2969](https://wa.me/60127972969) · [me@hoelee.com](mailto:me@hoelee.com?subject=CodeIgniter%20upgrade) · [hoelee.com](https://hoelee.com)
