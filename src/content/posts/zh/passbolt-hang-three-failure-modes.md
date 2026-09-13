---
title: "Passbolt 界面反复卡死——一个缺失的配置文件引发的三种故障模式"
description: "自托管的 Passbolt 连续几周返回 504：GPG 指纹为空卡住邮件投递，重建容器抹掉了修复，代理后面的 ssl.force 又造成无限重定向。"
pubDate: 2026-09-13
category: devops
tags: [passbolt, docker, gpg, smtp, reverse-proxy, portainer]
ogImage: /og/passbolt-hang-three-failure-modes.png
banner: /banners/passbolt-hang-three-failure-modes.png
---

我在 Synology NAS 上用 Docker 跑 Passbolt——一个开源的团队密码管理器，前面
挂着一层 nginx 反向代理。连着几周的某个坏习惯让我头疼：Web 界面动不动就
卡死，返回 `504 Gateway Timeout`，偏偏在正需要密码的时候拒绝交出任何凭据。
这是追查那个卡死毛病到根因的记录——以及我自己那个"修复"又引出一个全新故障
模式的转折。

## 为什么这件事值得写

密码管理器是唯一一个不能掉链子的应用。当我正和客户谈到一半、需要服务器凭据
的时候，转圈的加载动画是绝对不能接受的。症状看起来毫无规律——有时正常、有时
504——但真正的根源只是一个缺失的文件，外加叠在上面的两个错误。如果你也在
Docker 里自托管 Passbolt，这三个坑里大概有一个正在前面等你。

## 症状：cron 卡住，界面跟着遭殃

Passbolt 每分钟跑一个 cron 任务处理它的邮件队列——找回链接、分享通知、测试
邮件。正常情况下一秒以内跑完。我这边每次要花 30–60 秒。

这为什么要紧？Passbolt 靠一组 PHP-FPM worker 提供 Web 界面。当 cron 任务在
发邮件时卡住，就会占住一个 worker。卡住的 cron 攒多了，worker 池就被耗尽——
普通页面请求开始排队，nginx 超时，于是你看到 504。

日志把话说得很明白：

```text
not starting: job is still running since ... (1m elapsed)
```

## 根源一：GPG 指纹为 null

Passbolt 用服务器 GPG 密钥加密存储 SMTP 设置。要用这些设置，它必须知道用哪把
密钥解密——这个值来自 `passbolt.gpg.serverFingerprint`，由配置文件
`/etc/passbolt/passbolt.php` 提供。

这个文件不存在。

于是指纹解析成 `null`，SMTP 设置的 GPG 解密失败，每个想发邮件的 cron 迭代都
卡在这个失败上。健康检查把它摊开来给你看：

```text
SMTP Setting errors: ... setDecryptKeyFromFingerprint():
Argument #1 ($fingerprint) must be of type string, null given
```

队列里还有一封名副其实的死邮件——一条几个月前就耗尽重试次数、永远发不出去的
`SMTP timeout` 记录。它每一分钟都被重新扫描一遍，雪上加霜。

```sql
DELETE FROM email_queue WHERE sent = 0 AND send_tries >= 4;
```

## 根源二：没活下来的修复（复发）

这里才是真正扎心的地方。这个 bug 我此前其实修过一次——通过在*容器内部*创建
`/etc/passbolt/passbolt.php`。两个星期后卡死回来了，文件也消失了。

原因：维护时我重建过容器，而 Docker 容器的可写层**天生就是临时的**。写进容器
文件系统（而不是挂载卷）的任何东西，都会在重建时消失。我的修复有效期和容器
一样长，而不是和部署一样长。

真正持久的三件套，全部活在*容器之外*：

1. 一个位于宿主机上的配置文件，通过 bind mount 挂进镜像的
   `/etc/passbolt/passbolt.php`：

```php
<?php
return [
    'App' => [
        'fullBaseUrl' => env('APP_FULL_BASE_URL', 'https://pass.example.com'),
    ],
    'passbolt' => [
        'gpg' => [
            'serverFingerprint' => 'A3DD9B762D48722C10CF88DDB5372E46A54E1419',
        ],
    ],
];
```

