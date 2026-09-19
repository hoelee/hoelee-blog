---
title: "Migrating a CodeIgniter 4 App From IIS to OpenLiteSpeed"
description: "I moved a 17,000-line CodeIgniter 4 app from Windows IIS to OpenLiteSpeed on CyberPanel. Two fatal errors appeared that IIS had been hiding behind SSO."
pubDate: 2026-09-20
category: engineering
tags: [codeigniter, php, openspeedway, cyberpanel, iis, migration, litespeed, linux]
ogImage: /og/migrating-codeigniter-iis-to-openlitespeed.png
banner: /banners/migrating-codeigniter-iis-to-openlitespeed.png
draft: true
---

I maintain a numerology report generator: a CodeIgniter 4 application that takes a birth date and a name, runs them through a numerology engine, and renders a 19-page A4 report. It had run on Windows Server with IIS for years. In September 2026 I moved it to OpenLiteSpeed on CyberPanel, on Linux, on a different domain.

The migration itself was unremarkable — copy the files, point the docroot at `public/`, install dependencies. What made it worth writing about is that **the first unauthenticated request to the new host fatally crashed on two routes that had been working fine on IIS for years.**

Both bugs were real. Both were present on IIS the whole time. Neither was visible, because IIS had an authentik SSO gate in front of the exact routes that were broken.

## Why this matters

If you run a self-hosted app behind an authentication gateway, your auth layer is doing more than protecting data — it is also **hiding your bugs**. Anything that only breaks for unauthenticated users never runs unauthenticated, so it never fails. The failure surfaces at the worst possible moment: when you migrate, remove the gate, or expose the route to the public internet.

In my case the app had been reporting "healthy" for as long as I'd owned it. The moment I pointed a new domain at it, two routes returned HTTP 500. Nothing had changed in the code. The only thing that changed was that the gate was gone.

The fix for both took about twenty minutes. Finding them took two hours, because the actual error messages were hidden behind CodeIgniter's CLI error renderer.

## The setup

The app is a fairly ordinary CI4 project with an unusual architecture detail: the report engine is not a library, it is a **set of HTTP endpoints on the same host**. The controllers generate a request, `curl` it back to `/api/single` on their own domain, and the engine returns JSON with the computed numbers. The controller then renders that into the printable report view.

That self-call design is what made `CONST_IIS_INTERNAL_BASE` necessary on IIS. Let me come back to it — it turns out to be the interesting part.

| | Before | After |
|---|---|---|
| OS | Windows Server | Ubuntu (CyberPanel) |
| Web server | IIS | OpenLiteSpeed 1.9.0 |
| PHP | 8.4 (Windows build) | 8.4.25 (lsphp84) |
| Docroot | `C:\inetpub\calc.hoelee.com` | `/home/<domain>/public_html/public` |
| Auth gate | authentik SSO on `/lifecode`, `/api/*` | none |

## Step 1: Point the docroot at `public/`, not the project root

CI4 ships with a two-folder layout. `app/`, `vendor/`, `writable/` and `.env` live in the project root. Only `public/` is meant to be web-accessible.

CyberPanel creates the document root as `public_html`. My first instinct was to extract the whole project into `public_html` and leave the docroot alone.

**That would have exposed `app/`, `vendor/`, the `.env` file, and `writable/` session data over HTTP.** The `.env` in this project contains a webhook credential. Anyone who guessed `/../.env` — or just fetched `/.env`, since the file sits directly under a served directory — gets it.

The correct layout is to extract into `public_html` and then repoint the vhost docroot one level deeper, at `public_html/public`:

```bash
# extract the project so that app/, vendor/ and .env sit UNDER public_html
cd /home/<domain>/public_html
tar -xzf /tmp/deploy.tar.gz

# the docroot must be public_html/public, NOT public_html
sudo sed -i 's#/home/<domain>/public_html\$#/home/<domain>/public_html/public#' \
  /usr/local/lsws/conf/vhosts/<domain>/vhost.conf

sudo /usr/local/lsws/bin/lshttpd -t
sudo systemctl restart lsws
```

This is the single most important step in the migration, and it is the one most guides skip. If you do nothing else, do this.

## Step 2: The two fatals IIS was hiding

### Fatal 1 — `env()` called too early

The first 500 had no body at all. That is unusual — CI4 normally renders something. An empty 500 usually means PHP died before the framework's error handler was installed.

CI4's bootstrap loads `app/Config/Constants.php` very early in `Boot::bootWeb()`, via `Boot::loadConstants()`. That happens **before** the `Common.php` helper file is loaded, which is where `env()` is defined.

