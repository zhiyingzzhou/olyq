/**
 * 说明：`MarkdownMermaidBlock` 组件模块。
 *
 * 职责：
 * - 负责 Mermaid 图表在消息气泡中的渲染、流式占位和失败回退；
 * - 把 Mermaid 的重型运行时和错误恢复边界收口到单独组件，避免 Markdown 主渲染器继续膨胀；
 *
 * 边界：
 * - 这里只处理 Mermaid fenced block；
 * - 不负责通用 Markdown、代码高亮或公式渲染。
 */
import { Copy, ZoomIn } from 'lucide-react';
import { type CSSProperties, type ReactNode, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MediaPreviewOverlay } from '@/components/chat/MediaPreviewOverlay';
import { TooltipAction } from '@/components/ui/tooltip-action';
import { toast } from '@/hooks/useToast';
import { subscribeThemeChange } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { isDynamicImportFetchError, reloadOnceForDynamicImportError } from './markdown-runtime-recovery';

let mermaidPromise: Promise<(typeof import('mermaid'))['default']> | null = null;
let mermaidQueue: Promise<unknown> = Promise.resolve();
const MERMAID_RESPONSIVE_DIAGRAM_CONFIG = { useMaxWidth: true } as const;
const MERMAID_MAX_READABLE_WIDTH = 1200;
type MermaidRuntimeConfig = Parameters<(typeof import('mermaid'))['default']['initialize']>[0];

type MermaidRenderResult = {
  readonly naturalHeight: number | null;
  readonly naturalWidth: number | null;
  readonly readableWidth: number | null;
  readonly svg: string;
};

/**
 * 懒加载 Mermaid 运行时，并在模块级复用同一个加载 Promise。
 *
 * @returns Mermaid 默认导出实例。
 */
function loadMermaid() {
  mermaidPromise ??= import('mermaid').then((module) => module.default);
  return mermaidPromise;
}

/**
 * 将 Mermaid 的 initialize + render 串行化执行。
 *
 * @param fn - 单次 Mermaid 渲染任务。
 * @returns 当前任务的渲染结果。
 */
function enqueueMermaidRender(fn: () => Promise<MermaidRenderResult | null>): Promise<MermaidRenderResult | null> {
  const task = mermaidQueue.then(fn, fn);
  mermaidQueue = task.catch(() => {});
  return task;
}

/**
 * 生成聊天域 Mermaid 的唯一运行时配置。
 *
 * @param isDark - 当前是否处于深色主题。
 * @returns Mermaid 初始化配置。
 */
function createMermaidConfig(isDark: boolean): MermaidRuntimeConfig {
  return {
    startOnLoad: false,
    theme: isDark ? 'dark' : 'default',
    securityLevel: 'strict',
    htmlLabels: false,
    flowchart: MERMAID_RESPONSIVE_DIAGRAM_CONFIG,
    sequence: MERMAID_RESPONSIVE_DIAGRAM_CONFIG,
    class: MERMAID_RESPONSIVE_DIAGRAM_CONFIG,
    state: MERMAID_RESPONSIVE_DIAGRAM_CONFIG,
    er: MERMAID_RESPONSIVE_DIAGRAM_CONFIG,
    gantt: MERMAID_RESPONSIVE_DIAGRAM_CONFIG,
    journey: MERMAID_RESPONSIVE_DIAGRAM_CONFIG,
    gitGraph: MERMAID_RESPONSIVE_DIAGRAM_CONFIG,
    mindmap: MERMAID_RESPONSIVE_DIAGRAM_CONFIG,
    timeline: MERMAID_RESPONSIVE_DIAGRAM_CONFIG,
    quadrantChart: MERMAID_RESPONSIVE_DIAGRAM_CONFIG,
    requirement: MERMAID_RESPONSIVE_DIAGRAM_CONFIG,
    c4: MERMAID_RESPONSIVE_DIAGRAM_CONFIG,
    sankey: MERMAID_RESPONSIVE_DIAGRAM_CONFIG,
  };
}

/**
 * 解析 SVG 长度属性里的数值部分。
 *
 * @param value - SVG 长度字符串，可带 `px` 等单位。
 * @returns 可用于 CSS 像素宽高的正数；无法解析时返回 `null`。
 */
