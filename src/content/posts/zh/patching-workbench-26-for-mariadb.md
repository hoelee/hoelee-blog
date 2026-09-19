---
title: "当数据库客户端对你撒谎：为 MariaDB 修补 Workbench 26"
description: "MySQL Workbench 26.7.0 能连上 MySQL 8.4，却在 MariaDB 上报出一个毫无意义的 TypeError。三处修补，以及为什么版本号不再能说明它是什么引擎。"
pubDate: 2026-09-19
category: devops
tags: [mysql, mariadb, workbench, debugging, electron, mysql-sh, cyberpanel, self-hosting]
ogImage: /og/patching-workbench-26-for-mariadb.png
banner: /banners/patching-workbench-26-for-mariadb.png
draft: false
---

我用一台 Windows 机器管着四个数据库服务：两个 MySQL 8.4、一个本地安装、还有一个跑在局域网 CyberPanel 后面的 MariaDB 10.11。全新的 MySQL Workbench 26.7.0 里，三个连接都正常打开，只有一个不行。

它给我的报错是这样的：

```
TypeError: DbModuleSession.on_session_message() missing 1 required positional argument: 'result'
```

这句话里没有任何关于数据库、网络、凭据或 MariaDB 的信息。它是一个客户端内部的 Python 参数个数错误。而这是我今年追过的最具误导性的一条报错——因为它**根本不是那个 bug**。它是**错误报告器在试图报告 bug 时自己崩掉了**。

这篇文章记录从这条报错一路查到 Oracle 自家发行代码里三处修补的过程，以及导致这三处的同一个设计假设。

## 为什么值得看

如果你身边同时放着不止一种数据库引擎——这边 MySQL、那边 MariaDB——你迟早会碰到这一类故障，而且报错文本会主动把你带偏。即使你从不开 Workbench，下面三点也有价值：

1. **一条垃圾报错本身就是一个线索。** 当工具报出一个结构上不可能的错误时，先怀疑它的错误处理路径，而不是它的业务逻辑。
2. **`major >= 8` 不是可靠的「这是不是 MySQL」判断。** MariaDB 报的版本号是 10.x 和 11.x。很多软件在这里栽跟头。
3. **版本号冲突是系统性问题**，不是某个应用里的一次性 bug——这也正是同一个修补必须在三个文件里各做一遍的原因。

## 环境

四个连接，以及哪一个坏了：

| 服务器 | 引擎 | 版本 | Workbench 26.7.0 |
|---|---|---|---|
| DSM NAS | MySQL | 8.4 | 正常 |
| unRaid | MySQL | 8.4 | 正常 |
| localhost（后来已移除） | MySQL | 8.4.6 | 正常 |
| CyberPanel 虚拟机 | **MariaDB** | **10.11.19** | **失败** |

事后看规律很明显：MySQL 8.4 的全部正常，唯一的 MariaDB 不正常。但「它是唯一的异类」不是诊断结论，当时我也不打算就此相信它。

## 我先试了什么，以及为什么都错了

**猜测一：TLS。** 连接配置里是 `useSSL = 1`，而 `sslCA`、`sslCert`、`sslKey` 全为空。对 MySQL 8.x 这没问题——它会自动生成证书。对 MariaDB 就未必了。

这个猜测结果**对了一半**，后面我会回头讲，因为它是一个真实存在的第二个故障，而且会报出**另一个**错误。

**猜测二：凭据或权限。** 也是错的，而且可以用很低成本排除。Workbench 26 自带一个 MySQL Shell 可执行文件。手工拿那个文件去连同一台主机，就能把「除 Workbench 自身代码之外的一切」都测一遍：

```bash
MSH="/c/Program Files/MySQL/MySQL Workbench/resources/app/shell/bin/mysqlsh.exe"
"$MSH" --sql --uri "admin:PASSWORD@192.168.1.124:3306" \
  -e "select current_user(), version();"
```

```
current_user()   version()
admin@%          10.11.19-MariaDB-ubu2404
```

