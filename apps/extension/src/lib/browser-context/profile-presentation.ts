/**
 * 说明：`profile-presentation` 浏览器上下文 profile 展示辅助模块。
 *
 * 职责：
 * - 为内置与自定义 profile 统一生成用户可读标题、说明和能力摘要；
 * - 让设置面板、助手编辑器和状态条复用同一套展示语义；
 * - 保持 profile 真源仍在 `types.ts`，这里只负责显示层拼装。
 *
 * 边界：
 * - 不参与策略解析、持久化和正文采集；
 * - 内置 profile 的显示文本走 i18n，自定义 profile 直接显示用户输入值。
 */
import type { BrowserContextProfile, BrowserContextProfileId } from './types';

type TranslationFn = (key: string, options?: Record<string, unknown>) => string;

const BUILTIN_PROFILE_KEY_MAP: Record<BrowserContextProfileId, { title: string; description: string }> = {
  'minimal-page': {
    title: 'pageContext.profileCatalog.minimalPage.title',
    description: 'pageContext.profileCatalog.minimalPage.description',
  },
  'deep-page': {
    title: 'pageContext.profileCatalog.deepPage.title',
    description: 'pageContext.profileCatalog.deepPage.description',
  },
  'focused-snippet': {
    title: 'pageContext.profileCatalog.focusedSnippet.title',
    description: 'pageContext.profileCatalog.focusedSnippet.description',
  },
  'structured-extraction': {
    title: 'pageContext.profileCatalog.structuredExtraction.title',
    description: 'pageContext.profileCatalog.structuredExtraction.description',
  },
  'workflow-aware': {
    title: 'pageContext.profileCatalog.workflowAware.title',
    description: 'pageContext.profileCatalog.workflowAware.description',
  },
};

/** 浏览器上下文 profile 的显示描述。 */
export interface BrowserContextProfilePresentation {
  /** 主标题。 */
  title: string;
  /** 简要说明。 */
  description: string;
  /** 能力摘要。 */
  detail: string;
  /** 次要技术标识。 */
  technicalId: string;
}

/**
 * 生成 profile 的能力摘要标签。
 *
 * @param profile - 目标 profile。
 * @param t - 国际化函数。
 * @returns 单行摘要。
 */
function buildProfileDetail(profile: BrowserContextProfile, t: TranslationFn): string {
  const usesSelection = profile.sources.includes('selection-snapshot');
  const usesElement = profile.sources.includes('element-snapshot');
  const sourceLabel = usesSelection && usesElement
    ? t('pageContext.profileCatalog.detail.selectionAndElement')
    : usesSelection
      ? t('pageContext.profileCatalog.detail.selection')
      : usesElement
        ? t('pageContext.profileCatalog.detail.element')
        : t('pageContext.profileCatalog.detail.pageOnly');
  return [
    t('pageContext.profileCatalog.detail.promptBudget', { count: profile.maxPromptChars }),
    sourceLabel,
  ].join(' · ');
}

/**
 * 生成 profile 的用户可读显示信息。
 *
 * @param profile - 目标 profile。
 * @param t - 国际化函数。
 * @returns 结构化显示信息。
 */
export function getBrowserContextProfilePresentation(
  profile: BrowserContextProfile,
  t: TranslationFn,
): BrowserContextProfilePresentation {
  const builtinKeys = BUILTIN_PROFILE_KEY_MAP[profile.id as BrowserContextProfileId];
  return {
    title: builtinKeys ? t(builtinKeys.title) : String(profile.title || profile.id || '').trim() || profile.id,
    description: builtinKeys
      ? t(builtinKeys.description)
      : String(profile.description || '').trim() || t('pageContext.profileCatalog.customDescription'),
    detail: buildProfileDetail(profile, t),
    technicalId: profile.id,
  };
}
