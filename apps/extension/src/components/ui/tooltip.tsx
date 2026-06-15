/**
 * 说明：`tooltip` 组件模块。
 *
 * 职责：
 * - 承载 `tooltip` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "@/lib/utils";
import {
  OVERLAY_FLOATING_LAYER_CLASS,
  resolveFloatingOverlayPortalContainer,
} from "@/components/ui/overlay-layers";

type TooltipPortalContextValue = {
  portalContainer: HTMLElement | null;
  setTriggerElement: (node: HTMLElement | null) => void;
};

const TooltipPortalContext = React.createContext<TooltipPortalContextValue | null>(null);

const TooltipProvider = TooltipPrimitive.Provider;

/**
 * 把内部节点同时写回 Radix forwardRef 与当前 Tooltip 的 portal 容器跟踪逻辑。
 *
 * @param ref - 外部传入的 forwarded ref。
 * @param value - 当前要写入的节点。
 */
function assignForwardedRef<T>(ref: React.ForwardedRef<T>, value: T | null) {
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  if (ref) {
    (ref as React.MutableRefObject<T | null>).current = value;
  }
}

/**
 * 内部组件：`Tooltip`。
 *
 * @remarks
 * 统一记录 trigger 所属的 modal shell，避免 tooltip 在 blocking modal 内继续 portal 到 `document.body`
 * 后被 modal 自身层级压住。
 */
const Tooltip = ({ children, ...props }: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Root>) => {
  const [portalContainer, setPortalContainer] = React.useState<HTMLElement | null>(null);

  const contextValue = React.useMemo<TooltipPortalContextValue>(() => ({
    portalContainer,
    setTriggerElement: (node) => setPortalContainer(resolveFloatingOverlayPortalContainer(node)),
  }), [portalContainer]);

  return (
    <TooltipPortalContext.Provider value={contextValue}>
      <TooltipPrimitive.Root {...props}>
        {children}
      </TooltipPrimitive.Root>
    </TooltipPortalContext.Provider>
  );
};

/**
 * 内部组件：`TooltipTrigger`。
 *
 * @remarks
 * 在保留 Radix trigger 语义的同时，记录触发节点所在的 modal shell，供 `TooltipContent` 回挂正确的 portal 容器。
 */
const TooltipTrigger = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>
>(({ ...props }, ref) => {
  const portalContext = React.useContext(TooltipPortalContext);

  const handleRef = React.useCallback((node: React.ElementRef<typeof TooltipPrimitive.Trigger> | null) => {
    assignForwardedRef(ref, node);
    portalContext?.setTriggerElement(node);
  }, [portalContext, ref]);

  return <TooltipPrimitive.Trigger ref={handleRef} {...props} />;
});
TooltipTrigger.displayName = TooltipPrimitive.Trigger.displayName;

/**
 * 内部组件：`TooltipContent`。
 *
 * @remarks
 * 用于拆分当前文件中的局部界面结构或交互片段，减少主组件体积并收拢视图职责。
 */
const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => {
  const portalContext = React.useContext(TooltipPortalContext);

  return (
    <TooltipPrimitive.Portal container={portalContext?.portalContainer ?? undefined}>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          "overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          OVERLAY_FLOATING_LAYER_CLASS,
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
});
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
