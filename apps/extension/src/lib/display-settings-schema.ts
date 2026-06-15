/**
 * 说明：`display-settings-schema` 显示设置持久化契约模块。
 *
 * 职责：
 * - 定义显示设置的固定 v1 存储 key、默认值和 schema；
 * - 为启动快照、运行时 channel、备份恢复和 Data Contract Registry 提供无副作用规整入口；
 * - 保证显示设置契约不依赖 DOM 或 shared-json channel 初始化。
 *
 * 边界：
 * - 本文件只处理结构规整和比较；
 * - DOM 属性应用、storage 写入与订阅仍由 `display-settings.ts` 负责。
 */
import { isPlainRecord } from '@/lib/utils/type-guards';

/** 显示设置存储 key。 */
export const DISPLAY_SETTINGS_STORAGE_KEY = 'olyq.display-settings.v1';

/** 扩展设置入口的打开承载方式。 */
export type ExtensionSettingsOpenMode = 'dialog' | 'workspace';

/** 显示相关偏好设置（仅影响 UI，不影响业务数据）。 */
export interface DisplaySettings {
  /** 侧边栏位置。 */
  sidebarPosition: 'left' | 'right';
  /** 是否收起侧边栏（mini 模式）。 */
  sidebarCollapsed: boolean;
  /** 当前侧边栏主标签。 */
  sidebarTab: 'assistants' | 'topics';
  /** 点击助手后是否自动切到话题列表。 */
  clickAssistantToShowTopic: boolean;
  /** 助手标签页展示模式。 */
  assistantsTabSortType: 'list' | 'tags';
  /** 是否仅在显示层把置顶话题浮到顶部。 */
  pinTopicsToTop: boolean;
  /** 扩展设置入口的默认打开承载方式。 */
  extensionSettingsOpenMode: ExtensionSettingsOpenMode;
}

/** 显示设置默认值。 */
export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  sidebarPosition: 'left',
  sidebarCollapsed: false,
  sidebarTab: 'topics',
  clickAssistantToShowTopic: true,
  assistantsTabSortType: 'list',
  pinTopicsToTop: false,
  extensionSettingsOpenMode: 'dialog',
};

/**
 * 克隆显示设置，避免把缓存引用暴露给调用方。
 *
 * @param settings - 输入设置。
 * @returns 独立的显示设置副本。
 */
export function cloneDisplaySettings(settings: DisplaySettings): DisplaySettings {
  return { ...settings };
}

/**
 * 把任意原始值收敛为合法的显示设置对象。
 *
 * @param raw - 未信任的 storage / backup / sync 输入。
 * @returns 当前 v1 显示设置。
 */
export function coerceDisplaySettings(raw: unknown): DisplaySettings {
  if (!isPlainRecord(raw)) return cloneDisplaySettings(DEFAULT_DISPLAY_SETTINGS);
  return {
    sidebarPosition: raw.sidebarPosition === 'right' ? 'right' : DEFAULT_DISPLAY_SETTINGS.sidebarPosition,
    sidebarCollapsed: typeof raw.sidebarCollapsed === 'boolean' ? raw.sidebarCollapsed : DEFAULT_DISPLAY_SETTINGS.sidebarCollapsed,
    sidebarTab: raw.sidebarTab === 'assistants' ? 'assistants' : DEFAULT_DISPLAY_SETTINGS.sidebarTab,
    clickAssistantToShowTopic:
      typeof raw.clickAssistantToShowTopic === 'boolean'
        ? raw.clickAssistantToShowTopic
        : DEFAULT_DISPLAY_SETTINGS.clickAssistantToShowTopic,
    assistantsTabSortType: raw.assistantsTabSortType === 'tags' ? 'tags' : DEFAULT_DISPLAY_SETTINGS.assistantsTabSortType,
    pinTopicsToTop: typeof raw.pinTopicsToTop === 'boolean' ? raw.pinTopicsToTop : DEFAULT_DISPLAY_SETTINGS.pinTopicsToTop,
    extensionSettingsOpenMode:
      raw.extensionSettingsOpenMode === 'workspace'
        ? 'workspace'
        : DEFAULT_DISPLAY_SETTINGS.extensionSettingsOpenMode,
  };
}

/**
 * 判断启动快照里的显示设置是否足够可信，可直接当作当前页真源。
 *
 * @param raw - 启动快照中的原始值。
 * @returns 只有当前 schema 的显示字段全部存在且形态合法时返回 `true`。
 */
export function hasUsableStartupDisplaySettingsValue(raw: unknown): boolean {
  if (!isPlainRecord(raw)) return false;
  return (
    (raw.sidebarPosition === 'left' || raw.sidebarPosition === 'right')
    && typeof raw.sidebarCollapsed === 'boolean'
    && (raw.sidebarTab === 'assistants' || raw.sidebarTab === 'topics')
    && typeof raw.clickAssistantToShowTopic === 'boolean'
    && (raw.assistantsTabSortType === 'list' || raw.assistantsTabSortType === 'tags')
    && typeof raw.pinTopicsToTop === 'boolean'
    && (raw.extensionSettingsOpenMode === 'dialog' || raw.extensionSettingsOpenMode === 'workspace')
  );
}

/**
 * 判断两份显示设置是否完全一致。
 *
 * @param left - 左值。
 * @param right - 右值。
 * @returns 是否相同。
 */
export function isSameDisplaySettings(left: DisplaySettings, right: DisplaySettings): boolean {
  return (
    left.sidebarPosition === right.sidebarPosition
    && left.sidebarCollapsed === right.sidebarCollapsed
    && left.sidebarTab === right.sidebarTab
    && left.clickAssistantToShowTopic === right.clickAssistantToShowTopic
    && left.assistantsTabSortType === right.assistantsTabSortType
    && left.pinTopicsToTop === right.pinTopicsToTop
    && left.extensionSettingsOpenMode === right.extensionSettingsOpenMode
  );
}
