/**
 * 说明：`index` 浏览器上下文门面模块。
 *
 * 职责：
 * - 统一导出 `browser-context` 子系统的公共能力；
 * - 保证调用方无需关心 settings / policy / runtime / collector 的内部文件布局；
 * - 作为彻底替换旧 `page-context` 的唯一入口。
 *
 * 边界：
 * - 这里只做 re-export，不承载额外逻辑。
 */
export type {
  BrowserContextConversationMode,
  BrowserContextCaptureMode,
  BrowserContextCollectionPreview,
  BrowserContextCollectionIssue,
  BrowserContextCollectionIssueCode,
  BrowserContextAssistantOverride,
  BrowserContextAssistantOverrideMode,
  BrowserContextCollectedSource,
  BrowserContextCollectorContext,
  BrowserContextCollectorPlugin,
  BrowserContextElementSnapshot,
  BrowserContextHeading,
  BrowserContextMetadataSnapshot,
  BrowserContextPromptFragment,
  BrowserContextPolicyState,
  BrowserContextProfile,
  BrowserContextProfileId,
  BrowserContextPromptResult,
  BrowserContextSourceManifest,
  BrowserContextSourceManifestEntry,
  BrowserContextSourceFreshness,
  BrowserContextSelectionSnapshot,
  BrowserContextSettings,
  BrowserContextSourceId,
  BrowserContextTagRule,
  BrowserContextStyleCapturePreview,
  BrowserContextViewStatus,
  BrowserContextViewState,
  BrowserContextWorkReason,
  ResolvedBrowserContextPolicy,
} from './types';
export type { BrowserContextProfilePresentation } from './profile-presentation';
export type { BrowserContextEffectiveState } from './effective-state';
export {
  BROWSER_CONTEXT_PRESET_PROFILE_MAP,
  BROWSER_CONTEXT_TAG_PROFILE_MAP,
  BUILTIN_BROWSER_CONTEXT_PROFILES,
  DEFAULT_BROWSER_CONTEXT_CONVERSATION_MODE,
  DEFAULT_BROWSER_CONTEXT_POLICY_STATE,
  DEFAULT_BROWSER_CONTEXT_PROFILE_ID,
  DEFAULT_BROWSER_CONTEXT_SETTINGS,
  cloneBrowserContextSourceManifest,
  cloneBrowserContextProfile,
  createEmptyBrowserContextSourceManifest,
  findBuiltinBrowserContextProfile,
  getDefaultBrowserContextProfile,
} from './types';
export { getBrowserContextProfilePresentation } from './profile-presentation';
export {
  buildEffectiveBrowserContextProfile,
  resolveBrowserContextEffectiveState,
} from './effective-state';
export {
  buildBrowserContextPrompt,
  collectSources,
  clearBrowserContextPromptCache,
  convertReadableHtmlToMarkdown,
  getBrowserContextCollectors,
  invalidateBrowserContextPromptCacheEntry,
  invalidateBrowserContextPromptCacheForTab,
  queryActiveTabMetadata,
  renderBrowserContextPrompt,
  refreshBrowserContextPrompt,
  registerBrowserContextCollector,
  resolveBrowserContextForSend,
  resolvePageIdentity,
  requestPageStyleLayoutFromSw,
  requestPageStyleSignalsFromSw,
  requestReadableDomFromSw,
} from './collectors';
export {
  isBrowserContextCollectableUrl,
  isCurrentExtensionPageUrl,
  pickPreferredBrowserContextTab,
  resolvePreferredBrowserContextTab,
} from './tab-resolver';
export {
  disposeBrowserContextListener,
  initBrowserContextListener,
  requestBrowserContextMetadata,
} from './manager';
export {
  cancelScheduledBrowserContextWork,
  scheduleBrowserContextWork,
} from './scheduler';
export {
  BROWSER_CONTEXT_SETTINGS_STORAGE_KEY,
  getBrowserContextSettings,
  isBrowserContextEnabled,
  loadBrowserContextSettings,
  normalizeBrowserContextSettings,
  saveBrowserContextSettings,
  setBrowserContextEnabled,
  setBrowserContextFullPagePromptChars,
  subscribeBrowserContextSettingsChange,
} from './settings';
export {
  BROWSER_CONTEXT_POLICY_STORAGE_KEY,
  buildDefaultBrowserContextRulesFromTags,
  getBrowserContextAssistantMode,
  getBrowserContextAssistantOverride,
  getBrowserContextPolicyState,
  normalizeBrowserContextPolicyState,
  removeBrowserContextAssistantOverride,
  removeBrowserContextAssistantOverrides,
  resolveBrowserContextPolicyForAssistant,
  saveBrowserContextPolicyState,
  seedBrowserContextAssistantOverride,
  setBrowserContextTagRules,
  subscribeBrowserContextPolicyChange,
  upsertBrowserContextAssistantOverride,
} from './policy';
export {
  getBrowserContextConversationMode,
} from './conversation-mode';
export {
  getBrowserContextLastCollection,
  getBrowserContextElementSnapshot,
  getBrowserContextMetadata,
  getBrowserContextProfile,
  getBrowserContextSourceManifest,
  getBrowserContextSelectionSnapshot,
  getBrowserContextViewState,
  getBrowserContextViewSettings,
  onBrowserContextChange,
  resetBrowserContextRuntime,
  setBrowserContextActiveConversationKey,
  setBrowserContextCollecting,
  setBrowserContextElementSnapshot,
  setBrowserContextLastCollection,
  setBrowserContextMetadata,
  setBrowserContextProfile,
  setBrowserContextSourceManifest,
  setBrowserContextStatus,
  setBrowserContextSelectionSnapshot,
  toggleBrowserContextEnabled,
} from './runtime';