连上了。同一个可执行文件、同一台主机、同一组凭据——命令行能通，图形界面不能。这一下就把范围收得很窄：**网络、服务器、权限、密码全都没问题。** 坏掉的东西在 Workbench 自己的会话处理代码里。

如果你只从这篇文章带走一个技巧，就带这个。在调试一个客户端之前，先用它自带的底层工具直接连一次，把「这东西坏了」和「这个界面坏了」分开。

## 把真正的报错从里面挖出来

Workbench 26 的日志位置变了。有用的两个：

```
%APPDATA%\MySQL Workbench\MySQL Workbench-electron.log   # 应用层，含会话 stderr
%APPDATA%\MySQL\mysqlsh\mysqlsh.log                     # 每次连接的日志
```

连接日志里有个奇怪的地方。会话**连上了**，然后就停住了：

```
Info: Connecting to MySQL at: admin@192.168.1.124:3306
Info: main: tid=0: CONNECTED: 192.168.1.124:3306
Warning: Could not enable session tracking for sql_mode: Session tracker not supported by server
```

`CONNECTED`，然后什么都没有。没有报错，也没有断开。连接成功了，会话在之后静默死亡。

同时 Electron 日志里躺着开头那条 `TypeError`，重复了五十一次。这个重复次数就是线索：一个错误处理器每次失败都被调用一次，每次都崩。

### bug 就在错误处理器里

出自 `gui_plugin\core\dbms\DbSession.py`：

```python
def terminate_thread(self):
    self._close_database(True)
    if self.thread_error is not None:
        logger.error(f"Thread {self._id} exiting with code {self.thread_error}")
        self._message_callback("ERROR", self.thread_error)      # 两个参数
    self._term_complete.set()
```

而它调用的回调，在 `DbModuleSession.py` 里：

```python
def on_session_message(self, type, message, result, request_id=None):
```

三个必需参数。调用只传了两个。所以**每当一个会话线程死亡，负责上报它的代码也跟着死**——于是 `TypeError` 顶替了原本的错误，出现在你面前。

这就是这个 bug 难看见的全部原因。那个会话里的每一个真实错误，都被上报路径上的一次崩溃吞掉了。修好处理器并不能修好底层问题；它让底层问题**可见**。而你需要的就是这个。

正确的调用写法就在隔壁文件 `DbMySQLSession.py` 里摆着：

```python
self._message_callback(
    "PENDING",
    "Connection lost, reconnecting session...",
    None,
    self._current_task_id,
)
```

所以修法就是照抄它：

```python
self._message_callback(
    "ERROR", str(self.thread_error), None, self._current_task_id
)
```

重启，重试，报错终于说了实话：

```
MySQL Error 1193 (HY000): Unknown system variable 'gtid_mode'
```

这才有点进展。这是一个真实的错误，而且指向一个真实的原因。

## 真正的根因

`gtid_mode` 是**MySQL 专有**的系统变量。MariaDB 没有它——人家有 `gtid_strict_mode`、`gtid_binlog_pos`、`gtid_current_pos` 等等，但没有叫 `gtid_mode` 的东西。

两边都可以在一分钟之内验证：

```bash
# MariaDB 上——列表里根本找不到 gtid_mode
"$MSH" --sql --uri "..." -e "show variables like 'gtid%';"

# MySQL 8.4 上——它在这儿
"$MSH" --sql --uri "..." -e "select @@gtid_mode;"
```

出问题的代码，在 `gui_plugin\migration\lib\backend\replication.py`：

```python
if log_bin:
    if session.nversion >= 56000:
        gtid_mode = session.run_sql("select @@gtid_mode").fetch_one()[0]
```

MariaDB 10.11.19 的 `session.nversion` 是 `101119`。它大于 `56000`，于是守卫放行，于是查询发出，于是 MariaDB 拒绝，于是会话死亡。

**而它底下的设计缺陷在这里。** 这个守卫假设版本号能告诉你对面是哪个引擎。它不能。MariaDB 和 MySQL 共用同一套版本号体系：

