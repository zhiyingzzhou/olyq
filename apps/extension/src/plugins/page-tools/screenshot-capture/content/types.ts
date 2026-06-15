/**
 * 说明：`screenshot-editor-types` 截图编辑器内部类型模块。
 *
 * 职责：
 * - 集中维护截图编辑器在内容脚本内部共享的常量、几何类型和状态模型；
 * - 避免主入口、React UI 引用、画布绘制与几何计算之间复制结构定义。
 *
 * 边界：
 * - 本模块只导出类型和无副作用常量，不读取 DOM、不访问 runtime、不创建 UI。
 */
import type { ScreenshotEditorOpenPayload } from '@/plugins/page-tools/screenshot-capture/contracts';
import {
  SCREENSHOT_ANNOTATION_COLORS,
  SCREENSHOT_MARK_SIZE_TIERS,
  SCREENSHOT_MOSAIC_SIZE_TIERS,
  SCREENSHOT_TEXT_FONT_SIZES,
} from '@/extension/content-script/page-tools/page-tools-tokens';

export {
  SCREENSHOT_ANNOTATION_COLORS,
  SCREENSHOT_MARK_SIZE_TIERS,
  SCREENSHOT_MOSAIC_SIZE_TIERS,
  SCREENSHOT_TEXT_FONT_SIZES,
};

/** 全局运行时模式标记 key，用于和其它 page-tools 互斥。 */
export const SCREENSHOT_EDITOR_MODE_KEY = '__olyq_screenshot_editor_mode__';
/** 选区允许的最小 CSS 像素尺寸，避免生成不可操作的零面积框。 */
export const SCREENSHOT_EDITOR_MIN_SELECTION_SIZE = 8;

/** 截图编辑器支持的标注工具集合。 */
export type ScreenshotTool = 'rect' | 'circle' | 'arrow' | 'pen' | 'mosaic' | 'text';
/** 截图编辑器当前拖拽会话的模式。 */
export type DragMode = 'select' | 'move' | 'draw' | 'resize' | 'text-move';
/** 选区八向缩放控制点。 */
export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/** 截图标注工具当前会话内的样式状态。 */
export type ScreenshotAnnotationStyle = {
  /** 矩形、圆形、箭头和画笔共享的标注颜色。 */
  sharedColor: string;
  /** 矩形、圆形和箭头线宽，使用 CSS 像素语义，提交到原图时按比例缩放。 */
  strokeSize: number;
  /** 画笔线宽，使用 CSS 像素语义，提交到原图时按比例缩放。 */
  penSize: number;
  /** 马赛克笔刷/块尺寸，值越大马赛克块越粗。 */
  mosaicSize: number;
  /** 文字字号，使用 CSS 像素语义，提交到原图时按比例缩放。 */
  textSize: number;
  /** 文字颜色。 */
  textColor: string;
};

/** 截图标注样式默认值，只在当前截图会话内生效。 */
export const DEFAULT_SCREENSHOT_ANNOTATION_STYLE: ScreenshotAnnotationStyle = {
  sharedColor: SCREENSHOT_ANNOTATION_COLORS[0],
  strokeSize: SCREENSHOT_MARK_SIZE_TIERS[0],
  penSize: SCREENSHOT_MARK_SIZE_TIERS[0],
  mosaicSize: SCREENSHOT_MOSAIC_SIZE_TIERS[1],
  textSize: 24,
  textColor: SCREENSHOT_ANNOTATION_COLORS[0],
};

/** 截图编辑器使用的 CSS 或原图像素矩形。 */
export type Rect = {
  /** 左上角 x 坐标。 */
  x: number;
  /** 左上角 y 坐标。 */
  y: number;
  /** 矩形宽度。 */
  width: number;
  /** 矩形高度。 */
  height: number;
};

/** 截图编辑器使用的二维点坐标。 */
export type Point = {
  /** x 坐标。 */
  x: number;
  /** y 坐标。 */
  y: number;
};

/** 一次 pointer 拖拽会话的起点、原始选区和可选缩放 handle。 */
export type ActiveDrag = {
  /** 本次拖拽的语义模式。 */
  mode: DragMode;
  /** 本次拖拽的起始点；画笔模式会持续推进该点。 */
  start: Point;
  /** 本次拖拽开始时的选区快照。 */
  origin: Rect;
  /** resize 模式下命中的八向控制点。 */
  handle?: ResizeHandle;
  /** text-move 模式下命中的文字标注 ID。 */
  textAnnotationId?: string;
  /** text-move 模式首次发生真实位移前不写撤销栈，避免单击污染历史。 */
  historyCaptured?: boolean;
};

