/**
 * 说明：`useModelOptions` Hook 模块。
 *
 * 职责：
 * - 承载 `useModelOptions` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ModelOption`、`UseModelOptionsResult`、`buildModelOptions` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useMemo, useSyncExternalStore } from 'react'
import type { ProviderConfig } from '@/lib/ai/types'
import { loadProvidersView } from '@/lib/ai/provider-storage'
import { DEFAULT_PROVIDERS } from '@/lib/ai/config/provider-defaults'
import { shouldUsePreviewFallbackProviders } from '@/lib/ai/runtime-environment'
import { MODEL_REGISTRY_STORAGE_KEY, PROVIDERS_STORAGE_KEY } from '@/lib/ai/storage-keys'
import { reconcileModelReferences } from '@/lib/ai/model-reference-reconciler'
import { deriveVersionSortKey, sortModelsByVersionSemantics } from '@/lib/ai/model-version-sort'
import { applyUserModelTypes, derivePrimaryKindKey, type PrimaryKindKey } from '@/lib/ai/model-type-system'
import { refreshModelRegistryInBackground } from '@/lib/ai/model-registry/background-refresh'
import { loadModelRegistryFast } from '@/lib/ai/model-registry/storage-lite'
import {
  createEmptyModelRegistry,
  hasModelRegistryEntries,
  MODEL_REGISTRY_UPDATED_EVENT,
  resolveModelMetaFromRegistry,
  type ModelFeature,
  type ModelKind,
  type ModelModality,
  type ModelRegistryState,
  type ModelScope,
  type ResolveConfidence,
  type TransportProtocol,
} from '@/lib/ai/model-registry'
import { getStorageAdapter } from '@/lib/storage/storage-adapter'
import { logger } from '@/lib/logger'

/**
 * useModelOptions：在 UI 中提供“可选模型列表”的统一数据源。
 *
 * 数据来源：
 * - 扩展环境：从 chrome.storage.local（`PROVIDERS_STORAGE_KEY`）读取 Provider 配置，并监听变更；
 * - Web 预览/非扩展环境：退化为 `DEFAULT_PROVIDERS`（仅用于 UI 展示，不保证真实可用）。
 *
 * 产出：
 * - `providers`：已加载的 ProviderConfig 列表
 * - `models`/`modelMap`：拍平成 UI 选项后的模型列表/映射
 * - `getModelLabel`/`getModelShortLabel`：展示用文案
 */

const EMPTY_PROVIDERS: ProviderConfig[] = []

/** 创建 `providers` 的初始值。 */
function createInitialProvidersState(): ProviderConfig[] {
  return shouldUsePreviewFallbackProviders()
    ? structuredClone(DEFAULT_PROVIDERS)
    : []
}

/** 创建 `models` 的初始值。 */
function createInitialModelsState(): ModelOption[] {
  const providers = createInitialProvidersState()
  return buildModelOptions(providers, createEmptyModelRegistry())
}

/**
 * 尽力而为地拿到一份可用模型注册表。
 *
 * 回退顺序：
 * 1. 先读取本地 storage 中已存在的 registry 快照；
 * 2. 若 storage 里暂无可用数据，则按当前 provider 列表临时构建 preview registry；
 * 3. 同时在后台异步触发真源刷新，等 registry 落盘后通过事件驱动二次 reload。
 *
 * 这样模型选择器/快捷面板不会被首轮 registry 同步阻塞数秒。
 */
async function loadBestEffortRegistry(
  providers: ReadonlyArray<ProviderConfig>,
): Promise<ModelRegistryState> {
  void refreshModelRegistryInBackground('modelOptions').catch((error) => {
    logger.provider.error('model options background registry refresh failed', error)
  })

  try {
    const storedRegistry = await loadModelRegistryFast()
    if (hasModelRegistryEntries(storedRegistry)) return storedRegistry
  } catch (error) {
    logger.provider.error('model options load stored registry failed', error)
  }

  if (providers.length > 0) {
    try {
      const { buildModelRegistryPreviewWithProviders } = await import('@/lib/ai/model-registry/sync-preview')
      const previewRegistry = await buildModelRegistryPreviewWithProviders(providers)
      if (hasModelRegistryEntries(previewRegistry)) return previewRegistry
    } catch (error) {
      logger.provider.error('model options build preview registry failed', error)
    }
  }

  return createEmptyModelRegistry()
}

