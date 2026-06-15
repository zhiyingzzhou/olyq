/**
 * 说明：`i18n` 类型定义模块。
 *
 * 职责：
 * - 承载 `i18n` 相关的当前文件实现与模块边界；
 * - 对外暴露 `I18nText` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 跨上下文（UI / Service Worker / Content Script）传递的国际化文本结构。
 *
 * 设计目标：
 * - 不在底层逻辑里直接拼接“最终可展示字符串”，避免后台上下文无法获取用户语言导致语言错乱。
 * - UI 侧统一使用 i18next 的 `t(key, params)` 渲染为最终文案。
 *
 * 约束：
 * - key 必须存在于 locales（至少 zh-CN 与 en-US）中；禁止在代码里写“fallback 文案”绕过 i18n。
 * - params 必须可结构化克隆/可序列化（会经由 Port 或 sendMessage 跨上下文传递）。
 */
export interface I18nText {
  /** i18next key（例如：'errors.unknown'） */
  key: string;
  /**
   * 插值参数（例如：`{ status: 401 }`）。
   *
   * 说明：
   * - 这里只保存原始插值数据；
   * - 最终字符串拼接必须在 UI 侧完成，避免不同上下文语言环境不一致。
   */
  params?: Record<string, unknown>;
}
