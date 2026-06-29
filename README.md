# NovelGrab 2.0

跨平台桌面小说搜索与下载工具。基于 **Electron + React + Ant Design** 构建前端，**FastAPI + Playwright** 驱动后端爬虫，支持多数据源并发搜索、章节下载、TXT 导出。

> 平时在群里给兄弟们搬史搬得够多了，寻思着也给 GitHub 搬点史吧。于是有了这玩意儿。✨

> 这是 NovelGrab 2.0 版本，前端使用 React + TypeScript 完全重写，后端迁移至 FastAPI + Playwright，带来更流畅的体验和更强的稳定性。

## 免责声明

**本工具仅供学习与个人使用，不提供、不存储、不传播任何小说内容。** 所有数据均来源于第三方网站，工具仅作为自动化检索与下载的接口，内容版权归属原作者及相应网站。用户应自行遵守相关法律法规，下载内容仅供个人阅读，不得用于商业用途或传播。使用者需自行承担一切法律责任，作者不对任何因使用本工具而产生的法律纠纷或版权问题承担责任。

如涉及版权问题，请联系相关源站进行处理，本工具不承担任何责任。

## 功能

- **多源搜索** — 同时搜索多个笔趣阁站点，聚合结果展示
- **章节下载** — 支持自定义章节范围，自动跨源补全缺失章节
- **TXT 导出** — 下载完成自动合并为 `.txt` 文件
- **在线阅读** — 下载后的章节可直接在应用内阅读
- **实时进度** — WebSocket 推送下载进度，支持断线轮询回退
- **双主题** — Starry（星空粒子）与 Cyberpunk（赛博朋克）两种视觉风格
- **暗色模式** — 支持亮色/暗色/跟随系统三种主题
- **结果缓存** — 搜索结果和章节列表自动缓存，减少重复请求

## 快速开始

### 环境要求

- macOS (ARM64) — 预编译后端仅打包了 ARM64 版本。**Apple 已确认 macOS 27 起将全面停止支持 Intel Mac，Intel 芯片 Mac 已处于维护末期，建议尽早过渡到 Apple Silicon 机型**
- Windows — Electron 层面已兼容，后端编译正在跟进中
- Linux — 暂无明确计划，但欢迎社区贡献

### 开发模式

```bash
# 启动 Python 后端（需要 Python 3.12+）
uvicorn server.main:app --host 127.0.0.1 --port 8710

# 另一个终端：启动前端开发服务器
npm install
npm run dev
```

浏览器打开 `http://localhost:3000` 即可使用。

### 生产模式

```bash
# 构建前端 + 启动 Electron
npm run preview

# 打包为 macOS DMG
npm run pack:mac
```

打包后的应用位于 `release/` 目录。

## 使用流程

1. 启动应用，等待后端就绪
2. 首次使用需阅读并同意免责声明
3. 主页展示可用数据源及其在线状态/延迟
4. 输入书名关键词或书籍 URL 进行搜索
5. 点击 **章节** 查看目录，或直接点击 **下载**
6. 下载过程中实时显示进度，完成后可在线阅读章节

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面壳 | Electron 42 |
| 前端框架 | React 19 + TypeScript |
| UI 组件 | Ant Design 5 |
| 路由 | React Router 7 |
| 构建 | Vite 6 |
| 后端框架 | FastAPI + uvicorn |
| 爬虫引擎 | requests + Playwright (Stealth) |
| 部署 | PyInstaller (后端) / electron-builder (前端) |

## 项目结构

```
novel-grab-node/
├── main.js                 # Electron 主进程
├── preload.js              # contextBridge
├── vite.config.js          # 构建配置 + API 代理
├── package.json
├── src/                    # React 前端
│   ├── App.tsx             # 根组件
│   ├── services/
│   │   ├── api.ts          # REST + WebSocket 客户端
│   │   └── cache.ts        # localStorage 缓存
│   ├── HomePage/           # 搜索页
│   ├── BookDetailPage/     # 书籍详情 / 阅读页
│   ├── TaskDetailPage/     # 下载进度页
│   ├── SettingsPage/       # 设置页
│   └── components/         # 通用组件
├── NovelGrabServer/        # Python 后端（预编译）
│   └── _internal/
│       ├── server/
│       │   └── main.py     # FastAPI 入口
│       └── novel_grabber/
│           ├── core/       # 搜索 / 下载引擎
│           ├── spiders/    # 爬虫实现
│           ├── storage/    # TXT 写入
│           └── utils/      # HTTP 工具 / 内容提取
└── API.md                  # API 文档
```

## API

完整的 REST + WebSocket API 文档见 [API.md](API.md)。

## 待办

- [ ] **2.1** 接入反馈小助手
- [ ] **2.1** 支持结果筛选（按状态 / 字数等）
- [ ] **2.1** 支持章节范围选择下载
