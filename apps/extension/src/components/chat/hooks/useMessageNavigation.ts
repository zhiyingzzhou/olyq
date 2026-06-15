/**
 * 说明：`useMessageNavigation` 组件模块。
 *
 * 职责：
 * - 承载 `useMessageNavigation` 相关的当前文件实现与模块边界；
 * - 对外暴露 `UseMessageNavigationParams`、`UseMessageNavigationResult`、`useMessageNavigation` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from "react";
import type { TopicConversation, Message } from "@/types/chat";
import { markdownToPlainText } from "@/lib/chat/chat-utils";
import type { ChatRow } from "@/lib/chat/chat-utils";
import type { ChatViewportSnapshot } from "@/components/chat/chat-area/useChatAreaVirtualizer";

/**
 * 消息导航 hook 入参。
 */
export interface UseMessageNavigationParams {
  /**
   * 当前话题。
   */
  topic: TopicConversation | null;
  /**
   * 话题中的全部消息。
   */
  messagesAll: Message[];
  /**
   * 当前虚拟列表的行数据。
   */
  rows: ChatRow[];
  /**
   * 当前 viewport 的统一快照。
   */
  viewportSnapshot: ChatViewportSnapshot;
  /**
   * 当前是否处于严格底部。
   */
  isAtBottom: boolean;
  /**
   * 消息导航模式配置。
   */
  messageNavigation: string;
  /**
   * 当前是否处于多选模式。
   */
  multiSelectMode: boolean;
  /**
   * 显式锚定到指定消息的回调。
   */
  jumpToMessageAnchor: (messageId: string) => boolean;
  /**
   * 滚动到话题顶部的回调。
   */
  scrollToTop: () => void;
  /**
   * 滚动到底部的回调。
   */
  scrollToBottom: () => void;
}

/**
 * 用户消息导航锚点。
 */
type MessageNavigationAnchor = {
  /**
   * 作为锚点的消息 ID。
   */
  messageId: string;
  /**
   * 消息创建时间戳。
   */
  createdAt: number;
  /**
   * 由正文生成的预览文本。
   */
  preview: string;
};

/**
 * 用户消息在虚拟列表中的位置。
 */
type MessageNavigationRow = {
  /**
   * 行索引。
   */
  rowIdx: number;
  /**
   * 对应的消息 ID。
   */
  messageId: string;
};

/**
 * 对话导航落位后的瞬时聚焦闪烁请求。
 */
export interface MessageNavigationFlashRequest {
  /**
   * 需要触发瞬时描边的消息 ID。
   */
  messageId: string;
  /**
   * 单调递增 token；即使同一消息连续命中，也要能稳定重播动画。
   */
  token: number;
}

/**
 * 消息导航 hook 返回值。
 */
export interface UseMessageNavigationResult {
  /**
   * 右侧消息导航面板是否展开。
   */
  navPanelOpen: boolean;
  /**
   * 更新消息导航面板展开状态。
   */
  setNavPanelOpen: (value: boolean) => void;
  /**
   * 流程导航面板是否打开。
   */
  flowOpen: boolean;
  /**
   * 更新流程导航面板开关。
   */
  setFlowOpen: (value: boolean) => void;
  /**
   * 当前激活的用户消息锚点 ID。
   */
  navActiveAskId: string | null;
  /**
   * 导航落位后的瞬时 flash 请求。
   */
  navFlashRequest: MessageNavigationFlashRequest | null;
  /**
   * 全部用户消息导航锚点。
   */
  navAnchors: MessageNavigationAnchor[];
  /**
   * 由消息 ID 到锚点索引的映射。
   */
  navAnchorIndexById: Map<string, number>;
  /**
   * 虚拟列表中所有用户消息所在行索引。
   */
  navUserRows: MessageNavigationRow[];
  /**
   * 当前激活锚点索引。
   */
  navActiveIndex: number;
  /**
   * 跳转到话题顶部。
   */
  navGoTop: () => void;
  /**
   * 跳转到底部。
   */
  navGoBottom: () => void;
  /**
   * 跳到上一个用户消息锚点。
   */
  navGoPrev: () => void;
  /**
   * 跳到下一个用户消息锚点。
   */
  navGoNext: () => void;
  /**
   * 跳到指定用户消息锚点。
   */
  navJumpToAnchor: (messageId: string) => void;
}

