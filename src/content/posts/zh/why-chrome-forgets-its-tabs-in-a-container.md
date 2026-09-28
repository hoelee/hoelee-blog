---
title: "为什么容器里的 Chrome 会忘记标签页 —— 以及我是怎么修好的"
description: "Chrome 的「继续上次浏览」在 Docker 容器里根本不会生效：三次失败的尝试、真正的原因，以及最后管用的 70 行守护脚本。"
pubDate: 2026-09-26
category: devops
tags: [docker, chrome, cdp, persistence, synology, self-hosting]
ogImage: /og/why-chrome-forgets-its-tabs-in-a-container.png
banner: /banners/why-chrome-forgets-its-tabs-in-a-container.png
draft: false
---

我在 NAS 上的 Docker 容器里跑着一个真正的 Google Chrome。它不是爬虫实例，也不是截图服务 —— 是我真的在用的浏览器：登录着那些绝不该交给无头机器人的账号，可以从任何设备通过网页桌面看着它操作，需要自动化的时候还能用 Chrome DevTools Protocol (CDP) 驱动它。

它一直很好用，只有一个例外：**每次容器重启，浏览器回来时只剩一个空白标签页。**

Chrome 明明有专门对付这件事的设置 ——「继续浏览上次打开的网页」。它一直是开着的，却毫无作用。下面就是三次失败的尝试、真正的原因、路上踩到的两颗地雷，以及最后真正让重启变得可用的那七十来行守护脚本。

## 为什么这件事值得认真对待

当容器里的浏览器就是你的工作台时，标签页就是状态本身：填了一半的表单、正在编辑的商品上架页、筛选到指定日期的仪表盘、客户基础设施的三个页面 —— 那些就是工作。浏览器一启动停在空白页，意味着每次重启后的头十分钟都在重建你本来就有的上下文。

这个问题我查过不止一次，网上能搜到的只有「把 `restore_on_startup` 设上」这类建议，而那套建议一进容器就失效。如果你也撞上了同一堵墙，这篇文章就是这堵墙的解释。

## 我的环境

Synology NAS 上的一个 Docker stack，里面两个浏览器（真 Chrome 加 Brave），各自挂在自己的 SSO 网关后面：

| 组件 | 取值 |
|---|---|
| 镜像 | `lscr.io/linuxserver/chrome` —— 真正的 Google Chrome 154 |
| 桌面 | Selkies 网页桌面，容器 `3000`/`3001` → 宿主 `3030`/`3031` |
| 自动化 | CDP 暴露在 `http://<nas>:9232/json/version` |
| Profile | bind mount，容器内路径 `/config/profile` |
| 启动参数 | `--remote-debugging-port=9222 --user-data-dir=/config/profile --restore-last-session` |

Profile 是 bind mount，所以登录态、cookie、历史记录在容器重建后确实都还在 —— 那部分从来没坏过。丢掉的只有**会话**（当时开着哪些标签页）。

## 尝试一：那个启动参数

Chromium 有一个听起来正合适的开关：`--restore-last-session`，文档说法是「在**意外退出**后恢复上次的会话」。

我通过镜像的 CLI 环境变量加上它，并且确认它确实传到了运行中的进程上 —— 因为这类镜像的命令行是包装脚本拼出来的：

```bash
docker exec chrome sh -c 'tr "\0" " " < /proc/$(pgrep -f "google-chrome --" | head -1)/cmdline' | tr ' ' '\n' | grep -E 'restore|user-data-dir|remote-debug'
# --remote-debugging-port=9222
# --user-data-dir=/config/profile
# --restore-last-session
```

重启。空白页。参数在，只是它没有任何「愿意恢复」的东西。

## 尝试二：直接改 profile 里的配置

Chrome 把「继续浏览上次打开的网页」存在 profile 的 `Preferences` JSON 里，字段是 `session.restore_on_startup: 1`。于是我停掉容器，直接把这两个值改了：

