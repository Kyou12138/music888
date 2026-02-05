import { defineConfig } from 'vite';
import { devProxyPlugin } from './dev-proxy-plugin';

export default defineConfig({
    // NOTE: 开发代理插件 - 模拟 Vercel 无服务器函数
    plugins: [devProxyPlugin()],
    // public 目录下的静态资源会被复制到 dist 根目录
    publicDir: 'public',
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        // NOTE: 企业级优化 - 设置 chunk 大小警告阈值
        chunkSizeWarningLimit: 50, // 50KB，超出时构建警告
        rollupOptions: {
            output: {
                // NOTE: 手动分割 chunks，优化加载性能
                manualChunks: {
                    // 核心模块
                    'core': ['./js/config.ts', './js/utils.ts', './js/types.ts'],
                },
            },
        },
    },
    server: {
        // NOTE: 设置为 true 允许所有网络接口访问，支持浏览器工具测试
        host: true,
        port: 5173,
        strictPort: false,
        // 修复 HMR WebSocket 连接问题
        hmr: {
            host: 'localhost',
            port: 5173,
        },
    },
});
