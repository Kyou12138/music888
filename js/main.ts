/**
 * 云音乐播放器 - 主程序入口
 * 负责应用初始化、事件绑定和页面交互逻辑
 */
import * as api from './api';
import * as ui from './ui';
import * as player from './player';
import { getElement } from './utils';
import { MusicError } from './types';
import { logger } from './config';
import { initPerformanceMonitoring } from './perf';

// --- 移动端页面切换功能（必须在模块顶层定义，供 HTML onclick 使用）---
let currentMobilePage = 0;

// NOTE: 触摸滑动状态
let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;

/**
 * 切换移动端页面
 * @param pageIndex 页面索引 (0-2)
 */
function switchMobilePage(pageIndex: number): void {
    const mainContainer = document.querySelector('.main-container') as HTMLElement;
    const indicators = document.querySelectorAll('.page-indicator');

    if (mainContainer) {
        // 使用 transform 实现横向滑动
        const offset = -pageIndex * 100;
        mainContainer.style.transform = `translateX(${offset}vw)`;
    }

    // 更新页面指示器
    indicators.forEach((indicator, index) => {
        if (index === pageIndex) {
            indicator.classList.add('active');
        } else {
            indicator.classList.remove('active');
        }
    });

    currentMobilePage = pageIndex;
}

// NOTE: 导出给其他模块使用（如 ui.ts 的点击播放跳转）
// 使用类型安全的 Window 扩展
window.switchMobilePage = switchMobilePage;

// --- 全局错误处理 ---
window.addEventListener('error', event => {
    logger.error('Global error:', event.error);
    ui.showNotification('发生错误，请刷新页面重试', 'error');
});

window.addEventListener('unhandledrejection', event => {
    logger.error('Unhandled promise rejection:', event.reason);
    // NOTE: 使用通用错误消息，因为可能不是网络错误
    ui.showNotification('操作失败，请稍后重试', 'error');
});

// --- Tab Switching Logic ---
/**
 * 切换标签页
 * @param tabName 标签名称
 */
