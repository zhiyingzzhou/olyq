/**
 * 说明：`dnd-kit-react` 组件模块。
 *
 * 职责：
 * - 为当前聊天侧栏相关拖拽列表提供 dnd-kit React 类型入口；
 * - 补齐 `DragDropProvider` 在当前 TypeScript / React 类型组合下的 JSX children 声明；
 *
 * 边界：
 * - 本文件只调整本地类型声明形状；
 * - 运行时拖拽行为仍完全交给上游 dnd-kit 组件本身。
 */
import { DragDropProvider } from '@dnd-kit/react';
import type { Draggable } from '@dnd-kit/dom';
import type { ReactNode } from 'react';

type DndKitDragDropProviderProps = Parameters<typeof DragDropProvider>[0] & {
  children?: ReactNode;
};

/** 补齐 `children` 声明后的 dnd-kit 拖拽上下文 Provider。 */
export const DndKitDragDropProvider = DragDropProvider as (
  props: DndKitDragDropProviderProps
) => ReturnType<typeof DragDropProvider>;

/** `DragOverlay` render callback 接收到的拖拽源对象类型。 */
export type DndKitDragOverlaySource = Draggable | null;
