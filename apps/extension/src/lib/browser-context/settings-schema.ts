/**
 * 说明：`settings-schema` 浏览器上下文设置契约模块。
 *
 * 职责：
 * - 定义 `olyq.browser-context.settings.v1` 的当前 v1 schema；
 * - 为运行时设置模块、备份恢复和 Data Contract Registry 提供无副作用规整函数；
 * - 保持全文网页模式预算的范围约束集中在同一处。
 *
 * 边界：
 * - 本文件不创建 shared-json channel，不读写 storage；
 * - 浏览器上下文采集开关的运行时订阅仍由 `settings.ts` 负责。
 */
import type { BrowserContextSettings } from './types';
import { DEFAULT_BROWSER_CONTEXT_SETTINGS } from './types';

/** 浏览器上下文设置存储键。 */
export const BROWSER_CONTEXT_SETTINGS_STORAGE_KEY = 'olyq.browser-context.settings.v1';

/**
 * 归一化全文网页模式的 prompt 预算。
 *
 * @param value - 原始输入。
 * @returns 合法的预算值。
 */
function normalizeFullPagePromptChars(value: unknown): number {
  const fallback = DEFAULT_BROWSER_CONTEXT_SETTINGS.fullPagePromptChars;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(120_000, Math.max(24_000, Math.round(parsed)));
}

/**
 * 把任意原始输入归一化为合法浏览器上下文设置。
 *
 * @param raw - 未信任的 storage / backup / sync 输入。
 * @returns 规范化后的设置。
 */
export function normalizeBrowserContextSettings(raw: unknown): BrowserContextSettings {
  const rec = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  return {
    enabled: typeof rec.enabled === 'boolean' ? rec.enabled : DEFAULT_BROWSER_CONTEXT_SETTINGS.enabled,
    fullPagePromptChars: normalizeFullPagePromptChars(rec.fullPagePromptChars),
  };
}
