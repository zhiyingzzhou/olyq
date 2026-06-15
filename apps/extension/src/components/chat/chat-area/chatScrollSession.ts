/**
 * 说明：`chatScrollSession` 主聊天滚动 session 模块。
 *
 * 职责：
 * - 定义主聊天滚动 session、viewport snapshot、read marker 的唯一类型契约；
 * - 提供 row key、session 比较、默认值与 per-topic session 状态管理；
 * - 避免 `useChatAreaVirtualizer.ts` 自身再同时承担类型、纯函数和 hook 编排三层职责。
 *
 * 边界：
 * - 本文件不直接操作 TanStack Virtual 实例；
 * - 不负责 DOM 滚动写入、ResizeObserver 或命令调度。
 */
import { useCallback, useMemo, useRef, useState } from "react";

import type { ChatRow } from "@/lib/chat/chat-utils";
import type { ChatFollowMode } from "./useChatAreaScrollOwner";

/** 聊天列表允许的虚拟滚动对齐方式。 */
export type ChatVirtualScrollAlign = "auto" | "start" | "center" | "end";

/** 导出类型：当前 topic 已读标记。 */
export interface ChatReadMarker {
  readonly lastMessageId: string | null;
  readonly lastVisibleOutputSignature: string;
  readonly messageCount: number;
}

/** 导出类型：当前 viewport 在 topic 内的恢复快照。 */
export type ChatViewportSnapshot =
  | { readonly kind: "top" }
  | { readonly kind: "bottom" }
  | {
    readonly askId: string | null;
    readonly kind: "row-anchor";
    readonly messageId: string | null;
    readonly offset: number;
    readonly rowIndex: number | null;
    readonly rowKey: string;
  };

/** 导出类型：单个 topic 的滚动 session。 */
export interface ChatScrollSession {
  readonly followMode: ChatFollowMode;
  readonly readMarker: ChatReadMarker;
  readonly viewportSnapshot: ChatViewportSnapshot;
}

/** 搜索/导航的顶部滚动留白。 */
export const SEARCH_SCROLL_TOP_PADDING = 72;
/** 搜索/导航的底部滚动留白。 */
export const SEARCH_SCROLL_BOTTOM_PADDING = 120;
/** 主聊天虚拟内容的上下内边距。 */
export const CHAT_SCROLL_CONTENT_PADDING = 16;
/** 顶部语义阈值。 */
export const CHAT_TOP_THRESHOLD = 8;

/**
 * 生成主聊天行在虚拟列表里的稳定 key。
 *
 * @param row - 当前行。
 * @param index - 行索引。
 * @param topicId - 当前 topic。
 * @returns TanStack Virtual 和 viewport snapshot 共用的稳定 key。
 */
export function getChatRowKey(row: ChatRow | undefined, index: number, topicId: string | null) {
  if (!row) return `row-${index}`;
  if (row.kind === "message") return row.message.id;
  if (row.kind === "divider") return row.message.id;
  if (row.kind === "group") return `group-${row.askId}`;
  if (row.kind === "loading") return `loading-${topicId ?? "no-topic"}`;
  return `row-${index}`;
}

/**
 * 解析某个虚拟行作为 viewport anchor 时应记录的元数据。
 *
 * @param row - 当前行。
 * @param rowIndex - 行索引。
 * @param topicId - 当前 topic。
 * @returns 用于恢复滚动和导航的稳定锚点信息。
 */
export function resolveChatViewportAnchor(row: ChatRow | undefined, rowIndex: number, topicId: string | null) {
  if (!row) {
    return {
      askId: null,
      messageId: null,
      rowIndex,
      rowKey: getChatRowKey(undefined, rowIndex, topicId),
    };
  }

  if (row.kind === "group") {
    return {
      askId: row.askId,
      messageId: row.user.id,
      rowIndex,
      rowKey: getChatRowKey(row, rowIndex, topicId),
    };
  }

  if (row.kind === "loading") {
    return {
      askId: null,
      messageId: null,
      rowIndex,
      rowKey: getChatRowKey(row, rowIndex, topicId),
    };
  }

  return {
    askId: row.kind === "message" ? (row.message.askId ?? (row.message.role === "user" ? row.message.id : null)) : null,
    messageId: row.message.id,
    rowIndex,
    rowKey: getChatRowKey(row, rowIndex, topicId),
  };
}

