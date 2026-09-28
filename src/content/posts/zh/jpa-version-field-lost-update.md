---
title: "那个把静默丢失更新变成 409 的 JPA 字段：@Version 乐观锁"
description: "在 REST + JPA 的读-改-写流程里，两个编辑同时保存同一条记录时，后保存者会静默覆盖先保存者的修改，而 API 两次都返回成功——JPA 的 @Version 乐观锁把这个静默丢失更新变成 HTTP 409 冲突：请求携带期望版本号，版本不符就拒绝写入，并提示客户端重新读取再试。"
pubDate: 2026-08-19
category: engineering
tags: [java, spring, jpa, hibernate, rest, testing]
ogImage: /og/jpa-version-field-lost-update.png
banner: /banners/jpa-version-field-lost-update.png
draft: false
---

两个人同时打开同一篇文章，两个人都改了，两个人都保存。其中一次
保存悄无声息地消失了——没有报错，没有警告，而且 API 对两次请求
都返回了 HTTP 200。

这就是丢失更新（lost update）问题，是读-改-写（read-modify-write）
API 里最安静的数据丢失 bug。我在做 Spring Boot 作品集 demo 时撞上
了它——这是一个 Spring Boot 3.5.16（Java 21）的 REST API，编辑器
从浏览器页面创建和更新文章。修法最终落在三处：JPA 实体上的一个
`@Version` 字段、请求契约里的一个字段、以及 API 层把它映射成
HTTP 409 Conflict 的一个异常。这篇文章就沿着真实代码走一遍这条路。

## 问题：一条编辑消失了，却谁都怪不上

为什么两个人保存同一条记录时，其中一个人的修改会消失？

跟着时间线走。编辑器 A 和编辑器 B 都拉取了同一篇文章。A 先保存：
行被更新，API 返回 200。B 稍后保存：行被*再次*更新，这次覆盖了
A 的文字，API 又返回 200。每个请求都成功；每个响应都告诉它的调用
方「你的保存就是这条记录的当前状态」——对其中一个人来说这是假话。
A 的编辑就这么没了，两个客户端都没有任何办法知道。

失败是静默的，因为它就是读-改-写流程的正常行为，不是异常。这正是
它在真实系统里存活的理由，也是为什么在要展示工程判断力的东西里，
值得把它修得干净。

## 我先试的方案：不带版本号的读-改-写，以及它为什么失败

我对更新流程的第一版草图是最直白的那种：`GET` 记录、编辑、
`PUT` 回去，只带新的标题和正文，什么都不带。

```text
GET  /api/posts/{id}    # 读取记录
PUT  /api/posts/{id}    # 写回新的标题和正文
```

服务端加载行、套用更新、返回 200。它无从知道在这一行数据上，客户端
在 `GET` 和 `PUT` 之间已经被别人动过——读取和写入是两个互不相干的
请求，契约里没有任何东西把它们连起来。最后写入的人赢，而两个写入
者都被告知成功。

在这里，200 比报错更糟。报错至少告诉输掉的那个客户端「出事了」，
给他们一个去查的理由。200 则告诉两个客户端「你们的保存就是记录
当前的状态」——对其中一个是撒谎。输掉的那次编辑现在哪儿都不存在：
屏幕上没有，数据库里也没有；而因为客户端相信自己保存成功了，
没有人会去找这份数据。

## 修法：一个 @Version 字段、一份契约、一个冲突

修法一共五小步，全部都在 demo 的源码里。

### 1. 实体随身携带一个版本列

```java
@Entity
@Table(name = "posts", indexes = @Index(name = "idx_posts_title", columnList = "title"))
@EntityListeners(AuditingEntityListener.class)
public class Post {

    @Id
    @GeneratedValue
    @UuidGenerator
    private UUID id;

    @Column(nullable = false, length = 160)
    private String title;

    @Column(nullable = false, length = 10_000)
    private String body;

    @Version
    private long version;
    // ...
}
```

`@Version` 告诉 Hibernate 把 `version` 当作乐观锁。它生成的每一条
`UPDATE` 都变成有条件的：

```sql
UPDATE posts
SET title = ?, body = ?, version = version + 1, ...
WHERE id = ? AND version = ?
```

