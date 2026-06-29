# NovelGrab API 文档

## 概述

NovelGrab API 提供小说搜索与下载服务，基于 FastAPI + WebSocket。

- **默认地址**: `http://127.0.0.1:8710`
- **CORS**: 已开放所有来源
- **数据格式**: JSON
- **响应结构**: 统一使用 `{source_key: {book_id: data}}` 嵌套格式，所有 key 均为英文

---

## 启动

```bash
# 方式一：模块启动
python -m server

# 方式二：uvicorn 直接启动
uvicorn server.main:app --host 0.0.0.0 --port 8710

# 方式三：开发模式（热重载）
uvicorn server.main:app --host 0.0.0.0 --port 8710 --reload
```

> 启动前确保 PYTHONPATH 包含项目根目录，或从项目根目录执行。

---

## 端点总览

| 方法   | 路径                         | 说明                   |
| ------ | ---------------------------- | ---------------------- |
| GET    | `/api/health`                | 健康检查               |
| GET    | `/api/sources`               | 列出爬虫源+在线状态     |
| GET    | `/api/sources/status`        | 同上（别名）            |
| GET    | `/api/search`                | 搜索（URL参数）         |
| POST   | `/api/search`                | 搜索（JSON body）       |
| POST   | `/api/download`              | 提交下载任务           |
| GET    | `/api/tasks/{task_id}`       | 查询下载进度           |
| GET    | `/api/tasks/{task_id}/result`| 获取下载结果           |
| WS     | `/ws/download/{task_id}`     | WebSocket 实时进度推送 |

---

## 1. 健康检查

```
GET /api/health
```

**响应**:
```json
{"status": "ok"}
```

---

## 2. 获取爬虫源列表

```
GET /api/sources
```

**响应**:
```json
{
    "sources": [
        {"key": "biquge7", "name": "笔趣阁(biquge7)", "domain": "https://www.biquge7.xyz", "online": true, "latency_ms": 845},
        {"key": "biqugeclub", "name": "笔趣阁(club)", "domain": "https://www.biquge.club", "online": true, "latency_ms": 832},
        {"key": "bqwx", "name": "笔趣阁(bqwx)", "domain": "https://www.bqwx.cc", "online": true, "latency_ms": 1799}
    ],
    "default_output_dir": "/Users/xxx/Downloads/NovelGrab"
}
```

| 字段 | 说明 |
|------|------|
| `online` | 首页 HTTP 200 可达 |
| `latency_ms` | 响应延迟（毫秒） |

> `/api/sources/status` 功能等价，作为兼容别名保留。

---

## 3. 搜索小说

```
POST /api/search
Content-Type: application/json
```

**请求体**:
```json
{"keyword": "凡人修仙传"}
```

- `keyword` 书名关键词或书籍 URL。

**响应**: `{source_key: {book_id: book_data}}`

```json
{
    "biquge7": {
        "12345": {
            "title": "凡人修仙传",
            "author": "忘语",
            "source_key": "biquge7",
            "source_name": "笔趣阁(biquge7)",
            "chapter_url": "https://www.biquge7.xyz/book/12345/",
            "cover_url": "",
            "word_count": 5230000,
            "score": "",
            "status": "已完结",
            "description": "一个普通山村少年，以平庸的资质踏入修仙界……"
        }
    }
}
```

**字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `source_key` | string | 爬虫英文标识 |
| `source_name` | string | 爬虫中文名称 |
| `book_id` (map key) | string | 从 chapter_url 提取的书籍 ID |
| `title` | string | 书名 |
| `author` | string | 作者 |
| `chapter_url` | string | 章节目录页 URL |
| `word_count` | number | 字数 |
| `status` | string | `"连载中"` / `"已完结"` / `"未知"` |
| `description` | string | 简介 |

> URL 直链搜索返回更完整的元数据；关键词搜索部分字段可能为空/未知。

**错误**: `400` — keyword 为空 | `404` — URL 无法识别

---

## 4. 提交下载任务

```
POST /api/download
Content-Type: application/json
```

**请求体**:

```json
{
    "source_key": "biquge7",
    "book": {
        "title": "凡人修仙传",
        "author": "忘语",
        "source": "biquge7",
        "chapter_url": "https://www.biquge7.xyz/book/12345/",
        "word_count": 5230000,
        "status": "已完结",
        "description": ""
    },
    "start_chapter": 1,
    "end_chapter": 0
}
```

- `source_key`：来自 `/api/sources` 的 `key` 字段。
- `book`：将搜索结果中的 book 对象原样填入。
- `start_chapter` / `end_chapter`：可选，章节范围（1-based，0=全部）。
- `output_dir`：可选，自定义输出目录（空字符串=使用默认路径）。

**响应**:
```json
{"task_id": "a720e2946666"}
```

**下载行为**:
1. 获取源站的章节列表
2. 并行搜索其他源（8 秒超时），自动选用章节更多的源
3. 逐章下载正文（每章间隔 0.3 秒）
4. 完成后写入 `~/Downloads/NovelGrab/{书名}.txt`

**错误**: `400` — source_key 对应的爬虫未找到

---

## 5. 查询下载进度（轮询）

```
GET /api/tasks/{task_id}
```

**状态枚举**: `pending` → `running` → `done` / `error`

