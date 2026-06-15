/**
 * 说明：`vision` AI 能力模块。
 *
 * 职责：
 * - 承载 `vision` 相关的当前文件实现与模块边界；
 * - 对外暴露 `isTextToImageModel`、`isImageEnhancementModel`、`isGenerateImageModel` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * Vision / Image Generation 规则。
 *
 * 规则来源：
 * - 官方模型文档
 * - 本仓库内部模型类型约定
 *
 * 维护约束：
 * - `video-generation` 与 `audio-chat` 不允许只靠名称猜，本文件不会产出这两种高风险 kind；
 * - 本文件负责的是扩展端 fallback：识别专用生图、可对话生图、视觉输入等能力；
 * - 真正的 video/audio 明确信号必须来自官方目录字段（例如 OpenRouter modalities、SiliconFlow `type`/后续显式能力字段）。
 */

import type { ModelTypeDescriptor } from './types'
import { getNormalizedModelIdentity, getNormalizedModelName } from './utils'
import { isEmbeddingModel, isRerankModel } from './embedding'

const VISION_ALLOWED_MODELS = [
  'llava',
  'moondream',
  'minicpm',
  'gemini-1\\.5',
  'gemini-2\\.0',
  'gemini-2\\.5',
  'gemini-3(?:\\.\\d)?-(?:flash|pro)(?:-preview)?',
  'gemini-(flash|pro|flash-lite)-latest',
  'gemini-exp',
  'claude-3',
  'claude-haiku-4',
  'claude-sonnet-4',
  'claude-opus-4',
  'vision',
  'glm-4(?:\\.\\d+)?v(?:-[\\w-]+)?',
  'qwen-vl',
  'qwen2-vl',
  'qwen2.5-vl',
  'qwen3-vl',
  'qwen3\\.5(?:-[\\w-]+)?',
  'qwen2.5-omni',
  'qwen3-omni(?:-[\\w-]+)?',
  'qvq',
  'internvl2',
  'grok-vision-beta',
  'grok-4(?:-[\\w-]+)?',
  'pixtral',
  'gpt-4(?:-[\\w-]+)',
  'gpt-4.1(?:-[\\w-]+)?',
  'gpt-4o(?:-[\\w-]+)?',
  'gpt-4.5(?:-[\\w-]+)',
  'gpt-5(?:-[\\w-]+)?',
  'chatgpt-4o(?:-[\\w-]+)?',
  'o1(?:-[\\w-]+)?',
  'o3(?:-[\\w-]+)?',
  'o4(?:-[\\w-]+)?',
  'deepseek-vl(?:[\\w-]+)?',
  'deepseek-ocr(?:-[\\w-]+)?',
  'got-ocr(?:-[\\w-]+)?',
  'mineru(?:-[\\w-]+)?',
  'nougat(?:-[\\w-]+)?',
  'docling(?:-[\\w-]+)?',
  'document(?:-[\\w-]+)?(?:parser|parsing|understanding|understand|ocr)(?:-[\\w-]+)?',
  'kimi-k2.5',
  'kimi-latest',
  'gemma-3(?:-[\\w-]+)',
  'doubao-seed-1[.-][68](?:-[\\w-]+)?',
  'doubao-seed-2[.-]0(?:-[\\w-]+)?',
  'doubao-seed-code(?:-[\\w-]+)?',
  'kimi-thinking-preview',
  'gemma3(?:[-:\\w]+)?',
  'kimi-vl-a3b-thinking(?:-[\\w-]+)?',
  'llama-guard-4(?:-[\\w-]+)?',
  'llama-4(?:-[\\w-]+)?',
  'step-1o(?:.*vision)?',
  'step-1v(?:-[\\w-]+)?',
  'qwen-omni(?:-[\\w-]+)?',
  'mistral-large-(2512|latest)',
  'mistral-medium-(2508|latest)',
  'mistral-small-(2506|latest)',
  'mimo-v2-omni(?:-[\\w-]+)?',
]

const VISION_EXCLUDED_MODELS = [
  'gpt-4-\\d+-preview',
  'gpt-4-turbo-preview',
  'gpt-4-32k',
  'gpt-4-\\d+',
  'o1-mini',
  'o3-mini',
  'o1-preview',
  'aidc-ai/marco-o1',
]

/**
 * 复杂视觉正则说明：
 * - 正向部分覆盖当前内部规则确认过的视觉模型家族；
 * - 反向部分显式排除已知误判，例如旧版 GPT-4 preview、o1-mini、Marco-o1；
 * - 我们刻意不把“所有带 vision/image 的字符串”都算进来，避免把图片编辑模型与通用聊天模型混成一类。
 */