function switchTab(tabName: string): void {
    document.querySelectorAll('.tab-content').forEach(content => {
        (content as HTMLElement).style.display = 'none';
        content.classList.remove('active');
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    const selectedTabContent = document.getElementById(tabName + 'Tab');
    if (selectedTabContent) {
        (selectedTabContent as HTMLElement).style.display = 'flex';
        selectedTabContent.classList.add('active');
    }

    const selectedTabButton = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    if (selectedTabButton) {
        selectedTabButton.classList.add('active');
    }
}

/**
 * 初始化应用程序
 */
function initializeApp(): void {
    logger.info('云音乐 App 初始化...');

    // NOTE: 初始化性能监控（采集 Web Vitals）
    initPerformanceMonitoring();

    ui.init();
    player.initPlayer(); // NOTE: 初始化播放器，绑定 DOM 音频元素

    // NOTE: 注册 Service Worker 实现 PWA 功能
    registerServiceWorker();

    // NOTE: 异步检测可用 API，不阻塞主流程
    api.findWorkingAPI()
        .then(result => {
            if (result.success) {
                ui.showNotification(`已连接到 ${result.name}`, 'success');
                // NOTE: API 连接成功后自动加载推荐
                handleExplore();
            } else {
                ui.showNotification('所有 API 均不可用，请稍后重试', 'error');
            }
        })
        .catch(error => {
            logger.error('API detection failed:', error);
            ui.showNotification('API 检测失败', 'error');
        });

    player.loadSavedPlaylists();

    // --- Event Listeners ---
    bindEventListeners();

    // Initial tab state - 使用热门标签
    switchTab('hot');

    // 加载收藏和播放历史
    loadMyTabData();
}

/**
 * 绑定所有事件监听器
 */
function bindEventListeners(): void {
    // 搜索相关
    const searchBtn = getElement('.search-btn');
    const searchInput = getElement<HTMLInputElement>('#searchInput');
    const exploreBtn = getElement('#exploreRadarBtn');
    const playlistBtn = getElement('.playlist-btn');

    if (searchBtn) {
        searchBtn.addEventListener('click', handleSearch);
    }

    // NOTE: 搜索输入框回车立即搜索（不使用防抖，用户按回车就是要立即搜索）
    if (searchInput) {
        searchInput.addEventListener('keypress', e => {
            if (e.key === 'Enter') {
                handleSearch();
            }
        });
    }

    if (exploreBtn) {
        exploreBtn.addEventListener('click', handleExplore);
    }

    if (playlistBtn) {
        playlistBtn.addEventListener('click', handleParsePlaylist);
    }

    // Player controls
    const playBtn = getElement('#playBtn');
    const prevBtn = getElement('#prevBtn');
    const nextBtn = getElement('#nextBtn');
    const playModeBtn = getElement('#playModeBtn');
    const volumeSlider = getElement<HTMLInputElement>('#volumeSlider');
    const progressBar = getElement('.progress-bar');

    if (playBtn) {
        playBtn.addEventListener('click', player.togglePlay);
    }
    if (prevBtn) {
        prevBtn.addEventListener('click', player.previousSong);
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', player.nextSong);
    }
    if (playModeBtn) {
        playModeBtn.addEventListener('click', player.togglePlayMode);
    }
    if (volumeSlider) {
        volumeSlider.addEventListener('input', e => {
            player.setVolume((e.target as HTMLInputElement).value);
        });
    }
    if (progressBar) {
        progressBar.addEventListener('click', e => player.seekTo(e as MouseEvent));
    }

    // Download buttons
    const downloadSongBtn = getElement('#downloadSongBtn');
    const downloadLyricBtn = getElement('#downloadLyricBtn');

    if (downloadSongBtn) {
        downloadSongBtn.addEventListener('click', () => {
            const currentSong = player.getCurrentSong();
            if (currentSong) player.downloadSongByData(currentSong);
        });
    }
    if (downloadLyricBtn) {
        downloadLyricBtn.addEventListener('click', () => {
            const currentSong = player.getCurrentSong();
            if (currentSong) player.downloadLyricByData(currentSong);
        });
    }

    // NOTE: 播放器区域的收藏按钮
    const playerFavoriteBtn = getElement('#playerFavoriteBtn');
    if (playerFavoriteBtn) {
        playerFavoriteBtn.addEventListener('click', () => {
            const currentSong = player.getCurrentSong();
            if (currentSong) {
                player.toggleFavoriteButton(currentSong);
                // 更新收藏列表
                setTimeout(loadFavorites, 100);
            } else {
                ui.showNotification('请先选择一首歌曲', 'warning');
            }
        });
    }

    // Tab buttons
    document.querySelectorAll('.tab-btn').forEach(button => {
        button.addEventListener('click', () => {
            const tabName = (button as HTMLElement).dataset.tab;
            if (tabName) {
                switchTab(tabName);

                // 切换到"我的"标签时刷新数据
                if (tabName === 'my') {
                    loadMyTabData();
                }

                // 切换到"排行榜"标签时，默认加载热歌榜（如果尚未加载）
                if (tabName === 'ranking') {
                    const rankingResults = document.getElementById('rankingResults');
                    // 如果当前是空状态，则加载热歌榜
                    if (rankingResults && rankingResults.querySelector('.empty-state')) {
                        handleRanking('hot');
                    }
                }
            }
        });
    });

    // 排行榜标签切换
    document.querySelectorAll('.ranking-tab').forEach(button => {
        button.addEventListener('click', () => {
            // 更新激活状态
            document.querySelectorAll('.ranking-tab').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            const rankType = (button as HTMLElement).dataset.rank;
            if (rankType) handleRanking(rankType);
        });
    });

    // 清空播放历史按钮
    const clearHistoryBtn = getElement('#clearHistoryBtn');
    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', () => {
            player.clearPlayHistory();
            const container = getElement('#historyResults');
            if (container) {
                container.innerHTML = `<div class="empty-state"><i class="fas fa-history"></i><div>暂无播放记录</div></div>`;
            }
            ui.showNotification('播放历史已清空', 'success');
        });
    }

    // NOTE: 清空所有歌单按钮
    const clearAllPlaylistsBtn = getElement('.clear-all-btn');
    if (clearAllPlaylistsBtn) {
        clearAllPlaylistsBtn.addEventListener('click', () => {
            if (confirm('确定要清空所有已保存的歌单吗？此操作不可恢复。')) {
                player.clearAllSavedPlaylists();
                const container = getElement('#savedPlaylistsList');
                if (container) {
                    container.innerHTML = `<div class="empty-saved-state"><i class="fas fa-music"></i><div>暂无保存的歌单</div><div style="margin-top: 8px; font-size: 12px; opacity: 0.7;">解析网易云歌单后可保存到这里</div></div>`;
                }
                ui.showNotification('已清空所有歌单', 'success');
            }
        });
    }

    // NOTE: 全局键盘快捷键
    document.addEventListener('keydown', e => {
        // 如果正在输入框中，不触发快捷键
        const activeElement = document.activeElement;
        if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
            return;
        }

        switch (e.code) {
            case 'Space':
                e.preventDefault();
                player.togglePlay();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                player.previousSong();
                break;
            case 'ArrowRight':
                e.preventDefault();
                player.nextSong();
                break;
            case 'ArrowUp':
                e.preventDefault();
                adjustVolume(10);
                break;
            case 'ArrowDown':
                e.preventDefault();
                adjustVolume(-10);
                break;
        }
    });
}

