/**
 * 说明：`MediaPreviewOverlay` 组件模块。
 *
 * 职责：
 * - 承载 `MediaPreviewOverlay` 相关的当前文件实现与模块边界；
 * - 对外暴露 `MediaPreviewOverlayProps`、`MediaPreviewOverlay` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { Minus, Plus, RotateCcw, RotateCw, Scan } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { DismissableLayerBranch } from '@radix-ui/react-dismissable-layer';

import { TooltipAction } from '@/components/ui/tooltip-action';
import { OVERLAY_MODAL_PREVIEW_SHELL_CLASS } from '@/components/ui/overlay-layers';
import { useNonPassiveWheel } from '@/hooks/useNonPassiveWheel';
import { clamp } from '@/lib/utils/math';

/** 预览翻页信息。 */
interface Pagination {
  /** 当前展示项的 1-based 序号。 */
  readonly index: number;
  /** 预览集合总数。 */
  readonly total: number;
}

/** 预览内容在视口中的平移偏移量。 */
interface PreviewOffset {
  /** 水平方向位移，单位为像素。 */
  readonly x: number;
  /** 垂直方向位移，单位为像素。 */
  readonly y: number;
}

/** 指针拖拽进行中的上下文。 */
interface DragState {
  /** 当前持有 pointer capture 的指针 ID。 */
  readonly pointerId: number;
  /** 拖拽开始时的指针 X 坐标。 */
  readonly startX: number;
  /** 拖拽开始时的指针 Y 坐标。 */
  readonly startY: number;
  /** 拖拽开始前内容的原始 X 偏移。 */
  readonly originX: number;
  /** 拖拽开始前内容的原始 Y 偏移。 */
  readonly originY: number;
}

/** 媒体预览遮罩层组件入参。 */
export type MediaPreviewOverlayProps = {
  /** 是否展示预览遮罩层。关闭时直接返回 `null`，不在 DOM 中保留节点。 */
  readonly open: boolean;
  /** 关闭预览的统一出口，会被遮罩点击、Esc 和外部控制共用。 */
  readonly onClose: () => void;
  /** 预览对话框的无障碍名称，会映射到 `aria-label`。 */
  readonly ariaLabel: string;
  /** 可选分页信息；当总数小于等于 1 时界面会自动隐藏分页提示。 */
  readonly pagination?: Pagination;
  /** 需要被预览的媒体内容，如图片、Mermaid SVG 或任意可缩放节点。 */
  readonly children: ReactNode;
};

/**
 * 通用"媒体预览"遮罩层（图片 / Mermaid 图表共用）
 *
 * 设计目标（对齐 当前应用的预览体验）：
 * - Portal 到 document.body，避免 react-markdown 的 DOM nesting 警告
 * - 底部操作栏：缩放 - / +、重置（适应窗口）、旋转 ↺ / ↻
 * - 鼠标滚轮缩放、拖拽平移（缩放后更容易查看细节）
 * - Esc 关闭、点击遮罩关闭（内容/工具条点击不关闭）
 */
