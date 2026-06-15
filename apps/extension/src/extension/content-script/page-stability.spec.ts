/**
 * 说明：`page-stability` 页面稳定窗口测试。
 *
 * 职责：
 * - 验证稳定窗口等待有硬截止时间；
 * - 覆盖后台标签页 requestAnimationFrame 不推进时的 timeout 语义。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PageStableWindowTimeoutError,
  resetPageStabilityRuntimeForTesting,
  waitForReadableDomStableWindow,
  waitForPageStableWindow,
} from './page-stability';

const originalRequestAnimationFrame = window.requestAnimationFrame;

/** 等待当前 microtask 队列完成。 */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('page-stability bounded wait', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    document.body.innerHTML = '<main><h1>Ready</h1><p>Content</p></main>';
    Object.defineProperty(document, 'readyState', {
      configurable: true,
      value: 'complete',
    });
    resetPageStabilityRuntimeForTesting();
  });

  afterEach(() => {
    resetPageStabilityRuntimeForTesting();
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: originalRequestAnimationFrame,
    });
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('页面长期达不到 quiet window 时会按预算退出', async () => {
    const requestAnimationFrameMock = vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: requestAnimationFrameMock,
    });

    const pending = waitForPageStableWindow({ maxWaitMs: 80 });
    const rejection = expect(pending).rejects.toBeInstanceOf(PageStableWindowTimeoutError);
    await vi.advanceTimersByTimeAsync(80);
    await flushMicrotasks();

    await rejection;
    expect(requestAnimationFrameMock).not.toHaveBeenCalled();
  });

  it('requestAnimationFrame 不推进时会按预算退出', async () => {
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: vi.fn(() => 1),
    });

    const pending = waitForPageStableWindow({ maxWaitMs: 500 });
    const rejection = expect(pending).rejects.toBeInstanceOf(PageStableWindowTimeoutError);
    await vi.advanceTimersByTimeAsync(500);
    await flushMicrotasks();

    await rejection;
  });

  it('readable-dom 稳定窗口不会被动画 style 变化拖到超时', async () => {
    const animated = document.createElement('div');
    animated.textContent = 'Manage and simulate agentic workflows for teams. '.repeat(20);
    document.body.appendChild(animated);

    let running = true;
    /** 模拟页面持续执行视觉动画，只修改 style，不改变正文。 */
    const animateStyle = () => {
      if (!running) return;
      animated.style.transform = `translateX(${Date.now() % 10}px)`;
      window.setTimeout(animateStyle, 16);
    };
    animateStyle();

    const pending = waitForReadableDomStableWindow({ maxWaitMs: 800 });
    await vi.advanceTimersByTimeAsync(400);
    await flushMicrotasks();

    await expect(pending).resolves.toMatchObject({
      routeKey: expect.any(String),
      stableWindowVersion: 1,
    });
    running = false;
  });

  it('常规页面稳定窗口仍会被持续 style 变化按预算截断', async () => {
    const animated = document.createElement('div');
    animated.textContent = 'Animated visual shell';
    document.body.appendChild(animated);

    let running = true;
    /** 模拟严格稳定窗口需要等待的持续 style 变化。 */
    const animateStyle = () => {
      if (!running) return;
      animated.style.transform = `translateX(${Date.now() % 10}px)`;
      window.setTimeout(animateStyle, 16);
    };
    animateStyle();

    const pending = waitForPageStableWindow({ maxWaitMs: 500 });
    const rejection = expect(pending).rejects.toBeInstanceOf(PageStableWindowTimeoutError);
    await vi.advanceTimersByTimeAsync(500);
    await flushMicrotasks();

    await rejection;
    running = false;
  });
});
