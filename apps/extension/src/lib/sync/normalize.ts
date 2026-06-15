/**
 * 说明：`normalize` 同步模块。
 *
 * 职责：
 * - 承载 `normalize` 相关的当前文件实现与模块边界；
 * - 对外暴露 `SYNC_INTERVAL_MINUTES_OPTIONS`、`normalizeSyncIntervalMinutes`、`normalizeMaxBackups` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 同步配置的共享校验/归一化函数。
 *
 * 被 service-worker.ts 和 CloudSyncPanel.tsx 共同使用，
 * 避免两处各自维护一份逻辑导致行为不一致。
 */

/** 允许的自动同步间隔（分钟）；0 表示关闭 */
export const SYNC_INTERVAL_MINUTES_OPTIONS = [0, 1, 5, 15, 30, 60, 120, 360, 720, 1440] as const;

const ALLOWED_SYNC_INTERVALS = new Set<number>(SYNC_INTERVAL_MINUTES_OPTIONS);

/** 将任意值归一化为合法的同步间隔分钟数；非法值返回 0（关闭） */
export function normalizeSyncIntervalMinutes(v: unknown): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : 0;
  return ALLOWED_SYNC_INTERVALS.has(n) ? n : 0;
}

/** 将任意值归一化为合法的最大备份数；非法值返回 0（无限制） */
export function normalizeMaxBackups(v: unknown): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : 0;
  return n >= 0 ? n : 0;
}
