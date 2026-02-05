/**
 * Vite 开发代理插件
 * 在本地开发环境中模拟 Vercel 无服务器函数的行为
 * NOTE: 仅用于开发环境，生产环境使用 Vercel 的 api/proxy.js
 */

import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';

// NOTE: API 源白名单，参考 api/proxy.js
const ALLOWED_HOSTS = [
    'music-api.gdstudio.xyz',
    'api.injahow.cn',
    'meting.qjqq.cn',
    'w7z.indevs.in',
    'tktok.de5.net',
    'netease-cloud-music-api-five-roan.vercel.app',
    'y.qq.com',
    'music.163.com',
    'interface.music.163.com',
    'music.126.net',
    'm7.music.126.net',
    'm8.music.126.net',
    'm701.music.126.net',
    'm801.music.126.net',
    'p1.music.126.net',
    'p2.music.126.net',
    'dl.stream.qqmusic.qq.com',
    'ws.stream.qqmusic.qq.com',
    'isure.stream.qqmusic.qq.com',
    'trackercdn.kugou.com',
    'webfs.tx.kugou.com',
    'freetyst.nf.migu.cn',
    'sycdn.kuwo.cn',
    'other.web.nf01.sycdn.kuwo.cn',
    'other.web.ra01.sycdn.kuwo.cn',
    'joox.com',
    'api.joox.com',
    'ximalaya.com',
    'fdfs.xmcdn.com',
    'aod.cos.tx.xmcdn.com',
];

// NOTE: 上游请求超时时间
const UPSTREAM_TIMEOUT = 30000;

/**
 * 验证 URL 是否在白名单中
 */
function isUrlAllowed(url: string): boolean {
    try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return false;
        }
        return ALLOWED_HOSTS.some(
            (host) => parsed.hostname === host || parsed.hostname.endsWith('.' + host)
        );
    } catch {
        return false;
    }
}

/**
 * 根据目标域名获取合适的 Referer
 */
function getRefererForHost(hostname: string): string {
    if (hostname.includes('gdstudio.xyz')) {
        return 'https://music-api.gdstudio.xyz/';
    } else if (hostname.includes('qq.com')) {
        return 'https://y.qq.com/';
    } else if (hostname.includes('kugou.com')) {
        return 'https://www.kugou.com/';
    } else if (hostname.includes('migu.cn')) {
        return 'https://music.migu.cn/';
    } else if (hostname.includes('kuwo.cn')) {
        return 'https://www.kuwo.cn/';
    } else if (hostname.includes('joox.com')) {
        return 'https://www.joox.com/';
    } else if (hostname.includes('ximalaya.com') || hostname.includes('xmcdn.com')) {
        return 'https://www.ximalaya.com/';
    }
    return 'https://music.163.com/';
}

/**
 * 处理代理请求
 */
async function handleProxyRequest(
    req: IncomingMessage,
    res: ServerResponse,
    urlParam: string
): Promise<void> {
    const decodedUrl = decodeURIComponent(urlParam);

    // 验证 URL 安全性
    if (!isUrlAllowed(decodedUrl)) {
        console.warn(`[dev-proxy] Blocked request to unauthorized URL: ${decodedUrl}`);
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'URL not allowed' }));
        return;
    }

    try {
        const parsedUrl = new URL(decodedUrl);
        const referer = getRefererForHost(parsedUrl.hostname);

        // 使用 AbortController 实现超时
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT);

        const response = await fetch(parsedUrl.toString(), {
            headers: {
                Referer: referer,
                Origin: referer.replace(/\/$/, ''),
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                Accept: 'application/json, text/plain, */*',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            },
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            console.error(`[dev-proxy] Upstream error: ${response.status} for ${decodedUrl.substring(0, 100)}`);
            res.statusCode = response.status;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: `Upstream API responded with status: ${response.status}` }));
            return;
        }

        // 设置 CORS 头
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        // 复制响应头
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        res.setHeader('Content-Type', contentType);

        const contentLength = response.headers.get('content-length');
        if (contentLength) {
            res.setHeader('Content-Length', contentLength);
        }

        // 根据响应类型设置额外头
        if (contentType.includes('audio') || contentType.includes('octet-stream')) {
            res.setHeader('Accept-Ranges', 'bytes');
        }

        // 流式传输响应体
        const reader = response.body?.getReader();
        if (reader) {
            const pump = async (): Promise<void> => {
                const { done, value } = await reader.read();
                if (done) {
                    res.end();
                    return;
                }
                res.write(Buffer.from(value));
                return pump();
            };
            await pump();
        } else {
            const buffer = await response.arrayBuffer();
            res.end(Buffer.from(buffer));
        }
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            console.error('[dev-proxy] Request timeout:', decodedUrl.substring(0, 100));
            res.statusCode = 504;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Request timeout' }));
        } else {
            console.error('[dev-proxy] Request failed:', error);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Failed to proxy request' }));
        }
    }
}

/**
 * 创建开发代理插件
 */
export function devProxyPlugin(): Plugin {
    return {
        name: 'dev-proxy',
        configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
                // 只处理 /api/proxy 路径
                if (!req.url?.startsWith('/api/proxy')) {
                    return next();
                }

                // 处理 CORS 预检请求
                if (req.method === 'OPTIONS') {
                    res.setHeader('Access-Control-Allow-Origin', '*');
                    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
                    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
                    res.setHeader('Access-Control-Max-Age', '86400');
                    res.statusCode = 204;
                    res.end();
                    return;
                }

                // 解析 URL 参数
                const url = new URL(req.url, 'http://localhost');
                const targetUrl = url.searchParams.get('url');

                if (!targetUrl) {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'URL parameter is required' }));
                    return;
                }

                await handleProxyRequest(req, res, targetUrl);
            });
        },
    };
}
