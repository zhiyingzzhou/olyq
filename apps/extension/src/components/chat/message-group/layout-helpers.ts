/**
 * 说明：`layout-helpers` 组件模块。
 *
 * 职责：
 * - 承载 `layout-helpers` 相关的当前文件实现与模块边界；
 * - 对外暴露 `gridColsClass`、`GRID_PREVIEW_POPOVER_CONTENT_PROPS` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { CSSProperties } from 'react';

/** inline compare/grid 下的最小卡片宽度。 */
export const MESSAGE_GROUP_INLINE_MIN_CARD_WIDTH_PX = 18 * 16;
/** grid gap-2 对应的像素间距。 */
export const MESSAGE_GROUP_GRID_GAP_PX = 8;

/**
 * 导出函数：`gridColsClass`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function gridColsClass(columns: number) {
  if (columns <= 1) return 'grid-cols-1';
  if (columns >= 6) return 'grid-cols-6';
  if (columns === 5) return 'grid-cols-5';
  if (columns === 4) return 'grid-cols-4';
  if (columns === 3) return 'grid-cols-3';
  return 'grid-cols-2';
}

/**
 * 解析横向 compare 的列宽类名。
 *
 * 说明：
 * - inline 下列宽限制在 `18rem ~ 32rem`，优先横向滚动而不是把卡片内部压坏；
 * - fullscreen 下放宽到 `20rem ~ 40rem`，保留更大的比较列上限。
 */
export function resolveHorizontalMessageGroupColumnClassName(presentation: 'inline' | 'fullscreen') {
  return presentation === 'fullscreen'
    ? 'flex h-full min-h-0 w-[clamp(20rem,48vw,40rem)] min-w-[20rem] max-w-[40rem] flex-shrink-0'
    : 'flex h-full min-h-0 w-[clamp(18rem,46vw,32rem)] min-w-[18rem] max-w-[32rem] flex-shrink-0';
}

/**
 * 解析当前渲染应使用的 grid 列数。
 *
 * 说明：
 * - inline 承载会根据容器实际宽度降列，保证单卡最小宽度不低于 `18rem`；
 * - fullscreen 继续尊重用户已存偏好，不额外压缩列数；
 * - 这只是当前渲染列数，不会回写持久化偏好。
 */
export function resolveEffectiveGridColumns({
  containerWidth,
  gridColumns,
  presentation,
}: {
  containerWidth: number;
  gridColumns: number;
  presentation: 'inline' | 'fullscreen';
}) {
  const normalizedGridColumns = Math.max(1, Math.min(6, Math.trunc(gridColumns || 1)));
  if (presentation !== 'inline' || !Number.isFinite(containerWidth) || containerWidth <= 0) {
    return normalizedGridColumns;
  }

  const maxColumnsFromWidth = Math.max(
    1,
    Math.floor((containerWidth + MESSAGE_GROUP_GRID_GAP_PX) / (MESSAGE_GROUP_INLINE_MIN_CARD_WIDTH_PX + MESSAGE_GROUP_GRID_GAP_PX)),
  );
  return Math.max(1, Math.min(normalizedGridColumns, maxColumnsFromWidth));
}

const GRID_PREVIEW_CONTENT_CLASS_NAME =
  'pointer-events-auto w-auto overflow-auto overscroll-contain p-2 max-h-[min(var(--grid-preview-available-height),calc(100vh-24px))] max-w-[min(var(--grid-preview-available-width),calc(100vw-24px))] sm:max-w-[min(var(--grid-preview-available-width),60vw)]';

/** `grid` 预览内部嵌套浮层用于告知外层预览壳体“不要误关”的 data attr 名。 */
export const GRID_PREVIEW_FLOATING_LAYER_ATTR = 'data-grid-preview-floating-layer';

/**
 * 内部函数：`getGridPreviewContentProps`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function getGridPreviewContentProps() {
  return {
    collisionPadding: 12 as const,
    sideOffset: 8 as const,
    className: GRID_PREVIEW_CONTENT_CLASS_NAME,
    style: {
      '--grid-preview-available-height': 'var(--radix-popover-content-available-height)',
      '--grid-preview-available-width': 'var(--radix-popover-content-available-width)',
    } as CSSProperties,
  };
}

/**
 * 导出常量：`GRID_PREVIEW_POPOVER_CONTENT_PROPS`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const GRID_PREVIEW_POPOVER_CONTENT_PROPS = getGridPreviewContentProps();