/**
 * 解析当前 viewport 应对应到哪一个用户锚点。
 *
 * @param anchors - 全部用户消息锚点。
 * @param rows - 用户消息在虚拟列表中的位置。
 * @param viewportSnapshot - 当前 viewport 快照。
 * @param isAtBottom - 当前是否严格贴底。
 * @returns 当前激活的锚点消息 ID。
 */
function resolveActiveAnchorId(
  anchors: MessageNavigationAnchor[],
  rows: MessageNavigationRow[],
  viewportSnapshot: ChatViewportSnapshot,
  isAtBottom: boolean,
) {
  if (anchors.length === 0) return null;
  if (isAtBottom || viewportSnapshot.kind === "bottom") return anchors[anchors.length - 1]?.messageId ?? null;
  if (viewportSnapshot.kind === "top") return anchors[0]?.messageId ?? null;

  const snapshotRowIndex = viewportSnapshot.rowIndex;
  if (typeof snapshotRowIndex !== "number") return anchors[0]?.messageId ?? null;

  let lo = 0;
  let hi = rows.length - 1;
  let best = 0;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const candidate = rows[mid];
    if (!candidate) break;
    if (candidate.rowIdx <= snapshotRowIndex) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return rows[best]?.messageId ?? anchors[0]?.messageId ?? null;
}

/**
 * 消息导航控制器。
 *
 * 负责维护用户消息锚点，以及侧边导航按钮/流程面板的跳转逻辑。
 *
 * @param params - 话题、虚拟列表数据与导航配置。
 * @returns 导航状态与跳转动作集合。
 */
