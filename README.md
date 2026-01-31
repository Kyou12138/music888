# 云音乐播放器

一个功能强大的在线音乐播放器，支持多平台音乐搜索、高品质播放、歌词显示和歌单管理。

## 主要特性

### 多平台音乐源
- **12 个音乐平台**: 网易云音乐、QQ 音乐、酷狗、酷我、咪咕、JOOX、喜马拉雅、Spotify、Apple Music、YouTube Music、TIDAL、Deezer
- **GDStudio API**: 多源聚合搜索，支持跨平台歌曲查找
- **NEC API**: 网易云解锁，支持 VIP 歌曲播放尝试
- **探索雷达**: 一键发现热门音乐

### 播放功能
- **品质选择**: 标准(128K)、较高(192K)、高品质(320K)、无损(FLAC)、Hi-Res
- **品质自动降级**: Hi-Res → FLAC → 320K → 192K → 128K
- **跨源搜索**: VIP 歌曲自动从其他源查找完整版本
- **试听检测**: 自动检测并提示试听版本
- **播放模式**: 列表循环、随机播放、单曲循环
- **音频淡入淡出**: 切歌时平滑过渡
- **Media Session**: 支持系统级媒体控制（锁屏、媒体键）

### 歌词功能
- **实时同步**: 逐行高亮跟随
- **双语歌词**: 支持原文 + 翻译歌词同步显示
- **歌词下载**: LRC 格式

### 歌单与收藏
- **解析网易云歌单**: 支持歌单 ID 或完整链接
- **我的喜欢**: 收藏歌曲到本地
- **播放历史**: 自动记录最近 50 首
- **歌曲下载**: 下载高品质音乐文件

### 用户体验
- **响应式设计**: 桌面端三栏布局，移动端滑动页面
- **触摸手势**: 移动端左右滑动切换页面
- **键盘快捷键**: 空格播放/暂停，方向键切歌/调音量
- **PWA 支持**: 可添加到主屏幕

## 快速开始

### 环境要求

- Node.js >= 18.0.0
- 浏览器: Chrome/Edge >= 90, Firefox >= 121, Safari >= 14

### 在线访问

[在线演示](https://music.weny888.com/)

### 一键部署到 Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/truelife0958/music888)

> 详细部署指南见 [DEPLOYMENT.md](./DEPLOYMENT.md)

### 本地开发

```bash
# 克隆项目
git clone https://github.com/truelife0958/music888.git
cd music888

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 运行测试
npm run test:run

# 构建生产版本
npm run build
```

开发服务器启动后访问 `http://localhost:5173`

## 技术栈

| 类别 | 技术 |
|------|------|
| 语言 | TypeScript (strict mode) |
| 构建 | Vite |
| 测试 | Vitest + jsdom |
| 代码检查 | ESLint + Prettier |
| 部署 | Vercel Serverless Functions |
| 图标 | Font Awesome 6 |

## 项目结构

```
music888/
├── api/
│   └── proxy.js          # Vercel Serverless 代理 (URL 白名单 + CORS)
├── css/
│   ├── animations.css    # 动画效果
│   ├── base.css          # 基础样式 + CSS 变量
│   ├── components.css    # 通用组件
│   ├── layout.css        # 三栏布局
│   ├── lyrics.css        # 歌词显示
│   ├── mobile.css        # 移动端适配 (< 768px)
│   ├── player.css        # 播放器样式
│   ├── variables.css     # 主题变量
│   └── style.css         # 入口文件
├── js/
│   ├── api.ts            # API 调用 (搜索/歌曲URL/歌词/歌单)
│   ├── config.ts         # 配置常量 (超时/代理/日志)
│   ├── main.ts           # 入口 (事件绑定/标签切换/手势)
│   ├── player.ts         # 播放器核心 (播放/收藏/历史/歌词解析)
│   ├── types.ts          # TypeScript 类型定义
│   ├── ui.ts             # UI 渲染 (列表/通知/进度/歌词)
│   ├── utils.ts          # 工具函数 (防抖/节流/转义/存储)
│   └── *.test.ts         # 单元测试 (128 个测试)
├── public/
│   ├── manifest.json     # PWA 清单
│   └── sw.js             # Service Worker
├── index.html            # 主页面
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
└── vercel.json           # Vercel 部署路由
```

## 核心架构

### API 多源容错

```
请求歌曲 URL 的优先级:
1. NEC Unblock (match) - 解锁网易云 VIP
2. GDStudio API        - 多源聚合
3. NEC 常规接口         - 网易云官方
4. Meting API          - 备用接口
5. 跨源搜索             - 从其他平台搜索同名歌曲
```

### 安全措施

- **XSS 防护**: `escapeHtml()` + `textContent` 防止注入
- **SSRF 防护**: 代理服务 URL 白名单 + 协议检查
- **输入验证**: `encodeURIComponent` + 正则校验
- **错误隔离**: 用户消息与内部错误分离，不暴露堆栈

### 开发命令

```bash
npm run dev           # 启动开发服务器
npm run build         # 生产构建
npm run test:run      # 运行单元测试
npm run test:coverage # 测试覆盖率报告
npm run lint          # 代码检查
npm run format        # 代码格式化
```

## 常见问题

**歌曲无法播放?**
- 歌曲可能因版权限制不可用，系统会自动尝试从其他平台搜索
- 如提示"试听版本"，说明当前源仅提供片段，可尝试更换平台

**歌单解析失败?**
- 确保输入公开歌单的 ID 或链接
- 测试歌单: `60198`、`3778678`

**数据存储在哪里?**
- 收藏、历史、歌单均保存在浏览器 localStorage，不上传服务器

## 贡献指南

欢迎提交 Issue 和 Pull Request!

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/xxx`)
3. 提交更改 (`git commit -m 'feat: 添加某个功能'`)
4. 推送到分支 (`git push origin feature/xxx`)
5. 提交 Pull Request

## 开源协议

MIT License

## 致谢

- [music-api.gdstudio.xyz](https://music-api.gdstudio.xyz) - 音乐 API 服务
- [Font Awesome](https://fontawesome.com/) - 图标库
- [Vite](https://vitejs.dev/) - 构建工具
