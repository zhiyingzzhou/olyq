/**
 * 说明：`element-picker` 内容脚本模块。
 *
 * 职责：
 * - 承载 `element-picker` 相关的当前文件实现与模块边界；
 * - 对外暴露 `isElementPickerMode`、`closeElementPicker`、`openElementPicker` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { ElementActionPayload, PickedElement } from '@/types/element-picker';
import type { PageToolSessionCloseReason } from '@/types/sw-messages';
import i18n from '@/i18n';
import { normalizeI18nText } from '@/lib/i18n/text';
import { formatI18nText } from '@/lib/i18n/format';
import { extractPickedElement, summarizePickedElement } from './element-picker-extract';
import {
  buildVisualRegion,
  findScrollableAtPoint,
  hasVisualRegionValue,
  isSelectableElement,
  pickElementFromPoint,
} from './element-picker-hit-test';
import { positionPageFloatingElement } from './floating-position';
import { dismissPageTooltip } from './page-tooltip';
import { ensurePageToolsRoot, type PageToolsElementPickerRefs } from './page-tools/page-tools-root';
import { sendExtensionMessage } from '@/lib/extension/runtime-api';

/**
 * 网页元素选择器（Content Script）
 *
 * 目标：
 * - 用户进入"选元素模式"后，在页面上 hover 高亮任意 DOM 元素
 * - 点击选中后通过顶部工具条确认“加入输入”
 * - 将结构化结果（文本/代码/图片/表格）发送到 Service Worker，再转发到侧边栏输入草稿
 *
 * 约束：
 * - 尽力而为：跨域 iframe 无法深入；canvas/video 等可能因安全限制无法导出像素
 * - 隐私优先：默认不主动抓全页内容，只抓用户显式点选的元素
 */

const MODE_KEY = '__olyq_element_picker_mode__';

/**
 * 判断当前页面是否处于元素选择模式。
 *
 * @returns 仅用于同一 content script 内的运行时状态判断，不写入持久化存储。
 */
export function isElementPickerMode() {
  return (globalThis as unknown as Record<string, unknown>)[MODE_KEY] === true;
}

/**
 * 设置当前页面的元素选择模式标记。
 *
 * @param enabled - 是否开启选择模式。
 */
function setElementPickerMode(enabled: boolean) {
  (globalThis as unknown as Record<string, unknown>)[MODE_KEY] = enabled;
}

/**
 * 元素选择器在页面上的 UI 引用集合。
 */
type PickerUi = PageToolsElementPickerRefs & {
  /**
   * Shadow Host 宿主节点。
   */
  host: HTMLElement;
  /**
   * 用于隔离样式的 Shadow Root。
   */
  shadow: ShadowRoot;
};

/**
 * 读取统一 React root 中的元素选择器节点。
 *
 * @returns 供后续交互复用的 DOM 引用集合。
 */
function readUi(): PickerUi {
  const root = ensurePageToolsRoot();
  const refs = { host: root.refs.host, shadow: root.refs.shadow, ...root.refs.elementPicker };
  applyElementPickerLabels(refs);
  return refs;
}

/** 读取元素选择器当前语言下的 UI 文案。 */
function tr(key: string, params?: Record<string, unknown>) {
  return i18n.t(key, params);
}

/** 将元素选择器静态控件文案写入 Shadow DOM。 */
function applyElementPickerLabels(refs: PickerUi) {
  refs.btnShrink.setAttribute('aria-label', tr('elementPicker.shrink'));
  refs.btnShrink.setAttribute('data-olyq-tooltip', tr('elementPicker.shrink'));
  refs.btnExpand.setAttribute('aria-label', tr('elementPicker.expand'));
  refs.btnExpand.setAttribute('data-olyq-tooltip', tr('elementPicker.expand'));
  refs.btnCommit.textContent = tr('elementPicker.commit');
  refs.btnCancel.textContent = tr('common.cancel');
  refs.hintEscCancel.textContent = tr('elementPicker.escCancel');
}

/**
 * 将用户命中的节点收敛到不可继续细分的原子元素。
 *
 * @param el - 原始命中元素。
 * @returns 只对图片、SVG 与 canvas 这类原子视觉节点做归一化，文本、表格单元格和代码 token 保持精细命中。
 */
