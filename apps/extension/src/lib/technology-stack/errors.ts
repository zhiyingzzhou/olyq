/**
 * 说明：技术栈检测错误码真源。
 *
 * 职责：
 * - 收敛 Service Worker、content script 与 UI 之间传递的稳定错误码；
 * - 把未知异常归一为通用技术栈不可用状态，避免把浏览器原始错误或内部 code 直接展示给用户；
 * - 为 UI 提供固定 i18n key，错误文案只在 locale 层定义。
 */

/** 技术栈检测允许跨运行时传递的稳定错误码。 */
export const TECHNOLOGY_STACK_ERROR_CODES = [
  'content-script-unreachable',
  'content-script-not-ready',
  'content-script-injection-failed',
  'page-access-unavailable',
  'page-uncollectable',
  'tab-unavailable',
  'rule-package-unavailable',
  'page-stale',
  'bundle-missing',
  'technology-stack-unavailable',
] as const;

/** 技术栈检测稳定错误码。 */
export type TechnologyStackErrorCode = typeof TECHNOLOGY_STACK_ERROR_CODES[number];

const TECHNOLOGY_STACK_ERROR_CODE_SET = new Set<string>(TECHNOLOGY_STACK_ERROR_CODES);

/** 判断未知值是否为稳定技术栈错误码。 */
export function isTechnologyStackErrorCode(value: unknown): value is TechnologyStackErrorCode {
  return typeof value === 'string' && TECHNOLOGY_STACK_ERROR_CODE_SET.has(value);
}

/**
 * 将任意技术栈失败输入归一为稳定错误码。
 *
 * @param error - 后台响应、tabs/message contract 或未知异常。
 * @returns 可跨运行时传递、可进入 i18n 映射的稳定错误码。
 */
export function normalizeTechnologyStackErrorCode(error: unknown): TechnologyStackErrorCode {
  const raw = error instanceof Error ? error.message : String(error || '');
  const normalized = raw.trim();
  if (isTechnologyStackErrorCode(normalized)) return normalized;
  return 'technology-stack-unavailable';
}

/**
 * 获取技术栈错误码对应的 i18n key。
 *
 * @param code - 稳定错误码。
 * @returns `pageContext` locale 内的错误原因 key。
 */
export function getTechnologyStackErrorReasonI18nKey(
  code: TechnologyStackErrorCode,
): `pageContext.technologyStack.errorReason.${TechnologyStackErrorCode}` {
  return `pageContext.technologyStack.errorReason.${code}`;
}
