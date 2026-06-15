/**
 * 说明：`format` 基础能力模块。
 *
 * 职责：
 * - 承载 `format` 相关的当前文件实现与模块边界；
 * - 对外暴露 `formatI18nText` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { I18nText } from '@/types/i18n';

/** UI 层渲染 I18nText 所需的最小翻译函数契约。 */
export type I18nTextFormatter = (key: string, options?: Record<string, unknown>) => string;

/**
 * 将 I18nText 渲染为最终可展示字符串。
 *
 * 说明：
 * - 该函数只能在 UI 侧调用（需要 i18next 的 t）。
 * - 业务逻辑/SW/CS 侧禁止使用硬编码字符串作为错误文案，必须透传 I18nText。
 */
export function formatI18nText(t: I18nTextFormatter, text: I18nText): string {
  return t(text.key, (text.params ?? {}) as Record<string, unknown>);
}