/**
 * 调节音量
 * @param delta 音量变化值（正数增大，负数减小）
 */
function adjustVolume(delta: number): void {
    const volumeSlider = getElement<HTMLInputElement>('#volumeSlider');
    if (volumeSlider) {
        const currentVolume = parseInt(volumeSlider.value, 10);
        const newVolume = Math.max(0, Math.min(100, currentVolume + delta));
        volumeSlider.value = newVolume.toString();
        player.setVolume(newVolume.toString());
    }
}

/**
 * 处理搜索请求
 */
async function handleSearch(): Promise<void> {
    const searchInput = getElement<HTMLInputElement>('#searchInput');
    const sourceSelect = getElement<HTMLSelectElement>('#sourceSelect');

    if (!searchInput) return;

    const keyword = searchInput.value.trim();
    const source = sourceSelect?.value || 'netease'; // 从选择器获取音乐源

    if (!keyword) {
        ui.showNotification('请输入搜索关键词', 'warning');
        return;
    }

    // NOTE: 输入长度限制，防止恶意超长输入
    if (keyword.length > 100) {
        ui.showNotification('搜索关键词过长（最多100字符）', 'warning');
        return;
    }

    ui.showLoading('searchResults');

    try {
        const songs = await api.searchMusicAPI(keyword, source);
        ui.displaySearchResults(songs, 'searchResults', songs);

        if (songs.length === 0) {
            ui.showNotification('未找到相关歌曲', 'info');
        } else {
            // 显示当前使用的音乐源
            const sourceNames: { [key: string]: string } = {
                netease: '网易云音乐',
                tencent: 'QQ音乐',
                kuwo: '酷我音乐',
                kugou: '酷狗音乐',
                migu: '咪咕音乐',
                joox: 'JOOX',
                ximalaya: '喜马拉雅',
                spotify: 'Spotify',
                apple: 'Apple Music',
                ytmusic: 'YouTube Music',
                tidal: 'TIDAL',
                qobuz: 'Qobuz',
                deezer: 'Deezer',
            };
            const sourceName = sourceNames[source] || source;
            ui.showNotification(`从 ${sourceName} 找到 ${songs.length} 首歌曲`, 'success');
        }
    } catch (error) {
        logger.error('Search failed:', error);
        ui.showError('搜索失败，请稍后重试', 'searchResults');
        ui.showNotification('搜索失败，请检查网络连接', 'error');
    }
}

/**
 * 处理探索雷达请求
 */
async function handleExplore(): Promise<void> {
    ui.showLoading('searchResults');

    try {
        const songs = await api.exploreRadarAPI();
        ui.displaySearchResults(songs, 'searchResults', songs);
    } catch (error) {
        logger.error('Explore failed:', error);
        ui.showError('探索失败，请稍后重试', 'searchResults');
    }
}

/**
 * 处理歌单解析请求
 */
async function handleParsePlaylist(): Promise<void> {
    const playlistIdInput = getElement<HTMLInputElement>('#playlistIdInput');

    if (!playlistIdInput) return;

    const playlistId = playlistIdInput.value;

    if (!playlistId.trim()) {
        ui.showNotification('请输入歌单ID或链接', 'warning');
        return;
    }

    ui.showLoading('parseResults');

    try {
        const playlist = await api.parsePlaylistAPI(playlistId);
        ui.displaySearchResults(playlist.songs, 'parseResults', playlist.songs);

        // 显示成功解析的歌单信息
        if (playlist.name) {
            ui.showNotification(`成功解析歌单《${playlist.name}》，共 ${playlist.count || 0} 首歌曲`, 'success');
        }
    } catch (error) {
        logger.error('Parse playlist failed:', error);

        // 使用 MusicError 提供更友好的错误信息
        let errorMessage = '解析歌单失败';
        if (error instanceof MusicError) {
            errorMessage = error.userMessage;
            logger.error(`[${error.type}] ${error.message}`);
        } else if (error instanceof Error) {
            errorMessage = error.message;
        }
        ui.showError(errorMessage, 'parseResults');
        ui.showNotification(errorMessage, 'error');
    }
}

/**
 * 加载"我的"标签页数据（收藏和播放历史）
 */
function loadMyTabData(): void {
    // 加载收藏列表
    loadFavorites();

    // 加载播放历史
    loadPlayHistory();
}

/**
 * 加载收藏列表
 */
