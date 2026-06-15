/**
 * 说明：`selection-anchor` 内容脚本选区锚点模块。
 *
 * 职责：
 * - 为 page-facing 浮层保存可复用的选区矩形快照；
 * - 在响应卡片重定位时优先读取当前 Selection 的最新矩形；
 * - 当前 Selection 不再属于本次响应时，回退到打开卡片时保存的最后矩形。
 *
 * 边界：
 * - 这里只处理选区矩形真源选择，不写 DOM 坐标；
 * - 不访问 chrome runtime、不读取存储，也不管理浮层显隐状态。
 */
import type { PageFloatingAnchorRect } from './floating-position';

/** 读取当前页面 Selection 矩形的轻量函数契约。 */
export type PageSelectionRectReader = () => PageFloatingAnchorRect | null;

/** 读取当前页面 Selection 文本的轻量函数契约。 */
export type PageSelectionTextReader = () => string;

/** 解析响应卡片锚点所需的输入。 */
export type ResolveSelectionFloatingAnchorOptions = {
  /** 当前 Selection 的矩形读取函数；读取失败时返回 `null`。 */
  readonly getSelectionRect: PageSelectionRectReader;
  /** 当前 Selection 的文本读取函数，用于避免响应卡片跟随新的无关选区。 */
  readonly getSelectionText: PageSelectionTextReader;
  /** 本次响应卡片对应的原始划词文本。 */
  readonly expectedText: string;
  /** Selection 已消失或已切换时使用的最后稳定矩形。 */
  readonly fallbackRect: PageFloatingAnchorRect | null;
};

/**
 * 将浏览器返回的矩形固化成普通对象。
 *
 * 说明：
 * - DOMRect 在部分浏览器里可能带有 live-ish 语义，直接长期缓存容易和后续布局变化混在一起；
 * - 固化后只保留定位 helper 需要的字段，调用方可以安全地把它作为兜底锚点保存。
 *
 * @param rect - 浏览器 Selection / Range / 元素测量得到的矩形。
 * @returns 可安全缓存的轻量锚点矩形。
 */
export function snapshotAnchorRect(rect: PageFloatingAnchorRect): PageFloatingAnchorRect {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * 解析响应卡片当前应该使用的锚点矩形。
 *
 * 说明：
 * - resize / reflow 后，Selection 通常仍然存在但矩形会变化，此时必须重新读取最新矩形；
 * - 用户重新划选其它文本时，当前卡片仍属于旧请求，不能跳到新选区，只能使用旧兜底矩形保持阅读稳定；
 * - Selection 被网页脚本清掉或浏览器失去选区时，同样保留最后稳定矩形，避免流式卡片突然消失。
 *
 * @param options - 当前选区读取函数、原始文本与兜底矩形。
 * @returns 本轮可用于响应卡片定位的锚点矩形。
 */
export function resolveSelectionFloatingAnchorRect(options: ResolveSelectionFloatingAnchorOptions): PageFloatingAnchorRect | null {
  const { expectedText, fallbackRect, getSelectionRect, getSelectionText } = options;
  if (expectedText && getSelectionText() === expectedText) {
    const liveRect = getSelectionRect();
    if (liveRect) return snapshotAnchorRect(liveRect);
  }
  return fallbackRect;
}
