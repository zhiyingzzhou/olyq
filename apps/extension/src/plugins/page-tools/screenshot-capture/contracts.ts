/**
 * 说明：`screenshot-editor` 截图编辑器跨运行时契约模块。
 *
 * 职责：
 * - 承载 content script、Service Worker 与 Sidepanel 之间传递的截图动作数据；
 * - 只描述用户显式确认后的截图结果，不持久化编辑器内部临时状态；
 * - 让 OCR 入口保持产品层语义，不在这里声明或扩展任何 provider / model 能力。
 *
 * 边界：
 * - 截图图片本体以 data URL 在一次性消息内传递，进入 Sidepanel 后再落入现有附件存储；
 * - 本模块不访问 DOM、不调用浏览器 API，也不负责下载、复制或附件入库。
 */

/** 截图编辑器向聊天工作区提交的动作类型。 */
export type ScreenshotEditorAction = 'chat' | 'ocr';

/** 截图编辑器提交给聊天或 OCR 的图片 MIME。 */
export type ScreenshotEditorImageMime = 'image/png' | 'image/jpeg' | 'image/webp';

/** 截图编辑器提交的图片数据。 */
export interface ScreenshotEditorImagePayload {
  /** 与 `mime` 匹配的图片 data URL。 */
  dataUrl: string;
  /** 图片 MIME；聊天提交保持 PNG，OCR 可使用压缩后的 JPEG/WebP。 */
  mime: ScreenshotEditorImageMime;
  /** 建议文件名。 */
  name: string;
}

/** 截图动作的来源页面信息。 */
export interface ScreenshotEditorSourcePayload {
  /** 来源页面 URL。 */
  url?: string;
  /** 来源页面标题。 */
  title?: string;
}

/** 截图选区在当前视口内的 CSS 像素矩形。 */
export interface ScreenshotEditorSelectionRectPayload {
  /** 左上角横坐标。 */
  x: number;
  /** 左上角纵坐标。 */
  y: number;
  /** 选区宽度。 */
  width: number;
  /** 选区高度。 */
  height: number;
}

/** 截图编辑器提交给后台的完整动作负载。 */
export interface ScreenshotEditorActionPayload {
  /** 用户点击的截图动作。 */
  action: ScreenshotEditorAction;
  /** 已裁剪并叠加标注后的 PNG 图片。 */
  image: ScreenshotEditorImagePayload;
  /** 来源页面信息。 */
  source?: ScreenshotEditorSourcePayload;
  /** 用户导出的选区矩形。 */
  rect?: ScreenshotEditorSelectionRectPayload;
  /** 页面工具会话 ID，用于 Service Worker 在提交后恢复 sidepanel。 */
  sessionId?: string;
  /** 本次会话完成后是否需要回到 sidepanel。 */
  returnToPanel?: boolean;
  /**
   * OCR 请求 ID。
   *
   * 说明：OCR 的页面浮窗必须等 Side Panel 恢复并改变 viewport 后才创建；
   * 该 ID 用来把 SW 的 panel-ready 通知、最终识别结果和页面浮窗绑定到同一轮提交。
   */
  ocrRequestId?: string;
}

/** Service Worker 打开 content script 截图编辑器时传入的截图负载。 */
export interface ScreenshotEditorOpenPayload {
  /** 可见视口截图。 */
  screenshot: ScreenshotEditorImagePayload;
  /** 页面工具会话 ID，用于关闭或提交时恢复 sidepanel。 */
  sessionId?: string;
  /** 本次会话完成后是否需要回到 sidepanel。 */
  returnToPanel?: boolean;
}
