/**
 * 说明：`link-preview` 类型模块。
 *
 * 职责：
 * - 定义聊天 Markdown 链接预览在 UI 与 Service Worker 之间传递的结构化数据；
 * - 固定错误码、元数据字段与跨运行时响应边界；
 *
 * 边界：
 * - 本文件只保存纯类型，不读取浏览器 API、不触发网络请求、不承担 UI 文案。
 */

/** 链接预览元数据抓取失败的稳定原因。 */
export type LinkPreviewErrorCode =
  | 'invalid-url'
  | 'unsupported-protocol'
  | 'blocked-local-url'
  | 'fetch-failed'
  | 'http-error'
  | 'not-html'
  | 'timeout'
  | 'too-many-redirects'
  | 'empty-metadata';

/** Markdown 链接预览卡片可消费的安全元数据。 */
export interface LinkPreviewMetadata {
  /** 用户原始请求 URL 归一化后的字符串。 */
  readonly url: string;
  /** 跟随重定向后的最终 URL。 */
  readonly finalUrl: string;
  /** 用于展示的主机名。 */
  readonly hostname: string;
  /** 页面标题；没有可用标题时为 `null`。 */
  readonly title: string | null;
  /** 页面描述；没有可用描述时为 `null`。 */
  readonly description: string | null;
  /** 预览图 URL；只允许 http/https，且没有可用图片时为 `null`。 */
  readonly imageUrl: string | null;
  /** 预览图替代文本；没有可用文本时为 `null`。 */
  readonly imageAlt: string | null;
  /** Open Graph 站点名；没有可用站点名时为 `null`。 */
  readonly siteName: string | null;
  /** Service Worker 完成本次解析的时间戳。 */
  readonly fetchedAt: number;
}

/** Service Worker 链接预览解析结果。 */
export interface LinkPreviewResolution {
  /** 可展示的预览元数据；失败时为 `null`。 */
  readonly payload: LinkPreviewMetadata | null;
  /** 稳定失败码；成功时为空。 */
  readonly error?: LinkPreviewErrorCode;
}