**响应**:
```json
{
    "task_id": "a720e2946666",
    "status": "running",
    "progress": 41,
    "message": "(5/12) 第五章 修仙之路",
    "title": "凡人修仙传",
    "total_chapters": 12,
    "completed_chapters": 5
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `task_id` | string | 任务唯一标识 |
| `status` | string | `pending` / `running` / `done` / `error` |
| `progress` | int | 0-100 百分比 |
| `message` | string | 当前步骤描述 |
| `title` | string | 书名 |
| `total_chapters` | int | 总章节数 |
| `completed_chapters` | int | 已完成章节数 |

**错误**: `404` — 任务不存在

---

## 6. 获取下载结果

```
GET /api/tasks/{task_id}/result
```

> 仅当 `status = done` 时可用。

**响应**: `{source_key: {book_id: result_data}}`

```json
{
    "biquge7": {
        "12345": {
            "title": "凡人修仙传",
            "total_chapters": 12,
            "filepath": "/Users/xxx/Downloads/NovelGrab/凡人修仙传.txt",
            "chapters": [
                {
                    "index": 1,
                    "title": "第一章 山边小村",
                    "url": "https://www.biquge7.xyz/book/12345/1.html",
                    "content": "正文内容..."
                }
            ]
        }
    }
}
```

| 字段 | 说明 |
|------|------|
| `title` | 书名 |
| `total_chapters` | 总章节数 |
| `filepath` | 落盘 TXT 文件的绝对路径 |
| `chapters` | 完整章节数组（含正文） |

**错误**: `404` — 任务不存在 | `425` — 下载未完成 | `500` — 下载失败

---

## 7. WebSocket 实时进度

```
ws://127.0.0.1:8710/ws/download/{task_id}
```

服务端每 0.5 秒主动推送，任务完成后自动断开。

**推送格式**（与轮询接口一致）:

```json
{
    "status": "running",
    "progress": 41,
    "message": "(5/12) 第五章 修仙之路",
    "title": "凡人修仙传",
    "total_chapters": 12,
    "completed_chapters": 5
}
```

### JavaScript

```javascript
const ws = new WebSocket(`ws://127.0.0.1:8710/ws/download/${taskId}`);

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log(`[${data.progress}%] ${data.message}`);

    if (data.status === 'done') {
        console.log('下载完成');
        ws.close();
    } else if (data.status === 'error') {
        console.error('下载失败:', data.message);
        ws.close();
    }
};
```

---

## Electron 集成指南

### 典型流程

```
1. spawn Python 服务进程
2. GET  /api/health       → 等待就绪
3. GET  /api/sources      → 展示可选源列表
4. POST /api/search       → 展示搜索结果
5. 用户选择书 + 确认下载
6. POST /api/download     → 获取 task_id
7. WS   /ws/download/{id} → 实时渲染进度
8. GET  /api/tasks/{id}/result → 获取 filepath
9. shell.openPath(filepath)
```

### main 进程启动 Python

```javascript
const { spawn } = require('child_process');
const path = require('path');

const pythonProcess = spawn('python3', ['-m', 'server'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PYTHONPATH: path.join(__dirname, '..') },
});
```

### Renderer 进程调用

```typescript
const API_BASE = 'http://127.0.0.1:8710';

async function search(keyword: string) {
    const res = await fetch(`${API_BASE}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword }),
    });
    return res.json();  // { source_key: { book_id: {...} } }
}

async function startDownload(sourceKey: string, book: BookData) {
    const res = await fetch(`${API_BASE}/api/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_key: sourceKey, book }),
    });
    return res.json();  // { task_id: "..." }
}

async function getResult(taskId: string) {
    const res = await fetch(`${API_BASE}/api/tasks/${taskId}/result`);
    return res.json();  // { source_key: { book_id: {...} } }
}
```

### 遍历搜索结果的示例

```typescript
const data = await search("玄幻");

// data 结构: { [sourceKey]: { [bookId]: BookData } }
for (const [sourceKey, books] of Object.entries(data)) {
    for (const [bookId, book] of Object.entries(books)) {
        console.log(`[${sourceKey}] ${book.title} — ${book.author}`);
    }
}
```

---

## 数据模型参考

### 源信息（/api/sources）

```typescript
interface SourceInfo {
    key: string;      // 英文标识，如 "biquge7", "biqugeclub"
    name: string;     // 中文名称，如 "笔趣阁"
    domain: string;   // 站点域名
}
```

### 书籍数据（搜索/下载结果中的 book 对象）

```typescript
interface BookData {
    title: string;
    author: string;
    source_key: string;   // 所属源的英文 key
    source_name: string;  // 所属源的中文名称
    chapter_url: string;
    cover_url: string;
    word_count: number;
    score: string;
    status: "连载中" | "已完结" | "未知";
    description: string;
}
```

### 章节数据

```typescript
interface ChapterData {
    index: number;
    title: string;
    url: string;
    content: string;
}
```

### 任务状态

```typescript
interface TaskStatus {
    task_id: string;
    status: "pending" | "running" | "done" | "error";
    progress: number;          // 0-100
    message: string;
    title: string;
    total_chapters: number;
    completed_chapters: number;
}
```

---

## 爬虫源对照表

| key | name | domain | 搜索方式 | 备注 |
|-----|------|--------|---------|------|
| `biquge7` | 笔趣阁(biquge7) | www.biquge7.xyz | GET/POST 站内搜索 | |
| `biqugeclub` | 笔趣阁(club) | www.biquge.club | GET 搜索 + Playwright Stealth | |
| `bqwx` | 笔趣阁(bqwx) | www.bqwx.cc | POST + Playwright Stealth | |
