---
title: "The JPA Field That Turns a Silent Lost Update Into a 409"
description: "How a JPA @Version field turns a silent lost update into a 409 conflict — optimistic locking makes a stale REST write fail loudly instead of overwriting."
pubDate: 2026-08-19
category: engineering
tags: [java, spring, jpa, hibernate, rest, testing]
ogImage: /og/jpa-version-field-lost-update.png
banner: /banners/jpa-version-field-lost-update.png
draft: false
---

Two people open the same post. Both edit it. Both save. One of the saves
disappears without a trace — no error, no warning, and the API answered
HTTP 200 for both of them.

That is the lost update problem, and it is the quietest data-loss bug in
read-modify-write APIs. I hit it while building my Spring Boot portfolio
demo — a Spring Boot 3.5.16 (Java 21) REST API where editors create and
update posts from a browser page. The fix turned out to be one `@Version`
field on the JPA entity, one field on the request contract, and one
exception that the API layer maps to HTTP 409 Conflict. This post traces
that path through the actual code.

## The problem: an edit that vanishes with no one to blame

Why does one editor's change disappear when two people save the same
record?

Follow the timeline. Editor A and editor B both fetch the same post.
A saves first: the row is updated and the API answers 200. B saves a
moment later: the row is updated *again*, this time over A's text, and
the API answers 200 again. Every request succeeded; every response told
its caller that their save is the state of the record. A's edit is
simply gone, and neither client has any way to know.

The failure is silent because it is normal read-modify-write behaviour,
not an anomaly. That is exactly why the bug survives in real systems, and
why it is worth fixing properly in something meant to demonstrate
engineering judgement.

## What I tried first, and why it failed

My first sketch of the update flow was the obvious one: `GET` the record,
edit it, `PUT` it back with the new title and body and nothing else.

```text
GET  /api/posts/{id}    # read the record
PUT  /api/posts/{id}    # write it back with a new title and body
```

The server loads the row, applies the update, and returns 200. It has no
way to notice that the row moved underneath the client between the `GET`
and the `PUT` — the read and the write are two unrelated requests, and
nothing in the contract connects them. The last write wins, and both
writers are told they succeeded.

A 200 is worse than an error here. An error at least tells the losing
client that something happened and gives them a reason to look. A 200
tells both clients that their save is the current state of the record,
which is a lie for one of them. The losing edit now exists nowhere — not
on screen, not in the database — and because the client believes it
saved, nobody goes looking for the data.

## The fix: a @Version field, a contract, and a conflict

The fix is five small parts, all of them in the demo's source.

### 1. The entity carries a version column

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

`@Version` tells Hibernate to treat `version` as an optimistic lock. Every
`UPDATE` it generates becomes conditional:

```sql
UPDATE posts
SET title = ?, body = ?, version = version + 1, ...
WHERE id = ? AND version = ?
```

If the row's version no longer matches the value the statement was built
with, zero rows change and Hibernate rejects the flush instead of quietly
overwriting. The entity never bumps the counter by hand — the update
method only touches `title` and `body`; the version moves with the write
itself.

### 2. The version is part of the API contract

A lock is useless if the client cannot take part in it, so the version
travels through the API in both directions. The response record exposes
it:

```java
public record PostResponse(UUID id, long authorId, String title, String body,
                           long version, Instant createdAt, Instant updatedAt) {
}
```

and the update request requires it back:

```java
public record UpdatePostRequest(
        @NotBlank @Size(max = 160) String title,
        @NotBlank @Size(max = 10_000) String body,
        @NotNull @Min(0) Long version) {
}
```

The learning note next to `UpdatePostRequest` says it plainly: "the
expected version is part of the update contract, making optimistic
locking visible to clients."

### 3. The service checks it inside the transaction that owns the write

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

The load, the comparison and the save all happen inside one
`@Transactional` method, and that is the part that makes the check
honest: the version is compared against the row as it stands *at write
time*, not against a snapshot from an earlier request. If the read and
the write lived in different transactions, the check would compare
against a version the row has already left behind, and the whole scheme
would be theatre. The learning note on `PostService` names the rule:
"service methods centralize transaction boundaries, cache coherence, and
optimistic-locking rules." The demo also runs with
`spring.jpa.open-in-view: false`, so no lingering session serves a stale
entity across requests — the row is re-read inside the writing
transaction.

The explicit check catches stale requests deterministically. The
`@Version` column still matters underneath: if another commit slips in
between the check and the flush, the conditional `UPDATE` affects zero
rows and Hibernate refuses the write anyway.

### 4. The handler maps the exception to a 409

The exception itself carries the message a client can act on:

```java
public class PostVersionConflictException extends RuntimeException {

    public PostVersionConflictException(UUID postId) {
        super("Post %s has changed; fetch it again before retrying".formatted(postId));
    }
}
```

and the error boundary turns it into the right HTTP answer:

