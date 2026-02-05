/**
 * 云音乐播放器 - UI 模块单元测试
 */
import { Song } from './types';

// Mock player 模块
vi.mock('./player', () => ({
    isSongInFavorites: vi.fn(() => false),
    toggleFavoriteButton: vi.fn(),
    playSong: vi.fn(),
}));

// Mock api 模块
vi.mock('./api', () => ({
    getSongUrl: vi.fn(() => Promise.resolve({ url: 'https://example.com/song.mp3', br: '320' })),
}));

describe('UI Helper Functions', () => {
    beforeEach(() => {
        // 清理 DOM
        document.body.innerHTML = '';
    });

    describe('showNotification', () => {
        it('应创建通知元素', async () => {
            // 动态导入以确保 mock 生效
            const { showNotification } = await import('./ui');

            showNotification('测试消息', 'info');

            const notification = document.querySelector('.notification');
            expect(notification).not.toBeNull();
            expect(notification?.textContent).toBe('测试消息');
            expect(notification?.classList.contains('notification-info')).toBe(true);
        });

        it('应支持不同类型的通知', async () => {
            const { showNotification } = await import('./ui');

            showNotification('成功消息', 'success');
            const successNotification = document.querySelector('.notification-success');
            expect(successNotification).not.toBeNull();

            showNotification('警告消息', 'warning');
            const warningNotification = document.querySelector('.notification-warning');
            expect(warningNotification).not.toBeNull();

            showNotification('错误消息', 'error');
            const errorNotification = document.querySelector('.notification-error');
            expect(errorNotification).not.toBeNull();
        });
    });

    describe('displaySearchResults', () => {
        it('应显示空状态当没有歌曲时', async () => {
            const { displaySearchResults } = await import('./ui');

            // 创建容器
            const container = document.createElement('div');
            container.id = 'testResults';
            document.body.appendChild(container);

            displaySearchResults([], 'testResults', []);

            expect(container.querySelector('.empty-state')).not.toBeNull();
        });

        it('应渲染歌曲列表', async () => {
            const { displaySearchResults } = await import('./ui');

            // 创建容器
            const container = document.createElement('div');
            container.id = 'testResults';
            document.body.appendChild(container);

            const songs: Song[] = [
                {
                    id: '1',
                    name: '测试歌曲1',
                    artist: ['歌手1'],
                    album: '专辑1',
                    pic_id: 'pic1',
                    lyric_id: 'lyric1',
                    source: 'netease',
                },
                {
                    id: '2',
                    name: '测试歌曲2',
                    artist: ['歌手2', '歌手3'],
                    album: '专辑2',
                    pic_id: 'pic2',
                    lyric_id: 'lyric2',
                    source: 'netease',
                },
            ];

            displaySearchResults(songs, 'testResults', songs);

            const songItems = container.querySelectorAll('.song-item');
            expect(songItems.length).toBe(2);
        });
    });

    describe('updateProgress', () => {
        it('应更新进度条', async () => {
            const { init, updateProgress } = await import('./ui');

            // 创建必要的 DOM 元素
            document.body.innerHTML = `
                <div id="progressFill"></div>
                <span id="currentTime"></span>
                <span id="totalTime"></span>
            `;

            init();
            updateProgress(60, 180);

            const progressFill = document.getElementById('progressFill');
            const currentTime = document.getElementById('currentTime');
            const totalTime = document.getElementById('totalTime');

            expect(progressFill?.style.width).toBe('33.33333333333333%');
            expect(currentTime?.textContent).toBe('1:00');
            expect(totalTime?.textContent).toBe('3:00');
        });
    });

    describe('updatePlayButton', () => {
        it('应更新播放按钮图标', async () => {
            const { init, updatePlayButton } = await import('./ui');

            document.body.innerHTML = `
                <button id="playBtn"><i class="fas fa-play"></i></button>
            `;

            init();

            updatePlayButton(true);
            let icon = document.querySelector('#playBtn i');
            expect(icon?.className).toBe('fas fa-pause');

            updatePlayButton(false);
            icon = document.querySelector('#playBtn i');
            expect(icon?.className).toBe('fas fa-play');
        });
    });

    describe('showLoading', () => {
        it('应显示加载状态', async () => {
            const { showLoading } = await import('./ui');

            const container = document.createElement('div');
            container.id = 'testContainer';
            document.body.appendChild(container);

            showLoading('testContainer');

            expect(container.querySelector('.loading')).not.toBeNull();
            expect(container.querySelector('.fa-spinner')).not.toBeNull();
        });
    });

    describe('showError', () => {
        it('应显示错误信息', async () => {
            const { showError } = await import('./ui');

            const container = document.createElement('div');
            container.id = 'testContainer';
            document.body.appendChild(container);

            showError('测试错误', 'testContainer');

            expect(container.querySelector('.error')).not.toBeNull();
            expect(container.textContent).toContain('测试错误');
        });

        it('应转义 HTML 特殊字符', async () => {
            const { showError } = await import('./ui');

            const container = document.createElement('div');
            container.id = 'testContainer';
            document.body.appendChild(container);

            showError('<script>alert("xss")</script>', 'testContainer');

            // 确保脚本标签被转义而不是执行
            expect(container.innerHTML).toContain('&lt;script&gt;');
            expect(container.querySelector('script')).toBeNull();
        });
    });
});

