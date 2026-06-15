/**
 * 说明：`screenshot-capture/content/ui` 网页截图插件的静态 React UI。
 *
 * 职责：
 * - 为网页截图插件声明 Shadow DOM 内的工具条、选区、文字编辑层和 OCR 浮窗结构；
 * - 只负责 JSX、i18n、aria 与 tooltip contract；
 * - 把 DOM ref 暴露给截图 controller，Canvas / pointer / wheel 热路径不进入 React 渲染。
 *
 * 边界：
 * - 本模块不读取页面状态、不发送 runtime 消息、不执行截图导出；
 * - OCR 浮窗必须挂在 `.page-tools-root` 顶层，而不是 `.screenshot-editor` 子树内，
 *   否则截图 editor 关闭后父层 `display:none` 会让 OCR loading / 结果不可见。
 */
import React from 'react';
import {
  ArrowUpRight,
  Check,
  Circle,
  Copy,
  Download,
  Pencil,
  RotateCcw,
  Square,
  Type,
  X,
  createLucideIcon,
} from 'lucide-react';
import i18n from '@/i18n';
import {
  SCREENSHOT_ANNOTATION_COLORS,
  SCREENSHOT_MARK_SIZE_TIERS,
  SCREENSHOT_MOSAIC_SIZE_TIERS,
  SCREENSHOT_TEXT_FONT_SIZES,
  type ResizeHandle,
  type ScreenshotTool,
} from './types';

/** 截图编辑器 React UI 的节点引用集合。 */
export type PageToolsScreenshotRefs = {
  /** 编辑器根节点。 */
  editor: HTMLDivElement;
  /** 原始视口截图图片。 */
  sourceImage: HTMLImageElement;
  /** 遮罩画布。 */
  maskCanvas: HTMLCanvasElement;
  /** 已提交 bitmap 标注画布，使用原图像素坐标。 */
  annotationCanvas: HTMLCanvasElement;
  /** 当前拖拽预览画布，使用视口 CSS 坐标。 */
  previewCanvas: HTMLCanvasElement;
  /** 已提交文字标注 DOM 层。 */
  textLayer: HTMLDivElement;
  /** 可移动、可缩放选区框。 */
  selection: HTMLDivElement;
  /** 选区尺寸提示。 */
  sizeBadge: HTMLDivElement;
  /** 截图工具条。 */
  toolbar: HTMLDivElement;
  /** 当前工具的二级样式设置面板。 */
  toolOptions: HTMLDivElement;
  /** 复制等轻量工具动作的短暂状态反馈。 */
  toolFeedback: HTMLDivElement;
  /** 文字标注临时 contentEditable 编辑框。 */
  textInput: HTMLDivElement;
  /** 截图 OCR 识别结果浮窗。 */
  ocrPopover: HTMLDivElement;
  /** OCR 浮窗可拖拽标题栏。 */
  ocrHeader: HTMLDivElement;
  /** OCR 浮窗正文区域。 */
  ocrBody: HTMLDivElement;
  /** OCR 浮窗文本展示区。 */
  ocrContent: HTMLPreElement;
  /** OCR 浮窗加载态。 */
  ocrLoading: HTMLDivElement;
  /** OCR 浮窗复制按钮。 */
  ocrCopyButton: HTMLButtonElement;
  /** OCR 浮窗关闭按钮。 */
  ocrCloseButton: HTMLButtonElement;
};

/** 截图插件把 React DOM 节点交给统一 page-tools root 的 ref setter。 */
export type ScreenshotCaptureRefSetter = <T extends HTMLElement>(
  key: keyof PageToolsScreenshotRefs,
) => (node: T | null) => void;

