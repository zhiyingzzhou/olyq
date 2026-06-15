/**
 * 说明：`dialog` 组件模块。
 *
 * 职责：
 * - 承载 `dialog` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import {
  blurActiveElement,
  preventRadixCloseAutoFocus,
  useAutoBlurActiveElementOnMount,
  usePreparedRadixModalOpenState,
} from "@/components/ui/radix-auto-blur";
import {
  OVERLAY_MODAL_BACKDROP_LAYER_CLASS,
  OVERLAY_MODAL_CONTENT_LAYER_CLASS,
  OVERLAY_MODAL_STACK_SHELL_CLASS,
} from "@/components/ui/overlay-layers";

/**
 * 内部组件：`Dialog`。
 *
 * @remarks
 * 用于拆分当前文件中的局部界面结构或交互片段，减少主组件体积并收拢视图职责。
 */
const Dialog = ({ open, defaultOpen, onOpenChange, children, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Root>) => {
  const isControlled = open !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(Boolean(defaultOpen));
  const currentOpen = isControlled ? open : uncontrolledOpen;
  const preparedOpen = usePreparedRadixModalOpenState(Boolean(currentOpen));

  const handleOpenChange = React.useCallback((nextOpen: boolean) => {
    if (nextOpen) blurActiveElement();
    if (!isControlled) setUncontrolledOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }, [isControlled, onOpenChange]);

  return (
    <DialogPrimitive.Root
      {...props}
      open={preparedOpen}
      onOpenChange={handleOpenChange}
    >
      {children}
    </DialogPrimitive.Root>
  );
};

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

/**
 * 内部组件：`DialogOverlay`。
 *
 * @remarks
 * 用于拆分当前文件中的局部界面结构或交互片段，减少主组件体积并收拢视图职责。
 */
const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    data-olyq-overlay-shell="modal"
    className={cn(
      "fixed inset-0 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      OVERLAY_MODAL_STACK_SHELL_CLASS,
      className,
    )}
    {...props}
  >
    <div aria-hidden="true" data-olyq-overlay-part="backdrop" className={cn("absolute inset-0", OVERLAY_MODAL_BACKDROP_LAYER_CLASS)} />
    {children}
  </DialogPrimitive.Overlay>
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

/**
 * 内部组件：`DialogContent`。
 *
 * @remarks
 * 用于拆分当前文件中的局部界面结构或交互片段，减少主组件体积并收拢视图职责。
 */
const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  const { t } = useTranslation();
  const contentRef = useAutoBlurActiveElementOnMount(ref);
  const { onCloseAutoFocus, ...contentProps } = props;

  const handleCloseAutoFocus = React.useCallback((event: Event) => {
    onCloseAutoFocus?.(event);
    if (event.defaultPrevented) return;
    preventRadixCloseAutoFocus(event);
  }, [onCloseAutoFocus]);

  return (
    <DialogPortal>
      <DialogOverlay>
        <DialogPrimitive.Content
          ref={contentRef}
          data-olyq-overlay-part="content"
          onCloseAutoFocus={handleCloseAutoFocus}
          className={cn(
            "fixed left-[50%] top-[50%] grid w-[calc(100vw-1.5rem)] max-w-lg max-h-[85vh] overflow-y-auto translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 sm:rounded-lg",
            OVERLAY_MODAL_CONTENT_LAYER_CLASS,
            className,
          )}
          {...contentProps}
        >
          <DialogPrimitive.Description className="sr-only">{t('common.dialogContent')}</DialogPrimitive.Description>
          {children}
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity data-[state=open]:bg-accent data-[state=open]:text-muted-foreground hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
            <X className="h-4 w-4" />
            <span className="sr-only">{t('common.close')}</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogOverlay>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

/**
 * 内部组件：`DialogHeader`。
 *
 * @remarks
 * 用于拆分当前文件中的局部界面结构或交互片段，减少主组件体积并收拢视图职责。
 */
const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

/**
 * 内部组件：`DialogFooter`。
 *
 * @remarks
 * 用于拆分当前文件中的局部界面结构或交互片段，减少主组件体积并收拢视图职责。
 */
const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
);
DialogFooter.displayName = "DialogFooter";

/**
 * 内部组件：`DialogTitle`。
 *
 * @remarks
 * 用于拆分当前文件中的局部界面结构或交互片段，减少主组件体积并收拢视图职责。
 */
const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

/**
 * 内部组件：`DialogDescription`。
 *
 * @remarks
 * 用于拆分当前文件中的局部界面结构或交互片段，减少主组件体积并收拢视图职责。
 */
const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
