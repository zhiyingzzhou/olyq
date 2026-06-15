/**
 * 说明：`floating-position` 内容脚本浮层定位模块。
 *
 * 职责：
 * - 为 page-facing Shadow DOM 小浮层提供统一的 flip / shift / size 定位；
 * - 避免普通划词菜单、隐藏菜单、内联响应卡片和元素选择器各自手写边界判断；
 * - 只依赖视口坐标和 DOM 测量，不引入额外运行时依赖或扩展权限。
 *
 * 边界：
 * - 这里只处理固定定位浮层与当前视口的碰撞；
 * - 不管理焦点、事件监听、滚动订阅或业务状态。
 */

/** 浮层当前落位方向。 */
export type PageFloatingPlacement = 'top' | 'right' | 'bottom' | 'left' | 'idle';

/** 浮层相对锚点的水平对齐方式。 */
export type PageFloatingAlignment = 'start' | 'center' | 'end';

/**
 * 浮层尺寸处理策略。
 *
 * 说明：
 * - `constrain` 会在浮层超出视口安全区时写入 inline `maxWidth / maxHeight`，适合响应卡片、隐藏菜单等长内容容器；
 * - `position-only` 只使用实测宽高参与 flip / shift，不写最大尺寸，适合短工具条，避免把工具条变成可滚动容器并裁切 tooltip。
 */
export type PageFloatingSizeStrategy = 'constrain' | 'position-only';

/**
 * 可用于定位的锚点矩形。
 *
 * 说明：
 * - 与 `DOMRect` 保持同名字段，方便直接传入 `getBoundingClientRect()` 结果；
 * - 测试里也可以构造轻量对象，不必依赖真实布局引擎。
 */
export type PageFloatingAnchorRect = Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom' | 'width' | 'height'>;

/**
 * page-facing 浮层定位入参。
 */
export type PageFloatingPositionOptions = {
  /** 作为定位参照的页面区域或触发按钮矩形。 */
  anchorRect: PageFloatingAnchorRect | null;
  /** 需要写入 fixed 坐标的浮层元素。 */
  floating: HTMLElement;
  /** 首选方向，空间不足时会按 fallback 顺序翻转。 */
  preferredSide: Exclude<PageFloatingPlacement, 'idle'>;
  /** 显式 fallback 方向；未传时只在同轴相反方向之间翻转，保持既有菜单行为。 */
  fallbackPlacements?: Array<Exclude<PageFloatingPlacement, 'idle'>>;
  /** 水平对齐方式，默认居中。 */
  align?: PageFloatingAlignment;
  /** 浮层和锚点之间的间距。 */
  gap?: number;
  /** 浮层距离视口边缘的最小安全距离。 */
  padding?: number;
  /** 虚拟布局环境或尚未完成测量时使用的兜底宽度。 */
  fallbackWidth?: number;
  /** 虚拟布局环境或尚未完成测量时使用的兜底高度。 */
  fallbackHeight?: number;
  /** 尺寸限制策略，默认按视口安全区限制过大浮层。 */
  sizeStrategy?: PageFloatingSizeStrategy;
};

/**
 * page-facing 浮层定位结果。
 */
export type PageFloatingPositionResult = {
  /** 最终写入的 left。 */
  left: number;
  /** 最终写入的 top。 */
  top: number;
  /** 最终落位方向。 */
  placement: PageFloatingPlacement;
  /** 参与定位的浮层宽度。 */
  width: number;
  /** 参与定位的浮层高度。 */
  height: number;
};

/**
 * 将数值限制在指定闭区间内。
 *
 * @param value - 待限制的数值。
 * @param min - 最小值。
 * @param max - 最大值。
 * @returns 限制后的数值。
 */
function clamp(value: number, min: number, max: number) {
  const safeMax = Math.max(min, max);
  return Math.min(Math.max(value, min), safeMax);
}

/**
 * 读取当前视口尺寸。
 *
 * @returns 当前 fixed 定位浮层可参照的视口宽高。
 */
function getViewportSize() {
  return {
    width: Math.max(0, window.innerWidth || document.documentElement.clientWidth || 0),
    height: Math.max(0, window.innerHeight || document.documentElement.clientHeight || 0),
  };
}

