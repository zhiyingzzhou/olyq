/**
 * 说明：`useSynchronizedScrollGroup` Hook 模块。
 *
 * 职责：
 * - 承载横向多模型比较面板内部纵向滚动联动的当前文件实现与模块边界；
 * - 对外暴露按滚动相对进度同步多列 scrollTop 的共享 Hook；
 *
 * 边界：
 * - 本文件只负责同一组正文滚动容器之间的 DOM 级联动；
 * - 不接管主聊天区滚动、stick-to-bottom 或其它布局模式。
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';

/** 单个同步滚动容器的绑定结果。 */
interface SynchronizedScrollBinding {
  /** 绑定到正文滚动容器的 ref。 */
  readonly ref: (node: HTMLDivElement | null) => void;
}

/** active source 在无新滚动和无新尺寸变化后多久释放。 */
const ACTIVE_SOURCE_IDLE_MS = 240;

/**
 * 导出 Hook：`useSynchronizedScrollGroup`。
 *
 * @remarks
 * 只在横向多模型固定比较面板里启用，按“当前列滚动进度”同步其它列，
 * 让长回答和短回答都对齐到各自对应的阅读位置，而不是强行套用同一个像素 delta。
 */
export function useSynchronizedScrollGroup(ids: readonly string[], enabled: boolean) {
  const elementsRef = useRef(new Map<string, HTMLDivElement>());
  const maxScrollTopRef = useRef(new Map<string, number>());
  const pendingZeroOverflowRecheckRef = useRef(new Set<string>());
  const silentScrollTopRef = useRef(new Map<string, number>());
  const listenersRef = useRef(new Map<string, () => void>());
  const bindingsRef = useRef(new Map<string, SynchronizedScrollBinding>());
  const activeSourceRef = useRef<{ id: string; progress: number } | null>(null);
  const resizeSyncFrameRef = useRef<number | null>(null);
  const dirtyResizeIdsRef = useRef(new Set<string>());
  const activeSourceReleaseTimerRef = useRef<number | null>(null);
  const enabledRef = useRef(enabled);
  const idsRef = useRef(ids);
  const idsSignature = ids.join('\u001f');

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    idsRef.current = ids;
  }, [ids]);

  /**
   * 内部函数变量：`clearContainer`。
   *
   * @remarks
   * 统一清理单个 messageId 绑定的原生监听和 DOM 引用；
   * 这里只在列被移除、ref 解绑或组件卸载时调用，避免普通重渲染把联动监听误删掉。
   */
  const clearContainer = useCallback((id: string) => {
    listenersRef.current.get(id)?.();
    listenersRef.current.delete(id);
    elementsRef.current.delete(id);
    maxScrollTopRef.current.delete(id);
    pendingZeroOverflowRecheckRef.current.delete(id);
    silentScrollTopRef.current.delete(id);
    dirtyResizeIdsRef.current.delete(id);
    if (activeSourceRef.current?.id === id) {
      activeSourceRef.current = null;
    }
  }, []);

  /**
   * 内部函数变量：`cancelResizeDrivenSync`。
   *
   * @remarks
   * 尺寸变化联动只在一帧里合并执行一次；卸载或禁用时要把待执行的 flush 清掉，
   * 避免 compare 组已经切走后还有悬空的同步写回。
   */
  const cancelResizeDrivenSync = useCallback(() => {
    if (resizeSyncFrameRef.current == null) return;
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(resizeSyncFrameRef.current);
    else window.clearTimeout(resizeSyncFrameRef.current);
    resizeSyncFrameRef.current = null;
  }, []);

  /**
   * 内部函数变量：`cancelActiveSourceRelease`。
   *
   * @remarks
   * active source 释放采用 idle timer；这里统一回收旧 timer，
   * 避免同一轮持续滚动/流式增高把多个释放任务叠在一起。
   */
  const cancelActiveSourceRelease = useCallback(() => {
    if (activeSourceReleaseTimerRef.current == null) return;
    window.clearTimeout(activeSourceReleaseTimerRef.current);
    activeSourceReleaseTimerRef.current = null;
  }, []);

  useEffect(() => {
    if (enabled) return;
    activeSourceRef.current = null;
    dirtyResizeIdsRef.current.clear();
    silentScrollTopRef.current.clear();
    cancelResizeDrivenSync();
    cancelActiveSourceRelease();
  }, [cancelActiveSourceRelease, cancelResizeDrivenSync, enabled]);

  /**
   * 内部函数变量：`measureMaxScrollTop`。
   *
   * @remarks
   * 把元素当前真实可滚动高度折算成 `maxScrollTop`；
   * 这类布局读统一集中在注册和 `ResizeObserver` 阶段，避免每次 `scroll` 都遍历全组现读。
   */
  const measureMaxScrollTop = useCallback((element: HTMLDivElement) => {
    return Math.max(0, element.scrollHeight - element.clientHeight);
  }, []);

  /**
   * 内部函数变量：`cacheMaxScrollTop`。
   *
   * @remarks
   * 同步更新某一列的缓存可滚动范围；
   * 后续 follower 映射只读取缓存，不再在高频 `scroll` 里逐列现查布局。
   */
  const cacheMaxScrollTop = useCallback((id: string, element: HTMLDivElement) => {
    const next = measureMaxScrollTop(element);
    maxScrollTopRef.current.set(id, next);
    pendingZeroOverflowRecheckRef.current.delete(id);
    return next;
  }, [measureMaxScrollTop]);

  /**
   * 内部函数变量：`readCachedMaxScrollTop`。
   *
   * @remarks
   * 优先读取由注册/尺寸观察维护的缓存范围；
   * 只有缓存缺失时才回退到一次即时测量，避免正常滚动链路反复触发布局读取。
   */
  const readCachedMaxScrollTop = useCallback((id: string, element: HTMLDivElement) => {
    const cached = maxScrollTopRef.current.get(id);
    if (typeof cached === 'number') {
      if (cached > 0) return cached;
      if (!pendingZeroOverflowRecheckRef.current.has(id)) return cached;
    }
    return cacheMaxScrollTop(id, element);
  }, [cacheMaxScrollTop]);

  /**
   * 内部函数变量：`keepActiveSourceAlive`。
   *
   * @remarks
   * 只要用户仍在滚动，或流式内容还在持续改变列高，就短暂保留 active source；
   * 这样 follower 可以沿着同一阅读进度持续跟住，而不是等下一次手势再突兀跳变。
   */
  const keepActiveSourceAlive = useCallback(() => {
    cancelActiveSourceRelease();
    activeSourceReleaseTimerRef.current = window.setTimeout(() => {
      activeSourceRef.current = null;
      activeSourceReleaseTimerRef.current = null;
    }, ACTIVE_SOURCE_IDLE_MS);
  }, [cancelActiveSourceRelease]);

  /**
   * 内部函数变量：`synchronizeByProgress`。
   *
   * @remarks
   * 直接按“阅读进度”同步写回其它列；
   * follower 只消费预先缓存好的 `maxScrollTop`，从根上减少高频 `scroll` handler 里的布局读。
   */
  const synchronizeByProgress = useCallback((sourceId: string, sourceProgress: number) => {
    if (!enabledRef.current) return;
    const clampedProgress = clampProgress(sourceProgress);
    activeSourceRef.current = { id: sourceId, progress: clampedProgress };
    keepActiveSourceAlive();

    for (const [id, element] of elementsRef.current.entries()) {
      if (id === sourceId || !element.isConnected) continue;
      const maxScrollTop = readCachedMaxScrollTop(id, element);
      if (maxScrollTop <= 0) {
        silentScrollTopRef.current.set(id, 0);
        element.scrollTop = 0;
        continue;
      }

      const nextTop = Math.max(0, Math.min(maxScrollTop, clampedProgress * maxScrollTop));
      if (Math.abs(nextTop - element.scrollTop) < 0.5) {
        continue;
      }

      silentScrollTopRef.current.set(id, nextTop);
      element.scrollTop = nextTop;
    }
  }, [keepActiveSourceAlive, readCachedMaxScrollTop]);

  /**
   * 内部函数变量：`flushResizeDrivenSync`。
   *
   * @remarks
   * `ResizeObserver` 会在流式文本、thinking、图片等内容增高时高频触发；
   * 这里把同一帧内的尺寸变化合并成一次 follower 重算，既维持跟随，又不把主线程写回放大成每次 entry 一次。
   */
  const flushResizeDrivenSync = useCallback(() => {
    resizeSyncFrameRef.current = null;
    const dirtyIds = Array.from(dirtyResizeIdsRef.current);
    dirtyResizeIdsRef.current.clear();
    if (!dirtyIds.length || !enabledRef.current) return;

    const activeSource = activeSourceRef.current;
    if (!activeSource) return;

    const sourceElement = elementsRef.current.get(activeSource.id);
    if (!sourceElement || !sourceElement.isConnected) {
      activeSourceRef.current = null;
      return;
    }

    let nextProgress = activeSource.progress;
    if (dirtyIds.includes(activeSource.id)) {
      const sourceMaxScrollTop = readCachedMaxScrollTop(activeSource.id, sourceElement);
      nextProgress = sourceMaxScrollTop <= 0 ? 0 : clampProgress(sourceElement.scrollTop / sourceMaxScrollTop);
    }

    synchronizeByProgress(activeSource.id, nextProgress);
  }, [readCachedMaxScrollTop, synchronizeByProgress]);

  /**
   * 内部函数变量：`scheduleResizeDrivenSync`。
   *
   * @remarks
   * 尺寸驱动的联动不直接在 `ResizeObserver` 回调里 fan-out；
   * 先标记脏列，再合并到下一帧一次性同步，避免多 entry 多列场景下的重复写回。
   */
  const scheduleResizeDrivenSync = useCallback((id: string) => {
    dirtyResizeIdsRef.current.add(id);
    if (resizeSyncFrameRef.current != null) return;
    if (typeof requestAnimationFrame === 'function') {
      resizeSyncFrameRef.current = requestAnimationFrame(flushResizeDrivenSync);
      return;
    }
    resizeSyncFrameRef.current = window.setTimeout(flushResizeDrivenSync, 16);
  }, [flushResizeDrivenSync]);

  useEffect(() => {
    const activeIds = new Set(idsRef.current);
    for (const id of Array.from(bindingsRef.current.keys())) {
      if (activeIds.has(id)) continue;
      clearContainer(id);
      bindingsRef.current.delete(id);
    }
  }, [clearContainer, idsSignature]);

  useEffect(() => {
    const bindings = bindingsRef.current;
    return () => {
      cancelResizeDrivenSync();
      cancelActiveSourceRelease();
      for (const id of Array.from(bindings.keys())) {
        clearContainer(id);
      }
      bindings.clear();
    };
  }, [cancelActiveSourceRelease, cancelResizeDrivenSync, clearContainer]);

  /**
   * 内部函数变量：`handleScroll`。
   *
   * @remarks
   * 只响应真实用户触发的正文滚动；如果当前位置正好等于刚才程序化写回的目标值，
   * 就把它视为静默事件吞掉，避免同组滚动回环。
   */
  const handleScroll = useCallback((id: string, element: HTMLDivElement) => {
    const silentTop = silentScrollTopRef.current.get(id);
    if (typeof silentTop === 'number') {
      if (Math.abs(silentTop - element.scrollTop) < 0.5) {
        silentScrollTopRef.current.delete(id);
        return;
      }
      silentScrollTopRef.current.delete(id);
    }

    const sourceMaxScrollTop = readCachedMaxScrollTop(id, element);
    const sourceProgress = sourceMaxScrollTop <= 0 ? 0 : clampProgress(element.scrollTop / sourceMaxScrollTop);
    synchronizeByProgress(id, sourceProgress);
  }, [readCachedMaxScrollTop, synchronizeByProgress]);

  /**
   * 内部函数变量：`registerContainer`。
   *
   * @remarks
   * 把每张模型卡片正文容器登记到当前同步组中；
   * 滚动监听直接挂到原生 DOM 上，避免 React 事件层给高频联动再加一层额外开销。
   */
  const registerContainer = useCallback((id: string, node: HTMLDivElement | null) => {
    clearContainer(id);

    if (!node) {
      return;
    }

    /**
     * 内部函数变量：`onScroll`。
     *
     * @remarks
     * 原生 `scroll` 监听回调，直接把当前容器的实时滚动位置交给同步器；
     * 这里不再经过 React 事件层，优先降低高频 compare 跟随时的额外开销。
     */
    const onScroll = () => {
      handleScroll(id, node);
    };
    node.addEventListener('scroll', onScroll, { passive: true });
    elementsRef.current.set(id, node);
    const initialMaxScrollTop = measureMaxScrollTop(node);
    maxScrollTopRef.current.set(id, initialMaxScrollTop);
    if (initialMaxScrollTop <= 0) pendingZeroOverflowRecheckRef.current.add(id);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      /**
       * 内部函数变量：`onResize`。
       *
       * @remarks
       * 列高变化统一在这里更新缓存，并把同帧内的 follower 重算合并起来；
       * 这样流式 chunk 再密集，也不会回到“每次 scroll 现读整组高度”的旧模式。
       */
      const onResize = () => {
        cacheMaxScrollTop(id, node);
        if (!activeSourceRef.current) return;
        scheduleResizeDrivenSync(id);
      };
      resizeObserver = new ResizeObserver(onResize);
      resizeObserver.observe(node);
    }

    listenersRef.current.set(id, () => {
      node.removeEventListener('scroll', onScroll);
      resizeObserver?.disconnect();
    });

    const activeSource = activeSourceRef.current;
    if (!activeSource) return;

    const nextProgress = activeSource.id === id
      ? (() => {
        const maxScrollTop = readCachedMaxScrollTop(id, node);
        return maxScrollTop <= 0 ? 0 : clampProgress(node.scrollTop / maxScrollTop);
      })()
      : activeSource.progress;

    synchronizeByProgress(activeSource.id === id ? id : activeSource.id, nextProgress);
  }, [cacheMaxScrollTop, clearContainer, handleScroll, measureMaxScrollTop, readCachedMaxScrollTop, scheduleResizeDrivenSync, synchronizeByProgress]);

  /**
   * 内部函数变量：`getBinding`。
   *
   * @remarks
   * 给某个 messageId 生成稳定的 ref 绑定，供 `ModelCard` 正文滚动区直接登记到同步组；
   * 绑定对象会按 messageId 缓存，避免流式重渲染时每帧都因为 ref identity 改变而拆装监听。
   */
  const getBinding = useCallback((id: string): SynchronizedScrollBinding => {
    const existing = bindingsRef.current.get(id);
    if (existing) return existing;

    const binding: SynchronizedScrollBinding = {
      ref: (node) => registerContainer(id, node),
    };
    bindingsRef.current.set(id, binding);
    return binding;
  }, [registerContainer]);

  return useMemo(() => ({ getBinding }), [getBinding]);
}

/**
 * 内部函数：`clampProgress`。
 *
 * @remarks
 * 把阅读进度限制在合法区间内，避免尺寸变化或浮点误差把 follower 推出可滚动范围。
 */
function clampProgress(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
