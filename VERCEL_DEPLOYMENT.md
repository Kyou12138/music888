# Vercel 部署指南

本项目已适配 Vercel Serverless Functions，可以轻松部署到 Vercel 平台。

## 快速部署

### 方式一：一键部署（推荐）

点击下方按钮，自动 fork 仓库并部署到 Vercel：

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/truelife0958/music888)

### 方式二：Vercel CLI

```bash
# 安装 Vercel CLI
npm install -g vercel

# 登录 Vercel
vercel login

# 部署（首次）
vercel

# 生产部署
vercel --prod
```

### 方式三：Git 集成

1. 登录 [Vercel Dashboard](https://vercel.com/dashboard)
2. 点击 **Add New** → **Project**
3. 导入你的 GitHub 仓库
4. Vercel 会自动检测到 `vercel.json` 配置
5. 点击 **Deploy**

## 配置环境变量

部署后，需要在 Vercel Dashboard 中配置以下环境变量：

### 必需（如果启用 Turnstile 验证）

| 变量名 | 说明 | 获取方式 |
|--------|------|----------|
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare Turnstile 站点密钥 | [Cloudflare Dashboard](https://dash.cloudflare.com/) → Turnstile |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile 服务端密钥 | 同上 |

### 可选

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `NETEASE_VIP_COOKIE` | 网易云 VIP Cookie，用于解锁 VIP 歌曲 | `MUSIC_U=xxx; __csrf=yyy` |
| `EXTRA_ALLOWED_HOSTS` | 额外允许代理的域名（逗号分隔） | `example.com,api.example.com` |

### 配置步骤

1. 进入 Vercel Dashboard → 你的项目
2. 点击 **Settings** → **Environment Variables**
3. 添加上述变量：
   - **Key**: 变量名（如 `TURNSTILE_SECRET_KEY`）
   - **Value**: 变量值
   - **Environments**: 勾选 `Production`、`Preview`、`Development`
4. 点击 **Save**
5. 重新部署项目以使环境变量生效

## 技术细节

### 代理函数差异

Vercel 版本（`api/proxy.js`）与 Cloudflare 版本（`functions/api/proxy.js`）的主要区别：

| 特性 | Cloudflare Pages | Vercel Serverless |
|------|------------------|-------------------|
| **运行时** | Cloudflare Workers | Node.js |
| **导出格式** | `export async function onRequest(context)` | `module.exports = async function handler(req, res)` |
| **请求对象** | Web API `Request` | Node.js `IncomingMessage` |
| **响应对象** | Web API `Response` | Node.js `ServerResponse` |
| **环境变量** | `context.env.VAR_NAME` | `process.env.VAR_NAME` |
| **客户端 IP** | `CF-Connecting-IP` 头 | `x-forwarded-for` 头 |
| **依赖** | 无需额外依赖 | 需要 `node-fetch` |

### 文件结构

```
music888/
├── api/
│   └── proxy.js              # Vercel Serverless Function
├── functions/
│   └── api/
│       └── proxy.js          # Cloudflare Pages Function
├── vercel.json               # Vercel 配置文件
├── wrangler.toml             # Cloudflare Pages 配置文件
└── ...
```

### vercel.json 配置

```json
{
  "version": 2,
  "builds": [
    {
      "src": "package.json",
      "use": "@vercel/static-build",
      "config": {
        "distDir": "dist"
      }
    }
  ],
  "routes": [
    {
      "src": "/api/proxy",
      "dest": "/api/proxy.js"
    },
    {
      "handle": "filesystem"
    },
    {
      "src": "/(.*)",
      "dest": "/$1"
    }
  ]
}
```

- **builds**: 指定使用静态构建，输出到 `dist` 目录
- **routes**: 配置路由规则，将 `/api/proxy` 请求转发到 Serverless Function

## 本地测试

Vercel CLI 提供了本地开发服务器：

```bash
# 安装依赖
npm install

# 使用 Vercel CLI 启动本地开发服务器
vercel dev
```

**注意：** 本项目已配置 Vite 开发代理插件（`dev-proxy-plugin.ts`），因此推荐使用 `npm run dev` 进行日常开发，仅在需要测试 Vercel 特定功能时使用 `vercel dev`。

## 常见问题

### 1. 部署后代理请求失败？

检查以下几点：
- 确认环境变量已正确配置（特别是 `TURNSTILE_SECRET_KEY`）
- 检查 Vercel 函数日志：Dashboard → Deployments → 点击部署 → Functions 标签
- 确认前端请求路径为 `/api/proxy?url=...`

### 2. Turnstile 验证失败？

- 确保 `VITE_TURNSTILE_SITE_KEY` 在构建时注入（需要重新部署）
- 检查 `TURNSTILE_SECRET_KEY` 是否正确配置
- 确认 Turnstile 站点密钥的域名白名单包含你的 Vercel 域名

### 3. VIP 歌曲只能播放试听版？

配置 `NETEASE_VIP_COOKIE` 环境变量：
1. 登录网易云音乐网页版
2. 打开浏览器开发者工具 → Application → Cookies
3. 复制 `MUSIC_U` 和 `__csrf` 的值
4. 在 Vercel 环境变量中设置为：`MUSIC_U=xxx; __csrf=yyy`

### 4. 部署后样式丢失？

检查构建输出目录是否正确：
- `vercel.json` 中 `distDir` 应为 `"dist"`
- 运行 `npm run build` 确认生成 `dist` 目录

## 性能优化

### Edge 函数（可选）

如果需要更低延迟，可以将代理函数迁移到 Vercel Edge Functions：

1. 将 `api/proxy.js` 重命名为 `api/proxy.ts`
2. 添加 Edge Runtime 配置：
   ```ts
   export const config = {
     runtime: 'edge',
   };
   ```
3. 修改代码使用 Web API（类似 Cloudflare 版本）

### CDN 缓存

在 `vercel.json` 中配置静态资源缓存：

```json
{
  "headers": [
    {
      "source": "/css/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    }
  ]
}
```

## 自定义域名

1. Vercel Dashboard → 你的项目 → **Settings** → **Domains**
2. 输入你的域名（如 `music.yourdomain.com`）
3. 按照提示配置 DNS 记录（CNAME 或 A 记录）
4. SSL 证书自动签发

## 对比：Cloudflare vs Vercel

| 特性 | Cloudflare Pages | Vercel |
|------|------------------|--------|
| **免费额度** | 无限请求 | 100GB 带宽/月 |
| **冷启动** | 极快（< 10ms） | 较快（~100ms） |
| **全球 CDN** | ✅ 覆盖更广 | ✅ 主要北美/欧洲 |
| **函数超时** | 10s（免费版） | 10s（Hobby）/ 60s（Pro） |
| **运行时** | Workers（轻量） | Node.js（功能更全） |
| **适用场景** | 全球用户访问 | 北美/欧洲用户为主 |

推荐选择：
- **Cloudflare Pages**: 追求全球低延迟、高并发
- **Vercel**: 需要 Node.js 生态、GitHub 集成更紧密
