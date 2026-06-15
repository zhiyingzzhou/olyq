/**
 * 说明：`useRenameableTopicRow` 组件模块。
 *
 * 职责：
 * - 承载 `useRenameableTopicRow` 相关的当前文件实现与模块边界；
 * - 对外暴露 `useRenameableTopicRow` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useEffect, useRef, type MouseEvent } from 'react';

/** 双击判定窗口，放宽到更接近桌面系统默认阈值，降低自动化与浏览器时序抖动。 */
const DOUBLE_CLICK_WINDOW_MS = 280;
/** 双通路双击事件的去重窗口，避免同一次手势重复进入重命名。 */
const DOUBLE_CLICK_GESTURE_DEDUP_MS = 220;

/** 可重命名侧边栏项的单击/双击交互选项。 */
interface UseRenameableTopicRowOptions {
  /** 当前项是否禁用交互。 */
  readonly disabled?: boolean;
  /** 当前项是否已处于激活态。 */
  readonly isActive?: boolean;
  /** 单击时触发选中。 */
  readonly onSelect: () => void;
  /** 双击时进入重命名。 */
  readonly onStartRename: () => void;
}

/**
 * 统一处理侧边栏列表项的单击选中 / 双击重命名。
 *
 * 说明：
 * - Playwright/部分浏览器环境下，双击不一定稳定派发原生 `dblclick`；
 * - 因此这里改为基于 `click.detail` 区分单双击，并延迟执行单击逻辑；
 * - 这样可以避免“双击第一下先触发选中，聊天输入框夺回焦点，导致重命名输入框瞬间 blur”。
 */
export function useRenameableTopicRow({
  disabled = false,
  isActive = false,
  onSelect,
  onStartRename,
}: UseRenameableTopicRowOptions) {
  const clickTimerRef = useRef<number | null>(null);
  const lastClickAtRef = useRef(0);
  const renameGestureAtRef = useRef(0);

  const clearPendingSelect = useCallback(() => {
    if (clickTimerRef.current === null) return;
    window.clearTimeout(clickTimerRef.current);
    clickTimerRef.current = null;
  }, []);

  useEffect(() => clearPendingSelect, [clearPendingSelect]);

  const triggerRename = useCallback(() => {
    const now = Date.now();
    if (now - renameGestureAtRef.current < DOUBLE_CLICK_GESTURE_DEDUP_MS) {
      clearPendingSelect();
      return;
    }

    renameGestureAtRef.current = now;
    lastClickAtRef.current = 0;
    clearPendingSelect();
    onStartRename();
  }, [clearPendingSelect, onStartRename]);

  const handleClick = useCallback((event: MouseEvent<HTMLElement>) => {
    if (disabled) {
      lastClickAtRef.current = 0;
      clearPendingSelect();
      return;
    }

    const now = Date.now();
    const withinDoubleClickWindow = now - lastClickAtRef.current <= DOUBLE_CLICK_WINDOW_MS;
    lastClickAtRef.current = now;

    if (event.detail >= 2 || withinDoubleClickWindow) {
      event.preventDefault();
      triggerRename();
      return;
    }

    clearPendingSelect();
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null;
      lastClickAtRef.current = 0;
      if (!isActive) onSelect();
    }, DOUBLE_CLICK_WINDOW_MS);
  }, [clearPendingSelect, disabled, isActive, onSelect, triggerRename]);

  const handleDoubleClick = useCallback((event: MouseEvent<HTMLElement>) => {
    if (disabled) {
      lastClickAtRef.current = 0;
      clearPendingSelect();
      return;
    }
    event.preventDefault();
    triggerRename();
  }, [clearPendingSelect, disabled, triggerRename]);

  return { handleClick, handleDoubleClick };
}
