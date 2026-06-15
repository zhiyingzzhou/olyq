/**
 * 说明：`chatVirtualizerTailSlack` 主聊天尾部 slack 模块。
 *
 * 职责：
 * - 承担显式 ask/message 锚点导航所需的尾部可达空间管理；
 * - 避免 `useChatAreaVirtualizer.ts` 同时维护 viewport 高度、tail slack 状态和滚动命令装配。
 *
 * 边界：
 * - 本文件只处理尾部 slack 高度；
 * - 不直接执行滚动命令，也不维护阅读快照。
 */
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";

import { SEARCH_SCROLL_BOTTOM_PADDING, SEARCH_SCROLL_TOP_PADDING } from "./chatScrollSession";

/**
 * 导出类型：主聊天 ask 锚点跳转使用的尾部 slack runtime。
 *
 * @remarks
 * near-tail ask 若没有额外 slack，会在接近列表末尾时被浏览器过早夹住，无法重新锚到阅读线。
 */
export interface ChatAnchorTailSlackRuntime {
  readonly anchorTailSlackHeight: number;
  readonly anchorTailSlackHeightRef: MutableRefObject<number>;
  readonly disableAnchorTailSlack: () => void;
  readonly enableAnchorTailSlack: () => void;
}

/**
 * 导出 Hook：`useChatAnchorTailSlack`。
 *
 * @remarks
 * 统一管理 ask/message 锚点跳转需要的尾部 slack，不让“假底部”语义扩散到外层业务。
 */
export function useChatAnchorTailSlack(messageViewportHeight: number | null): ChatAnchorTailSlackRuntime {
  const [anchorTailSlackHeight, setAnchorTailSlackHeight] = useState(0);
  const anchorTailSlackHeightRef = useRef(0);
  const anchorTailSlackEnabledRef = useRef(false);
  anchorTailSlackHeightRef.current = anchorTailSlackHeight;

  /**
   * 计算 ask 锚点落位所需的尾部 slack 高度。
   *
   * @remarks
   * 只要当前 viewport 足够高，就留出“可把目标 ask 对齐到阅读线”的空间。
   */
  const resolveAnchorTailSlackHeight = useCallback(() => {
    if (messageViewportHeight == null || messageViewportHeight <= 0) return 0;
    return Math.max(0, messageViewportHeight - SEARCH_SCROLL_TOP_PADDING - SEARCH_SCROLL_BOTTOM_PADDING);
  }, [messageViewportHeight]);

  /**
   * 打开 ask 锚点跳转使用的尾部 slack。
   *
   * @remarks
   * 只在显式 `message-anchor` 导航期间启用，避免底部跟随语义被额外空间污染。
   */
  const enableAnchorTailSlack = useCallback(() => {
    anchorTailSlackEnabledRef.current = true;
    const nextSlack = resolveAnchorTailSlackHeight();
    setAnchorTailSlackHeight((current) => (current === nextSlack ? current : nextSlack));
  }, [resolveAnchorTailSlackHeight]);

  /**
   * 关闭 ask 锚点跳转使用的尾部 slack。
   *
   * @remarks
   * 一旦重新回到底部跟随或真实 strict bottom，就立即回收这段额外空间。
   */
  const disableAnchorTailSlack = useCallback(() => {
    anchorTailSlackEnabledRef.current = false;
    setAnchorTailSlackHeight((current) => (current === 0 ? current : 0));
  }, []);

  useEffect(() => {
    if (!anchorTailSlackEnabledRef.current) return;
    const nextSlack = resolveAnchorTailSlackHeight();
    setAnchorTailSlackHeight((current) => (current === nextSlack ? current : nextSlack));
  }, [resolveAnchorTailSlackHeight]);

  return {
    anchorTailSlackHeight,
    anchorTailSlackHeightRef,
    disableAnchorTailSlack,
    enableAnchorTailSlack,
  };
}
