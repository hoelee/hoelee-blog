---
title: "与其看供应商文档，不如直接读容器自带的 API 文档"
description: "当 API 文档藏在登录墙后面、甚至根本不存在时，镜像本身就是唯一的事实来源：四条 Docker 命令，就能挖出 API 规范、配置契约，以及它真正监听的端口。"
pubDate: 2025-10-01
updatedDate: 2026-09-26
category: notes
tags: [docker, openapi, api, documentation, debugging, reverse-engineering]
ogImage: /og/reading-a-containers-own-api-docs.png
banner: /banners/reading-a-containers-own-api-docs.png
draft: false
---

我需要对接一个供应商自托管的 API。他们的文档是有的，但挡在账号登录后面；
而我能看到的那一页，只描述了 API *能*做什么，没说该怎么配置。与此同时，
容器就安安静静地躺在我机器上——而答案就在它里面。

现在，凡是文档单薄、要登录、或者压根没有的镜像，我都会先跑这套命令。
下面所有操作都是只读的，也不需要进入容器开 shell。

## 为什么这很重要

1. **供应商文档描述的是理想路径；容器描述的才是契约。** 确切的 env 变量名、
   默认值、暴露的端口、是否需要配置文件——这些在营销页面上都不可靠。
2. **很多镜像压根没有文档**——私有仓库、内部构建，或是别人拉了又推上去的
   社区镜像。构件本身是唯一权威。
3. **版本漂移是真实存在的。** 网站上的文档描述的是最新版本；而你正在跑的
   镜像可能是两年前的了。读构件，了解的是你实际部署的那个东西。

## 1. 不运行镜像，直接读里面的文件

最有用的一招：覆盖 entrypoint，把镜像当成文件系统来用。

```bash
# what's in there?
docker run --rm --entrypoint ls <image> -la /app

# does it ship an API spec?
docker run --rm --entrypoint cat <image> /app/public/openapi.yml | head -40
```

第二条命令直接在镜像里返回了一份完整的 OpenAPI 3.1 规范，27 KB——每个端点、
请求体 schema、认证模型，一应俱全。不用登录、不用账号、没有文档墙。

如果你还不知道文件布局，用 `--entrypoint find` 能覆盖更广：

```bash
docker run --rm --entrypoint find <image> / -maxdepth 3 \
  -name '*.yml' -o -name '*.yaml' -o -name '*.json' 2>/dev/null | head -30
```

## 2. 从 bundle 里挖出配置契约

真正会让你卡住的往往是 env 变量名——一个没有默认值的必需变量，意味着容器
启动时就挂掉，通常还带一条毫无帮助的错误信息。直接问源码吧：

```bash
docker run --rm --entrypoint grep <image> \
  -rhoE 'process\.env\.[A-Za-z_][A-Za-z0-9_]*' /app/dist | sort -u
```

```
AUTH_SECRET
DEBUG
HOST
LOKI_HOST
METRICS_TOKEN
PORT
USER_TIMEOUT
WORKER_TIMEOUT
WORKER_PATH
```

九个变量名，整个配置面就清楚了。想看默认值，用带上下文的 grep 抓你关心的
那一个：

```bash
docker run --rm --entrypoint grep <image> \
  -ohE '.{0,80}process\.env\.PORT.{0,80}' /app/dist/index.js
```

```js
serverPort: parseInt(process.env.PORT) || 3e3,
serverHost: process.env.HOST || "0.0.0.0",
workerTimeout: parseInt(process.env.WORKER_TIMEOUT) || 600*1e3,
```

`PORT` 默认是 3000，host 默认是 `0.0.0.0`，worker 每十分钟回收一次。一条命令
就消掉了三个不确定的决策点。这套办法适用于任何 Node/Python 镜像；对 Go 或
Rust 的二进制，同样的思路，只是把 grep 换成对二进制跑 `strings`。

## 3. 不拉镜像，直接查镜像配置

在慢速网络下，或者在决定下载 1 GB 镜像之前，你可以直接从 registry 读取镜像
的元数据。本地连 Docker daemon 都不需要：

```bash
REPO=synology/spreadsheet-api
TAG=3.4.1

TOKEN=$(curl -s "https://auth.docker.io/token?service=registry.docker.io&scope=repository:$REPO:pull" \
  | python -c "import json,sys; print(json.load(sys.stdin)['token'])")

# manifest (follow the platform entry if it's a multi-arch index)
curl -s -H "Authorization: Bearer ***" \
  -H 'Accept: application/vnd.docker.distribution.manifest.v2+json' \
  "https://registry-1.docker.io/v2/$REPO/manifests/$TAG" \
  | python -c "import json,sys; m=json.load(sys.stdin); print(m['config']['digest'])"
```

