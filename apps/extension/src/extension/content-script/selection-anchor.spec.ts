/**
 * 说明：`selection-anchor.spec` 内容脚本选区锚点测试模块。
 *
 * 职责：
 * - 锁住网页工具响应卡片的“实时 Selection 优先、旧矩形兜底”定位语义；
 * - 防止 resize / reflow 后总结、翻译、解释卡片继续停在旧页面宽度下的选区位置；
 * - 避免用户重新划选其它文本时，仍在流式输出的旧响应卡片错误跟随新选区。
 *
 * 边界：
 * - 这里只测试锚点真源选择，不启动 content script runtime；
 * - 不连接 chrome runtime，也不验证具体 fixed 坐标写入。
 */
import { describe, expect, it } from 'vitest';
import {
  resolveSelectionFloatingAnchorRect,
  snapshotAnchorRect,
  type ResolveSelectionFloatingAnchorOptions,
} from './selection-anchor';
import type { PageFloatingAnchorRect } from './floating-position';

/**
 * 构造轻量锚点矩形。
 *
 * @param left - 矩形左侧视口坐标。
 * @param top - 矩形顶部视口坐标。
 * @param width - 矩形宽度。
 * @param height - 矩形高度。
 * @returns 可供 selection-anchor 消费的矩形。
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
 * 以默认参数执行一次锚点解析。
 *
 * @param overrides - 当前测试场景需要覆盖的入参。
 * @returns 解析后的锚点矩形。
 */
function resolve(overrides: Partial<ResolveSelectionFloatingAnchorOptions>) {
  return resolveSelectionFloatingAnchorRect({
    expectedText: 'selected text',
    fallbackRect: makeRect(80, 120, 160, 20),
    getSelectionText: () => 'selected text',
    getSelectionRect: () => makeRect(120, 160, 180, 24),
    ...overrides,
  });
}

describe('content script selection anchor', () => {
  it('响应卡片可见且原选区仍有效时，优先使用最新 Selection rect', () => {
    const latestRect = makeRect(42, 96, 210, 28);

    expect(resolve({ getSelectionRect: () => latestRect })).toEqual(latestRect);
  });

  it('页面 resize 后 Selection 仍是同一段文本时，会替换旧兜底矩形', () => {
    const staleRect = makeRect(360, 220, 160, 22);
    const reflowedRect = makeRect(72, 260, 220, 42);

    expect(resolve({
      fallbackRect: staleRect,
      getSelectionRect: () => reflowedRect,
    })).toEqual(reflowedRect);
  });

  it('Selection 被清空时保留旧矩形，避免流式卡片关闭或跳动', () => {
    const fallbackRect = makeRect(180, 320, 140, 20);

    expect(resolve({
      fallbackRect,
      getSelectionText: () => '',
      getSelectionRect: () => null,
    })).toEqual(fallbackRect);
  });

  it('用户重新划选其它文本时不跟随新选区', () => {
    const fallbackRect = makeRect(180, 320, 140, 20);
    const unrelatedRect = makeRect(24, 48, 300, 32);

    expect(resolve({
      fallbackRect,
      getSelectionText: () => 'another text',
      getSelectionRect: () => unrelatedRect,
    })).toEqual(fallbackRect);
  });

  it('snapshotAnchorRect 会固化 DOMRect-like 对象字段', () => {
    const rect = snapshotAnchorRect(makeRect(12, 34, 56, 78));

    expect(rect).toEqual({
      left: 12,
      top: 34,
      right: 68,
      bottom: 112,
      width: 56,
      height: 78,
    });
  });
});
