/**
 * 说明：`tab-resolver` 浏览器上下文标签页解析模块。
 *
 * 职责：
 * - 统一解析 browser-context 应该绑定的网页 tab；
 * - 解决扩展页单独开窗口后，`currentWindow` 只会看到扩展页自身的问题；
 * - 仅提供标签页选择，不承担正文采集或 UI 状态展示。
 *
 * 边界：
 * - 这里只做轻量 tab 查询与 URL 判定，不维护持久化状态；
 * - 只有“当前扩展页”才允许回退到其他窗口里的最近活跃网页；
 * - 浏览器内部页保持严格禁采，不会借道其他网页伪装上下文。
 */

import { getExtensionTab, queryExtensionTabs } from '@/lib/extension/runtime-api';

/**
 * 判断某个 URL 是否允许自动页面上下文采集。
 *
 * @param url - 目标地址。
 * @returns 是否为普通网页。
 */
export function isBrowserContextCollectableUrl(url: string): boolean {
  const normalizedUrl = String(url || '').trim();
  if (!normalizedUrl) return false;
  return normalizedUrl.startsWith('http://') || normalizedUrl.startsWith('https://');
}

/**
 * 判断某个 URL 是否属于当前扩展自己的页面。
 *
 * @param url - 目标地址。
 * @returns 是否为当前扩展页面。
 */
export function isCurrentExtensionPageUrl(url: string): boolean {
  const normalizedUrl = String(url || '').trim();
  if (!normalizedUrl) return false;
  try {
    const extensionBaseUrl = chrome.runtime?.getURL?.('') || '';
    return Boolean(extensionBaseUrl && normalizedUrl.startsWith(extensionBaseUrl));
  } catch {
    return false;
  }
}

/**
 * 从主候选与回退候选中选出真正应该绑定的网页 tab。
 *
 * 规则：
 * - 主候选本身是普通网页时，直接使用；
 * - 主候选是当前扩展页时，回退到所有活动 tab 中最近活跃的普通网页；
 * - 主候选是浏览器内部页时，不做跨窗口回退。
 *
 * @param args - 主候选与回退候选集合。
 * @returns 最终网页 tab；找不到时返回 `null`。
 */
export function pickPreferredBrowserContextTab(args: {
  primaryTab?: chrome.tabs.Tab | null;
  fallbackTabs?: chrome.tabs.Tab[] | null;
}): chrome.tabs.Tab | null {
  const primaryTab = args.primaryTab ?? null;
  const primaryUrl = typeof primaryTab?.url === 'string' ? primaryTab.url : '';
  if (primaryTab && typeof primaryTab.id === 'number' && isBrowserContextCollectableUrl(primaryUrl)) {
    return primaryTab;
  }

  const fallbackCandidates = (args.fallbackTabs ?? [])
    .filter((tab) => typeof tab?.id === 'number')
    .filter((tab) => tab.id !== primaryTab?.id)
    .filter((tab) => isBrowserContextCollectableUrl(typeof tab.url === 'string' ? tab.url : ''))
    .sort((left, right) => (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0));

  if (!primaryTab) return fallbackCandidates[0] ?? null;
  if (!isCurrentExtensionPageUrl(primaryUrl)) return null;
  return fallbackCandidates[0] ?? null;
}

/**
 * 解析当前最适合绑定 browser-context 的网页 tab。
 *
 * @param preferredTabId - 显式首选的 tab ID。
 * @returns 最终网页 tab；找不到时返回 `null`。
 */
export async function resolvePreferredBrowserContextTab(preferredTabId?: number | null): Promise<chrome.tabs.Tab | null> {
  const primaryTab = typeof preferredTabId === 'number'
    ? await getExtensionTab(preferredTabId)
    : (await queryExtensionTabs({ active: true, currentWindow: true }))[0] ?? null;
  const fallbackTabs = await queryExtensionTabs({ active: true });
  return pickPreferredBrowserContextTab({ primaryTab, fallbackTabs });
}
