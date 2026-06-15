/**
 * 说明：`settings-schema` Web Search 设置契约模块。
 *
 * 职责：
 * - 定义 `olyq.websearch.settings.v1` 的当前 v1 schema；
 * - 提供 Web Search 设置的无副作用规整、克隆与比较函数；
 * - 让运行时设置模块、secret 拆分、云同步和 Data Contract Registry 共用同一份契约。
 *
 * 边界：
 * - 本文件不创建 shared-json channel，不执行搜索请求；
 * - API Key 是否进入远端由 secret 拆分模块处理。
 */
import type { WebSearchSettings } from './types';
import { DEFAULT_WEB_SEARCH_SETTINGS } from './types';
import { resolveWebSearchProviderId } from './provider-registry';

/** Web Search 设置在共享存储中的固定 key。 */
export const WEB_SEARCH_SETTINGS_STORAGE_KEY = 'olyq.websearch.settings.v1';

/**
 * 克隆 Web Search 设置，避免缓存引用逃逸。
 *
 * @param settings - 输入设置。
 * @returns 独立的设置副本。
 */
export function cloneWebSearchSettings(settings: WebSearchSettings): WebSearchSettings {
  return {
    ...settings,
    excludeDomains: Array.isArray(settings.excludeDomains) ? [...settings.excludeDomains] : [],
  };
}

/**
 * 把任意原始值规整为当前 Web Search 设置。
 *
 * @param raw - 未信任的 storage / backup / sync 输入。
 * @returns 当前 v1 Web Search 设置。
 */
export function normalizeWebSearchSettings(raw: unknown): WebSearchSettings {
  const rec = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? (raw as Record<string, unknown>) : {};
  const providerId = resolveWebSearchProviderId(rec.providerId) ?? DEFAULT_WEB_SEARCH_SETTINGS.providerId;
  const maxResults = typeof rec.maxResults === 'number' && Number.isFinite(rec.maxResults)
    ? Math.max(1, Math.min(20, Math.floor(rec.maxResults)))
    : DEFAULT_WEB_SEARCH_SETTINGS.maxResults;
  const excludeDomains = Array.isArray(rec.excludeDomains)
    ? Array.from(new Set(rec.excludeDomains.map((item) => String(item || '').trim()).filter(Boolean)))
    : [...(DEFAULT_WEB_SEARCH_SETTINGS.excludeDomains ?? [])];
  /**
   * 内部函数变量：`pickOptionalString`。
   *
   * @remarks
   * 只把非空字符串纳入当前 v1 设置，避免空白 API Key 或 URL 进入同步契约。
   */
  const pickOptionalString = (value: unknown) => {
    const next = typeof value === 'string' ? value.trim() : '';
    return next || undefined;
  };

  return {
    providerId,
    maxResults,
    searchWithTime: typeof rec.searchWithTime === 'boolean' ? rec.searchWithTime : DEFAULT_WEB_SEARCH_SETTINGS.searchWithTime,
    excludeDomains,
    tavilyApiKey: pickOptionalString(rec.tavilyApiKey),
    exaApiKey: pickOptionalString(rec.exaApiKey),
    exaMcpUrl: pickOptionalString(rec.exaMcpUrl),
    bochaApiKey: pickOptionalString(rec.bochaApiKey),
    zhipuApiKey: pickOptionalString(rec.zhipuApiKey),
    searxngUrl: pickOptionalString(rec.searxngUrl),
  };
}

/**
 * 判断两份 Web Search 设置是否一致。
 *
 * @param left - 左值。
 * @param right - 右值。
 * @returns 是否相同。
 */
export function isSameWebSearchSettings(left: WebSearchSettings, right: WebSearchSettings): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