/**
 * 构造新的已读标记。
 *
 * @param messageCount - 当前消息数。
 * @param lastMessageId - 当前用户已经读到的最后一个消息节点 ID。
 * @param lastVisibleOutputSignature - 当前尾部 assistant 正文/附件可见输出签名。
 * @returns 标准化后的已读标记。
 */
export function createReadMarker(
  messageCount: number,
  lastMessageId: string | null,
  lastVisibleOutputSignature: string,
): ChatReadMarker {
  return { lastMessageId, lastVisibleOutputSignature, messageCount };
}

/**
 * 构造新的 topic 滚动 session。
 *
 * @param messageCount - 当前消息数。
 * @param lastMessageId - 当前尾部消息 ID。
 * @param lastVisibleOutputSignature - 当前尾部 assistant 正文/附件可见输出签名。
 * @returns 默认以贴底为真相的新 session。
 */
export function createDefaultSession(
  messageCount: number,
  lastMessageId: string | null,
  lastVisibleOutputSignature: string,
): ChatScrollSession {
  return {
    followMode: "follow-bottom",
    readMarker: createReadMarker(messageCount, lastMessageId, lastVisibleOutputSignature),
    viewportSnapshot: { kind: "bottom" },
  };
}

/**
 * 比较两个 viewport snapshot 是否等价。
 *
 * @param left - 左值。
 * @param right - 右值。
 * @returns 是否可以视为同一快照。
 */
export function isSameViewportSnapshot(left: ChatViewportSnapshot, right: ChatViewportSnapshot) {
  if (left.kind !== right.kind) return false;
  if (left.kind !== "row-anchor" || right.kind !== "row-anchor") return true;
  return (
    left.askId === right.askId
    && left.messageId === right.messageId
    && left.offset === right.offset
    && left.rowIndex === right.rowIndex
    && left.rowKey === right.rowKey
  );
}

/**
 * 比较两个已读标记是否等价。
 *
 * @param left - 左值。
 * @param right - 右值。
 * @returns 是否为同一个已读状态。
 */
export function isSameReadMarker(left: ChatReadMarker, right: ChatReadMarker) {
  return (
    left.lastMessageId === right.lastMessageId
    && left.lastVisibleOutputSignature === right.lastVisibleOutputSignature
    && left.messageCount === right.messageCount
  );
}

interface UseChatScrollSessionStateParams {
  readonly lastMessageId: string | null;
  readonly lastVisibleOutputSignature: string;
  readonly messageCount: number;
  readonly messageIdToRowIndex: Map<string, number>;
  readonly rows: ChatRow[];
  readonly topicId: string | null;
}

/**
 * 导出 Hook：`useChatScrollSessionState`。
 *
 * @remarks
 * 承担主聊天滚动 session 的 per-topic 缓存、当前 session 状态和 snapshot 解析。
 */
