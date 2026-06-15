/**
 * 说明：`offscreen-unload-config` 扩展配置模块。
 *
 * 职责：
 * - 定义 Offscreen Document 自动回收配置的唯一存储键与当前 schema；
 * - 为 UI 与 Service Worker 提供同一套默认值和归一化逻辑；
 * - 硬切到 `{ autoUnload, idleTimeout }`，不保留内存阈值等旧字段。
 *
 * 边界：
 * - 这里只处理轻量 JSON 配置，不直接读写 storage；
 * - 具体持久化由调用方按所在运行时选择 `shared-json-config-channel` 或 storage adapter。
 */

/** Offscreen Document 自动回收配置的 `chrome.storage.local` key。 */
export const OFFSCREEN_UNLOAD_CONFIG_KEY = 'olyq.performance.unload.v1';

/** Offscreen Document 自动回收配置当前 schema。 */
export interface OffscreenUnloadConfig {
  /** 是否允许后台在空闲且无挂起任务时关闭 Offscreen Document。 */
  autoUnload: boolean;
  /** 空闲多久后可关闭 Offscreen Document，单位秒。 */
  idleTimeout: number;
}

/** Offscreen Document 自动回收配置默认值。 */
export const DEFAULT_OFFSCREEN_UNLOAD_CONFIG: OffscreenUnloadConfig = {
  autoUnload: true,
  idleTimeout: 300,
};

/** 当前配置允许的最小空闲秒数。 */
const MIN_IDLE_TIMEOUT_SECONDS = 60;

/** 当前配置允许的最大空闲秒数。 */
const MAX_IDLE_TIMEOUT_SECONDS = 3600;

/**
 * 判断候选值是否为有限数字。
 *
 * @param value - 待判断值。
 * @returns 是否为有限数字。
 */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * 把任意输入规整成当前 Offscreen 自动回收配置。
 *
 * @param raw - storage 或 UI 输入中的原始值。
 * @returns 当前 schema 下的稳定配置。
 */
export function normalizeOffscreenUnloadConfig(raw: unknown): OffscreenUnloadConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_OFFSCREEN_UNLOAD_CONFIG };
  const record = raw as Record<string, unknown>;
  const autoUnload = typeof record.autoUnload === 'boolean'
    ? record.autoUnload
    : DEFAULT_OFFSCREEN_UNLOAD_CONFIG.autoUnload;
  const idleTimeout = isFiniteNumber(record.idleTimeout)
    ? Math.max(MIN_IDLE_TIMEOUT_SECONDS, Math.min(MAX_IDLE_TIMEOUT_SECONDS, record.idleTimeout))
    : DEFAULT_OFFSCREEN_UNLOAD_CONFIG.idleTimeout;
  return { autoUnload, idleTimeout };
}

/**
 * 判断 storage 中的原始值是否需要按当前 schema 重写。
 *
 * @param raw - storage 中读出的原始值。
 * @returns 是否需要重写以删除旧字段或规整非法值。
 */
export function shouldRewriteOffscreenUnloadConfig(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const record = raw as Record<string, unknown>;
  const normalized = normalizeOffscreenUnloadConfig(record);
  const keys = Object.keys(record).sort();
  if (keys.length !== 2 || keys[0] !== 'autoUnload' || keys[1] !== 'idleTimeout') return true;
  return record.autoUnload !== normalized.autoUnload || record.idleTimeout !== normalized.idleTimeout;
}
