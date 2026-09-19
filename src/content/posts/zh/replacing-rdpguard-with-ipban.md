---
title: "用 IPBan 替换 RDPGuard：没人写出来的三个坑"
description: "我把付费的 RDPGuard 7.8.7 换成了开源的 IPBan 4.1.0，踩到三个没有文档的坑——其中一个卸载程序会悄悄放走 12 个正在攻击的 IP。"
pubDate: 2026-09-19
category: devops
tags: [windows, security, rdp, ipban, rdpguard, brute-force, firewall, self-hosting]
ogImage: /og/replacing-rdpguard-with-ipban.png
banner: /banners/replacing-rdpguard-with-ipban.png
draft: false
---

只要把一台开了远程桌面的 Windows 机器放到公网上，你就知道接下来会发生什么：几分钟内，日志里就塞满了来自世界各地租用服务器的登录失败记录。你必须有东西自动把它们挡掉。

我用了好几年 **RDPGuard 7.8.7**。它是能用的，但它是付费闭源的，而且我已经落后了三个大版本。所以我换成了 **IPBan**——MIT 许可、从 2011 年维护至今、GitHub 上大约 2200 星，确实是目前最接近即插即用的替代品。

整个迁移花了一个晚上。其中三步没有文档，而其中一步会悄悄**让 12 个正在攻击的 IP 重新获得访问权**。以下是真实发生的过程。

## 为什么这件事值得看

把 RDP 暴露在公网上不是「也许会有人来试试」的风险。在我这台机器上，IPBan 上线的**第一个小时内就检测并封禁了 16 个不同的攻击 IP**——其中一个遍历了管理员用户名词典，还有两个直接猜机器主人的真实名字作为登录名。这是有针对性的攻击，不是环境噪音。

如果你在跑 RDPGuard、IPBan 或任何类似的东西，这篇文章里有两件事跟你有关系，哪怕你永远不迁移：

1. **卸载一个拦截工具可能会把攻击者放出来。** 这类工具通常独占一条防火墙规则。工具没了，规则就没了，封禁也就没了。
2. **你以为控制封禁时长的那个配置键，多半不是。** 这个故事里两个工具都有这样「听起来没错、其实干别的事」的键。

## 我原本在跑什么

RDPGuard 装成了两个服务加三个进程：

```
RdpGuardService   C:\Program Files (x86)\RdpGuard\rdpguard-svc.exe
RdpGuardProxy     ...\RDPGuardProxyServer\RDPGuardProxyServer.exe
```

它一直在干活。它的防火墙规则里躺着 **12 个被封的 IP**，每个在 `C:\ProgramData\RdpGuard\blocked_ips\` 都有一份 XML 记录，里面存着 IP、尝试的用户名和协议。

最后一项，恰恰是最该检查的东西。

## 坑一：卸载程序会把所有人放出来

RDPGuard 独占了一条叫 `rdpguard-e1e259c5-local` 的 Windows 防火墙规则。12 个封禁全在这条规则里。

问题就在这里：卸载 RDPGuard 时，这条规则会跟着一起走。卸载程序没有任何理由去区分「不安全的工具」和「有用的封禁列表」——它只管删掉自己创建的东西。如果先卸载，你就等于给 12 个已知攻击者发了白纸一张。

所以在动卸载程序之前，我先把封禁导出来，喂给了 IPBan。IPBan 会读取服务目录里的纯文本 `ban.txt`——一行一个 IP——并在下一个周期消费掉：

```bash
# C:\app\IPBan\ban.txt — 一行一个 IP
118.70.185.179
121.162.129.47
163.47.35.89
183.80.60.33
20.57.167.231
202.165.14.28
45.131.194.223
45.141.233.12
45.146.54.21
5.181.86.179
5.181.86.60
61.216.137.152
```

IPBan 几秒内就读到了，自己把文件删掉，然后重写了它自己的规则：

```
19:22:00  Updating firewall with 12 entries...
19:22:00  Firewall entries updated: 118.70.185.179:add, 121.162.129.47:add,
          163.47.35.89:add, 183.80.60.33:add, 20.57.167.231:add, 202.165.14.28:add,
          45.131.194.223:add, 45.141.233.12:add, 45.146.54.21:add, 5.181.86.179:add,
          5.181.86.60:add, 61.216.137.152:add
