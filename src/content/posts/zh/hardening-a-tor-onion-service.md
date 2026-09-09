---
title: "加固 Tor 洋葱服务:真正重要的是什么"
description: "一次对 Docker 化洋葱服务的审计、obfs4 的常见误解,以及五个被静默失效的加固项才是真正的风险——附修复方法和能证明它们的测试。"
pubDate: 2026-09-09
category: devops
tags: [tor, docker, security, self-hosting, networking]
---

有人建议我给 Docker 化的洋葱服务"服务器端"加上 obfs4。这是个出于好意的建议,也是个常见误解。这篇文章讲的是我实际审计这套栈之后发现的东西:哪些加固已经悄悄失效、哪些加固误解了 Docker 的机制、以及最后真正起作用的是什么。

**太长不看:** obfs4 对洋葱服务的服务器端毫无作用。真正的风险是:应用容器有完整的外网出口、主机防火墙整个没开、一份从未被重新加载的配置文件、以及落后一个安全版本的 Tor。全都是用最普通的工具就能修好的事。

## obfs4 的误解

obfs4 是一种 *pluggable transport*——它伪装的是**客户端→Tor** 的流量,让被封锁网络里的用户(DPI、审查环境)能接入 Tor 网络。它跑在 bridge 上,bridge 是伪装了流量的入口中继。

洋葱服务的服务器端用不上它。服务器是以"客户端"身份接入 Tor 网络的:它自己向 guard 建 circuit、向 introduction point 注册。这段流量走的是标准 Tor link 协议,不存在"服务器端 obfs4"这种模式。往你的栈里加一个 obfs4 bridge 容器,对你隐藏源站 IP 的帮助严格为零。(而且如果你在 CGNAT 后面,它客观上也不可行——bridge 需要一个公网可达端口。)

真正保护洋葱服务源站的是:

1. **协议本身。** 访客永远拿不到你的 IP——他们并不连接你;是你的 tor 实例主动外连,会合发生在 Tor 网络内部。
2. **Vanguards-lite。** Tor ≥ 0.4.7 内置,防御"guard discovery"攻击(攻击者反复制造 circuit 直到观察到你的 guard)。你只要*跑一个当前版本的 Tor* 就白送。
3. **别让源站信息从其它渠道泄漏。** 大多数自托管部署栽在这条上——而且它跟 Tor 配置毫无关系。

## 审计

栈的构成:一个文件浏览 Web 应用,只通过 Tor 隐藏服务对外,两者都在 Docker 里。tor → 应用走私有网络,两个容器都没有发布端口。这部分本来就是教科书做法。

逐层来看我的发现:

### ✅ 本来就做对的

- **零发布端口。** 应用和 tor 只在 Docker 网络内部可达。
- **Tor 基础加固。** `cap_drop: ALL`、`no-new-privileges`、非 root 运行、`SocksPort 0`、没有 ORPort/exit 配置。
- **选对了应用镜像。** 原版文件浏览器项目已停止维护;这套栈用的是仍在活跃维护的 fork("FileBrowser Quantum"),而且它本身就是按非 root 运行设计的。

### ❌ 悄悄坏掉的

**1. 应用容器有完整外网出口。** 我在容器里跑了一行命令访问公网 IP 回显服务,拿回了我的家庭 IP。之前*确实*有一个基于 iptables 的阻断任务,但规则没了——主机防火墙在某个时刻把链清空了(网络接口变动、容器管理器重启、平台更新都会这样静默地做)。教训:**建立在主机 iptables 上的容器隔离,如果没有任何机制重放、没有任何告警,就不算隔离。**

**2. 主机防火墙是关的。** INPUT/FORWARD 策略全是 ACCEPT,整台机器几十个端口在 0.0.0.0 上监听。对洋葱服务来说,这才是现实的去匿名化路径:不是花哨的流量关联分析,而是某台 clearnet 服务被普通攻破——之后攻击者直接从硬盘上读走你的洋葱密钥。**先守好密钥的安放处,再担心 guard discovery。**

**3. 运行中的 tor 和它的配置文件不一致。** 磁盘上的 torrc 写着 `SocksPort 0`;但进程已经跑了几天,还在监听 127.0.0.1:9050。某人(我)改了文件却没重启容器。这里的影响很小——只有容器内部能摸到——但它提醒了一件事:*它正在跑的配置,不等于磁盘上那份配置。*

**4. Tor 落后一个安全版本。** 单看不严重,但新版带着针对畸形中继描述符解析的修复——我的日志里正好全是那类 warn 刷屏签名,升级后就消失了。对一台存放敏感密钥的机器,安全版本我视为必升。

## 修复

### 零出网靠设计,不靠脚本

核心改动:把两个容器放进 `internal: true` 的 Docker 网络,只给 tor 容器第二块网卡去访问 Tor 网络。

```yaml
networks:
  service_net:
    driver: bridge
    internal: true        # 没有网关、没有 MASQUERADE、没有出路
  egress:
    external: true        # 普通的带外网 bridge
```