function normalizePickedElement(el: Element): Element {
  // 图片与 SVG 内部 path/use/source 这类节点没有独立上下文价值，默认仍收敛到可提取的原子视觉元素。
  const img = (el.closest?.('img') as HTMLImageElement | null) ?? null;
  if (img) return img;
  const svg = (el.closest?.('svg') as SVGSVGElement | null) ?? null;
  if (svg) return svg;
  const canvas = (el.closest?.('canvas') as HTMLCanvasElement | null) ?? null;
  if (canvas) return canvas;
  const picture = (el.closest?.('picture') as HTMLPictureElement | null) ?? null;
  if (picture) return picture.querySelector('img') || picture;
  return el;
}

type PickerSelection = {
  candidates: Element[];
  index: number;
};

/**
 * 判断元素是否可以进入“缩小 / 扩大范围”的候选链。
 *
 * @param el - 从原始命中节点向上遍历得到的元素。
 * @returns 排除扩展自身 UI 与整页根节点后的页面元素。
 */
function isSelectableRangeElement(el: Element) {
  return isSelectableElement(el);
}

/**
 * 从原始命中元素构造可调范围链。
 *
 * @param raw - 鼠标坐标直接命中的页面元素。
 * @param normalized - 当前默认归一化后的元素。
 * @returns 从更小范围到更大父级范围排列的候选元素集合。
 */
function buildSelectionCandidates(raw: Element, normalized: Element): Element[] {
  const candidates: Element[] = [];
  let cur: Element | null = raw;
  for (let depth = 0; depth < 12 && cur; depth += 1) {
    if (isSelectableRangeElement(cur) && !candidates.includes(cur)) candidates.push(cur);
    cur = cur.parentElement;
  }
  if (!candidates.includes(normalized)) candidates.unshift(normalized);
  return candidates;
}

/**
 * 对 CSS 选择器中的标识符做转义。
 *
 * @param s - 原始标识符。
 * @returns 可安全拼接进选择器的文本。
 */
function cssEscapeIdent(s: string) {
  try {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(s);
  } catch {
    // 忽略：CSS.escape 不可用则走兜底逻辑
  }
  return s.replace(/[^a-zA-Z0-9_-]/g, (m) => `\\${m}`);
}

/**
 * 为选中的元素构造一个尽量稳定的 CSS 选择器。
 *
 * @param el - 被选中的 DOM 元素。
 * @returns 限制深度的路径型选择器，优先使用 ID，其次使用类名和 `:nth-of-type`。
 */
function buildCssSelector(el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  for (let depth = 0; depth < 5 && cur; depth += 1) {
    const tag = (cur.tagName || '').toLowerCase();
    if (!tag || tag === 'html') break;

    const he = cur as HTMLElement;
    const id = typeof he.id === 'string' ? he.id.trim() : '';
    if (id) {
      parts.unshift(`${tag}#${cssEscapeIdent(id)}`);
      break;
    }

    const classes = typeof he.className === 'string'
      ? he.className
        .split(/\s+/g)
        .map((c) => c.trim())
        .filter(Boolean)
        .slice(0, 2)
      : [];
    const classPart = classes.length > 0 ? `.${classes.map(cssEscapeIdent).join('.')}` : '';

    let nth = '';
    const parent = cur.parentElement;
    if (parent) {
      const sameTag = Array.from(parent.children).filter((c) => c.tagName === cur!.tagName);
      if (sameTag.length > 1) {
        nth = `:nth-of-type(${sameTag.indexOf(cur) + 1})`;
      }
    }

    parts.unshift(`${tag}${classPart}${nth}`);
    cur = cur.parentElement;
  }
  return parts.join(' > ');
}

/**
 * 判断提取结果是否必须切为视觉区域，避免继续生成“0 字”无效文本卡。
 *
 * @param el - 当前选中元素。
 * @param extracted - DOM 提取后的结构化结果。
 * @returns 是否应改成 visual kind。
 */
function shouldUseVisualRegion(el: Element, extracted: PickedElement) {
  if (extracted.kind === 'visual') return true;
  if (extracted.kind !== 'text') return false;
  const chars = extracted.charCount ?? String(extracted.text || '').replace(/\s+/g, '').length;
  return chars <= 0 && hasVisualRegionValue(el);
}

/**
 * 判断提取结果是否确实包含可发送给模型的上下文。
 *
 * 精细选择允许用户点到 span、td、button 这类小元素，但不能把无文本、无图片、
 * 无表格、无代码、也无视觉截图价值的空壳继续生成“约 0 字”引用卡。
 *
 * @param element - 已构造好的元素上下文。
 * @returns 没有任何可用上下文时返回 true。
 */