然后取回那个 config blob，把关心的字段打印出来：

```bash
curl -s -H "Authorization: Bearer ***" \
  "https://registry-1.docker.io/v2/$REPO/blobs/<config-digest>" \
  | python -c "
import json,sys
c = json.load(sys.stdin)['config']
print('Env:       ', c.get('Env'))
print('Entrypoint:', c.get('Entrypoint'))
print('Cmd:       ', c.get('Cmd'))
print('Workdir:   ', c.get('WorkingDir'))
print('Ports:     ', list((c.get('ExposedPorts') or {}).keys()))"
```

```
Env:        ['PATH=...', 'NODE_VERSION=22.18.0', 'WORKER_PATH=/app/dist/spreadsheet_worker.js']
Entrypoint: ['docker-entrypoint.sh']
Cmd:        ['node', 'dist/index.js']
Workdir:    /app
Ports:      []
```

还没下载一个字节，就有两条有用信息跳出来了：这是个 Node 服务，而且它**没有
声明任何暴露端口**——所以任何端口映射都得靠 `PORT` 变量，而不是 `EXPOSE`。
既然来了，顺带也值得查一下：tag 列表会告诉你真实的版本历史。

```bash
curl -s "https://hub.docker.com/v2/repositories/$REPO/tags/?page_size=25" \
  | python -c "import json,sys; [print(t['name'], t['last_updated'][:10]) for t in json.load(sys.stdin)['results']]"
```

## 4. 找出它真正监听的端口

`EXPOSE` 是文档，不是行为。想知道进程真正绑定的端口，要看运行中的容器内部：

```bash
docker exec <container> cat /proc/net/tcp
```

端口以十六进制写在字段 2 里——字段 4 是 `0A` 表示 `LISTEN`。解码一下：

```bash
docker exec <container> sh -c \
  "awk 'NR>1 && \$4==\"0A\" {print \$2}' /proc/net/tcp" \
  | cut -d: -f2 | while read h; do printf '%d\n' "0x$h"; done
```

```
3000
```

然后不离开容器，确认它真的在响应：

```bash
docker exec <container> sh -c 'wget -qSO- -O- http://127.0.0.1:3000/ 2>&1 | head -5'
```

```
HTTP/1.1 302 Found
  location: /docs
```

重定向到 `/docs`——原来镜像一直在提供它自己的 Swagger UI。

## 5. 读启动日志，别把 shell 挂死

把 `docker run` 直接接到 `head` 或日志过滤器上，看起来无害，实际上会挂死：
进程一直占着管道，你的命令永远不会返回。改成后台运行，读日志，然后删掉它：

```bash
docker run -d --name probe -e AUTH_SECRET=probe-only <image>
sleep 8
docker logs probe 2>&1 | head -20
docker rm -f probe
```

```
[02:06:17 UTC] INFO: Server listening at http://127.0.0.1:3000
[02:06:17 UTC] INFO: Server listening at http://172.27.0.2:3000
```

两行日志就是全部答案——而且它还告诉我：容器*有* `AUTH_SECRET` 就能正常启动，
*没有*就挂。这比我在前台运行、眼睁睁看着它崩溃后拿到的那段压缩过的堆栈信息
有用得多。

## 这不能替代什么

如果供应商自己的文档存在，还是要读——通常比钻洞翻找更快，而且它携带镜像
无法告诉你的东西，比如版本兼容性对照表。就拿这个镜像来说，供应商页面*确实*
发布了运行命令和必需的 `AUTH_SECRET`；我之所以先在镜像里找到它们，只是因为我
没把页面往下滚够。两个都用：页面看意图，构件看你要部署的确切契约。

## 结果

四条命令——`cat` 出打包的规范、`grep` 出 env 变量、从 registry 读 config blob、
`exec cat /proc/net/tcp` 找端口——把一场文档大海捞针，换成了：一份完整的
OpenAPI 规范、全部九个 env 变量、默认端口、配置默认值，以及一个 Swagger UI
地址。没进容器开 shell，不用登录，什么都没改动。

---

*如果你正在对接一个自托管系统，而文档又戛然而止——这正是我为马来西亚中小
企业做的活：[WhatsApp](https://wa.me/60127972969)、[邮件](mailto:me@hoelee.com?subject=API%20integration)，
或 [hoelee.com](https://hoelee.com)。*