/**
 * 读取浮层尺寸，并在超出视口时写入最大尺寸。
 *
 * 说明：
 * - 先清理上一次由本 helper 写入的 `maxWidth / maxHeight`，避免从窄视口回到宽视口后仍被旧值卡住；
 * - 只有实测尺寸超过当前可用视口时才写入 inline 最大尺寸，避免覆盖组件自身的视觉上限。
 *
 * @param options - 定位入参与视口安全距离。
 * @returns 用于本轮定位的浮层宽高。
 */
function measureFloatingSize(options: PageFloatingPositionOptions & { viewportWidth: number; viewportHeight: number; padding: number }) {
  const {
    floating,
    fallbackWidth = 1,
    fallbackHeight = 1,
    viewportWidth,
    viewportHeight,
    padding,
    sizeStrategy = 'constrain',
  } = options;
  const availableWidth = Math.max(1, viewportWidth - padding * 2);
  const availableHeight = Math.max(1, viewportHeight - padding * 2);

  floating.style.boxSizing = 'border-box';
  floating.style.transform = 'none';
  floating.style.maxWidth = '';
  floating.style.maxHeight = '';

  let rect = floating.getBoundingClientRect();
  let width = rect.width || (sizeStrategy === 'constrain' ? Math.min(fallbackWidth, availableWidth) : fallbackWidth);
  let height = rect.height || (sizeStrategy === 'constrain' ? Math.min(fallbackHeight, availableHeight) : fallbackHeight);

  if (sizeStrategy === 'position-only') {
    return {
      width: Math.max(1, width),
      height: Math.max(1, height),
    };
  }

  if (width > availableWidth) {
    floating.style.maxWidth = `${availableWidth}px`;
    width = availableWidth;
  }
  if (height > availableHeight) {
    floating.style.maxHeight = `${availableHeight}px`;
    height = availableHeight;
  }

  if (floating.style.maxWidth || floating.style.maxHeight) {
    rect = floating.getBoundingClientRect();
    width = rect.width || width;
    height = rect.height || height;
  }

  return {
    width: Math.min(width, availableWidth),
    height: Math.min(height, availableHeight),
  };
}

/**
 * 根据对齐方式计算浮层首选 left。
 *
 * @param anchorRect - 当前锚点矩形。
 * @param width - 浮层宽度。
 * @param align - 水平对齐方式。
 * @returns 尚未经过视口 shift 的首选 left。
 */
function getPreferredLeft(anchorRect: PageFloatingAnchorRect, width: number, align: PageFloatingAlignment) {
  if (align === 'start') return anchorRect.left;
  if (align === 'end') return anchorRect.right - width;
  return anchorRect.left + anchorRect.width / 2 - width / 2;
}

/**
 * 根据落位方向计算浮层首选 top。
 *
 * @param anchorRect - 当前锚点矩形。
 * @param height - 浮层高度。
 * @param align - 对齐方式；左右侧浮层用它决定垂直对齐。
 * @returns 尚未经过视口 shift 的首选 top。
 */
function getPreferredTop(anchorRect: PageFloatingAnchorRect, height: number, align: PageFloatingAlignment) {
  if (align === 'start') return anchorRect.top;
  if (align === 'end') return anchorRect.bottom - height;
  return anchorRect.top + anchorRect.height / 2 - height / 2;
}

/**
 * 计算指定方向上的主轴可用空间。
 *
 * @param anchorRect - 当前锚点矩形。
 * @param placement - 候选落位方向。
 * @param gap - 浮层和锚点间距。
 * @param padding - 视口安全距离。
 * @param viewportWidth - 当前视口宽度。
 * @param viewportHeight - 当前视口高度。
 * @returns 该方向可容纳浮层的主轴空间。
 */
function getMainAxisAvailableSpace(
  anchorRect: PageFloatingAnchorRect,
  placement: Exclude<PageFloatingPlacement, 'idle'>,
  gap: number,
  padding: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  if (placement === 'top') return Math.max(0, anchorRect.top - padding - gap);
  if (placement === 'bottom') return Math.max(0, viewportHeight - padding - anchorRect.bottom - gap);
  if (placement === 'right') return Math.max(0, viewportWidth - padding - anchorRect.right - gap);
  return Math.max(0, anchorRect.left - padding - gap);
}

