# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 语言要求
- 所有回复使用中文

## 项目概述

沄听是一个功能丰富的在线音乐播放器，采用三栏布局设计（内容发现 / 播放器 / 我的）。核心特性包括：
- 多源音乐搜索与自动降级（NEC Unblock → GDStudio → 网易云 → Meting → 跨源搜索）
- 高品质播放（128K / 192K / 320K / FLAC / Hi-Res）
- 歌手浏览、电台播客、歌单管理
- Media Session 支持（锁屏控制）
- Cloudflare Turnstile 验证

## 开发命令

### 核心命令
```bash
# 开发服务器（http://localhost:5173）
npm run dev

# 生产构建
npm run build

# 预览构建结果
npm run preview
```

### 测试
```bash
# 运行所有测试（单次）
npm run test:run

# 监听模式（用于开发）
npm test

# UI 界面查看测试结果
npm run test:ui

# 生成覆盖率报告
npm run test:coverage
```

### 代码质量
```bash
# ESLint 检查
npm run lint

# ESLint 自动修复
npm run lint:fix

# Prettier 格式化
npm run format
```

### 部署
```bash
# Cloudflare Pages（通过 Wrangler CLI）
npm run build
wrangler pages deploy dist --project-name music888

# Vercel（通过 Vercel CLI）
npm install -g vercel
vercel --prod
```

## 架构设计

### 模块划分

#### API 层 (`js/api/`)
- **client.ts** — 底层 HTTP 客户端，提供 `fetchWithRetry`、代理转发、Turnstile token 注入
- **music.ts** — 音乐资源获取（歌曲 URL、歌词、封面、跨源搜索）
- **search.ts** — 搜索、歌单、歌手列表、电台、排行榜
- **sources.ts** — API 源配置与健康检测（4 个主要源 + 降级策略）
- **utils.ts** — 相似度计算、源统计工具

#### 播放器层 (`js/player/`)
- **core.ts** — 核心状态管理（`audioPlayer`、`currentPlaylist`、`playMode`）
- **control.ts** — 播放控制（play、pause、next、prev）
- **effects.ts** — 音频淡入淡出效果
- **events.ts** — 音频事件处理、Media Session API、试听检测
- **lyrics.ts** — 歌词解析（LRC 格式）
- **playlist.ts** — 播放列表逻辑

#### UI 层 (`js/ui.ts`)
- 歌手网格渲染、电台列表、歌词显示、通知系统

#### 工具层
- **config.ts** — 配置常量（音质等级、存储键名）
- **types.ts** — TypeScript 类型定义（Song、LyricLine、PlaylistData、API 响应）
- **utils.ts** — 通用工具函数（escapeHtml、formatTime、debounce）
- **circuit-breaker.ts** — 熔断器模式（API 降级保护）
- **perf.ts** — 性能监控工具

### 代理架构

项目提供两套代理实现，适配不同的部署平台：

**开发环境：** Vite 插件 (`dev-proxy-plugin.ts`)
- 在本地开发时模拟生产环境的代理行为
- 使用 Node.js HTTP 模块直接转发请求

**生产环境 - Cloudflare Pages：** (`functions/api/proxy.js`)
- 使用 Cloudflare Workers 运行时
- 导出格式：`export async function onRequest(context)`
- 使用 Web API 的 `Request` 和 `Response` 对象
- 环境变量通过 `context.env` 访问
- 客户端 IP 通过 `CF-Connecting-IP` 头获取

**生产环境 - Vercel：** (`api/proxy.js`)
- 使用 Node.js Serverless Functions 运行时
- 导出格式：`module.exports = async function handler(req, res)`
- 使用 Node.js 的 `IncomingMessage` 和 `ServerResponse`
- 环境变量通过 `process.env` 访问
- 客户端 IP 通过 `x-forwarded-for` 头获取
- 需要 `node-fetch` 依赖

所有代理实现共享相同的核心逻辑：
- URL 白名单验证（防止 SSRF）
- CORS 头注入
- Turnstile token 验证（生产环境）
- 速率限制（生产环境：单实例内存版，应配置 Cloudflare Rate Limiting Rules）

### API 降级策略

请求歌曲 URL 的优先级顺序：
1. **NEC Unblock (match)** — 解锁网易云 VIP 歌曲
2. **GDStudio API** — 多源聚合搜索（主力源）
3. **NEC 常规接口** — 网易云官方 API
4. **Meting API** — 备用接口
5. **跨源搜索** — 失败后自动从酷我/酷狗/咪咕等搜索相同歌曲

实现位置：`js/api/music.ts:getMusicUrl`、`js/api/sources.ts`

### 试听检测机制

问题：VIP 歌曲可能返回 30 秒试听片段
解决：`js/player/events.ts:setupTrialDetection`

检测逻辑：
1. 监听 `timeupdate` 事件
2. 当播放时间接近歌曲总时长的 50% 时（试听片段约 30 秒）
3. 触发 `trialDetected` 事件
4. 自动触发跨源搜索并切换到完整版

### Turnstile 验证流程

