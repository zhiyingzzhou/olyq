/**
 * 说明：`settings` 浏览器上下文设置模块。
 *
 * 职责：
 * - 承载浏览器上下文总开关与全文网页模式预算的持久化、缓存、订阅和立即回流；
 * - 保证 UI、Service Worker 与 content script 读取到同一份跨上下文真源；
 * - 沿用仓库当前 `chrome.storage.local + bootstrap mirror + storage subscription` 的稳定模式。
 *
 * 边界：
 * - 本文件只处理 `olyq.browser-context.settings.v1` 这一个共享配置；
 * - 不负责标签规则、助手 override 或正文采集缓存。
 */
import {
  createSharedJsonConfigChannel,
} from '@/lib/storage/shared-json-config-channel';
import type { BrowserContextSettings } from './types';
import { DEFAULT_BROWSER_CONTEXT_SETTINGS } from './types';
import {
  BROWSER_CONTEXT_SETTINGS_STORAGE_KEY,
  normalizeBrowserContextSettings,
} from './settings-schema';

export {
  BROWSER_CONTEXT_SETTINGS_STORAGE_KEY,
  normalizeBrowserContextSettings,
} from './settings-schema';

const BROWSER_CONTEXT_SETTINGS_EVENT = 'olyq:browser-context-settings-changed';

/**
 * 克隆设置对象，避免把缓存引用直接暴露给调用方。
 *
 * @param settings - 输入设置。
 * @returns 克隆后的对象。
 */
function cloneSettings(settings: BrowserContextSettings): BrowserContextSettings {
  return { ...settings };
}

/**
 * 判断两份设置是否一致。
 *
 * @param left - 左值。
 * @param right - 右值。
 * @returns 是否相同。
 */
function isSameSettings(left: BrowserContextSettings, right: BrowserContextSettings): boolean {
  return left.enabled === right.enabled && left.fullPagePromptChars === right.fullPagePromptChars;
}

const browserContextSettingsChannel = createSharedJsonConfigChannel<BrowserContextSettings>({
  storageKey: BROWSER_CONTEXT_SETTINGS_STORAGE_KEY,
  fallback: DEFAULT_BROWSER_CONTEXT_SETTINGS,
  normalize: normalizeBrowserContextSettings,
  clone: cloneSettings,
  isEqual: isSameSettings,
  bootstrap: {
    bootstrapSource: 'bootstrap-mirror',
  },
  sameWindowSignal: {
    type: 'custom-event',
    eventName: BROWSER_CONTEXT_SETTINGS_EVENT,
  },
});

/** 获取当前设置快照。 */
export function getBrowserContextSettings(): BrowserContextSettings {
  return browserContextSettingsChannel.getSnapshot();
}

/**
 * 以共享存储为准重新读取一次设置。
 *
 * @returns 最新设置快照。
 */
export async function loadBrowserContextSettings(): Promise<BrowserContextSettings> {
  const { value } = await browserContextSettingsChannel.refreshFromStorage();
  return value;
}

/** 读取当前总开关。 */
export function isBrowserContextEnabled(): boolean {
  return Boolean(browserContextSettingsChannel.getSnapshot().enabled);
}

/**
 * 保存浏览器上下文设置。
 *
 * @param settings - 新设置。
 */
export function saveBrowserContextSettings(settings: BrowserContextSettings): void {
  browserContextSettingsChannel.save(settings);
}

/**
 * 仅更新总开关。
 *
 * @param enabled - 是否启用。
 * @returns 最新设置快照。
 */
export function setBrowserContextEnabled(enabled: boolean): BrowserContextSettings {
  const next = { ...browserContextSettingsChannel.getSnapshot(), enabled: Boolean(enabled) };
  saveBrowserContextSettings(next);
  return getBrowserContextSettings();
}

/**
 * 仅更新全文网页模式的 prompt 预算。
 *
 * @param fullPagePromptChars - 新预算。
 * @returns 最新设置快照。
 */
export function setBrowserContextFullPagePromptChars(fullPagePromptChars: number): BrowserContextSettings {
  const next = {
    ...browserContextSettingsChannel.getSnapshot(),
    fullPagePromptChars: normalizeBrowserContextSettings({ fullPagePromptChars }).fullPagePromptChars,
  };
  saveBrowserContextSettings(next);
  return getBrowserContextSettings();
}

/**
 * 订阅设置变化。
 *
 * @param callback - 回调。
 * @returns 取消订阅函数。
 */
export function subscribeBrowserContextSettingsChange(callback: () => void): () => void {
  return browserContextSettingsChannel.subscribe(callback);
}

void browserContextSettingsChannel.refreshFromStorage();
