---
title: "加固 Tor 洋葱服务:真正重要的是什么"
description: "出于对暗网的好奇,我把个人主页和 Git 服务器镜像了过去。这篇记录哪些加固扛得住、哪些会悄悄坏掉,以及值不值得把它当成服务卖给客户。"
pubDate: 2026-09-09
category: devops
tags: [tor, docker, security, self-hosting, networking]
ogImage: /og/hardening-a-tor-onion-service.png
banner: /banners/hardening-a-tor-onion-service.png
---

我对暗网产生了好奇。不是集市那一面,而是无聊的那一半:人们像注册商和云控制台出现之前那样自托管——跑自己维护的软件,用一个自己掌控的地址就能访问。

我回应好奇心的方式一向是动手做一个东西,于是实验就这样定了:把自己的网站镜像到 Tor 上。我的交互式个人主页在 [me.hoelee.com](https://me.hoelee.com),代码托管在一个 Gitea 实例 [git.hoelee.com](https://git.hoelee.com) 上。现在两者都有暗网分身:

- `hoeleegitkcng572znkbpyffppyulsdwv3aurrzlk7y7vlhknogswoqd.onion` — Gitea 镜像
- `hoeleeaiwowgndbxswegtdzoeupz7lkkechtqmurbmnpvwa4k3vyuyid.onion` — 个人主页镜像

研究怎么把它做好时,我在网上读到了很多讲 obfs4 好处的文章。最终让我的部署真正安全的东西,和那些阅读没什么关系。

那么,真正让一个洋葱服务安全的是什么?我设镜像时认真走了一遍全程,几个月后又回头检查了一遍。有一部分配置经受住了考验,有一部分已经悄悄坏掉,还有几件我原本对 Docker 的认知,被实测证明是错的。

## 真正保护源站的是三件事

只有最后一件需要花力气:

1. **协议本身。** 访客从不直连你的服务器。你的 tor 进程主动拨出、向 introduction point 注册,会合发生在 Tor 网络内部。单凭一次访问,访客拿不到你的 IP。
2. **Vanguards-lite。** Tor 0.4.7 起内置。它让 guard-discovery 攻击(攻击者反复制造 circuit 直到观察到你的 guard 中继)变得很难实施。你只要跑一个当前版本的 Tor 就白送这层防护。
3. **别让源站信息从其它渠道泄漏。** 洋葱主机暴露的现实路径不是流量分析。是你自己的机器在漏:某台 clearnet 服务被攻破,攻击者直接从硬盘读走你的洋葱密钥。公开站点镜像到洋葱是刻意的,内容关联我不担心;真正要管的是,存密钥的那台机器别同时跑着一堆开着的服务。

## 那些悄悄坏掉的东西

重检自己服务器时,是这些地方让我觉得花的时间值了。

**应用容器有完整的互联网访问。** 我在容器里跑了一行访问公网 IP 回显服务的命令,拿回了我的家庭 IP。之前*确实*有过一条基于 iptables 的阻断,但规则已经没了。主机防火墙会被接口变动、容器管理器重启、平台升级静默清空。一条没有任何机制重放、没有任何告警的阻断,不是阻断,是迷信。这件事让我下定决心:与其过滤应用的出网流量,不如干脆把它的出网彻底移除(见下文)。

**主机防火墙是关的。** INPUT 和 FORWARD 策略全是 ACCEPT,同一台机器上其它服务在全部接口上监听了好几十个端口。其中任何一个被打穿,这块盘上的洋葱密钥就归攻击者了。人们愿意花几个小时做 Tor 专属加固,却跳过这一步。

**运行中的 tor 和配置文件对不上。** 磁盘上的 torrc 写着 `SocksPort 0`;已经跑了几天进程,还在监听 127.0.0.1:9050。我改了文件,忘了重启容器。这里的实际影响很小,因为监听只在容器内部可达。但教训可以推广:你写的配置文件是愿望,进程实际在做什么才是真相。

**Tor 落后了一个安全版本。** 对一台存放敏感密钥的机器来说太旧了,而且我的日志里带着新版已修复的中继描述符解析 bug 的刷屏签名。升级后刷屏停了。

## 修好之后不再坏的修复

### 零出网,靠构造而不是靠过滤

两个容器放进 `internal: true` 的 Docker 网络,只有 tor 容器多一张网卡去访问 Tor 网络。

```yaml
networks:
  service_net:
    driver: bridge
    internal: true        # 没有网关,没有 MASQUERADE,没有出路
  egress:
    external: true        # 普通的带外网 bridge
```

应用现在就哪里都去不了:公网不行,局域网不行,连主机都不行——internal 网络根本没有网关。没有可被清空的 iptables,没有可被遗忘的开机任务,也没有可以静默衰退的余地。就算应用被攻破,攻击者拿到的只是一根指向 tor 的 socket,仅此而已。这是我认为唯一不可妥协的一条改动。

### 非 root,和 capability 的意外

镜像默认就是非 root 用户,而我想让应用继续监听 80 端口。标准建议是 `cap_add: NET_BIND_SERVICE`。没用。容器崩溃循环,报:

```
[FATAL] Server error: listen tcp 0.0.0.0:80: bind: permission denied
```

这个原因让我意外到用探针容器实测了一把:`grep Cap /proc/self/status` 显示 `CapBnd` 里有 bit 10(NET_BIND_SERVICE),而 `CapEff` 是零。Docker 给非 root 容器的 capability 只进 bounding set,不进 effective set,而 bind() 检查的是 effective set。一个非 root 进程去执行没有 file capability 的二进制,拿到的 effective set 就是空的,没有例外。所以答案很无聊:内部改用非特权端口。

```yaml
  app:
    user: "1000:1000"
    cap_drop: [ALL]
    security_opt: [no-new-privileges]
  tor:
    user: "100:101"
    cap_drop: [ALL]
    security_opt: [no-new-privileges]
```

tor 侧一行把访问重新映射:

```
HiddenServicePort 80 app:8080
```

访客仍然从洋葱地址的 80 端口进来。变的只是内部端口。

### 检查对的东西的 healthcheck

tor 镜像自带一个探 SOCKS 端口的 healthcheck。我刚把 SOCKS 关了,于是 healthy 永远变成了 unhealthy。用你真正想问的问题覆盖它:进程还活着吗?

```yaml
healthcheck:
  test: ["CMD", "pgrep", "-x", "tor"]
```

nginx 的坑更隐蔽。我的第一版用了 `wget --spider` 探根路径。站点返回 404(当时内容还没传),wget 以非零退出,容器被标成不健康。这个检查测的是内容,不是服务。`nc -z 127.0.0.1 80` 只测端口,别的什么都不测。

还有一件:tor 在启动时解析 `HiddenServicePort` 的目标地址。如果应用容器还没起来,tor 会报 "Unparseable address in hidden service port configuration" 然后崩溃循环。我在旧日志里看过它连续四次启动失败,没人发现,因为当时没有任何东西在看着。compose 里的 `depends_on` 修好了启动顺序。

### 属主地雷

换完新密钥后,我通过文件共享挂载把密钥材料拷了回去。之后的容器立刻崩溃循环:

```
[warn] Could not open "/var/lib/tor/.../hs_ed25519_secret_key": Permission denied
```

经共享写入的文件,属主是共享用户,不是 tor 运行的 uid。修复只需一条命令,在哪里都能跑,包括挂上卷的一次性容器:

```bash
docker run --rm -v /path/libTor:/var/lib/tor alpine \
  sh -c "chown -R 100:101 /var/lib/tor && chmod -R 700 /var/lib/tor"
```

### 验证,而不是相信

上面每个修复都有一个我自己能跑的测试收尾。我最喜欢出网这条,因为两个探针放在一起最有说服力:同一个 wget,在应用的网络里失败,在 tor 的出网网络里成功。

```bash
# 在应用里:internal:true 之下,连 DNS 都应该失败
wget -T 6 -qO- http://ipv4.icanhazip.com     # → "wget: bad address", exit 1

# 同一个探针,放在 tor 的出网网络上,作为对照组
wget -T 6 -qO- http://ipv4.icanhazip.com     # → <你的 IP>, exit 0
```

如果没法 exec 进容器,就挂一个一次性探针容器到同一个网络。它测的是网络的属性,而那正是你加固的对象。

## 值得把它做成服务吗?

我一直在想这件事,因为边际成本几乎为零:tor 容器和它的隔离措施本来就在跑。

我大多数托管客户想要的和洋葱服务正好相反。他们想被 Google 搜到。卖一个只能在 Tor Browser 里打开的网站,等于卖给他们大概率用不上的隐秘性,还要负责教他们的访客安装 Tor Browser。

但确实有一小块真实市场。交换草稿的律师、审计师、交付数字商品的人,任何想分享一份永远不该出现在搜索引擎索引里的档案的人。对这类客户,销售话术自己就写好了:没有端口转发,没有域名,没有你控制不了的平台上留日志,只有一个你亲手交给该拿到的人的地址。

有个卖点比我预想的好使,它连着一个人人都会问的问题:地址开头能自己选吗?v3 洋葱地址是随机的,但那只是因为密钥是随机的。地址可以挖:不断生成密钥对,直到 base32 地址以你想要的前缀开头。每多一个字符,工作量乘以 32。社区挖矿工具在现代 GPU 上每秒能检查几百万个地址,这意味着 8 字符前缀是"一天到几天"的活,9 字符需要耐心地挖上几周,10 字符则是严肃的多 GPU 投入。一个以客户品牌开头的前缀,能把一行难记的 56 字符地址变成他们可以确认"这真的是你"的东西——在一个信任就是全部产品的细分市场里,这是实打实的价值。8 字符我乐意挖,9 字符为了付费客户可以,10 字符只有在对方自己租 GPU 的情况下我才会一脸平静地报价。

所以:作为给少数特定客户的附加服务,值得;作为一条产品线,不值。市场太薄,撑不起渠道,而且支持成本不会随规模摊薄。"带洋葱地址的隐私咨询",可以;"洋葱托管"作为一个网站套餐,那是别人的生意。

## 最后留下的

- **跑测试,别读配置文件。** 容器内探针和健康状态是真相,yaml 只是意图。
- **优先选择无法静默解体的机制。** `internal: true` 永远胜过 iptables 开机任务。
- **healthcheck 很便宜。** 它几分钟就抓到了一个崩溃循环,而之前没人看着,坏了好几天。
- **朴素的主机防火墙比花哨的 Tor 加固重要。** 如果攻击者能直接从一个开着的端口走进来,就不会有人费劲用流量分析去匿名化你。