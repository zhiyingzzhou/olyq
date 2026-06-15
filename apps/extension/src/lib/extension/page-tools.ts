/**
 * 说明：`page-tools` 基础能力模块。
 *
 * 职责：
 * - 承载 `page-tools` 相关的当前文件实现与模块边界；
 * - 对外暴露 `PAGE_TOOLS_SETTINGS_KEY`、`PageToolsSettings`、`DEFAULT_PAGE_TOOLS_SETTINGS` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { createSharedJsonConfigChannel } from '@/lib/storage/shared-json-config-channel';
import {
  clonePageToolsSettings,
  DEFAULT_PAGE_TOOLS_SETTINGS,
  isSamePageToolsSettings,
  normalizePageToolsSettings,
  normalizePageToolsSiteOrigin,
  PAGE_TOOLS_SETTINGS_KEY,
  type PageToolsSettings,
} from './page-tools-schema';

export {
  DEFAULT_PAGE_TOOLS_SETTINGS,
  normalizePageToolsSettings,
  normalizePageToolsSiteOrigin,
  PAGE_TOOLS_SETTINGS_KEY,
  type PageToolsSettings,
} from './page-tools-schema';

/**
 * 网页内工具开关（chrome.storage.local）
 *
 * 用途：
 * - 控制“运行在网页上的交互工具”是否可用（例如划词助手、元素选择器等）。
 * - 该开关与“是否动态注入内容脚本”不同：注入能力也可能被浏览器上下文 metadata/正文采集复用，而网页工具本身仍可单独关闭。
 */

const pageToolsSettingsChannel = createSharedJsonConfigChannel<PageToolsSettings>({
  storageKey: PAGE_TOOLS_SETTINGS_KEY,
  fallback: DEFAULT_PAGE_TOOLS_SETTINGS,
  normalize: normalizePageToolsSettings,
  clone: clonePageToolsSettings,
  isEqual: isSamePageToolsSettings,
  bootstrap: {
    bootstrapSource: 'bootstrap-mirror',
  },
  sameWindowSignal: {
    type: 'none',
  },
});

/** 读取网页工具设置（不存在/解析失败时返回默认值）。 */
export async function loadPageToolsSettings(): Promise<PageToolsSettings> {
  const { value } = await pageToolsSettingsChannel.refreshFromStorage();
  return value;
}

/** 设置是否启用网页工具。 */
export async function setPageToolsEnabled(enabled: boolean): Promise<void> {
  pageToolsSettingsChannel.save({
    ...pageToolsSettingsChannel.getSnapshot(),
    enabled,
  });
}

/** 查询网页工具是否启用（只返回布尔值）。 */
export async function isPageToolsEnabled(): Promise<boolean> {
  const s = await loadPageToolsSettings();
  return Boolean(s.enabled);
}

/**
 * 判断指定网页 URL 下 page-tools 是否可用。
 *
 * @param pageUrl - 当前网页 URL。
 * @returns 同时满足全局启用且当前 origin 未禁用时返回 `true`。
 */
export async function isPageToolsEnabledForUrl(pageUrl: string): Promise<boolean> {
  const settings = await loadPageToolsSettings();
  if (!settings.enabled) return false;
  const origin = normalizePageToolsSiteOrigin(pageUrl);
  if (!origin) return true;
  return !settings.disabledSiteOrigins.includes(origin);
}

/**
 * 将指定站点加入 page-tools 禁用列表。
 *
 * @param pageUrl - 当前网页 URL 或 origin。
 * @returns 写入后的设置快照；非普通网页不会改变列表。
 */
export async function disablePageToolsForSite(pageUrl: string): Promise<PageToolsSettings> {
  const origin = normalizePageToolsSiteOrigin(pageUrl);
  const current = pageToolsSettingsChannel.getSnapshot();
  if (!origin) return current;
  return pageToolsSettingsChannel.save({
    ...current,
    disabledSiteOrigins: Array.from(new Set([...current.disabledSiteOrigins, origin])).sort(),
  });
}

/**
 * 将指定站点从 page-tools 禁用列表移除。
 *
 * @param pageUrl - 当前网页 URL 或 origin。
 * @returns 写入后的设置快照；非普通网页不会改变列表。
 */
export async function enablePageToolsForSite(pageUrl: string): Promise<PageToolsSettings> {
  const origin = normalizePageToolsSiteOrigin(pageUrl);
  const current = pageToolsSettingsChannel.getSnapshot();
  if (!origin) return current;
  return pageToolsSettingsChannel.save({
    ...current,
    disabledSiteOrigins: current.disabledSiteOrigins.filter((item) => item !== origin),
  });
}

/**
 * 清空所有站点级 page-tools 禁用项。
 *
 * @returns 写入后的设置快照。
 */
export async function clearPageToolsDisabledSites(): Promise<PageToolsSettings> {
  return pageToolsSettingsChannel.save({
    ...pageToolsSettingsChannel.getSnapshot(),
    disabledSiteOrigins: [],
  });
}

/**
 * 订阅网页工具设置变更。
 * - 通过 storage.onChanged 同步 UI / Content Script 的实时状态
 */
export function subscribePageToolsSettings(callback: (next: PageToolsSettings) => void): () => void {
  return pageToolsSettingsChannel.subscribe(() => {
    callback(pageToolsSettingsChannel.getSnapshot());
  });
}

void pageToolsSettingsChannel.refreshFromStorage();
