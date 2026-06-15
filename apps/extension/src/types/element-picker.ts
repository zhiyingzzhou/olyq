/**
 * 说明：`element-picker` 类型定义模块。
 *
 * 职责：
 * - 承载 `element-picker` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ElementPickerAction`、`PickedImage`、`PickedTable`、`PickedElement` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 划词助手支持的动作类型。
 *
 * 说明：
 * - 该类型继续服务普通划词菜单；
 * - 元素选择器已经硬切为结构化上下文入口，不再携带 explain / translate / summarize / ask 动作。
 */
export type ElementPickerAction = 'explain' | 'translate' | 'summarize' | 'ask';

/**
 * 被选中的图片片段信息。
 *
 * 说明：
 * - 优先传 `dataUrl`，这样 UI 可以直接作为多模态输入或落库附件；
 * - 若页面受跨域/安全策略限制拿不到二进制内容，则退回 `url` 由 UI 侧再尝试拉取。
 */
export type PickedImage = {
  /** 优先：可直接作为多模态输入的 data URL（data:image/...） */
  dataUrl?: string;
  /** 兜底：图片 URL（http/https）。UI 侧可尝试下载后转为附件 */
  url?: string;
  /** 可选：alt/aria-label 等 */
  alt?: string;
  /** 可选：文件名（用于落库展示） */
  name?: string;
  /** 可选：MIME */
  mime?: string;
};

/**
 * 被选中的表格片段信息。
 *
 * 说明：
 * - 内容脚本会把 DOM table 转成 Markdown 表格；
 * - `rows` / `columns` 使用真实 DOM 表格规模，Markdown 正文会按元素提取预算截断。
 */
export type PickedTable = {
  /** Markdown 表格正文，可直接进入输入草稿。 */
  markdown: string;
  /** 表头单元格；无原生表头时保存空数组，由展示层按当前语言生成列名。 */
  headerCells?: string[];
  /** 表格正文行；用于按当前语言重新生成截断提示等扩展自有文案。 */
  bodyRows?: string[][];
  /** 表头是否由扩展生成，而不是来自网页原文。 */
  generatedHeader?: boolean;
  /** 原表是否因为预算限制被截断。 */
  truncated?: boolean;
  /** 表格行数。 */
  rows: number;
  /** 表格列数。 */
  columns: number;
};

/** 元素选择器记录的视口内矩形，单位为 CSS 像素。 */
export type PickedElementViewportRect = {
  /** 矩形左上角相对当前视口的 X 坐标。 */
  x: number;
  /** 矩形左上角相对当前视口的 Y 坐标。 */
  y: number;
  /** 矩形宽度。 */
  width: number;
  /** 矩形高度。 */
  height: number;
};

/** 元素选择器记录的提交瞬间视口状态。 */
export type PickedElementViewport = {
  /** 当前视口宽度。 */
  width: number;
  /** 当前视口高度。 */
  height: number;
  /** 页面横向滚动位置。 */
  scrollX: number;
  /** 页面纵向滚动位置。 */
  scrollY: number;
  /** 当前设备像素比。 */
  devicePixelRatio: number;
};

/** 被选择的视觉区域元信息。 */
export type PickedVisualRegion = {
  /** 视觉区域在视口内的矩形。 */
  rect: PickedElementViewportRect;
  /** 提交瞬间的视口状态。 */
  viewport: PickedElementViewport;
  /** Service Worker 抓取的完整可见视口截图，Sidepanel 会按 rect 裁剪成附件。 */
  screenshot?: PickedImage;
};

/**
 * 被元素选择器提取出的标准化元素数据。
 *
 * 说明：
 * - 内容脚本会把页面上的不同 DOM 节点归一到统一结构；
 * - 后续输入区草稿与 browser-context 快照只依赖这层标准化结构，而不直接依赖原始 DOM。
 */
export type PickedElement = {
  /** 归一化后的元素类型 */
  kind: 'text' | 'code' | 'image' | 'table' | 'visual';
  /** 元素 tagName（用于调试/容错） */
  tagName: string;
  /** 可能的 CSS selector（用于调试/定位；不保证唯一） */
  selector?: string;
  /** 面向用户的结构摘要（例如“文本 · p · 约 96 字”） */
  summary?: string;
  /** 可见文本/代码文本/图片说明/表格 Markdown（按 kind 解释） */
  text?: string;
  /** 文本类元素的近似有效字符数。 */
  charCount?: number;
  /** code kind：代码行数。 */
  lineCount?: number;
  /** code kind：语言提示（例如 ts/js/python） */
  codeLanguage?: string;
  /** image kind：图片列表（通常 1 张） */
  images?: PickedImage[];
  /** table kind：Markdown 表格和结构规模。 */
  table?: PickedTable;
  /** visual kind：视觉区域的截图裁剪依据。 */
  visual?: PickedVisualRegion;
};

/**
 * 由元素选择器发送给上层的结构化上下文负载。
 *
 * 说明：
 * - 元素选择器不再是动作菜单，不携带即时处理 action；
 * - `element` 是被抽取后的结构化上下文主体；
 * - `source` 用于在 UI 里补充来源页面信息，便于引用和追溯。
 */
export type ElementActionPayload = {
  /** 经过标准化处理后的元素内容。 */
  element: PickedElement;
  /** 可选：来源页面的基础元信息。 */
  source?: { url?: string; title?: string };
  /** 页面工具会话 ID，用于 Service Worker 在选择完成后恢复 sidepanel。 */
  sessionId?: string;
  /** 本次会话完成后是否需要回到 sidepanel。 */
  returnToPanel?: boolean;
};