```java
@ExceptionHandler(PostVersionConflictException.class)
ProblemDetail handleConflict(PostVersionConflictException exception) {
    return problem(HttpStatus.CONFLICT, "POST_VERSION_CONFLICT", exception.getMessage());
}
```

`HttpStatus.CONFLICT` is HTTP 409, and the response is a problem document
— a `type` URI, a stable machine code (`POST_VERSION_CONFLICT`) and a
human-readable detail. The demo enables the framework's problem-details
support in its configuration (`spring.mvc.problemdetails.enabled: true`),
so validation and every other error ride the same shape.

### 5. The whole path, end to end

```text
stale PUT /api/posts/{id}
  -> PostService.updatePost re-reads the row inside its transaction
  -> post.getVersion() != request.version()
  -> PostVersionConflictException: "fetch it again before retrying"
  -> ApiExceptionHandler.handleConflict
  -> HTTP 409, ProblemDetail with code POST_VERSION_CONFLICT
  -> the client knows its premise was stale
```

One `@Version` field, one `version` in the request contract, one
exception, one handler method. Nothing on the controller changed —
`updatePost` still looks like an ordinary `PUT`.

## Why a conflict is the correct answer, not a retry

When two editors produce two different versions of the same record, the
server cannot know which intent is the one meant. Both saves are
legitimate from their authors' point of view, and replaying the stale
write just replays the same data loss.

The honest verdict is HTTP's own definition of 409: the request conflicts
with the current state of the resource, and the client is told exactly
how to resolve it — "fetch it again before retrying". The losing client
re-reads the record, sees the other writer's change, and a human decides
what to keep. The silent overwrite becomes a visible decision point,
which is the entire purpose of the exercise.

## What the rest of the demo proves

The version field is one layer of a small system, and the rest of it is
verifiable the same way — every row below is a class or a config file in
the repository, not a claim:

| Layer | What it does | Where it lives |
|---|---|---|
| Caching | Bounded Caffeine cache on single-post reads (max 500, TTL 10 min, both from config); `@Cacheable` on read, `@CachePut` on update, `@CacheEvict` on delete; `GET /api/showcase/cache` exposes requests, hits, misses and hit rate | `CacheConfig`, `CacheProperties`, `ShowcaseMetricsController` |
| Security | Stateless HTTP Basic with BCrypt; pages and read APIs are public, every mutation needs the `EDITOR` role; local defaults are a throwaway `demo-editor`/`changeit` account overridable via env vars | `SecurityConfig`, `application.yml` |
| Errors | Request records validate at the boundary; one `@RestControllerAdvice` returns consistent problem documents with machine codes — `POST_NOT_FOUND` (404), `POST_VERSION_CONFLICT` (409), `VALIDATION_FAILED` (400) with a field-error map | `CreatePostRequest`, `UpdatePostRequest`, `ApiExceptionHandler` |
| Configuration | Local profile runs an in-memory H2 database in PostgreSQL mode with `ddl-auto: update` and seeded sample posts; `prod` selects PostgreSQL, takes every credential from `APP_*` env vars and sets `ddl-auto: validate` | `application.yml`, `application-prod.yml` |
| Tests | One `@SpringBootTest` suite asserts the rendered Thymeleaf pages, unauthenticated 401s versus editor 201s, the `VALIDATION_FAILED` problem response, public search, and cache hits after repeated reads | `DemoApplicationIntegrationTest` |

## What I would do differently for anything real

Two things change the moment this stops being a local demo. The project
README says both, and they are worth repeating as my own judgement.

First, schema management. I would add Flyway or Liquibase migrations
before ever setting `ddl-auto` to `validate`. The demo's default profile
uses `update`, which is convenient on a scratch database and dangerous as
a habit — production schema should be versioned code, not a side effect
of startup.

Second, secrets. The local editor account is intentionally a non-secret
demo account with default credentials. For anything real, I would keep
credentials in a managed secret store and refuse to boot without them,
instead of falling back to a default. The `prod` profile already takes
every credential from environment variables with no committed secrets —
that is the shape I would keep, minus the fallbacks.

## The result

A stale update now returns HTTP 409 with code `POST_VERSION_CONFLICT`
instead of a 200 that silently discards the other writer's change. The
loss can no longer happen quietly: the failure is loud, actionable —
"fetch it again before retrying" — and the integration test suite asserts
the access and validation behaviour end to end.

The whole fix is one annotation on one field, plus plumbing that makes
the version part of the contract. If a record can be read by two people
at the same time, that field is the difference between a lost edit and a
conflict both clients can see.

I build Java/Spring back ends and full-stack web applications — REST APIs
with JPA, optimistic locking, caching, validation and integration tests,
from the browser page down to the database. If you have a form or a field
where edits keep quietly disappearing, tell me about it:
[WhatsApp](https://wa.me/60127972969) ·
[me@hoelee.com](mailto:me@hoelee.com?subject=Spring%20Boot%20help) ·
[hoelee.com](https://hoelee.com).