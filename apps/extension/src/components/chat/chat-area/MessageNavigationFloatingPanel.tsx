/**
 * 说明：`MessageNavigationFloatingPanel` 组件模块。
 *
 * 职责：
 * - 承载主聊天右侧消息导航把手与展开面板；
 * - 统一处理面板打开、关闭、外部点击收起与 Esc 收起；
 *
 * 边界：
 * - 本文件只管理消息导航的临时 UI 显隐，不写入持久化偏好；
 * - 长期关闭仍由上层 `messageNavigation` 设置控制。
 */
import { useCallback, useEffect, useId, useRef, type MouseEvent as ReactMouseEvent } from "react";
import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, GripVertical, Waypoints, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type MessageNavigationFloatingPanelProps = {
  /** 当前导航面板是否展开。 */
  navPanelOpen: boolean;
  /** 当前激活的用户消息锚点索引。 */
  navActiveIndex: number;
  /** 可导航的用户消息锚点数量。 */
  navAnchorCount: number;
  /** 打开 flow 面板。 */
  onOpenFlow: () => void;
  /** 跳转到顶部。 */
  navGoTop: () => void;
  /** 跳转到上一问。 */
  navGoPrev: () => void;
  /** 跳转到下一问。 */
  navGoNext: () => void;
  /** 跳转到底部。 */
  navGoBottom: () => void;
  /** 更新导航面板展开态。 */
  setNavPanelOpen: (value: boolean) => void;
  /** i18n 翻译函数。 */
  t: (key: string) => string;
};

/**
 * 内部函数：生成标准 click 动作属性。
 *
 * @remarks
 * 右侧悬浮导航按钮只认标准 `click` 语义，鼠标和键盘都走同一条 DOM/React 路径。
 */
function buildFloatingNavActionProps(action: () => void) {
  return {
    onClick: (_event: ReactMouseEvent<HTMLButtonElement>) => {
      action();
    },
  };
}

/**
 * 导出组件：主聊天右侧消息导航把手与展开面板。
 *
 * @remarks
 * 把手始终作为可发现、可聚焦的恢复入口；关闭动作只收起本次面板，不写入用户偏好。
 */
export function MessageNavigationFloatingPanel({
  navPanelOpen,
  navActiveIndex,
  navAnchorCount,
  onOpenFlow,
  navGoTop,
  navGoPrev,
  navGoNext,
  navGoBottom,
  setNavPanelOpen,
  t,
}: MessageNavigationFloatingPanelProps) {
  const navShellRef = useRef<HTMLDivElement | null>(null);
  const navPanelId = useId();

  const openMessageNavigation = useCallback(() => {
    setNavPanelOpen(true);
  }, [setNavPanelOpen]);

  const closeMessageNavigation = useCallback(() => {
    setNavPanelOpen(false);
  }, [setNavPanelOpen]);

  useEffect(() => {
    if (!navPanelOpen) return;

    /**
     * 内部函数变量：`handlePointerDown`。
     *
     * @remarks
     * 捕获外部点击并收起面板；点击把手或面板内部时保持展开，避免恢复入口和面板互相抢状态。
     */
    const handlePointerDown = (event: PointerEvent) => {
      const shell = navShellRef.current;
      if (shell && event.target instanceof Node && shell.contains(event.target)) return;
      closeMessageNavigation();
    };
    /**
     * 内部函数变量：`handleKeyDown`。
     *
     * @remarks
     * Esc 是显式关闭入口，和关闭按钮一样只收起当前临时面板。
     */
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      closeMessageNavigation();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [closeMessageNavigation, navPanelOpen]);

  return (
    <div ref={navShellRef} className="absolute right-3 bottom-24 z-20 flex flex-col items-end gap-2 pointer-events-none">
      {navPanelOpen ? (
        <div
          id={navPanelId}
          data-testid="chat-nav-panel"
          aria-label={t("navigation.panel")}
          role="toolbar"
          className="pointer-events-auto flex flex-col gap-1 rounded-xl border border-border/60 bg-background/60 backdrop-blur-sm p-1 shadow-lg"
        >
          <Tooltip><TooltipTrigger asChild><button aria-label={t("navigation.top")} data-testid="chat-nav-top" type="button" {...buildFloatingNavActionProps(navGoTop)} className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"><ArrowUpToLine className="h-4 w-4" /></button></TooltipTrigger><TooltipContent side="left"><p className="text-xs">{t("navigation.top")}</p></TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><button aria-label={t("navigation.prev")} data-testid="chat-nav-prev" data-nav-active-index={navActiveIndex} type="button" disabled={navActiveIndex <= 0} {...buildFloatingNavActionProps(navGoPrev)} className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"><ArrowUp className="h-4 w-4" /></button></TooltipTrigger><TooltipContent side="left"><p className="text-xs">{t("navigation.prev")}</p></TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><button aria-label={t("navigation.next")} data-testid="chat-nav-next" data-nav-active-index={navActiveIndex} type="button" disabled={navActiveIndex < 0 || navActiveIndex >= navAnchorCount - 1} {...buildFloatingNavActionProps(navGoNext)} className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"><ArrowDown className="h-4 w-4" /></button></TooltipTrigger><TooltipContent side="left"><p className="text-xs">{t("navigation.next")}</p></TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><button aria-label={t("navigation.bottom")} data-testid="chat-nav-bottom" type="button" {...buildFloatingNavActionProps(navGoBottom)} className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"><ArrowDownToLine className="h-4 w-4" /></button></TooltipTrigger><TooltipContent side="left"><p className="text-xs">{t("navigation.bottom")}</p></TooltipContent></Tooltip>
          <div className="h-px bg-border/60 my-1" />
          <Tooltip><TooltipTrigger asChild><button aria-label={t("navigation.flow")} data-testid="chat-nav-flow" type="button" {...buildFloatingNavActionProps(onOpenFlow)} className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"><Waypoints className="h-4 w-4" /></button></TooltipTrigger><TooltipContent side="left"><p className="text-xs">{t("navigation.flow")}</p></TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><button aria-label={t("navigation.closePanel")} data-testid="chat-nav-close" type="button" {...buildFloatingNavActionProps(closeMessageNavigation)} className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"><X className="h-4 w-4" /></button></TooltipTrigger><TooltipContent side="left"><p className="text-xs">{t("navigation.closePanel")}</p></TooltipContent></Tooltip>
        </div>
      ) : null}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            aria-controls={navPanelId}
            aria-expanded={navPanelOpen}
            aria-label={t("navigation.panel")}
            data-testid="chat-nav-handle"
            type="button"
            className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-background/70 text-muted-foreground shadow-md backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            onClick={openMessageNavigation}
            onFocus={openMessageNavigation}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left"><p className="text-xs">{t("navigation.panel")}</p></TooltipContent>
      </Tooltip>
    </div>
  );
}
