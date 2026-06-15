/**
 * 说明：主聊天原生滚动条输入识别测试。
 *
 * 职责：
 * - 覆盖 classic scrollbar gutter 的右侧与左侧几何；
 * - 确保 overlay scrollbar、非滚动容器自身目标和非主键事件不会被误判为阅读接管。
 */
import { describe, expect, it, vi } from 'vitest';

import { isChatVerticalScrollbarGutterPointerDown } from './chat-scrollbar-intent';

/**
 * 测试辅助函数：创建带可测量 scrollbar gutter 的滚动容器。
 */
function createScrollRoot(options: {
  readonly clientLeft?: number;
  readonly clientWidth: number;
  readonly offsetWidth: number;
  readonly scrollHeight?: number;
}) {
  const element = document.createElement('div');
  Object.defineProperty(element, 'offsetWidth', { configurable: true, value: options.offsetWidth });
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: options.clientWidth });
  Object.defineProperty(element, 'clientLeft', { configurable: true, value: options.clientLeft ?? 0 });
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: options.scrollHeight ?? 1200 });
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: 400 });
  element.getBoundingClientRect = vi.fn(() => ({
    bottom: 400,
    height: 400,
    left: 0,
    right: 200,
    top: 0,
    width: 200,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  }));
  return element;
}

describe('isChatVerticalScrollbarGutterPointerDown', () => {
  it('命中右侧 classic vertical scrollbar gutter 时返回 true', () => {
    const element = createScrollRoot({ clientWidth: 185, offsetWidth: 200 });

    expect(isChatVerticalScrollbarGutterPointerDown(element, {
      button: 0,
      clientX: 196,
      clientY: 200,
      isPrimary: true,
      target: element,
    })).toBe(true);
  });

  it('命中左侧 classic vertical scrollbar gutter 时返回 true', () => {
    const element = createScrollRoot({ clientLeft: 15, clientWidth: 185, offsetWidth: 200 });

    expect(isChatVerticalScrollbarGutterPointerDown(element, {
      button: 0,
      clientX: 4,
      clientY: 200,
      isPrimary: true,
      target: element,
    })).toBe(true);
  });

  it('非 gutter、overlay scrollbar、子节点目标和非主键事件不会命中', () => {
    const element = createScrollRoot({ clientWidth: 185, offsetWidth: 200 });
    const overlayElement = createScrollRoot({ clientWidth: 200, offsetWidth: 200 });
    const child = document.createElement('div');
    element.appendChild(child);

    expect(isChatVerticalScrollbarGutterPointerDown(element, {
      button: 0,
      clientX: 120,
      clientY: 200,
      target: element,
    })).toBe(false);
    expect(isChatVerticalScrollbarGutterPointerDown(overlayElement, {
      button: 0,
      clientX: 196,
      clientY: 200,
      target: overlayElement,
    })).toBe(false);
    expect(isChatVerticalScrollbarGutterPointerDown(element, {
      button: 0,
      clientX: 196,
      clientY: 200,
      target: child,
    })).toBe(false);
    expect(isChatVerticalScrollbarGutterPointerDown(element, {
      button: 1,
      clientX: 196,
      clientY: 200,
      target: element,
    })).toBe(false);
  });

  it('layout gutter 为 0 时会使用 Olyq scrollbar 视觉 token 识别右侧 overlay thumb', () => {
    const element = createScrollRoot({ clientWidth: 200, offsetWidth: 200 });
    element.style.setProperty('--olyq-scrollbar-size', '8px');

    expect(isChatVerticalScrollbarGutterPointerDown(element, {
      button: 0,
      clientX: 196,
      clientY: 200,
      target: element,
    })).toBe(true);
    expect(isChatVerticalScrollbarGutterPointerDown(element, {
      button: 0,
      clientX: 188,
      clientY: 200,
      target: element,
    })).toBe(false);
  });
});
