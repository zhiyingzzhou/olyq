/**
 * 说明：`model-reference-reconciler` AI 能力模块。
 *
 * 职责：
 * - 承载 `model-reference-reconciler` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ModelReferenceReconcileSummary`、`reconcileModelReferences` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useAssistantStore } from '@/hooks/useAssistantStore'
import { useChatSettingsStore } from '@/hooks/useChatSettingsStore'
import { usePaintStore } from '@/hooks/usePaintStore'
import { loadMemoryConfig, saveMemoryConfig } from '@/lib/memory'

import { defaultChatModelFilter, defaultConversationModelFilter, isSpeechModelLike, isTranscriptionModelLike } from './model-filters'
import { resolveModelMetaFromRegistry, type ModelRegistryState, type ModelKind } from './model-registry'
import type { ProviderConfig } from './types'

/** 参与模型引用修复时使用的可用模型快照条目。 */
type ReconcileModelEntry = {
  /** 完整模型 ID（providerId/modelId）。 */
  readonly id: string
  /** 模型主类型。 */
  readonly kind: ModelKind
}

/** 模型引用修复摘要。 */
export interface ModelReferenceReconcileSummary {
  /** 被修复的聊天默认设置数量。 */
  chatSettingsPatched: number
  /** 被修复的话题数量。 */
  topicsPatched: number
  /** 被修复的 Memory 配置字段数量。 */
  memoryPatched: number
  /** 被修复的 Paint 记录数量。 */
  paintingsPatched: number
}

/** 创建一份全 0 的修复摘要，作为每轮 reconcile 的计数器初始值。 */
function createEmptySummary(): ModelReferenceReconcileSummary {
  return {
    chatSettingsPatched: 0,
    topicsPatched: 0,
    memoryPatched: 0,
    paintingsPatched: 0,
  }
}

/**
 * 从当前启用的 provider 配置和 registry 中构造“可用模型清单”。
 *
 * 说明：
 * - 这里只保留 enabled provider 及其有效模型；
 * - 每个 `providerId/modelId` 只保留一条，并立即附带解析出的主类型，供后续筛选复用。
 */
function buildAvailableModels(
  providers: ReadonlyArray<ProviderConfig>,
  registry: ModelRegistryState,
): ReadonlyArray<ReconcileModelEntry> {
  const out: ReconcileModelEntry[] = []
  const seen = new Set<string>()

  for (const provider of providers) {
    if (!provider.enabled) continue
    for (const model of provider.models || []) {
      const modelId = String(model?.id || '').trim()
      if (!modelId) continue
      const fullId = `${provider.id}/${modelId}`
      if (seen.has(fullId)) continue
      seen.add(fullId)
      const resolved = resolveModelMetaFromRegistry(registry, {
        providerType: provider.type,
        providerId: provider.id,
        apiHost: provider.apiHost,
        rawModelId: modelId,
        rawModelName: model.name || modelId,
      })
      out.push({
        id: fullId,
        kind: resolved.kind,
      })
    }
  }

  return out
}

/** 按给定谓词把可用模型条目投影成便于快速判断的模型 ID 集合。 */
function toModelIdSet(list: ReadonlyArray<ReconcileModelEntry>, predicate: (entry: ReconcileModelEntry) => boolean): ReadonlySet<string> {
  return new Set(list.filter(predicate).map((entry) => entry.id))
}

/**
 * 在 provider / registry 变化后，统一修复所有持久化模型引用。
 *
 * 修复范围：
 * - ChatSettings：`defaultModel` / `defaultImageModel` / `defaultTranscriptionModel` / `defaultSpeechModel` / `topicNamingModel` / `translateModel`
 * - Topics：真实话题实例里的 `model`
 * - Memory：`embeddingModel` / `llmModel` / `rerankModel`
 * - Paint：绘画记录里的 `model`
 *
 * 说明：
 * - 只依赖最新的 enabled providers + model registry，不读取旧规则；
 * - 若某个引用失效，会回退到当前首个同类可用模型，或在无可用候选时清空可选字段；
 * - 普通 Topic 直接保存每话题模型覆盖；
 * - “普通对话”与“严格语言模型”槽位使用不同校验集合：
 *   - defaultModel / topicNamingModel / translateModel / Memory LLM：仅允许严格语言模型
 *   - defaultImageModel / Paint：仅允许 image-generation
 *   - 普通 Topic：保持当前“普通对话模型（含 image-generation）”语义
 */