/**
 * UI 层的模型选项。
 *
 * 说明：
 * - 每一项都来自某个启用中的 provider 模型配置，但会叠加 registry 解析后的统一语义；
 * - UI 层消费时应优先使用这里的字段，而不是重新从 provider/raw model 上自行推导。
 */
export type ModelOption = {
  /** 完整模型标识："providerId/modelId" */
  id: string
  /** Provider 侧的原始 model id（不含 provider 前缀） */
  modelId: string
  /** 展示名称 */
  name: string
  /** Provider 标识（providerId） */
  providerId: string
  /** Provider 展示名 */
  providerName: string
  /** Provider 类型 */
  providerType: ProviderConfig['type']
  /** 分组名（用于"选择模型"弹窗的排序与分组展示） */
  group?: string
  /** 统一公共模型 ID。 */
  canonicalId: string
  /** 去掉平台包装前缀后的基础模型身份键。 */
  baseModelKey: string
  /** 供共享版本排序复用的稳定排序身份。 */
  versionSortKey: string
  /** 模型作用域。 */
  scope: ModelScope
  /** 模型主类型。 */
  kind: ModelKind
  /** 主类键，固定对齐当前 8 大主类。 */
  primaryKindKey: PrimaryKindKey
  /** 输入模态列表。 */
  inputModalities: ReadonlyArray<ModelModality>
  /** 输出模态列表。 */
  outputModalities: ReadonlyArray<ModelModality>
  /** 语义特性列表。 */
  features: ReadonlyArray<ModelFeature>
  /** 传输协议。 */
  transportProtocol: TransportProtocol
  /** 解析可信度。 */
  confidence: ResolveConfidence
  /** 当前模型显式声明支持的 provider 原生请求参数。 */
  supportedParameters?: ReadonlyArray<string>
  /** 可选描述。 */
  description?: string
}

/** `useModelOptions` 的返回结构。 */
export interface UseModelOptionsResult {
  /** 当前启用中的 Provider 列表。 */
  providers: ProviderConfig[]
  /** 拍平后的模型选项列表。 */
  models: ModelOption[]
  /** 以 `providerId/modelId` 为键的快速查询映射。 */
  modelMap: Map<string, ModelOption>
  /** 获取模型完整展示名。 */
  getModelLabel: (id: string) => string
  /** 获取模型短标签，常用于头像/角标。 */
  getModelShortLabel: (id: string) => string
  /** 重新从存储层与 registry 载入最新模型列表。 */
  reload: () => Promise<void>
}

type ModelOptionsSnapshot = {
  providers: ProviderConfig[]
  models: ModelOption[]
}

/**
 * 将 Provider 配置转换为 UI 可用的模型选项列表。
 *
 * 规则：
 * - 仅输出 enabled 的 provider 及其模型；
 * - 生成 `id = providerId/modelId` 的稳定标识；
 * - Provider 维度保持 `providers` 配置数组顺序，这也是全扩展模型展示顺序真源；
 * - Provider 内只对同一家族模型执行版本感知升序，不打散不同家族的现有相对顺序。
 */
export function buildModelOptions(
  providers: ProviderConfig[] | null | undefined,
  registry?: ModelRegistryState,
): ModelOption[] {
  const out: ModelOption[] = []
  const seenOptionIds = new Set<string>()
  const list = Array.isArray(providers) ? providers : []
  const activeRegistry = registry ?? createEmptyModelRegistry()
  for (const p of list) {
    if (!p?.enabled) continue
    for (const m of p.models || []) {
      const modelId = String(m?.id || '').trim()
      if (!modelId) continue
      const optionId = `${p.id}/${modelId}`
      if (seenOptionIds.has(optionId)) {
        logger.provider.warn('duplicate provider model id skipped', { providerType: p.type })
        continue
      }
      seenOptionIds.add(optionId)
      const resolved = resolveModelMetaFromRegistry(activeRegistry, {
        providerType: p.type,
        providerId: p.id,
        apiHost: p.apiHost,
        rawModelId: modelId,
        rawModelName: m.name || modelId,
      })
      const effectiveResolved = applyUserModelTypes(resolved, m.manualModelTypes)
      out.push({
        id: optionId,
        modelId,
        name: effectiveResolved.displayName || m.name || modelId,
        providerId: p.id,
        providerName: p.name,
        providerType: p.type,
        group: typeof m.group === 'string' && m.group.trim() ? m.group.trim() : undefined,
        canonicalId: effectiveResolved.canonicalId,
        baseModelKey: effectiveResolved.baseModelKey,
        versionSortKey: deriveVersionSortKey({
          modelId,
          baseModelKey: effectiveResolved.baseModelKey,
        }),
        scope: effectiveResolved.scope,
        kind: effectiveResolved.kind,
        primaryKindKey: derivePrimaryKindKey(effectiveResolved),
        inputModalities: effectiveResolved.inputModalities,
        outputModalities: effectiveResolved.outputModalities,
        features: effectiveResolved.features,
        transportProtocol: effectiveResolved.transportProtocol,
        confidence: effectiveResolved.confidence,
        supportedParameters: effectiveResolved.supportedParameters,
        ...(effectiveResolved.description ? { description: effectiveResolved.description } : {}),
      })
    }
  }
  const providerBuckets = new Map<string, ModelOption[]>()
  for (const model of out) {
    const bucket = providerBuckets.get(model.providerId)
    if (bucket) bucket.push(model)
    else providerBuckets.set(model.providerId, [model])
  }

  return Array.from(providerBuckets.values())
    .flatMap((models) => sortModelsByVersionSemantics(models, (model) => ({
      modelId: model.versionSortKey,
      displayName: model.name,
    })))
}

