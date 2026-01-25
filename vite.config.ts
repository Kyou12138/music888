import { defineConfig } from 'vite';

export default defineConfig({
    // public 目录下的静态资源会被复制到 dist 根目录
    publicDir: 'public',
    build: {
        outDir: 'dist',
        emptyOutDir: true,
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
