/**
 * 说明：`provider-network-targets` AI 能力模块。
 *
 * 职责：
 * - 承载 `provider-network-targets` 相关的当前文件实现与模块边界；
 * - 对外暴露 `isLocalNetworkBaseUrl`、`resolveProviderNetworkBaseUrl`、`resolveProviderNetworkBaseUrlForModel` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * Provider 网络目标 match pattern 推导。
 *
 * 目的：
 * - 统一 UI 与 Service Worker 对“真实网络请求会访问哪些 origins”的判断；
 * - 避免某些 Provider（如 Vertex/Bedrock）不使用 config.apiHost，导致网络目标判断与真实请求 host 不一致。
 */

import type { ProviderConfig } from './types'
import type { HostMatchPattern } from '@/lib/extension/host-match-patterns'
import { toHostMatchPatternFromApiHost } from '@/lib/extension/host-match-patterns'
import { resolveAnthropicBaseURL, resolveNewApiTransportProtocol } from './providers/provider-utils-common'

/** 判断某个 API Base URL 是否指向本地运行时。 */
export function isLocalNetworkBaseUrl(apiHost?: string): boolean {
  const raw = String(apiHost || '').trim()
  if (!raw) return false
  try {
    const url = new URL(raw)
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
  } catch {
    return false
  }
}

/**
 * 推导该 Provider 实际会访问的网络 base URL（只用于网络目标展示与诊断）。
 *
 * 注意：
 * - 返回值只需可解析为 URL，并且能映射到正确的 origin；
 * - 不要求包含完整路径或版本段。
 */
export function resolveProviderNetworkBaseUrl(config: ProviderConfig): string | null {
  return resolveProviderNetworkBaseUrlForModel(config)
}

/**
 * 按 Provider 类型与可选模型维度，推导真实网络请求会落到的 base URL。
 *
 * 说明：
 * - 用途仅限网络目标展示和诊断，目标是得到正确 origin，而不是拼出最终接口路径；
 * - `new-api` 这类网关会根据模型协议切换到不同上游，因此这里允许结合 `modelId` 做更细粒度判断；
 * - 返回 `null` 表示当前配置不足以判断目标 host，此时上层不应生成网络目标项。
 */
export function resolveProviderNetworkBaseUrlForModel(config: ProviderConfig, modelId?: string): string | null {
  if (!config || typeof config !== 'object') return null
  const explicitApiHost = String(config.apiHost || '').trim()
  const hasExplicitApiHost = Boolean(explicitApiHost && !explicitApiHost.includes('{') && !explicitApiHost.includes('}'))

  // NewAPI：可能按模型 transportProtocol 分流到不同 base URL（例如 Anthropic）。
  if (config.type === 'new-api') {
    if (modelId) {
      const transportProtocol = resolveNewApiTransportProtocol(config, modelId)
      if (transportProtocol === 'anthropic-messages') {
        const alt = String(config.anthropicApiHost || '').trim()
        if (alt) return resolveAnthropicBaseURL(alt) ?? alt
      }
    }
    const apiHost = String(config.apiHost || '').trim()
    return apiHost || null
  }

  if (config.type === 'anthropic') {
    return resolveAnthropicBaseURL(explicitApiHost) ?? null
  }

  // Vertex：Service Account 基于 location 拼接 aiplatform host；express mode API Key 使用全局 aiplatform host。
  if (config.type === 'vertexai' || config.type === 'vertex-anthropic') {
    if (hasExplicitApiHost) return explicitApiHost
    if (config.type === 'vertexai' && config.vertex?.authType === 'apiKey') {
      return 'https://aiplatform.googleapis.com'
    }
    const loc = String(config.vertex?.location || '').trim()
    if (!loc) return null
    return `https://${loc}-aiplatform.googleapis.com`
  }

  // Bedrock：基于 region 访问 bedrock-runtime host；config.apiHost 仅作为可选 baseURL override
  if (config.type === 'aws-bedrock') {
    if (hasExplicitApiHost) return explicitApiHost
    const region = String(config.bedrock?.region || '').trim()
    if (!region) return null
    return `https://bedrock-runtime.${region}.amazonaws.com`
  }

  return explicitApiHost || null
}

/**
 * 计算某个 Provider 发起请求时会访问的 host match patterns。
 *
 * 说明：
 * - 当前实现只会返回 0 或 1 个模式，因为每次只围绕一个最终 base URL 推导；
 * - 返回空数组表示暂时无法判定网络目标，调用方只应把它当作配置诊断线索。
 */
export function getProviderNetworkHostMatchPatterns(config: ProviderConfig, modelId?: string): HostMatchPattern[] {
  const base = resolveProviderNetworkBaseUrlForModel(config, modelId)
  if (!base) return []
  const pat = toHostMatchPatternFromApiHost(base)
  return pat ? [pat] : []
}
