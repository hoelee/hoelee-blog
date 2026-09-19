---
title: "CodeIgniter 4.6 升级到 4.7：官方指南没说到的破坏性变更"
description: "CodeIgniter 4.7 官方升级指南列了八项破坏性变更。真正让我应用致命崩溃的那两项不在里面——而且它们属于同一类问题。"
pubDate: 2026-09-20
category: notes
tags: [codeigniter, php, upgrade, composer, breaking-changes, config, framework]
ogImage: /og/upgrading-codeigniter-46-to-47.png
banner: /banners/upgrading-codeigniter-46-to-47.png
draft: true
---

我把一个 CodeIgniter 4 应用从 4.6.3 升到了 4.7.4。我读了升级指南，把每一项文档化的破坏性变更都对着代码库核了一遍，确认没有一项影响到我。然后我跑了一下应用，它致命崩溃了两次。

两个致命错误属于同一类问题，而**升级指南里完全没提这类问题**。这是一篇短文，讲真正会坏的是什么，以及为什么指南没法提前警告你。

## 为什么这件事重要

Composer 有一条容易忘掉的作用域边界。`composer update` 只写 `vendor/`——也就是**系统作用域**，框架自己的文件，它可以随意替换。

而你的 `app/Config/*.php` 是**项目作用域**。那是你的文件。Composer 永远不会碰它们，升级指南对它们的措辞是"你可能想要合并这些变更"，而不是"这会导致崩溃"。

但当 4.7 的框架代码去读一个属性，而你 4.6 时代的配置类里根本没定义它时，你得到的是致命错误——不是废弃警告，不是 notice。指南没法穷举这件事，因为这个属性的集合是「新框架读什么」与「你的配置文件里恰好有什么」的交集，而它对后半边完全不可见。

如果你要升级一个落后不止一个 minor 版本的 CI4 应用，请为此留出预算。我花了一个小时左右，改了 14 个配置文件。

## 我先核了什么

4.7.0 文档化的破坏性变更，以及每一项是否适用：

| 文档化的变更 | 是否影响本应用 |
|---|---|
| `Model::insertBatch()` / `updateBatch()` 返回值变化 | 否——没用 Model |
| Entity 类型转换变更 | 否——没用 Entity |
| 验证规则变更（`regex_match`、`differs`） | 否 |
| 加密处理器默认值 | 否 |
| 上传文件／图片验证行为 | 否——没有上传 |
| `IncomingRequest` 内部变更 | 否 |
| 移除的 `Session` 类属性 | 否——见下文 |
| `PageCache` 构造函数签名 | 否——见下文 |

其中两项需要细看，结果两个都是**假警报**，值得讲一下，因为你如果只 grep，它们看起来和真命中一模一样：

**"移除的 `Session` 类属性"** —— 在配置里 grep `session`，立刻一片飘红。但那些属性（`sessionDriver`、`sessionCookieName` 之类）是我 `Config\App` **自己的属性**，并没有被移除。指南指的是 `Session` 类上的属性。同一个词，不同的类。

**"`PageCache` 构造函数签名变更"** —— 我确实引用了 `pagecache`，但只是把它作为 `Config\Filters` 里的一个 filter 别名。这并不等于继承或实例化这个类，而只有后者才会坏。**引用不等于子类。**

这两次核对教给我同一件事：**grep 找到的是「提及」，不是「使用」。** 要确认命中的那个类是指南说的那个类，以及你确实继承或调用了那个发生变化的东西。

## 指南里没有的两个致命错误

两个都在干净启动时冒出来。两个都是 4.7 框架代码要读、而 4.6 时代的配置文件没有定义的属性。

### 1. `Config\App::$permittedURIChars`

```
Undefined property: Config\App::$permittedURIChars
```

4.7 的 Router 要求这个属性，用它校验进来的 URI 字符。4.6 时代的 `App.php` 里没有它，于是 Router 在路由任何东西之前就抛异常了。

```php
// app/Config/App.php —— 追加到类里
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

4.7 的 `JSONFormatter` 要求它。这一个直接打断了应用的**报告引擎**——因为引擎的 JSON 响应是用 `json_decode()` 解的，失败信号在很下游才爆出来，表现为一个让人一头雾水的解析错误，而不是真正的"属性未定义"。

```php
// app/Config/Format.php —— 追加到类里
/**
 * CI4 4.7 compatibility: json_encode() depth limit.
 */