如果这行数据的版本号已经和语句构造时的不一致，受影响行数为零，
Hibernate 就会拒绝这次 flush，而不是悄悄覆盖。实体从不用手自增
计数器——更新方法只碰 `title` 和 `body`；版本号跟着写入一起走。

### 2. 版本号进入 API 契约

锁如果客户端无法参与，就没有用，所以版本号在两个方向上都穿过
API。响应的 record 暴露它：

```java
public record PostResponse(UUID id, long authorId, String title, String body,
                           long version, Instant createdAt, Instant updatedAt) {
}
```

更新请求则要求把它带回来：

```java
public record UpdatePostRequest(
        @NotBlank @Size(max = 160) String title,
        @NotBlank @Size(max = 10_000) String body,
        @NotNull @Min(0) Long version) {
}
```

`UpdatePostRequest` 旁边的学习注记说得很直白：
「the expected version is part of the update
contract, making optimistic locking visible to clients.」
（期望的版本号是更新契约的一部分，让乐观锁对客户端可见。）

### 3. 在拥有写事务的 service 里检查版本

```java
@CachePut(cacheNames = "posts", key = "#postId")
@Transactional
public PostResponse updatePost(UUID postId, UpdatePostRequest request) {
    Post post = postRepository.findById(postId)
            .orElseThrow(() -> new PostNotFoundException(postId));
    if (post.getVersion() != request.version()) {
        throw new PostVersionConflictException(postId);
    }
    post.update(request.title().trim(), request.body().trim());
    return PostResponse.from(postRepository.saveAndFlush(post));
}
```

读取、比较、保存全部发生在一个 `@Transactional` 方法里——这正是让
检查诚实的那部分：版本号是和*写入那一刻*的行状态比较，而不是和
早前某个请求留下的快照比较。如果读取和写入分属不同事务，检查到的
就是这行数据已经离开的旧版本，整套机制就成了表演。`PostService`
的学习注记点名了这条规则：「service methods
centralize transaction boundaries, cache coherence, and
optimistic-locking rules.」（service 方法集中管理事务边界、缓存
一致性与乐观锁规则。）demo 还开着
`spring.jpa.open-in-view: false`，所以不会有残留的会话跨请求地
供给过期实体——行是在写入事务内部重新读取的。

显式的检查会确定性地挡掉过期请求。`@Version` 列在底层仍然有意义：
如果检查与 flush 之间恰好插进一次别的提交，那条有条件的 `UPDATE`
影响零行，Hibernate 照样拒绝这次写入。

### 4. 异常处理器把它映射成 409

异常本身带着客户端能直接照做的信息：

```java
public class PostVersionConflictException extends RuntimeException {

    public PostVersionConflictException(UUID postId) {
        super("Post %s has changed; fetch it again before retrying".formatted(postId));
    }
}
```

错误边界把它转成正确的 HTTP 应答：

```java
@ExceptionHandler(PostVersionConflictException.class)
ProblemDetail handleConflict(PostVersionConflictException exception) {
    return problem(HttpStatus.CONFLICT, "POST_VERSION_CONFLICT", exception.getMessage());
}
```

`HttpStatus.CONFLICT` 就是 HTTP 409，响应是一份 problem
document——一个 `type` URI、一个稳定的机器码
（`POST_VERSION_CONFLICT`）和一段人类可读的说明。demo 在配置里
开启了框架的 problem-details 支持
（`spring.mvc.problemdetails.enabled: true`），所以校验错误和所有
其他错误都共用同一种响应形状。

### 5. 整条链路，从头到尾

```text
过期的 PUT /api/posts/{id}
  -> PostService.updatePost 在事务内部重新读取这一行
  -> post.getVersion() != request.version()
  -> PostVersionConflictException: "fetch it again before retrying"
  -> ApiExceptionHandler.handleConflict
  -> HTTP 409, ProblemDetail with code POST_VERSION_CONFLICT
  -> 客户端知道自己的前提过期了
```

一个 `@Version` 字段、请求契约里的一个 `version`、一个异常、一个
handler 方法。Controller 什么都没改——`updatePost` 看起来还是普通
的 `PUT`。

## 为什么答案是冲突，而不是重试

当两个编辑器产出同一份记录的两种不同版本时，服务端无法知道哪一方
的意图才是被需要的。从各自作者的角度看，两次保存都正当；重放那条
过期的写入，只是重放同一次数据丢失。

