/**
 * 说明：`display-settings` 基础能力模块。
 *
 * 职责：
 * - 承载 `display-settings` 相关的当前文件实现与模块边界；
 * - 对外暴露 `DisplaySettings`、`loadDisplaySettings` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { createSharedJsonConfigChannel } from '@/lib/storage/shared-json-config-channel';
import {
  hasExtensionPageStartupStorageValue,
  readExtensionPageStartupValue,
} from '@/lib/extension/extension-page-startup';
import {
  cloneDisplaySettings,
  coerceDisplaySettings,
  DEFAULT_DISPLAY_SETTINGS,
  DISPLAY_SETTINGS_STORAGE_KEY,
  hasUsableStartupDisplaySettingsValue,
  isSameDisplaySettings,
  type DisplaySettings,
} from '@/lib/display-settings-schema';

/** 显示设置在 localStorage 中使用的 key。 */
const STORAGE_KEY = DISPLAY_SETTINGS_STORAGE_KEY;
const DISPLAY_SETTINGS_EVENT = 'olyq:display-settings';

export {
  coerceDisplaySettings,
  DEFAULT_DISPLAY_SETTINGS,
  DISPLAY_SETTINGS_STORAGE_KEY,
  type ExtensionSettingsOpenMode,
  type DisplaySettings,
} from '@/lib/display-settings-schema';

const displaySettingsChannel = createSharedJsonConfigChannel<DisplaySettings>({
  storageKey: STORAGE_KEY,
  fallback: DEFAULT_DISPLAY_SETTINGS,
  normalize: coerceDisplaySettings,
  clone: cloneDisplaySettings,
  isEqual: isSameDisplaySettings,
  bootstrap: {
    bootstrapSource: 'startup-snapshot',
    readRaw: (fallback) => readExtensionPageStartupValue<unknown>(STORAGE_KEY, fallback, (value) => value),
    hasStorageValue: () => hasExtensionPageStartupStorageValue(STORAGE_KEY),
    isUsableValue: hasUsableStartupDisplaySettingsValue,
  },
  sameWindowSignal: {
    type: 'custom-event',
    eventName: DISPLAY_SETTINGS_EVENT,
  },
});
const displaySettingsHydratedFromStartupStorage = displaySettingsChannel.hydratedFromStartupStorage;

/** 从缓存读取显示设置；冷启动时优先使用 bootstrap mirror。 */
export function loadDisplaySettings(): DisplaySettings {
  return displaySettingsChannel.getSnapshot();
}

/**
 * 页面启动时应用显示设置：
 * - 预热共享显示设置缓存，供首屏侧栏偏好读取
 */
export function applyInitialDisplaySettings(): DisplaySettings {
  const settings = loadDisplaySettings();
  if (!displaySettingsHydratedFromStartupStorage) {
    void displaySettingsChannel.refreshFromStorage({ emitIfChanged: true });
  }
  return settings;
}

/** 更新显示设置（持久化 + 立即应用） */
export function updateDisplaySettings(patch: Partial<DisplaySettings>): DisplaySettings {
  return displaySettingsChannel.save({
    ...loadDisplaySettings(),
    ...patch,
  });
}

/**
 * 订阅显示设置变化事件。
 *
 * 说明：
 * - 这里只监听本模块主动派发的自定义事件，不会自动感知其它 localStorage 写入来源；
 * - 返回值为取消订阅函数。
 */
export function subscribeDisplaySettingsChange(cb: () => void): () => void {
  return displaySettingsChannel.subscribe(cb);
}

if (!displaySettingsHydratedFromStartupStorage) {
  void displaySettingsChannel.refreshFromStorage();
}
