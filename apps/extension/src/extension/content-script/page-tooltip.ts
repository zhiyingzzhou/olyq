/**
 * 说明：`page-tooltip` 内容脚本模块。
 *
 * 职责：
 * - 提供 page-facing shadow DOM UI 的轻量 tooltip contract；
 * - 统一输出 `data-olyq-tooltip` 而不是原生 `title`；
 * - 复用同一套样式、属性拼装和运行时定位，避免不同 content-script 小控件各写一套 hover 提示。
 *
 * 边界：
 * - 这里只服务 page-facing shadow DOM，React UI 继续走共享 Tooltip 组件；
 * - 只处理扩展自有 Shadow DOM 内小控件的短文本 tooltip，不接管宿主网页内容。
 */
import { positionPageFloatingElement } from './floating-position';

/** page-facing tooltip 的共享属性名。 */
export const PAGE_TOOLTIP_ATTRIBUTE = 'data-olyq-tooltip';

/** page-facing owner 浮层主动要求关闭 tooltip 的 ShadowRoot 内部事件名。 */
export const PAGE_TOOLTIP_DISMISS_EVENT = 'olyq:page-tooltip-dismiss';

/** page-facing tooltip 浮层的稳定 ID。 */
const PAGE_TOOLTIP_ID = 'olyq-page-tooltip';

/** page-facing tooltip 的共享样式。 */
export const PAGE_TOOLTIP_STYLES = `
  [${PAGE_TOOLTIP_ATTRIBUTE}] {
    position: relative;
  }

  .page-tooltip {
    position: fixed;
    pointer-events: none;
    display: none;
    box-sizing: border-box;
    max-width: min(220px, calc(100vw - 20px));
    padding: 6px 8px;
    border-radius: 10px;
    background: rgba(12, 12, 16, .94);
    color: rgba(255,255,255,.95);
    border: 1px solid rgba(255,255,255,.10);
    box-shadow:
      0 10px 30px rgba(0,0,0,.45),
      0 0 0 1px rgba(0,0,0,.25) inset;
    white-space: normal;
    overflow-wrap: anywhere;
    font: 11px/1.35 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
    opacity: 0;
    transition: opacity .12s ease, transform .12s ease;
    z-index: 1000;
  }

  .page-tooltip[data-open="true"] {
    opacity: 1;
  }
`;

/**
 * 转义 HTML attribute 文本。
 *
 * @param value - 原始 attribute 内容。
 * @returns 可安全放入 HTML attribute 的字符串。
 */
