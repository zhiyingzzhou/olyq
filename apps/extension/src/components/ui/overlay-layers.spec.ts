/**
 * 说明：`overlay-layers.spec` 组件模块。
 *
 * 职责：
 * - 守住浏览器扩展共享 overlay 层级契约；
 * - 防止后续把阻塞式 dialog 的层级再次压到 popover / dropdown 下面。
 * - 防止再次把 backdrop / content 拆成两个全局 z-index，导致嵌套弹窗遮罩掉回旧弹窗内容下方。
 *
 * 边界：
 * - 本文件只验证共享常量的相对顺序，不覆盖具体 Radix 渲染细节。
 */
import { describe, expect, it } from 'vitest';

import {
  OVERLAY_FLOATING_LAYER_INDEX,
  OVERLAY_MODAL_BACKDROP_DEPTH_INDEX,
  OVERLAY_MODAL_CONTENT_DEPTH_INDEX,
  OVERLAY_MODAL_PREVIEW_LAYER_INDEX,
  OVERLAY_MODAL_STACK_LAYER_INDEX,
  OVERLAY_TOAST_LAYER_INDEX,
} from './overlay-layers';

describe('overlay-layers', () => {
  it('阻塞式模态必须始终压过普通浮层', () => {
    expect(OVERLAY_MODAL_STACK_LAYER_INDEX).toBeGreaterThan(OVERLAY_FLOATING_LAYER_INDEX);
  });

  it('全局 toast 必须始终压过阻塞式模态', () => {
    expect(OVERLAY_TOAST_LAYER_INDEX).toBeGreaterThan(OVERLAY_MODAL_STACK_LAYER_INDEX);
  });

  it('媒体预览必须压过普通阻塞式模态但低于 toast', () => {
    expect(OVERLAY_MODAL_PREVIEW_LAYER_INDEX).toBeGreaterThan(OVERLAY_MODAL_STACK_LAYER_INDEX);
    expect(OVERLAY_MODAL_PREVIEW_LAYER_INDEX).toBeLessThan(OVERLAY_TOAST_LAYER_INDEX);
  });

  it('阻塞式模态必须在 shell 内再区分遮罩和内容深度', () => {
    expect(OVERLAY_MODAL_CONTENT_DEPTH_INDEX).toBeGreaterThan(OVERLAY_MODAL_BACKDROP_DEPTH_INDEX);
  });
});