export function reconcileModelReferences(input: {
  /** 当前启用/禁用状态下的 provider 配置快照。 */
  readonly providers: ReadonlyArray<ProviderConfig>
  /** 当前运行时唯一真源 registry。 */
  readonly registry: ModelRegistryState
}): ModelReferenceReconcileSummary {
  if (typeof window === 'undefined') return createEmptySummary()

  const summary = createEmptySummary()
  const availableModels = buildAvailableModels(input.providers, input.registry)
  const conversationModelIds = toModelIdSet(availableModels, (entry) => defaultConversationModelFilter({ id: entry.id, providerId: entry.id.split('/')[0] || '', kind: entry.kind, features: [] }))
  const chatModelIds = toModelIdSet(availableModels, (entry) => defaultChatModelFilter({ id: entry.id, providerId: entry.id.split('/')[0] || '', kind: entry.kind, features: [] }))
  const embeddingModelIds = toModelIdSet(availableModels, (entry) => entry.kind === 'embedding')
  const rerankModelIds = toModelIdSet(availableModels, (entry) => entry.kind === 'rerank')
  const imageModelIds = toModelIdSet(availableModels, (entry) => entry.kind === 'image-generation')
  const transcriptionModelIds = toModelIdSet(availableModels, (entry) => isTranscriptionModelLike({ id: entry.id, providerId: entry.id.split('/')[0] || '', kind: entry.kind, features: [] }))
  const speechModelIds = toModelIdSet(availableModels, (entry) => isSpeechModelLike({ id: entry.id, providerId: entry.id.split('/')[0] || '', kind: entry.kind, features: [] }))

  const fallbackConversationModelId = availableModels.find((entry) => conversationModelIds.has(entry.id))?.id
  const fallbackChatModelId = availableModels.find((entry) => chatModelIds.has(entry.id))?.id
  const fallbackImageModelId = availableModels.find((entry) => imageModelIds.has(entry.id))?.id
  const fallbackTranscriptionModelId = availableModels.find((entry) => transcriptionModelIds.has(entry.id))?.id
  const fallbackSpeechModelId = availableModels.find((entry) => speechModelIds.has(entry.id))?.id

  const chatSettingsStore = useChatSettingsStore.getState()
  const currentSettings = chatSettingsStore.settings
  const nextSettings = { ...currentSettings }
  let settingsChanged = false

  if (!chatModelIds.has(currentSettings.defaultModel) && fallbackChatModelId && currentSettings.defaultModel !== fallbackChatModelId) {
    nextSettings.defaultModel = fallbackChatModelId
    settingsChanged = true
    summary.chatSettingsPatched += 1
  }

  if (currentSettings.defaultImageModel && !imageModelIds.has(currentSettings.defaultImageModel)) {
    const nextImageModel = fallbackImageModelId
    if (currentSettings.defaultImageModel !== nextImageModel) {
      nextSettings.defaultImageModel = nextImageModel
      settingsChanged = true
      summary.chatSettingsPatched += 1
    }
  }

  if (currentSettings.defaultTranscriptionModel && !transcriptionModelIds.has(currentSettings.defaultTranscriptionModel)) {
    const nextTranscriptionModel = fallbackTranscriptionModelId
    if (currentSettings.defaultTranscriptionModel !== nextTranscriptionModel) {
      nextSettings.defaultTranscriptionModel = nextTranscriptionModel
      settingsChanged = true
      summary.chatSettingsPatched += 1
    }
  }

  if (currentSettings.defaultSpeechModel && !speechModelIds.has(currentSettings.defaultSpeechModel)) {
    const nextSpeechModel = fallbackSpeechModelId
    if (currentSettings.defaultSpeechModel !== nextSpeechModel) {
      nextSettings.defaultSpeechModel = nextSpeechModel
      settingsChanged = true
      summary.chatSettingsPatched += 1
    }
  }

  if (currentSettings.topicNamingModel && !chatModelIds.has(currentSettings.topicNamingModel)) {
    nextSettings.topicNamingModel = undefined
    settingsChanged = true
    summary.chatSettingsPatched += 1
  }

  if (currentSettings.translateModel && !chatModelIds.has(currentSettings.translateModel)) {
    nextSettings.translateModel = undefined
    settingsChanged = true
    summary.chatSettingsPatched += 1
  }

  if (settingsChanged) {
    chatSettingsStore.setSettings(nextSettings)
  }

  const assistantStore = useAssistantStore.getState()
  for (const assistant of assistantStore.assistants) {
    for (const topic of assistant.topics) {
      const currentModel = String(topic.model || '').trim()
      if (!currentModel || conversationModelIds.has(currentModel)) continue
      const nextModel = fallbackConversationModelId || undefined
      if (!nextModel && topic.model === undefined) continue
      if (nextModel === currentModel) continue
      assistantStore.updateTopicMeta(topic.id, { model: nextModel })
      summary.topicsPatched += 1
    }
  }

  const memoryConfig = loadMemoryConfig()
  let memoryChanged = false
  const nextMemoryConfig = { ...memoryConfig }

  if (memoryConfig.embeddingModel && !embeddingModelIds.has(memoryConfig.embeddingModel)) {
    nextMemoryConfig.embeddingModel = undefined
    memoryChanged = true
    summary.memoryPatched += 1
  }
  if (memoryConfig.llmModel && !chatModelIds.has(memoryConfig.llmModel)) {
    nextMemoryConfig.llmModel = undefined
    memoryChanged = true
    summary.memoryPatched += 1
  }
  if (memoryConfig.rerankModel && !rerankModelIds.has(memoryConfig.rerankModel)) {
    nextMemoryConfig.rerankModel = undefined
    memoryChanged = true
    summary.memoryPatched += 1
  }

  if (memoryChanged) {
    saveMemoryConfig(nextMemoryConfig)
  }

  const paintStore = usePaintStore.getState()
  for (const painting of paintStore.paintings) {
    const currentModel = String(painting.model || '').trim()
    if (!currentModel || imageModelIds.has(currentModel)) continue
    const nextModel = fallbackImageModelId ?? ''
    if (nextModel === currentModel) continue
    paintStore.patchPainting(painting.id, { model: nextModel })
    summary.paintingsPatched += 1
  }

  return summary
}
