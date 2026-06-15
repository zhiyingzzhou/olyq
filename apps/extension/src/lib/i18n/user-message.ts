/**
 * 说明：`user-message` 基础能力模块。
 *
 * 职责：
 * - 承载 `user-message` 相关的当前文件实现与模块边界；
 * - 对外暴露 `formatUserError` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { TFunction } from 'i18next';
import { formatI18nText } from './format';
import { toI18nTextFromError } from './error';

/**
 * 将未知异常格式化为“用户可读”的错误文本（带国际化）。
 *
 * 为什么需要它：
 * - I18nError.message 本身就是 key（例如 "errors.apiCallFailedWithDetail"），直接 toast 会把 key 展示给用户；
 * - 正确做法是把 error 归一为 I18nText，再用 t(key, params) 渲染。
 */
export function formatUserError(t: TFunction, error: unknown): string {
  return formatI18nText(t, toI18nTextFromError(error));
}