2. compose 里的 bind mount——让它在重建后存活的关键：

```yaml
volumes:
  - /volume1/docker/passbolt/session-config/passbolt.php:/etc/passbolt/passbolt.php:ro
```

3. 正确的环境变量名。我之前一直用 `PASSBOLT_GPG_SERVER_FINGERPRINT`，而
   Passbolt 会静默忽略它。真正的变量是 `PASSBOLT_GPG_SERVER_KEY_FINGERPRINT`
   ——而且它要的是**完整的 40 位指纹**，不是截短的：

```yaml
PASSBOLT_GPG_SERVER_KEY_FINGERPRINT: "A3DD9B762D48722C10CF88DDB5372E46A54E1419"
```

## 根源三：我自己造成的重定向循环

卡死修好之后，我把 Passbolt 从 5.14.3 升到 5.15.0。然后，打开
`https://pass.example.com/`，浏览器直接报：

```text
ERR_TOO_MANY_REDIRECTS
```

我以为是升级弄坏了什么。其实没有。罪魁祸首是我留在配置文件里的 `ssl.force`：

```php
'passbolt' => [
    'ssl' => [
        'force' => true,
    ],
],
```

Passbolt 的 SSL 强制中间件会检查请求的 scheme，而在 TLS 终止型反向代理后面，
这个 scheme **永远是 `http`**——因为代理（nginx）终结 TLS 连接后，把纯 HTTP
转发给容器。中间件看到 `http`，尽职尽责地重定向到 `https://同一条URL`，nginx
再把它当 `http` 转回来，循环往复，永无止境。

解法在于想清楚到底谁负责 SSL。如果反向代理已经在边缘强制 HTTPS，应用就**不该**
再强制一遍。把 `ssl.force` 从配置里删掉（把 TLS 交给 nginx），循环立刻消失。

这条通用规则不止适用于 Passbolt，所有挂在反向代理后面的应用都一样：**要么代理
终结 TLS，要么应用自己终结——两者永不兼得**。代理已经在处理的时候，千万别在
应用里再开 `ssl.force`。

## 换了我现在会怎么做

1. **配置放进卷，不放容器。** 我一旦用 `docker exec` 写文件，就等于答应了下一次
   重建时重做一遍。正确反应应当是：这东西需要扛过 `docker compose up` 吗？需要
   就进 bind mount，而不是可写层。
2. **先查真实的变量名。** 那个指纹环境变量让我多走了弯路，因为我信了一个 Passbolt
   根本不认的名字，而它不认的时候也不吭声。当某个配置值"不起作用"时，先去上游
   文档核对准确的 key，再怀疑别的。
3. **测公网 URL，别只信健康检查。** 健康检查每次通过，却完全没发现重定向循环——
   因为它从不走真实的公网代理路径。一条两秒的 `curl -I` 就能立刻暴露问题。

## 结果

卡死消失了：cron 从 30–60 秒降到 1 秒以内跑完，邮件队列清空，Web 界面毫秒级
响应而不是 504。Passbolt 现在跑着最新的 5.15.0，所有 GPG 和 SMTP 健康检查全绿
——而且这个修复是写成能扛过下一次容器重建的。

值得带走的经验：一个"偶尔卡死"的自托管服务，很少是真正的谜团。通常就是一个
缺失的配置值，只是以三种不同的方式浮出水面。修配置，不要修症状。

---

## 想要稳定的自托管基础设施？

如果你跑着 Passbolt、密码管理器、邮箱或仪表盘之类的服务，而且它们时不时抽风——界面
卡死、504、重启就消失的灵异问题——这正是我诊断和修复的范围。我熟悉 Docker、
反向代理和各种自托管技术栈，交付时会把一切整理成文档，让下一个人（或未来的你）
不用靠猜。

联系我：[me@hoelee.com](mailto:me@hoelee.com) 或 WhatsApp
[+60 12-797 2969](https://wa.me/60127972969)，也可以看看我在
[hoelee.com](https://hoelee.com) 做的事情。