/** 截图文字标注的可移动页面侧对象。 */
export type ScreenshotTextAnnotation = {
  /** 当前截图会话内稳定 ID。 */
  id: string;
  /** 左上角 x 坐标，使用 CSS 视口像素。 */
  x: number;
  /** 左上角 y 坐标，使用 CSS 视口像素。 */
  y: number;
  /** 当前文字块 CSS 宽度，包含 padding 与边界尺寸。 */
  width: number;
  /** 当前文字块 CSS 高度，包含 padding 与边界尺寸。 */
  height: number;
  /** 文本块最大 CSS 宽度，用于 DOM 展示与 Canvas 导出折行。 */
  maxWidth: number;
  /** 用户输入的纯文本内容。 */
  text: string;
  /** 提交时冻结的字号。 */
  fontSize: number;
  /** 提交时冻结的行高。 */
  lineHeight: number;
  /** 提交时冻结的文字颜色。 */
  color: string;
  /** 提交时冻结的字体族。 */
  fontFamily: string;
  /** 提交时冻结的横向 padding。 */
  paddingX: number;
  /** 提交时冻结的纵向 padding。 */
  paddingY: number;
};

/** 撤销栈快照，同时保存 bitmap 标注层和 DOM 文字 rune。 */
export type ScreenshotAnnotationHistoryEntry = {
  /** annotation canvas 的 PNG data URL 快照。 */
  canvasDataUrl: string;
  /** 文字标注对象快照。 */
  textAnnotations: ScreenshotTextAnnotation[];
  /** 当前选中的文字标注 ID。 */
  selectedTextAnnotationId: string | null;
};

/** 截图编辑器 Shadow DOM 节点引用集合。 */
export type ScreenshotEditorUi = {
  /** 页面内 Shadow Host。 */
  host: HTMLElement;
  /** 编辑器 Shadow Root。 */
  shadow: ShadowRoot;
  /** 编辑器根节点。 */
  editor: HTMLDivElement;
  /** 原始视口截图图片。 */
  sourceImage: HTMLImageElement;
  /** 外部遮罩画布。 */
  maskCanvas: HTMLCanvasElement;
  /** 已提交 bitmap 标注画布，使用原图像素坐标；文字 rune 另由 textLayer 承载。 */
  annotationCanvas: HTMLCanvasElement;
  /** 当前拖拽预览画布，使用 CSS 视口坐标。 */
  previewCanvas: HTMLCanvasElement;
  /** 已提交文字标注 DOM 层，承载可拖拽 text rune。 */
  textLayer: HTMLDivElement;
  /** 可移动、可缩放的选区框。 */
  selection: HTMLDivElement;
  /** 选区尺寸提示。 */
  sizeBadge: HTMLDivElement;
  /** 标注工具条。 */
  toolbar: HTMLDivElement;
  /** 当前工具的二级样式设置面板。 */
  toolOptions: HTMLDivElement;
  /** 复制等轻量工具动作的短暂状态反馈。 */
  toolFeedback: HTMLDivElement;
  /** 文本标注临时 contentEditable 编辑框。 */
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

/** 截图编辑器一次打开会话的完整运行态。 */
export type ScreenshotEditorState = {
  /** Service Worker 投递的截图负载。 */
  payload: ScreenshotEditorOpenPayload;
  /** 原始截图图片是否已完成加载。 */
  imageReady: boolean;
  /** 原图像素宽度。 */
  imageWidth: number;
  /** 原图像素高度。 */
  imageHeight: number;
  /** 当前视口 CSS 像素宽度。 */
  viewportWidth: number;
  /** 当前视口 CSS 像素高度。 */
  viewportHeight: number;
  /** 当前选区；为空时只展示遮罩和拖拽入口。 */
  selection: Rect | null;
  /** 当前标注工具；为空时选区可移动。 */
  activeTool: ScreenshotTool | null;
  /** 当前会话内的标注样式状态。 */
  annotationStyle: ScreenshotAnnotationStyle;
  /** 当前 pointer 拖拽会话。 */
  activeDrag: ActiveDrag | null;
  /** 页面侧临时文字标注对象，提交后仍可命中和拖拽。 */
  textAnnotations: ScreenshotTextAnnotation[];
  /** 当前选中的文字标注 ID，只影响页面编辑态边界，不进入导出图像。 */
  selectedTextAnnotationId: string | null;
  /** 标注撤销栈，保存 canvas PNG 和文字对象快照。 */
  history: ScreenshotAnnotationHistoryEntry[];
  /** 关闭当前会话时移除页面事件监听的清理函数。 */
  cleanup: (() => void) | null;
};
