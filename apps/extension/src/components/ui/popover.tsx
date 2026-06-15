/**
 * 说明：`popover` 组件模块。
 *
 * 职责：
 * - 承载 `popover` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "@/lib/utils";
import { blurActiveElement, usePreparedRadixModalOpenState } from "@/components/ui/radix-auto-blur";
import {
  OVERLAY_FLOATING_LAYER_CLASS,
  resolveFloatingOverlayPortalContainer,
} from "@/components/ui/overlay-layers";

type PopoverPortalContextValue = {
  portalContainer: HTMLElement | null;
  setTriggerElement: (node: HTMLElement | null) => void;
};

const PopoverPortalContext = React.createContext<PopoverPortalContextValue | null>(null);

/**
 * 把内部节点同时写回 Radix forwardRef 与当前 Popover 的 portal 容器跟踪逻辑。
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
 * 内部组件：`Popover`。
 *
 * @remarks
 * 对 `modal` 模式补齐统一的焦点清理时序，避免受控打开时让旧焦点在 `aria-hidden` 生效前残留。
 */
const Popover = ({
  open,
  defaultOpen,
  onOpenChange,
  modal = false,
  ...props
}: React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Root>) => {
  const isControlled = open !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(Boolean(defaultOpen));
  const [portalContainer, setPortalContainer] = React.useState<HTMLElement | null>(null);
  const currentOpen = isControlled ? open : uncontrolledOpen;
  const preparedModalOpen = usePreparedRadixModalOpenState(modal && Boolean(currentOpen));
  const preparedOpen = modal ? preparedModalOpen : Boolean(currentOpen);

  const handleOpenChange = React.useCallback((nextOpen: boolean) => {
    if (modal && nextOpen) blurActiveElement();
    if (!isControlled) setUncontrolledOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }, [isControlled, modal, onOpenChange]);

  const contextValue = React.useMemo<PopoverPortalContextValue>(() => ({
    portalContainer,
    setTriggerElement: (node) => setPortalContainer(resolveFloatingOverlayPortalContainer(node)),
  }), [portalContainer]);

  return (
    <PopoverPortalContext.Provider value={contextValue}>
      <PopoverPrimitive.Root {...props} modal={modal} open={preparedOpen} onOpenChange={handleOpenChange} />
    </PopoverPortalContext.Provider>
  );
};

/**
 * 内部组件：`PopoverTrigger`。
 *
 * @remarks
 * 在保留 Radix 触发器语义的同时，记录当前触发节点所属的 modal shell，供 `PopoverContent` 回挂正确的 portal 容器。
 */
const PopoverTrigger = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Trigger>
>(({ ...props }, ref) => {
  const portalContext = React.useContext(PopoverPortalContext);

  const handleRef = React.useCallback((node: React.ElementRef<typeof PopoverPrimitive.Trigger> | null) => {
    assignForwardedRef(ref, node);
    portalContext?.setTriggerElement(node);
  }, [portalContext, ref]);

  return <PopoverPrimitive.Trigger ref={handleRef} {...props} />;
});
PopoverTrigger.displayName = PopoverPrimitive.Trigger.displayName;

/**
 * 内部组件：`PopoverContent`。
 *
 * @remarks
 * 用于拆分当前文件中的局部界面结构或交互片段，减少主组件体积并收拢视图职责。
 */
const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, ...props }, ref) => {
  const portalContext = React.useContext(PopoverPortalContext);

  return (
    <PopoverPrimitive.Portal container={portalContext?.portalContainer ?? undefined}>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        OVERLAY_FLOATING_LAYER_CLASS,
        className,
      )}
      {...props}
    />
    </PopoverPrimitive.Portal>
  );
});
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent };
