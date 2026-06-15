/**
 * 说明：`page-tools-root` 内容脚本 React 注入根模块。
 *
 * 职责：
 * - 为所有 page-facing 网页工具提供唯一 Shadow DOM + React root；
 * - 用 React JSX 渲染划词菜单、隐藏菜单、内联响应卡片、元素选择器与截图编辑器静态 UI；
 * - 向命令式控制器暴露稳定 DOM ref，让 pointer / canvas 热路径不进入 React 高频渲染。
 *
 * 边界：
 * - 本模块不读取网页选区、不发送 runtime 消息、不执行截图导出；
 * - React 只负责 UI 结构、i18n 文案与可访问属性，交互状态仍由各工具 controller 管理。
 */
/* eslint-disable react-refresh/only-export-components -- Content-script React root must export imperative host helpers; Fast Refresh is not used on page-facing overlays. */
import React, { Component, useLayoutEffect, useRef, type ErrorInfo, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import {
  Copy,
  EyeOff,
  Languages,
  Minus,
  MousePointerClick,
  Plus,
  X,
} from 'lucide-react';
import i18n from '@/i18n';
import {
  ScreenshotCaptureTools,
  type PageToolsScreenshotRefs,
  type ScreenshotCaptureRefSetter,
} from '@/plugins/page-tools/screenshot-capture/content/ui';
import { installPageTooltipController, PAGE_TOOLTIP_STYLES } from '../page-tooltip';
import pageToolsShadowCss from './page-tools.shadow.css?inline';
import { PAGE_TOOLS_HOST_Z_INDEX } from './page-tools-tokens';

/** 页面内唯一的网页工具 Shadow host ID。 */
export const PAGE_TOOLS_HOST_ID = '__olyq_shadow_host__';
/** 页面内网页工具 Shadow host 标签名。 */
export const PAGE_TOOLS_HOST_TAG = 'olyq-shadow-host';
/** 隐藏菜单稳定 ID，用于连接 menu button 与 menu。 */
export const PAGE_TOOLS_INLINE_HIDE_PANEL_ID = 'olyq-inline-hide-panel';

/** 划词菜单与内联响应卡片的节点引用集合。 */
export type PageToolsInlineRefs = {
  /** 划词后的悬浮操作菜单。 */
  menu: HTMLDivElement;
  /** 由划词菜单打开的隐藏选项弹出层。 */
  hidePanel: HTMLDivElement;
  /** 内联响应卡片容器。 */
  card: HTMLDivElement;
  /** 内联响应正文区域。 */
  cardBody: HTMLDivElement;
  /** 内联响应标题区域。 */
  cardLabel: HTMLSpanElement;
};

/** 元素选择器 React UI 的节点引用集合。 */
export type PageToolsElementPickerRefs = {
  /** 顶部确认工具条容器。 */
  hint: HTMLDivElement;
  /** 工具条主提示文本。 */
  hintText: HTMLSpanElement;
  /** 当前元素结构摘要。 */
  hintSummary: HTMLSpanElement;
  /** Esc 取消提示。 */
  hintEscCancel: HTMLSpanElement;
  /** 取消按钮。 */
  btnCancel: HTMLButtonElement;
  /** 缩小选择范围按钮。 */
  btnShrink: HTMLButtonElement;
  /** 扩大选择范围按钮。 */
  btnExpand: HTMLButtonElement;
  /** 加入输入按钮。 */
  btnCommit: HTMLButtonElement;
  /** 跟随 hover / picked 目标的高亮框。 */
  highlight: HTMLDivElement;
  /** 透明事件接管层。 */
  eventShield: HTMLDivElement;
};

/** 统一网页工具 React root 暴露给 controller 的引用集合。 */
export type PageToolsRootRefs = {
  /** 页面内 Shadow host。 */
  host: HTMLElement;
  /** 统一 Shadow root。 */
  shadow: ShadowRoot;
  /** 划词与内联响应 UI。 */
  inline: PageToolsInlineRefs;
  /** 元素选择器 UI。 */
  elementPicker: PageToolsElementPickerRefs;
  /** 截图编辑器 UI。 */
  screenshot: PageToolsScreenshotRefs;
};

/** React root 运行时句柄。 */
type PageToolsRootRuntime = {
  /** 页面内 Shadow host。 */
  host: HTMLElement;
  /** Shadow root。 */
  shadow: ShadowRoot;
  /** React root 挂载容器。 */
  mount: HTMLDivElement;
  /** React 18 root。 */
  root: Root;
  /** 所有 controller 复用的 DOM refs。 */
  refs: PageToolsRootRefs;
  /** tooltip controller 清理函数。 */
  cleanupTooltip: (() => void) | null;
};

type MutableRootRefs = {
  inline: Partial<PageToolsInlineRefs>;
  elementPicker: Partial<PageToolsElementPickerRefs>;
  screenshot: Partial<PageToolsScreenshotRefs>;
};

let runtime: PageToolsRootRuntime | null = null;

type PageToolsErrorBoundaryProps = {
  /** Shadow DOM 内的网页工具内容。 */
  children: ReactNode;
};

type PageToolsErrorBoundaryState = {
  /** 是否已捕获渲染错误。 */
  failed: boolean;
};

/**
 * Page-facing 局部错误边界。
 *
 * 说明：
 * - 网页工具渲染错误只能影响 Olyq overlay，不能让宿主页面白屏；
 * - 捕获后异步卸载整个 Shadow host，释放 React root、tooltip controller 和 DOM 节点；
 * - 不吞掉其它运行时链路的错误语义，controller 侧的业务失败仍由各自 UI 降级处理。
 */
class PageToolsErrorBoundary extends Component<PageToolsErrorBoundaryProps, PageToolsErrorBoundaryState> {
  state: PageToolsErrorBoundaryState = { failed: false };

  /** 标记当前 Shadow UI 已不可继续渲染。 */
  static getDerivedStateFromError(): PageToolsErrorBoundaryState {
    return { failed: true };
  }

  /**
   * 捕获渲染错误后卸载 page tools overlay。
   *
   * @param _error - React 捕获到的错误。
   * @param _errorInfo - 组件栈，仅保留签名语义，不在页面运行时裸日志输出。
   */
  componentDidCatch(_error: unknown, _errorInfo: ErrorInfo): void {
    queueMicrotask(() => {
      unmountPageToolsRoot();
    });
  }

  /** 渲染正常子树或空降级。 */
  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

/**
 * 读取当前 content-script 语言下的页面工具文案。
 *
 * @param key - i18n key。
 * @param params - 插值参数。
 * @returns 当前语言文案。
 */
function tr(key: string, params?: Record<string, unknown>) {
  return i18n.t(key, params);
}

/**
 * 为 React 渲染出的 DOM 节点创建稳定 ref callback。
 *
 * @param refs - 本次 React root 收集到的可变 ref 容器。
 * @param section - 当前节点所属工具分区。
 * @param key - 节点在该分区里的稳定名称。
 * @returns React ref callback。
 */
function setRef<T extends HTMLElement>(
  refs: MutableRootRefs,
  section: keyof MutableRootRefs,
  key: string,
) {
  return (node: T | null) => {
    if (node) (refs[section] as Record<string, T>)[key] = node;
  };
}

/**
 * 为截图插件创建统一 root 的 ref setter。
 *
 * @param refs - 本次 React root 收集到的可变 ref 容器。
 * @returns 截图插件可直接使用的 ref callback 工厂。
 */
function setScreenshotRef(refs: MutableRootRefs): ScreenshotCaptureRefSetter {
  return <T extends HTMLElement>(key: keyof PageToolsScreenshotRefs) => (node: T | null) => {
    if (node) (refs.screenshot as Record<keyof PageToolsScreenshotRefs, HTMLElement>)[key] = node;
  };
}

/**
 * 渲染 page-facing 图标按钮，并强制使用共享 tooltip 属性。
 *
 * @param props - 普通按钮属性、tooltip 文案和图标内容。
 * @param ref - controller 需要直接操作的按钮 DOM 引用。
 * @returns React 按钮节点。
 */
const IconOnlyButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: React.ReactNode;
}>((props, ref) => {
  const { label, children, className, ...rest } = props;
  return (
    <button
      {...rest}
      ref={ref}
      className={`chip icon-chip${className ? ` ${className}` : ''}`}
      aria-label={label}
      data-olyq-tooltip={label}
      type="button"
    >
      {children}
    </button>
  );
});
IconOnlyButton.displayName = 'IconOnlyButton';

/**
 * 渲染划词菜单、隐藏菜单和内联响应卡片。
 *
 * @param props - React root 的可变 ref 容器。
 * @returns 划词相关 page-facing UI。
 */
function InlineTools({ refs }: { refs: MutableRootRefs }) {
  const hideLabel = tr('contentScript.hide.hidePageToolsLabel');
  return (
    <>
      <div className="menu" ref={setRef<HTMLDivElement>(refs, 'inline', 'menu')}>
        <span className="dot" />
        <button className="chip" data-action="explain" type="button">⌕ {tr('contentScript.actions.explain')}</button>
        <button className="chip" data-action="translate" type="button"><Languages aria-hidden="true" />{tr('contentScript.actions.translate')}</button>
        <button className="chip" data-action="summarize" type="button">≡ {tr('contentScript.actions.summarize')}</button>
        <span className="sep" />
        <button className="chip primary" data-action="ask" type="button">
          <span>◌ {tr('contentScript.actions.ask')} </span>
          <span className="chevron">›</span>
        </button>
        <IconOnlyButton
          data-hide-trigger="menu"
          aria-haspopup="menu"
          aria-expanded="false"
          aria-controls={PAGE_TOOLS_INLINE_HIDE_PANEL_ID}
          label={hideLabel}
        >
          <EyeOff aria-hidden="true" />
        </IconOnlyButton>
      </div>

      <div
        className="hide-panel"
        id={PAGE_TOOLS_INLINE_HIDE_PANEL_ID}
        role="menu"
        aria-hidden="true"
        aria-label={hideLabel}
        tabIndex={-1}
        ref={setRef<HTMLDivElement>(refs, 'inline', 'hidePanel')}
      >
        <button className="chip" role="menuitem" data-hide-action="dismiss-session" type="button">{tr('contentScript.hide.dismissSession')}</button>
        <button className="chip" role="menuitem" data-hide-action="disable-site" type="button">{tr('contentScript.hide.disableSite')}</button>
        <button className="chip" role="menuitem" data-hide-action="disable-global" type="button">{tr('contentScript.hide.disableGlobal')}</button>
      </div>

      <div className="response-card" ref={setRef<HTMLDivElement>(refs, 'inline', 'card')}>
        <div className="response-header">
          <span className="label" ref={setRef<HTMLSpanElement>(refs, 'inline', 'cardLabel')}>Olyq</span>
          <IconOnlyButton data-card-action="close" label={tr('contentScript.card.close')}>
            <X aria-hidden="true" />
          </IconOnlyButton>
        </div>
        <div className="response-body" ref={setRef<HTMLDivElement>(refs, 'inline', 'cardBody')} />
        <div className="response-footer">
          <button className="chip" data-card-action="copy" type="button"><Copy aria-hidden="true" />{tr('contentScript.card.copy')}</button>
          <button className="chip" data-card-action="open" type="button"><MousePointerClick aria-hidden="true" />{tr('contentScript.card.open')}</button>
        </div>
      </div>
    </>
  );
}

/**
 * 渲染元素选择器的事件 shield、高亮框和确认工具条。
 *
 * @param props - React root 的可变 ref 容器。
 * @returns 元素选择器 page-facing UI。
 */
function ElementPickerTools({ refs }: { refs: MutableRootRefs }) {
  return (
    <>
      <div className="event-shield" ref={setRef<HTMLDivElement>(refs, 'elementPicker', 'eventShield')} />
      <div className="highlight" ref={setRef<HTMLDivElement>(refs, 'elementPicker', 'highlight')} />
      <div className="hint" ref={setRef<HTMLDivElement>(refs, 'elementPicker', 'hint')}>
        <span className="dot" />
        <span className="hint-main">
          <span className="hint-text" data-role="text" ref={setRef<HTMLSpanElement>(refs, 'elementPicker', 'hintText')}>{tr('elementPicker.pickHint')}</span>
          <span className="hint-summary" data-role="summary" ref={setRef<HTMLSpanElement>(refs, 'elementPicker', 'hintSummary')} />
        </span>
        <span className="hint-actions">
          <span className="range-controls" data-role="range-controls">
            <IconOnlyButton data-action="shrink" label={tr('elementPicker.shrink')} disabled ref={setRef<HTMLButtonElement>(refs, 'elementPicker', 'btnShrink') as unknown as React.Ref<HTMLButtonElement>}>
              <Minus aria-hidden="true" />
            </IconOnlyButton>
            <IconOnlyButton data-action="expand" label={tr('elementPicker.expand')} disabled ref={setRef<HTMLButtonElement>(refs, 'elementPicker', 'btnExpand') as unknown as React.Ref<HTMLButtonElement>}>
              <Plus aria-hidden="true" />
            </IconOnlyButton>
          </span>
          <button className="chip commit-button" data-action="commit" disabled type="button" ref={setRef<HTMLButtonElement>(refs, 'elementPicker', 'btnCommit')}>
            {tr('elementPicker.commit')}
          </button>
          <span className="hint-meta" data-role="esc-cancel" ref={setRef<HTMLSpanElement>(refs, 'elementPicker', 'hintEscCancel')}>{tr('elementPicker.escCancel')}</span>
          <button className="chip" data-action="cancel" type="button" ref={setRef<HTMLButtonElement>(refs, 'elementPicker', 'btnCancel')}>
            {tr('common.cancel')}
          </button>
        </span>
      </div>
    </>
  );
}

/**
 * 渲染统一 page tools React 应用。
 *
 * @param props - React root 的可变 ref 容器。
 * @returns 包含所有 page-facing 工具的 Shadow DOM 子树。
 */
function PageToolsApp({ refs }: { refs: MutableRootRefs }) {
  const initialized = useRef(false);
  useLayoutEffect(() => {
    initialized.current = true;
  }, []);
  return (
    <div className="page-tools-root" data-initialized={initialized.current ? 'true' : 'false'}>
      <style>{`${pageToolsShadowCss}\n${PAGE_TOOLTIP_STYLES}`}</style>
      <PageToolsErrorBoundary>
        <InlineTools refs={refs} />
        <ElementPickerTools refs={refs} />
        <ScreenshotCaptureTools setRef={setScreenshotRef(refs)} />
      </PageToolsErrorBoundary>
    </div>
  );
}

/**
 * 获取或创建统一网页工具 React root。
 *
 * @returns 已同步渲染完成、可立即读取 DOM refs 的 root runtime。
 */
export function ensurePageToolsRoot(): PageToolsRootRuntime {
  if (runtime) return runtime;

  let host = document.getElementById(PAGE_TOOLS_HOST_ID) as HTMLElement | null;
  if (!host) {
    host = document.createElement(PAGE_TOOLS_HOST_TAG);
    host.id = PAGE_TOOLS_HOST_ID;
    host.style.all = 'initial';
    host.style.position = 'fixed';
    host.style.inset = '0';
    host.style.zIndex = String(PAGE_TOOLS_HOST_Z_INDEX);
    host.style.pointerEvents = 'none';
    document.documentElement.appendChild(host);
  }

  const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
  shadow.textContent = '';
  const mount = document.createElement('div');
  mount.id = 'olyq-page-tools-react-root';
  shadow.appendChild(mount);

  const mutableRefs: MutableRootRefs = { inline: {}, elementPicker: {}, screenshot: {} };
  const root = createRoot(mount);
  flushSync(() => {
    root.render(<PageToolsApp refs={mutableRefs} />);
  });
  const cleanupTooltip = installPageTooltipController(shadow);
  const refs = {
    host,
    shadow,
    inline: mutableRefs.inline as PageToolsInlineRefs,
    elementPicker: mutableRefs.elementPicker as PageToolsElementPickerRefs,
    screenshot: mutableRefs.screenshot as PageToolsScreenshotRefs,
  };

  runtime = { host, shadow, mount, root, refs, cleanupTooltip };
  return runtime;
}

/**
 * 卸载统一网页工具 React root。
 *
 * 说明：主要用于测试清理；生产路径通常保留 root，单个工具关闭只隐藏对应 UI 并清理监听器。
 */
export function unmountPageToolsRoot(): void {
  const current = runtime;
  if (!current) return;
  current.cleanupTooltip?.();
  current.root.unmount();
  current.host.remove();
  runtime = null;
}
