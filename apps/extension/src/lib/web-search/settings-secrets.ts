/**
 * 说明：Web Search 设置的 secret 拆分模块。
 *
 * 职责：
 * - 把 `olyq.websearch.settings.v1` 中的 API Key 字段从普通同步元数据中拆出；
 * - 让 providerId、maxResults、excludeDomains、SearXNG URL 等非密钥配置继续参与 structured sync；
 * - 为远端 `secretVault` 提供可加密的最小敏感字段快照。
 *
 * 边界：
 * - 本模块不读写 storage，也不发起搜索请求；
 * - 只处理当前 v1 Web Search 设置，不提供旧字段兼容；
 * - WebDAV / S3 自身连接凭据不在这里处理。
 */
import type { WebSearchSettings } from './types';
import { normalizeWebSearchSettings } from './settings-schema';

const WEB_SEARCH_SECRET_FIELDS = [
  'tavilyApiKey',
  'exaApiKey',
  'bochaApiKey',
  'zhipuApiKey',
] as const satisfies ReadonlyArray<keyof WebSearchSettings>;

/** Web Search secret 字段快照。 */
export type WebSearchSecretSnapshot = Partial<Pick<WebSearchSettings, typeof WEB_SEARCH_SECRET_FIELDS[number]>>;

/**
 * 规整 Web Search API Key 字符串。
 *
 * @param value - 原始 API Key 值。
 * @returns trim 后的非空字符串；非法时返回 `undefined`。
 */
function pickSecret(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * 提取 Web Search API Key 字段。
 *
 * @param raw - 未信任的 Web Search 设置。
 * @returns 仅包含非空 API Key 的 secret 快照。
 */
export function extractWebSearchSecrets(raw: unknown): WebSearchSecretSnapshot {
  const settings = normalizeWebSearchSettings(raw);
  const out: WebSearchSecretSnapshot = {};
  for (const field of WEB_SEARCH_SECRET_FIELDS) {
    const value = pickSecret(settings[field]);
    if (value) out[field] = value;
  }
  return out;
}

/**
 * 去掉 Web Search API Key 字段，保留可明文同步的元数据。
 *
 * @param raw - 未信任的 Web Search 设置。
 * @returns 不含 API Key 的 Web Search 设置。
 */
export function stripWebSearchSecrets(raw: unknown): WebSearchSettings {
  const settings = normalizeWebSearchSettings(raw);
  const out: WebSearchSettings = { ...settings };
  for (const field of WEB_SEARCH_SECRET_FIELDS) delete out[field];
  return out;
}

/**
 * 合并 Web Search 明文元数据与解密后的 API Key。
 *
 * @param rawSettings - 明文 Web Search 设置。
 * @param rawSecrets - 解密后的 secret 快照。
 * @returns 可写回共享存储的完整 Web Search 设置。
 */
export function mergeWebSearchSecrets(rawSettings: unknown, rawSecrets: unknown): WebSearchSettings {
  const settings = normalizeWebSearchSettings(rawSettings);
  const secrets = rawSecrets && typeof rawSecrets === 'object' && !Array.isArray(rawSecrets)
    ? rawSecrets as Record<string, unknown>
    : {};
  const next: WebSearchSettings = { ...settings };
  for (const field of WEB_SEARCH_SECRET_FIELDS) {
    const value = pickSecret(secrets[field]);
    if (value) next[field] = value;
  }
  return normalizeWebSearchSettings(next);
}
