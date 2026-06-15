/**
 * 说明：`element-picker-hit-test` 元素选择器命中与视觉区域辅助模块。
 *
 * 职责：
 * - 在透明事件 shield 接管页面交互时，临时关闭扩展 host 的 hit-test 并读取真实页面元素栈；
 * - 按页面真实命中顺序筛选第一个可选元素，避免把用户点中的细粒度元素默认抬升成父级模块；
 * - 为视觉区域选择生成可裁剪的视口矩形，并定位鼠标下方最近可滚动容器。
 *
 * 边界：
 * - 本模块只读取当前页面 DOM、布局矩形和样式，不发送 runtime message；
 * - 截图、附件落库和模型上下文拼接分别属于 Service Worker 与 sidepanel。
 */
import type { PickedVisualRegion } from '@/types/element-picker';

const ELEMENT_PICKER_HOST_ID = '__olyq_element_picker_host__';
const INLINE_UI_HOST_ID = '__olyq_shadow_host__';

/** 元素选择器命中的原始节点与评分后的默认目标。 */
export type PickerHit = {
  /** 鼠标点位下最贴近的有效页面元素，用于构造缩小 / 扩大范围链。 */
  raw: Element;
  /** 默认选择目标；当前语义下与 raw 相同，保留字段让调用处不需要关心命中内部实现。 */
  target: Element;
};

/**
 * 判断元素是否来自指定 shadow host 内部。
 *
 * @param el - 待判断元素。
 * @param hostId - 目标宿主节点 ID。
 * @returns 用于过滤扩展自己创建的浮层 UI。
 */
function isInOurShadow(el: Element, hostId: string) {
  const root = el.getRootNode();
  return root instanceof ShadowRoot && (root.host as HTMLElement | null)?.id === hostId;
}

/**
 * 判断目标元素是否属于扩展自身 UI，应在选取时忽略。
 *
 * @param el - 当前命中的页面元素。
 * @returns 若属于元素选择器或划词助手自己的 DOM，则返回 `true`。
 */
function isIgnorableUiElement(el: Element) {
  if (isInOurShadow(el, ELEMENT_PICKER_HOST_ID)) return true;
  if (isInOurShadow(el, INLINE_UI_HOST_ID)) return true;
  const id = (el as HTMLElement | null)?.id;
  return id === ELEMENT_PICKER_HOST_ID || id === INLINE_UI_HOST_ID;
}

/**
 * 判断当前元素是否因为语义或可见性原因不应该进入候选。
 *
 * @param el - 从页面 hit-test 中得到的元素。
 * @returns 无效布局、元信息节点和隐藏节点会被排除。
 */
function isRejectedElement(el: Element) {
  if (isIgnorableUiElement(el)) return true;
  const tag = el.tagName?.toLowerCase?.() || '';
  if (!tag || tag === 'html' || tag === 'body') return true;
  if (tag === 'script' || tag === 'style' || tag === 'meta' || tag === 'link' || tag === 'noscript' || tag === 'template') return true;
  if ((el as HTMLElement | null)?.getAttribute?.('aria-hidden') === 'true') return true;
  return false;
}

/**
 * 读取元素视口矩形；不可见时返回 null。
 *
 * @param el - 待测元素。
 * @returns 有效视口矩形。
 */
export function getUsableElementRect(el: Element) {
  const rect = (el as HTMLElement).getBoundingClientRect?.();
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  if (rect.bottom <= 0 || rect.right <= 0 || rect.left >= window.innerWidth || rect.top >= window.innerHeight) return null;
  return rect;
}

/**
 * 尽量读取 open Shadow DOM 内部真正命中的节点。
 *
 * @param el - `document.elementsFromPoint()` 命中的宿主元素。
 * @param x - 视口 X 坐标。
 * @param y - 视口 Y 坐标。
 * @returns open shadow root 内部节点；closed shadow root 只能保留 host。
 */
function descendOpenShadowHit(el: Element, x: number, y: number): Element {
  let current = el;
  for (let depth = 0; depth < 6; depth += 1) {
    const shadow = (current as HTMLElement & { shadowRoot?: ShadowRoot | null }).shadowRoot;
    const next = shadow?.elementFromPoint?.(x, y);
    if (!next || next === current) break;
    current = next;
  }
  return current;
}

/**
 * 读取元素可见文本，供命中评分使用。
 *
 * @param el - 待评分元素。
 * @returns 压缩空白后的文本。
 */
