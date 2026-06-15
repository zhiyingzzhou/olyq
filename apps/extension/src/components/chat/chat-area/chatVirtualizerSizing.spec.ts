/**
 * 说明：`chatVirtualizerSizing.spec` 组件模块。
 *
 * 职责：
 * - 覆盖主聊天虚拟列表的动态高度滚动修正规则；
 * - 守住 follow-bottom 与 detached-reading 在尺寸回灌时的唯一 owner 契约。
 *
 * 边界：
 * - 这里只验证纯 sizing 规则；
 * - 不验证 command pipeline、DOM 测量或业务消息状态。
 */
import { describe, expect, it } from "vitest";
import type { VirtualItem } from "@tanstack/react-virtual";

import {
  CHAT_DETACHED_READING_TOP_GUARD_PX,
  shouldAdjustChatScrollPositionOnItemSizeChange,
} from "./chatVirtualizerSizing";

/**
 * 构造满足 TanStack Virtual 类型约束的测试虚拟行。
 *
 * @remarks
 * 纯规则测试只关心当前行的几何与索引，但 `VirtualItem` 还要求 `key/lane`；
 * 这里统一补齐最小必需字段，避免每个用例重复手写样板。
 */
function createVirtualItem(partial: Pick<VirtualItem, "index" | "start" | "end" | "size">): VirtualItem {
  return {
    key: `row-${partial.index}`,
    lane: 0,
    ...partial,
  };
}

describe("chatVirtualizerSizing", () => {
  it("follow-bottom 下会继续允许尾部两行参与尺寸修正", () => {
    expect(shouldAdjustChatScrollPositionOnItemSizeChange(
      createVirtualItem({ index: 7, start: 820, end: 1080, size: 260 }),
      "follow-bottom",
      8,
      240,
    )).toBe(true);

    expect(shouldAdjustChatScrollPositionOnItemSizeChange(
      createVirtualItem({ index: 6, start: 620, end: 820, size: 200 }),
      "follow-bottom",
      8,
      240,
    )).toBe(true);

    expect(shouldAdjustChatScrollPositionOnItemSizeChange(
      createVirtualItem({ index: 5, start: 420, end: 620, size: 200 }),
      "follow-bottom",
      8,
      240,
    )).toBe(false);
  });

  it("detached-reading 下只允许稳定位于阅读锚点上方的行修正 scrollTop", () => {
    expect(shouldAdjustChatScrollPositionOnItemSizeChange(
      createVirtualItem({ index: 4, start: 40, end: 150, size: 110 }),
      "detached-reading",
      10,
      200,
      { detachedReadingAnchorRowIndex: 6 },
    )).toBe(true);
  });

  it("detached-reading 下锚点行本身不允许触发尺寸修正", () => {
    expect(shouldAdjustChatScrollPositionOnItemSizeChange(
      createVirtualItem({ index: 6, start: 160, end: 280, size: 120 }),
      "detached-reading",
      10,
      200,
      { detachedReadingAnchorRowIndex: 6 },
    )).toBe(false);
  });

  it("detached-reading 下贴着顶部安全带的上一行也不允许触发尺寸修正", () => {
    expect(shouldAdjustChatScrollPositionOnItemSizeChange(
      createVirtualItem({ index: 5, start: 90, end: 200 - CHAT_DETACHED_READING_TOP_GUARD_PX + 1, size: 85 }),
      "detached-reading",
      10,
      200,
      { detachedReadingAnchorRowIndex: 6 },
    )).toBe(false);
  });

  it("detached-reading 下尾部活跃段始终不允许触发尺寸修正", () => {
    expect(shouldAdjustChatScrollPositionOnItemSizeChange(
      createVirtualItem({ index: 8, start: 760, end: 920, size: 160 }),
      "detached-reading",
      10,
      200,
      { detachedReadingAnchorRowIndex: 9 },
    )).toBe(false);

    expect(shouldAdjustChatScrollPositionOnItemSizeChange(
      createVirtualItem({ index: 9, start: 920, end: 1080, size: 160 }),
      "detached-reading",
      10,
      200,
      { detachedReadingAnchorRowIndex: 9 },
    )).toBe(false);
  });
});