```python
import json
p = '/config/profile/Default/Preferences'
d = json.load(open(p))
d.setdefault('session', {})['restore_on_startup'] = 1   # 1 = restore last session
d.setdefault('profile', {})['exit_type'] = 'Normal'
json.dump(d, open(p, 'w'))
```

这就是网上最流行的那套做法，而它「半成功」了：下次启动后，Chrome **保留**了文件里的 `restore_on_startup: 1` —— 然后照样打开空白页。它没有保留的是我写的 `exit_type`：启动时它已经把那个值改回了 `Crashed`。

这次改写反而是第一条真正的线索。Chrome 把启动状态当成安全边界 —— 劫持者最想改的那些设置（主页、搜索引擎、启动页面）会跟另一个文件 `Secure Preferences` 做 MAC 校验。所以，磁盘上被改过的值，并不自动等于 Chrome 会遵守的值。

## 尝试三：托管策略

让浏览器行为具备权威性的正式办法是**托管策略**（managed policy），它不受上面那套 MAC 校验约束。在 Linux 上，Chrome 读取 `/etc/opt/chrome/policies/managed/*.json`：

```json
{ "RestoreOnStartup": 1 }
```

动手之前有两个细节：Chrome **会忽略**运行浏览器的那个用户可写的策略文件，所以必须是 `root:root` 加 `644`；而在 Synology 的共享目录上，某些目录即使 `sudo` 也会拒绝执行 `chmod`，所以别假设你改成功了，去确认当前的实际权限。

挂进容器，启动后确认文件在位：

```bash
docker exec chrome sh -c 'ls -l /etc/opt/chrome/policies/managed/; cat /etc/opt/chrome/policies/managed/hoeleepolicy.json'
# -rw-r--r-- 1 root root 28 hoeleepolicy.json
# { "RestoreOnStartup": 1 }
```

重启。还是空白页。

## 尝试四：先证明「退出是不干净的」

到这一步，问题已经不是「我该用哪个设置」，而是「容器停掉的时候，这个浏览器到底看到了什么」。

Chrome 的会话恢复机制需要一个它认为**被中断、或可续接**的会话：只有在正常退出时，它才会把 `Current Session` 落成 `Last Session`。于是我改用最温和的方式收掉浏览器 —— 通过 CDP 让它自己优雅退出，而不是把容器从它脚下抽走：

```python
# browser-level target from /json/version
ws.send(json.dumps({"id": 1, "method": "Browser.close", "params": {}}))
```

Chrome 确实退出了 —— 然后桌面会话在几秒内又把它拉了起来，`exit_type` 立刻回到 `Crashed`。

这就是全部的机关，它一次性解释了前面三次失败：**这个浏览器从来没有干净退出过。** 你停容器时，桌面会话被一起拆掉，浏览器跟着被杀。没有干净退出，就没有 `Last Session` 的落盘，也就没有任何东西可供「继续上次浏览」或 `RestoreOnStartup` 策略去恢复。那个参数、那个首选项、那条策略其实都在正常工作 —— 只是它们手上空无一物。

数据其实一直都在。那段时间 profile 的会话目录每隔几秒就在写：

```
-rw------- 1 hoelee users 40722 Session_13434833255312492
-rw------- 1 hoelee users 58879 Tabs_13434833757632480
-rw------- 1 hoelee users 79361 Tabs_13434833833646133
```

## 修法：别再去配置它，开始替它记住

如果浏览器记不住自己的会话，那就让容器替它记住。两件事，都很小：

1. **启动时**：等浏览器起来，如果它一个真正的页面都没打开，就把上次的网址重新打开。
2. **之后一直**：每 60 秒把当前打开的页面地址快照一次。

这就是一段从镜像的容器初始化钩子拉起的后台脚本。我实际在跑的版本，去掉无关部分后是这样：

