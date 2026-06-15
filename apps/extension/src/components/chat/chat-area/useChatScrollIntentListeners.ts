/**
 * 说明：主聊天滚动输入监听模块。
 *
 * 职责：
 * - 把 wheel / touch / key / pointer / focus 这组原生输入统一转交给滚动 owner 门面；
 * - 识别原生 scrollbar drag start，并在普通 transcript interaction 之前声明用户阅读接管。
 *
 * 边界：
 * - 本文件只订阅当前滚动容器事件，不维护滚动状态，也不直接写入 DOM scrollTop；
 * - 所有行为决策仍然回到 `useChatAreaVirtualizer` 暴露的唯一 owner handler。
 */
import { useEffect, useRef, type RefObject } from "react";

import { isChatVerticalScrollbarGutterPointerDown } from "@/components/chat/chat-scrollbar-intent";

const CHAT_SCROLL_STABLE_MUTATION_SELECTOR = '[data-chat-scroll-stable-mutation="true"]';

interface ChatScrollIntentTranscriptInteractionOptions {
  readonly forceDetached?: boolean;
}

interface UseChatScrollIntentListenersParams {
  readonly handleKeyScrollIntent: (key: string) => void;
  readonly handleScrollbarDragStart: () => void;
  readonly handleTouchMove: (clientY: number) => void;
  readonly handleTouchStart: (clientY: number) => void;
  readonly handleTranscriptInteraction: (options?: ChatScrollIntentTranscriptInteractionOptions) => void;
  readonly handleWheelIntent: (deltaY: number) => void;
  readonly scrollRef: RefObject<HTMLDivElement | null>;
}

/**
 * 内部函数：判断事件是否来自会改变消息行高度、但应保持阅读位置稳定的控件。
 */
function isChatScrollStableMutationTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(CHAT_SCROLL_STABLE_MUTATION_SELECTOR));
}

/**
 * 内部函数：判断按键是否会激活引用卡这类按钮。
 */
function isStableMutationActivationKey(key: string) {
  return key === "Enter" || key === " ";
}

/**
 * 导出 Hook：稳定订阅主聊天滚动输入事件。
 *
 * @param params - 当前滚动容器 ref 与唯一滚动 owner 门面 handler。
 */
export function useChatScrollIntentListeners({
  handleKeyScrollIntent,
  handleScrollbarDragStart,
  handleTouchMove,
  handleTouchStart,
  handleTranscriptInteraction,
  handleWheelIntent,
  scrollRef,
}: UseChatScrollIntentListenersParams) {
  const handlersRef = useRef({
    handleKeyScrollIntent,
    handleScrollbarDragStart,
    handleTouchMove,
    handleTouchStart,
    handleTranscriptInteraction,
    handleWheelIntent,
  });
  handlersRef.current = {
    handleKeyScrollIntent,
    handleScrollbarDragStart,
    handleTouchMove,
    handleTouchStart,
    handleTranscriptInteraction,
    handleWheelIntent,
  };

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    /**
     * 说明：
     * - 主聊天的向上阅读意图必须尽可能早地交给虚拟化门面，避免 React 合成事件时序或宿主差异让 auto-bottom 抢先落地；
     * - 这里统一使用原生 capture 监听，但最终仍只调用同一份门面 handler，不新增第二套滚动状态机。
     */
    const handleWheel = (event: WheelEvent) => {
      handlersRef.current.handleWheelIntent(event.deltaY);
    };
    /** 记录当前触摸起点，交给虚拟化门面判断后续是否属于用户主动上翻阅读。 */
    const handleTouchStartEvent = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (touch) handlersRef.current.handleTouchStart(touch.clientY);
    };
    /** 把真实触摸移动轨迹转成统一的“用户阅读意图”输入。 */
    const handleTouchMoveEvent = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (touch) handlersRef.current.handleTouchMove(touch.clientY);
    };
    /** 把键盘滚动意图也提前交给虚拟化门面，统一取消 pending auto-bottom / startup restore。 */
    const handleKeyDownEvent = (event: KeyboardEvent) => {
      if (isStableMutationActivationKey(event.key) && isChatScrollStableMutationTarget(event.target)) {
        handlersRef.current.handleTranscriptInteraction({ forceDetached: true });
      }
      handlersRef.current.handleKeyScrollIntent(event.key);
    };
    /** 点击、按下或准备选中文本时，把 transcript 交互意图提前交给滚动门面。 */
    const handlePointerDownEvent = (event: PointerEvent) => {
      if (isChatVerticalScrollbarGutterPointerDown(element, event)) {
        handlersRef.current.handleScrollbarDragStart();
        return;
      }
      if (isChatScrollStableMutationTarget(event.target)) {
        handlersRef.current.handleTranscriptInteraction({ forceDetached: true });
        return;
      }
      handlersRef.current.handleTranscriptInteraction();
    };
    /** 部分宿主对原生 scrollbar 只稳定派发 mouse 事件；这里只在 gutter / overlay thumb 命中时接管。 */
    const handleMouseDownEvent = (event: MouseEvent) => {
      if (!isChatVerticalScrollbarGutterPointerDown(element, event)) return;
      handlersRef.current.handleScrollbarDragStart();
    };
    /** 引用卡的真实展开/收起发生在 React click 里；capture click 必须先切到阅读态。 */
    const handleClickEvent = (event: MouseEvent) => {
      if (isChatScrollStableMutationTarget(event.target)) {
        handlersRef.current.handleTranscriptInteraction({ forceDetached: true });
      }
    };
    /** 键盘 Tab 进消息里的按钮、代码块操作或其它可聚焦元素时，也要视为用户接管滚动。 */
    const handleFocusInEvent = (event: FocusEvent) => {
      if (isChatScrollStableMutationTarget(event.target)) {
        handlersRef.current.handleTranscriptInteraction({ forceDetached: true });
        return;
      }
      handlersRef.current.handleTranscriptInteraction();
    };

    element.addEventListener("wheel", handleWheel, { capture: true, passive: true });
    element.addEventListener("pointerdown", handlePointerDownEvent, { capture: true, passive: true });
    element.addEventListener("mousedown", handleMouseDownEvent, { capture: true, passive: true });
    element.addEventListener("click", handleClickEvent, true);
    element.addEventListener("touchstart", handleTouchStartEvent, { capture: true, passive: true });
    element.addEventListener("touchmove", handleTouchMoveEvent, { capture: true, passive: true });
    element.addEventListener("focusin", handleFocusInEvent, true);
    element.addEventListener("keydown", handleKeyDownEvent, true);
    return () => {
      element.removeEventListener("wheel", handleWheel, true);
      element.removeEventListener("pointerdown", handlePointerDownEvent, true);
      element.removeEventListener("mousedown", handleMouseDownEvent, true);
      element.removeEventListener("click", handleClickEvent, true);
      element.removeEventListener("touchstart", handleTouchStartEvent, true);
      element.removeEventListener("touchmove", handleTouchMoveEvent, true);
      element.removeEventListener("focusin", handleFocusInEvent, true);
      element.removeEventListener("keydown", handleKeyDownEvent, true);
    };
  }, [scrollRef]);
}
