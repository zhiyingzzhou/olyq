/**
 * 说明：`error` 基础能力模块。
 *
 * 职责：
 * - 承载 `error` 相关的当前文件实现与模块边界；
 * - 对外暴露 `I18nError`、`isI18nError`、`toI18nTextFromError` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { I18nText } from '@/types/i18n';
import { isI18nText, i18nText, normalizeI18nText } from './text';

/**
 * 携带 i18n key 的错误类型。
 *
 * 说明：
 * - message 字段保持为 key，便于日志定位与序列化。
 * - UI 展示必须走 `t(key, params)`，而不是直接展示 message。
 * - 建议在“明确可预期的失败分支”抛出 I18nError（例如配置缺失、权限不足等），避免 UI 侧只能显示“未知错误”。
 */
export class I18nError extends Error {
  readonly i18n: I18nText;

  constructor(key: string, params?: Record<string, unknown>, options?: { cause?: unknown }) {
    super(key);
    this.name = 'I18nError';
    this.i18n = i18nText(key, params);
    if (options && 'cause' in options) {
      // 兼容 Error.cause：在 TS lib 定义中它是可选字段，这里做兼容写入。
      (this as unknown as { cause?: unknown }).cause = options.cause;
    }
  }
}

/**
 * 判断未知值是否为 `I18nError`。
 *
 * 说明：
 * - 这里不仅检查 `name`，还会验证 `i18n` 字段结构，避免普通 Error 被误识别；
 * - 常用于 toast、弹窗和后台消息边界上的错误归一化。
 */
export function isI18nError(e: unknown): e is I18nError {
  return e instanceof Error && e.name === 'I18nError' && 'i18n' in e && isI18nText((e as I18nError).i18n);
}

/**
 * 将未知错误归一为 I18nText（用于 toast/弹窗等用户可见错误）。
 *
 * 说明：
 * - 若已是 I18nError/I18nText，直接透传。
 * - 否则退化为 errors.unknownWithDetail（尽量保留可诊断信息）。
 */
export function toI18nTextFromError(e: unknown, fallback?: I18nText): I18nText {
  if (isI18nError(e)) return e.i18n;
  if (isI18nText(e)) return e;
  return normalizeI18nText(e, fallback);
}
