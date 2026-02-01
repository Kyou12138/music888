const fetch = require('node-fetch');

// NOTE: 上游请求超时时间 (毫秒)
const UPSTREAM_TIMEOUT = 30000;

// NOTE: URL 参数最大长度限制
const MAX_URL_LENGTH = 2048;

// ============================================
// 速率限制配置
// ============================================

// NOTE: 速率限制 - 60次/分钟/IP
const RATE_LIMIT = {
    windowMs: 60 * 1000, // 1 分钟
    maxRequests: 60,
};

// NOTE: 简单内存存储（Vercel Serverless 函数间不共享，但单实例内有效）
const rateLimitStore = new Map();

/**
 * 清理过期的速率限制记录
 */
function cleanupExpiredEntries() {
    const now = Date.now();
    for (const [key, data] of rateLimitStore.entries()) {
        if (now - data.windowStart > RATE_LIMIT.windowMs) {
            rateLimitStore.delete(key);
        }
    }
}

/**
 * 检查速率限制
 * @param {string} ip 客户端 IP
 * @returns {{ allowed: boolean, remaining: number, resetTime: number }}
 */
function checkRateLimit(ip) {
    const now = Date.now();

    // 定期清理（每 100 次请求）
    if (rateLimitStore.size > 100) {
        cleanupExpiredEntries();
    }

    let data = rateLimitStore.get(ip);

    if (!data || now - data.windowStart > RATE_LIMIT.windowMs) {
        // 新窗口
        data = { windowStart: now, count: 1 };
        rateLimitStore.set(ip, data);
        return {
            allowed: true,
            remaining: RATE_LIMIT.maxRequests - 1,
            resetTime: now + RATE_LIMIT.windowMs
        };
    }

    data.count++;
    rateLimitStore.set(ip, data);

    return {
        allowed: data.count <= RATE_LIMIT.maxRequests,
        remaining: Math.max(0, RATE_LIMIT.maxRequests - data.count),
        resetTime: data.windowStart + RATE_LIMIT.windowMs
    };
}

// ============================================
// CORS 来源白名单
// ============================================

// NOTE: 允许的来源域名（生产环境应配置实际域名）
const ALLOWED_ORIGINS = [
    // 本地开发
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    // Vercel 预览和生产
    /\.vercel\.app$/,
    // 自定义域名（请根据实际情况修改）
    // 'https://your-domain.com',
];

/**
 * 检查来源是否允许
 * @param {string} origin 请求来源
 * @returns {boolean}
 */
function isOriginAllowed(origin) {
    if (!origin) return false;

    for (const allowed of ALLOWED_ORIGINS) {
        if (typeof allowed === 'string' && origin === allowed) {
            return true;
        }
        if (allowed instanceof RegExp && allowed.test(origin)) {
            return true;
        }
    }
    return false;
}

/**
 * 获取允许的 CORS 来源
 * @param {string} requestOrigin 请求来源
 * @returns {string} 允许的来源或空字符串
 */
function getAllowedOrigin(requestOrigin) {
    if (isOriginAllowed(requestOrigin)) {
        return requestOrigin;
    }
    // 开发环境或未指定来源时，允许所有（便于调试）
    if (process.env.NODE_ENV !== 'production' || !requestOrigin) {
        return '*';
    }
    return '';
}

// NOTE: 白名单域名列表，只允许代理到这些可信域名
const ALLOWED_HOSTS = [
    // 音乐 API 源
    'music-api.gdstudio.xyz',
    'api.injahow.cn',
    'meting.qjqq.cn',
    'nec8.de5.net',
    'tktok.de5.net',
    'netease-cloud-music-api-five-roan.vercel.app',
    // QQ 音乐
    'y.qq.com',
    // 网易云音乐
    'music.163.com',
    'interface.music.163.com',
    // 网易云音乐 CDN (音频流)
    'music.126.net',
    'm7.music.126.net',
    'm8.music.126.net',
    'm701.music.126.net',
    'm801.music.126.net',
    'p1.music.126.net',
    'p2.music.126.net',
    // QQ 音乐 CDN
    'dl.stream.qqmusic.qq.com',
    'ws.stream.qqmusic.qq.com',
    'isure.stream.qqmusic.qq.com',
    // 酷狗音乐 CDN
    'trackercdn.kugou.com',
    'webfs.tx.kugou.com',
    // 咪咕音乐 CDN
    'freetyst.nf.migu.cn',
    // 酷我音乐 CDN
    'sycdn.kuwo.cn',
    'other.web.nf01.sycdn.kuwo.cn',
    'other.web.ra01.sycdn.kuwo.cn',
    // JOOX CDN
    'joox.com',
    'api.joox.com',
    // 喜马拉雅 CDN
    'ximalaya.com',
    'fdfs.xmcdn.com',
    'aod.cos.tx.xmcdn.com'
];

/**
 * 验证 URL 是否在白名单中
 * @param {string} url 需要验证的 URL
 * @returns {boolean} 是否允许访问
 */
