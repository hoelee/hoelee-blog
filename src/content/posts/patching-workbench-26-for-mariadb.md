---
title: "When Your Database Client Lies to You: Patching Workbench 26 for MariaDB"
description: "MySQL Workbench 26.7.0 connects to MySQL 8.4 but fails on MariaDB with a useless TypeError. Three patches, and why version numbers stopped meaning what you think."
pubDate: 2026-09-19
category: devops
tags: [mysql, mariadb, workbench, debugging, electron, mysql-sh, cyberpanel, self-hosting]
ogImage: /og/patching-workbench-26-for-mariadb.png
banner: /banners/patching-workbench-26-for-mariadb.png
draft: false
---

I run four database servers from one Windows machine: two MySQL 8.4 instances, one local install, and a MariaDB 10.11 box behind CyberPanel on my LAN. Three of them opened fine in the shiny new MySQL Workbench 26.7.0. One didn't.

The error it gave me was this:

```
TypeError: DbModuleSession.on_session_message() missing 1 required positional argument: 'result'
```

That message contains no information about databases, networking, credentials, or MariaDB. It's a Python argument-count error inside the client. And it was the single most misleading error message I've chased this year — because it wasn't the bug. It was **the error reporter crashing while trying to report the bug**.

This post is the trail from that message to three patches in Oracle's own shipping code, and the underlying design assumption that causes all three.

## Why this matters

If you keep more than one database engine around — MySQL here, MariaDB there — you'll hit this class of failure eventually, and the error text will actively mislead you. Three things in this post are worth knowing even if you never open Workbench:

1. **A garbage error message is itself a finding.** When a tool reports something structurally impossible, suspect its error path before its logic.
2. **`major >= 8` is not a reliable "is this MySQL?" test.** MariaDB reports version 10.x and 11.x. A lot of software gets this wrong.
3. **The version-number collision is systemic**, not a one-off bug in one app — it's why the same fix had to be applied three times in three files.

## The setup

The four connections, and which one broke:

| Server | Engine | Version | Workbench 26.7.0 |
|---|---|---|---|
| DSM NAS | MySQL | 8.4 | works |
| unRaid | MySQL | 8.4 | works |
| localhost (since removed) | MySQL | 8.4.6 | works |
| CyberPanel VM | **MariaDB** | **10.11.19** | **fails** |

The pattern is obvious in hindsight: everything MySQL 8.4 works, the one MariaDB doesn't. But "it's the odd one out" is not a diagnosis, and I didn't trust it yet.

## What I tried first, and why it was wrong

**Theory 1: TLS.** The connection profile had `useSSL = 1` with empty `sslCA`, `sslCert`, `sslKey`. For MySQL 8.x that's fine — it auto-generates certificates. For MariaDB, maybe not.

This one turned out to be **half right**, and I'll come back to it, because it's a genuine second fault that produces a *different* error.

**Theory 2: credentials or grants.** Also wrong, and I could disprove it cheaply. Workbench 26 ships its own MySQL Shell binary. Running that binary by hand against the same host is a direct test of everything except Workbench's own code:

```bash
MSH="/c/Program Files/MySQL/MySQL Workbench/resources/app/shell/bin/mysqlsh.exe"
"$MSH" --sql --uri "admin:PASSWORD@192.168.1.124:3306" \
  -e "select current_user(), version();"
```

```
current_user()   version()
admin@%          10.11.19-MariaDB-ubu2404
```

It connects. Same binary, same host, same credentials — works from the command line, fails from the GUI. That narrows it decisively: **the network, server, grants, and password are all fine.** Whatever is broken lives in Workbench's own session-handling code.

If you take one technique from this post, take that one. Before debugging a client, drive the client's own underlying tool directly to split "the thing is broken" from "this UI is broken."

## Getting the real error out of it

Workbench 26 stores its logs somewhere new. The useful ones:

```
%APPDATA%\MySQL Workbench\MySQL Workbench-electron.log   # app-level, session stderr
%APPDATA%\MySQL\mysqlsh\mysqlsh.log                     # per-connect log
```

The connect log showed something odd. The session *connected*, then stopped:

```
Info: Connecting to MySQL at: admin@192.168.1.124:3306
Info: main: tid=0: CONNECTED: 192.168.1.124:3306
Warning: Could not enable session tracking for sql_mode: Session tracker not supported by server
```

`CONNECTED`, and then nothing. No error, no disconnect. The connection succeeded and the session died silently afterwards.

Meanwhile the Electron log had the `TypeError` from the top of this post, repeated fifty-one times. That repetition is the clue: an error handler being called once per failure, crashing every time.

### The bug was in the error handler

From `gui_plugin\core\dbms\DbSession.py`:

```python
def terminate_thread(self):
    self._close_database(True)
    if self.thread_error is not None:
        logger.error(f"Thread {self._id} exiting with code {self.thread_error}")
        self._message_callback("ERROR", self.thread_error)      # two arguments
    self._term_complete.set()
```

