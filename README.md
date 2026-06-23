# novel-grab-node

跨书源聚合搜索与下载的桌面端小说抓取工具。

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面壳 | Electron |
| 前端 | React + Ant Design + Vite |
| 服务层 | Express |
| HTML 解析 | cheerio |
| HTTP 请求 | axios |
| 编码处理 | iconv-lite（GBK/UTF-8 自动检测） |

## 功能

- **双模式抓取**：URL 直接抓取 / 聚合搜索
- **聚合搜索**：9 个书源并行搜索，流式返回结果
- **章节在线阅读**：点击章节实时加载，带缓存
- **批量下载**：3 并发，支持范围选择与失败补漏，导出 TXT
- **反爬对抗**：HTTP 直连 → Electron 渲染两级 fallback，绕过 Cloudflare
- **主题切换**：浅色 / 深色 / 跟随系统
- **缓存管理**：搜索缓存（30 分钟过期）+ 章节缓存

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式（Electron + Vite 热更新）
npm start

# 仅构建前端
npm run build
```

## 项目结构

```
├── main.js                 # Electron 主进程入口
├── server.js               # Express API 服务
├── preload.js              # preload 桥接
├── vite.config.js          # Vite 构建配置
├── src/
│   ├── App.jsx             # 主界面
│   └── Settings.jsx        # 设置面板
├── crawler/
│   ├── index.js            # 爬虫协调器（HTTP→Electron fallback）
│   ├── engine/
│   │   ├── index.js        # 引擎聚合器
│   │   ├── http.js         # HTTP 直连引擎
│   │   └── electron.js     # Electron BrowserWindow 渲染引擎
│   └── search/
│       ├── index.js        # 聚合搜索协调器
│       └── sources/        # 各书源搜索适配器
├── utils/
│   └── find-free-port.js   # 端口扫描工具
└── test_*.js               # 单源调试脚本
```

## 搜索源（9 个）

| 适配器 | 覆盖源 | 方式 |
|--------|--------|------|
| `bqglll-search` | bqglll.cc | Electron 渲染 |
| `bqg-search` | bqg 集群（5 个） | HTTP JSON API |
| `snapd-search` | snapd.cc | HTTP + Electron |
| `biqugeclub-search` | biqugeclub.com | HTML 解析 |
| `biqugeus-search` | biqugeus.com | HTML 解析 |

策略：组间并行 + 组内串行 failover，12 秒超时截止。

## API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/crawl` | POST | 抓取目录列表 |
| `/api/chapter` | POST | 抓取章节内容 |
| `/api/search` | POST | 聚合搜索（NDJSON 流式） |

## 注意事项

- 首次启动会弹出免责声明，不同意则关闭程序
- Electron 引擎需要在主进程启动 IPC Server，端口自动发现
- bqglll.cc 首次访问需预热 session 以通过 Cloudflare 验证