export function useMessageNavigation({
  topic,
  messagesAll,
  rows,
  viewportSnapshot,
  isAtBottom,
  messageNavigation,
  multiSelectMode,
  jumpToMessageAnchor,
  scrollToTop,
  scrollToBottom,
}: UseMessageNavigationParams) {
  const [navPanelOpen, setNavPanelOpen] = useState(false);
  const [flowOpen, setFlowOpen] = useState(false);
  const navFlashTokenRef = useRef(0);
  const [pendingNavState, setPendingNavState] = useState<null | {
    anchorId: string;
    allowedSourceAnchorIds: string[];
  }>(null);
  const [navFlashRequest, setNavFlashRequest] = useState<MessageNavigationFlashRequest | null>(null);

  /**
   * 为每条用户消息生成导航锚点和预览文本。
   */
  const navAnchors = useMemo(() => {
    const out: MessageNavigationAnchor[] = [];
    for (const message of messagesAll) {
      if (message.role !== "user") continue;
      const preview = markdownToPlainText(String(message.content || "")).trim().slice(0, 120);
      out.push({ createdAt: message.createdAt, messageId: message.id, preview });
    }
    return out;
  }, [messagesAll]);

  /**
   * 由消息 ID 快速反查锚点索引。
   */
  const navAnchorIndexById = useMemo(() => {
    const map = new Map<string, number>();
    for (let index = 0; index < navAnchors.length; index += 1) {
      map.set(navAnchors[index]!.messageId, index);
    }
    return map;
  }, [navAnchors]);

  /**
   * 虚拟列表中所有用户消息所在的行索引。
   */
  const navUserRows = useMemo(() => {
    const out: MessageNavigationRow[] = [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (row?.kind === "message" && row.message.role === "user") {
        out.push({ messageId: row.message.id, rowIdx: index });
      }
    }
    return out;
  }, [rows]);

  const resolvedActiveAskId = useMemo(() => (
    resolveActiveAnchorId(navAnchors, navUserRows, viewportSnapshot, isAtBottom)
  ), [isAtBottom, navAnchors, navUserRows, viewportSnapshot]);
  const navActiveAskId = pendingNavState?.anchorId ?? resolvedActiveAskId;

  useEffect(() => {
    setPendingNavState(null);
    setNavFlashRequest(null);
    setNavPanelOpen(false);
  }, [topic?.id]);

  useEffect(() => {
    if (messageNavigation === "buttons" && !multiSelectMode && navAnchors.length > 0) return;
    setNavPanelOpen(false);
  }, [messageNavigation, multiSelectMode, navAnchors.length]);

  useEffect(() => {
    const pending = pendingNavState;
    if (!pending) return;
    if (!navAnchorIndexById.has(pending.anchorId)) {
      setPendingNavState(null);
      return;
    }
    if (resolvedActiveAskId === pending.anchorId) {
      navFlashTokenRef.current += 1;
      setNavFlashRequest({
        messageId: pending.anchorId,
        token: navFlashTokenRef.current,
      });
      setPendingNavState(null);
      return;
    }
    if (resolvedActiveAskId != null && !pending.allowedSourceAnchorIds.includes(resolvedActiveAskId)) {
      setPendingNavState(null);
    }
  }, [navAnchorIndexById, pendingNavState, resolvedActiveAskId]);

  /**
   * 当前激活的导航锚点索引。
   */
  const navActiveIndex = useMemo(() => {
    if (navAnchors.length === 0) return -1;
    if (!navActiveAskId) return navAnchors.length - 1;
    const idx = navAnchorIndexById.get(navActiveAskId);
    return typeof idx === "number" ? idx : navAnchors.length - 1;
  }, [navActiveAskId, navAnchorIndexById, navAnchors.length]);

  /**
   * 跳转到指定用户消息锚点。
   */
  const navJumpToAnchor = useCallback((messageId: string) => {
    if (!topic) return;
    const normalizedMessageId = String(messageId || "").trim();
    if (!normalizedMessageId) return;
    if (normalizedMessageId === navActiveAskId) return;
    const didScheduleJump = jumpToMessageAnchor(normalizedMessageId);
    if (!didScheduleJump) return;
    const allowedSourceAnchorIds = Array.from(new Set([
      resolvedActiveAskId,
      navActiveAskId,
    ].filter((value): value is string => Boolean(value))));
    setPendingNavState({
      anchorId: normalizedMessageId,
      allowedSourceAnchorIds,
    });
  }, [jumpToMessageAnchor, navActiveAskId, resolvedActiveAskId, topic]);

  /**
   * 跳转到话题顶部。
   */
  const navGoTop = useCallback(() => {
    if (!topic || messagesAll.length === 0) return;
    setPendingNavState(null);
    scrollToTop();
  }, [messagesAll.length, scrollToTop, topic]);

  /**
   * 跳转到底部。
   */
  const navGoBottom = useCallback(() => {
    setPendingNavState(null);
    scrollToBottom();
  }, [scrollToBottom]);

  /**
   * 跳到上一个用户消息锚点。
   */
  const navGoPrev = useCallback(() => {
    if (!topic || navAnchors.length === 0) return;
    const idx = Math.max(0, navActiveIndex - 1);
    const target = navAnchors[idx];
    if (target) navJumpToAnchor(target.messageId);
  }, [navActiveIndex, navAnchors, navJumpToAnchor, topic]);

  /**
   * 跳到下一个用户消息锚点。
   */
  const navGoNext = useCallback(() => {
    if (!topic || navAnchors.length === 0) return;
    const idx = Math.min(navAnchors.length - 1, navActiveIndex + 1);
    const target = navAnchors[idx];
    if (target) navJumpToAnchor(target.messageId);
  }, [navActiveIndex, navAnchors, navJumpToAnchor, topic]);

  const result = {
    flowOpen,
    navActiveAskId,
    navActiveIndex,
    navAnchorIndexById,
    navAnchors,
    navPanelOpen,
    navFlashRequest,
    navGoBottom,
    navGoNext,
    navGoPrev,
    navGoTop,
    navJumpToAnchor,
    navUserRows,
    setFlowOpen,
    setNavPanelOpen,
  } satisfies UseMessageNavigationResult;

  return result;
}