export function useChatScrollSessionState({
  lastMessageId,
  lastVisibleOutputSignature,
  messageCount,
  messageIdToRowIndex,
  rows,
  topicId,
}: UseChatScrollSessionStateParams) {
  const sessionMapRef = useRef<Map<string, ChatScrollSession>>(new Map());
  const currentSessionRef = useRef<ChatScrollSession>(createDefaultSession(
    messageCount,
    lastMessageId,
    lastVisibleOutputSignature,
  ));
  const currentFollowModeRef = useRef<ChatFollowMode>("follow-bottom");
  const [viewportSnapshotState, setViewportSnapshotState] = useState<ChatViewportSnapshot>({ kind: "bottom" });
  const [readMarker, setReadMarkerState] = useState<ChatReadMarker>(() => createReadMarker(
    messageCount,
    lastMessageId,
    lastVisibleOutputSignature,
  ));

  const rowKeyToIndex = useMemo(() => {
    const map = new Map<string, number>();
    for (let index = 0; index < rows.length; index += 1) {
      map.set(getChatRowKey(rows[index], index, topicId), index);
    }
    return map;
  }, [rows, topicId]);

  const resolveSnapshotRowIndex = useCallback((snapshot: ChatViewportSnapshot) => {
    if (snapshot.kind !== "row-anchor") return null;
    const byKey = rowKeyToIndex.get(snapshot.rowKey);
    if (typeof byKey === "number") return byKey;
    if (snapshot.messageId) {
      const byMessageId = messageIdToRowIndex.get(snapshot.messageId);
      if (typeof byMessageId === "number") return byMessageId;
    }
    if (typeof snapshot.rowIndex === "number" && snapshot.rowIndex >= 0 && snapshot.rowIndex < rows.length) {
      return snapshot.rowIndex;
    }
    return null;
  }, [messageIdToRowIndex, rowKeyToIndex, rows.length]);

  const viewportSnapshot = useMemo<ChatViewportSnapshot>(() => {
    if (viewportSnapshotState.kind !== "row-anchor") return viewportSnapshotState;
    return {
      ...viewportSnapshotState,
      rowIndex: resolveSnapshotRowIndex(viewportSnapshotState),
    };
  }, [resolveSnapshotRowIndex, viewportSnapshotState]);

  const commitSession = useCallback((patch: Partial<ChatScrollSession>) => {
    const base = topicId
      ? (sessionMapRef.current.get(topicId) ?? currentSessionRef.current)
      : currentSessionRef.current;
    const nextSession: ChatScrollSession = {
      followMode: patch.followMode ?? base.followMode,
      readMarker: patch.readMarker ?? base.readMarker,
      viewportSnapshot: patch.viewportSnapshot ?? base.viewportSnapshot,
    };

    currentSessionRef.current = nextSession;
    currentFollowModeRef.current = nextSession.followMode;
    if (topicId) sessionMapRef.current.set(topicId, nextSession);

    setViewportSnapshotState((current) => (
      isSameViewportSnapshot(current, nextSession.viewportSnapshot) ? current : nextSession.viewportSnapshot
    ));
    setReadMarkerState((current) => (
      isSameReadMarker(current, nextSession.readMarker) ? current : nextSession.readMarker
    ));
  }, [topicId]);

  const ensureCurrentSession = useCallback(() => {
    if (!topicId) {
      const fallback = createDefaultSession(messageCount, lastMessageId, lastVisibleOutputSignature);
      currentSessionRef.current = fallback;
      currentFollowModeRef.current = fallback.followMode;
      return fallback;
    }

    const existing = sessionMapRef.current.get(topicId);
    if (!existing) {
      const created = createDefaultSession(messageCount, lastMessageId, lastVisibleOutputSignature);
      sessionMapRef.current.set(topicId, created);
      currentSessionRef.current = created;
      currentFollowModeRef.current = created.followMode;
      return created;
    }

    if (existing.readMarker.messageCount > messageCount) {
      const normalized = {
        ...existing,
        readMarker: createReadMarker(messageCount, lastMessageId, lastVisibleOutputSignature),
      } satisfies ChatScrollSession;
      sessionMapRef.current.set(topicId, normalized);
      currentSessionRef.current = normalized;
      currentFollowModeRef.current = normalized.followMode;
      return normalized;
    }

    currentSessionRef.current = existing;
    currentFollowModeRef.current = existing.followMode;
    return existing;
  }, [lastMessageId, lastVisibleOutputSignature, messageCount, topicId]);

  const handleFollowModeChange = useCallback((next: ChatFollowMode) => {
    if (next === "follow-bottom") {
      commitSession({
        followMode: next,
        viewportSnapshot: { kind: "bottom" },
      });
      return;
    }

    commitSession({ followMode: next });
  }, [commitSession]);

  return {
    commitSession,
    currentFollowModeRef,
    currentSessionRef,
    ensureCurrentSession,
    handleFollowModeChange,
    readMarker,
    resolveSnapshotRowIndex,
    rowKeyToIndex,
    sessionMapRef,
    setReadMarkerState,
    setViewportSnapshotState,
    viewportSnapshot,
    viewportSnapshotState,
  };
}