So this line:

```php
// app/Config/Constants.php  — BROKEN
define('CONST_fullBase', env('hoelee.fullBase'));
```

fails with:

```
Fatal error: Uncaught Error: Call to undefined function env()
in app/Config/Constants.php:96
```

The rule is absolute: **`Constants.php` may only contain plain constants.** No `env()`, no `getenv()`, no config helper. If you need environment-dependent values there, define them further along the bootstrap — or make the constant a fallback and read the real value later.

That is exactly what I did. `CONST_fullBase` became a plain string, and the helper that consumes it checks the framework's own `app.baseURL` (which *is* `.env`-driven) first:

```php
// app/Helpers/hoelee_helper.php
function getFullBase(bool $selfCall = false): string
{
    // the .env-driven baseURL wins; CONST_fullBase is only a fallback
    if ($selfCall && defined('CONST_IIS_INTERNAL_BASE') && CONST_IIS_INTERNAL_BASE) {
        return rtrim(CONST_IIS_INTERNAL_BASE, '/');
    }
    $appBase = config('App')->baseURL;
    if ($appBase) return rtrim($appBase, '/');
    if (defined('CONST_fullBase') && CONST_fullBase) return rtrim(CONST_fullBase, '/');
    return '';
}
```

**This one was my own doing.** I had introduced it during a secrets-cleanup refactor in the same week — I moved a hardcoded URL into `.env` and called `env()` in `Constants.php` to read it. It worked on my machine because the local `.env` was being read through a different path. It never worked on a clean boot. I caught it within an hour *only because* I deployed and tested; a code review would plausibly have waved it through.

### Fatal 2 — `parent::__construct()` in a CI4 controller

The second failure was on `/lifecode`, and this one is a genuine pre-existing bug in the application — not something I introduced.

The error, once I got past the CLI renderer, was:

```
Error: Cannot call constructor
```

CI4's base `CodeIgniter\Controller` class **has no constructor**. It implements `initController()`, which the framework calls with the request, response, and logger objects. The standard pattern is:

```php
// correct CI4 pattern
public function initController(
    RequestInterface $request,
    ResponseInterface $response,
    LoggerInterface $logger
) {
    parent::initController($request, $response, $logger);
    // your setup here
}
```

But `Lifecode.php` and `ApiEn.php` declared a classic constructor and called `parent::__construct()`:

```php
// BROKEN — CodeIgniter\Controller has no __construct()
public function __construct()
{
    parent::__construct();
    // ...
}
```

`parent::__construct()` on a parent class that does not define `__construct()` is a fatal in PHP 8. Converting both controllers to `initController()` fixed it — and required adding the three `use` statements for the interface types in the new signature.

I checked whether the base class *really* had no constructor rather than trusting the error message:

```bash
grep -n 'function __construct\|function initController' \
  vendor/codeigniter4/framework/system/Controller.php
```

Only `initController()` came back. Worth doing — "Cannot call constructor" also fires when a parent *has* a constructor that errors internally, and you want to know which case you are in before you rewrite the signature.

## Why neither bug showed up on IIS

This is the part that changed how I think about the deployment.

On the IIS host, `/lifecode` and `/api/*` sat behind authentik SSO. An unauthenticated request to either returned **HTTP 302 to `auth.hoelee.com`** — it never reached the controller at all. The broken constructor was never executed. The route had presumably been broken since it was written, and it had never once been asked to serve a request.

I confirmed this by comparing the two hosts directly:

```bash
curl -sI https://calc.hoelee.com/lifecode | head -1
# HTTP/2 302   <- authentik redirect; controller never runs

curl -sI http://<new-host>/lifecode | head -1
# HTTP/1.1 500  <- no gate; controller runs and fatals
```

The 302 is why the bug survived. The app looked healthy because the unhealthy parts were unreachable.

**The lesson, stated plainly: an auth gate in front of a route means that route has no working test coverage for its own code.** If you migrate or remove the gate, budget time to hit every previously-gated route unauthenticated before you call the migration done. On a small app that is a ten-line `curl` loop. Here it would have found both bugs in seconds instead of two hours:

```bash
for p in / /read/single /read/partner /lifecode /api/date /api/single; do
  printf '%-16s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' https://<host>$p)"
done
```

## Step 3: The self-call that stops being a loopback

Now the interesting architectural consequence.

The report engine is reached by the controller `curl`-ing its own host. On IIS, `CONST_IIS_INTERNAL_BASE` pointed that call at `http://localhost:7296` — the loopback interface — so the request never left the machine and never touched TLS or DNS.

