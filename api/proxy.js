// Vercel Serverless Function proxy (Node runtime)
// Mirrors Cloudflare Pages Functions behavior from functions/api/proxy.js.

const rateLimitStore = new Map();
const RATE_LIMIT = {
    windowMs: 60 * 1000,
    maxRequests: 60,
};

function getClientIp(req) {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.length > 0) {
        return xff.split(',')[0].trim();
    }
    const xri = req.headers['x-real-ip'];
    if (typeof xri === 'string' && xri.length > 0) {
        return xri.trim();
    }
    return req.socket?.remoteAddress || 'unknown';
}

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

const ALLOWED_ORIGINS = [
    'https://music.weny888.com',
    'http://localhost:5173',
    'http://localhost:4173',
];

const ALLOWED_HOSTS_EXACT = new Set([
    'music-api.gdstudio.xyz',
    'api.injahow.cn',
    'api.i-meto.com',
    'w7z.indevs.in',
    'netease-cloud-music-api-psi-three.vercel.app',
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
    'api.joox.com',
    'fdfs.xmcdn.com',
    'aod.cos.tx.xmcdn.com',
]);

const ALLOWED_HOST_SUFFIXES = [
    '.music.126.net',
    '.stream.qqmusic.qq.com',
    '.kugou.com',
    '.sycdn.kuwo.cn',
    '.xmcdn.com',
    '.nf.migu.cn',
];

function applyExtraAllowedHosts() {
    const extra = process.env.EXTRA_ALLOWED_HOSTS;
    if (!extra) return;
    extra
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
        .forEach(item => {
            if (item.startsWith('.')) {
                if (!ALLOWED_HOST_SUFFIXES.includes(item)) {
                    ALLOWED_HOST_SUFFIXES.push(item);
                }
            } else {
                ALLOWED_HOSTS_EXACT.add(item);
            }
        });
}

applyExtraAllowedHosts();

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

function getRefererForHost(hostname) {
    if (hostname.includes('gdstudio.xyz')) return 'https://music-api.gdstudio.xyz/';
    if (hostname.includes('qq.com')) return 'https://y.qq.com/';
    if (hostname.includes('kugou.com')) return 'https://www.kugou.com/';
    if (hostname.includes('migu.cn')) return 'https://music.migu.cn/';
    if (hostname.includes('kuwo.cn')) return 'https://www.kuwo.cn/';
    if (hostname.includes('joox.com')) return 'https://www.joox.com/';
    if (hostname.includes('ximalaya.com') || hostname.includes('xmcdn.com')) return 'https://www.ximalaya.com/';
    if (hostname.includes('api.i-meto.com')) return 'https://api.i-meto.com/';
    return 'https://music.163.com/';
}

async function verifyTurnstile(token, clientIp) {
    const secret = process.env.TURNSTILE_SECRET_KEY;
    if (!secret || !token) return;
    try {
        const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                secret,
                response: token,
                remoteip: clientIp
            })
        });
        const data = await res.json();
        if (!data.success) {
            console.warn('[proxy] Turnstile token invalid (possibly reused):', JSON.stringify(data));
        }
    } catch (err) {
        console.warn('[proxy] Turnstile verify error:', err?.message || err);
    }
}

export default async function handler(req, res) {
    const method = req.method || 'GET';

    if (method === 'OPTIONS') {
        const requestOrigin = req.headers.origin || '';
        const corsOrigin = ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0];
        res.setHeader('Access-Control-Allow-Origin', corsOrigin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Turnstile-Token');
        res.setHeader('Access-Control-Max-Age', '86400');
        res.status(204).end();
        return;
    }

    const fullUrl = new URL(req.url || '', `https://${req.headers.host || 'localhost'}`);
    const targetUrlParam = fullUrl.searchParams.get('url');
    if (!targetUrlParam) {
        res.status(400).json({ error: 'URL parameter is required' });
        return;
    }

    const decodedUrl = decodeURIComponent(targetUrlParam);
    const clientIp = getClientIp(req);

    const rate = checkRateLimit(clientIp);
    if (!rate.allowed) {
        res.setHeader('X-RateLimit-Reset', Math.ceil(rate.reset / 1000).toString());
        res.status(429).json({ error: 'Too Many Requests' });
        return;
    }

    const turnstileToken = req.headers['x-turnstile-token'];
    await verifyTurnstile(Array.isArray(turnstileToken) ? turnstileToken[0] : turnstileToken, clientIp);

    let parsedTarget;
    try {
        parsedTarget = new URL(decodedUrl);
    } catch {
        res.status(400).json({ error: 'Invalid URL' });
        return;
    }

    if (parsedTarget.protocol !== 'http:' && parsedTarget.protocol !== 'https:') {
        res.status(400).json({ error: 'Invalid protocol' });
        return;
    }

    if (!isHostAllowed(parsedTarget.hostname)) {
        res.status(403).json({ error: 'URL not allowed' });
        return;
    }

    const requestOrigin = req.headers.origin || '';
    const corsOrigin = ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0];

    const referer = getRefererForHost(parsedTarget.hostname);
    const headers = {
        Referer: referer,
        Origin: referer.replace(/\/$/, ''),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*'
    };

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

    let response;
    try {
        response = await fetch(parsedTarget.toString(), {
            method: 'GET',
            headers,
            redirect: 'follow'
        });
    } catch (err) {
        console.error('[proxy] Request failed:', err?.message || err);
        res.status(500).json({ error: 'Failed to proxy request' });
        return;
    }

    res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Turnstile-Token');

    const contentType = response.headers.get('content-type') || '';
    if (contentType) {
        res.setHeader('Content-Type', contentType);
    }
    const contentLength = response.headers.get('content-length');
    if (contentLength) {
        res.setHeader('Content-Length', contentLength);
    }
    if (contentType.includes('audio') || contentType.includes('octet-stream')) {
        res.setHeader('Accept-Ranges', 'bytes');
    }

    res.status(response.status);

    if (!response.body) {
        const text = await response.text();
        res.end(text);
        return;
    }

    const { Readable } = await import('node:stream');
    Readable.fromWeb(response.body).pipe(res);
}
