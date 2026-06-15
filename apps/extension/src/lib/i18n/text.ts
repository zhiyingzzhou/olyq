/**
 * 说明：`text` 基础能力模块。
 *
 * 职责：
 * - 承载 `text` 相关的当前文件实现与模块边界；
 * - 对外暴露 `i18nText`、`isI18nText`、`normalizeI18nText` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { isPlainRecord } from '@/lib/utils/type-guards';
import type { I18nText } from '@/types/i18n';

/**
 * 创建 I18nText（用于在业务逻辑中返回“可被 UI 翻译的文本”）。
 *
 * 说明：
 * - 这里只生成“key + params”，不做 `t()` 渲染（底层逻辑不应该依赖当前语言）。
 * - params 应保持为可序列化对象，避免跨上下文传递失败。
 */
export function i18nText(key: string, params?: Record<string, unknown>): I18nText {
  return params ? { key, params } : { key };
}

/**
 * 宽松判定：用于从 Port / message 反序列化后的对象中识别 I18nText。
 */
export function isI18nText(v: unknown): v is I18nText {
  if (!isPlainRecord(v)) return false;
  if (typeof v.key !== 'string' || !v.key.trim()) return false;
  if (v.params === undefined) return true;
  return isPlainRecord(v.params);
}

/**
 * 从“类错误对象”中尽力提取适合直接展示给用户的 detail 文本。
 *
 * 说明：
 * - 兼容 `{ message }`、`{ error: "..." }`、`{ error: { message } }` 这类常见后端返回；
 * - 若未命中可读详情，则返回空字符串，由调用方继续走 fallback。
 */
function extractDetailFromPlainRecord(record: Record<string, unknown>): string {
  if (typeof record.message === 'string' && record.message.trim()) return record.message.trim()

  const error = record.error
  if (typeof error === 'string' && error.trim()) return error.trim()
  if (isPlainRecord(error) && typeof error.message === 'string' && error.message.trim()) {
    return error.message.trim()
  }

  return ''
}

/**
 * 将未知输入归一为 I18nText。
 *
 * 约束：
 * - 不返回硬编码字符串，避免绕过国际化。
 * - 对“非 i18n 错误”仅做兜底包裹，详细信息可通过 params 透传（如需展示）。
 *
 * 注意：
 * - “detail” 一般用于调试或错误详情弹窗；toast/标题类短文案应尽量使用更具体的 errors.* key。
 */
export function normalizeI18nText(
  v: unknown,
  fallback: I18nText = { key: 'errors.unknown' },
): I18nText {
  if (isI18nText(v)) return v;
  if (v instanceof Error) {
    const detail = String(v.message || '').trim();
    return detail
      ? { key: 'errors.unknownWithDetail', params: { detail } }
      : fallback;
  }
  // 兼容非标准 Error（例如 chrome.runtime.lastError 或后端直返 plain object）
  if (isPlainRecord(v)) {
    const detail = extractDetailFromPlainRecord(v);
    return detail
      ? { key: 'errors.unknownWithDetail', params: { detail } }
      : fallback;
  }
  const detail = String(v ?? '').trim();
  return detail
    ? { key: 'errors.unknownWithDetail', params: { detail } }
    : fallback;
}