function isEmptyPickedElement(element: PickedElement) {
  const textLength = String(element.text || '').replace(/\s+/g, '').length;
  if (textLength > 0) return false;
  if ((element.images?.length ?? 0) > 0) return false;
  if (element.kind === 'table' && element.table?.markdown?.trim()) return false;
  if (element.kind === 'code' && (element.lineCount ?? 0) > 0) return false;
  if (element.kind === 'visual' && element.visual) return false;
  return true;
}

/**
 * 阻断当前事件继续进入宿主页面。
 *
 * @param e - 浏览器事件。
 */
function blockPageEvent(e: Event) {
  if (typeof e.preventDefault === 'function') e.preventDefault();
  if (typeof e.stopPropagation === 'function') e.stopPropagation();
  if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
}

/**
 * 将元素选择器工具条定位到目标元素附近。
 *
 * @param hint - 需要定位的工具条。
 * @param target - 当前 hover 或 picked 的页面元素；为空时回到左上角待命位置。
 */
function positionHintNearTarget(hint: HTMLElement, target: Element | null) {
  const viewportPad = 12;

  if (!target) {
    hint.style.left = `${viewportPad}px`;
    hint.style.top = `${viewportPad}px`;
    hint.style.transform = 'none';
    hint.dataset.placement = 'idle';
    return;
  }

  const targetRect = (target as HTMLElement).getBoundingClientRect?.();
  if (!targetRect || (targetRect.width === 0 && targetRect.height === 0)) {
    hint.style.left = `${viewportPad}px`;
    hint.style.top = `${viewportPad}px`;
    hint.style.transform = 'none';
    hint.dataset.placement = 'idle';
    return;
  }

  positionPageFloatingElement({
    anchorRect: targetRect,
    floating: hint,
    preferredSide: 'top',
    align: 'center',
    gap: 10,
    padding: viewportPad,
    fallbackWidth: Math.min(420, Math.max(280, window.innerWidth - viewportPad * 2)),
    fallbackHeight: 42,
  });
}

let ui: PickerUi | null = null;
let open = false;
let activeSessionId: string | undefined;
type ElementPickerCleanupOptions = {
  /** 是否通知后台会话已关闭。 */
  notifySession?: boolean;
  /** 会话关闭原因。 */
  reason?: PageToolSessionCloseReason;
};
let cleanupCurrent: ((options?: ElementPickerCleanupOptions) => void) | null = null;

/** 元素选择器打开时由 Service Worker 注入的会话参数。 */
type ElementPickerOpenOptions = {
  /** 页面工具会话 ID。 */
  sessionId?: string;
  /** 关闭或提交后是否回到 sidepanel。 */
  returnToPanel?: boolean;
};

/**
 * 通知后台当前元素选择器会话已经关闭。
 *
 * @param sessionId - 页面工具会话 ID。
 * @param reason - 关闭原因。
 */
function notifyElementPickerSessionClosed(
  sessionId: string | undefined,
  reason: PageToolSessionCloseReason,
  returnToPanel: boolean,
) {
  if (!sessionId) return;
  void sendExtensionMessage({
    type: 'page-tool/session/closed',
    payload: {
      sessionId,
      tool: 'element-picker',
      reason,
      ...(returnToPanel ? { returnToPanel: true } : {}),
      source: { url: location.href, title: document.title },
    },
  }).catch(() => {
    // 会话恢复失败只能由用户再次点击侧栏恢复；内容脚本不在页面上额外展示错误。
  });
}

/**
 * 关闭元素选择器（若处于开启态）。
 * - 用于“网页工具开关”关闭时的强制退出，避免页面残留高亮/菜单与事件监听器。
 */
export function closeElementPicker(options: ElementPickerCleanupOptions = {}) {
  cleanupCurrent?.(options);
}

/**
 * 判断元素选择器是否已经真实进入页面交互态。
 *
 * @param expectedSessionId - Service Worker 当前期望的会话 ID。
 * @returns 只有模式标记、事件屏蔽层和确认工具条都就绪时才返回 true。
 */
export function isElementPickerOpenForAck(expectedSessionId?: string): boolean {
  if (!open || !isElementPickerMode()) return false;
  if (expectedSessionId && activeSessionId !== expectedSessionId) return false;
  if (!ui) return false;
  return ui.eventShield.style.display === 'block'
    && ui.hint.style.display === 'flex';
}

