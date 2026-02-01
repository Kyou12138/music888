/**
 * 云音乐播放器 - 断路器模式
 * 实现标准断路器模式 (closed → open → half-open)
 * 用于保护外部 API 调用，防止级联故障
 */

import { logger } from './config';

// 断路器状态
export enum CircuitState {
    CLOSED = 'CLOSED',      // 正常状态，允许请求通过
    OPEN = 'OPEN',          // 断开状态，拒绝所有请求
    HALF_OPEN = 'HALF_OPEN' // 半开状态，允许少量请求测试
}

// 断路器配置
export interface CircuitBreakerConfig {
    /** 失败阈值，达到此数值后断开电路 */
    failureThreshold: number;
    /** 断开后等待时间（毫秒），之后进入半开状态 */
    resetTimeout: number;
    /** 半开状态允许的测试请求数 */
    halfOpenRequests: number;
}

// 默认配置
const DEFAULT_CONFIG: CircuitBreakerConfig = {
    failureThreshold: 5,
    resetTimeout: 30000, // 30 秒
    halfOpenRequests: 2
};

/**
 * 断路器类
 * 用于包装外部 API 调用，自动处理故障和恢复
 */
export class CircuitBreaker {
    private state: CircuitState = CircuitState.CLOSED;
    private failureCount: number = 0;
    private successCount: number = 0;
    private lastFailureTime: number = 0;
    private halfOpenAttempts: number = 0;
    private readonly config: CircuitBreakerConfig;
    private readonly name: string;

    constructor(name: string, config: Partial<CircuitBreakerConfig> = {}) {
        this.name = name;
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * 获取当前状态
     */
    getState(): CircuitState {
        this.updateState();
        return this.state;
    }

    /**
     * 判断是否可以执行请求
     */
    canExecute(): boolean {
        this.updateState();

        if (this.state === CircuitState.CLOSED) {
            return true;
        }

        if (this.state === CircuitState.HALF_OPEN) {
            // 半开状态只允许有限请求
            return this.halfOpenAttempts < this.config.halfOpenRequests;
        }

        return false; // OPEN 状态拒绝所有请求
    }

    /**
     * 记录成功
     */
    recordSuccess(): void {
        if (this.state === CircuitState.HALF_OPEN) {
            this.successCount++;
            // 半开状态下足够成功后，恢复正常
            if (this.successCount >= this.config.halfOpenRequests) {
                this.reset();
                logger.debug(`[CircuitBreaker:${this.name}] 恢复正常状态`);
            }
        } else if (this.state === CircuitState.CLOSED) {
            // 正常状态下成功，重置失败计数
            this.failureCount = 0;
        }
    }

    /**
     * 记录失败
     */
    recordFailure(): void {
        this.failureCount++;
        this.lastFailureTime = Date.now();

        if (this.state === CircuitState.HALF_OPEN) {
            // 半开状态下失败，立即断开
            this.trip();
            logger.warn(`[CircuitBreaker:${this.name}] 半开状态失败，重新断开`);
        } else if (this.failureCount >= this.config.failureThreshold) {
            this.trip();
            logger.warn(`[CircuitBreaker:${this.name}] 失败次数达到阈值 (${this.failureCount})，断开电路`);
        }
    }

    /**
     * 执行包装的函数
     * @param fn 要执行的异步函数
     * @returns 函数返回值
     * @throws 如果电路断开或函数执行失败
     */
    async execute<T>(fn: () => Promise<T>): Promise<T> {
        if (!this.canExecute()) {
            throw new Error(`[CircuitBreaker:${this.name}] 电路断开，请求被拒绝`);
        }

        if (this.state === CircuitState.HALF_OPEN) {
            this.halfOpenAttempts++;
        }

        try {
            const result = await fn();
            this.recordSuccess();
            return result;
        } catch (error) {
            this.recordFailure();
            throw error;
        }
    }

    /**
     * 更新状态（检查是否需要从 OPEN 转为 HALF_OPEN）
     */
    private updateState(): void {
        if (this.state === CircuitState.OPEN) {
            const timeSinceLastFailure = Date.now() - this.lastFailureTime;
            if (timeSinceLastFailure >= this.config.resetTimeout) {
                this.state = CircuitState.HALF_OPEN;
                this.halfOpenAttempts = 0;
                this.successCount = 0;
                logger.debug(`[CircuitBreaker:${this.name}] 进入半开状态，允许测试请求`);
            }
        }
    }

    /**
     * 断开电路
     */
    private trip(): void {
        this.state = CircuitState.OPEN;
        this.halfOpenAttempts = 0;
        this.successCount = 0;
    }

    /**
     * 重置电路为正常状态
     */
    private reset(): void {
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        this.successCount = 0;
        this.halfOpenAttempts = 0;
    }

    /**
     * 强制重置（用于手动恢复）
     */
    forceReset(): void {
        this.reset();
        logger.debug(`[CircuitBreaker:${this.name}] 强制重置为正常状态`);
    }

    /**
     * 获取统计信息
     */
    getStats(): {
        name: string;
        state: CircuitState;
        failureCount: number;
        lastFailureTime: number;
    } {
        return {
            name: this.name,
            state: this.getState(),
            failureCount: this.failureCount,
            lastFailureTime: this.lastFailureTime
        };
    }
}

// ============================================
// 预定义的断路器实例
// ============================================

/** GDStudio API 断路器 */
export const gdstudioCircuit = new CircuitBreaker('GDStudio', {
    failureThreshold: 3,
    resetTimeout: 5 * 60 * 1000, // 5 分钟
    halfOpenRequests: 1
});

/** NEC API 断路器 */
export const necCircuit = new CircuitBreaker('NEC', {
    failureThreshold: 5,
    resetTimeout: 60 * 1000, // 1 分钟
    halfOpenRequests: 2
});

/** Meting API 断路器 */
export const metingCircuit = new CircuitBreaker('Meting', {
    failureThreshold: 3,
    resetTimeout: 2 * 60 * 1000, // 2 分钟
    halfOpenRequests: 1
});