1. **前端渲染**（`index.html`）：
   - 页面加载时渲染 Turnstile 挑战（使用 `VITE_TURNSTILE_SITE_KEY`）
   - 验证成功后将 token 存入 `sessionStorage`

2. **请求携带**（`js/api/client.ts:fetchWithRetry`）：
   - 所有代理请求自动附加 `X-Turnstile-Token` 头

3. **后端验证**（`functions/api/proxy.js`）：
   - 检查 `X-Turnstile-Token` 头
   - 调用 Cloudflare API 验证 token（使用 `TURNSTILE_SECRET_KEY`）
   - 验证失败返回 403，成功则放行
   - Fail-open 策略：验证服务不可用时自动放行

### 状态持久化

使用 `localStorage` 保存：
- 用户 ID（`music888_user_id`）
- 收藏歌曲（`music888_favorites`）
- 播放历史（`music888_history`，最多 50 首）
- 电台订阅（`music888_subscribed_radios`）
- 引导弹窗显示状态（`music888_welcome_shown`）

实现位置：`js/main.ts`、`js/utils.ts`

## 关键技术细节

### TypeScript 配置
- 严格模式启用（`strict: true`）
- 未使用变量/参数检查（`noUnusedLocals`、`noUnusedParameters`）
- 所有函数必须有显式返回（`noImplicitReturns`）
- 目标：ESNext（由 Vite 降级到兼容版本）

### 测试策略
- 测试文件命名：`*.test.ts`
- 环境：jsdom（模拟浏览器 DOM）
- 覆盖率排除：测试文件、类型定义、配置文件
- 已有测试：`js/config.test.ts`、`js/ui.test.ts`、`js/utils.test.ts`

### 构建优化
- Chunk 大小警告阈值：50KB
- 手动分割 chunks：核心模块（`config.ts`、`utils.ts`、`types.ts`）
- 公共资源复制：`public/` → `dist/`

### 移动端适配
- 三页滑动布局（媒体查询 `@media (max-width: 1200px)`）
- 触摸手势支持（`touchstart`、`touchmove`、`touchend`）
- 响应式歌手网格（2 列/3 列自适应）
- PWA 支持（`manifest.json`、`sw.js`）

## 安全要点

### XSS 防护
- 使用 `escapeHtml()` 转义用户输入（`js/utils.ts`）
- DOM 操作优先使用 `textContent` 而非 `innerHTML`

### SSRF 防护
- 代理服务严格白名单（`ALLOWED_HOSTS_EXACT` + `ALLOWED_HOSTS_REGEX`）
- URL 协议检查（仅允许 `http`/`https`）

### 输入校验
- URL 参数使用 `encodeURIComponent` 编码
- 歌单 ID、歌手 ID 等使用正则验证

### CSP 策略
生产环境应配置 Content-Security-Policy 头（在 Cloudflare Pages 设置中）

## 常见开发任务

### 添加新的 API 源
1. 在 `js/api/sources.ts` 中添加源配置
2. 实现对应的 API 调用函数（参考 `music.ts`、`search.ts`）
3. 更新代理白名单：
   - `dev-proxy-plugin.ts`（开发环境）
   - `functions/api/proxy.js`（Cloudflare 生产环境）
   - `api/proxy.js`（Vercel 生产环境）
4. 添加降级逻辑（在相应的 API 函数中）

### 修改播放器行为
- 播放控制逻辑：`js/player/control.ts`
- 音频事件处理：`js/player/events.ts`
- 淡入淡出效果：`js/player/effects.ts`
- 核心状态：`js/player/core.ts`

### UI 渲染修改
- 歌手网格、电台列表、歌词显示：`js/ui.ts`
- 样式文件：`css/components.css`、`css/player.css` 等
- 移动端适配：`css/mobile.css`

### 调试技巧
- 开启详细日志：在 `js/config.ts` 中设置 `logger.level = 'debug'`
- 查看源统计：`logSourceStats()`（在 `js/api/utils.ts`）
- 测试代理：访问 `http://localhost:5173/api/proxy?url=...`

## 环境变量

### 构建时（注入前端）
- `VITE_TURNSTILE_SITE_KEY` — Cloudflare Turnstile 站点密钥

### 运行时（Serverless Functions）

以下环境变量在 **Cloudflare Pages** 和 **Vercel** 两个平台通用：

- `TURNSTILE_SECRET_KEY` — Turnstile 服务端密钥（用于验证前端 token）
- `NETEASE_VIP_COOKIE` — 网易云 VIP Cookie（用于解锁 VIP 歌曲）
- `EXTRA_ALLOWED_HOSTS` — 额外代理域名白名单（逗号分隔，可选）

**配置位置：**
- Cloudflare Pages: Dashboard → Settings → Environment Variables
- Vercel: Dashboard → Settings → Environment Variables（或在 `vercel.json` 中配置）

## 文件引用规范

引用代码时使用 `file_path:line_number` 格式，例如：
- 播放器核心状态：`js/player/core.ts:8-21`
- API 重试逻辑：`js/api/client.ts:28-50`
- 试听检测：`js/player/events.ts`