On LiteSpeed that constant is deliberately left **undefined**, so `getFullBase()` falls through to `app.baseURL`. Which means every report generation now makes a **real outbound HTTPS request to the app's own public URL** and comes back in through Cloudflare.

Which raises the obvious question: does that work at all?

The answer is yes, but it is worth testing explicitly, because the failure mode is confusing. Here is the exact test — run it **on the server**, not from your laptop:

```bash
curl -s -o /dev/null -w 'HTTPS self-call: %{http_code}\n' \
  -X POST 'https://<domain>/api/single' -d 'nameCn=test&dob=1990-01-01'
```

Two things to watch for:

- **Run it from the server.** From my Windows machine the same URL returned 404 and 500 — an artefact of DNS resolution and Cloudflare bot protection on my caller, not a server problem. Testing from the wrong host produces confident, wrong conclusions.
- **Watch the JSON, not just the status code.** A 200 with a truncated body is worse than a clean failure. I checked the response was parseable before trusting it.

There is a real trade-off hiding here, and I have not fully resolved it: a public-URL self-call means report generation depends on Cloudflare being up, costs a TLS handshake per report, and occupies two PHP workers for the duration. On LiteSpeed with a small worker pool, a burst of concurrent reports could deadlock — each request waiting on another request that has no free worker. For the current traffic level it is fine. Before this scales, the self-call should move to an internal path that bypasses the CDN.

## Step 4: Verify the actual output, not the status code

A 200 on `/` proves the landing page renders. It does not prove the report engine works, and the engine is the entire product. So the last step was generating a real report end to end:

```bash
curl -s -X POST 'https://<domain>/read/single' \
  -d 'nameCn=test&dob=1990-01-01&gender=m' \
  -o report.html -w 'HTTP:%{http_code} bytes:%{size_download}\n'
```

The result: **HTTP 200, 99,189 bytes, 19 A4 pages.** I ran it again with Chinese-character input to exercise the UTF-8 path through the engine — HTTP 200, 99,205 bytes, 19 pages, name rendering correctly, zero PHP warnings in the output.

Byte-comparable page counts between the old and new host is the check that matters. It proves the fonts, the DPI, and the pagination logic all survived the move.

A side note on the UTF-8 test: my first attempt at it returned a 500 and I nearly went bug-hunting. The cause was my own shell — the Chinese characters were being mangled by the terminal encoding on the way into `curl`, so the app received invalid bytes. Running the same request from a script on the server, where the encoding is under my control, returned 200. **Before you debug an encoding failure, confirm the bytes actually arriving at the server are the bytes you meant to send.**

## What I'd do differently

**Test unauthenticated routes before migrating, not after.** The whole two-hour debugging session was avoidable with a `curl` loop over the route list. I now treat "list every route, hit it unauthenticated, record the status" as step zero of any migration.

**Do not call `env()` in `Constants.php`.** I have left a comment in the file itself saying so, because the next person — probably me in six months — will be tempted.

**Check the framework version's project-space config before the move.** The same week, I upgraded CI4 from 4.6.3 to 4.7.4, and it fataled twice on properties the upgrade guide did not mention: `Config\App::$permittedURIChars`, required by the 4.7 Router, and `Config\Format::$jsonEncodeDepth`, required by the JSONFormatter — the second of which broke the engine's JSON self-call specifically. Composer updates `vendor/` but never merges `app/Config/*.php`, because those are project-space files. I ended up merging new properties into 14 config files. That is a separate post, but the migration lesson is the same shape: **the framework tells you what changed in `vendor/`; nothing tells you what changed in `app/`.**

**Confirm the docroot before anything else.** If I had extracted into `public_html` and stopped, the app would have worked — and quietly served `.env` over HTTP. A migration that works is not the same as a migration that is safe.

## The result

One evening. Six routes verified 200, byte-comparable report output on both Chinese and ASCII input, zero PHP warnings, and two long-standing latent bugs removed from the codebase that IIS had been concealing behind an auth gate.

The app is now running on OpenLiteSpeed with a properly separated docroot, on a host I can automate, with the credential in `.env` rather than a constant.

---

**Want this done for your own application?** I migrate PHP applications between IIS, Apache, nginx and LiteSpeed — including the awkward parts: self-calling architectures, SSO gates that hide bugs, and framework upgrades that touch project-space config.

[WhatsApp +60 12-797 2969](https://wa.me/60127972969) · [me@hoelee.com](mailto:me@hoelee.com?subject=CodeIgniter%20migration) · [hoelee.com](https://hoelee.com)