function escapeHtmlAttribute(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 为 page-facing icon-only 控件构建 tooltip 属性字符串。
 *
 * @param label - tooltip 文案。
 * @param ariaLabel - 可选无障碍名称；默认复用 label。
 * @returns 可直接拼进 HTML 模板的 attribute 片段。
 */
export function buildPageTooltipAttributes(label: string, ariaLabel?: string) {
  const text = String(label || '').trim();
  if (!text) return '';
  const escapedLabel = escapeHtmlAttribute(text);
  const escapedAriaLabel = escapeHtmlAttribute(String(ariaLabel || text).trim());
  return ` ${PAGE_TOOLTIP_ATTRIBUTE}="${escapedLabel}" aria-label="${escapedAriaLabel}"`;
}

/**
 * 关闭指定 ShadowRoot 内当前打开的 page-facing tooltip。
 *
 * @param root - 已安装 tooltip controller 的 ShadowRoot。
 */
export function dismissPageTooltip(root: ShadowRoot): void {
  root.dispatchEvent(new Event(PAGE_TOOLTIP_DISMISS_EVENT));
}

/**
 * 生成可稳定引用的 tooltip id。
 *
 * @param root - 当前 ShadowRoot。
 * @returns 用于 `aria-describedby` 的 ID。
 */
function ensurePageTooltipElement(root: ShadowRoot) {
  const existing = root.getElementById(PAGE_TOOLTIP_ID) as HTMLDivElement | null;
  if (existing) return existing;

  const tooltip = document.createElement('div');
  tooltip.id = PAGE_TOOLTIP_ID;
  tooltip.className = 'page-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.setAttribute('aria-hidden', 'true');
  // 统一 React 注入根本身是最高层 stacking context；tooltip 必须作为它的子层，
  // 才不会被全屏截图编辑器或其它 page-facing sibling 浮层盖住。
  const pageToolsRoot = root.querySelector<HTMLElement>('.page-tools-root');
  (pageToolsRoot ?? root).appendChild(tooltip);
  return tooltip;
}

/**
 * 判断节点是否属于当前 Shadow DOM 内的 tooltip 触发器。
 *
 * @param target - 事件目标。
 * @returns 触发器按钮或空值。
 */
function findTooltipTrigger(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>(`[${PAGE_TOOLTIP_ATTRIBUTE}]`);
}

/**
 * 给 page-facing Shadow DOM 安装智能 tooltip 控制器。
 *
 * 说明：
 * - tooltip 使用真实 DOM，才能测量尺寸并做视口碰撞定位；
 * - 默认显示在上方，顶部不足时按右、左、下的顺序 fallback；
 * - 这里不改变 `data-olyq-tooltip` 这个模板 contract，也不使用原生 `title`。
 *
 * @param root - 当前 page-facing UI 的 ShadowRoot。
 * @returns 卸载事件监听的清理函数。
 */
export function installPageTooltipController(root: ShadowRoot) {
  const tooltip = ensurePageTooltipElement(root);
  let activeTrigger: HTMLElement | null = null;
  let previousDescribedBy: string | null = null;

  /**
   * 隐藏当前 tooltip，并恢复触发器原有的 `aria-describedby`。
   */
  const hide = () => {
    if (activeTrigger) {
      if (previousDescribedBy) {
        activeTrigger.setAttribute('aria-describedby', previousDescribedBy);
      } else {
        activeTrigger.removeAttribute('aria-describedby');
      }
    }
    activeTrigger = null;
    previousDescribedBy = null;
    tooltip.dataset.open = 'false';
    tooltip.style.display = 'none';
    tooltip.setAttribute('aria-hidden', 'true');
    tooltip.textContent = '';
  };

  /**
   * 按当前触发器位置刷新 tooltip 坐标。
   */
  const reposition = () => {
    if (!activeTrigger || tooltip.style.display !== 'block') return;
    const text = String(activeTrigger.getAttribute(PAGE_TOOLTIP_ATTRIBUTE) || '').trim();
    if (!text || !activeTrigger.isConnected) {
      hide();
      return;
    }
    positionPageFloatingElement({
      anchorRect: activeTrigger.getBoundingClientRect(),
      floating: tooltip,
      preferredSide: 'top',
      fallbackPlacements: ['right', 'left', 'bottom'],
      align: 'center',
      gap: 8,
      padding: 10,
      fallbackWidth: 160,
      fallbackHeight: 30,
      sizeStrategy: 'constrain',
    });
  };

  /**
   * 显示指定触发器的 tooltip。
   *
   * @param trigger - 当前 hover 或 focus-visible 的触发器。
   */
  const show = (trigger: HTMLElement) => {
    const text = String(trigger.getAttribute(PAGE_TOOLTIP_ATTRIBUTE) || '').trim();
    if (!text) {
      hide();
      return;
    }
    if (activeTrigger !== trigger) {
      if (activeTrigger) hide();
      previousDescribedBy = trigger.getAttribute('aria-describedby');
    }
    activeTrigger = trigger;
    tooltip.textContent = text;
    tooltip.style.display = 'block';
    tooltip.dataset.open = 'true';
    tooltip.setAttribute('aria-hidden', 'false');
    trigger.setAttribute('aria-describedby', PAGE_TOOLTIP_ID);
    reposition();
  };

  /**
   * 处理指针进入触发器。
   *
   * @param event - Shadow DOM 内捕获到的指针事件。
   */
  const onPointerOver = (event: Event) => {
    const trigger = findTooltipTrigger(event.target);
    if (trigger) show(trigger);
  };

  /**
   * 处理指针离开触发器。
   *
   * @param event - Shadow DOM 内捕获到的指针事件。
   */
  const onPointerOut = (event: Event) => {
    if (!activeTrigger) return;
    const relatedTarget = (event as PointerEvent).relatedTarget;
    if (relatedTarget instanceof Node && activeTrigger.contains(relatedTarget)) return;
    const trigger = findTooltipTrigger(event.target);
    if (trigger === activeTrigger) hide();
  };

  /**
   * 处理键盘焦点进入触发器。
   *
   * @param event - Shadow DOM 内捕获到的焦点事件。
   */
  const onFocusIn = (event: Event) => {
    const trigger = findTooltipTrigger(event.target);
    if (trigger?.matches(':focus-visible')) show(trigger);
  };

  /**
   * 处理键盘焦点离开触发器。
   */
  const onFocusOut = () => {
    hide();
  };

  /**
   * Esc 关闭当前 tooltip。
   *
   * @param event - Shadow DOM 内捕获到的键盘事件。
   */
  const onKeyDown = (event: Event) => {
    if ((event as KeyboardEvent).key === 'Escape') hide();
  };

  /** owner 浮层关闭时同步隐藏 tooltip，避免触发器消失后提示残留。 */
  const onDismissRequest = () => {
    hide();
  };

  root.addEventListener('pointerover', onPointerOver, true);
  root.addEventListener('pointerout', onPointerOut, true);
  root.addEventListener('focusin', onFocusIn, true);
  root.addEventListener('focusout', onFocusOut, true);
  root.addEventListener('keydown', onKeyDown, true);
  root.addEventListener(PAGE_TOOLTIP_DISMISS_EVENT, onDismissRequest);
  document.addEventListener('scroll', reposition, true);
  window.addEventListener('resize', reposition, true);

  return () => {
    hide();
    root.removeEventListener('pointerover', onPointerOver, true);
    root.removeEventListener('pointerout', onPointerOut, true);
    root.removeEventListener('focusin', onFocusIn, true);
    root.removeEventListener('focusout', onFocusOut, true);
    root.removeEventListener('keydown', onKeyDown, true);
    root.removeEventListener(PAGE_TOOLTIP_DISMISS_EVENT, onDismissRequest);
    document.removeEventListener('scroll', reposition, true);
    window.removeEventListener('resize', reposition, true);
  };
}