/** 读取当前 content-script 语言下的截图文案。 */
function tr(key: string, params?: Record<string, unknown>) {
  return i18n.t(key, params);
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
 * 马赛克工具专用图标。
 *
 * 说明：参考 IconPark `source/Edit/mosaic.svg` 的棋盘式 mosaic 语义，收敛为
 * 本地 `createLucideIcon`，仍使用 24 viewBox 与 `currentColor`，不引入远程 icon font。
 */
const MosaicIcon = createLucideIcon('Mosaic', [
  ['path', { d: 'M22 18h-4v4h4v-4Z', fill: 'currentColor', stroke: 'none', key: 'pixel-bottom-right' }],
  ['path', { d: 'M14 18h-4v4h4v-4Z', fill: 'currentColor', stroke: 'none', key: 'pixel-bottom-center' }],
  ['path', { d: 'M6 18H2v4h4v-4Z', fill: 'currentColor', stroke: 'none', key: 'pixel-bottom-left' }],
  ['path', { d: 'M22 10h-4v4h4v-4Z', fill: 'currentColor', stroke: 'none', key: 'pixel-middle-right' }],
  ['path', { d: 'M14 10h-4v4h4v-4Z', fill: 'currentColor', stroke: 'none', key: 'pixel-middle-center' }],
  ['path', { d: 'M6 10H2v4h4v-4Z', fill: 'currentColor', stroke: 'none', key: 'pixel-middle-left' }],
  ['path', { d: 'M22 2h-4v4h4V2Z', fill: 'currentColor', stroke: 'none', key: 'pixel-top-right' }],
  ['path', { d: 'M14 2h-4v4h4V2Z', fill: 'currentColor', stroke: 'none', key: 'pixel-top-center' }],
  ['path', { d: 'M6 2H2v4h4V2Z', fill: 'currentColor', stroke: 'none', key: 'pixel-top-left' }],
  ['path', { d: 'M10 6H6v4h4V6Z', fill: 'currentColor', stroke: 'none', key: 'pixel-upper-left' }],
  ['path', { d: 'M10 14H6v4h4v-4Z', fill: 'currentColor', stroke: 'none', key: 'pixel-lower-left' }],
  ['path', { d: 'M18 6h-4v4h4V6Z', fill: 'currentColor', stroke: 'none', key: 'pixel-upper-right' }],
  ['path', { d: 'M18 14h-4v4h4v-4Z', fill: 'currentColor', stroke: 'none', key: 'pixel-lower-right' }],
]);

/** 渲染截图标注工具按钮。 */
function ScreenshotToolbarButton({ tool, label, children }: {
  tool: ScreenshotTool;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <IconOnlyButton data-tool={tool} label={label}>
      {children}
    </IconOnlyButton>
  );
}

/** 渲染截图工具条中的文字动作按钮，并接入 page-facing tooltip contract。 */
function ScreenshotToolbarActionButton({ action, label, children }: {
  action: string;
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      className="chip primary"
      data-action={action}
      data-olyq-tooltip={label}
      type="button"
    >
      {children ?? label}
    </button>
  );
}

/** 渲染截图标注工具的二级样式设置面板。 */
function ScreenshotToolOptions({ setRef }: { setRef: ScreenshotCaptureRefSetter }) {
  return (
    <div
      className="tool-options"
      ref={setRef<HTMLDivElement>('toolOptions')}
      aria-label={tr('screenshotEditor.options.label')}
    >
      <span className="tool-options-group" data-options-group="color">
        {SCREENSHOT_ANNOTATION_COLORS.map((color) => {
          const label = tr('screenshotEditor.options.color', { color });
          return (
            <button
              aria-label={label}
              className="style-chip color-chip"
              data-olyq-tooltip={label}
              data-style-color={color}
              key={color}
              style={{ '--swatch-color': color } as React.CSSProperties}
              type="button"
            >
              <span aria-hidden="true" />
            </button>
          );
        })}
      </span>
      <span className="tool-options-group" data-options-group="size">
        {SCREENSHOT_MARK_SIZE_TIERS.map((size) => {
          const label = tr('screenshotEditor.options.size', { size });
          return (
            <button
              aria-label={label}
              className="style-chip size-chip"
              data-olyq-tooltip={label}
              data-style-size={size}
              key={`mark-${size}`}
              type="button"
            >
              <span aria-hidden="true" style={{ width: size, height: size }} />
            </button>
          );
        })}
        {SCREENSHOT_MOSAIC_SIZE_TIERS.map((size) => {
          const label = tr('screenshotEditor.options.size', { size });
          return (
            <button
              aria-label={label}
              className="style-chip size-chip"
              data-olyq-tooltip={label}
              data-mosaic-style-size={size}
              key={`mosaic-${size}`}
              type="button"
            >
              <span aria-hidden="true" style={{ width: size, height: size }} />
            </button>
          );
        })}
      </span>
      <span className="tool-options-group" data-options-group="font-size">
        {SCREENSHOT_TEXT_FONT_SIZES.map((size) => {
          const label = tr('screenshotEditor.options.fontSize', { size });
          return (
            <button
              aria-label={label}
              className="style-chip font-size-chip"
              data-olyq-tooltip={label}
              data-style-font-size={size}
              key={size}
              type="button"
            >
              {size}
            </button>
          );
        })}
      </span>
    </div>
  );
}

/** 渲染截图编辑器的图片层、Canvas 层、选区层、工具条和文字输入层。 */
function ScreenshotEditorLayer({ setRef }: { setRef: ScreenshotCaptureRefSetter }) {
  const handles: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  return (
    <div className="screenshot-editor" ref={setRef<HTMLDivElement>('editor')}>
      <img className="source-image" alt="" ref={setRef<HTMLImageElement>('sourceImage')} />
      <canvas className="mask-canvas" ref={setRef<HTMLCanvasElement>('maskCanvas')} />
      <canvas className="annotation-canvas" ref={setRef<HTMLCanvasElement>('annotationCanvas')} />
      <canvas className="preview-canvas" ref={setRef<HTMLCanvasElement>('previewCanvas')} />
      <div className="text-annotation-layer" ref={setRef<HTMLDivElement>('textLayer')} />
      <div className="selection" ref={setRef<HTMLDivElement>('selection')}>
        {handles.map((handle) => (
          <span className="selection-handle" data-handle={handle} key={handle} />
        ))}
      </div>
      <div className="size-badge" ref={setRef<HTMLDivElement>('sizeBadge')} />
      <div
        className="tool-feedback"
        aria-live="polite"
        ref={setRef<HTMLDivElement>('toolFeedback')}
        role="status"
      />
      <div className="screenshot-toolbar" ref={setRef<HTMLDivElement>('toolbar')}>
        <span className="dot" />
        <ScreenshotToolbarActionButton action="chat" label={tr('screenshotEditor.actions.chat')} />
        <ScreenshotToolbarActionButton action="ocr" label={tr('screenshotEditor.actions.ocr')} />
        <span className="sep" />
        <ScreenshotToolbarButton tool="rect" label={tr('screenshotEditor.tools.rect')}><Square aria-hidden="true" /></ScreenshotToolbarButton>
        <ScreenshotToolbarButton tool="circle" label={tr('screenshotEditor.tools.circle')}><Circle aria-hidden="true" /></ScreenshotToolbarButton>
        <ScreenshotToolbarButton tool="arrow" label={tr('screenshotEditor.tools.arrow')}><ArrowUpRight aria-hidden="true" /></ScreenshotToolbarButton>
        <ScreenshotToolbarButton tool="pen" label={tr('screenshotEditor.tools.pen')}><Pencil aria-hidden="true" /></ScreenshotToolbarButton>
        <ScreenshotToolbarButton tool="mosaic" label={tr('screenshotEditor.tools.mosaic')}><MosaicIcon /></ScreenshotToolbarButton>
        <ScreenshotToolbarButton tool="text" label={tr('screenshotEditor.tools.text')}><Type aria-hidden="true" /></ScreenshotToolbarButton>
        <span className="sep" />
        <IconOnlyButton data-action="undo" label={tr('screenshotEditor.actions.undo')}><RotateCcw aria-hidden="true" /></IconOnlyButton>
        <IconOnlyButton data-action="copy" label={tr('screenshotEditor.actions.copy')}><Copy aria-hidden="true" /></IconOnlyButton>
        <IconOnlyButton data-action="download" label={tr('screenshotEditor.actions.download')}><Download aria-hidden="true" /></IconOnlyButton>
        <IconOnlyButton data-action="close" label={tr('screenshotEditor.actions.close')}><X aria-hidden="true" /></IconOnlyButton>
        <IconOnlyButton data-action="confirm" label={tr('screenshotEditor.actions.confirm')}><Check aria-hidden="true" /></IconOnlyButton>
      </div>
      <ScreenshotToolOptions setRef={setRef} />
      <div
        className="text-editor"
        aria-label={tr('screenshotEditor.textInput')}
        aria-multiline="true"
        contentEditable
        data-olyq-text-editor="true"
        ref={setRef<HTMLDivElement>('textInput')}
        role="textbox"
        spellCheck={false}
      />
    </div>
  );
}

/** 渲染截图 OCR 结果浮窗；它与全屏 editor 是 sibling，避免被 editor 关闭隐藏。 */
function ScreenshotOcrPopoverLayer({ setRef }: { setRef: ScreenshotCaptureRefSetter }) {
  return (
    <div
      className="ocr-popover"
      aria-labelledby="olyq-screenshot-ocr-title"
      aria-modal="false"
      data-state="loading"
      ref={setRef<HTMLDivElement>('ocrPopover')}
      role="dialog"
    >
      <div className="ocr-header" ref={setRef<HTMLDivElement>('ocrHeader')}>
        <span id="olyq-screenshot-ocr-title" className="ocr-title">{tr('screenshotEditor.ocr.title')}</span>
        <IconOnlyButton
          data-ocr-action="close"
          label={tr('screenshotEditor.ocr.close')}
          ref={setRef<HTMLButtonElement>('ocrCloseButton')}
        >
          <X aria-hidden="true" />
        </IconOnlyButton>
      </div>
      <div className="ocr-body" aria-live="polite" ref={setRef<HTMLDivElement>('ocrBody')}>
        <div className="ocr-loading" ref={setRef<HTMLDivElement>('ocrLoading')}>
          <span className="ocr-spinner" aria-hidden="true" />
          <span>{tr('screenshotEditor.ocr.loading')}</span>
        </div>
        <pre className="ocr-content" ref={setRef<HTMLPreElement>('ocrContent')} />
      </div>
      <div className="ocr-footer">
        <button
          aria-label={tr('screenshotEditor.ocr.copy')}
          className="chip primary"
          data-ocr-action="copy"
          data-olyq-tooltip={tr('screenshotEditor.ocr.copy')}
          disabled
          ref={setRef<HTMLButtonElement>('ocrCopyButton')}
          type="button"
        >
          {tr('screenshotEditor.ocr.copy')}
        </button>
      </div>
    </div>
  );
}

/**
 * 渲染网页截图插件的 page-facing UI。
 *
 * @param props - 统一 page-tools root 提供的 ref setter。
 * @returns 截图编辑器与 OCR 浮窗两个独立顶层 layer。
 */
export function ScreenshotCaptureTools({ setRef }: { setRef: ScreenshotCaptureRefSetter }) {
  return (
    <>
      <ScreenshotEditorLayer setRef={setRef} />
      <ScreenshotOcrPopoverLayer setRef={setRef} />
    </>
  );
}
