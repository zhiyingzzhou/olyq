/**
 * 说明：`useToast` Hook 模块。
 *
 * 职责：
 * - 承载 `useToast` 相关的当前文件实现与模块边界；
 * - 对外暴露 `UseToastStore`、`useToast`、`ToastController` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import * as React from "react";
import { createWithEqualityFn } from "zustand/traditional";
import { subscribeWithSelector } from "zustand/middleware";
import type { ToastActionElement, ToastProps } from "@/components/ui/toast";
import { createId } from "@/lib/utils/id";

/**
 * useToast：全局 Toast 状态 + 命令式触发入口。
 *
 * 设计要点：
 * - 状态使用 zustand 存储，避免在组件树层层透传；
 * - `toast()` 是命令式 API：无需订阅即可触发/更新/关闭；
 * - 默认仅保留最近 1 条（`TOAST_LIMIT`），适配扩展弹窗/侧边栏的窄视口，避免堆叠遮挡；
 * - “延时移除”用于配合关闭动画：先置 `open=false`，再在超时后从列表移除。
 */

const TOAST_LIMIT = 1;
const TOAST_REMOVE_DELAY = 1000000;

/** 单条 Toast 记录。 */
type ToasterToast = ToastProps & {
  /** toast 的内部唯一 ID（用于更新/关闭/移除） */
  id: string;
  /** 可选：标题（支持 ReactNode） */
  title?: React.ReactNode;
  /** 可选：描述文本（支持 ReactNode） */
  description?: React.ReactNode;
  /** 可选：操作按钮（例如"撤销"） */
  action?: ToastActionElement;
};

/** useToast 的状态结构 */
interface ToastState {
  /** 当前正在展示/排队的 toast 列表（按时间倒序） */
  toasts: ToasterToast[];
}

/** useToast 的动作集合（用于新增/更新/关闭/移除 toast） */
interface ToastActions {
  /** 新增 toast */
  addToast: (toast: ToasterToast) => void;
  /** 更新 toast（按 id 匹配目标 toast） */
  updateToast: (toast: Partial<ToasterToast>) => void;
  /** 关闭 toast（触发 open=false，并进入延时移除队列） */
  dismissToast: (toastId?: ToasterToast["id"]) => void;
  /** 移除 toast（从列表中删除） */
  removeToast: (toastId?: ToasterToast["id"]) => void;
}

/** Toast zustand store 的完整状态与动作集合。 */
type ToastStore = ToastState & ToastActions;

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * 把指定 toast 放入延时移除队列。
 *
 * 说明：
 * - 队列的职责是等待关闭动画结束后再真正从列表删除；
 * - 同一个 toast 只允许排队一次，避免重复创建 timeout。
 */
function addToRemoveQueue(toastId: string) {
  if (toastTimeouts.has(toastId)) return;

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId);
    useToast.getState().removeToast(toastId);
  }, TOAST_REMOVE_DELAY);

  toastTimeouts.set(toastId, timeout);
}

const toastStore = createWithEqualityFn<ToastStore>()(
  subscribeWithSelector((set, get) => ({
    toasts: [],

    addToast: (toast) => {
      set((state) => ({
        toasts: [toast, ...state.toasts].slice(0, TOAST_LIMIT),
      }));
    },

    updateToast: (toast) => {
      set((state) => ({
        toasts: state.toasts.map((t) => (t.id === toast.id ? { ...t, ...toast } : t)),
      }));
    },

    dismissToast: (toastId) => {
      const { toasts } = get();

      if (toastId) {
        addToRemoveQueue(toastId);
      } else {
        toasts.forEach((toast) => addToRemoveQueue(toast.id));
      }

      set((state) => ({
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? { ...t, open: false }
            : t,
        ),
      }));
    },

    removeToast: (toastId) => {
      set((state) => ({
        toasts: toastId === undefined
          ? []
          : state.toasts.filter((t) => t.id !== toastId),
      }));
    },
  })),
);

/** 暴露给命令式 `toast()` 和非 React 场景复用的 store API 子集。 */
type ToastStoreApi = Pick<typeof toastStore, 'getState' | 'setState' | 'subscribe' | 'getInitialState'>;

/**
 * 说明：useToast 的安全导出类型：
 * - 强制传 selector，避免误用 `useToast()` 订阅整个 state
 * - `toast()` 建议作为触发入口（无需订阅）
 */
export type UseToastStore = {
  /** 订阅 store 中的某个切片（selector） */
  <T>(selector: (state: ToastStore) => T, equalityFn?: (a: T, b: T) => boolean): T;
} & ToastStoreApi;

/**
 * 导出 Hook：`useToast`。
 *
 * @remarks
 * 对外暴露可复用的状态、派生值或副作用封装，调用方应遵守 Hook 调用约束。
 */
// 通过类型断言收紧调用签名（运行时仍是同一个 zustand hook）
export const useToast: UseToastStore = toastStore;

/** `toast()` 接收的输入参数。 */
type Toast = Omit<ToasterToast, "id">;

/** `toast()` 返回的控制句柄。 */
export interface ToastController {
  /** 新创建的 toast ID。 */
  id: string;
  /** 主动关闭当前 toast。 */
  dismiss: () => void;
  /** 用相同 ID 更新 toast 内容。 */
  update: (next: ToasterToast) => void;
}

/**
 * 触发一次 toast，并返回可用于 update/dismiss 的句柄。
 *
 * 说明：
 * - `toast()` 是“命令式入口”，不需要订阅 `useToast`；
 * - 返回的 `update()` 会覆盖同一个 id 的 toast 内容，适合做进度更新。
 */
export function toast({ ...props }: Toast): ToastController {
  const id = createId();

  /** 用同一 ID 更新现有 toast，适合进度或状态回写。 */
  const update = (next: ToasterToast) => useToast.getState().updateToast({ ...next, id });
  /** 关闭当前 toast，并触发延迟移除队列。 */
  const dismiss = () => useToast.getState().dismissToast(id);

  useToast.getState().addToast({
    ...props,
    id,
    open: true,
    onOpenChange: (open) => {
      if (!open) dismiss();
    },
  });

  return {
    id,
    dismiss,
    update,
  };
}

/**
 * 提供自有 toast API 的便捷方法，统一全项目 toast 调用风格。
 * 用法：toast.success("已保存") / toast.error("失败") / toast.info("提示")
 */
toast.success = (message: string) => toast({ title: message });
toast.error = (message: string) => toast({ title: message, variant: 'destructive' });
toast.info = (message: string) => toast({ title: message });
