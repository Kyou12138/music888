/**
 * 云音乐播放器 Service Worker
 * 提供离线缓存和快速加载支持
 */

const CACHE_NAME = 'music888-v2';

// NOTE: 静态资源列表 - 只缓存确定存在的核心资源
// 构建后的 JS/CSS 文件名包含哈希值，无法预先知道，采用运行时缓存策略
const STATIC_ASSETS = [
    '/'
];

// 安装事件 - 预缓存静态资源
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('正在缓存静态资源...');
                // NOTE: 使用 Promise.allSettled 避免单个资源失败导致整体失败
                return Promise.allSettled(
                    STATIC_ASSETS.map(url =>
                        cache.add(url).catch(err => {
                            console.warn(`缓存资源失败: ${url}`, err);
                            return null;
                        })
                    )
                );
            })
            .then(() => self.skipWaiting())
            .catch(err => {
                console.error('Service Worker 安装失败:', err);
            })
    );
});

// 激活事件 - 清理旧缓存
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        }).then(() => self.clients.claim())
    );
});

// 请求拦截 - 网络优先策略
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // API 请求不缓存
    if (url.hostname.includes('music-api') ||
        url.hostname.includes('w7z.indevs.in') ||
        url.hostname.includes('tktok.de5.net') ||
        url.hostname.includes('gdstudio.xyz') ||
        url.pathname.includes('/api')) {
        return;
    }

    // CDN 资源使用缓存优先
    if (url.hostname.includes('cdnjs.cloudflare.com')) {
        event.respondWith(
            caches.match(request).then((cached) => {
                return cached || fetch(request).then((response) => {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseClone);
                    });
                    return response;
                });
            })
        );
        return;
    }

    // 其他请求使用网络优先策略
    event.respondWith(
        fetch(request)
            .then((response) => {
                // 成功获取，更新缓存
                if (response.ok && request.method === 'GET') {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                // 网络失败，尝试从缓存获取
                return caches.match(request);
            })
    );
});
