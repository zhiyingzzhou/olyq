/**
 * 说明：`chatVirtualizerBottomReadSync` 主聊天底部已读同步模块。
 *
 * 职责：
 * - 把“真实几何到底后刷新 read marker”的闭环从虚拟化门面中拆出来；
 * - 统一管理测量后底部同步帧、用户接管后的过期同步取消，以及当前尾部已读标记写入。
 *
 * 边界：
 * - 本文件不计算 bottom banner 展示，也不直接发滚动命令；
 * - 它只消费滚动 owner 暴露的几何读取结果，并写回当前 topic 的 scroll session。
 */
import { useCallback, useEffect, useRef, type MutableRefObject } from "react";

import {
  createReadMarker,
  type ChatScrollSession,
} from "./chatScrollSession";
import type {
  ChatScrollMode,
  ChatScrollPositionState,
} from "./useChatAreaScrollOwner";

interface UseChatVirtualizerBottomReadSyncParams {
  readonly commitSession: (patch: Partial<ChatScrollSession>) => void;
  readonly lastMessageId: string | null;
  readonly lastVisibleOutputSignature: string;
  readonly messageCount: number;
  readonly scrollModeRef: MutableRefObject<ChatScrollMode>;
  readonly syncScrollPositionFromDom: () => ChatScrollPositionState | null;
}

/** 导出类型：底部已读同步帧的调度选项。 */
export interface ScheduleStrictBottomReadMarkerSyncOptions {
  /** 是否用当前几何 epoch 替换已经排队但可能读到旧布局的同步帧。 */
  readonly replacePending?: boolean;
}

/** 导出类型：主聊天底部已读同步 runtime。 */
export interface ChatVirtualizerBottomReadSyncRuntime {
  readonly cancelPendingBottomReadSync: () => void;
  readonly markRead: (
    nextMessageCount: number,
    nextLastMessageId: string | null,
    nextLastVisibleOutputSignature: string,
  ) => void;
  readonly scheduleStrictBottomReadMarkerSync: (options?: ScheduleStrictBottomReadMarkerSyncOptions) => void;
  readonly syncStrictBottomReadMarker: () => boolean;
}

/**
 * 导出 Hook：`useChatVirtualizerBottomReadSync`。
 *
 * @remarks
 * 所有“到底后已读”的刷新都必须先走 `syncScrollPositionFromDom()` 读取真实几何。
 * 用户已经通过滚轮、键盘、触摸或 transcript 交互接管阅读时，几何仍可以同步给 UI，
 * 但 read marker 不允许在 `detached-reading` owner 下刷新，避免流式测量把未读尾部清掉。
 *
 * @param params - 当前消息尾部、scroll session 写入能力和滚动 owner 几何读取能力。
 * @returns 可供虚拟化门面组合使用的底部已读同步 runtime。
 */
export function useChatVirtualizerBottomReadSync({
  commitSession,
  lastMessageId,
  lastVisibleOutputSignature,
  messageCount,
  scrollModeRef,
  syncScrollPositionFromDom,
}: UseChatVirtualizerBottomReadSyncParams): ChatVirtualizerBottomReadSyncRuntime {
  const bottomStateSyncFrameRef = useRef<number | null>(null);
  const bottomStateSyncTokenRef = useRef(0);

  const markRead = useCallback((
    nextMessageCount: number,
    nextLastMessageId: string | null,
    nextLastVisibleOutputSignature: string,
  ) => commitSession({
    readMarker: createReadMarker(nextMessageCount, nextLastMessageId, nextLastVisibleOutputSignature),
  }), [commitSession]);

  const syncStrictBottomReadMarker = useCallback(() => {
    const state = syncScrollPositionFromDom();
    if (!state?.strictBottom) return false;
    if (scrollModeRef.current === "detached-reading") return false;
    markRead(messageCount, lastMessageId, lastVisibleOutputSignature);
    return true;
  }, [lastMessageId, lastVisibleOutputSignature, markRead, messageCount, scrollModeRef, syncScrollPositionFromDom]);

  const cancelPendingBottomReadSync = useCallback(() => {
    bottomStateSyncTokenRef.current += 1;
    if (bottomStateSyncFrameRef.current == null) return;
    cancelAnimationFrame(bottomStateSyncFrameRef.current);
    bottomStateSyncFrameRef.current = null;
  }, []);

  const scheduleStrictBottomReadMarkerSync = useCallback((options: ScheduleStrictBottomReadMarkerSyncOptions = {}) => {
    if (options.replacePending && bottomStateSyncFrameRef.current != null) {
      cancelAnimationFrame(bottomStateSyncFrameRef.current);
      bottomStateSyncFrameRef.current = null;
    }
    if (bottomStateSyncFrameRef.current != null) return;

    const token = bottomStateSyncTokenRef.current;
    bottomStateSyncFrameRef.current = -1;
    const frameId = requestAnimationFrame(() => {
      if (bottomStateSyncTokenRef.current !== token) return;
      bottomStateSyncFrameRef.current = null;
      syncStrictBottomReadMarker();
    });

    /**
     * 测试环境可能把 rAF 同步执行：callback 会先把 ref 置空，随后 `requestAnimationFrame`
     * 才返回 id。这里用 `-1` sentinel 避免 ref 被同步 rAF 的返回值重新污染成“仍有待执行帧”。
     */
    if (bottomStateSyncFrameRef.current === -1) {
      bottomStateSyncFrameRef.current = frameId;
    }
  }, [syncStrictBottomReadMarker]);

  useEffect(() => () => {
    cancelPendingBottomReadSync();
  }, [cancelPendingBottomReadSync]);

  return {
    cancelPendingBottomReadSync,
    markRead,
    scheduleStrictBottomReadMarkerSync,
    syncStrictBottomReadMarker,
  };
}
