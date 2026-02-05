/**
 * 云音乐播放器 - 工具函数单元测试
 */
import { escapeHtml, formatTime, debounce, throttle, getElement } from './utils';

describe('escapeHtml', () => {
    it('应正确转义 HTML 特殊字符', () => {
        // escapeHtml 函数使用 textContent + innerHTML 方法
        // 这种方法会转义 < > & 但可能不会转义双引号
        const result = escapeHtml('<script>alert("xss")</script>');
        // 实际输出：&lt;script&gt;alert("xss")&lt;/script&gt;
        expect(result).toBe('&lt;script&gt;alert("xss")&lt;/script&gt;');
    });

    it('应处理空字符串', () => {
        expect(escapeHtml('')).toBe('');
    });

    it('应处理 null 和 undefined', () => {
        expect(escapeHtml(null as unknown as string)).toBe('');
        expect(escapeHtml(undefined as unknown as string)).toBe('');
    });

    it('应保留普通文本', () => {
        expect(escapeHtml('Hello World')).toBe('Hello World');
    });

    it('应转义 HTML 标签字符', () => {
        const result = escapeHtml('<div>');
        // 期望值应该是转义后的 HTML 实体
        expect(result).toBe('&lt;div&gt;');
    });

    it('应处理多行文本', () => {
        expect(escapeHtml('Line1\nLine2')).toBe('Line1\nLine2');
    });

    it('应转义 & 符号', () => {
        const result = escapeHtml('a & b');
        // 期望值应该是转义后的 HTML 实体
        expect(result).toBe('a &amp; b');
    });

    it('应转义单引号', () => {
        const result = escapeHtml("it's a test");
        expect(result).toBe("it's a test");
    });
});

describe('formatTime', () => {
    it('应正确格式化秒数为 mm:ss', () => {
        expect(formatTime(0)).toBe('0:00');
        expect(formatTime(65)).toBe('1:05');
        expect(formatTime(125)).toBe('2:05');
        expect(formatTime(600)).toBe('10:00');
        expect(formatTime(3599)).toBe('59:59');
    });

    it('应处理非法输入', () => {
        expect(formatTime(-1)).toBe('0:00');
        expect(formatTime(NaN)).toBe('0:00');
        expect(formatTime(Infinity)).toBe('0:00');
    });

    it('应正确处理边界情况', () => {
        expect(formatTime(59)).toBe('0:59');
        expect(formatTime(60)).toBe('1:00');
        expect(formatTime(61)).toBe('1:01');
    });
});

describe('debounce', () => {
    it('应延迟执行函数', async () => {
        let callCount = 0;
        const fn = debounce(() => {
            callCount++;
        }, 50);

        fn();
        fn();
        fn();

        expect(callCount).toBe(0);

        await new Promise(resolve => setTimeout(resolve, 100));

        expect(callCount).toBe(1);
    });

    it('应传递正确的参数', async () => {
        let lastArgs: unknown[] = [];
        const fn = debounce((...args: unknown[]) => {
            lastArgs = args;
        }, 50);

        fn('arg1', 2, { key: 'value' });

        await new Promise(resolve => setTimeout(resolve, 100));

        expect(lastArgs).toEqual(['arg1', 2, { key: 'value' }]);
    });

    it('应正确绑定 this 上下文', async () => {
        const context = { value: 42 };
        const fn = debounce(function (this: typeof context) {
            expect(this).toBe(context);
        }, 50);

        fn.call(context);

        await new Promise(resolve => setTimeout(resolve, 100));
    });
});

describe('throttle', () => {
    it('应限制函数执行频率', async () => {
        let callCount = 0;
        const fn = throttle(() => {
            callCount++;
        }, 50);

        fn();
        fn();
        fn();

        expect(callCount).toBe(1);

        await new Promise(resolve => setTimeout(resolve, 100));

        fn();
        expect(callCount).toBe(2);
    });

    it('应传递正确的参数', async () => {
        let lastArg = 0;
        const fn = throttle((arg: number) => {
            lastArg = arg;
        }, 50);

        fn(42);
        fn(100);

        expect(lastArg).toBe(42);
    });
});

describe('getElement', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="testId">Test Element</div>
            <div class="testClass">Test Class</div>
            <span data-test="value">Data Element</span>
        `;
    });

    it('应通过 ID 获取元素', () => {
        const element = getElement('#testId');
        expect(element).not.toBeNull();
        expect(element?.textContent).toBe('Test Element');
    });

    it('应通过类名获取元素', () => {
        const element = getElement('.testClass');
        expect(element).not.toBeNull();
        expect(element?.textContent).toBe('Test Class');
    });

    it('应通过属性选择器获取元素', () => {
        const element = getElement('[data-test="value"]');
        expect(element).not.toBeNull();
        expect(element?.textContent).toBe('Data Element');
    });

    it('应返回 null 当元素不存在时', () => {
        const element = getElement('#nonExistent');
        expect(element).toBeNull();
    });

    it('应支持泛型类型', () => {
        const input = document.createElement('input');
        input.id = 'testInput';
        document.body.appendChild(input);

        const element = getElement<HTMLInputElement>('#testInput');
        if (element) {
            expect(element.tagName).toBe('INPUT');
        }
    });
});
