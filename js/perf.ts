/**
 * 云音乐播放器 - 性能监控模块
 * 采集 Core Web Vitals (LCP/FID/CLS) 并输出到日志
 */

import { logger } from './config';

// Web Vitals 阈值（毫秒，CLS 为无单位数值）
const THRESHOLDS = {
    LCP: { good: 2500, needsImprovement: 4000 },
    FID: { good: 100, needsImprovement: 300 },
    CLS: { good: 0.1, needsImprovement: 0.25 },
};

type MetricRating = 'good' | 'needs-improvement' | 'poor';

/**
 * 评估指标等级
 */
function rateMetric(name: string, value: number): MetricRating {
    const threshold = THRESHOLDS[name as keyof typeof THRESHOLDS];
    if (!threshold) return 'good';

    if (value <= threshold.good) return 'good';
    if (value <= threshold.needsImprovement) return 'needs-improvement';
    return 'poor';
}

/**
 * 报告性能指标
 */
function reportMetric(name: string, value: number): void {
    const rating = rateMetric(name, value);
    const formattedValue = name === 'CLS' ? value.toFixed(3) : `${Math.round(value)}ms`;

    logger.debug(`[Perf] ${name}: ${formattedValue} (${rating})`);
}

/**
 * 初始化性能监控
 * 使用 PerformanceObserver API 采集 Web Vitals
 */
export function initPerformanceMonitoring(): void {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) {
        logger.debug('[Perf] PerformanceObserver 不可用，跳过性能监控');
        return;
    }

    // LCP (Largest Contentful Paint)
    try {
        const lcpObserver = new PerformanceObserver((entryList) => {
            const entries = entryList.getEntries();
            const lastEntry = entries[entries.length - 1] as PerformanceEntry & { startTime: number };
            if (lastEntry) {
                reportMetric('LCP', lastEntry.startTime);
            }
        });
        lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (e) {
        logger.debug('[Perf] LCP 监控不可用:', e);
    }

    // FID (First Input Delay)
    try {
        const fidObserver = new PerformanceObserver((entryList) => {
            const entries = entryList.getEntries();
            const firstEntry = entries[0] as PerformanceEntry & { processingStart: number; startTime: number };
            if (firstEntry) {
                const fid = firstEntry.processingStart - firstEntry.startTime;
                reportMetric('FID', fid);
            }
        });
        fidObserver.observe({ type: 'first-input', buffered: true });
    } catch (e) {
        logger.debug('[Perf] FID 监控不可用:', e);
    }

    // CLS (Cumulative Layout Shift)
    try {
        let clsValue = 0;
        const clsObserver = new PerformanceObserver((entryList) => {
            for (const entry of entryList.getEntries()) {
                const layoutShift = entry as PerformanceEntry & { hadRecentInput: boolean; value: number };
                if (!layoutShift.hadRecentInput) {
                    clsValue += layoutShift.value;
                }
            }
        });
        clsObserver.observe({ type: 'layout-shift', buffered: true });

        // 页面隐藏时报告最终 CLS
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                reportMetric('CLS', clsValue);
            }
        });
    } catch (e) {
        logger.debug('[Perf] CLS 监控不可用:', e);
    }

    logger.debug('[Perf] 性能监控已初始化');
}
