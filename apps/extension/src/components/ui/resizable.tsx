/**
 * 说明：`resizable` 组件模块。
 *
 * 职责：
 * - 承载 `resizable` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { GripVertical } from "lucide-react";
import * as ResizablePrimitive from "react-resizable-panels";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

type ResizablePanelGroupProps = Omit<ComponentProps<typeof ResizablePrimitive.Group>, "defaultLayout" | "id" | "onLayoutChanged" | "orientation"> & {
  /** 旧版调用方使用的方向字段；v4 内部改名为 orientation。 */
  direction?: "horizontal" | "vertical";
  /** v4 原生方向字段。 */
  orientation?: "horizontal" | "vertical";
  /** 旧版调用方使用的布局持久化 ID；v4 通过 useDefaultLayout 显式接线。 */
  autoSaveId?: string;
  /** 自动保存布局时使用的稳定面板 ID 列表。 */
  panelIds?: string[];
  /** v4 原生布局持久化 ID。 */
  id?: string | number;
  /** v4 原生默认布局。 */
  defaultLayout?: ResizablePrimitive.Layout;
  /** v4 原生布局保存回调。 */
  onLayoutChanged?: ResizablePrimitive.GroupProps["onLayoutChanged"];
  /** 调用方用于 E2E 和可观测性的稳定 DOM 标识。 */
  "data-testid"?: string;
  /** 仓库内部传给 v4 Group `id` 的稳定测试标识。 */
  testId?: string;
};

/**
 * 解析可伸缩面板组方向。
 *
 * @param direction - 旧版调用方传入的方向字段。
 * @param orientation - v4 原生方向字段。
 * @returns 最终传给 v4 Group 的方向。
 */
function resolveGroupOrientation(direction: ResizablePanelGroupProps["direction"], orientation?: "horizontal" | "vertical") {
  return direction ?? orientation ?? "horizontal";
}

/**
 * 内部组件：`ResizablePanelGroup`。
 *
 * @remarks
 * 用于拆分当前文件中的局部界面结构或交互片段，减少主组件体积并收拢视图职责。
 */
const ResizablePanelGroup = ({ autoSaveId, className, direction, id, panelIds, "data-testid": dataTestId, testId, ...props }: ResizablePanelGroupProps) => {
  if (autoSaveId) {
    return (
      <AutoSavedResizablePanelGroup
        autoSaveId={autoSaveId}
        className={className}
        data-testid={dataTestId}
        direction={direction}
        id={id}
        panelIds={panelIds}
        testId={testId}
        {...props}
      />
    );
  }

  const orientation = resolveGroupOrientation(direction, props.orientation);
  const groupDomId = testId ?? dataTestId ?? (id == null ? undefined : String(id));
  return (
    <ResizablePrimitive.Group
      className={cn("flex h-full w-full", orientation === "vertical" && "flex-col", className)}
      data-testid={groupDomId}
      id={groupDomId}
      orientation={orientation}
      {...props}
    />
  );
};

/**
 * 带布局持久化的 v4 面板组适配器。
 *
 * @param props - 兼容旧版 autoSaveId 的面板组属性。
 * @returns 接好 useDefaultLayout 的 v4 Group。
 */
function AutoSavedResizablePanelGroup({
  autoSaveId,
  className,
  "data-testid": dataTestId,
  direction,
  id,
  panelIds,
  testId,
  defaultLayout,
  onLayoutChanged,
  ...props
}: ResizablePanelGroupProps & { autoSaveId: string }) {
  const persistedLayout = ResizablePrimitive.useDefaultLayout({ id: autoSaveId, panelIds });
  const orientation = resolveGroupOrientation(direction, props.orientation);
  const groupId = String(id ?? autoSaveId);
  const groupDomId = testId ?? dataTestId ?? groupId;

  return (
    <ResizablePrimitive.Group
      className={cn("flex h-full w-full", orientation === "vertical" && "flex-col", className)}
      data-testid={groupDomId}
      defaultLayout={defaultLayout ?? persistedLayout.defaultLayout}
      id={groupDomId}
      onLayoutChanged={(layout: ResizablePrimitive.Layout) => {
        persistedLayout.onLayoutChanged(layout);
        onLayoutChanged?.(layout);
      }}
      orientation={orientation}
      {...props}
    />
  );
}

const ResizablePanel = ResizablePrimitive.Panel;

type ResizableHandleProps = ComponentProps<typeof ResizablePrimitive.Separator> & {
  withHandle?: boolean;
  /** 调用方用于 E2E 和可观测性的稳定 DOM 标识。 */
  "data-testid"?: string;
  /** 仓库内部传给 v4 Separator `id` 的稳定测试标识。 */
  testId?: string;
};

/**
 * 内部组件：`ResizableHandle`。
 *
 * @remarks
 * 用于拆分当前文件中的局部界面结构或交互片段，减少主组件体积并收拢视图职责。
 */
const ResizableHandle = ({
  withHandle,
  className,
  id,
  "data-testid": dataTestId,
  testId,
  ...props
}: ResizableHandleProps) => {
  const handleDomId = testId ?? dataTestId ?? id;
  return (
    <ResizablePrimitive.Separator
      className={cn(
        "relative flex w-px items-center justify-center bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:h-1 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:-translate-y-1/2 aria-[orientation=horizontal]:after:translate-x-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 aria-[orientation=horizontal]:[&>div]:rotate-90",
        className,
      )}
      data-testid={typeof handleDomId === "string" ? handleDomId : undefined}
      id={handleDomId}
      {...props}
    >
      {withHandle && (
        <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-border">
          <GripVertical className="h-2.5 w-2.5" />
        </div>
      )}
    </ResizablePrimitive.Separator>
  );
};

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
