/**
 * 说明：`sw-keepalive-config` 扩展配置模块。
 *
 * 职责：
 * - 定义 Service Worker keepalive 配置的唯一存储键与当前 schema；
 * - 为后台、UI contract 与持久化域提供同一份类型和默认值；
 * - 避免 keepalive 配置 key 在多个模块里复制。
 */

/** Service Worker keepalive 配置的 `chrome.storage.local` key。 */
export const SW_KEEPALIVE_CONFIG_KEY = 'olyq.sw.keepalive.v1';

/** Service Worker keepalive 配置当前 schema。 */
export interface SwKeepAliveConfig {
  /** 是否启用 alarm 驱动的 Service Worker 保活。 */
  alarmsEnabled: boolean;
  /** 心跳 alarm 周期，单位分钟。 */
  periodInMinutes: number;
}

/** Service Worker keepalive 配置默认值。 */
export const DEFAULT_SW_KEEPALIVE_CONFIG: SwKeepAliveConfig = {
  alarmsEnabled: true,
  periodInMinutes: 1,
};

/**
 * 把任意输入规整成当前 Service Worker keepalive 配置。
 *
 * @param raw - storage 或 UI 输入中的原始值。
 * @returns 当前 schema 下的稳定配置。
 */
export function normalizeSwKeepAliveConfig(raw: unknown): SwKeepAliveConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_SW_KEEPALIVE_CONFIG };
  const record = raw as Record<string, unknown>;
  const alarmsEnabled = typeof record.alarmsEnabled === 'boolean'
    ? record.alarmsEnabled
    : DEFAULT_SW_KEEPALIVE_CONFIG.alarmsEnabled;
  const periodInMinutes = typeof record.periodInMinutes === 'number' && Number.isFinite(record.periodInMinutes)
    ? Math.max(1, record.periodInMinutes)
    : DEFAULT_SW_KEEPALIVE_CONFIG.periodInMinutes;
  return { alarmsEnabled, periodInMinutes };
}

/**
 * 判断 storage 中的原始值是否需要按当前 schema 重写。
 *
 * @param raw - storage 中读出的原始值。
 * @returns 是否需要重写以删除旧字段或规整非法值。
 */
export function shouldRewriteSwKeepAliveConfig(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const record = raw as Record<string, unknown>;
  const normalized = normalizeSwKeepAliveConfig(record);
  const keys = Object.keys(record).sort();
  if (keys.length !== 2 || keys[0] !== 'alarmsEnabled' || keys[1] !== 'periodInMinutes') return true;
  return record.alarmsEnabled !== normalized.alarmsEnabled || record.periodInMinutes !== normalized.periodInMinutes;
}
