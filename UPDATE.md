# 更新日志

## 2.0.0

> 全面重写版本，架构、前端、后端全部换血。

### 架构

- 引入 Electron 作为桌面壳，告别浏览器标签页，提供原生窗口体验
- 后端由 Node.js 迁移至 Python FastAPI + uvicorn，经 PyInstaller 编译为独立可执行文件
- Electron 主进程自动管理后端生命周期（启动 / 健康检查 / 退出清理）
- 前后端通过 REST API + WebSocket 通信，开发模式下由 Vite 代理转发

### 前端

- 使用 React 19 + TypeScript + Ant Design 5 完全重写
- 新增 Starry（星空粒子）与 Cyberpunk（赛博朋克）双视觉风格
- 支持亮色 / 暗色 / 跟随系统三种主题
- 路由重构：搜索页 / 书籍详情页 / 下载进度页 / 设置页
- 新增 ErrorBoundary 崩溃兜底，展示 Cyberpunk 风格报错界面
- 新增首次启动免责声明弹窗
- 设置页支持下载目录选择（通过 Electron IPC）

### 后端

- 爬虫引擎由 Node.js 迁移至 Python，统一管理
- 引入 Playwright + Stealth 处理反爬站点，配合 requests 兼顾轻量源
- 新增 `BaseSpider` 抽象基类 + 装饰器注册机制，新增源只需实现三个接口
- 引入 `generic_extractor`，基于 CJK 字符密度的 Readability 风格正文提取
- 新增 ThreadPoolExecutor 并发搜索 / 下载，大幅提升效率
- 新增 WebSocket 实时推送下载进度，支持断线后轮询回退
- 新增章节范围选择下载、自定义输出目录

### 数据

- 新增搜索 / 章节缓存（localStorage，30 分钟 TTL + LRU 淘汰）
- 清理数据源列表，移除部分不宜展示的源站
- 废弃旧版 Node.js 爬虫引擎及相关代码
- 废弃旧版 Qt/PySide6 桌面 GUI（保留源码未移除）
