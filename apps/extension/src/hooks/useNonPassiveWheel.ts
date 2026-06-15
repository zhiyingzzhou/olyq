/**
 * 说明：`useNonPassiveWheel` Hook 模块。
 *
 * 职责：
 * - 承载 `useNonPassiveWheel` 相关的当前文件实现与模块边界；
 * - 对外暴露共享 non-passive wheel 绑定能力，供需要显式 `preventDefault()` 的交互复用；
 *
 * 边界：
 * - 本文件只负责原生 `wheel` 监听绑定，不扩散具体的滚动或缩放业务规则。
 */
import { useEffect, useRef, type RefObject } from 'react';

/** `useNonPassiveWheel` 的入参。 */
interface UseNonPassiveWheelOptions<TElement extends HTMLElement> {
  /** 需要绑定原生 wheel 监听的目标元素。 */
  readonly targetRef: RefObject<TElement | null>;
  /** 是否启用监听。 */
  readonly enabled?: boolean;
  /** 原生 wheel 事件处理器。 */
  readonly onWheel: (event: WheelEvent) => void;
}

/**
 * 导出 Hook：`useNonPassiveWheel`。
 *
 * @remarks
 * React 的 `onWheel` 在现代浏览器里可能被注册成 passive listener；
 * 只要业务需要稳定地 `preventDefault()`，就统一走这里的原生 `{ passive: false }` 绑定。
 */
export function useNonPassiveWheel<TElement extends HTMLElement>({
  targetRef,
  enabled = true,
  onWheel,
}: UseNonPassiveWheelOptions<TElement>) {
  const latestHandlerRef = useRef(onWheel);
  latestHandlerRef.current = onWheel;

  useEffect(() => {
    const element = targetRef.current;
    if (!enabled || !element) return;

    /**
     * 内部函数变量：`listener`。
     *
     * @remarks
     * 原生 listener 只负责把稳定的 DOM 事件转发给最新的业务回调；
     * 通过 ref 间接调用，避免每次渲染都重新绑定 `{ passive: false }` 监听器。
     */
    const listener = (event: WheelEvent) => {
      latestHandlerRef.current(event);
    };

    element.addEventListener('wheel', listener, { passive: false });
    return () => {
      element.removeEventListener('wheel', listener);
    };
  }, [enabled, targetRef]);
}