/**
 * 从完整模型标识中提取默认展示名（兜底用）。
 *
 * @example
 * - "openai/gpt-4.1" -\> "gpt-4.1"
 */
export function defaultModelLabel(modelId: string): string {
  const raw = String(modelId || '').trim()
  if (!raw) return 'AI'
  return raw.split('/').pop() || raw
}

/**
 * 内部函数：`createInitialSnapshot`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function createInitialSnapshot(): ModelOptionsSnapshot {
  return {
    providers: createInitialProvidersState(),
    models: createInitialModelsState(),
  }
}

type ModelOptionsListener = () => void

type ModelOptionsResource = {
  snapshot: ModelOptionsSnapshot
  listeners: Set<ModelOptionsListener>
  reloadPromise: Promise<void> | null
  reloadQueued: boolean
  started: boolean
  unsubscribeStorage: (() => void) | null
  unsubscribeWindow: (() => void) | null
}

/**
 * 内部函数：`createModelOptionsResource`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function createModelOptionsResource(): ModelOptionsResource {
  return {
    snapshot: createInitialSnapshot(),
    listeners: new Set(),
    reloadPromise: null,
    reloadQueued: false,
    started: false,
    unsubscribeStorage: null,
    unsubscribeWindow: null,
  }
}

interface GlobalThisWithModelOptionsResource {
  __olyqModelOptionsResourceV1__?: ModelOptionsResource
}

const globalForModelOptions = globalThis as unknown as GlobalThisWithModelOptionsResource
const modelOptionsResource = globalForModelOptions.__olyqModelOptionsResourceV1__ ?? createModelOptionsResource()
globalForModelOptions.__olyqModelOptionsResourceV1__ = modelOptionsResource

/**
 * 内部函数：`emitModelOptionsChange`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function emitModelOptionsChange() {
  for (const listener of modelOptionsResource.listeners) listener()
}

/**
 * 内部函数：`commitModelOptionsSnapshot`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function commitModelOptionsSnapshot(nextProviders: ProviderConfig[], nextRegistry: ModelRegistryState) {
  modelOptionsResource.snapshot = {
    providers: nextProviders,
    models: buildModelOptions(nextProviders, nextRegistry),
  }
  emitModelOptionsChange()
}

/**
 * 内部函数：`queueModelOptionsReloadIfNeeded`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function queueModelOptionsReloadIfNeeded() {
  if (!modelOptionsResource.reloadQueued) return
  modelOptionsResource.reloadQueued = false
  void reloadModelOptionsResource()
}

/**
 * 内部函数：`reloadModelOptionsResource`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
async function reloadModelOptionsResource(): Promise<void> {
  if (modelOptionsResource.reloadPromise) {
    modelOptionsResource.reloadQueued = true
    return await modelOptionsResource.reloadPromise
  }

  modelOptionsResource.reloadPromise = (async () => {
    try {
      const loaded = [...await loadProvidersView()]
      if (!Array.isArray(loaded)) {
        throw new Error('[useModelOptions] loadProvidersView 返回非数组')
      }
      const registry = await loadBestEffortRegistry(loaded)
      if (typeof window !== 'undefined') {
        reconcileModelReferences({ providers: loaded, registry })
      }
      commitModelOptionsSnapshot(loaded, registry)
    } catch (err) {
      logger.provider.error('model options load providers view failed', err)
      if (shouldUsePreviewFallbackProviders()) {
        commitModelOptionsSnapshot(structuredClone(DEFAULT_PROVIDERS), createEmptyModelRegistry())
      }
    }
  })()
    .finally(() => {
      modelOptionsResource.reloadPromise = null
      queueModelOptionsReloadIfNeeded()
    })

  return await modelOptionsResource.reloadPromise
}

/**
 * 内部函数：`ensureModelOptionsResourceStarted`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function ensureModelOptionsResourceStarted() {
  if (modelOptionsResource.started) return
  modelOptionsResource.started = true

  void reloadModelOptionsResource()

  modelOptionsResource.unsubscribeStorage = getStorageAdapter().onChange((changes) => {
    if (!changes[PROVIDERS_STORAGE_KEY] && !changes[MODEL_REGISTRY_STORAGE_KEY]) return
    void reloadModelOptionsResource()
  })

  if (typeof window !== 'undefined') {
        /**
     * 内部函数变量：`onRegistryUpdated`。
     *
     * @remarks
     * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
     */
    const onRegistryUpdated = () => {
      void reloadModelOptionsResource()
    }
    window.addEventListener(MODEL_REGISTRY_UPDATED_EVENT, onRegistryUpdated)
    modelOptionsResource.unsubscribeWindow = () => {
      window.removeEventListener(MODEL_REGISTRY_UPDATED_EVENT, onRegistryUpdated)
    }
  }
}