诚实的结论就是 HTTP 对 409 的定义：请求与资源的当前状态冲突，
并且客户端被明确告知如何解决——「fetch it again before retrying」
（重新取一次再试）。输掉的客户端重新读取记录，看到另一位作者的
修改，由人来决定保留什么。静默覆盖变成了一处看得见的决策点——这
正是这件事的全部意义。

## 这个 demo 的其余部分证明了什么

版本字段只是一个小系统里的一层，而其余部分都能用同样的方式核实
——下面每一行都是仓库里的一个类或配置文件，不是一句口号：

| 层 | 做了什么 | 在哪 |
|---|---|---|
| 缓存 | 单篇文章读取使用有界 Caffeine 缓存（上限 500，TTL 10 分钟，都来自配置）；读取用 `@Cacheable`、更新用 `@CachePut`、删除用 `@CacheEvict`；`GET /api/showcase/cache` 暴露请求数、命中数、未命中数和命中率 | `CacheConfig`、`CacheProperties`、`ShowcaseMetricsController` |
| 安全 | 无状态 HTTP Basic + BCrypt；页面与读 API 公开，所有写操作需要 `EDITOR` 角色；本地默认是专用的非机密 `demo-editor`/`changeit` 账户，可用环境变量覆盖 | `SecurityConfig`、`application.yml` |
| 错误 | 请求 record 在边界处校验；一个 `@RestControllerAdvice` 返回一致的 problem document 和机器码——`POST_NOT_FOUND`（404）、`POST_VERSION_CONFLICT`（409）、带字段错误表的 `VALIDATION_FAILED`（400） | `CreatePostRequest`、`UpdatePostRequest`、`ApiExceptionHandler` |
| 配置 | 本地 profile 使用内存 H2 数据库（PostgreSQL 模式），`ddl-auto: update` 并预置示例文章；`prod` 选择 PostgreSQL，所有凭据来自 `APP_*` 环境变量，`ddl-auto: validate` | `application.yml`、`application-prod.yml` |
| 测试 | 一个 `@SpringBootTest` 套件断言：渲染的 Thymeleaf 页面、未认证 401 对编辑器 201、`VALIDATION_FAILED` 问题响应、公开搜索，以及重复读取后的缓存命中 | `DemoApplicationIntegrationTest` |

## 如果做真东西，我会怎么改

一旦这不再是本地 demo，有两件事立刻要变。项目 README 里两件都写了，
值得作为我自己的判断再重复一遍。

第一，schema 管理。我会在任何时候把 `ddl-auto` 设为 `validate` 之前，
先加 Flyway 或 Liquibase 迁移。demo 默认 profile 用的是 `update`，
在临时数据库上很方便，养成习惯就很危险——生产 schema 应该是
有版本管理的代码，而不是启动时的副作用。

第二，密钥。本地编辑器账户是刻意的非机密 demo 账户，带默认凭据。
做真东西的话，我会把凭据放进托管的密钥存储（managed secret store），
拿不到凭据就拒绝启动，而不是回退到默认值。`prod` profile 已经做到
所有凭据来自环境变量、不提交任何密钥——这正是我想要的形态，
只是不要那些回退值。

## 结果

过期的更新现在返回 HTTP 409，机器码 `POST_VERSION_CONFLICT`，而不是
一个静静丢掉另一位作者修改的 200。丢失不再可能悄悄发生：失败是
响亮的、可操作的——「fetch it again before retrying」——并且集成
测试套件端到端地断言了访问与校验行为。

整个修法就是一个字段上的一个注解，加上让版本号成为契约一部分的
管道代码。如果一条记录可能同时被两个人读取，这个字段就是「编辑
丢失」与「双方都看得见的冲突」之间的分界线。

我平时就做 Java/Spring 后端和全栈 Web 应用——从浏览器页面到数据库
的 REST API：JPA、乐观锁、缓存、校验和一整套集成测试。如果你的表单
或字段里也有「编辑悄悄消失」的问题，跟我说说：
[WhatsApp](https://wa.me/60127972969) ·
[me@hoelee.com](mailto:me@hoelee.com?subject=Spring%20Boot%20help) ·
[hoelee.com](https://hoelee.com)。