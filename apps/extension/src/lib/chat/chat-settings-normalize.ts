/**
 * 说明：聊天默认设置的纯归一化模块。
 *
 * 职责：
 * - 规整 `olyq.chat.settings.v1` 的当前 v1 schema；
 * - 保证翻译语言、默认模型字段和导出菜单开关在写入 storage / backup / sync 前保持稳定；
 * - 为 React store 与底层 Data Contract Registry 提供无副作用的共享入口。
 *
 * 边界：
 * - 本模块不创建 zustand store、不访问 storage、不读取 i18n；
 * - 需要当前语言默认 system prompt 的场景仍由调用方传入已本地化的默认设置；
 * - 当前开发期只认当前 v1 结构，不提供旧字段兼容读取。
 */
import type { ChatSettings } from '@/types/chat';
import { DEFAULT_SETTINGS } from '@/types/chat';
import { normalizeSupportedTranslationSelection } from '@/lib/chat/translation-languages';

/**
 * 归一化聊天默认设置。
 *
 * @param settings - 已合并默认值后的聊天设置对象。
 * @returns 符合当前 `olyq.chat.settings.v1` 契约的设置对象。
 */
export function normalizeChatSettings(settings: ChatSettings): ChatSettings {
  const settingsWithoutTheme = { ...(settings as ChatSettings & { theme?: unknown }) };
  delete settingsWithoutTheme.theme;
  const { languages: translateLanguages, targetLanguage: translateTargetLanguage } = normalizeSupportedTranslationSelection({
    languages: settingsWithoutTheme.translateLanguages,
    targetLanguage: settingsWithoutTheme.translateTargetLanguage,
  });
  const defaultExportMenuOptions = DEFAULT_SETTINGS.exportMenuOptions ?? {};
  const nextExportMenuOptions: NonNullable<ChatSettings['exportMenuOptions']> = { ...defaultExportMenuOptions };
  const rawExportMenuOptions = settingsWithoutTheme.exportMenuOptions ?? {};

  for (const key of Object.keys(defaultExportMenuOptions) as Array<keyof typeof defaultExportMenuOptions>) {
    const value = rawExportMenuOptions[key];
    if (typeof value === 'boolean') nextExportMenuOptions[key] = value;
  }

  return {
    ...settingsWithoutTheme,
    defaultImageModel: typeof settingsWithoutTheme.defaultImageModel === 'string' && settingsWithoutTheme.defaultImageModel.trim()
      ? settingsWithoutTheme.defaultImageModel.trim()
      : undefined,
    defaultTranscriptionModel: typeof settingsWithoutTheme.defaultTranscriptionModel === 'string' && settingsWithoutTheme.defaultTranscriptionModel.trim()
      ? settingsWithoutTheme.defaultTranscriptionModel.trim()
      : undefined,
    defaultSpeechModel: typeof settingsWithoutTheme.defaultSpeechModel === 'string' && settingsWithoutTheme.defaultSpeechModel.trim()
      ? settingsWithoutTheme.defaultSpeechModel.trim()
      : undefined,
    defaultSpeechVoice: typeof settingsWithoutTheme.defaultSpeechVoice === 'string' && settingsWithoutTheme.defaultSpeechVoice.trim()
      ? settingsWithoutTheme.defaultSpeechVoice.trim()
      : undefined,
    ocrModel: typeof settingsWithoutTheme.ocrModel === 'string' && settingsWithoutTheme.ocrModel.trim()
      ? settingsWithoutTheme.ocrModel.trim()
      : undefined,
    defaultImagePromptPrefix: typeof settingsWithoutTheme.defaultImagePromptPrefix === 'string'
      ? settingsWithoutTheme.defaultImagePromptPrefix
      : DEFAULT_SETTINGS.defaultImagePromptPrefix,
    translateLanguages,
    translateTargetLanguage,
    exportMenuOptions: nextExportMenuOptions,
  };
}