```

这些封禁记录也值得读一读，而不是直接删。12 个里有 2 个试用的用户名是 `HOELEE01` 和 `HOELEE1`——正好是机器主人的账号名，被猜出来了。另一个把 `Administrator` → `Administrador` → `Admin` 轮了一遍。这是针对具体个人的侦察。如果先让卸载程序跑，这类细节你根本不会知道自己丢了。

## 坑二：`--install-service` 根本不存在

IPBan 官方安装方式是一个 PowerShell 脚本，把最新版拉到 `C:\Program Files\IPBan` 并注册服务。我故意没用它，因为我已经把指定版本解压到 `C:\app\IPBan`，想保留那份配置和数据库。

于是我很自然地试了：

```
DigitalRuby.IPBan.exe --install-service
```

IPBan 4.1.0 的命令行非常精简。这是它的全部命令：

```
Commands:
  version             Get ipban software version
  info                Get information about hosting OS
  migrate             Migrate other provider to ipban.override.config
  logfiletest <file>  Test a log file with regexes for failures and successes
  list                List currently banned IPs (State=Active/in firewall)
  unban <ip>          Request UNBAN for an IP or for all currently banned IPs
  ban <ip>            Request BAN for an IP
```

没有 `--install-service`，没有 `--service`，跟服务相关的一个都没有。IPBan 的设计是「用脚本装」，而你不用脚本时，注册服务就是你自己的事。

答案是 `sc.exe`——项目自己的卸载脚本就暗示了这一点（`sc.exe stop IPBAN` / `sc.exe delete IPBAN`）：

```
sc.exe create IPBAN type= own start= auto binPath= "C:\app\IPBan\DigitalRuby.IPBan.exe" DisplayName= "IPBan"
```

**`sc.exe` 里的空格是承重的。** `type= own`、`start= auto`、`binPath= "..."` 每一处的 `=` 后面都**必须有一个空格**。省略了，`sc` 会把参数当成一整个 token 解析然后报错。这是个真实的陷阱：它看起来像打错字，所以看起来也可以不打。

跟官方脚本相比，我有两个刻意的差异：

| | 官方安装脚本 | 我用的 |
|---|---|---|
| 路径 | `C:\Program Files\IPBan` | `C:\app\IPBan`（沿用已有目录，配置得以保留） |
| 启动方式 | `delayed-auto` | `auto`——开机更早启动，对暴露 RDP 的机器更合适 |

验证是否注册成功，有四种方式：

```bash
$ sc.exe qc IPBAN
SERVICE_NAME: IPBAN
        TYPE            : 10  WIN32_OWN_PROCESS
        START_TYPE      : 2   AUTO_START
        BINARY_PATH_NAME: C:\app\IPBan\DigitalRuby.IPBan.exe
        SERVICE_START_NAME : LocalSystem
```

Windows 事件日志可以独立佐证——事件 ID 7045：

```
A service was installed in the system.
Service Name:  IPBAN
Service Start Type: auto start
Service Account: LocalSystem
```

一个小小的瑕疵：因为 `sc create` 没给 `DisplayName=`，服务的显示名就是干巴巴的 `IPBAN`，而不是一个友好的名字。无害，但在 `services.msc` 里看起来像没装完。

## 坑三：`ExpireTime` 不是封禁时长

这个是我一开始搞错的，也是最容易坑到人的一个。

我想要 24 小时封禁。我在配置里搜到 `ExpireTime`，差点就改了。真正的键是 **`BanTime`**：

```xml
<!-- The duration of time to ban an ip address (DD:HH:MM:SS) -->
<add key="BanTime" value="01:00:00:00"/>
```

`ExpireTime` 干的是完全另一件事——它是**失败登录计数**在被清零之前会被记住多久：

```xml
<!-- The duration after the last failed login attempt that the ip is forgotten
     (count reset back to 0). Set to 00:00:00:00 to use max duration. -->
<add key="ExpireTime" value="01:00:00:00"/>
```

两者的默认值都是 `01:00:00:00`，所以看起来像是可以互换的。它们不是。当你本想设 `BanTime` 却设了 `ExpireTime`，你的封禁时长根本没变——你只是悄悄改掉了攻击者累积次数的窗口。

格式是 `DD:HH:MM:SS`。所以 24 小时是 `01:00:00:00`，而 `00:00:00:00` 表示「9999 天」，也就是实际上永久。

还有第二个障眼法。`ipban.config` 里每个 `<LogFile>` 块都带一个自己的 `<FailedLoginThreshold>` 元素——而且**全部 25 个都是 `0`**，意思是「用全局默认值」。真正起作用的全局键是：

```xml
<!-- Number of failed logins before banning the ip address -->
<add key="FailedLoginAttemptsBeforeBan" value="5"/>
```

改那些 per-log 元素完全不会有任何效果。

## 怎样调 IPBan 又不搞丢配置

IPBan 把配置拆成两份：

| 文件 | 作用 |
|---|---|
| `ipban.config` | 官方默认值。**升级时会被覆盖——永远不要改。** |
| `ipban.override.config` | 你的设置。叠加在上面。改这个。 |

我实际在用的 `ipban.override.config`：

```xml
<appSettings>
  <!-- 不要封禁这些。白名单优先级高于黑名单。 -->
  <add key="Whitelist"
       value="192.168.1.0/24,100.64.0.0/10,127.0.0.1,:?::1"/>

  <!-- 3 次失败登录即封禁（默认 5 次） -->
  <add key="FailedLoginAttemptsBeforeBan" value="3"/>

  <!-- 封禁时长，DD:HH:MM:SS。01:00:00:00 = 24 小时 -->
  <add key="BanTime" value="01:00:00:00"/>
