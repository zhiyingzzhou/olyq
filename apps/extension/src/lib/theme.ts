/**
 * 说明：`theme` 基础能力模块。
 *
 * 职责：
 * - 承载 `theme` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ThemeMode`、`getStoredTheme`、`applyTheme` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 主题（Theme）切换与持久化。
 *
 * 设计：
 * - 通过在 `\<html\>` 上切换 `dark` class 来驱动 Tailwind dark mode；
 * - theme 状态持久化到共享存储；
 * - 通过自定义事件 `olyq:theme-changed` 广播变更，避免强依赖某个 store。
 */

import { createSharedJsonConfigChannel } from '@/lib/storage/shared-json-config-channel';
import {
  hasExtensionPageStartupStorageValue,
  readExtensionPageStartupValue,
} from '@/lib/extension/extension-page-startup';
import {
  applyCurrentDarkThemeColorSelection,
  applyInitialDarkThemeColorSelection,
} from '@/lib/dark-theme-color-settings';
import {
  normalizeTheme,
  THEME_STORAGE_KEY,
  type ThemeMode,
} from '@/lib/theme-schema';

export { normalizeTheme, THEME_STORAGE_KEY, type ThemeMode } from '@/lib/theme-schema';

const THEME_KEY = THEME_STORAGE_KEY;
const THEME_EVENT = 'olyq:theme-changed';

const themeChannel = createSharedJsonConfigChannel<ThemeMode | null>({
  storageKey: THEME_KEY,
  fallback: null,
  normalize: normalizeTheme,
  clone: (value) => value,
  isEqual: (left, right) => left === right,
  bootstrap: {
    bootstrapSource: 'startup-snapshot',
    readRaw: (fallback) => readExtensionPageStartupValue<unknown>(THEME_KEY, fallback, (value) => value),
    hasStorageValue: () => hasExtensionPageStartupStorageValue(THEME_KEY),
    isUsableValue: (raw) => normalizeTheme(raw) !== null,
  },
  sameWindowSignal: {
    type: 'custom-event',
    eventName: THEME_EVENT,
  },
  applySideEffect: (mode) => {
    if (mode) applyTheme(mode);
  },
});
const themeHydratedFromStartupStorage = themeChannel.hydratedFromStartupStorage;

/** 读取存储的主题；若无有效值返回 null。 */
export function getStoredTheme(): ThemeMode | null {
  return themeChannel.getSnapshot();
}

/** 将主题应用到 DOM（切换 `\<html class="dark"\>`）。 */
export function applyTheme(mode: ThemeMode) {
  document.documentElement.classList.toggle('dark', mode === 'dark');
  applyCurrentDarkThemeColorSelection(mode === 'dark');
}

/**
 * 设置主题：写入共享存储、应用到 DOM 并广播事件。
 */
export function setTheme(mode: ThemeMode) {
  themeChannel.save(mode);
}

/**
 * 订阅主题变更事件。
 *
 * @returns unsubscribe 取消订阅函数
 */
export function subscribeThemeChange(cb: () => void) {
  return themeChannel.subscribe(cb);
}

/**
 * 初始化主题：
 * - 优先读取 bootstrap mirror；
 * - 否则跟随系统 prefers-color-scheme（默认偏向 dark）。
 */
export function applyInitialTheme() {
  try {
    const stored = getStoredTheme();
    if (stored) {
      applyTheme(stored);
      applyInitialDarkThemeColorSelection(stored === 'dark');
      if (!themeHydratedFromStartupStorage) {
        void themeChannel.refreshFromStorage({ emitIfChanged: true });
      }
      return;
    }
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? true;
    const initialMode = prefersDark ? 'dark' : 'light';
    applyTheme(initialMode);
    applyInitialDarkThemeColorSelection(initialMode === 'dark');
    if (!themeHydratedFromStartupStorage) {
      void themeChannel.refreshFromStorage({ emitIfChanged: true });
    }
  } catch {
    // 忽略
  }
}

if (!themeHydratedFromStartupStorage) {
  void themeChannel.refreshFromStorage();
}