const VISION_REGEX = new RegExp(
  `\\b(?!(?:${VISION_EXCLUDED_MODELS.join('|')})\\b)(${VISION_ALLOWED_MODELS.join('|')})\\b`,
  'i',
)

/** 只会生成图片、不会进行文本对话的专用生图模型。 */
const DEDICATED_IMAGE_MODELS = [
  'dall-e(?:-[\\w-]+)?',
  'gpt-image(?:-[\\w-]+)?',
  'grok-2-image(?:-[\\w-]+)?',
  'imagen(?:-[\\w-]+)?',
  'flux(?:-[\\w-]+)?',
  'stable-?diffusion(?:-[\\w-]+)?',
  'stabilityai(?:-[\\w-]+)?',
  'sd-[\\w-]+',
  'sdxl(?:-[\\w-]+)?',
  'cogview(?:-[\\w-]+)?',
  'qwen-image(?:-[\\w-]+)?',
  'janus(?:-[\\w-]+)?',
  'midjourney(?:-[\\w-]+)?',
  'mj-[\\w-]+',
  'z-image(?:-[\\w-]+)?',
  'longcat-image(?:-[\\w-]+)?',
  'hunyuanimage(?:-[\\w-]+)?',
  'seedream(?:-[\\w-]+)?',
  'kandinsky(?:-[\\w-]+)?',
]

/** 图片增强/编辑模型。 */
const IMAGE_ENHANCEMENT_MODELS = [
  'grok-2-image(?:-[\\w-]+)?',
  'qwen-image-edit',
  'gpt-image-1',
  'gemini-2.5-flash-image(?:-[\\w-]+)?',
  'gemini-2.0-flash-preview-image-generation',
  'gemini-3(?:\\.\\d+)?-pro-image(?:-[\\w-]+)?',
]

/** 支持对话式 image output 的模型。 */
const GENERATE_IMAGE_MODELS = [
  'gemini-2.0-flash-exp(?:-[\\w-]+)?',
  'gemini-2.5-flash-image(?:-[\\w-]+)?',
  'gemini-2.0-flash-preview-image-generation',
  'gemini-3(?:\\.\\d+)?-pro-image(?:-[\\w-]+)?',
  ...DEDICATED_IMAGE_MODELS,
]

const DEDICATED_IMAGE_MODEL_REGEX = new RegExp(DEDICATED_IMAGE_MODELS.join('|'), 'i')
const IMAGE_ENHANCEMENT_MODEL_REGEX = new RegExp(IMAGE_ENHANCEMENT_MODELS.join('|'), 'i')
const GENERATE_IMAGE_MODEL_REGEX = new RegExp(GENERATE_IMAGE_MODELS.join('|'), 'i')

/** 是否为专用生图模型。 */
export function isTextToImageModel(descriptor: ModelTypeDescriptor): boolean {
  if (isEmbeddingModel(descriptor) || isRerankModel(descriptor)) return false
  return DEDICATED_IMAGE_MODEL_REGEX.test(getNormalizedModelIdentity(descriptor))
}

/** 是否为图片增强/编辑模型。 */
export function isImageEnhancementModel(descriptor: ModelTypeDescriptor): boolean {
  return IMAGE_ENHANCEMENT_MODEL_REGEX.test(getNormalizedModelIdentity(descriptor))
}

/** 是否支持对话式图片生成。 */
export function isGenerateImageModel(descriptor: ModelTypeDescriptor): boolean {
  if (isEmbeddingModel(descriptor) || isRerankModel(descriptor)) return false
  return GENERATE_IMAGE_MODEL_REGEX.test(getNormalizedModelIdentity(descriptor))
}

/** 是否支持视觉输入。 */
export function isVisionModel(descriptor: ModelTypeDescriptor): boolean {
  if (isEmbeddingModel(descriptor) || isRerankModel(descriptor)) return false

  const providerType = String(descriptor.providerType || '').trim().toLowerCase()
  const modelId = getNormalizedModelIdentity(descriptor)
  const modelName = getNormalizedModelName(descriptor)

  /**
   * Doubao 特例：
   * - 目录/聚合平台里经常出现“ID 不标准、名称更像真实模型家族”的情况；
   * - 因此要在 name 与 id 两处各跑一次视觉规则。
   */
  if (providerType === 'doubao' || modelId.includes('doubao')) {
    return VISION_REGEX.test(modelName || modelId) || VISION_REGEX.test(modelId)
  }

  return VISION_REGEX.test(modelId) || IMAGE_ENHANCEMENT_MODEL_REGEX.test(modelId)
}
