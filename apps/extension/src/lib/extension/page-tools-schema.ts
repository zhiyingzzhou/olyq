/**
 * 说明：`page-tools-schema` 网页工具设置契约模块。
 *
 * 职责：
 * - 定义 `olyq.page-tools.v1` 的当前 v1 schema；
 * - 规整全局启用开关与站点级禁用 origin 列表；
 * - 供 content script、设置页、备份恢复和 Data Contract Registry 共享同一份无副作用契约。
 *
 * 边界：
 * - 本文件不创建 shared-json channel，不访问 tab 或 content script；
 * - 网页工具状态的读写和订阅仍由 `page-tools.ts` 承担。
 */

/** 网页工具设置在存储层使用的 key。 */
export const PAGE_TOOLS_SETTINGS_KEY = 'olyq.page-tools.v1';

/** 网页工具设置结构（便于后续扩展更多开关）。 */
export type PageToolsSettings = {
  /** 是否启用网页工具（默认开启）。 */
  enabled: boolean;
  /** 已禁用网页工具的精确站点 origin 列表。 */
  disabledSiteOrigins: string[];
};

/** 网页工具设置的默认值。 */
export const DEFAULT_PAGE_TOOLS_SETTINGS: PageToolsSettings = {
  enabled: true,
  disabledSiteOrigins: [],
};

/**
 * 把任意 URL 或 origin 字符串收敛为 page-tools 站点级禁用使用的精确 origin。
 *
 * @param input - 网页 URL 或 origin。
 * @returns `http/https` origin；非普通网页返回 `null`。
 */
export function normalizePageToolsSiteOrigin(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * 把任意原始值收敛为合法的网页工具设置。
 *
 * @param raw - 未信任的 storage / backup / sync 输入。
 * @returns 当前 v1 网页工具设置。
 */
export function normalizePageToolsSettings(raw: unknown): PageToolsSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_PAGE_TOOLS_SETTINGS;
  const r = raw as Record<string, unknown>;
  const disabledSiteOrigins = Array.isArray(r.disabledSiteOrigins)
    ? Array.from(new Set(r.disabledSiteOrigins.map(normalizePageToolsSiteOrigin).filter((origin): origin is string => Boolean(origin)))).sort()
    : DEFAULT_PAGE_TOOLS_SETTINGS.disabledSiteOrigins;
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : DEFAULT_PAGE_TOOLS_SETTINGS.enabled,
    disabledSiteOrigins,
  };
}

/**
 * 克隆网页工具设置，避免缓存引用被调用方修改。
 *
 * @param value - 输入设置。
 * @returns 独立的设置副本。
 */
export function clonePageToolsSettings(value: PageToolsSettings): PageToolsSettings {
  return {
    enabled: value.enabled,
    disabledSiteOrigins: [...value.disabledSiteOrigins],
  };
}

/**
 * 判断两份网页工具设置是否一致。
 *
 * @param left - 左值。
 * @param right - 右值。
 * @returns 是否相同。
 */
export function isSamePageToolsSettings(left: PageToolsSettings, right: PageToolsSettings): boolean {
  return (
    left.enabled === right.enabled
    && left.disabledSiteOrigins.length === right.disabledSiteOrigins.length
    && left.disabledSiteOrigins.every((origin, index) => origin === right.disabledSiteOrigins[index])
  );
}
