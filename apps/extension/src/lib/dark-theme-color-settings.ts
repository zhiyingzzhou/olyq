/**
 * 说明：`dark-theme-color-settings` 深色主题色持久化模块。
 *
 * 职责：
 * - 管理深色主题色选择的唯一共享存储真源；
 * - 复用 `createSharedJsonConfigChannel` 完成启动快照、storage 回流和同窗口事件同步；
 * - 在选择变化时把品牌 / 强调色 palette 应用到 DOM。
 *
 * 边界：
 * - 本文件只保存“选择了哪套 palette / 哪个自定义源色”，不保存派生后的 CSS token；
 * - 色彩派生和 DOM 注入由 `dark-theme-colors` 负责；
 * - 主题明暗模式仍只由 `theme.ts` 的 `olyq.theme.v1` 管理。
 */
import {
  DARK_THEME_COLOR_STORAGE_KEY,
  hasExtensionPageStartupStorageValue,
  readExtensionPageStartupValue,
} from '@/lib/extension/extension-page-startup';
import { createSharedJsonConfigChannel } from '@/lib/storage/shared-json-config-channel';
import {
  DEFAULT_DARK_THEME_COLOR_SELECTION,
  applyDarkThemeColorSelectionToDom,
  cloneDarkThemeColorSelection,
  isUsableDarkThemeColorSelectionValue,
  normalizeDarkThemeColorSelection,
  resolveDarkThemePalette,
  type DarkThemeColorSelection,
} from '@/lib/dark-theme-colors';

const DARK_THEME_COLOR_EVENT = 'olyq:dark-theme-color-changed';

/**
 * 判断两份深色主题色选择是否相同。
 *
 * @param left - 左侧选择。
 * @param right - 右侧选择。
 * @returns 两者语义是否一致。
 */
function isSameDarkThemeColorSelection(
  left: DarkThemeColorSelection,
  right: DarkThemeColorSelection,
): boolean {
  return left.kind === right.kind
    && left.presetId === right.presetId
    && left.sourceHex === right.sourceHex;
}

/**
 * 判断当前 DOM 是否处于深色模式。
 *
 * @returns 当前根节点是否带有 `.dark`。
 */
function isDarkModeActive(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
}

const darkThemeColorChannel = createSharedJsonConfigChannel<DarkThemeColorSelection>({
  storageKey: DARK_THEME_COLOR_STORAGE_KEY,
  fallback: DEFAULT_DARK_THEME_COLOR_SELECTION,
  normalize: normalizeDarkThemeColorSelection,
  clone: cloneDarkThemeColorSelection,
  isEqual: isSameDarkThemeColorSelection,
  bootstrap: {
    bootstrapSource: 'startup-snapshot',
    readRaw: (fallback) => readExtensionPageStartupValue<unknown>(DARK_THEME_COLOR_STORAGE_KEY, fallback, (value) => value),
    hasStorageValue: () => hasExtensionPageStartupStorageValue(DARK_THEME_COLOR_STORAGE_KEY),
    isUsableValue: isUsableDarkThemeColorSelectionValue,
  },
  sameWindowSignal: {
    type: 'custom-event',
    eventName: DARK_THEME_COLOR_EVENT,
  },
  applySideEffect: (selection) => {
    applyDarkThemeColorSelectionToDom(selection, isDarkModeActive());
  },
});
const darkThemeColorHydratedFromStartupStorage = darkThemeColorChannel.hydratedFromStartupStorage;

/**
 * 读取当前深色主题色选择。
 *
 * @returns 当前缓存中的深色主题色选择。
 */
export function loadDarkThemeColorSelection(): DarkThemeColorSelection {
  return darkThemeColorChannel.getSnapshot();
}

/**
 * 更新深色主题色选择。
 *
 * @param next - 新选择；会先按当前协议规范化。
 * @returns 保存后的选择。
 */
export function updateDarkThemeColorSelection(next: unknown): DarkThemeColorSelection {
  return darkThemeColorChannel.save(next);
}

/**
 * 订阅深色主题色选择变化。
 *
 * @param callback - 变化回调。
 * @returns 取消订阅函数。
 */
export function subscribeDarkThemeColorSelectionChange(callback: () => void): () => void {
  return darkThemeColorChannel.subscribe(callback);
}

/**
 * 把当前深色主题色选择应用到 DOM。
 *
 * @param active - 是否让品牌 / 强调色 palette 生效；浅色模式传 false 会移除运行时 style。
 */
export function applyCurrentDarkThemeColorSelection(active: boolean): void {
  applyDarkThemeColorSelectionToDom(loadDarkThemeColorSelection(), active);
}

/**
 * 初始化深色主题色选择。
 *
 * @param active - 当前主题是否为深色。
 * @returns 当前深色主题色选择。
 */
export function applyInitialDarkThemeColorSelection(active: boolean): DarkThemeColorSelection {
  const selection = loadDarkThemeColorSelection();
  applyDarkThemeColorSelectionToDom(selection, active);
  if (!darkThemeColorHydratedFromStartupStorage) {
    void darkThemeColorChannel.refreshFromStorage({ emitIfChanged: true });
  }
  return selection;
}

/**
 * 获取当前深色主题色品牌 / 强调色 palette。
 *
 * @returns 当前选择解析后的 CSS palette。
 */
export function getCurrentDarkThemeColorPalette() {
  return resolveDarkThemePalette(loadDarkThemeColorSelection());
}

if (!darkThemeColorHydratedFromStartupStorage) {
  void darkThemeColorChannel.refreshFromStorage();
}
