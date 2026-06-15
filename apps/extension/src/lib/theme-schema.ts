/**
 * 说明：`theme-schema` 主题持久化契约模块。
 *
 * 职责：
 * - 定义主题配置的固定 v1 存储 key；
 * - 提供无副作用的主题值规整函数；
 * - 供启动快照、运行时 channel 与 Data Contract Registry 共享同一份 schema 真源。
 *
 * 边界：
 * - 本文件不读写 storage，不访问 DOM；
 * - 主题应用、订阅与广播仍由 `theme.ts` 承担。
 */

/** 主题存储 key。 */
export const THEME_STORAGE_KEY = 'olyq.theme.v1';

/** 当前支持的主题模式。 */
export type ThemeMode = 'light' | 'dark';

/**
 * 把任意输入规整为当前主题模式。
 *
 * @param value - 未信任的 storage / backup / sync 输入。
 * @returns 合法主题模式；非法时返回 `null`，表示跟随系统默认。
 */
export function normalizeTheme(value: unknown): ThemeMode | null {
  return value === 'light' || value === 'dark' ? value : null;
}