function getCandidateText(el: Element) {
  if (el instanceof HTMLInputElement) {
    if (String(el.type || '').toLowerCase() === 'password') return '';
    return String(el.value || el.placeholder || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
  }
  if (el instanceof HTMLTextAreaElement) return String(el.value || el.placeholder || '').replace(/\s+/g, ' ').trim();
  const he = el as HTMLElement;
  return String(he.innerText || he.getAttribute?.('aria-label') || he.getAttribute?.('title') || el.textContent || '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 判断元素是否可以作为精细选择或范围候选。
 *
 * 精细选择的第一优先级是尊重用户鼠标下的真实 DOM 命中，因此这里不做“结构价值”
 * 排序；只排除扩展自身 UI、隐藏节点、根节点、元信息节点和既没有内容也没有视觉
 * 表达价值的空壳。父级容器若包含真实文本、ARIA 名称、图片/代码/表格或可截图视觉
 * 价值，仍可通过“扩大范围”进入候选链。
 *
 * @param el - 待判断的页面元素。
 * @returns 可作为默认命中或范围候选时返回 true。
 */
export function isSelectableElement(el: Element) {
  if (isRejectedElement(el)) return false;
  if (!getUsableElementRect(el)) return false;
  const textLength = getCandidateText(el).replace(/\s+/g, '').length;
  if (textLength > 0) return true;
  if (el instanceof HTMLTableElement || el instanceof HTMLImageElement || el instanceof SVGSVGElement) return true;
  if (el instanceof HTMLCanvasElement || el instanceof HTMLVideoElement || el instanceof HTMLIFrameElement) return true;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el.querySelector?.('table, pre, code, img, svg, picture, canvas, video, iframe')) return true;
  return hasVisualRegionValue(el);
}

/**
 * 判断元素是否具有可截图表达的视觉内容。
 *
 * @param el - 待判断元素。
 * @returns canvas、video、iframe、背景图或明显视觉盒子会返回 true。
 */
export function hasVisualRegionValue(el: Element) {
  if (el instanceof HTMLCanvasElement || el instanceof HTMLVideoElement || el instanceof HTMLIFrameElement) return true;
  if (el.querySelector?.('canvas, video, iframe')) return true;
  try {
    const style = window.getComputedStyle(el as HTMLElement);
    const bgImage = String(style.backgroundImage || '').trim();
    if (bgImage && bgImage !== 'none') return true;
    const boxShadow = String(style.boxShadow || '').trim();
    const borderWidth = parseFloat(style.borderTopWidth || '0')
      + parseFloat(style.borderRightWidth || '0')
      + parseFloat(style.borderBottomWidth || '0')
      + parseFloat(style.borderLeftWidth || '0');
    const bgColor = String(style.backgroundColor || '').trim();
    if (boxShadow && boxShadow !== 'none') return true;
    if (borderWidth > 0) return true;
    if (bgColor && bgColor !== 'transparent' && bgColor !== 'rgba(0, 0, 0, 0)') return true;
  } catch {
    return false;
  }
  return false;
}

/**
 * 从鼠标坐标拾取最贴近用户指针的有效页面元素。
 *
 * @param x - 视口 X 坐标。
 * @param y - 视口 Y 坐标。
 * @param host - 当前元素选择器宿主；命中时会临时关闭其 hit-test 以读取真实页面元素。
 * @returns 页面栈里第一个有效元素；空壳遮罩会被跳过，但不会把 span/td/button 默认抬升成父级块。
 */
export function pickElementFromPoint(x: number, y: number, host: HTMLElement): PickerHit | null {
  const previousPointerEvents = host.style.pointerEvents;
  host.style.pointerEvents = 'none';
  try {
    const seen = new Set<Element>();
    const list = document.elementsFromPoint(x, y)
      .map((el) => descendOpenShadowHit(el, x, y))
      .filter((el) => {
        if (!el || seen.has(el)) return false;
        seen.add(el);
        return true;
      });
    for (const el of list) {
      if (isSelectableElement(el)) return { raw: el, target: el };
    }
    return null;
  } finally {
    host.style.pointerEvents = previousPointerEvents;
  }
}

/**
 * 将数值限制在指定区间。
 *
 * @param value - 待限制的数值。
 * @param min - 最小值。
 * @param max - 最大值。
 * @returns 已限制到区间内的数值。
 */
function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * 获取元素提交瞬间的视觉区域裁剪依据。
 *
 * @param el - 当前被选中的页面元素。
 * @returns 可由 Sidepanel 按截图裁剪的视口矩形和视口状态。
 */
export function buildVisualRegion(el: Element): PickedVisualRegion {
  const rect = getUsableElementRect(el);
  const left = rect ? clamp(rect.left, 0, window.innerWidth) : 0;
  const top = rect ? clamp(rect.top, 0, window.innerHeight) : 0;
  const right = rect ? clamp(rect.right, 0, window.innerWidth) : 0;
  const bottom = rect ? clamp(rect.bottom, 0, window.innerHeight) : 0;
  return {
    rect: {
      x: Math.round(left * 100) / 100,
      y: Math.round(top * 100) / 100,
      width: Math.max(1, Math.round((right - left) * 100) / 100),
      height: Math.max(1, Math.round((bottom - top) * 100) / 100),
    },
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.scrollX || window.pageXOffset || 0,
      scrollY: window.scrollY || window.pageYOffset || 0,
      devicePixelRatio: window.devicePixelRatio || 1,
    },
  };
}

/**
 * 查找命中点附近最近的可滚动容器。
 *
 * @param x - 视口 X 坐标。
 * @param y - 视口 Y 坐标。
 * @param host - 元素选择器宿主。
 * @returns 可滚动元素；为空时使用 window 滚动。
 */
export function findScrollableAtPoint(x: number, y: number, host: HTMLElement): Element | null {
  const previousPointerEvents = host.style.pointerEvents;
  host.style.pointerEvents = 'none';
  try {
    const stack = document.elementsFromPoint(x, y).map((el) => descendOpenShadowHit(el, x, y));
    for (const start of stack) {
      let cur: Element | null = start;
      for (let depth = 0; depth < 12 && cur; depth += 1) {
        if (isIgnorableUiElement(cur)) {
          cur = cur.parentElement;
          continue;
        }
        const he = cur as HTMLElement;
        try {
          const style = window.getComputedStyle(he);
          const overflowY = `${style.overflowY} ${style.overflow}`.toLowerCase();
          const overflowX = `${style.overflowX} ${style.overflow}`.toLowerCase();
          const canScrollY = /(auto|scroll|overlay)/.test(overflowY) && he.scrollHeight > he.clientHeight;
          const canScrollX = /(auto|scroll|overlay)/.test(overflowX) && he.scrollWidth > he.clientWidth;
          if (canScrollY || canScrollX) return cur;
        } catch {
          // 继续向父级找。
        }
        cur = cur.parentElement;
      }
    }
    return null;
  } finally {
    host.style.pointerEvents = previousPointerEvents;
  }
}
