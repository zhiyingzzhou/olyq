/**
 * 说明：`protocol` AI 能力模块。
 *
 * 职责：
 * - 承载 `protocol` 相关的当前文件实现与模块边界；
 * - 对外暴露 `isAnthropicLikeModelId`、`isGeminiLikeModelId`、`inferTransportProtocol` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 模型协议推断层。
 *
 * 为什么存在：
 * - 用户要求 `transportProtocol` 独立于主类推断，不再让协议层抢占模型类型；
 * - 这里专门负责“根据当前 provider、已知 kind、显式协议提示”推导最终路由协议；
 * - registry、runtime、health check、模型管理弹窗都会共用这一层，避免再次各写一套协议判断。
 */

import type { ModelKind, TransportProtocol } from '../types'
import type { ModelTypeDescriptor } from './types'
import { getNormalizedModelIdentity, normalizeProviderToken } from './shared/normalize'

const ANTHROPIC_MODEL_FAMILY_REGEX = /\bclaude(?:[-/]|$)/i
const GEMINI_MODEL_FAMILY_REGEX = /\b(?:gemini|learnlm)(?:[-/]|$)/i
const OPENAI_RESPONSES_DEFAULT_MODEL_REGEX = /\b(?:gpt-5(?:\.\d+)?(?:-(?:mini|nano|pro))?|o[134](?:-mini)?)(?:-[\w.]+)?\b/i

/**
 * 为 OpenAI-like Provider 推导默认协议。
 *
 * 说明：
 * - 这类 Provider 往往共用一套兼容 API，但 embedding/rerank/image 会落在不同端点；
 * - 因此这里先按已知主类做最小映射，未知时再退回普通 chat 协议。
 */
function inferOpenAiLikeTransport(kind?: ModelKind): TransportProtocol {
  if (kind === 'embedding') return 'embedding-api'
  if (kind === 'rerank') return 'rerank-api'
  if (kind === 'image-generation') return 'image-api'
  if (kind === 'video-generation') return 'video-api'
  return 'openai-chat'
}

/** 判断当前 rawModelId 是否属于 Anthropic 家族。 */
export function isAnthropicLikeModelId(rawModelId: string): boolean {
  return ANTHROPIC_MODEL_FAMILY_REGEX.test(getNormalizedModelIdentity({ rawModelId }))
}

/** 判断当前 rawModelId 是否属于 Gemini 家族。 */
export function isGeminiLikeModelId(rawModelId: string): boolean {
  return GEMINI_MODEL_FAMILY_REGEX.test(getNormalizedModelIdentity({ rawModelId }))
}

/**
 * 推断最终传输协议。
 *
 * 规则说明：
 * 1. connector/目录若已经明确给出协议，直接保留；
 * 2. 单协议 provider 走固定映射；
 * 3. 多协议 provider（`new-api` / `gateway`）优先看当前已识别主类，再看稳定模型族；
 * 4. 如果仍无法判断，返回 `unknown`，由 UI 做只读告警。
 */
export function inferTransportProtocol(
  descriptor: ModelTypeDescriptor,
  preferredKind?: ModelKind,
): TransportProtocol {
  const explicit = descriptor.transportProtocol
  if (explicit && explicit !== 'unknown') return explicit
  if (descriptor.providerCatalogTypeHint) return 'unknown'

  const providerType = normalizeProviderToken(descriptor.providerType)

  switch (providerType) {
    case 'openai-response':
    case 'openairesponse':
      return 'openai-responses'
    case 'anthropic':
    case 'vertex-anthropic':
    case 'vertexanthropic':
      return 'anthropic-messages'
    case 'gemini':
    case 'vertexai':
      return 'gemini-generate-content'
    case 'cohere':
      if (preferredKind === 'embedding') return 'embedding-api'
      if (preferredKind === 'rerank') return 'rerank-api'
      return 'cohere-chat'
    case 'aws-bedrock':
    case 'awsbedrock':
      return 'bedrock-converse'
    case 'gateway':
    case 'new-api':
    case 'newapi': {
      if (preferredKind === 'embedding') return 'embedding-api'
      if (preferredKind === 'rerank') return 'rerank-api'
      if (preferredKind === 'image-generation') return 'image-api'
      if (preferredKind === 'video-generation') return 'video-api'
      if (isAnthropicLikeModelId(descriptor.rawModelId)) return 'anthropic-messages'
      if (isGeminiLikeModelId(descriptor.rawModelId)) return 'gemini-generate-content'
      return 'unknown'
    }
    case 'openai':
      if (
        normalizeProviderToken(descriptor.providerId) === 'openai'
        && preferredKind !== 'embedding'
        && preferredKind !== 'rerank'
        && preferredKind !== 'image-generation'
        && preferredKind !== 'video-generation'
        && OPENAI_RESPONSES_DEFAULT_MODEL_REGEX.test(getNormalizedModelIdentity(descriptor))
      ) {
        return 'openai-responses'
      }
      return inferOpenAiLikeTransport(preferredKind)
    case 'azure-openai':
    case 'azureopenai':
    case 'dashscope':
    case 'siliconflow':
    case 'deepseek':
    case 'groq':
    case 'mistral':
    case 'xai':
    case 'ollama':
    default:
      return inferOpenAiLikeTransport(preferredKind)
  }
}
