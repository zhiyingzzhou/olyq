/**
 * 说明：`provider-host-patterns` AI 能力模块。
 *
 * 职责：
 * - 承载 `provider-host-patterns` 相关的当前文件实现与模块边界；
 * - 对外暴露 `resolveProviderHostPatternsForModel` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { applyUserModelTypes } from './model-type-system'
import { resolveModelMeta } from './model-registry/resolver'
import { getProviderNetworkHostMatchPatterns } from './provider-network-targets'
import { applyResolvedModelMetaToProviderConfig } from './provider-runtime-config'
import type { ProviderConfig } from './types'
import type { HostMatchPattern } from '@/lib/extension/host-match-patterns'

/**
 * 基于 registry 解析结果，推导某个模型真实网络目标的 host match patterns。
 *
 * 说明：
 * - 返回值只用于网络目标展示与诊断，不参与模型实例创建；
 * - 独立于 provider-runtime，避免网络目标判断链路引入 AI SDK provider 工厂。
 */
export async function resolveProviderHostPatternsForModel(
  config: ProviderConfig,
  providerId: string,
  modelId: string,
  rawModelName?: string,
): Promise<ReadonlyArray<HostMatchPattern>> {
  const normalizedProviderId = String(providerId || '').trim()
  const normalizedModelId = String(modelId || '').trim()
  if (!normalizedProviderId || !normalizedModelId) return []

  const configuredModel = config.models?.find((item) => String(item?.id || '').trim() === normalizedModelId)
  const systemResolvedModelMeta = await resolveModelMeta({
    providerType: config.type,
    providerId: normalizedProviderId,
    apiHost: config.apiHost,
    rawModelId: normalizedModelId,
    rawModelName: rawModelName || configuredModel?.name || normalizedModelId,
  })
  const resolvedModelMeta = applyUserModelTypes(
    systemResolvedModelMeta,
    configuredModel?.manualModelTypes,
  )
  const runtimeConfig = applyResolvedModelMetaToProviderConfig(config, normalizedModelId, resolvedModelMeta)
  return getProviderNetworkHostMatchPatterns(runtimeConfig, normalizedModelId)
}