应用从此**哪里都去不了**——到不了公网、到不了局域网、连主机都到不了。`internal: true` 直接去掉网关,所以没有 iptables 可被清空、没有开机任务可被遗忘、没有静默衰退。就算应用被攻破,攻击者能拿到的最多是一个通向 tor 的 socket,仅此而已。它由 Docker 自己的网络机制强制,这也是它能扛过重启和 daemon 重启的原因。

### 非 root 化,以及为什么 `NET_BIND_SERVICE` 救不了我

镜像默认就是非 root 用户,而我想继续绑 80 端口。标准建议:`cap_add: NET_BIND_SERVICE`。没用。容器崩溃循环,报:

```
[FATAL] Server error: listen tcp 0.0.0.0:80: bind: permission denied
```

这个原因值得记住:**Docker 给非 root 容器的 capability 只放进 *bounding set*,不会放进 effective set。** 我用探针容器验证过——`grep Cap /proc/self/status` 显示 `CapBnd` 包含 bit 10(NET_BIND_SERVICE),而 `CapEff` 是 0。非 root 进程执行一个没有 file capability 的二进制,得到的是空的 effective set,而内核在 bind 时检查的是 *effective* set。所以别跟它搏斗:内部改用非特权端口(8080),把隐藏服务映射过去。

```yaml
  app:
    user: "1000:1000"
    cap_drop: [ALL]          # 空手运行;8080 上不需要 NET_BIND_SERVICE
    security_opt: [no-new-privileges]
  tor:
    user: "100:101"
    cap_drop: [ALL]
    security_opt: [no-new-privileges]
```

隐藏服务侧只需改一行:

```
HiddenServicePort 80 app:8080
```

访客仍然从洋葱地址的 80 端口进来;变的只是内部端口。

### 检查对的东西的 healthcheck

tor 镜像自带的 healthcheck 探的是 SOCKS 端口。我刚把 SOCKS 关了——于是"healthy"永久变成了"unhealthy"。用你真正关心的东西覆盖它:进程还活着吗?

```yaml
healthcheck:
  test: ["CMD", "pgrep", "-x", "tor"]
```

nginx 那边的坑更隐蔽:我先用了 `wget --spider` 探根路径。站点返回 404 时(当时内容还没传),wget 以非零退出,容器被标记为不健康——这个检查测的是*内容*,不是*服务*。`nc -z 127.0.0.1 80` 只测端口,别的什么都不测。

另外补了 `depends_on`(tor 等应用先起):tor 在启动时解析 `HiddenServicePort` 的目标地址,如果应用容器还没起来,tor 会报 "Unparseable address in hidden service port configuration" 然后崩溃循环。我在旧日志里就见过这一幕——连续四次启动失败,没人注意到,因为没有任何东西在看着。

### 属主带来的地雷

换完服务密钥后,我通过文件共享挂载把密钥材料拷了回去。新容器立刻崩溃循环:

```
[warn] Could not open "/var/lib/tor/.../hs_ed25519_secret_key": Permission denied
```

经文件共享写入的文件,属主是共享用户,而不是 tor 运行的 uid 100。修复只有一条命令——在哪里跑都行,包括挂上卷的一次性容器:

```bash
docker run --rm -v /path/libTor:/var/lib/tor alpine \
  sh -c "chown -R 100:101 /var/lib/tor && chmod -R 700 /var/lib/tor"
```

此后给自己立的规矩:**任何经过文件共享的密钥文件,在下一次容器启动前必须先 `chown`。**

### 版本卫生

重拉 `osminogin/tor-simple:latest` → tor 0.4.9.11,当前安全线。配合 `SocksPort 0` 这次真正生效,日志刷屏停了,监听也没了。

## 验证,而不是相信

上面每个修复都有一个我自己能跑的测试收尾:

```bash
# 在应用里:internal:true 之下,连 DNS 都应该失败
wget -T 6 -qO- http://ipv4.icanhazip.com     # → "wget: bad address", exit 1

# 同一个探针,放到 tor 的出网网络上(对照组)
wget -T 6 -qO- http://ipv4.icanhazip.com     # → <家庭 IP>, exit 0
```

如果没法 exec 进容器,就挂一个一次性探针容器到*同一个网络*——它测的是网络的属性,而网络正是你加固的对象。最终状态:所有容器 healthy、隐藏服务在线且洋葱地址不变(密钥在持久卷上)、零发布端口、以及一个字面意义上连 `ipv4.icanhazip.com` 都解析不了的应用。

## 下次我会怎么做

1. **审计运行态,而不是配置文件。** 配置文件是愿望;`docker inspect`、容器内 `netstat`、实际出网探针才是真相。
2. **优先选择无法静默解体的机制。** `internal: true` 永远胜过 iptables 开机任务。
3. **healthcheck 是廉价的观测性分期付款。** 它抓到真问题的那天(我的在几分钟内就抓到了崩溃循环),就回本了。
4. **朴素的主机防火墙比花哨的 Tor 加固重要。** 如果整台机器 0.0.0.0 开放,洋葱服务的匿名性死于撬棍攻击,而不是关联分析。
5. **跳过插件,保持传输层干净。** 跑当前版 Tor(vanguards-lite 已内含)、关掉不需要的东西、隔离出网——你已经领先大多数洋葱部署了,不需要 obfs4。

---

*本文写作过程中,没有任何 IP、地址或基础设施细节受到伤害。*