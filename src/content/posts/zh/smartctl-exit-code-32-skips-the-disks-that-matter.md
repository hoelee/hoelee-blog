---
title: "smartctl 退出码 32：专门跳过你最该看的硬盘的那个\"错误\""
description: "把 smartctl 的任何非零退出码当成读取失败的监控脚本，恰好会跳过属性已经逼近阈值的那些盘。退出码 32 不是错误，而是一段历史。"
pubDate: 2026-04-14
updatedDate: 2026-09-29
category: notes
tags: [smart, smartctl, unraid, monitoring, bash, disks, homelab]
ogImage: /og/smartctl-exit-code-32-skips-the-disks-that-matter.png
banner: /banners/smartctl-exit-code-32-skips-the-disks-that-matter.png
draft: false
---

我的硬盘健康采集脚本连续几周都是\"全绿\"。每块盘都有温度、通电小时数和 SMART 结论，指标看起来完整——直到我数了一下只有 **4 块 SSD 里的 2 块**。

不是故障，是**消失了**。脚本认定这两块盘不存在。

## 问题出在把退出码当布尔值

采集脚本遍历块设备、对每块盘跑 `smartctl`、再写 Prometheus textfile 指标。错误处理看起来挺防御：

```bash
for dev in /dev/sd?; do
  if ! smartctl -A -H "$dev" > /tmp/smart.out 2>&1; then
    continue          # "盘不支持 SMART / 读不到"
  fi
  # 解析并输出指标
done
```

`if ! cmd` 是布尔判断，但 `smartctl` 的退出状态**不是布尔值，是一个位域**。把位域当真假用，就是这次翻车的原因。

## 退出码 32 的真实含义

`man smartctl` 里这些位是独立累加的：

| 位 | 值 | 含义 |
|---|---|---|
| 0 | 1 | 命令行解析失败 |
| 1 | 2 | 设备打开失败 / 无 IDENTIFY DEVICE 结构 |
| 2 | 4 | SMART 或 ATA 命令失败、校验和错误 |
| 3 | **8** | SMART 状态为 **DISK FAILING** |
| 4 | **16** | 有预失效属性 **<= 阈值** |
| 5 | **32** | SMART 状态 **OK**，但某些属性**曾经**低于阈值 |
| 6 | 64 | 设备错误日志中有记录 |
| 7 | 128 | 自检日志中有失败记录 |

所以 `32` 的意思和\"读不到盘\"正好相反：**现在没问题，但它曾经踩过阈值。** 这正是应该持续盯着的那类盘——而我的脚本把它们丢掉了。

消失的两块盘，恰好是原始属性长期处在边缘值的那两块；退出码为 `0` 的\"健康盘\"被正常采集。**这个过滤器实际上筛选出了\"没有任何历史可报告\"的盘。**

## 修法：把\"信息位\"掩掉

对监控来说，位 32 和 64 是信息；位 8 和 16 才是该告警的。掩掉信息位，只对剩下的做判断：

```bash
smartctl -A -H -d sat "$dev" > /tmp/smart.out 2>&1
rc=$?

# fatal bits: 1 (parse), 2 (open), 4 (command/checksum), 8 (FAILING)
# informational bits: 32 (was below threshold in the past), 64 (error log has records)
fatal=$(( rc & ~(32 | 64) ))
if [ "$fatal" -ne 0 ]; then
  echo "device $dev unreadable or failing (rc=$rc)" >&2
  continue
fi

# emit the verdict AND the exit code, so the code itself is a metric
echo "disk_smart_exit_code{device=\"$dev\"} $rc"
echo "disk_smart_health{device=\"$dev\"} $(( rc & 8 ? 0 : 1 ))"
```

三点改变：

1. **退出码变成数据，而不是控制流。** 它作为指标被导出，磁盘从 `0` → `32` → `64` 的漂移会变成趋势，而不是一次静默跳过。
2. **信息位不再致命。** 有历史的盘被采集，这才是监控它们的目的。
3. **NAS 上 `-d sat` 很关键。** 在 Synology DSM（以及某些 USB 桥接）上，设备类型不对时 `smartctl` 拿不到有用输出——症状同样是\"盘消失\"，原因却不同。

## 我下次会怎么做

- **面对有\"退出码位域\"文档的工具，永远不要写 `if ! cmd`。** 先把手册里的退出码那节读完。
- **除了\"采集器有没有跑\"，还要数\"采到了几块盘\"。** 我的告警是\"采集器过期\"，真正的 bug 是\"采集器正常跑了，只报了 50% 的盘\"。一个 `disk_count` 指标就能立刻暴露。
- **把\"这个设备没有数据\"本身当成可告警状态。** 缺失的序列是不可见的，所以它存活了好几周。

## 结果

采集器从 2 块可用盘变成 4 块，每块都报温度、通电小时数、SMART 状态和原始退出码——共 122 个 textfile 指标，包括我真正想要的 btrfs 错误计数。重新出现的那两块，正是长期处在边缘属性值的盘。

一个会跳过自己最坏信号的监控流水线，比没有监控更糟——因为它一直告诉你一切正常。

## 需要为你的业务做这个吗？

如果你在跑 NAS 或服务器机架，想让硬盘健康真正\"会通知你\"——SMART 属性、温度、btrfs/RAID 错误计数，并推到 Telegram 或邮件——这类自托管监控流水线我可以帮你搭。

**WhatsApp：[+60 12-797 2969](https://wa.me/60127972969)** · **邮箱：[me@hoelee.com](mailto:me@hoelee.com?subject=Disk%20health%20monitoring)** · **[hoelee.com](https://hoelee.com)**

网站设计与开发是我的主业；服务器加固与自托管基础设施是它的另一半。
