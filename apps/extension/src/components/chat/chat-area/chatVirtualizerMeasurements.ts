/**
 * 说明：`chatVirtualizerMeasurements` 主聊天虚拟列表测量模块。
 *
 * 职责：
 * - 承担当前已挂载虚拟行的补测、整表重测与 viewport 几何同步；
 * - 避免 `useChatAreaVirtualizer.ts` 同时承担 TanStack Virtual 装配与 DOM 几何读写细节。
 *
 * 边界：
 * - 本文件只处理测量与尺寸同步；
 * - 不持有滚动 session、导航或业务阅读状态。
 */
import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from "react";
import type { Virtualizer } from "@tanstack/react-virtual";

interface ChatViewportSize {
  readonly width: number;
  readonly height: number;
}

/**
 * 导出类型：主聊天测量层在运行期暴露的稳定能力。
 *
 * @remarks
 * 外层虚拟滚动门面只消费这一个测量 runtime，避免把 DOM 补测逻辑重新散落回主 hook。
 */
export interface ChatVirtualizerMeasurementRuntime {
  readonly lastViewportSizeRef: MutableRefObject<ChatViewportSize | null>;
  readonly measureElement: (node: HTMLDivElement | null) => void;
  readonly measureMountedRows: () => void;
  readonly measureMountedRowsOnly: () => void;
  readonly mountedRowsMeasureFrameRef: MutableRefObject<number | null>;
  readonly resetAndMeasureRows: () => void;
  readonly syncViewportMetrics: () => boolean;
}

interface UseChatVirtualizerMeasurementRuntimeParams {
  readonly onRowsMeasured?: () => void;
  readonly rowVirtualizer: Virtualizer<HTMLDivElement, Element>;
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  readonly setMessageViewportHeight: Dispatch<SetStateAction<number | null>>;
}

/**
 * 导出 Hook：`useChatVirtualizerMeasurementRuntime`。
 *
 * @remarks
 * 为主聊天虚拟滚动提供统一的“补测 + viewport 尺寸同步”门面。
 */