| 引擎 | 报出的版本 |
|---|---|
| MySQL 5.7 | `5.7.x` |
| MySQL 8.0 / 8.4 | `8.0.x` / `8.4.x` |
| MariaDB 10.6 | `10.6.x` |
| MariaDB 10.11 | `10.11.x` |
| MariaDB 11.x | `11.x` |

在生产使用中，**每一个 MariaDB 版本号都高于每一个 MySQL 版本号**。所以 `nversion >= 56000` 对 MariaDB 为真，`>= 80000` 同样为真。任何写成 MySQL 版本比较的功能开关，遇到 MariaDB 都会放行，然后发过去它看不懂的语法。

可靠的判别依据是 `@@version_comment`，在 MariaDB 上返回 `mariadb.org binary distribution`，在 MySQL 上是别的值。Workbench 甚至**已经取到了**这个值——它把它存成 `VERSION_COMMENT`，就摆在 `VERSION_INFO` 旁边——然后完全没用它来做这个判断。

这不是某一处的粗心，而是一个错误假设被一致地贯彻了下去，所以同一个 bug 会在三个地方各出现一次。

## 三处修补，同一个错误

知道要找什么之后，剩下的都是机械工作。三处都是同一个修法：让那个 MySQL 专有的探测变得可容错。

### 修补 1 — `replication.py`

```python
if session.nversion >= 56000:
    try:
        gtid_mode = session.run_sql("select @@gtid_mode").fetch_one()[0]
    except Exception:
        # MariaDB 没有 gtid_mode 系统变量；忽略并继续。
        gtid_mode = None
```

值得注意：**同一个查询**在代码库另一处（`checks.py`）被调用时，**本来就包在 `try/except` 里**。Oracle 是知道这个调用在某些服务器上会失败的，只是没把这个认知用到这里。只有在 binlog 打开时才触发，而这台机器上恰好是开着的。

### 修补 2 — `DbSession.py`

就是前面说的错误处理器。严格来说这修的是上报，不是 MariaDB 兼容性——但正是它让修补 1 和修补 3 变得可被发现。要早点做。

### 修补 3 — `DbMySQLSessionSetupTasks.py`

下一个故障由修补 2 暴露出来：

```
MySQL Error 1193: Unknown system variable 'explain_json_format_version'
```

它在每次连接都会跑的一个会话初始化任务里：

```python
version = self.get_data(common.MySQLData.VERSION_INFO)
major, minor, _ = version.split(".", 2)
if int(major) < 8 or int(major) == 8 and int(minor) < 3:
    return
self.execute("SET SESSION explain_json_format_version=2")
```

`@@version` 是 `10.11.19-MariaDB-ubu2404`。切开来：`major = 10`、`minor = 11`。`int(major) < 8` 吗？不是。守卫放行。`SET SESSION explain_json_format_version=2` 是 MySQL 专有语法。又是错误 1193。

同样的修法：

```python
try:
    self.execute("SET SESSION explain_json_format_version=2")
except Exception:
    pass
```

### 另一个独立的 TLS 故障

还记得猜测一吗？那是个真问题，只不过是另一个问题——而且它在**认证之前**就失败，所以看起来像凭据问题。

你的连接配置里可能存着 `useSSL = 1` 却没有任何证书。对 MySQL 8.x 无害。对关掉了 TLS 的 MariaDB，握手直接被拒：

```bash
"$MSH" --sql --uri "..." -e "select @@have_ssl;"
# have_ssl: DISABLED

"$MSH" --sql --uri "...?ssl-mode=REQUIRED" -e "select 1;"
# ERROR 2026 (HY000): SSL connection error:
#   SSL is required but the server doesn't support it
```

修法是 `%APPDATA%\MySQL\Workbench\connections.xml` 里的一个值——只把那一条连接的 `useSSL` 改成 `0`。在可信局域网里，明文连接没问题。改之前先备份文件。

两个独立故障，两种不同的错误特征。脑子里要分开：**TLS 失败发生在登录之前；`1193` 系列失败发生在之后。** 如果服务器拒绝你的握手，凭据根本没机会被验证。

## 怎么给 Program Files 下的文件打补丁

