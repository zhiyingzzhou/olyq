/**
 * 说明：`GridPreviewPopover` 组件模块。
 *
 * 职责：
 * - 承载多模型 `grid` 预览浮层的统一承载壳体；
 * - 让 `hover` / `click` 两种触发语义都复用同一套可交互 `Popover` 契约。
 *
 * 边界：
 * - 本文件只处理预览浮层壳体时序，不承担 `ModelCard` 内容渲染或消息操作业务。
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import {
  GRID_PREVIEW_FLOATING_LAYER_ATTR,
  GRID_PREVIEW_POPOVER_CONTENT_PROPS,
} from './layout-helpers';

/** `GridPreviewPopover` 内容 render-props 入参。 */
interface GridPreviewPopoverRenderArgs {
  /** 通知外层当前是否有嵌套浮层打开，用于避免 hover 预览被误关。 */
  readonly onNestedOverlayOpenChange: (open: boolean) => void;
}

/** `GridPreviewPopover` 入参。 */
interface GridPreviewPopoverProps {
  /** 当前 `grid` 预览的触发语义。 */
  readonly triggerMode: 'hover' | 'click';
  /** 预览卡片 trigger。 */
  readonly trigger: ReactNode;
  /** 完整预览内容。 */
  readonly renderContent: (args: GridPreviewPopoverRenderArgs) => ReactNode;
}

const HOVER_CLOSE_DELAY_MS = 120;

/**
 * 导出组件：`GridPreviewPopover`。
 *
 * @remarks
 * `HoverCard` 更偏只读预览，不适合内部继续滚动、翻译和打开二级菜单；
 * 这里统一切到可交互 `Popover` 壳体，同时保留 `hover` / `click` 两种入口语义。
 */
export function GridPreviewPopover({
  triggerMode,
  trigger,
  renderContent,
}: GridPreviewPopoverProps) {
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const triggerHoveringRef = useRef(false);
  const contentHoveringRef = useRef(false);
  const nestedOverlayOpenRef = useRef(false);

  /**
   * 内部函数变量：`clearCloseTimer`。
   *
   * @remarks
   * 统一清理 hover 延迟关闭定时器，避免 trigger/content 来回切换时累积陈旧关闭任务。
   */
  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  /**
   * 内部函数变量：`closeIfIdle`。
   *
   * @remarks
   * 只有 trigger、content 和嵌套浮层都不活跃时，hover 预览才允许真正关闭。
   */
  const closeIfIdle = useCallback((delay = HOVER_CLOSE_DELAY_MS) => {
    if (triggerMode !== 'hover') return;
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      if (triggerHoveringRef.current) return;
      if (contentHoveringRef.current) return;
      if (nestedOverlayOpenRef.current) return;
      setOpen(false);
    }, delay);
  }, [clearCloseTimer, triggerMode]);

  useEffect(() => () => {
    clearCloseTimer();
  }, [clearCloseTimer]);

  const handleNestedOverlayOpenChange = useCallback((nextOpen: boolean) => {
    nestedOverlayOpenRef.current = nextOpen;
    if (nextOpen) {
      clearCloseTimer();
      setOpen(true);
      return;
    }
    closeIfIdle(0);
  }, [clearCloseTimer, closeIfIdle]);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (triggerMode === 'hover') {
      if (nextOpen) {
        clearCloseTimer();
        setOpen(true);
        return;
      }

      if (nestedOverlayOpenRef.current) return;
      if (triggerHoveringRef.current) return;
      if (contentHoveringRef.current) return;
    }

    clearCloseTimer();
    setOpen(nextOpen);
  }, [clearCloseTimer, triggerMode]);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <div
          className="cursor-pointer"
          onPointerEnter={() => {
            if (triggerMode !== 'hover') return;
            triggerHoveringRef.current = true;
            clearCloseTimer();
            setOpen(true);
          }}
          onPointerLeave={() => {
            if (triggerMode !== 'hover') return;
            triggerHoveringRef.current = false;
            closeIfIdle();
          }}
          onFocusCapture={() => {
            if (triggerMode !== 'hover') return;
            clearCloseTimer();
            setOpen(true);
          }}
          onBlurCapture={() => {
            if (triggerMode !== 'hover') return;
            closeIfIdle(0);
          }}
        >
          {trigger}
        </div>
      </PopoverTrigger>

      <PopoverContent
        {...GRID_PREVIEW_POPOVER_CONTENT_PROPS}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onPointerEnter={() => {
          if (triggerMode !== 'hover') return;
          contentHoveringRef.current = true;
          clearCloseTimer();
        }}
        onPointerLeave={() => {
          if (triggerMode !== 'hover') return;
          contentHoveringRef.current = false;
          closeIfIdle();
        }}
        onInteractOutside={(event) => {
          const target = event.target;
          if (!(target instanceof Element)) return;
          if (target.closest(`[${GRID_PREVIEW_FLOATING_LAYER_ATTR}]`)) {
            event.preventDefault();
          }
        }}
      >
        {renderContent({ onNestedOverlayOpenChange: handleNestedOverlayOpenChange })}
      </PopoverContent>
    </Popover>
  );
}