</appSettings>
```

白名单这一项必须强调。IPBan 会监听 **20 个事件日志查询**，外加一堆日志文件——不只是 RDP，还有 OpenSSH、IIS、Exchange、MSSQL、MySQL、FTP、SMTP/IMAP/POP3、VoIP/SIP、VNC、Tomcat。上面任何一个都可能触发封禁。

如果你自己的地址不在白名单里，三次输错密码就能把你锁在自己的机器外面 24 小时。如果 RDP 是你唯一的远程通道、端口又是公开的，这就是个真实的恢复难题。白名单里的 IP 还会被单独放进一条 **Allow** 防火墙规则（`IPBan_GlobalWhitelist_0`），优先级更高。

注意在容器或 NAT 网络里你没法自己测试——当你的局域网和 Tailscale 段都进了白名单，就没有什么方便的办法从本机故意触发一次封禁。

## 常用命令

```bash
# 实时看日志
Get-Content C:\app\IPBan\logfile.txt -Wait -Tail 20

# 列出当前被封的 IP
C:\app\IPBan\DigitalRuby.IPBan.exe list

# 手动封禁 / 解封
C:\app\IPBan\DigitalRuby.IPBan.exe ban 203.0.113.9
C:\app\IPBan\DigitalRuby.IPBan.exe unban 203.0.113.9
C:\app\IPBan\DigitalRuby.IPBan.exe unban all
```

所有封禁都在同一条防火墙规则里，每个周期重写一遍，所以 GUI 是找错地方了——`list` 才是真相来源。

## 结果

第一个小时内封掉 16 个攻击 IP，迁移全程没有防护空窗：

- **12 个是导入**自 RDPGuard，所以卸载它没有放走任何东西
- **4 个是 IPBan** 自己抓的，其中一个还是在迁移过程中来的

IPBan 启动时会记录 `Remote ip address:`，这是确认服务把你哪个地址当作客户端的好办法。要验证配置是否真的生效，比看起来要难——IPBan 在文件变动时会**热重载**并记录 `Config file changed`，但它不会重新打印你的设置。完整重启（`Restart-Service IPBAN -Force`）需要管理员权限；在非提权 shell 里你会得到 `System error 5 / Access is denied`，然后可能误以为重启成功了，其实什么都没发生。

## 我会怎么改

- **卸载任何东西之前，先导出封禁列表。** 这一步要放到第一位，而不是事后补。任何独占防火墙规则的工具，都会连封禁列表一起带走。
- **读封禁记录，不只是看 IP。** 那些被尝试的用户名告诉我，这是有针对性的攻击。
- **不要只 grep 一个听起来像的键名——读它上面的注释。** `BanTime` 和 `ExpireTime` 默认值相同，这正是设错了还能通过测试的原因。
- **当官方安装脚本会让你的配置成为孤儿时，宁可自己用 `sc.exe`。** 如果你已经把某个版本解压到别处，再「正规地」装到 `Program Files`，等于把数据库和设置丢在原地。
- **治根，不要只治症。** 这类工具全都是在失败登录**之后**才反应。每个攻击者在每个封禁窗口内依然能试满它那个阈值次，而且 IP 无限多。真正耐久的做法是不发布 3389——限制为局域网和 VPN 段可达，让拦截工具只处理剩下的部分。

拦截工具只是缓解措施。如果一个端口本来不需要面向互联网，关掉它比防守它划算。

## 需要为你的业务做这个吗？

如果你有 Windows 服务器把 RDP、SQL 或邮件服务暴露在公网上，我可以帮你搭这类暴力破解防护——自动封禁接入 Windows 防火墙、合理的阈值，以及一份不会把你自己锁在外面的白名单。

**WhatsApp：[+60 12-797 2969](https://wa.me/60127972969)** · **邮箱：[me@hoelee.com](mailto:me@hoelee.com?subject=RDP%20brute-force%20protection)** · **[hoelee.com](https://hoelee.com)**

网站设计与开发是我的主业；服务器加固与自托管基础设施是它的另一半。