function isUrlAllowed(url) {
    try {
        const parsed = new URL(url);
        // NOTE: 只允许 http 和 https 协议，禁止 file:// 等其他协议
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return false;
        }
        return ALLOWED_HOSTS.some(host =>
            parsed.hostname === host || parsed.hostname.endsWith('.' + host)
        );
    } catch {
        return false;
    }
}

module.exports = async (req, res) => {
    // NOTE: 获取客户端 IP（Vercel 提供）
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                     req.headers['x-real-ip'] ||
                     req.socket?.remoteAddress ||
                     'unknown';

    // NOTE: 获取请求来源
    const requestOrigin = req.headers.origin || '';
    const allowedOrigin = getAllowedOrigin(requestOrigin);

    // NOTE: 处理 CORS 预检请求
    if (req.method === 'OPTIONS') {
        if (allowedOrigin) {
            res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
        }
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Access-Control-Max-Age', '86400');
        return res.status(204).end();
    }

    // NOTE: 速率限制检查
    const rateLimit = checkRateLimit(clientIp);
    res.setHeader('X-RateLimit-Limit', RATE_LIMIT.maxRequests);
    res.setHeader('X-RateLimit-Remaining', rateLimit.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(rateLimit.resetTime / 1000));

    if (!rateLimit.allowed) {
        console.warn(`Rate limit exceeded for IP: ${clientIp}`);
        return res.status(429).json({
            error: 'Too Many Requests',
            retryAfter: Math.ceil((rateLimit.resetTime - Date.now()) / 1000)
        });
    }

    const url = req.query.url;
    if (!url) {
        return res.status(400).json({ error: 'URL parameter is required' });
    }

    // NOTE: URL 长度验证
    if (url.length > MAX_URL_LENGTH) {
        console.warn(`URL too long: ${url.length} chars from IP: ${clientIp}`);
        return res.status(414).json({ error: 'URL too long' });
    }

    // NOTE: 安全检查 - 验证 URL 是否在白名单中
    const decodedUrl = decodeURIComponent(url);
    if (!isUrlAllowed(decodedUrl)) {
        console.warn(`Blocked proxy request to unauthorized URL: ${decodedUrl}`);
        return res.status(403).json({ error: 'URL not allowed' });
    }

    // NOTE: 创建超时控制器
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT);

    try {
        const parsedUrl = new URL(decodedUrl);

        // NOTE: 根据目标域名动态设置 Referer 和其他请求头
        let referer = 'https://music.163.com/';
        let extraHeaders = {};

        if (parsedUrl.hostname.includes('gdstudio.xyz')) {
            // GDStudio API 需要特殊的请求头
            referer = 'https://music-api.gdstudio.xyz/';
            extraHeaders = {
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
            };
        } else if (parsedUrl.hostname.includes('qq.com')) {
            referer = 'https://y.qq.com/';
        } else if (parsedUrl.hostname.includes('kugou.com')) {
            referer = 'https://www.kugou.com/';
        } else if (parsedUrl.hostname.includes('migu.cn')) {
            referer = 'https://music.migu.cn/';
        } else if (parsedUrl.hostname.includes('kuwo.cn')) {
            referer = 'https://www.kuwo.cn/';
        } else if (parsedUrl.hostname.includes('joox.com')) {
            referer = 'https://www.joox.com/';
        } else if (parsedUrl.hostname.includes('ximalaya.com') || parsedUrl.hostname.includes('xmcdn.com')) {
            referer = 'https://www.ximalaya.com/';
        }

        const response = await fetch(decodedUrl, {
            headers: {
                'Referer': referer,
                'Origin': referer.replace(/\/$/, ''),
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                ...extraHeaders
            },
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            console.error(`Proxy upstream error: ${response.status} for ${decodedUrl.substring(0, 100)}`);
            return res.status(response.status).json({ error: `Upstream API responded with status: ${response.status}` });
        }

        // NOTE: 获取响应类型和长度
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        const contentLength = response.headers.get('content-length');

        // NOTE: 设置 CORS 头，使用安全的来源限制
        if (allowedOrigin) {
            res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
        }
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        // NOTE: 如果不是 * 来源，需要设置 Vary 头
        if (allowedOrigin && allowedOrigin !== '*') {
            res.setHeader('Vary', 'Origin');
        }

        // NOTE: 根据响应类型设置不同的响应头
        res.setHeader('Content-Type', contentType);

        if (contentType.includes('audio') || contentType.includes('octet-stream')) {
            // 音频流响应
            res.setHeader('Accept-Ranges', 'bytes');
        }

        if (contentLength) {
            res.setHeader('Content-Length', contentLength);
        }

        // NOTE: 将响应流管道传输到客户端
        response.body.pipe(res);

    } catch (error) {
        clearTimeout(timeoutId);

        // NOTE: 区分超时错误和其他错误
        if (error.name === 'AbortError') {
            console.error('Proxy timeout:', decodedUrl.substring(0, 100));
            return res.status(504).json({ error: 'Request timeout' });
        }

        console.error('Proxy error:', error.message);
        // NOTE: 不向客户端暴露内部错误详情，只返回通用错误消息
        res.status(500).json({ error: 'Failed to proxy request' });
    }
};