/**
 * 内部函数：`subscribeModelOptions`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function subscribeModelOptions(listener: ModelOptionsListener): () => void {
  ensureModelOptionsResourceStarted()
  modelOptionsResource.listeners.add(listener)
  return () => {
    modelOptionsResource.listeners.delete(listener)
    if (modelOptionsResource.listeners.size > 0) return
    modelOptionsResource.unsubscribeStorage?.()
    modelOptionsResource.unsubscribeWindow?.()
    modelOptionsResource.unsubscribeStorage = null
    modelOptionsResource.unsubscribeWindow = null
    modelOptionsResource.started = false
  }
}

/**
 * 内部函数：`getModelOptionsSnapshot`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function getModelOptionsSnapshot(): ModelOptionsSnapshot {
  ensureModelOptionsResourceStarted()
  return modelOptionsResource.snapshot
}

/**
 * 从 chrome.storage.local（`PROVIDERS_STORAGE_KEY`，固定为 `olyq.providers.v1`）读取启用的模型列表。
 * - 扩展环境：实时读取并监听 storage 变化
 * - 非扩展环境：退化为 DEFAULT_PROVIDERS（用于 Web 预览 UI，不负责真正可用性）
 */
export function useModelOptions(): UseModelOptionsResult {
  const snapshot = useSyncExternalStore(subscribeModelOptions, getModelOptionsSnapshot, createInitialSnapshot)
  const safeProviders = Array.isArray(snapshot.providers) ? snapshot.providers : EMPTY_PROVIDERS
  const safeModels = useMemo(() => (Array.isArray(snapshot.models) ? snapshot.models : []), [snapshot.models])
  const modelMap = useMemo(() => new Map(safeModels.map((m) => [m.id, m])), [safeModels])

  /** 读取模型完整展示名，目录未就绪时回退到基于 ID 的兜底名称。 */
  const getModelLabel = useCallback(
    (id: string) => modelMap.get(id)?.name ?? defaultModelLabel(id),
    [modelMap],
  )

  /** 读取模型缩写，供头像/徽标等窄空间 UI 使用。 */
  const getModelShortLabel = useCallback(
    (id: string) => {
      const opt = modelMap.get(id)
      // 按当前实现“模型缩写”体验：优先取模型展示名首字母（Claude→C / Moonshot→M / GPT→G）。
      // 兜底：使用 providerName/providerId 首字母，避免模型目录未加载时显示为空。
      const name = String(opt?.name || '').trim()
      if (name) return name.charAt(0).toUpperCase() || 'A'
      const base = (opt?.providerName || opt?.providerId || String(id || '').split('/')[0] || '').trim()
      return base.charAt(0).toUpperCase() || 'A'
    },
    [modelMap],
  )

  const reload = useCallback(async () => {
    await reloadModelOptionsResource()
  }, [])

  return { providers: safeProviders, models: safeModels, modelMap, getModelLabel, getModelShortLabel, reload }
}
