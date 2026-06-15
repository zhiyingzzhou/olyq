/**
 * 说明：`screenshot-capture` 文字草稿输入控制器。
 *
 * 职责：
 * - 让截图文字工具的 `contentEditable` 独占普通输入、换行和 IME composition；
 * - 只在明确的外部点击、工具动作或快捷提交时把草稿提交为可拖拽文字 rune；
 * - 防止 blur、中文候选键和截图级 Enter/Esc 快捷键抢占输入态。
 *
 * 边界：
 * - 本模块只管理页面侧临时 DOM 输入态，不持久化文字；
 * - 样式、折行、文字 rune 和最终导出绘制仍由 `drawing.ts` 统一负责。
 */
import { clearTextDraftNode, type ScreenshotRuneManager } from './drawing';
import type { ScreenshotEditorUi } from './types';

/** 文字草稿控制器暴露给截图 controller 的事件 owner。 */
export type ScreenshotTextDraftController = {
  /** 当前文字草稿是否打开。 */
  isOpen: () => boolean;
  /** 当前事件是否来自文字编辑层。 */
  isEvent: (event: Event) => boolean;
  /** 当前是否处于 IME 组合输入期间。 */
  isComposing: (event?: KeyboardEvent) => boolean;
  /** 显式提交文字草稿。 */
  commit: () => boolean;
  /** 显式取消文字草稿。 */
  cancel: () => void;
  /** contentEditable keydown handler。 */
  onKeyDown: (event: KeyboardEvent) => void;
  /** contentEditable compositionstart handler。 */
  onCompositionStart: (event: CompositionEvent) => void;
  /** contentEditable compositionend handler。 */
  onCompositionEnd: (event: CompositionEvent) => void;
  /** contentEditable beforeinput/input handler。 */
  onInputEvent: (event: InputEvent | Event) => void;
  /** contentEditable pointerdown handler。 */
  onPointerDown: (event: PointerEvent) => void;
  /** contentEditable blur handler。 */
  onBlur: () => void;
};

/** 清理文字草稿 DOM 状态。 */
export function clearScreenshotTextDraft(refs: ScreenshotEditorUi): void {
  clearTextDraftNode(refs.textInput);
  refs.textInput.style.display = 'none';
  delete refs.textInput.dataset.open;
  delete refs.textInput.dataset.maxWidth;
  delete refs.textInput.dataset.composing;
}

/**
 * 创建文字草稿输入控制器。
 *
 * @param refs - 截图编辑器 UI 引用。
 * @param runeManager - 当前截图 rune 管理器。
 * @param blockEvent - 截图 controller 的强阻断 helper，仅用于显式提交 / 取消快捷键。
 * @param onDraftStateChange - 文字草稿打开状态变化后的同步回调。
 * @returns 面向截图 controller 的文字输入事件 owner。
 */
export function createScreenshotTextDraftController(
  refs: ScreenshotEditorUi,
  runeManager: ScreenshotRuneManager,
  blockEvent: (event: Event) => void,
  onDraftStateChange?: () => void,
): ScreenshotTextDraftController {
  const state = {
    composing: false,
    closingIntent: false,
  };

  /** 判断当前 contentEditable 是否处于可见输入态。 */
  const isOpen = (): boolean => refs.textInput.dataset.open === 'true';
  /** 判断事件路径是否命中文字编辑层，兼容 Shadow DOM retarget。 */
  const isEvent = (event: Event): boolean => {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    return event.target === refs.textInput || path.includes(refs.textInput);
  };
  /** 判断当前事件或内部状态是否处于 IME 组合输入期间。 */
  const isComposing = (event?: KeyboardEvent): boolean => (
    state.composing
    || refs.textInput.dataset.composing === 'true'
    || event?.isComposing === true
    || event?.key === 'Process'
  );
  /** 只截断事件传播，避免 preventDefault 破坏浏览器原生输入。 */
  const stopTextEventPropagation = (event: Event) => {
    event.stopPropagation();
  };
  /** 同步 IME composition 状态到 DOM dataset，供 drawing 提交 guard 读取。 */
  const setComposing = (composing: boolean) => {
    state.composing = composing;
    if (composing) refs.textInput.dataset.composing = 'true';
    else delete refs.textInput.dataset.composing;
  };
  /** 在非 composition 状态下提交文字草稿并进入短暂 closingIntent。 */
  const commit = (): boolean => {
    if (!isOpen()) return true;
    if (isComposing()) return false;
    state.closingIntent = true;
    let committed = false;
    try {
      committed = runeManager.commitText();
      return committed;
    } finally {
      state.closingIntent = false;
      if (committed) onDraftStateChange?.();
    }
  };
  /** 取消当前文字草稿，并清理 composition 与 DOM 可见状态。 */
  const cancel = () => {
    state.closingIntent = true;
    try {
      setComposing(false);
      clearScreenshotTextDraft(refs);
    } finally {
      state.closingIntent = false;
      onDraftStateChange?.();
    }
  };
  /** 处理文字编辑层自身快捷键，普通输入始终交还给浏览器。 */
  const onKeyDown = (event: KeyboardEvent) => {
    if (isComposing(event)) {
      stopTextEventPropagation(event);
      return;
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      blockEvent(event);
      void commit();
      return;
    }
    if (event.key === 'Escape') {
      blockEvent(event);
      cancel();
      return;
    }
    stopTextEventPropagation(event);
  };

  return {
    isOpen,
    isEvent,
    isComposing,
    commit,
    cancel,
    onKeyDown,
    onCompositionStart: (event) => {
      setComposing(true);
      stopTextEventPropagation(event);
    },
    onCompositionEnd: (event) => {
      setComposing(false);
      stopTextEventPropagation(event);
    },
    onInputEvent: stopTextEventPropagation,
    onPointerDown: stopTextEventPropagation,
    onBlur: () => {
      // blur 不是提交 owner：IME 候选窗、浏览器焦点修正和网页抢焦都可能触发它。
      // 草稿由外部点击、工具动作或显式快捷键提交；closingIntent 仅标记这些路径。
      void state.closingIntent;
    },
  };
}
