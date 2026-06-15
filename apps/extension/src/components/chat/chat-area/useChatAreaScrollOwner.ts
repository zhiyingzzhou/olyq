/**
 * 说明：`useChatAreaScrollOwner` 组件模块。
 *
 * 职责：
 * - 把主聊天滚动状态机、命令调度与用户意图识别从虚拟化装配层里拆出来；
 * - 保持主聊天滚动 owner 仍然只有一套实现，但避免 `useChatAreaVirtualizer.ts` 继续膨胀成新的热点文件。
 *
 * 边界：
 * - 本文件只处理滚动 owner，不关心虚拟行测量与 TanStack Virtual 实例本身；
 * - 不触碰消息数据、搜索结果或导航业务态。
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/** 导出类型：主聊天当前是否处于贴底跟随。 */
export type ChatFollowMode = "follow-bottom" | "detached-reading";
/** 导出类型：主聊天程序化滚动命令类型。 */
export type ChatProgrammaticCommandType = "top" | "bottom" | "message-anchor" | "row-snapshot" | "search-range";
/** 导出类型：主聊天程序化滚动命令的结算目标。 */
export type ChatProgrammaticSettleTarget = ChatFollowMode;

/** 导出类型：当前活跃的程序化滚动命令会话。 */
export interface ChatProgrammaticCommandSession {
  readonly anchorMessageId: string | null;
  readonly attempt: number;
  readonly dataRevision: number | null;
  readonly minimumDataRevision: number | null;
  readonly readyToSettle: boolean;
  readonly settleTarget: ChatProgrammaticSettleTarget;
  readonly token: number;
  readonly type: ChatProgrammaticCommandType;
}

/** 导出类型：已经完成结算的程序化滚动命令。 */
export interface ChatProgrammaticCommandOutcome {
  readonly anchorMessageId: string | null;
  readonly atTop: boolean;
  readonly nearBottom: boolean;
  readonly settleTarget: ChatProgrammaticSettleTarget;
  readonly strictBottom: boolean;
  readonly token: number;
  readonly type: ChatProgrammaticCommandType;
}

/** 导出类型：主聊天滚动 owner 的实时模式。 */
export type ChatScrollMode = "startup-restore" | ChatFollowMode | "programmatic";

/** 导出类型：聊天 transcript 内部交互提交给滚动 owner 的选项。 */
export interface ChatTranscriptInteractionOptions {
  /** 是否把本次交互强制视为用户阅读操作，即使几何位置仍处在严格底部。 */
  readonly forceDetached?: boolean;
}

/** 导出类型：主聊天滚动容器当前几何位置状态。 */
export interface ChatScrollPositionState {
  readonly atTop: boolean;
  readonly currentTop: number;
  readonly distance: number;
  readonly nearBottom: boolean;
  readonly strictBottom: boolean;
}

/** 导出类型：读取主聊天滚动几何时的补充参数。 */
export interface ReadChatScrollPositionStateOptions {
  /** 需要从 DOM `scrollHeight` 中扣除的尾部虚拟 slack 高度。 */
  readonly bottomSlack?: number;
}

/** 导出类型：从 DOM 同步滚动几何时是否允许显式接回贴底 owner。 */
export interface SyncChatScrollPositionOptions {
  /** 只有显式 bottom 语义才允许把当前 owner 重新提交为 `follow-bottom`。 */
  readonly allowFollowBottomCommit?: boolean;
}

/** 主聊天 near-bottom 几何阈值，供底部按钮与宽松贴底态共享。 */
export const CHAT_NEAR_BOTTOM_THRESHOLD = 120;
/** 主聊天 strict-bottom 几何阈值，只有进入该范围才允许刷新已读标记。 */
export const CHAT_STRICT_BOTTOM_THRESHOLD = 12;
/** 主聊天顶部几何阈值，避免小数 scrollTop 造成顶部态抖动。 */
export const CHAT_TOP_THRESHOLD = 8;

/**
 * 读取主聊天滚动容器的统一几何状态。
 *
 * @remarks
 * CSSOM 里 `scrollTop` 可以是小数，而 `scrollHeight / clientHeight` 通常是整数；
 * 底部判断必须使用阈值而不是精确相等。所有主聊天“是否到底”的判断都应走这里，
 * 避免 banner、命令结算、startup restore 和 viewport snapshot 各自维护第二套几何语义。
 *
 * @param element - 主聊天滚动容器。
 * @param options - 读取时需要扣除的虚拟尾部 slack。
 * @returns 当前滚动容器的标准化几何状态。
 */