export function useChatVirtualizerMeasurementRuntime({
  onRowsMeasured,
  rowVirtualizer,
  scrollRef,
  setMessageViewportHeight,
}: UseChatVirtualizerMeasurementRuntimeParams): ChatVirtualizerMeasurementRuntime {
  const lastViewportSizeRef = useRef<ChatViewportSize | null>(null);
  const mountedRowsMeasureFrameRef = useRef<number | null>(null);
  const observedRowElementsRef = useRef<Set<HTMLElement>>(new Set());
  const rowResizeObserverRef = useRef<ResizeObserver | null>(null);
  const onRowsMeasuredRef = useRef(onRowsMeasured);
  onRowsMeasuredRef.current = onRowsMeasured;

  /**
   * TanStack Virtual 会负责尺寸缓存和必要的 offset 修正；这里额外观察已挂载行，
   * 只用于把“真实 DOM 行高变了”这件事通知外层几何同步，不直接写 scrollTop。
   */
  const getRowResizeObserver = useCallback(() => {
    if (typeof ResizeObserver === "undefined") return null;
    if (!rowResizeObserverRef.current) {
      rowResizeObserverRef.current = new ResizeObserver((entries) => {
        let hasConnectedMeasuredRow = false;
        const observer = rowResizeObserverRef.current;
        entries.forEach((entry) => {
          const target = entry.target;
          if (!(target instanceof HTMLElement)) return;
          if (!target.isConnected) {
            observer?.unobserve(target);
            observedRowElementsRef.current.delete(target);
            return;
          }
          hasConnectedMeasuredRow = true;
        });
        if (hasConnectedMeasuredRow) {
          onRowsMeasuredRef.current?.();
        }
      });
    }
    return rowResizeObserverRef.current;
  }, []);

  const observeMeasuredRow = useCallback((node: HTMLElement) => {
    const observer = getRowResizeObserver();
    if (!observer || observedRowElementsRef.current.has(node)) return;
    observer.observe(node);
    observedRowElementsRef.current.add(node);
  }, [getRowResizeObserver]);

  const pruneObservedRows = useCallback((mountedNodes?: ReadonlySet<HTMLElement>) => {
    const observer = rowResizeObserverRef.current;
    observedRowElementsRef.current.forEach((node) => {
      if (node.isConnected && (!mountedNodes || mountedNodes.has(node))) return;
      observer?.unobserve(node);
      observedRowElementsRef.current.delete(node);
    });
  }, []);

  /**
   * 重新测量当前已挂载的可见行。
   *
   * @remarks
   * TanStack `measure()` 只会清空缓存，不会主动把当前 DOM 再量一遍；
   * startup restore / foreground / resize 后必须把已挂载节点立即重新量回去。
   */
  const measureMountedRows = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;

    const nodes = element.querySelectorAll<HTMLElement>("[data-index]");
    pruneObservedRows(new Set(nodes));
    nodes.forEach((node) => {
      observeMeasuredRow(node);
      rowVirtualizer.measureElement(node);
    });
    onRowsMeasured?.();
  }, [observeMeasuredRow, onRowsMeasured, pruneObservedRows, rowVirtualizer, scrollRef]);

  /**
   * 下一帧补测当前挂载行。
   *
   * @remarks
   * 节点首次挂载后再补一帧，能把字体 ready / markdown 展开后的真实高度回灌到 virtualizer。
   */
  const scheduleMountedRowsMeasure = useCallback(() => {
    if (mountedRowsMeasureFrameRef.current != null) {
      cancelAnimationFrame(mountedRowsMeasureFrameRef.current);
    }
    mountedRowsMeasureFrameRef.current = requestAnimationFrame(() => {
      mountedRowsMeasureFrameRef.current = null;
      measureMountedRows();
    });
  }, [measureMountedRows]);

  /**
   * 统一重测入口。
   *
   * @remarks
   * 先清 virtualizer 缓存，再立刻重测当前挂载节点，并在下一帧补测一次。
   */
  const resetAndMeasureRows = useCallback(() => {
    if (typeof rowVirtualizer.measure === "function") {
      rowVirtualizer.measure();
    }
    measureMountedRows();
    scheduleMountedRowsMeasure();
  }, [measureMountedRows, rowVirtualizer, scheduleMountedRowsMeasure]);

  /**
   * 非破坏性地补测当前已挂载行。
   *
   * @remarks
   * 前台恢复但 viewport 尺寸未变时不能调用 `rowVirtualizer.measure()`，
   * 否则 TanStack Virtual 会清空所有已测尺寸缓存，未挂载的长消息会回退估高并把阅读位置向下漂移。
   */
  const measureMountedRowsOnly = useCallback(() => {
    measureMountedRows();
    scheduleMountedRowsMeasure();
  }, [measureMountedRows, scheduleMountedRowsMeasure]);

  /**
   * 给每个虚拟行提供稳定的测量 ref。
   *
   * @remarks
   * 节点首次挂载时先立即测一轮，再合并到下一帧补测，确保当前可见节点高度稳定回灌。
   */
  const measureElement = useCallback((node: HTMLDivElement | null) => {
    rowVirtualizer.measureElement(node);
    if (!node) return;
    observeMeasuredRow(node);
    scheduleMountedRowsMeasure();
    onRowsMeasured?.();
  }, [observeMeasuredRow, onRowsMeasured, rowVirtualizer, scheduleMountedRowsMeasure]);

  /**
   * 同步当前 viewport 几何尺寸，并返回尺寸是否真的发生变化。
   *
   * @remarks
   * 外层 resize / foreground 生命周期只认这一份判断结果，不再各自重复比较宽高。
   */
  const syncViewportMetrics = useCallback(() => {
    const element = scrollRef.current;
    const nextWidth = element?.clientWidth ?? 0;
    const nextHeight = element?.clientHeight ?? 0;

    setMessageViewportHeight((current) => {
      if (nextHeight <= 0) return current;
      return current === nextHeight ? current : nextHeight;
    });

    if (!element || nextWidth <= 0 || nextHeight <= 0) return false;

    const previous = lastViewportSizeRef.current;
    const sizeChanged = !previous || previous.width !== nextWidth || previous.height !== nextHeight;
    lastViewportSizeRef.current = { width: nextWidth, height: nextHeight };
    return sizeChanged;
  }, [scrollRef, setMessageViewportHeight]);

  useEffect(() => () => {
    rowResizeObserverRef.current?.disconnect();
    rowResizeObserverRef.current = null;
    observedRowElementsRef.current.clear();
  }, []);

  return {
    lastViewportSizeRef,
    measureElement,
    measureMountedRows,
    measureMountedRowsOnly,
    mountedRowsMeasureFrameRef,
    resetAndMeasureRows,
    syncViewportMetrics,
  };
}