And the callback it's calling, in `DbModuleSession.py`:

```python
def on_session_message(self, type, message, result, request_id=None):
```

Three required parameters. The call passes two. So **whenever a session thread dies, the code that reports it dies too** — and the `TypeError` replaces the original error on its way to the user.

That's the whole reason this bug was hard to see. Every real error in that session was being swallowed by a crash in the reporting path. Fixing the handler doesn't fix the underlying problem; it makes the problem **visible**. Which is what you need.

The correct call shape is right there in a sibling file, `DbMySQLSession.py`:

```python
self._message_callback(
    "PENDING",
    "Connection lost, reconnecting session...",
    None,
    self._current_task_id,
)
```

So the fix is to match it:

```python
self._message_callback(
    "ERROR", str(self.thread_error), None, self._current_task_id
)
```

Restart, retry, and the error message finally tells the truth:

```
MySQL Error 1193 (HY000): Unknown system variable 'gtid_mode'
```

Now we're somewhere. That's a real error, and it names a real cause.

## The actual root cause

`gtid_mode` is a **MySQL-only** system variable. MariaDB doesn't have it — it has `gtid_strict_mode`, `gtid_binlog_pos`, `gtid_current_pos`, and others, but nothing named `gtid_mode`.

You can confirm both halves in one minute:

```bash
# On MariaDB — no gtid_mode anywhere in the list
"$MSH" --sql --uri "..." -e "show variables like 'gtid%';"

# On MySQL 8.4 — there it is
"$MSH" --sql --uri "..." -e "select @@gtid_mode;"
```

The offending code, in `gui_plugin\migration\lib\backend\replication.py`:

```python
if log_bin:
    if session.nversion >= 56000:
        gtid_mode = session.run_sql("select @@gtid_mode").fetch_one()[0]
```

`session.nversion` for MariaDB 10.11.19 is `101119`. That's greater than `56000`, so the guard passes, so the query runs, so MariaDB rejects it and the session dies.

**And here is the design flaw underneath it.** The guard assumes a version number can tell you which engine you're talking to. It can't. MariaDB and MySQL share a single version register:

| Engine | Reports as |
|---|---|
| MySQL 5.7 | `5.7.x` |
| MySQL 8.0 / 8.4 | `8.0.x` / `8.4.x` |
| MariaDB 10.6 | `10.6.x` |
| MariaDB 10.11 | `10.11.x` |
| MariaDB 11.x | `11.x` |

Every MariaDB version is numerically *above* every MySQL version in production use. So `nversion >= 56000` is true for MariaDB. So is `>= 80000`. Any feature-gate written as a MySQL version comparison will pass against MariaDB and then send it syntax it doesn't understand.

The reliable discriminator is `@@version_comment`, which returns `mariadb.org binary distribution` on MariaDB and something else on MySQL. Workbench even **fetches** that value — it stores it as `VERSION_COMMENT` right next to `VERSION_INFO` — and then never uses it to make this decision.

This is not sloppiness in one place. It's a wrong assumption applied consistently, which is why the same bug appeared three separate times.

## Three patches, same mistake

Once I knew what to look for, the rest were mechanical. All three are the same fix: make the MySQL-only probe tolerant.

### Patch 1 — `replication.py`

```python
if session.nversion >= 56000:
    try:
        gtid_mode = session.run_sql("select @@gtid_mode").fetch_one()[0]
    except Exception:
        # MariaDB has no gtid_mode system variable; ignore and continue.
        gtid_mode = None
```

Worth noting: the *same* query is called elsewhere in the codebase, in `checks.py`, and **there it's already wrapped in `try/except`**. Oracle knew this call could fail on some servers. They just didn't apply that knowledge here. Only triggers when binlog is enabled, which it is on this box.

### Patch 2 — `DbSession.py`

The error handler from earlier. Strictly this fixes reporting, not MariaDB compatibility — but it's the patch that made patches 1 and 3 findable. Do it early.

### Patch 3 — `DbMySQLSessionSetupTasks.py`

Next failure, surfaced by patch 2:

```
MySQL Error 1193: Unknown system variable 'explain_json_format_version'
```

Which lives here, in a session-setup task that runs on every connect:

```python
version = self.get_data(common.MySQLData.VERSION_INFO)
major, minor, _ = version.split(".", 2)
if int(major) < 8 or int(major) == 8 and int(minor) < 3:
    return
self.execute("SET SESSION explain_json_format_version=2")
```

`@@version` is `10.11.19-MariaDB-ubu2404`. Split it: `major = 10`, `minor = 11`. Is `int(major) < 8`? No. Guard passes. `SET SESSION explain_json_format_version=2` is MySQL-only. Error 1193 again.

Same fix:

```python
try:
    self.execute("SET SESSION explain_json_format_version=2")
except Exception:
    pass
```

### The separate TLS fault

Remember Theory 1? It was a real problem, just a different one — and it fails *before* authentication, which makes it look like a credential issue.

Your connection profile can hold `useSSL = 1` with no certificates. Against MySQL 8.x that's harmless. Against MariaDB with TLS switched off, the handshake is refused outright:

```bash
"$MSH" --sql --uri "..." -e "select @@have_ssl;"
# have_ssl: DISABLED

"$MSH" --sql --uri "...?ssl-mode=REQUIRED" -e "select 1;"
# ERROR 2026 (HY000): SSL connection error:
#   SSL is required but the server doesn't support it
```

The fix is one value in `%APPDATA%\MySQL\Workbench\connections.xml` — set `useSSL` to `0` for that connection only. On a trusted LAN, a plain connection is fine. Back the file up first.

Two independent faults, two different error signatures. Worth separating in your head: **TLS failures happen before login; the `1193` failures happen after.** If the server rejects your handshake, credentials never get evaluated.

## How to patch files under Program Files

The Workbench files are shipped **read-only**, and this bit me twice in a way worth documenting: writes fail *silently*. PowerShell's `WriteAllText` reported success while the file on disk was unchanged — same size, same timestamp. A `.Replace()` on the content reported success and did nothing, because of line-ending differences.

What actually works:

1. **Back up in place** — `Copy-Item $f "$f.bak"`, so the pristine original sits next to your version.
2. **Clear the read-only flag** and *confirm* it: `attrib -R`, then check `(Get-Item $f).Attributes` no longer says `ReadOnly`.
3. **Patch by line index**, not string replacement — read all lines, splice, write all lines. Immune to CRLF and quoting differences.
4. **Restore read-only** afterwards with `attrib +R`.
5. **Delete the stale `__pycache__` `.pyc`** — otherwise Python keeps running the old compiled module and you'll conclude your patch didn't work. This one is easy to forget and produces a genuinely confusing result.
6. **Verify syntax** before relaunching: `ast.parse()` on the file, or `node --check` for JS.

Then restart the app so the patched source is loaded.

## Test the patch before you hand it back

A patched build that hasn't been exercised is a guess. Since the failure depends on server behaviour, simulate the server rather than clicking hopefully at the GUI:

```python
class FakeSession:
    nversion = 101119            # MariaDB 10.11.19
    def run_sql(self, q):
        if "gtid_mode" in q:
            raise Exception("1193 (HY000): Unknown system variable 'gtid_mode'")
        if "@@log_bin, @@binlog_format" in q:
            return FakeResult((1, "ROW"))     # binlog ON triggers the path
```

Load the patched function with `exec()`, call it with that fake, and assert it returns instead of raising. It's a five-minute test that turns "I think this works" into "this path is covered." It also confirmed the patch was genuinely being loaded, before I blamed the app.

## The result

All four connections work from Workbench 26.7.0 now, including the MariaDB box. Three patched files in Oracle's shipping code, each with a `.bak` beside it:

| File | Change |
|---|---|
| `replication.py` | guard `select @@gtid_mode` |
| `DbSession.py` | fix error-handler argument count |
| `DbMySQLSessionSetupTasks.py` | guard `SET SESSION explain_json_format_version` |

One thing I'd flag rather than dress up: these are patches to a closed application's bundled code, not a contribution upstream. They'll be **overwritten by the next Workbench update**, and the fault list may be longer than three — I stopped when the connections worked. If it breaks again after upgrading, expect to walk the same trail and possibly find a fourth instance of the same mistake.

## What I'd do differently

- **Drive the client's own binary first.** `mysqlsh` from Workbench's own install folder settled the "is it the server?" question in one command. I should have started there instead of theorising about TLS.
- **Treat an impossible error message as evidence.** `on_session_message() missing 1 required positional argument` is not a database error. When the text doesn't match the domain, suspect the error path itself — and fix that first, because it's blocking your view of everything else.
- **Read the sibling files.** Both the `gtid_mode` guard and the correct `_message_callback` signature existed correctly elsewhere in the same codebase. The bug wasn't ignorance of the right pattern; it was inconsistent application of it.
- **Notice version-gate arithmetic as a smell.** Any `if version >= N` branch that decides *which database engine* you're facing deserves suspicion. Ask what MariaDB reports, not what MySQL reports.
- **Keep the old client installed.** Workbench 8.0.x has no such probe and connects to MariaDB without complaint. Running 26.x for MySQL 8.4 and 8.0.x for MariaDB is a legitimate strategy — and it's the reason this was an evening's puzzle rather than a blocked workday.

Version numbers are the easiest thing to compare and the easiest thing to compare wrongly. Two projects sharing a numbering scheme is not the same as two projects sharing a feature set.