public int $jsonEncodeDepth = 512;
```

第二个值得多说一句。表面上看到的错误是：

```
Failed to parse JSON string. Malformed UTF-8 characters
```

指向编码问题。真实原因是缺一个配置属性。**当框架的错误信息描述的是症状而不是病因时，先去日志里找真正的异常，再照着你拿到的那句话行动**——我在一个从来没坏过的 UTF-8 上白白耗了时间。

## 怎么在它们咬到你之前找出剩下的

两个致命错误都是靠**运行应用**发现的。运行是可靠的方法，但你可以先一步靠"属性覆盖差异对比"把这一类问题一次挖出来。

思路是：解析 `vendor/` 里框架自带的配置默认值，再解析你项目里的配置类，列出前者有、后者缺的属性。这样你一次拿到整类问题，而不是每重启一次收获一个致命错误。

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

# 4.7 需要、而陈旧配置可能漏掉的属性所在类
for name in ['App', 'Cache', 'ContentSecurityPolicy', 'CURLRequest', 'DocTypes',
             'Email', 'Encryption', 'Exceptions', 'Format', 'Honeypot',
             'Migrations', 'Paths', 'Routing', 'Toolbar', 'View']:
    missing = props(sys_ / f'{name}.php') - props(app_ / f'{name}.php')
    if missing:
        print(name, '->', sorted(missing))
```

在 `composer update` **之后**、启动应用**之前**，拿新的 `vendor/` 跑一遍。它打印出来的任何东西都是潜在的致命错误。

在这个项目里它标出了 14 个配置文件。我把缺失的属性合并进每一个文件，以标记块的形式追加在类的末尾，这样上面原有的设置和行为完全不动：

```php
    // ----------------------------------------------------------------
    // CI4 4.7 compatibility — properties the 4.7 framework reads.
    // Appended as a block so existing settings above are unchanged.
    // ----------------------------------------------------------------
```

框架新带出来的两个配置文件在项目里完全没有对应物，需要新建而不是合并：`Hostnames.php` 和 `WorkerMode.php`。直接从 `vendor/codeigniter4/framework/app/Config/` 拷过去就行。

## 升级前还值得知道的几点

**`app.baseURL` 的校验变严了。** 4.7 会对 4.6 接受的值抛 `ConfigException`。`'http://localhost/'`——这个值在我本地 `.env` 里躺了好几个月、一直好好的——现在直接抛异常。生产环境没受影响，因为它用的是真实 URL，但任何用了简写 baseURL 的开发环境都会拒绝启动。

**安全上的理由是真的。** 单是 4.7.4 就修了上传文件扩展名绕过（`is_image` / `mime_in`）、`deleteBatch()` 的 SQL 注入、以及 `UploadedFile::move()` 的路径穿越。这三个在本应用里都不可利用——它没有上传、也不碰数据库——但它们会在你加上这些功能的那一刻变成真实风险。**在你需要这些功能之前先升级，是更省事的顺序。**

**PHP 最低版本现在是 8.2。** 动手前先确认你的主机，不是事后。

## 如果重来一次，我会怎么改

**先拿新的 `vendor/` 跑一遍应用，别的什么都别做。** `composer update`、启动、然后修坏掉的地方。读指南告诉你可能变什么；只有运行告诉你实际变了什么。

**把属性差异对比当成常规动作。** 它把一串串行的调试过程变成一份报告。

**把升级做成独立的一次提交。** 我就是这么做的，这让两个致命错误变得极易二分定位——一条 `git show` 就精确告诉我每个错误是哪次改动引入的。把框架升级混进功能分支，会把五分钟的诊断变成一场考古。

**读 changelog，不要只读升级指南。** 指南列的是维护者判断「可能会弄坏你」的东西。changelog 列的是实际变了的东西。这两者不是同一个集合，而这两个致命错误正好住在两者的缝隙里。

## 结果

一个 17,000 行的 CodeIgniter 应用从 4.6.3 升到 4.7.4：合并 14 个配置文件、新增 2 个配置文件、找到并修复 2 个致命错误，所有路由验证返回 200——包括一次真实的报告生成，产出 19 页 A4，与升级前的基线在字节层面可比。应用日志零错误。

---

**手上跑着旧版 CodeIgniter？** 我做这类框架升级——CI4 minor 版本升级、PHP 版本迁移，以及那些升级指南默认你自己会搞定的配置合并工作。

[WhatsApp +60 12-797 2969](https://wa.me/60127972969) · [me@hoelee.com](mailto:me@hoelee.com?subject=CodeIgniter%20升级) · [hoelee.com](https://hoelee.com)
