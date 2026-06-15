/**
 * 说明：`constants` 基础能力模块。
 *
 * 职责：
 * - 承载聊天设置默认值、模型参数预设和内置 Prompt 的稳定结构；
 * - 对外暴露 `getModelPresets`、`getBuiltinPrompts`、`getDefaultSettings` 等 locale-aware factory，供 UI 和 store 复用；
 *
 * 边界：
 * - 本文件只定义结构和默认值，不读取存储、不绑定 React，也不提前决定当前 UI 语言。
 */
import type { ChatSettings, PromptTemplate } from '@/types/chat';
import { DEFAULT_SELECTED_TRANSLATION_LANGUAGES, DEFAULT_TRANSLATE_TARGET_LANGUAGE } from '@/lib/chat/translation-languages';

/** 构造本地化默认值所需的最小翻译函数契约。 */
export type ChatConstantsTranslate = (key: string, params?: Record<string, unknown>) => string;

/**
 * 内部函数变量：`translateKeyFallback`。
 *
 * @remarks
 * 非 React 场景的英文兜底翻译器；真实 UI 必须传入当前语言的 `t`。
 */
const translateKeyFallback: ChatConstantsTranslate = (key) => {
  const fallback: Record<string, string> = {
    'chat.defaultSystemPrompt': 'You are a helpful AI assistant. Answer clearly and concisely.',
    'modelPresets.creative': 'Creative',
    'modelPresets.balanced': 'Balanced',
    'modelPresets.precise': 'Precise',
    'prompt.builtinPrompts.translate.title': 'Translation Template',
    'prompt.builtinPrompts.translate.content': 'Translate the following content into the target language. If the content is Chinese, translate it into English; if it is English, translate it into Chinese. Preserve the original tone, style, and terminology.',
    'prompt.builtinPrompts.translate.category': 'Translation',
    'prompt.builtinPrompts.coder.title': 'Code Question',
    'prompt.builtinPrompts.coder.content': 'Provide writing, debugging, and optimization guidance for the following code or question. Explain the key reasons, risks, and actionable best practices.',
    'prompt.builtinPrompts.coder.category': 'Programming',
    'prompt.builtinPrompts.writer.title': 'Writing Revision',
    'prompt.builtinPrompts.writer.content': 'Improve the structure, wording, and expression of the following text while preserving its intent, and provide constructive revision suggestions.',
    'prompt.builtinPrompts.writer.category': 'Writing',
    'prompt.builtinPrompts.summarizer.title': 'Content Summary',
    'prompt.builtinPrompts.summarizer.content': 'Summarize the following content, extract the key points, and present them clearly and concisely.',
    'prompt.builtinPrompts.summarizer.category': 'Productivity',
    'prompt.builtinPrompts.explainer.title': 'Concept Explainer',
    'prompt.builtinPrompts.explainer.content': 'Explain the following concept or question in plain language, using analogies and examples when helpful.',
    'prompt.builtinPrompts.explainer.category': 'Learning',
  };
  return fallback[key] ?? key;
};

/** 模型参数预设（创意/均衡/精确）的稳定数值真源。 */
const MODEL_PRESET_DEFS = {
  /** 更偏发散与创造性的采样档位。 */
  creative: { nameKey: 'modelPresets.creative', temperature: 0.9, topP: 0.95, maxTokens: 4096 },
  /** 兼顾稳定性与表达丰富度的默认档位。 */
  balanced: { nameKey: 'modelPresets.balanced', temperature: 0.7, topP: 0.9, maxTokens: 2048 },
  /** 更偏确定性与精确回答的保守档位。 */
  precise: { nameKey: 'modelPresets.precise', temperature: 0.2, topP: 0.5, maxTokens: 2048 },
} as const;

/** 返回当前 UI 语言下的模型参数预设。 */
export function getModelPresets(t: ChatConstantsTranslate) {
  return {
    creative: { ...MODEL_PRESET_DEFS.creative, name: t(MODEL_PRESET_DEFS.creative.nameKey) },
    balanced: { ...MODEL_PRESET_DEFS.balanced, name: t(MODEL_PRESET_DEFS.balanced.nameKey) },
    precise: { ...MODEL_PRESET_DEFS.precise, name: t(MODEL_PRESET_DEFS.precise.nameKey) },
  } as const;
}

/** 模型参数预设的非 React 兜底实例；UI 展示应优先调用 `getModelPresets(t)`。 */
export const MODEL_PRESETS = getModelPresets(translateKeyFallback);

const BUILTIN_PROMPT_IDS = ['translate', 'coder', 'writer', 'summarizer', 'explainer'] as const;

/** 返回当前 UI 语言下的内置 Prompt 模板。 */
export function getBuiltinPrompts(t: ChatConstantsTranslate): PromptTemplate[] {
  return BUILTIN_PROMPT_IDS.map((id) => ({
    id,
    title: t(`prompt.builtinPrompts.${id}.title`),
    content: t(`prompt.builtinPrompts.${id}.content`),
    category: t(`prompt.builtinPrompts.${id}.category`),
    isBuiltin: true,
    createdAt: 0,
  }));
}

/** 内置 Prompt 模板的非 React 兜底实例；UI 展示应优先调用 `getBuiltinPrompts(t)`。 */
export const BUILTIN_PROMPTS: PromptTemplate[] = getBuiltinPrompts(translateKeyFallback);

const DEFAULT_SETTINGS_BASE: Omit<ChatSettings, 'defaultSystemPrompt'> = {
  defaultModel: 'openai/gpt-5.4',
  defaultTemperature: 0.7,
  defaultTopP: 0.9,
  defaultMaxTokens: 2048,
  defaultContextLength: 10,
  defaultImagePromptPrefix: '',
  defaultTranscriptionModel: undefined,
  defaultSpeechModel: undefined,
  defaultSpeechVoice: undefined,
  ocrModel: undefined,
  sendMessageShortcut: 'enter',
  confirmDeleteMessage: true,
  confirmRegenerateMessage: true,
  translateLanguages: [...DEFAULT_SELECTED_TRANSLATION_LANGUAGES],
  showTranslateConfirm: true,
  translateTargetLanguage: DEFAULT_TRANSLATE_TARGET_LANGUAGE,
  exportMenuOptions: {
    copy_plain: true,
    copy_image: true,
    export_image: true,
    markdown: true,
    markdown_reason: true,
    word: true,
  },
  pasteLongTextAsFile: true,
  pasteLongTextThreshold: 2000,
  autoTranslateWithSpace: false,
  showMessageOutline: false,
  messageNavigation: 'buttons',
  gridPopoverTrigger: 'hover',
  enableDeveloperMode: false,
};

/** 返回当前 UI 语言下的全局聊天默认设置。 */
export function getDefaultSettings(t: ChatConstantsTranslate): ChatSettings {
  return {
    ...DEFAULT_SETTINGS_BASE,
    translateLanguages: [...(DEFAULT_SETTINGS_BASE.translateLanguages ?? DEFAULT_SELECTED_TRANSLATION_LANGUAGES)],
    exportMenuOptions: { ...DEFAULT_SETTINGS_BASE.exportMenuOptions },
    defaultSystemPrompt: t('chat.defaultSystemPrompt'),
  };
}

/** 全局聊天默认设置的非 React 兜底实例；运行时初始化应优先调用 `getDefaultSettings(t)`。 */
export const DEFAULT_SETTINGS: ChatSettings = getDefaultSettings(translateKeyFallback);
