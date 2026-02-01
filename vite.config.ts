import { defineConfig } from 'vite';

export default defineConfig({
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
        host: 'localhost',
        port: 5173,
        strictPort: false,
        // 修复 HMR WebSocket 连接问题
        hmr: {
            host: 'localhost',
            port: 5173,
        },
    },
});