/**
 * 返回默认同轴 fallback，保持既有 top/bottom 浮层行为不被 tooltip 扩展影响。
 *
 * @param preferredSide - 首选方向。
 * @returns 默认 fallback 顺序。
 */
function getDefaultFallbackPlacements(preferredSide: Exclude<PageFloatingPlacement, 'idle'>): Array<Exclude<PageFloatingPlacement, 'idle'>> {
  if (preferredSide === 'top') return ['bottom'];
  if (preferredSide === 'bottom') return ['top'];
  if (preferredSide === 'right') return ['left'];
  return ['right'];
}

/**
 * 选择浮层最终方向。
 *
 * @param anchorRect - 当前锚点矩形。
 * @param preferredSide - 首选方向。
 * @param fallbackPlacements - 显式 fallback 方向。
 * @param width - 浮层宽度。
 * @param height - 浮层高度。
 * @param gap - 浮层和锚点间距。
 * @param padding - 视口安全距离。
 * @param viewportWidth - 当前视口宽度。
 * @param viewportHeight - 当前视口高度。
 * @returns 最终方向。
 */
function resolvePlacement(
  anchorRect: PageFloatingAnchorRect,
  preferredSide: Exclude<PageFloatingPlacement, 'idle'>,
  fallbackPlacements: Array<Exclude<PageFloatingPlacement, 'idle'>> | undefined,
  width: number,
  height: number,
  gap: number,
  padding: number,
  viewportWidth: number,
  viewportHeight: number,
): Exclude<PageFloatingPlacement, 'idle'> {
  const orderedPlacements = [
    preferredSide,
    ...(fallbackPlacements ?? getDefaultFallbackPlacements(preferredSide)),
  ].filter((placement, index, all) => all.indexOf(placement) === index);

  let bestPlacement = orderedPlacements[0] ?? preferredSide;
  let bestAvailable = -1;

  for (const placement of orderedPlacements) {
    const requiredSize = placement === 'left' || placement === 'right' ? width : height;
    const available = getMainAxisAvailableSpace(anchorRect, placement, gap, padding, viewportWidth, viewportHeight);
    if (available >= requiredSize) return placement;
    if (available > bestAvailable) {
      bestAvailable = available;
      bestPlacement = placement;
    }
  }

  return bestPlacement;
}

/**
 * 将 page-facing fixed 浮层定位到锚点附近，并保持在视口内。
 *
 * @param options - 定位参数。
 * @returns 本轮定位结果，便于测试和调用方记录状态。
 */
export function positionPageFloatingElement(options: PageFloatingPositionOptions): PageFloatingPositionResult {
  const {
    anchorRect,
    floating,
    preferredSide,
    fallbackPlacements,
    align = 'center',
    gap = 8,
    padding = 10,
  } = options;
  const viewport = getViewportSize();

  if (!anchorRect) {
    floating.style.left = `${padding}px`;
    floating.style.top = `${padding}px`;
    floating.style.transform = 'none';
    floating.dataset.placement = 'idle';
    return { left: padding, top: padding, placement: 'idle', width: 0, height: 0 };
  }

  const { width, height } = measureFloatingSize({
    ...options,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    padding,
  });
  const placement = resolvePlacement(
    anchorRect,
    preferredSide,
    fallbackPlacements,
    width,
    height,
    gap,
    padding,
    viewport.width,
    viewport.height,
  );
  const maxLeft = viewport.width - padding - width;
  const maxTop = viewport.height - padding - height;
  const rawLeft = placement === 'right'
    ? anchorRect.right + gap
    : placement === 'left'
      ? anchorRect.left - gap - width
      : getPreferredLeft(anchorRect, width, align);
  const rawTop = placement === 'top'
    ? anchorRect.top - gap - height
    : placement === 'bottom'
      ? anchorRect.bottom + gap
      : getPreferredTop(anchorRect, height, align);
  const left = clamp(rawLeft, padding, maxLeft);
  const top = clamp(rawTop, padding, maxTop);

  floating.style.left = `${left}px`;
  floating.style.top = `${top}px`;
  floating.style.transform = 'none';
  floating.dataset.placement = placement;

  return { left, top, placement, width, height };
}
