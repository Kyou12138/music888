/**
 * Vercel Serverless Function Proxy
 * 适配 Vercel Node.js 运行时
 */

const fetch = require('node-fetch');

// NOTE: Vercel Serverless Functions 是无状态的，内存速率限制无法跨实例共享。
// 生产环境应使用 Vercel Edge Config 或 Upstash Redis 实现分布式速率限制。
// 此内存版本仅作为单实例内的基本防护。
const rateLimitStore = new Map();
const RATE_LIMIT = {
    windowMs: 60 * 1000,
    maxRequests: 60,
};

function checkRateLimit(ip) {
    const now = Date.now();
    let data = rateLimitStore.get(ip);

    if (!data || now - data.windowStart > RATE_LIMIT.windowMs) {
        data = { windowStart: now, count: 1 };
        rateLimitStore.set(ip, data);
        return { allowed: true, remaining: RATE_LIMIT.maxRequests - 1, reset: now + RATE_LIMIT.windowMs };
    }

    data.count++;
    return {
        allowed: data.count <= RATE_LIMIT.maxRequests,
        remaining: Math.max(0, RATE_LIMIT.maxRequests - data.count),
        reset: data.windowStart + RATE_LIMIT.windowMs
    };
}

/** 允许的前端来源（CORS） */
const ALLOWED_ORIGINS = [
    'https://music.weny888.com',
    'http://localhost:5173',
    'http://localhost:4173',
];

/** 精确匹配的主机名 */
const ALLOWED_HOSTS_EXACT = new Set([
    // 音乐 API 源
    'music-api.gdstudio.xyz',
    'api.injahow.cn',
    'api.i-meto.com',
    'w7z.indevs.in',
    'netease-cloud-music-api-psi-three.vercel.app',
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
    'api.joox.com',
    // 喜马拉雅 CDN
    'fdfs.xmcdn.com',
    'aod.cos.tx.xmcdn.com',
]);

/** 允许子域名匹配的后缀（仅限已知 CDN 模式） */
const ALLOWED_HOST_SUFFIXES = [
    '.music.126.net',
    '.stream.qqmusic.qq.com',
    '.kugou.com',
    '.sycdn.kuwo.cn',
    '.xmcdn.com',
    '.nf.migu.cn',
];

function isHostAllowed(hostname) {
    if (ALLOWED_HOSTS_EXACT.has(hostname)) return true;
    return ALLOWED_HOST_SUFFIXES.some(suffix => hostname.endsWith(suffix));
}

const NETEASE_COOKIE_HOSTS = [
    'music.163.com',
    'netease-cloud-music-api-psi-three.vercel.app',
    'netease-cloud-music-api-five-roan.vercel.app',
    'w7z.indevs.in',
];

