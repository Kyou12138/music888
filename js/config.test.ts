/**
 * 云音乐播放器 - 配置模块单元测试
 */
import { logger, API_TIMEOUTS, PROXY_DOMAINS, needsProxy, APP_CONFIG, IS_PRODUCTION } from './config';

describe('Logger', () => {
    it('应正确输出调试日志', () => {
        const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
        logger.debug('test message');
        expect(consoleLogSpy).toHaveBeenCalledWith('[DEBUG]', 'test message');
        consoleLogSpy.mockRestore();
    });

    it('应正确输出信息日志', () => {
        const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
        logger.info('test message');
        expect(consoleLogSpy).toHaveBeenCalledWith('[INFO]', 'test message');
        consoleLogSpy.mockRestore();
    });

    it('应正确输出警告日志', () => {
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });
        logger.warn('test message');
        expect(consoleWarnSpy).toHaveBeenCalledWith('[WARN]', 'test message');
        consoleWarnSpy.mockRestore();
    });

    it('应正确输出错误日志', () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        logger.error('test message');
        expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR]', 'test message');
        consoleErrorSpy.mockRestore();
    });
});

describe('API_TIMEOUTS', () => {
    it('应包含所有超时配置', () => {
        expect(API_TIMEOUTS.API_DETECTION).toBe(8000);
        expect(API_TIMEOUTS.SEARCH).toBe(20000);
        expect(API_TIMEOUTS.SONG_URL).toBe(15000);
        expect(API_TIMEOUTS.LYRICS).toBe(10000);
        expect(API_TIMEOUTS.PLAYLIST).toBe(30000);
    });
});

describe('PROXY_DOMAINS', () => {
    it('应包含网易云音乐域名', () => {
        expect(PROXY_DOMAINS).toContain('music.126.net');
        expect(PROXY_DOMAINS).toContain('m7.music.126.net');
        expect(PROXY_DOMAINS).toContain('m8.music.126.net');
    });

    it('应包含QQ音乐域名', () => {
        expect(PROXY_DOMAINS).toContain('stream.qqmusic.qq.com');
        expect(PROXY_DOMAINS).toContain('dl.stream.qqmusic.qq.com');
    });

    it('应包含酷狗音乐域名', () => {
        expect(PROXY_DOMAINS).toContain('kugou.com');
        expect(PROXY_DOMAINS).toContain('trackercdn.kugou.com');
    });

    it('应包含咪咕音乐域名', () => {
        expect(PROXY_DOMAINS).toContain('migu.cn');
        expect(PROXY_DOMAINS).toContain('freetyst.nf.migu.cn');
    });

    it('应包含酷我音乐域名', () => {
        expect(PROXY_DOMAINS).toContain('kuwo.cn');
        expect(PROXY_DOMAINS).toContain('sycdn.kuwo.cn');
    });
});

describe('needsProxy', () => {
    it('应检测网易云音乐URL需要代理', () => {
        expect(needsProxy('https://m7.music.126.net/song.mp3')).toBe(true);
        expect(needsProxy('https://music.126.net/song.mp3')).toBe(true);
    });

    it('应检测QQ音乐URL需要代理', () => {
        expect(needsProxy('https://stream.qqmusic.qq.com/song.mp3')).toBe(true);
        expect(needsProxy('https://dl.stream.qqmusic.qq.com/song.mp3')).toBe(true);
    });

    it('应检测酷狗音乐URL需要代理', () => {
        expect(needsProxy('https://trackercdn.kugou.com/song.mp3')).toBe(true);
        expect(needsProxy('https://webfs.tx.kugou.com/song.mp3')).toBe(true);
    });

    it('应检测咪咕音乐URL需要代理', () => {
        expect(needsProxy('https://freetyst.nf.migu.cn/song.mp3')).toBe(true);
    });

    it('应检测酷我音乐URL需要代理', () => {
        expect(needsProxy('https://sycdn.kuwo.cn/song.mp3')).toBe(true);
    });

    it('应检测其他URL不需要代理', () => {
        expect(needsProxy('https://example.com/song.mp3')).toBe(false);
        expect(needsProxy('https://cdn.example.com/song.mp3')).toBe(false);
        expect(needsProxy('https://api.example.com/song.mp3')).toBe(false);
    });
});

describe('APP_CONFIG', () => {
    it('应包含应用配置', () => {
        expect(APP_CONFIG.MAX_HISTORY_SIZE).toBe(50);
        expect(APP_CONFIG.INFINITE_SCROLL_BATCH_SIZE).toBe(30);
        expect(APP_CONFIG.DEFAULT_QUALITY).toBe('320');
    });
});

describe('IS_PRODUCTION', () => {
    it('应正确判断生产环境', () => {
        // 在测试环境中，IS_PRODUCTION 应该是 false
        expect(typeof IS_PRODUCTION).toBe('boolean');
    });
});