function loadFavorites(): void {
    const favorites = player.getFavorites();
    const container = getElement('#favoritesResults');
    const countBadge = getElement('#favoritesCount');

    if (countBadge) {
        countBadge.textContent = favorites.length.toString();
    }

    // NOTE: 无论收藏数量如何都更新容器，确保空列表时显示空状态
    if (container) {
        if (favorites.length > 0) {
            ui.displaySearchResults(favorites, 'favoritesResults', favorites);
        } else {
            container.innerHTML = `<div class="empty-state"><i class="far fa-heart"></i><div>暂无收藏的歌曲</div><div style="margin-top: 8px; font-size: 12px; opacity: 0.7;">点击歌曲旁的爱心添加收藏</div></div>`;
        }
    }
}

/**
 * 加载播放历史
 */
function loadPlayHistory(): void {
    const history = player.getPlayHistory();
    const container = getElement('#historyResults');

    // NOTE: 无论历史记录数量如何都更新容器
    if (container) {
        if (history.length > 0) {
            ui.displaySearchResults(history, 'historyResults', history);
        } else {
            container.innerHTML = `<div class="empty-state"><i class="fas fa-history"></i><div>暂无播放记录</div></div>`;
        }
    }
}

/**
 * 处理排行榜加载
 */
async function handleRanking(rankType: string): Promise<void> {
    ui.showLoading('rankingResults');

    // NOTE: 根据排行榜类型使用不同的关键词
    const keywords: { [key: string]: string } = {
        hot: '热歌榜',
        new: '新歌',
        soar: '飙升',
    };

    const keyword = keywords[rankType] || '热门';

    try {
        const songs = await api.searchMusicAPI(keyword, 'netease');
        ui.displaySearchResults(songs, 'rankingResults', songs);
    } catch (error) {
        logger.error('Ranking load failed:', error);
        ui.showError('加载排行榜失败', 'rankingResults');
    }
}

// --- 应用启动 ---
document.addEventListener('DOMContentLoaded', () => {
    // 初始化主应用
    initializeApp();

    // NOTE: 快速歌单ID事件委托（替代 inline onclick）
    document.querySelectorAll('.quick-id[data-playlist-id]').forEach(el => {
        el.addEventListener('click', () => {
            const playlistInput = getElement<HTMLInputElement>('#playlistIdInput');
            if (playlistInput) {
                playlistInput.value = (el as HTMLElement).dataset.playlistId || '';
            }
        });
    });

    // NOTE: 移动端触摸滑动支持
    const mainContainer = document.querySelector('.main-container');
    if (mainContainer) {
        mainContainer.addEventListener(
            'touchstart',
            e => {
                touchStartX = (e as TouchEvent).changedTouches[0].screenX;
                touchStartY = (e as TouchEvent).changedTouches[0].screenY;
            },
            { passive: true }
        );

        mainContainer.addEventListener(
            'touchend',
            e => {
                touchEndX = (e as TouchEvent).changedTouches[0].screenX;
                touchEndY = (e as TouchEvent).changedTouches[0].screenY;
                handleSwipe();
            },
            { passive: true }
        );
    }

    // NOTE: 页面指示器点击事件委托
    const indicatorContainer = document.querySelector('.mobile-page-indicators');
    if (indicatorContainer) {
        indicatorContainer.addEventListener('click', e => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('page-indicator')) {
                const pageIndex = parseInt(target.dataset.page || '0', 10);
                switchMobilePage(pageIndex);
            }
        });
    }

    // NOTE: 初始化移动端页面指示器
    if (window.innerWidth <= 768) {
        switchMobilePage(0);
    }

    // NOTE: 监听窗口大小变化，自动切换移动端/桌面端布局
    window.addEventListener('resize', () => {
        const mainContainer = document.querySelector('.main-container') as HTMLElement;
        if (window.innerWidth <= 768) {
            switchMobilePage(currentMobilePage);
        } else if (mainContainer) {
            // 桌面端清除移动端 transform
            mainContainer.style.transform = '';
        }
    });
});

function handleSwipe(): void {
    const swipeThreshold = 50; // 最小滑动距离
    const diffX = touchStartX - touchEndX;
    const diffY = touchStartY - touchEndY;

    // NOTE: 只有当横向滑动距离大于纵向滑动距离时，才视为页面切换手势
    // 这样可以保证内容区的垂直滚动不受影响
    if (Math.abs(diffX) > swipeThreshold && Math.abs(diffX) > Math.abs(diffY)) {
        if (diffX > 0 && currentMobilePage < 2) {
            // 向左滑动 - 下一页
            switchMobilePage(currentMobilePage + 1);
        } else if (diffX < 0 && currentMobilePage > 0) {
            // 向右滑动 - 上一页
            switchMobilePage(currentMobilePage - 1);
        }
    }
}

/**
 * 注册 Service Worker
 */
function registerServiceWorker(): void {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker
                .register('/sw.js')
                .then(registration => {
                    logger.debug('SW registered:', registration);
                })
                .catch(error => {
                    logger.debug('SW registration failed:', error);
                });
        });
    }
}
