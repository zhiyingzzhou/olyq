/**
 * 说明：`radix-auto-blur` 组件模块。
 *
 * 职责：
 * - 承载 `radix-auto-blur` 相关的当前文件实现与模块边界；
 * - 对外暴露 `blurActiveElementOutside`、`blurActiveElement`、`preventRadixCloseAutoFocus` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import * as React from 'react';

/**
 * 说明：Radix Dialog/Sheet/AlertDialog 打开时会把“当前层之外”的内容标记为 aria-hidden。
 * 如果打开瞬间焦点仍停留在将被隐藏的旧层（包括 root 内元素，或下层 Dialog/Sheet 自身），
 * Chromium 会阻止本次 aria-hidden，并输出：
 * "Blocked aria-hidden on an element because its descendant retained focus."
 *
 * 这里在新层内容节点挂载的最早时机（ref attach）主动 blur 旧焦点，
 * 既覆盖普通场景（焦点在 root 内），也覆盖嵌套弹窗场景（焦点在下层 Dialog 内）。
 */
export function blurActiveElementOutside(container: HTMLElement | null) {
  try {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return;
    if (active === document.body || active === document.documentElement) return;
    if (container?.contains(active)) return;
    if (typeof active.blur === 'function') active.blur();
  } catch {
    // 忽略：焦点读取/切换失败时不影响主流程
  }
}

/**
 * 导出函数：`blurActiveElement`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function blurActiveElement() {
  blurActiveElementOutside(null);
}

type AutoFocusEventLike = {
  defaultPrevented?: boolean;
  preventDefault: () => void;
};

/**
 * 说明：Radix 关闭 Dialog/AlertDialog/Sheet 时默认会把焦点还给“之前的元素”。
 * 在 sidepanel 这种 root 会被临时 aria-hidden 的场景里，若旧焦点仍落回 root 内，
 * Chromium 会报 “Blocked aria-hidden...” 警告。
 *
 * 这里统一阻止默认的 close autofocus，并把当前焦点清掉，让关闭过程先完成。
 * 若业务方有自定义恢复焦点逻辑，可以先在自己的 handler 中 `preventDefault()` 后自行处理。
 */
export function preventRadixCloseAutoFocus(event: AutoFocusEventLike) {
  if (!event.defaultPrevented) event.preventDefault();
  blurActiveElement();
}

/**
 * 内部函数：`assignRef`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function assignRef<T>(ref: React.ForwardedRef<T>, value: T | null) {
  if (typeof ref === 'function') {
    ref(value);
    return;
  }
  if (ref) {
    ref.current = value;
  }
}

/**
 * 导出 Hook：`useAutoBlurActiveElementOnMount`。
 *
 * @remarks
 * 对外暴露可复用的状态、派生值或副作用封装，调用方应遵守 Hook 调用约束。
 */
export function useAutoBlurActiveElementOnMount<T extends HTMLElement>(forwardedRef: React.ForwardedRef<T>) {
  const localRef = React.useRef<T | null>(null);

  const composedRef = React.useCallback((node: T | null) => {
    localRef.current = node;
    assignRef(forwardedRef, node);
    if (node) blurActiveElementOutside(node);
  }, [forwardedRef]);

  React.useLayoutEffect(() => {
    blurActiveElementOutside(localRef.current);
  }, []);

  return composedRef;
}

/**
 * 导出 Hook：`useAutoBlurActiveElementOnOpen`。
 *
 * @remarks
 * 对外暴露可复用的状态、派生值或副作用封装，调用方应遵守 Hook 调用约束。
 */
export function useAutoBlurActiveElementOnOpen(open: boolean) {
  const wasOpenRef = React.useRef(false);

  React.useLayoutEffect(() => {
    if (open && !wasOpenRef.current) blurActiveElement();
    wasOpenRef.current = open;
  }, [open]);
}

/**
 * 导出 Hook：`usePreparedRadixModalOpenState`。
 *
 * @remarks
 * 把“业务方请求打开 modal 类 Radix 浮层”和“真正把 open 交给 Radix”拆成两拍：
 * 1. 先在当前 commit 结束前清掉旧焦点；
 * 2. 下一拍再让 Radix 挂载会触发 `hideOthers` 的内容。
 *
 * 这样即使业务方是从外部直接把 `open` 设为 `true`，也不会在旧焦点仍留在 `#root`
 * 时就让 Radix 开始设置 `aria-hidden`。
 */
export function usePreparedRadixModalOpenState(open: boolean) {
  const [armedOpen, setArmedOpen] = React.useState(false);

  React.useLayoutEffect(() => {
    if (!open) {
      if (armedOpen) setArmedOpen(false);
      return;
    }

    if (armedOpen) return;

    blurActiveElement();
    setArmedOpen(true);
  }, [armedOpen, open]);

  return open && armedOpen;
}