export function readChatScrollPositionState(
  element: HTMLDivElement,
  options: ReadChatScrollPositionStateOptions = {},
): ChatScrollPositionState {
  const currentTop = element.scrollTop;
  const bottomSlack = Math.max(0, options.bottomSlack ?? 0);
  const effectiveScrollHeight = Math.max(element.clientHeight, element.scrollHeight - bottomSlack);
  const distance = Math.max(0, effectiveScrollHeight - currentTop - element.clientHeight);
  return {
    atTop: currentTop <= CHAT_TOP_THRESHOLD,
    currentTop,
    distance,
    nearBottom: distance < CHAT_NEAR_BOTTOM_THRESHOLD,
    strictBottom: distance < CHAT_STRICT_BOTTOM_THRESHOLD,
  };
}

interface UseChatAreaScrollOwnerParams {
  readonly canSettleProgrammaticCommand?: (session: ChatProgrammaticCommandSession) => boolean;
  readonly initialFollowMode: ChatFollowMode;
  readonly onFollowModeChange?: (next: ChatFollowMode) => void;
  readonly onProgrammaticCommandPending?: (session: ChatProgrammaticCommandSession) => void;
  readonly onProgrammaticCommandSettled?: (outcome: ChatProgrammaticCommandOutcome) => void;
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  readonly topicId: string | null;
}

/**
 * 导出 Hook：`useChatAreaScrollOwner`。
 *
 * @remarks
 * 管理主聊天“谁拥有滚动控制权”的唯一状态机。
 */