```python
#!/usr/bin/env python3
"""Restore last session's tabs on start, then snapshot open tabs every 60s."""
import json, os, time, urllib.parse, urllib.request

CDP   = "http://127.0.0.1:9222"          # loopback inside the container
STORE = "/config/tabs-last.txt"          # lives in the persistent profile mount

def open_tabs():
    """http(s) page URLs, or None when the browser isn't answering yet."""
    try:
        with urllib.request.urlopen(CDP + "/json/list", timeout=5) as r:
            tabs = json.load(r)
    except Exception:
        return None
    return [t.get("url", "") for t in tabs
            if t.get("type") == "page" and t.get("url", "").startswith("http")]

saved = [u.strip() for u in open(STORE)] if os.path.exists(STORE) else []

# 1) restore — wait up to 3 minutes for the browser to come up
if saved:
    for _ in range(60):
        if open_tabs() is not None:
            break
        time.sleep(3)
    if open_tabs() == []:                      # nothing but a blank new tab
        for url in saved[:20]:
            req = urllib.request.Request(
                CDP + "/json/new?" + urllib.parse.quote(url, safe=""), method="PUT")
            urllib.request.urlopen(req, timeout=10).read()
            time.sleep(0.7)

# 2) snapshot — write even an empty list, so "I closed everything" is respected
while True:
    time.sleep(60)
    tabs = open_tabs()
    if tabs is None:
        continue
    tmp = STORE + ".tmp"
    open(tmp, "w").write("\n".join(tabs) + ("\n" if tabs else ""))
    os.replace(tmp, STORE)                     # atomic; a kill can't truncate it
```

两个设计选择值得抄走：

- **只在浏览器确实空空如也时才恢复。** 万一将来某个 Chrome 版本自己会恢复标签页，这段脚本就会让路，而不是把每个标签页再复制一遍。
- **快照是原子的，而且允许为空。** 先写临时文件再 `os.replace`，意味着写到一半被杀也不会留下半截列表；而空列表是有意义的数据 —— 它表示你主动关掉了全部标签页，所以下次启动就该保持空白。

拉起它的初始化钩子：

```sh
#!/bin/sh
# clear stale singleton state (see below)
rm -f /config/profile/Singleton* 2>/dev/null
# long-running, so background it or you block container init
/usr/bin/env python3 /custom-cont-init.d/tabs_keeper.py >> /config/tabs-keeper.log 2>&1 &
exit 0
```

### 地雷一：残留的 `Singleton*` 会让 Chrome 干脆不启动

测试重启的过程中，我撞上了一个比空白页更糟的故障：容器**健康地**起来了，里面却没有浏览器。没有 `google-chrome` 进程、CDP 不通、中继容器的健康检查报 `unhealthy`，日志里除了桌面启动之外什么都没有。

原因在 profile 里的 `SingletonLock`/`SingletonSocket`/`SingletonCookie` 这几个符号链接 —— 它们记录了「这个 profile 属于主机 *h* 上的进程 *n*」。而容器里的 PID 会跨重启复用，于是下一次启动可能发现自己这个 PID 已经被「占用」，于是立刻退出。在容器启动时、浏览器拉起之前把它们删掉就是解法，这也是上面钩子里那句 `rm -f` 存在的原因。

### 地雷二：`custom-cont-init.d` 只执行**可执行**文件，而且用 bash 执行

LinuxServer 的镜像会执行 `/custom-cont-init.d` 下的每个文件，但前提是它可执行，并且是用 `/bin/bash` 执行。也就是说，你放进去的 Python 文件**绝不能**带执行位，否则会被喂给 bash 然后以 2 退出：

```
[custom-init] tabs_keeper.py: executing...
[custom-init] tabs_keeper.py: exited 2
```

可行的分工是：`.sh` 钩子设 `755`，把常驻任务放到后台；同目录的 `.py` 设 `644`。另外，任何不会立刻返回的东西都必须后台化，否则容器初始化会一直等它。

