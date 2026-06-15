/**
 * 说明：`capability-label` AI 能力模块。
 *
 * 职责：
 * - 承载 `capability-label` 相关的当前文件实现与模块边界；
 * - 对外暴露 `capabilityLabel` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 系统能力/模型类型文案工具（共享）
 *
 * 供 ModelPickerDialog、ModelManagerPanel（模型列表 + 编辑弹窗）统一调用，
 * 避免重复的 i18n key 查找逻辑。
 */

import { toPresentationToken } from './model-type-system'

/**
 * 给定系统能力或模型类型 key（如 "vision"），返回 i18n 翻译后的展示文案（如 "视觉"）。
 * 若无对应翻译则回退到原始 key。
 */
export function capabilityLabel(key: string, t: (k: string) => string): string {
  const normalizedKey = String(key || '').trim().toLowerCase()

  /**
   * 用户层模型类型优先走“8 类模型类型”文案。
   *
   * 说明：
  * - 用户层 `text_generation / image_generation / vision / web_search / function_calling / reasoning / embedding / rerank`
  *   不应该再回退成系统层 token 文案；
  * - 否则会出现 `vision`、`web_search` 直接显示 raw value，或者 `web_search` 被错误翻成“原生联网”；
   * - 因此这里先尝试命中模型管理弹窗中那套稳定的 8 类模型类型文案。
   */
  const userModelTypeTk = `modelManagerPanel.modelDialog.modelTypes.${normalizedKey}`
  const userModelTypeValue = t(userModelTypeTk)
  if (userModelTypeValue !== userModelTypeTk) return userModelTypeValue

  const presentationToken = toPresentationToken(key)
  const registryTk = `modelRegistry.capabilities.${presentationToken}`
  const registryValue = t(registryTk)
  if (registryValue !== registryTk) return registryValue

  const fallbackMap: Record<string, string> = {
    chat: 'Chat',
    'multimodal-chat': 'Multimodal',
    'audio-chat': 'Audio Chat',
    transcription: 'Transcription',
    'speech-generation': 'Speech Generation',
    moderation: 'Moderation',
    'image-generation': 'Image Gen',
    'video-generation': 'Video Gen',
    text_generation: 'Text Generation',
    image_generation: 'Image Generation',
    vision: 'Vision',
    reasoning: 'Reasoning',
    function_calling: 'Tool Calling',
    web_search: 'Web Search',
    embedding: 'Embedding',
    rerank: 'Rerank',
    'audio-model': 'Audio',
    unknown: 'Unknown',
    'vision-input': 'Vision',
    'audio-input': 'Audio In',
    'file-input': 'File In',
    'tool-call': 'Tools',
    'structured-output': 'Structured',
    'native-web-search': 'Web',
    'image-output': 'Image Out',
    'audio-output': 'Audio Out',
  }
  return fallbackMap[presentationToken] ?? key
}