Workbench 的文件是**只读**的，而这一点以值得记录的方式坑了我两次：写入会**静默失败**。PowerShell 的 `WriteAllText` 报告成功，而磁盘上的文件毫无变化——大小一样、时间戳一样。对内容做 `.Replace()` 也报告成功却什么都没做，原因是行尾符差异。

真正有效的做法：

1. **原地备份**——`Copy-Item $f "$f.bak"`，让原始文件待在你的版本旁边。
2. **清除只读属性**并且*确认*：`attrib -R`，然后用 `(Get-Item $f).Attributes` 检查 `ReadOnly` 确实没了。
3. **按行号打补丁**，不要做字符串替换——整行读出、拼接、整行写回。这样对 CRLF 和引号差异完全免疫。
4. 事后**恢复只读**：`attrib +R`。
5. **删掉过期的 `__pycache__` `.pyc`**——否则 Python 会继续跑旧的编译模块，然后你会得出「补丁没用」的结论。这条最容易忘，而且产生的结果非常令人困惑。
6. 重启前**验证语法**：对文件跑 `ast.parse()`，JS 则用 `node --check`。

然后重启应用，让修补后的源码被加载。

## 交回之前先测补丁

没被实际跑过的补丁只是猜测。由于故障取决于服务器行为，正确的做法是模拟服务器，而不是对着界面满怀希望地连：

```python
class FakeSession:
    nversion = 101119            # MariaDB 10.11.19
    def run_sql(self, q):
        if "gtid_mode" in q:
            raise Exception("1193 (HY000): Unknown system variable 'gtid_mode'")
        if "@@log_bin, @@binlog_format" in q:
            return FakeResult((1, "ROW"))     # binlog 打开才会走到这条路径
```

用 `exec()` 载入修补后的函数，拿这个假会话调用，断言它正常返回而不是抛异常。五分钟的测试，把「我觉得这样行」变成「这条路径被覆盖了」。它也在你去怪应用之前，先确认了补丁确实被加载了。

## 结果

现在 Workbench 26.7.0 里四个连接全部可用，包括那台 MariaDB。Oracle 发行代码里三个文件被修补，每个旁边都留了 `.bak`：

| 文件 | 改动 |
|---|---|
| `replication.py` | 给 `select @@gtid_mode` 加容错 |
| `DbSession.py` | 修正错误处理器的参数个数 |
| `DbMySQLSessionSetupTasks.py` | 给 `SET SESSION explain_json_format_version` 加容错 |

有一点我不打算粉饰：这些是对一个闭源应用自带代码打的补丁，不是对上游的贡献。它们会**被下一次 Workbench 更新覆盖**，而故障清单可能不止三条——我在连接能用之后就停了。如果升级后再次出问题，那就准备重走一遍这条路径，而且可能发现同一错误的第四个实例。

## 我会怎么做得不一样

- **先用客户端自带的底层工具连一次。** 用 Workbench 自己安装目录里的 `mysqlsh`，一条命令就解决了「是不是服务器的问题」。我应该从这里开始，而不是先去猜 TLS。
- **把不可能出现的报错当成证据。** `on_session_message() missing 1 required positional argument` 不是数据库错误。当文本与领域不匹配时，怀疑错误路径本身——并且优先修它，因为它挡住了你看向其他一切的视线。
- **读隔壁的文件。** `gtid_mode` 的容错和正确的 `_message_callback` 签名，在同一个代码库里都另有正确写法。问题不是不知道正确做法，而是应用得不一致。
- **把版本号判断当成一种异味。** 任何用 `if version >= N` 来决定*面对哪种数据库引擎*的分支，都值得警惕。要问 MariaDB 报什么，而不是问 MySQL 报什么。
- **保留旧客户端。** Workbench 8.0.x 没有这个探测，连 MariaDB 毫无怨言。用 26.x 管 MySQL 8.4、用 8.0.x 管 MariaDB，是一个完全合理的策略——也正因为如此，这次只是一个晚上的智力题，而不是被堵住的一天。

版本号是最容易比较的东西，也是最容易被比较错的东西。两个项目共用一套编号体系，并不等于它们共用一套功能集。