## 顺带带出来的管道陷阱

守护脚本是走 loopback 上的 CDP 跟 Chrome 说话的，所以它不需要任何端口。但如果你还想从另一台机器驱动这个浏览器，就会多出一个容器 —— 因为 Chrome ≥ 136 把 devtools 端点钉在 `127.0.0.1:9222`，并且忽略 `--remote-debugging-address`。标准做法是让一个 `socat` 边车共用浏览器的网络命名空间：

```yaml
chrome-relay:
  image: alpine/socat
  network_mode: service:chrome            # must share the browser's netns
  command: socat TCP-LISTEN:9223,fork,reuseaddr TCP:127.0.0.1:9222
  healthcheck:
    test: ["CMD-SHELL", "nc -z 127.0.0.1 9222 || exit 1"]
```

端口映射**不**写在中继上（它自己没有独立命名空间），而是写在浏览器服务上：`9232:9223`。

这个边车有一个你必须记住的行为：**重启浏览器，中继会跟着死。** 它当初所在的命名空间被重建了，socat 进程还活着、套接字却已经失效，于是 CDP 报 `connection reset`，而容器看起来一切正常。按这个顺序收拾：

```bash
docker restart chrome && docker restart chrome-relay   # order matters
```

上面那条健康检查的作用，就是把这种静默故障变成一个看得见的 `unhealthy`。如果你打算自己驱动容器里的浏览器，客户端那一侧我单独写过一篇：[Scraping a Bot-Walled Marketplace With a Warm Browser Session](/posts/scraping-bot-walled-marketplace-warm-browser-session/)。

## 如果重来一次

- **先确认进程能不能干净退出，再考虑相信任何「启动时恢复」的机制。** 我在一个前提条件（浏览器能察觉到的退出）根本不存在的情况下，连试了三种配置。一次 `Browser.close` 测试就能让整个排查过程坍缩。
- **不要手改浏览器首选项。** 它们会跟 `Secure Preferences` 做 MAC 校验；磁盘上一个看起来合理的值，并不等于 Chrome 会遵守的值。需要权威性就用托管策略 —— 并且去验证策略真的加载了，而不是假设文件放进去就够了。
- **确认谁有权限写那条策略。** `root:root`、`644`，放在 `/etc/opt/chrome/policies/managed` 下才是对的形状；用户可写的策略文件会被静默忽略。
- **把「浏览器在跑」和「容器在跑」当成两个不同的问题。** 残留 singleton 那次故障，从外面看就是一个健康的容器。
- **与其让软件记住状态，不如自己存快照。** 任何关闭路径上带强杀的软件 —— 容器、kiosk、桌面会话 —— 都不是依赖「干净退出」记账的好地方。一个 60 秒一次、原子写入的快照很无聊，但它管用。

## 结果

- 真实的容器重启之后，两个浏览器各自 **2/2 个标签页**都恢复了（守护日志里是 `restored 2/2 tabs`），重启后再用 CDP 复核过
- 同一批重启里，登录态、cookie 和 `localStorage` 都确认存活 —— 持久化 profile 从来不是问题所在
- 三个 stack（两个浏览器加一个试验品）合并成一个，并且靠中继的健康检查，把唯一那个「重启顺序」陷阱由静默变成看得见

## 你的业务需要这个吗？

如果你想要一个始终登录着的浏览器 —— 跑在你自己的硬件上、任何地方都能访问、挂在 SSO 后面、标签页状态能扛住重启，还带一个能给你脚本用的 CDP 端点 —— 那正是我在跑、也在维护的这套东西。

**WhatsApp: [+60 12-797 2969](https://wa.me/60127972969)** · **Email: [me@hoelee.com](mailto:me@hoelee.com?subject=Self-hosted%20container%20browser)** · **[hoelee.com](https://hoelee.com)**

网站设计与开发是我的主业；自托管基础设施与自动化是另外一半。