describe('Lyrics Display', () => {
    beforeEach(() => {
        // Mock scrollIntoView，因为 jsdom 不支持
        Element.prototype.scrollIntoView = vi.fn();
        // Mock requestAnimationFrame，使其立即执行回调
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
            return setTimeout(() => cb(performance.now()), 0) as unknown as number;
        });
        vi.stubGlobal('cancelAnimationFrame', (id: number) => {
            clearTimeout(id);
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('应显示暂无歌词当歌词为空时', async () => {
        const { init, updateLyrics } = await import('./ui');

        document.body.innerHTML = `
            <div id="lyricsContainer"></div>
        `;

        init();
        updateLyrics([], 0);

        // 等待 requestAnimationFrame 执行
        await new Promise(resolve => setTimeout(resolve, 10));

        const container = document.getElementById('lyricsContainer');
        expect(container?.textContent).toContain('暂无歌词');
    });

    it('应渲染歌词行', async () => {
        const { init, updateLyrics } = await import('./ui');

        document.body.innerHTML = `
            <div id="lyricsContainer"></div>
        `;

        init();

        const lyrics = [
            { time: 0, text: '第一行歌词' },
            { time: 5, text: '第二行歌词' },
            { time: 10, text: '第三行歌词' },
        ];

        updateLyrics(lyrics, 0);

        // 等待 requestAnimationFrame 执行
        await new Promise(resolve => setTimeout(resolve, 10));

        const container = document.getElementById('lyricsContainer');
        const lines = container?.querySelectorAll('.lyric-line');
        expect(lines?.length).toBe(3);
    });

    it('应高亮当前歌词行', async () => {
        // 重新导入模块以重置状态
        vi.resetModules();
        const { init, updateLyrics } = await import('./ui');

        document.body.innerHTML = `
            <div id="lyricsContainer"></div>
        `;

        init();

        const lyrics = [
            { time: 0, text: '第一行歌词' },
            { time: 5, text: '第二行歌词' },
            { time: 10, text: '第三行歌词' },
        ];

        // 当前时间为 6 秒，应该高亮第二行
        updateLyrics(lyrics, 6);

        // 等待 requestAnimationFrame 执行
        await new Promise(resolve => setTimeout(resolve, 10));

        const container = document.getElementById('lyricsContainer');
        const activeLine = container?.querySelector('.lyric-line.active');
        expect(activeLine?.textContent).toBe('第二行歌词');
    });
});
