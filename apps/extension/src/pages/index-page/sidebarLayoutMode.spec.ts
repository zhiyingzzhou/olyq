/**
 * 说明：`sidebarLayoutMode.spec` 页面测试模块。
 *
 * 职责：
 * - 固化侧栏工作区宽度断点；
 * - 确认 860px 是 full / floating 的唯一边界；
 *
 * 边界：
 * - 本文件只验证纯函数，不涉及 DOM、ResizeObserver 或持久化设置。
 */
import { describe, expect, it } from 'vitest';

import { SIDEBAR_FLOATING_BREAKPOINT_PX, resolveSidebarLayoutMode } from './sidebarLayoutMode';

describe('sidebarLayoutMode', () => {
  it('在 860px 边界上切换 full / floating 模式', () => {
    expect(SIDEBAR_FLOATING_BREAKPOINT_PX).toBe(860);
    expect(resolveSidebarLayoutMode(859)).toBe('floating');
    expect(resolveSidebarLayoutMode(860)).toBe('full');
  });
});
