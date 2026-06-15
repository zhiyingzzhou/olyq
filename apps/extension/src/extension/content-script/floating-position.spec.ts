/**
 * 说明：`floating-position.spec` 内容脚本浮层定位测试模块。
 *
 * 职责：
 * - 锁住 page-facing Shadow DOM 浮层的 flip / shift / size 合同；
 * - 验证普通划词菜单、隐藏菜单、响应卡片和元素选择器共享的底层定位语义；
 * - 防止后续重新回到只夹锚点、不夹浮层真实宽高的实现。
 *
 * 边界：
 * - 这里只测试纯 DOM fixed 定位计算；
 * - 不启动 content script runtime，不模拟 Chrome runtime，也不绑定业务事件。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { positionPageFloatingElement, type PageFloatingAnchorRect } from './floating-position';

/**
 * 构造 jsdom 中缺失的 DOMRect-like 对象。
 *
 * @param left - 矩形左侧视口坐标。
 * @param top - 矩形顶部视口坐标。
 * @param width - 矩形宽度。
 * @param height - 矩形高度。
 * @returns 可供定位 helper 消费的矩形。
 */
function makeRect(left: number, top: number, width: number, height: number): PageFloatingAnchorRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}

/**
 * 构造带固定测量尺寸的浮层节点。
 *
 * @param width - 浮层测量宽度。
 * @param height - 浮层测量高度。
 * @returns 可传给定位 helper 的 HTMLElement。
 */
function makeFloating(width: number, height: number) {
  const el = document.createElement('div');
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => makeRect(0, 0, width, height),
  });
  document.body.appendChild(el);
  return el;
}

describe('content script floating position', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 240 });
  });

  it('靠右选区会按完整浮层宽度向左 shift，避免右侧越界', () => {
    const floating = makeFloating(180, 40);

    const result = positionPageFloatingElement({
      anchorRect: makeRect(292, 120, 20, 16),
      floating,
      preferredSide: 'top',
      padding: 10,
      gap: 8,
      fallbackWidth: 180,
      fallbackHeight: 40,
    });

    expect(result.left + result.width).toBeLessThanOrEqual(310);
    expect(floating.style.left).toBe('130px');
    expect(floating.style.transform).toBe('none');
    expect(floating.dataset.placement).toBe('top');
  });

  it('短工具条只做定位不写最大尺寸，避免被压成滚动容器', () => {
    const floating = makeFloating(360, 40);

    const result = positionPageFloatingElement({
      anchorRect: makeRect(292, 120, 20, 16),
      floating,
      preferredSide: 'top',
      padding: 10,
      gap: 8,
      fallbackWidth: 360,
      fallbackHeight: 40,
      sizeStrategy: 'position-only',
    });

    expect(floating.style.maxWidth).toBe('');
    expect(floating.style.maxHeight).toBe('');
    expect(floating.style.left).toBe('10px');
    expect(result.width).toBe(360);
    expect(floating.style.transform).toBe('none');
    expect(floating.dataset.placement).toBe('top');
  });

  it('顶部空间不足时会从 top 翻到 bottom', () => {
    const floating = makeFloating(160, 48);

    const result = positionPageFloatingElement({
      anchorRect: makeRect(80, 12, 60, 18),
      floating,
      preferredSide: 'top',
      padding: 10,
      gap: 8,
      fallbackWidth: 160,
      fallbackHeight: 48,
    });

    expect(result.placement).toBe('bottom');
    expect(floating.style.top).toBe('38px');
    expect(floating.dataset.placement).toBe('bottom');
  });

  it('tooltip 顶部空间不足且右侧足够时会从 top fallback 到 right', () => {
    const floating = makeFloating(120, 30);

    const result = positionPageFloatingElement({
      anchorRect: makeRect(20, 4, 34, 34),
      floating,
      preferredSide: 'top',
      fallbackPlacements: ['right', 'left', 'bottom'],
      padding: 10,
      gap: 8,
      fallbackWidth: 120,
      fallbackHeight: 30,
    });

    expect(result.placement).toBe('right');
    expect(floating.style.left).toBe('62px');
    expect(floating.style.top).toBe('10px');
    expect(floating.dataset.placement).toBe('right');
  });

  it('tooltip 顶部和右侧空间不足时会 fallback 到 left', () => {
    const floating = makeFloating(120, 30);

    const result = positionPageFloatingElement({
      anchorRect: makeRect(270, 4, 34, 34),
      floating,
      preferredSide: 'top',
      fallbackPlacements: ['right', 'left', 'bottom'],
      padding: 10,
      gap: 8,
      fallbackWidth: 120,
      fallbackHeight: 30,
    });

    expect(result.placement).toBe('left');
    expect(floating.style.left).toBe('142px');
    expect(floating.style.top).toBe('10px');
    expect(floating.dataset.placement).toBe('left');
  });

  it('tooltip 四边空间都不足时选择可用空间最多的方向并夹进视口', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 160 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 80 });
    const floating = makeFloating(140, 70);

    const result = positionPageFloatingElement({
      anchorRect: makeRect(70, 30, 20, 20),
      floating,
      preferredSide: 'top',
      fallbackPlacements: ['right', 'left', 'bottom'],
      padding: 10,
      gap: 8,
      fallbackWidth: 140,
      fallbackHeight: 70,
    });

    expect(result.placement).toBe('right');
    expect(result.left).toBeGreaterThanOrEqual(10);
    expect(result.top).toBeGreaterThanOrEqual(10);
    expect(result.left + result.width).toBeLessThanOrEqual(150);
    expect(result.top + result.height).toBeLessThanOrEqual(70);
  });

  it('底部空间不足时会从 bottom 翻到 top', () => {
    const floating = makeFloating(160, 48);

    const result = positionPageFloatingElement({
      anchorRect: makeRect(80, 210, 60, 18),
      floating,
      preferredSide: 'bottom',
      padding: 10,
      gap: 8,
      fallbackWidth: 160,
      fallbackHeight: 48,
    });

    expect(result.placement).toBe('top');
    expect(floating.style.top).toBe('154px');
    expect(floating.dataset.placement).toBe('top');
  });

  it('浮层大于视口时会写入 maxWidth/maxHeight 且坐标不为负', () => {
    const floating = makeFloating(480, 420);

    const result = positionPageFloatingElement({
      anchorRect: makeRect(120, 80, 40, 24),
      floating,
      preferredSide: 'bottom',
      padding: 12,
      gap: 8,
      fallbackWidth: 480,
      fallbackHeight: 420,
    });

    expect(floating.style.maxWidth).toBe('296px');
    expect(floating.style.maxHeight).toBe('216px');
    expect(floating.style.boxSizing).toBe('border-box');
    expect(result.left).toBeGreaterThanOrEqual(12);
    expect(result.top).toBeGreaterThanOrEqual(12);
    expect(result.left + result.width).toBeLessThanOrEqual(308);
    expect(result.top + result.height).toBeLessThanOrEqual(228);
  });
});
