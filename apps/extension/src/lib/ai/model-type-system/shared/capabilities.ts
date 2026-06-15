/**
 * 说明：`capabilities` AI 能力模块。
 *
 * 职责：
 * - 承载 `capabilities` 相关的当前文件实现与模块边界；
 * - 对外暴露 `CAPABILITY_TO_FEATURE`、`FEATURE_TO_CAPABILITY` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 模型能力键与内部字段映射工具。
 *
 * 为什么存在：
 * - 扩展端内部仍然需要把“用户可理解的模型类型/系统能力”映射到 `features` 与模态；
 * - 统一放在这里可以避免 UI、resolver、运行时各自维护一套映射。
 */

import type { ModelFeature } from '../../types'
import type { ModelCapabilityKey } from '../types'

/**
 * 能力键 -\> 内部 feature 映射。
 *
 * 约定：
 * - 值为 `null` 表示该能力更像“模型主类”或“任务入口”，并不对应单独的 `features` 标记；
 * - 值为具体 feature 时，说明它可以直接写入模型注册表的 `features` 字段。
 */
export const CAPABILITY_TO_FEATURE: Record<ModelCapabilityKey, ModelFeature | null> = {
  // `text_generation` 表示聊天主类入口，本身不是独立 feature，因此映射为 null。
  text_generation: null,
  // `image_generation` 表示图片生成主任务入口，真正的输出能力仍由 `image-output` 表达。
  image_generation: null,
  vision: 'vision-input',
  reasoning: 'reasoning',
  function_calling: 'tool-call',
  web_search: 'native-web-search',
  embedding: null,
  rerank: null,
  audio_model: 'audio-model',
  transcription: 'transcription',
  moderation: 'moderation',
  structured_output: 'structured-output',
  image_output: 'image-output',
  audio_input: 'audio-input',
  audio_output: 'audio-output',
  file_input: 'file-input',
}

/**
 * feature -\> 能力键映射。
 *
 * 这份映射主要用于把内部统一 feature 反向翻译回用户侧或规则系统可识别的能力键。
 */
export const FEATURE_TO_CAPABILITY: Partial<Record<ModelFeature, ModelCapabilityKey>> = {
  'vision-input': 'vision',
  reasoning: 'reasoning',
  'tool-call': 'function_calling',
  'native-web-search': 'web_search',
  'audio-model': 'audio_model',
  transcription: 'transcription',
  moderation: 'moderation',
  'structured-output': 'structured_output',
  'image-output': 'image_output',
  'audio-input': 'audio_input',
  'audio-output': 'audio_output',
  'file-input': 'file_input',
}
