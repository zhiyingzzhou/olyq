/**
 * 说明：`settings` 基础能力模块。
 *
 * 职责：
 * - 承载 `settings` 相关的当前文件实现与模块边界；
 * - 对外暴露 `loadWebSearchSettings`、`saveWebSearchSettings`、`getWebSearchSettings` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import {
  createSharedJsonConfigChannel,
} from '@/lib/storage/shared-json-config-channel';
import type { WebSearchSettings } from './types';
import { DEFAULT_WEB_SEARCH_SETTINGS } from './types';
import {
  cloneWebSearchSettings,
  isSameWebSearchSettings,
  normalizeWebSearchSettings,
  WEB_SEARCH_SETTINGS_STORAGE_KEY,
} from './settings-schema';

export {
  normalizeWebSearchSettings,
  WEB_SEARCH_SETTINGS_STORAGE_KEY,
} from './settings-schema';

/**
 * Web Search 设置的本地读写。
 *
 * 说明：
 * - 该设置属于跨上下文共享的小型 JSON 配置；
 * - 保存后会派发 `olyq:web-search-changed` 事件，供订阅方实时更新；
 * - `localStorage` 只保留 bootstrap mirror 派生缓存，不再作为真源。
 */
const WEB_SEARCH_SETTINGS_EVENT = 'olyq:web-search-changed';

const webSearchSettingsChannel = createSharedJsonConfigChannel<WebSearchSettings>({
  storageKey: WEB_SEARCH_SETTINGS_STORAGE_KEY,
  fallback: DEFAULT_WEB_SEARCH_SETTINGS,
  normalize: normalizeWebSearchSettings,
  clone: cloneWebSearchSettings,
  isEqual: isSameWebSearchSettings,
  bootstrap: {
    bootstrapSource: 'bootstrap-mirror',
  },
  sameWindowSignal: {
    type: 'custom-event',
    eventName: WEB_SEARCH_SETTINGS_EVENT,
  },
});

/** 从缓存加载 WebSearchSettings；模块启动后会异步与共享存储对齐。 */
export function loadWebSearchSettings(): WebSearchSettings {
  return webSearchSettingsChannel.getSnapshot();
}

/**
 * 保存 WebSearchSettings，并广播变更事件。
 *
 * 事件：`olyq:web-search-changed`（detail 为最新 settings）
 */
export function saveWebSearchSettings(settings: WebSearchSettings): void {
  webSearchSettingsChannel.save(settings);
}

/** 获取当前 WebSearchSettings（语义别名）。 */
export function getWebSearchSettings(): WebSearchSettings {
  return loadWebSearchSettings();
}

/**
 * 订阅网页搜索配置变化。
 *
 * 说明：
 * - 共享存储是主同步源；
 * - 当前窗口事件只作为立即回流补充，不再是唯一同步机制。
 */
export function subscribeWebSearchSettingsChange(callback: () => void): () => void {
  return webSearchSettingsChannel.subscribe(callback);
}

void webSearchSettingsChannel.refreshFromStorage();
