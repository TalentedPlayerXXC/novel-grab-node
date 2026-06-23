# 搜索源说明

## 概述

小说抓取工具目前接入 **9 个搜索源**，覆盖 **5 类爬虫适配器**，支持跨书源聚合搜索与章节下载。

---

## 搜索源列表

| # | 域名 | 适配器 | 搜索方式 | 搜索接口 | 备注 |
|---|------|--------|----------|----------|------|
| 1 | `bqglll.cc` | `bqglll-search` | Electron 渲染 | `https://m.bqglll.cc/s?q=KEYWORD` | 需 Cloudflare 验证，JS 渲染后提取 `div.item` |
| 2 | `m.snapd.net` | `snapd-search` | HTTP JSON API + Electron fallback | `https://m.snapd.net/user/search.html?q=KEYWORD` | 移动端 UA 必需，先调 `/user/hm.html` 建立 session |
| 3 | `www.bqg518.xyz` | `bqg-search` | HTTP REST API | `https://www.bqg518.xyz/api/search?q=KEYWORD` | bqg 集群，纯 JSON 返回 |
| 4 | `www.bqg971.xyz` | `bqg-search` (共享) | HTTP REST API | ↑ 同上 | bqg 集群，同一套后端 |
| 5 | `www.bqg998.cc` | `bqg-search` (共享) | HTTP REST API | ↑ 同上 | bqg 集群 |
| 6 | `www.bqg995.xyz` | `bqg-search` (共享) | HTTP REST API | ↑ 同上 | bqg 集群 |
| 7 | `www.bqg907.cc` | `bqg-search` (共享) | HTTP REST API | ↑ 同上 | bqg 集群 |
| 8 | `www.biquge.club` | `biqugeclub-search` | HTML 解析 | `https://www.biquge.club/search/?searchkey=KEYWORD` | Yunxiaoge CMS 模板，GET 搜索返回 HTML |
| 9 | `m.biquge.us` | `biqugeus-search` | HTML 解析 | `https://m.biquge.us/modules/article/search.php?searchkey=KEYWORD` | Zhaishu CMS 模板，传统 PHP 搜索 |

---

## 适配器分类

### 1. Electron 渲染型 — `bqglll-search`

- 搜索页由 JS 动态渲染，需要 Electron BrowserWindow 加载后提取 DOM
- 适用于有 Cloudflare 保护的站点
- 等待选择器：`div.item`

### 2. HTTP JSON API — `bqg-search`（bqg 集群）

- RESTful API：`GET /api/search?q=KEYWORD`
- 返回 JSON：`{ "data": [{ "id": "...", "title": "...", "author": "...", "intro": "..." }] }`
- 封面：`/bookimg/{Math.floor(id / 1000)}/{id}.jpg`
- 章节链接：`/#/book/{id}/`
- 纯 HTTP 即可，无需 Electron

### 3. HTTP JSON API + Electron fallback — `snapd-search`

- 先调 `/user/hm.html?q=KEYWORD` 建立 session
- 再调 `/user/search.html?q=KEYWORD` 获取 JSON
- 需移动端 User-Agent：`Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 ...`
- HTTP 失败时 fallback Electron 渲染搜索页

### 4. HTML 解析型 — `biqugeclub-search`（Yunxiaoge CMS）

- `GET /search/?searchkey=KEYWORD` 返回 HTML
- 用 cheerio 解析：`a[href^="/book/"]` 提取书籍链接
- CMS 模板名：`/static/yunxiaoge/`

### 5. HTML 解析型 — `biqugeus-search`（Zhaishu CMS）

- `GET /modules/article/search.php?searchkey=KEYWORD` 返回 HTML
- 搜索结构：`#sitebox > dl > dt(img) + dd(h3 > a[title]) + dd.book_other(author) + dd.book_des(desc)`
- CMS 模板名：`/zhaishu/`

---

## 爬虫适配器（章节抓取）

| 域名 | 适配器 | 渲染方式 |
|------|--------|----------|
| `bqglll.cc` | `bqglll-render` | HTTP → Electron（Cloudflare 章节页） |
| `snapd.net` | `snapd-render` | Electron 强制渲染（Cloudflare 章节页） |
| `biquge.club` | `biqugeclub-render` | HTTP → Electron（Yunxiaoge 模板） |
| `biquge.us` | `biqugeus-render` | HTTP → Electron（Zhaishu 模板） |
| `ieso.net` | `ieso-render` | HTTP → Electron |

---

## 代码位置

```
crawler/
├── search/
│   ├── index.js              ← 搜索源注册
│   └── sources/
│       ├── bqglll-search.js  ← #1
│       ├── bqg-search.js     ← #3-7
│       ├── snapd-search.js   ← #2
│       ├── biqugeclub-search.js ← #8
│       └── biqugeus-search.js   ← #9
└── index.js                  ← 爬虫源注册
    └── sources/              ← 章节爬取适配器
```