/**
 * 打开元素选择器。
 *
 * 该函数会在页面上挂载 hover 高亮层和顶部确认工具条，并注册捕获阶段事件监听，
 * 以确保点击选中元素时不会触发页面原有跳转或按钮副作用。
 */
export function openElementPicker(options: ElementPickerOpenOptions = {}) {
  if (open) return;
  open = true;
  setElementPickerMode(true);

  ui = ui || readUi();
  const { shadow, hint, hintText, hintSummary, btnCancel, btnShrink, btnExpand, btnCommit, highlight, eventShield } = ui;
  const { host } = ui;
  applyElementPickerLabels(ui);

  host.style.pointerEvents = 'auto';
  eventShield.style.display = 'block';
  hint.style.display = 'flex';
  hint.classList.remove('is-picked');
  positionHintNearTarget(hint, null);
  highlight.style.display = 'none';
  hintText.textContent = tr('elementPicker.pickHint');
  hintSummary.textContent = '';
  btnShrink.disabled = true;
  btnExpand.disabled = true;
  btnCommit.disabled = true;
  try {
    (document.activeElement as HTMLElement | null)?.blur?.();
  } catch {
    // 无法 blur 时仍继续进入模态选择。
  }

  let hovered: Element | null = null;
  let picked: Element | null = null;
  let selection: PickerSelection | null = null;
  const sessionId = typeof options.sessionId === 'string' && options.sessionId.trim() ? options.sessionId.trim() : undefined;
  const returnToPanel = options.returnToPanel === true;
  activeSessionId = sessionId;

  /**
   * 根据当前 hover/pick 的元素更新高亮框位置。
   *
   * @param target - 当前需要高亮的元素。
   */
  const updateHighlight = (target: Element | null) => {
    hovered = target;
    if (!target) {
      highlight.style.display = 'none';
      positionHintNearTarget(hint, null);
      return;
    }
    const rect = (target as HTMLElement).getBoundingClientRect?.();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      highlight.style.display = 'none';
      positionHintNearTarget(hint, null);
      return;
    }
    const pad = 2;
    highlight.style.display = 'block';
    highlight.style.left = `${Math.max(0, rect.left - pad)}px`;
    highlight.style.top = `${Math.max(0, rect.top - pad)}px`;
    highlight.style.width = `${Math.max(0, rect.width + pad * 2)}px`;
    highlight.style.height = `${Math.max(0, rect.height + pad * 2)}px`;
    positionHintNearTarget(hint, target);
  };

  /**
   * 根据当前已选元素刷新摘要、范围按钮和高亮位置。
   *
   * @param target - 当前最终会被提取并发送的页面元素。
   */
  const refreshPickedUi = (target: Element) => {
    picked = target;
    hint.classList.add('is-picked');
    hintText.textContent = tr('elementPicker.pickedTag', { tag: target.tagName?.toLowerCase?.() || 'element' });
    hintSummary.textContent = summarizePickedElement(target, tr);
    btnShrink.disabled = !selection || selection.index <= 0;
    btnExpand.disabled = !selection || selection.index >= selection.candidates.length - 1;
    btnCommit.disabled = false;
    updateHighlight(target);
  };

  /**
   * 切换到候选链中的指定范围。
   *
   * @param nextIndex - 候选链下标，越大代表越靠近父级容器。
   */
  const switchSelectionRange = (nextIndex: number) => {
    if (!selection) return;
    const max = selection.candidates.length - 1;
    selection.index = Math.min(max, Math.max(0, nextIndex));
    refreshPickedUi(selection.candidates[selection.index]);
  };

  /**
   * 关闭当前选择器实例并移除所有事件监听器。
   */
  const cleanup = (cleanupOptions: ElementPickerCleanupOptions = {}) => {
    if (!open) return;
    open = false;
    setElementPickerMode(false);
    cleanupCurrent = null;
    activeSessionId = undefined;

    host.style.pointerEvents = 'none';
    dismissPageTooltip(shadow);
    eventShield.style.display = 'none';
    hint.style.display = 'none';
    highlight.style.display = 'none';
    hint.classList.remove('is-picked');
    hintSummary.textContent = '';
    btnShrink.disabled = true;
    btnExpand.disabled = true;
    btnCommit.disabled = true;

    document.removeEventListener('pointermove', onPointerMove, true);
    document.removeEventListener('mousemove', onPointerMove, true);
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('mousedown', onPointerDown, true);
    document.removeEventListener('pointerup', onBlockOnlyEvent, true);
    document.removeEventListener('mouseup', onBlockOnlyEvent, true);
    document.removeEventListener('click', onBlockOnlyEvent, true);
    document.removeEventListener('dblclick', onBlockOnlyEvent, true);
    document.removeEventListener('auxclick', onBlockOnlyEvent, true);
    document.removeEventListener('contextmenu', onBlockOnlyEvent, true);
    document.removeEventListener('selectstart', onBlockOnlyEvent, true);
    document.removeEventListener('dragstart', onBlockOnlyEvent, true);
    document.removeEventListener('wheel', onWheel, true);
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('scroll', onViewportChange, true);
    window.removeEventListener('resize', onViewportChange, true);
    window.removeEventListener('scroll', onViewportChange, true);
    btnCancel.removeEventListener('click', onCancelClick, true);
    btnShrink.removeEventListener('click', onRangeClick, true);
    btnExpand.removeEventListener('click', onRangeClick, true);
    btnCommit.removeEventListener('click', onCommitClick, true);

    if (cleanupOptions.notifySession) notifyElementPickerSessionClosed(
      sessionId,
      cleanupOptions.reason ?? 'close',
      returnToPanel,
    );
  };
  cleanupCurrent = cleanup;

  /**
   * 点击顶部取消按钮时立即退出选择模式。
   */
  const onCancelClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    cleanup({ notifySession: true, reason: 'cancel' });
  };

  /**
   * 点击范围按钮时在子级/父级候选之间切换。
   *
   * @param e - 顶部提示条按钮点击事件。
   */
  const onRangeClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    const btn = target?.closest('button[data-action]') as HTMLButtonElement | null;
    if (!btn || btn.disabled) return;

    e.preventDefault();
    e.stopPropagation();

    if (btn.dataset.action === 'shrink') switchSelectionRange((selection?.index ?? 0) - 1);
    if (btn.dataset.action === 'expand') switchSelectionRange((selection?.index ?? 0) + 1);
  };

  /**
   * 判断事件是否来源于扩展自己的 shadow UI。
   *
   * @param ev - 浏览器事件对象。
   * @returns 若事件源来自扩展浮层，则返回 `true`。
   */
  const isFromPickerUiEvent = (ev: Event) => {
    const path = ev.composedPath?.() ?? [];
    return path.includes(hint);
  };

  /**
   * 标记提交失败，保留当前选择，让用户可以换范围或重试。
   *
   * @param message - 面向用户的短错误。
   */
  const showCommitError = (message: string) => {
    hintSummary.textContent = message;
    btnCommit.disabled = false;
  };

  /**
   * 页面滚动或视口变化时，按当前 hover/选中元素重新计算高亮与工具条位置。
   */
  function onViewportChange() {
    if (!open) return;
    const target = picked || hovered;
    if (!target) {
      positionHintNearTarget(hint, null);
      return;
    }
    updateHighlight(target);
  }

  /**
   * hover 时实时更新当前高亮目标。
   *
   * @param e - 鼠标移动事件。
   */
  const onPointerMove = (e: MouseEvent | PointerEvent) => {
    if (!open) return;
    if (isFromPickerUiEvent(e)) return;
    blockPageEvent(e);
    if (picked) return;
    const hit = pickElementFromPoint(e.clientX, e.clientY, host);
    updateHighlight(hit ? normalizePickedElement(hit.target) : null);
  };

  /**
   * 点击页面元素时进入“已选中”状态，等待用户从顶部工具条确认加入输入。
   *
   * @param e - 鼠标按下事件。
   */
  const onPointerDown = (e: MouseEvent | PointerEvent) => {
    if (!open) return;
    if (isFromPickerUiEvent(e)) return;

    // 进入"选中态"：拦截整次点击链路，避免触发页面跳转、按钮和右键菜单等副作用。
    blockPageEvent(e);
    if (picked) return;

    const hit = pickElementFromPoint(e.clientX, e.clientY, host);
    if (!hit) return;
    const normalized = normalizePickedElement(hit.target);
    const candidates = buildSelectionCandidates(hit.raw, normalized);
    const index = Math.max(0, candidates.indexOf(normalized));
    selection = { candidates, index };
    refreshPickedUi(candidates[index]);
  };

  /**
   * 选择模式下除 toolbar 外的事件都只用于保护页面，不进入原网页。
   */
  const onBlockOnlyEvent = (e: Event) => {
    if (!open) return;
    if (isFromPickerUiEvent(e)) return;
    blockPageEvent(e);
  };

  /**
   * 受控滚动：阻止页面 wheel 事件副作用，只把滚动量应用到鼠标下方最近滚动容器。
   *
   * @param e - 滚轮事件。
   */
  const onWheel = (e: WheelEvent) => {
    if (!open) return;
    if (isFromPickerUiEvent(e)) return;
    blockPageEvent(e);
    const scrollable = findScrollableAtPoint(e.clientX, e.clientY, host);
    if (scrollable) {
      const he = scrollable as HTMLElement;
      he.scrollTop += e.deltaY;
      he.scrollLeft += e.deltaX;
    } else {
      window.scrollBy({ top: e.deltaY, left: e.deltaX, behavior: 'auto' });
    }
    onViewportChange();
  };

  /**
   * 监听 `Esc` 以退出选择模式。
   *
   * @param e - 键盘事件。
   */
  const onKeyDown = (e: KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'Escape') {
      blockPageEvent(e);
      cleanup({ notifySession: true, reason: 'escape' });
      return;
    }
    if (isFromPickerUiEvent(e)) return;
    blockPageEvent(e);
  };

  /**
   * 点击“加入输入”后提取元素内容并上报给扩展后台。
   *
   * @param e - 顶部工具条点击事件。
   */
  const onCommitClick = (e: MouseEvent) => {
    if (!picked) return;

    e.preventDefault();
    e.stopPropagation();

    void (async () => {
      btnCommit.disabled = true;
      const extracted = await extractPickedElement(picked, tr);
      const visual = shouldUseVisualRegion(picked, extracted) ? buildVisualRegion(picked) : extracted.visual;
      const element: PickedElement = {
        ...extracted,
        ...(visual ? { kind: 'visual' as const, visual } : {}),
        selector: buildCssSelector(picked),
        summary: extracted.summary || (visual ? tr('elementPicker.summary.visual', { tag: picked.tagName?.toLowerCase?.() || 'element' }) : summarizePickedElement(picked, tr)),
      };
      if (isEmptyPickedElement(element)) {
        showCommitError(tr('elementPicker.emptyElement'));
        return false;
      }

      const payload: ElementActionPayload = {
        element,
        source: { url: location.href, title: document.title },
        ...(sessionId ? { sessionId } : {}),
        ...(returnToPanel ? { returnToPanel: true } : {}),
      };

      const response = await sendExtensionMessage<{ ok?: boolean; error?: unknown } | undefined>({
        type: 'element/action',
        payload,
      });
      if (!response?.ok) {
        showCommitError(response?.error
          ? formatI18nText(i18n.t.bind(i18n), normalizeI18nText(response.error))
          : tr('elementPicker.commitFailed'));
        return false;
      }
      return true;
    })()
      .then((sent) => {
        if (sent) cleanup();
      })
      .catch(() => {
        showCommitError(tr('elementPicker.commitFailed'));
      })
      .finally(() => {
        if (open) btnCommit.disabled = false;
      });
  };

  btnCancel.addEventListener('click', onCancelClick, true);
  btnShrink.addEventListener('click', onRangeClick, true);
  btnExpand.addEventListener('click', onRangeClick, true);
  btnCommit.addEventListener('click', onCommitClick, true);
  document.addEventListener('pointermove', onPointerMove, true);
  document.addEventListener('mousemove', onPointerMove, true);
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('mousedown', onPointerDown, true);
  document.addEventListener('pointerup', onBlockOnlyEvent, true);
  document.addEventListener('mouseup', onBlockOnlyEvent, true);
  document.addEventListener('click', onBlockOnlyEvent, true);
  document.addEventListener('dblclick', onBlockOnlyEvent, true);
  document.addEventListener('auxclick', onBlockOnlyEvent, true);
  document.addEventListener('contextmenu', onBlockOnlyEvent, true);
  document.addEventListener('selectstart', onBlockOnlyEvent, true);
  document.addEventListener('dragstart', onBlockOnlyEvent, true);
  document.addEventListener('wheel', onWheel, { capture: true, passive: false });
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('scroll', onViewportChange, true);
  window.addEventListener('resize', onViewportChange, true);
  window.addEventListener('scroll', onViewportChange, true);
}