/**
 * Vercel Serverless Function 处理器
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
module.exports = async function handler(req, res) {
    // 获取查询参数
    const url = new URL(req.url, `http://${req.headers.host}`);
    const targetUrlParam = url.searchParams.get('url');

    // 获取客户端 IP（Vercel 提供的头）
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() ||
                     req.headers['x-real-ip'] ||
                     'unknown';

    // OPTIONS 预检处理
    if (req.method === 'OPTIONS') {
        const requestOrigin = req.headers.origin || '';
        const corsOrigin = ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0];
        res.setHeader('Access-Control-Allow-Origin', corsOrigin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Turnstile-Token');
        res.setHeader('Access-Control-Max-Age', '86400');
        return res.status(204).end();
    }

    if (!targetUrlParam) {
        res.setHeader('Content-Type', 'application/json');
        return res.status(400).json({ error: 'URL parameter is required' });
    }

    const decodedUrl = decodeURIComponent(targetUrlParam);

    // 1. 速率限制
    const rate = checkRateLimit(clientIp);
    if (!rate.allowed) {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('X-RateLimit-Reset', Math.ceil(rate.reset / 1000).toString());
        return res.status(429).json({ error: 'Too Many Requests' });
    }

    // 2. Turnstile 验证
    const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
    const turnstileToken = req.headers['x-turnstile-token'];
    if (turnstileSecret) {
        if (!turnstileToken) {
            res.setHeader('Content-Type', 'application/json');
            return res.status(403).json({ error: 'Turnstile token required' });
        }
        try {
            const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    secret: turnstileSecret,
                    response: turnstileToken,
                    remoteip: clientIp
                })
            });
            const verifyData = await verifyRes.json();
            if (!verifyData.success) {
                res.setHeader('Content-Type', 'application/json');
                return res.status(403).json({ error: 'Turnstile verification failed' });
            }
        } catch (e) {
            // Fail-open: 验证服务不可用时放行
            console.error('[proxy] Turnstile verify error:', e.message);
        }
    }

    // 3. 安全检查
    try {
        const parsedTarget = new URL(decodedUrl);

        // 协议验证：仅允许 http/https
        if (parsedTarget.protocol !== 'http:' && parsedTarget.protocol !== 'https:') {
            res.setHeader('Content-Type', 'application/json');
            return res.status(400).json({ error: 'Invalid protocol' });
        }

        if (!isHostAllowed(parsedTarget.hostname)) {
            res.setHeader('Content-Type', 'application/json');
            return res.status(403).json({ error: 'URL not allowed' });
        }

        // CORS 来源验证
        const requestOrigin = req.headers.origin || '';
        const corsOrigin = ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0];

        // 4. 构建请求头
        const refererMap = {
            'gdstudio.xyz': 'https://music-api.gdstudio.xyz/',
            'qq.com': 'https://y.qq.com/',
            'kugou.com': 'https://www.kugou.com/',
            'migu.cn': 'https://music.migu.cn/',
            'kuwo.cn': 'https://www.kuwo.cn/',
            'api.i-meto.com': 'https://api.i-meto.com/',
            'ximalaya.com': 'https://www.ximalaya.com/',
            'xmcdn.com': 'https://www.ximalaya.com/'
        };

        let referer = 'https://music.163.com/';
        for (const [key, val] of Object.entries(refererMap)) {
            if (parsedTarget.hostname.includes(key)) {
                referer = val;
                break;
            }
        }

        const headers = {
            'Referer': referer,
            'Origin': referer.replace(/\/$/, ''),
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*'
        };

        // 针对 GDStudio API 的特殊处理
        if (parsedTarget.hostname.includes('gdstudio.xyz')) {
            headers['Accept-Language'] = 'zh-CN,zh;q=0.9,en;q=0.8';
            headers['Cache-Control'] = 'no-cache';
            headers['Sec-Fetch-Dest'] = 'empty';
            headers['Sec-Fetch-Mode'] = 'cors';
            headers['Sec-Fetch-Site'] = 'same-site';
        }

        const vipCookie = process.env.NETEASE_VIP_COOKIE;
        const isNeteaseHost = NETEASE_COOKIE_HOSTS.some(host =>
            parsedTarget.hostname === host || parsedTarget.hostname.endsWith('.' + host)
        );

        if (vipCookie && isNeteaseHost) {
            headers['Cookie'] = vipCookie;
        }

        // 5. 发起上游请求
        const response = await fetch(parsedTarget.toString(), {
            method: 'GET',
            headers,
            redirect: 'follow'
        });

        // 6. 设置响应头
        res.setHeader('Access-Control-Allow-Origin', corsOrigin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Turnstile-Token');

        // 转发上游响应头
        const contentType = response.headers.get('content-type');
        if (contentType) {
            res.setHeader('Content-Type', contentType);
        }

        // 音频流处理适配
        if (contentType?.includes('audio') || contentType?.includes('octet-stream')) {
            res.setHeader('Accept-Ranges', 'bytes');
        }

        // 转发其他有用的响应头
        const headersToForward = ['content-length', 'cache-control', 'etag', 'last-modified'];
        headersToForward.forEach(header => {
            const value = response.headers.get(header);
            if (value) {
                res.setHeader(header, value);
            }
        });

        // 7. 转发响应体
        res.status(response.status);

        // 使用 node-fetch 的 buffer() 方法获取响应体
        const buffer = await response.buffer();
        return res.send(buffer);

    } catch (error) {
        console.error('[proxy] Request failed:', error.message);
        res.setHeader('Content-Type', 'application/json');
        return res.status(500).json({ error: 'Failed to proxy request' });
    }
};