function parseSvgLength(value: string | null) {
  const numeric = Number.parseFloat(value ?? '');
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

/**
 * 从 viewBox 里读取 SVG 的自然尺寸。
 *
 * @param value - SVG `viewBox` 字符串。
 * @returns viewBox 宽高；无法解析时返回 `null`。
 */
function parseSvgViewBoxSize(value: string | null) {
  const parts = (value ?? '').trim().split(/[\s,]+/).map((part) => Number.parseFloat(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null;

  const [, , width, height] = parts;
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

/**
 * 判断当前 Mermaid 源码是否属于天然宽图族。
 *
 * @param chart - Mermaid 原始图表文本。
 * @returns 宽图族返回 `true`，用于提高内嵌可读宽度下限。
 */
function isWideMermaidChart(chart: string) {
  return /^\s*(gantt|timeline|sequenceDiagram|sequenceDiagram-v2)\b/i.test(chart);
}

/**
 * 计算内嵌 Mermaid 图表的可读宽度。
 *
 * @param naturalWidth - SVG 自然宽度。
 * @param wideChart - 是否属于 Gantt / timeline / sequence 这类天然宽图。
 * @returns 写入 CSS 变量的像素宽度。
 */
function resolveReadableMermaidWidth(naturalWidth: number, wideChart: boolean) {
  const cappedWidth = Math.min(naturalWidth, MERMAID_MAX_READABLE_WIDTH);
  return wideChart ? Math.max(cappedWidth, 720) : cappedWidth;
}

/**
 * 在 SVG 的 `style` 属性上稳定写入 CSS 声明。
 *
 * @remarks
 * Mermaid 返回的是字符串形式 SVG；用 XML parser 规范化时，测试环境和浏览器对
 * `SVGElement.style` 的支持并不完全一致，因此这里直接维护 `style` 属性，避免规范化
 * 失败后误回退源码卡片。
 *
 * @param svg - Mermaid 根 SVG 节点。
 * @param declarations - 需要写入或覆盖的 CSS 声明。
 */
function setSvgStyleDeclarations(svg: Element, declarations: Record<string, string>) {
  const entries = new Map<string, string>();
  const existingStyle = svg.getAttribute('style') ?? '';

  for (const declaration of existingStyle.split(';')) {
    const [rawName, ...rawValueParts] = declaration.split(':');
    const name = rawName?.trim();
    const value = rawValueParts.join(':').trim();
    if (!name || !value) continue;
    entries.set(name, value);
  }

  for (const [name, value] of Object.entries(declarations)) {
    entries.set(name, value);
  }

  svg.setAttribute('style', Array.from(entries, ([name, value]) => `${name}: ${value}`).join('; '));
}

/**
 * 规范化 Mermaid 产出的根 SVG。
 *
 * @param rendered - Mermaid 原始 SVG 字符串。
 * @param chart - Mermaid 原始图表文本，用于识别宽图族并设置可读宽度。
 * @returns 带稳定 class、viewBox 与 preserveAspectRatio 的 SVG 字符串，以及供交互层复用的自然尺寸。
 */
function normalizeMermaidSvg(rendered: string, chart: string): MermaidRenderResult {
  if (typeof DOMParser === 'undefined') {
    return {
      naturalHeight: null,
      naturalWidth: null,
      readableWidth: null,
      svg: rendered,
    };
  }

  const parser = new DOMParser();
  const document = parser.parseFromString(rendered, 'image/svg+xml');
  const svg = document.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== 'svg') {
    return {
      naturalHeight: null,
      naturalWidth: null,
      readableWidth: null,
      svg: rendered,
    };
  }

  const width = svg.getAttribute('width') || '';
  const height = svg.getAttribute('height') || '';
  if (!svg.getAttribute('viewBox')) {
    const numericWidth = parseSvgLength(width);
    const numericHeight = parseSvgLength(height);
    if (numericWidth && numericHeight) {
      svg.setAttribute('viewBox', `0 0 ${numericWidth} ${numericHeight}`);
    }
  }

  const viewBoxSize = parseSvgViewBoxSize(svg.getAttribute('viewBox'));
  const naturalWidth = viewBoxSize?.width ?? parseSvgLength(width);
  const naturalHeight = viewBoxSize?.height ?? parseSvgLength(height);
  const readableWidth = naturalWidth ? resolveReadableMermaidWidth(naturalWidth, isWideMermaidChart(chart)) : null;
  const styleDeclarations: Record<string, string> = {
    'max-width': 'none',
    'height': 'auto',
  };
  if (naturalWidth) {
    styleDeclarations['--olyq-mermaid-natural-width'] = `${naturalWidth}px`;
    styleDeclarations['--olyq-mermaid-readable-width'] = `${readableWidth}px`;
  }
  if (naturalHeight) {
    styleDeclarations['--olyq-mermaid-natural-height'] = `${naturalHeight}px`;
  }
  setSvgStyleDeclarations(svg, styleDeclarations);

  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('class', cn(svg.getAttribute('class'), 'olyq-mermaid-svg'));
  return {
    naturalHeight,
    naturalWidth,
    readableWidth,
    svg: new XMLSerializer().serializeToString(svg),
  };
}

type MermaidSourceCardProps = {
  activeView?: MermaidView;
  chart: string;
  diagramDisabled?: boolean;
  note?: string;
  onCopy?: () => void;
  onViewChange?: (view: MermaidView) => void;
  showCopyButton?: boolean;
  showViewToggle?: boolean;
  showRefresh?: boolean;
  onRefresh?: () => void;
};

type MermaidView = 'diagram' | 'source';

type MermaidCardFrameProps = {
  activeView: MermaidView;
  children: ReactNode;
  diagramDisabled?: boolean;
  note?: string;
  headerActions?: ReactNode;
  onRefresh?: () => void;
  onViewChange?: (view: MermaidView) => void;
  showRefresh?: boolean;
  showViewToggle?: boolean;
};

/**
 * Mermaid 统一卡片框架。
 *
 * @param props - 当前视图、说明文案、可选切换器和内容。
 * @returns 统一的 Mermaid 卡片外壳。
 */
function MermaidCardFrame({
  activeView,
  children,
  diagramDisabled = false,
  headerActions,
  note,
  onRefresh,
  onViewChange,
  showRefresh = false,
  showViewToggle = false,
}: MermaidCardFrameProps) {
  const { t } = useTranslation();

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-border/60 bg-muted/30" data-testid="markdown-mermaid-block">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/50 bg-background/70 px-4 py-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground/80">
          {activeView === 'diagram' ? t('markdown.mermaidDiagram') : t('markdown.mermaidSource')}
        </span>
        {note ? <span className="min-w-0 flex-1 truncate">{note}</span> : <div className="flex-1" />}
        {showViewToggle ? (
          <div
            className="inline-flex items-center rounded-md border border-border/60 bg-background/80 p-0.5"
            role="group"
            aria-label={t('markdown.mermaidViewToggle')}
          >
            <button
              type="button"
              className={cn(
                'rounded px-2 py-1 text-xs transition-colors',
                activeView === 'diagram'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-foreground/75 hover:bg-accent',
                diagramDisabled && 'cursor-not-allowed text-muted-foreground/60 hover:bg-transparent',
              )}
              aria-pressed={activeView === 'diagram'}
              disabled={diagramDisabled}
              data-testid="markdown-mermaid-view-diagram"
              onClick={() => onViewChange?.('diagram')}
            >
              {t('markdown.mermaidViewDiagram')}
            </button>
            <button
              type="button"
              className={cn(
                'rounded px-2 py-1 text-xs transition-colors',
                activeView === 'source'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-foreground/75 hover:bg-accent',
              )}
              aria-pressed={activeView === 'source'}
              data-testid="markdown-mermaid-view-source"
              onClick={() => onViewChange?.('source')}
            >
              {t('markdown.mermaidViewSource')}
            </button>
          </div>
        ) : null}
        {headerActions}
        {showRefresh ? (
          <button
            type="button"
            className="rounded-md border border-border/60 px-2 py-1 text-foreground/80 transition-colors hover:bg-accent"
            onClick={onRefresh}
          >
            {t('common.refresh')}
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/**
 * Mermaid 源码回退卡片。
 *
 * @param props - 当前源码、提示文案与可选刷新动作。
 * @returns 稳定的源码展示卡片。
 */
function MermaidSourceCard({
  activeView = 'source',
  chart,
  diagramDisabled = false,
  note,
  onCopy,
  onRefresh,
  onViewChange,
  showCopyButton = false,
  showRefresh = false,
  showViewToggle = false,
}: MermaidSourceCardProps) {
  const { t } = useTranslation();

  return (
    <MermaidCardFrame
      activeView={activeView}
      diagramDisabled={diagramDisabled}
      headerActions={showCopyButton ? (
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-2 py-1 text-foreground/80 transition-colors hover:bg-accent"
          onClick={onCopy}
        >
          <Copy className="h-3.5 w-3.5" />
          <span>{t('common.copy')}</span>
        </button>
      ) : null}
      note={note}
      onRefresh={onRefresh}
      onViewChange={onViewChange}
      showRefresh={showRefresh}
      showViewToggle={showViewToggle}
    >
      <pre className="max-h-[26rem] overflow-auto px-4 py-3 text-xs leading-6 text-foreground/85" data-testid="markdown-mermaid-source">
        <code>{chart}</code>
      </pre>
    </MermaidCardFrame>
  );
}

/** 导出类型：`MarkdownMermaidBlockProps`。 */
export interface MarkdownMermaidBlockProps {
  chart: string;
  isStreaming?: boolean;
}

/**
 * Mermaid 图表渲染块。
 *
 * @param props - Mermaid 原始图表文本与当前是否仍在流式输出。
 * @returns 已渲染的 Mermaid 图表，或稳定的源码占位 / 回退卡片。
 */
export function MarkdownMermaidBlock({ chart, isStreaming = false }: MarkdownMermaidBlockProps) {
  const { t } = useTranslation();
  const instanceId = useId().replace(/:/g, '_');
  const [activeView, setActiveView] = useState<MermaidView>(isStreaming ? 'source' : 'diagram');
  const [renderResult, setRenderResult] = useState<MermaidRenderResult | null>(null);
  const [renderError, setRenderError] = useState<unknown>(null);
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const off = subscribeThemeChange(() => setIsDark(document.documentElement.classList.contains('dark')));
    return () => off();
  }, []);

  useEffect(() => {
    setActiveView(isStreaming ? 'source' : 'diagram');
  }, [chart, isStreaming]);

  useEffect(() => {
    let cancelled = false;
    setZoomed(false);

    if (isStreaming) {
      setRenderResult(null);
      setRenderError(null);
      return () => {
        cancelled = true;
      };
    }

    setRenderResult(null);
    setRenderError(null);

    void enqueueMermaidRender(async () => {
      const mermaid = await loadMermaid();
      if (cancelled) return null;

      mermaid.initialize(createMermaidConfig(isDark));

      const id = `mermaid-${instanceId}`;
      const { svg: rendered } = await mermaid.render(id, chart);
      return normalizeMermaidSvg(rendered, chart);
    })
      .then((rendered) => {
        if (!cancelled && rendered) setRenderResult(rendered);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (reloadOnceForDynamicImportError(error)) return;
        setRenderError(error);
      });

    return () => {
      cancelled = true;
    };
  }, [chart, instanceId, isDark, isStreaming]);

  const svg = renderResult?.svg ?? '';
  const mermaidInlineSizeStyle = renderResult ? ({
    ...(renderResult.naturalWidth ? { '--olyq-mermaid-natural-width': `${renderResult.naturalWidth}px` } : {}),
    ...(renderResult.naturalHeight ? { '--olyq-mermaid-natural-height': `${renderResult.naturalHeight}px` } : {}),
    ...(renderResult.readableWidth ? { '--olyq-mermaid-readable-width': `${renderResult.readableWidth}px` } : {}),
  } as CSSProperties) : undefined;
  const diagramReady = !isStreaming && !renderError && Boolean(renderResult?.svg);
  const resolvedView: MermaidView = diagramReady ? activeView : 'source';
  const note = isStreaming
    ? t('markdown.mermaidRenderAfterStream')
    : renderError
      ? t('markdown.mermaidRenderFallback')
      : !renderResult
        ? t('markdown.mermaidRendering')
        : undefined;
  const showViewToggle = !renderError;
  const showCopyButton = resolvedView === 'source' && !isStreaming && chart.trim().length > 0;

  /**
   * 在 Mermaid 可视化和源码之间切换当前视图。
   *
   * @param view - 目标视图；图表尚未就绪时会拒绝切到 `diagram`。
   */
  const handleViewChange = (view: MermaidView) => {
    if (view === 'diagram' && !diagramReady) return;
    setActiveView(view);
  };

  /**
   * 复制当前 Mermaid 源码，并沿用站内统一 toast 反馈。
   */
  const handleCopySource = async () => {
    try {
      await navigator.clipboard.writeText(chart);
      toast({ title: t('chat.copied'), description: t('message.copiedPlain') });
    } catch {
      toast({ title: t('common.error'), description: t('sidebar.clipboardFailed'), variant: 'destructive' });
    }
  };

  if (isStreaming) {
    return (
      <MermaidSourceCard
        activeView={resolvedView}
        chart={chart}
        diagramDisabled
        note={note}
        onViewChange={handleViewChange}
        showViewToggle={showViewToggle}
      />
    );
  }

  if (renderError) {
    return (
      <MermaidSourceCard
        activeView={resolvedView}
        chart={chart}
        note={note}
        onCopy={() => { void handleCopySource(); }}
        showRefresh={isDynamicImportFetchError(renderError)}
        showCopyButton={showCopyButton}
        onRefresh={() => window.location.reload()}
      />
    );
  }

  if (!svg) {
    return (
      <MermaidSourceCard
        activeView={resolvedView}
        chart={chart}
        diagramDisabled
        note={note}
        onCopy={() => { void handleCopySource(); }}
        onViewChange={handleViewChange}
        showCopyButton={showCopyButton}
        showViewToggle={showViewToggle}
      />
    );
  }

  /** 打开 Mermaid 大图预览。 */
  const openPreview = () => {
    if (!renderResult?.svg) return;
    setZoomed(true);
  };

  return (
    <>
      {resolvedView === 'source' ? (
        <MermaidSourceCard
          activeView={resolvedView}
          chart={chart}
          note={note}
          onCopy={() => { void handleCopySource(); }}
          onViewChange={handleViewChange}
          showCopyButton={showCopyButton}
          showViewToggle={showViewToggle}
        />
      ) : (
        <MermaidCardFrame
          activeView={resolvedView}
          note={note}
          onViewChange={handleViewChange}
          showViewToggle={showViewToggle}
        >
          <div className="olyq-mermaid-inline-scroll overflow-x-auto p-4">
            <TooltipAction tooltip={t('markdown.mermaidPreview')}>
              <button
                type="button"
                className="olyq-mermaid-inline-trigger group relative mx-auto block max-w-none cursor-zoom-in text-left"
                style={mermaidInlineSizeStyle}
                aria-label={t('markdown.mermaidPreview')}
                onClick={openPreview}
              >
                <div className="mermaid olyq-mermaid-diagram" data-testid="markdown-mermaid-diagram" dangerouslySetInnerHTML={{ __html: svg }} />
                <div className="olyq-mermaid-preview-hover-layer pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-black/0 transition-colors group-hover:bg-black/10">
                  <ZoomIn className="h-6 w-6 text-foreground/80 opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
              </button>
            </TooltipAction>
          </div>
        </MermaidCardFrame>
      )}

      <MediaPreviewOverlay
        open={zoomed}
        onClose={() => setZoomed(false)}
        ariaLabel={t('markdown.mermaidPreviewTitle')}
      >
        <div className="max-h-[86vh] max-w-[94vw] overflow-auto rounded-lg border border-border/60 bg-background/90 p-4 shadow-2xl">
          <div className="mermaid olyq-mermaid-diagram olyq-mermaid-diagram-preview" dangerouslySetInnerHTML={{ __html: svg }} />
        </div>
      </MediaPreviewOverlay>
    </>
  );
}