export function useChatAreaScrollOwner({
  canSettleProgrammaticCommand,
  initialFollowMode,
  onFollowModeChange,
  onProgrammaticCommandPending,
  onProgrammaticCommandSettled,
  scrollRef,
  topicId,
}: UseChatAreaScrollOwnerParams) {
  const [isAtTop, setIsAtTop] = useState(initialFollowMode !== "follow-bottom");
  const [isAtBottom, setIsAtBottom] = useState(initialFollowMode === "follow-bottom");
  const [isStrictBottom, setIsStrictBottom] = useState(initialFollowMode === "follow-bottom");
  const initialScrollMode = topicId ? "startup-restore" : initialFollowMode;
  const [scrollModeSnapshot, setScrollModeSnapshot] = useState<ChatScrollMode>(initialScrollMode);
  const scrollModeRef = useRef<ChatScrollMode>(initialScrollMode);
  const initialFollowModeRef = useRef(initialFollowMode);
  const lastScrollTopRef = useRef(0);
  const lastTouchClientYRef = useRef<number | null>(null);
  const pendingStartupRestoreTopicIdRef = useRef<string | null>(topicId ?? null);
  const startupRestoreTokenRef = useRef(0);
  const pendingCommandFrameRef = useRef<number | null>(null);
  const pendingModeSettleFrameRef = useRef<number | null>(null);
  const scheduledScrollCommandTokenRef = useRef(0);
  const activeProgrammaticCommandRef = useRef<ChatProgrammaticCommandSession | null>(null);
  const programmaticCommandTokenRef = useRef(0);
  const pendingUpwardScrollIntentRef = useRef(false);
  const scrollRefRef = useRef(scrollRef);
  initialFollowModeRef.current = initialFollowMode;
  scrollRefRef.current = scrollRef;

  const getScrollElement = useCallback(() => scrollRefRef.current.current, []);

  const syncPositionState = useCallback((nextAtTop: boolean, nextAtBottom: boolean, nextStrictBottom: boolean) => {
    setIsAtTop((current) => (current === nextAtTop ? current : nextAtTop));
    setIsAtBottom((current) => (current === nextAtBottom ? current : nextAtBottom));
    setIsStrictBottom((current) => (current === nextStrictBottom ? current : nextStrictBottom));
  }, []);

  const emitFollowModeChange = useCallback((next: ChatFollowMode) => {
    onFollowModeChange?.(next);
  }, [onFollowModeChange]);

  const setScrollMode = useCallback((next: ChatScrollMode) => {
    scrollModeRef.current = next;
    setScrollModeSnapshot((current) => (current === next ? current : next));
  }, []);

  const cancelPendingScrollCommand = useCallback(() => {
    scheduledScrollCommandTokenRef.current += 1;
    if (pendingCommandFrameRef.current != null) {
      cancelAnimationFrame(pendingCommandFrameRef.current);
      pendingCommandFrameRef.current = null;
    }
  }, []);

  const cancelPendingModeSettle = useCallback(() => {
    if (pendingModeSettleFrameRef.current != null) {
      cancelAnimationFrame(pendingModeSettleFrameRef.current);
      pendingModeSettleFrameRef.current = null;
    }
  }, []);

  const scheduleScrollCommand = useCallback((run: () => void, defer?: "microtask" | "raf") => {
    cancelPendingScrollCommand();
    const token = scheduledScrollCommandTokenRef.current;

    /**
     * 内部函数变量：`guardedRun`。
     *
     * @remarks
     * 把延迟执行的滚动命令绑到当前 token，避免旧的 microtask / rAF 在用户已经接管滚动后继续落地。
     */
    const guardedRun = () => {
      if (scheduledScrollCommandTokenRef.current !== token) return;
      run();
    };

    if (defer === "microtask") {
      queueMicrotask(guardedRun);
      return;
    }

    if (defer === "raf") {
      pendingCommandFrameRef.current = requestAnimationFrame(() => {
        pendingCommandFrameRef.current = null;
        guardedRun();
      });
      return;
    }

    guardedRun();
  }, [cancelPendingScrollCommand]);

  const cancelPendingStartupRestore = useCallback(() => {
    pendingStartupRestoreTopicIdRef.current = null;
    startupRestoreTokenRef.current += 1;
  }, []);

  const cancelProgrammaticCommand = useCallback((token?: number) => {
    const current = activeProgrammaticCommandRef.current;
    if (!current) return;
    if (typeof token === "number" && current.token !== token) return;
    activeProgrammaticCommandRef.current = null;
  }, []);

  const commitFollowBottom = useCallback((options?: { notify?: boolean; syncState?: boolean }) => {
    pendingUpwardScrollIntentRef.current = false;
    const element = getScrollElement();
    if (element) {
      lastScrollTopRef.current = readChatScrollPositionState(element).currentTop;
    }
    setScrollMode("follow-bottom");
    if (options?.notify !== false) {
      emitFollowModeChange("follow-bottom");
    }
    if (options?.syncState === false) return;
    syncPositionState(false, true, true);
  }, [emitFollowModeChange, getScrollElement, setScrollMode, syncPositionState]);

  const commitDetachedReading = useCallback((options?: { atTop?: boolean; notify?: boolean; syncState?: boolean }) => {
    setScrollMode("detached-reading");
    if (options?.notify !== false) {
      emitFollowModeChange("detached-reading");
    }
    if (options?.syncState === false) return;
    syncPositionState(Boolean(options?.atTop), false, false);
  }, [emitFollowModeChange, setScrollMode, syncPositionState]);

  const beginProgrammaticCommand = useCallback((
    type: ChatProgrammaticCommandType,
    settleTarget: ChatProgrammaticSettleTarget,
    options?: { anchorMessageId?: string | null; minimumDataRevision?: number | null },
  ) => {
    cancelPendingScrollCommand();
    cancelPendingModeSettle();
    cancelPendingStartupRestore();
    const nextSession = {
      anchorMessageId: options?.anchorMessageId ?? null,
      attempt: 0,
      dataRevision: null,
      minimumDataRevision: options?.minimumDataRevision ?? null,
      readyToSettle: false,
      settleTarget,
      token: programmaticCommandTokenRef.current + 1,
      type,
    } satisfies ChatProgrammaticCommandSession;
    programmaticCommandTokenRef.current = nextSession.token;
    activeProgrammaticCommandRef.current = nextSession;
    scrollModeRef.current = "programmatic";
    setScrollModeSnapshot((current) => (current === settleTarget ? current : settleTarget));
    return nextSession;
  }, [cancelPendingModeSettle, cancelPendingScrollCommand, cancelPendingStartupRestore]);

  const claimProgrammaticCommandAttempt = useCallback((token: number, options?: { dataRevision?: number | null }) => {
    const current = activeProgrammaticCommandRef.current;
    if (!current || current.token !== token) return null;
    const nextAttempt = current.attempt + 1;
    activeProgrammaticCommandRef.current = {
      ...current,
      attempt: nextAttempt,
      dataRevision: options?.dataRevision ?? null,
      readyToSettle: false,
    };
    return nextAttempt;
  }, []);

  const isProgrammaticCommandAttemptActive = useCallback((token: number, attempt: number) => {
    const current = activeProgrammaticCommandRef.current;
    return Boolean(current && current.token === token && current.attempt === attempt);
  }, []);

  const markProgrammaticCommandReady = useCallback((token: number, attempt: number) => {
    const current = activeProgrammaticCommandRef.current;
    if (!current || current.token !== token || current.attempt !== attempt) return false;
    activeProgrammaticCommandRef.current = {
      ...current,
      readyToSettle: true,
    };
    return true;
  }, []);

  const readScrollPositionState = useCallback((element: HTMLDivElement) => {
    /**
     * 显式 ask/message 锚点导航会临时为列表尾部注入“可达阅读位” slack，
     * owner 的常规几何读取必须按当前 DOM 可滚动空间判断是否到底。
     *
     * 说明：
     * - near-tail anchor jump 需要在 slack 区域内保持 `detached-reading`，否则刚落位就会被误判为底部并回收 slack；
     * - 显式 bottom command 仍在 command pipeline 内扣除 slack 并滚回真实消息底部，不让底部语义漂到这里。
     */
    return readChatScrollPositionState(element);
  }, []);

  const settleProgrammaticMode = useCallback((element?: HTMLDivElement | null) => {
    const target = element ?? getScrollElement();
    if (!target) return;
    const active = activeProgrammaticCommandRef.current;
    if (!active?.readyToSettle) return;

    const { atTop, currentTop, nearBottom, strictBottom } = readScrollPositionState(target);
    lastScrollTopRef.current = currentTop;
    if (active.settleTarget === "follow-bottom") {
      syncPositionState(atTop, nearBottom, strictBottom);
      if (!strictBottom) {
        onProgrammaticCommandPending?.(active);
        return;
      }
      if (canSettleProgrammaticCommand && !canSettleProgrammaticCommand(active)) return;
      activeProgrammaticCommandRef.current = null;
      commitFollowBottom({ notify: false, syncState: false });
      syncPositionState(atTop, true, true);
      onProgrammaticCommandSettled?.({
        anchorMessageId: active.anchorMessageId,
        atTop,
        nearBottom: true,
        settleTarget: active.settleTarget,
        strictBottom: true,
        token: active.token,
        type: active.type,
      });
      return;
    }

    activeProgrammaticCommandRef.current = null;
    commitDetachedReading({ atTop, notify: false, syncState: false });
    syncPositionState(atTop, nearBottom, false);
    onProgrammaticCommandSettled?.({
      anchorMessageId: active.anchorMessageId,
      atTop,
      nearBottom,
      settleTarget: active.settleTarget,
      strictBottom,
      token: active.token,
      type: active.type,
    });
  }, [
    commitDetachedReading,
    commitFollowBottom,
    onProgrammaticCommandSettled,
    readScrollPositionState,
    getScrollElement,
    syncPositionState,
    canSettleProgrammaticCommand,
    onProgrammaticCommandPending,
  ]);

  const scheduleProgrammaticModeSettle = useCallback((token?: number, attempt?: number) => {
    cancelPendingModeSettle();
    pendingModeSettleFrameRef.current = requestAnimationFrame(() => {
      pendingModeSettleFrameRef.current = null;
      if (scrollModeRef.current !== "programmatic") return;
      const active = activeProgrammaticCommandRef.current;
      if (typeof token === "number" && active?.token !== token) return;
      if (typeof attempt === "number" && active?.attempt !== attempt) return;
      settleProgrammaticMode();
    });
  }, [cancelPendingModeSettle, settleProgrammaticMode]);

  const syncScrollPositionFromDom = useCallback((options: SyncChatScrollPositionOptions = {}) => {
    const element = getScrollElement();
    if (!element) return null;

    const state = readScrollPositionState(element);
    lastScrollTopRef.current = state.currentTop;

    if (scrollModeRef.current === "programmatic") {
      settleProgrammaticMode(element);
      return state;
    }

    if (state.strictBottom) {
      if (options.allowFollowBottomCommit !== true) {
        syncPositionState(state.atTop, true, true);
        return state;
      }
      commitFollowBottom({ syncState: false });
      syncPositionState(state.atTop, true, true);
      return state;
    }

    syncPositionState(state.atTop, state.nearBottom, false);
    return state;
  }, [commitFollowBottom, getScrollElement, readScrollPositionState, settleProgrammaticMode, syncPositionState]);

  const enterDetachedReading = useCallback((atTop?: boolean) => {
    cancelPendingScrollCommand();
    cancelPendingModeSettle();
    cancelPendingStartupRestore();
    cancelProgrammaticCommand();

    /**
     * wheel / touch / key 意图可能早于原生 scroll 事件到达。
     * 进入阅读态时先用当前 DOM 几何校准上一帧 scrollTop，避免后续同一轮
     * scroll 事件把“用户刚刚上翻”的状态误判成“从 0 向下滚到底”并重新接回贴底。
     */
    const element = getScrollElement();
    const state = element ? readScrollPositionState(element) : null;
    if (state) {
      lastScrollTopRef.current = state.currentTop;
    }
    commitDetachedReading({ atTop: atTop ?? state?.atTop });
  }, [cancelPendingModeSettle, cancelPendingScrollCommand, cancelPendingStartupRestore, cancelProgrammaticCommand, commitDetachedReading, getScrollElement, readScrollPositionState]);

  const handleWheelIntent = useCallback((deltaY: number) => {
    if (Number.isFinite(deltaY) && deltaY < 0) {
      pendingUpwardScrollIntentRef.current = true;
      if (scrollModeRef.current !== "detached-reading") {
        enterDetachedReading(false);
      }
    }
  }, [enterDetachedReading]);

  const handleTouchStart = useCallback((clientY: number) => {
    lastTouchClientYRef.current = clientY;
  }, []);

  const handleTouchMove = useCallback((clientY: number) => {
    const previous = lastTouchClientYRef.current;
    lastTouchClientYRef.current = clientY;
    if (previous == null) return;
    if (clientY - previous > 3) enterDetachedReading(false);
  }, [enterDetachedReading]);

  const handleKeyScrollIntent = useCallback((key: string) => {
    if (key === "ArrowUp" || key === "PageUp" || key === "Home") {
      enterDetachedReading(key === "Home");
      return;
    }
  }, [enterDetachedReading]);

  const handleTranscriptInteraction = useCallback((options?: ChatTranscriptInteractionOptions) => {
    cancelPendingScrollCommand();
    cancelPendingModeSettle();
    cancelPendingStartupRestore();
    cancelProgrammaticCommand();

    const element = getScrollElement();
    if (!element) return;

    const { atTop, currentTop, nearBottom, strictBottom } = readScrollPositionState(element);
    lastScrollTopRef.current = currentTop;

    if (options?.forceDetached === true) {
      /**
       * 元素引用卡展开/收起属于用户阅读操作，而不是“继续贴底”的内容增长。
       *
       * 这里即使当前还在严格底部，也必须先把 owner 切到 detached-reading；
       * 后续虚拟行高度变化才能被尺寸修正规则识别为阅读态变更，而不是主动改写 scrollTop。
       */
      commitDetachedReading({ atTop, syncState: false });
      syncPositionState(atTop, false, false);
      return;
    }

    if (strictBottom) {
      commitFollowBottom();
      return;
    }

    commitDetachedReading({ atTop, syncState: false });
    syncPositionState(atTop, nearBottom, false);
  }, [cancelPendingModeSettle, cancelPendingScrollCommand, cancelPendingStartupRestore, cancelProgrammaticCommand, commitDetachedReading, commitFollowBottom, getScrollElement, readScrollPositionState, syncPositionState]);

  const handleScrollbarDragStart = useCallback(() => {
    /**
     * 原生 scrollbar thumb 的拖拽第一拍早于 scrollTop 变化。
     * 这里把它建模成正式的用户阅读接管，避免 strict-bottom 几何在普通
     * transcript interaction 路径里重新提交 follow-bottom。
     */
    if (scrollModeRef.current === "detached-reading") return;
    enterDetachedReading(false);
  }, [enterDetachedReading]);

  const handleScroll = useCallback(() => {
    const element = getScrollElement();
    if (!element) return true;

    const prevTop = lastScrollTopRef.current;
    const { atTop, currentTop, nearBottom, strictBottom } = readScrollPositionState(element);
    lastScrollTopRef.current = currentTop;
    const isScrollingUp = currentTop < prevTop;
    const isScrollingDown = currentTop > prevTop;

    if (
      scrollModeRef.current === "programmatic"
      && activeProgrammaticCommandRef.current?.settleTarget === "follow-bottom"
      && isScrollingUp
      && !strictBottom
    ) {
      // 用户向上阅读的真实 scroll 事件必须能抢占尚未结算的底部命令。
      //
      // bottom command 为动态高度列表会跨多帧收敛，期间仍可能继续写入底部；
      // 原生 scrollbar / 宿主 overlay scrollbar 不一定稳定派发可命中的 pointer down；
      // 一旦 DOM 已经表现为“向上离底”，这里直接取消 active bottom command 并进入阅读态，
      // 避免下一帧 `onProgrammaticCommandPending -> retry bottom` 再把用户拉回尾部。
      //
      // 仍处于 strict-bottom 的向上 scroll 不在这里接管，避免内容变短、字体回流或浏览器
      // 自身底部钳制把自动修正误判成用户阅读操作。
      enterDetachedReading(atTop);
      return true;
    }

    if (scrollModeRef.current === "programmatic") {
      settleProgrammaticMode(element);
      return false;
    }

    if (pendingUpwardScrollIntentRef.current) {
      pendingUpwardScrollIntentRef.current = false;
      enterDetachedReading(atTop);
      return true;
    }

    if (isScrollingUp) {
      enterDetachedReading(atTop);
      return true;
    }

    if (strictBottom) {
      const shouldCommitFollowBottom = scrollModeRef.current !== "detached-reading" || isScrollingDown;
      if (!shouldCommitFollowBottom) {
        syncPositionState(atTop, true, true);
        return true;
      }
      commitFollowBottom({ syncState: false });
      syncPositionState(atTop, true, true);
      return true;
    }

    if (scrollModeRef.current === "follow-bottom") {
      /**
       * follow-bottom 期间出现“临时离底”不等于用户重新接管滚动。
       *
       * 说明：
       * - 流式回复增长、动态高度重测和尾部补测都会让 `distance` 短暂大于 strict-bottom 阈值；
       * - 如果这里直接切回 `detached-reading`，就会把“显式点击到底部后继续跟随”的意图错误打断，banner 重新出现且后续不再跟随；
       * - 真正的用户脱离阅读只认前面的向上滚动判定与显式用户意图事件，这里只同步几何状态，不篡改 owner。
       */
      syncPositionState(atTop, nearBottom, false);
      return false;
    }

    if (scrollModeRef.current === "startup-restore") {
      commitDetachedReading({ atTop, syncState: false });
      syncPositionState(atTop, nearBottom, false);
      return true;
    }

    syncPositionState(atTop, nearBottom, false);
    return true;
  }, [commitDetachedReading, commitFollowBottom, enterDetachedReading, getScrollElement, readScrollPositionState, settleProgrammaticMode, syncPositionState]);

  useEffect(() => {
    /**
     * 这个 effect 只负责“切换 topic / 进入空会话”时重建 owner。
     * 同一个 topic 内的 followMode 会通过 `handleFollowModeChange -> commitSession`
     * 回写 session；它不是新的初始化种子，不能反向把已经 detached 的 owner 重置成 startup-restore。
     */
    const nextInitialFollowMode = initialFollowModeRef.current;
    pendingStartupRestoreTopicIdRef.current = topicId ?? null;
    startupRestoreTokenRef.current += 1;
    lastScrollTopRef.current = 0;
    lastTouchClientYRef.current = null;
    pendingUpwardScrollIntentRef.current = false;
    cancelPendingScrollCommand();
    cancelPendingModeSettle();
    cancelProgrammaticCommand();
    setScrollMode(topicId ? "startup-restore" : nextInitialFollowMode);
    syncPositionState(false, nextInitialFollowMode === "follow-bottom", nextInitialFollowMode === "follow-bottom");
  }, [cancelPendingModeSettle, cancelPendingScrollCommand, cancelProgrammaticCommand, setScrollMode, syncPositionState, topicId]);

  return {
    activeProgrammaticCommandRef,
    beginProgrammaticCommand,
    cancelPendingModeSettle,
    cancelPendingScrollCommand,
    cancelPendingStartupRestore,
    cancelProgrammaticCommand,
    claimProgrammaticCommandAttempt,
    commitFollowBottom,
    commitDetachedReading,
    handleKeyScrollIntent,
    handleScroll,
    handleTouchMove,
    handleTouchStart,
    handleTranscriptInteraction,
    handleScrollbarDragStart,
    handleWheelIntent,
    isAtBottom,
    isAtTop,
    isStrictBottom,
    isProgrammaticCommandAttemptActive,
    markProgrammaticCommandReady,
    pendingStartupRestoreTopicIdRef,
    readScrollPositionState,
    scheduleProgrammaticModeSettle,
    scheduleScrollCommand,
    scrollModeRef,
    scrollModeSnapshot,
    settleProgrammaticMode,
    startupRestoreTokenRef,
    syncScrollPositionFromDom,
    syncPositionState,
  };
}