export function MediaPreviewOverlay({ open, onClose, ariaLabel, pagination, children }: MediaPreviewOverlayProps) {
  const { t } = useTranslation();

  /** 当前缩放倍数。`1` 代表初始适配视图。 */
  const [scale, setScale] = useState(1);
  /** 当前旋转角度，单位为度。 */
  const [rotation, setRotation] = useState(0);
  /** 当前平移偏移量，用于拖拽查看放大内容。 */
  const [offset, setOffset] = useState<PreviewOffset>({ x: 0, y: 0 });
  /** 是否正处于 pointer 拖拽中，用于切换光标样式。 */
  const [dragging, setDragging] = useState(false);
  /** 内容是否天然超出视口。即便未缩放，只要溢出也允许平移。 */
  const [contentOverflowing, setContentOverflowing] = useState(false);

  /** 当前活动拖拽上下文，不触发重渲染，只保存指针起点和原偏移。 */
  const dragRef = useRef<DragState | null>(null);
  /** 视口容器，用于测量可用预览空间。 */
  const viewportRef = useRef<HTMLDivElement | null>(null);
  /** 实际媒体内容容器，用于检测内容尺寸是否超出视口。 */
  const contentInnerRef = useRef<HTMLDivElement | null>(null);
  /** 预览内容壳体，用于绑定 non-passive wheel 缩放。 */
  const wheelSurfaceRef = useRef<HTMLDivElement | null>(null);

  /** 是否应该显示分页文案。 */
  const hasPager = Boolean(pagination && pagination.total > 1);
  /** 经过边界校正后的分页文案。 */
  const pagerLabel = useMemo(() => {
    if (!pagination) return '';
    const total = Math.max(0, Math.floor(pagination.total));
    const idx = clamp(Math.floor(pagination.index), 1, Math.max(1, total));
    return total > 1 ? `${idx} / ${total}` : '';
  }, [pagination]);

  // 仅在"缩放后/旋转后/内容本身超出视口"允许拖拽平移，避免正常查看时误触导致内容飘走。
  const canPan = scale > 1.01 || (Math.abs(rotation) % 360) !== 0 || contentOverflowing;

  /**
   * 重置预览视图到初始状态。
   *
   * 会同时清空缩放、旋转和平移偏移，供首次打开和“适应窗口”按钮复用。
   */
  const resetView = () => {
    setScale(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  };

  /**
   * 按步进增减缩放倍数。
   *
   * @param delta - 相对缩放增量，正数放大，负数缩小。
   */
  const zoomBy = (delta: number) => {
    setScale((prev) => clamp(Number(prev) + delta, 0.2, 6));
  };

  /**
   * 按固定角度旋转媒体内容。
   *
   * @param deg - 旋转角度增量，顺时针为正，逆时针为负。
   */
  const rotateBy = (deg: number) => {
    setRotation((prev) => {
      const next = (Number(prev) + deg) % 360;
      return Number.isFinite(next) ? next : 0;
    });
  };

  // 打开时重置视图，避免上一次的缩放/旋转"残留"。
  useEffect(() => {
    if (!open) return;
    resetView();
  }, [open]);

  // 检测内容是否"天然就超出视口"（例如超大的 Mermaid 图），从而在 scale=1 时也允许拖拽平移。
  useEffect(() => {
    if (!open) return;
    const viewportEl = viewportRef.current;
    const innerEl = contentInnerRef.current;
    if (!viewportEl || !innerEl) return;

    /** 测量视口与内容尺寸，判断内容是否天然超出预览区域。 */
    const compute = () => {
      try {
        const vp = viewportEl.getBoundingClientRect();
        const inner = innerEl.getBoundingClientRect();
        const cs = window.getComputedStyle(viewportEl);
        const padL = Number.parseFloat(cs.paddingLeft || '0') || 0;
        const padR = Number.parseFloat(cs.paddingRight || '0') || 0;
        const padT = Number.parseFloat(cs.paddingTop || '0') || 0;
        const padB = Number.parseFloat(cs.paddingBottom || '0') || 0;
        const innerW = Math.max(0, vp.width - padL - padR);
        const innerH = Math.max(0, vp.height - padT - padB);
        setContentOverflowing(inner.width > innerW + 1 || inner.height > innerH + 1);
      } catch {
        setContentOverflowing(false);
      }
    };

    compute();

    // 用 ResizeObserver 监听内容与视口变化：图片加载后尺寸变化、Mermaid render 后尺寸变化都能覆盖到。
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => compute());
    ro.observe(viewportEl);
    ro.observe(innerEl);
    return () => ro.disconnect();
  }, [open]);

  // 打开预览时锁定页面滚动（避免滚轮/触控板把底层聊天列表滚走）。
  useEffect(() => {
    if (!open) return;
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, [open]);

  // 按 Esc 关闭：默认。
  useEffect(() => {
    if (!open) return;
    /** 监听 Esc 关闭预览，避免用户必须移动鼠标点遮罩。 */
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, open]);

  // 关闭时清理拖拽状态，避免 pointer capture 残留。
  useEffect(() => {
    if (open) return;
    dragRef.current = null;
    setDragging(false);
  }, [open]);

  useNonPassiveWheel({
    targetRef: wheelSurfaceRef,
    enabled: open,
    onWheel: (event) => {
      const dy = Number.isFinite(event.deltaY) ? event.deltaY : 0;
      if (!dy) return;
      event.preventDefault();
      zoomBy(dy > 0 ? -0.2 : 0.2);
    },
  });

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    /*
     * 把预览层标记为 Radix DismissableLayer 的 branch。
     *
     * 这样当它被渲染在其他 Dialog 之上时，父级 Dialog 不会把对预览层的点击
     * 误判成 outside interaction，从而做到：
     * - 点击遮罩只关闭预览，不会顺手把父弹窗关掉；
     * - 预览内部按钮/拖拽交互保持可用。
     */
    <DismissableLayerBranch className="pointer-events-auto">
      <div
        className={`${OVERLAY_MODAL_PREVIEW_SHELL_CLASS} pointer-events-auto bg-black/80 backdrop-blur-sm cursor-zoom-out`}
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        data-olyq-overlay-shell="modal"
        data-media-preview-root="true"
        data-testid="media-preview-overlay"
      >
      <div aria-hidden="true" data-olyq-overlay-part="backdrop" className="absolute inset-0 z-0" />
      {/* 主预览区域：留出底部操作栏空间，避免底栏遮住媒体内容。 */}
      <div ref={viewportRef} className="absolute inset-0 z-10 flex items-center justify-center p-6 pb-24">
        <div
          ref={wheelSurfaceRef}
          className="relative max-w-[92vw] max-h-[92vh] overflow-visible rounded-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className={[
              'flex items-center justify-center select-none',
              // 拖拽平移：仅在缩放/旋转后启用，避免正常查看误触
              canPan ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default',
              // 兼容 iOS/触控板：禁用默认手势，避免与浏览器回退/缩放冲突
              'touch-none',
            ].join(' ')}
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale}) rotate(${rotation}deg)`,
              transformOrigin: 'center',
              willChange: 'transform',
            }}
            onPointerDown={(e) => {
              if (!canPan) return;
              if (e.button !== 0) return;
              // 绑定 pointer capture，保证拖出元素后仍能收到移动与抬起事件。
              try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* 忽略 */ }
              dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, originX: offset.x, originY: offset.y };
              setDragging(true);
            }}
            onPointerMove={(e) => {
              const d = dragRef.current;
              if (!d || d.pointerId !== e.pointerId) return;
              const dx = e.clientX - d.startX;
              const dy = e.clientY - d.startY;
              setOffset({ x: d.originX + dx, y: d.originY + dy });
            }}
            onPointerUp={(e) => {
              const d = dragRef.current;
              if (!d || d.pointerId !== e.pointerId) return;
              dragRef.current = null;
              setDragging(false);
              try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* 忽略 */ }
            }}
            onPointerCancel={() => {
              dragRef.current = null;
              setDragging(false);
            }}
          >
            <div ref={contentInnerRef} className="pointer-events-auto">
              {children}
            </div>
          </div>
        </div>
      </div>

      {/* 分页指示：仅在 total > 1 时展示。 */}
      {hasPager ? (
        <div className="absolute bottom-20 left-1/2 z-10 -translate-x-1/2 text-sm text-white/80 select-none">
          {pagerLabel}
        </div>
      ) : null}

      {/* 底部操作栏：缩放、重置与旋转统一入口。 */}
      <div
        className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 flex items-center gap-1 rounded-full border border-white/10 bg-black/40 backdrop-blur px-2 py-2"
        onClick={(e) => e.stopPropagation()}
        role="toolbar"
        aria-label={t('markdown.viewer.toolbar')}
      >
        <TooltipAction tooltip={t('markdown.viewer.zoomOut')}>
          <button
            type="button"
            className="h-10 w-10 rounded-full text-white/90 hover:bg-white/10 active:bg-white/15 transition-colors flex items-center justify-center"
            onClick={() => zoomBy(-0.2)}
            aria-label={t('markdown.viewer.zoomOut')}
          >
            <Minus className="h-5 w-5" />
          </button>
        </TooltipAction>

        <TooltipAction tooltip={t('markdown.viewer.zoomIn')}>
          <button
            type="button"
            className="h-10 w-10 rounded-full text-white/90 hover:bg-white/10 active:bg-white/15 transition-colors flex items-center justify-center"
            onClick={() => zoomBy(0.2)}
            aria-label={t('markdown.viewer.zoomIn')}
          >
            <Plus className="h-5 w-5" />
          </button>
        </TooltipAction>

        <TooltipAction tooltip={t('markdown.viewer.reset')}>
          <button
            type="button"
            className="h-10 w-10 rounded-full text-white/90 hover:bg-white/10 active:bg-white/15 transition-colors flex items-center justify-center"
            onClick={resetView}
            aria-label={t('markdown.viewer.reset')}
          >
            <Scan className="h-5 w-5" />
          </button>
        </TooltipAction>

        <TooltipAction tooltip={t('markdown.viewer.rotateLeft')}>
          <button
            type="button"
            className="h-10 w-10 rounded-full text-white/90 hover:bg-white/10 active:bg-white/15 transition-colors flex items-center justify-center"
            onClick={() => rotateBy(-90)}
            aria-label={t('markdown.viewer.rotateLeft')}
          >
            <RotateCcw className="h-5 w-5" />
          </button>
        </TooltipAction>

        <TooltipAction tooltip={t('markdown.viewer.rotateRight')}>
          <button
            type="button"
            className="h-10 w-10 rounded-full text-white/90 hover:bg-white/10 active:bg-white/15 transition-colors flex items-center justify-center"
            onClick={() => rotateBy(90)}
            aria-label={t('markdown.viewer.rotateRight')}
          >
            <RotateCw className="h-5 w-5" />
          </button>
        </TooltipAction>
      </div>
      </div>
    </DismissableLayerBranch>,
    document.body,
  );
}
