/**
 * 说明：`embedding-executor` AI 能力模块。
 *
 * 职责：
 * - 承载 `embedding-executor` 相关的当前文件实现与模块边界；
 * - 对外暴露 `EmbeddingInputItem`、`EmbeddingInputItems`、`EmbeddingExecutor` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { embedMany } from 'ai'

import { createEmbeddingModel } from './provider-factory'
import {
  resolveProviderRuntimeContext,
  type ResolveProviderRuntimeContextParams,
  type ResolvedProviderRuntimeContext,
} from './provider-runtime'
import { resolveProviderRequestParams } from './provider-auth'
import { I18nError } from '@/lib/i18n/error'

/** 导出类型：`EmbeddingInputItem`。 */
export type EmbeddingInputItem =
  | { type: 'text'; text: string }
  | { type: 'image'; dataUrl: string }

/** 导出类型：`EmbeddingInputItems`。 */
export type EmbeddingInputItems = ReadonlyArray<EmbeddingInputItem>

/** 导出类型：`EmbeddingExecutor`。 */
export interface EmbeddingExecutor {
  execute(items: EmbeddingInputItems, options?: { abortSignal?: AbortSignal }): Promise<number[]>
  executeMany(itemsList: ReadonlyArray<EmbeddingInputItems>, options?: { abortSignal?: AbortSignal }): Promise<number[][]>
}

type NormalizedEmbeddingItem =
  | { type: 'text'; text: string }
  | { type: 'image'; dataUrl: string }

type EmbeddingBatchKind = 'text' | 'image'

const COHERE_MAX_EMBEDDINGS_PER_CALL = 96
const DEFAULT_COHERE_BASE_URL = 'https://api.cohere.com/v2'

/**
 * 内部函数：`trimSlash`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function trimSlash(value: string): string {
  return String(value || '').replace(/\/+$/, '')
}

/**
 * 内部函数：`normalizeEmbeddingItems`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function normalizeEmbeddingItems(items: EmbeddingInputItems): NormalizedEmbeddingItem[] {
  if (!Array.isArray(items)) return []

  const normalized: NormalizedEmbeddingItem[] = []
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    if (item.type === 'text') {
      const text = String(item.text || '').trim()
      if (!text) continue
      normalized.push({ type: 'text', text })
      continue
    }
    if (item.type === 'image') {
      const dataUrl = String(item.dataUrl || '').trim()
      if (!dataUrl) continue
      if (!dataUrl.startsWith('data:')) throw new I18nError('errors.embeddingImageDataUrlRequired')
      normalized.push({ type: 'image', dataUrl })
    }
  }
  return normalized
}

/**
 * 内部函数：`normalizeEmbeddingItemsList`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function normalizeEmbeddingItemsList(itemsList: ReadonlyArray<EmbeddingInputItems>): NormalizedEmbeddingItem[][] {
  if (!Array.isArray(itemsList)) return []
  return itemsList.map((items) => {
    const normalized = normalizeEmbeddingItems(items)
    if (normalized.length === 0) throw new I18nError('errors.embeddingItemsRequired')
    return normalized
  })
}

/**
 * 内部函数：`detectBatchKind`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function detectBatchKind(items: ReadonlyArray<NormalizedEmbeddingItem>): EmbeddingBatchKind {
  if (items.length === 0) throw new I18nError('errors.embeddingItemsRequired')

  const hasText = items.some((item) => item.type === 'text')
  const hasImage = items.some((item) => item.type === 'image')
  if (hasText && hasImage) throw new I18nError('errors.embeddingMixedItemsNotSupported')
  return hasImage ? 'image' : 'text'
}

/**
 * 内部函数：`collapseTextItems`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function collapseTextItems(items: ReadonlyArray<NormalizedEmbeddingItem>): string {
  const texts = items.filter((item): item is Extract<NormalizedEmbeddingItem, { type: 'text' }> => item.type === 'text')
  if (texts.length === 0) throw new I18nError('errors.embeddingItemsRequired')
  return texts.map((item) => item.text).join('\n\n')
}

/**
 * 内部函数：`collapseImageItem`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function collapseImageItem(items: ReadonlyArray<NormalizedEmbeddingItem>): string {
  const images = items.filter((item): item is Extract<NormalizedEmbeddingItem, { type: 'image' }> => item.type === 'image')
  if (images.length !== 1) throw new I18nError('errors.embeddingImageSingleInputRequired')
  return images[0].dataUrl
}

/**
 * 内部函数：`chunkArray`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function chunkArray<T>(items: ReadonlyArray<T>, size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push([...items.slice(index, index + size)])
  }
  return chunks
}

/**
 * 内部函数：`assertEmbeddingKindSupported`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function assertEmbeddingKindSupported(runtime: ResolvedProviderRuntimeContext, batchKind: EmbeddingBatchKind): void {
  const supported = new Set(runtime.resolvedModelMeta.inputModalities)
  if (supported.size === 0) return
  if (batchKind === 'text' && !supported.has('text')) throw new I18nError('errors.embeddingTextInputNotSupported')
  if (batchKind === 'image' && !supported.has('image')) throw new I18nError('errors.embeddingImageInputNotSupported')
}

/**
 * 内部函数：`executeTextEmbeddingsWithAiSdk`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
async function executeTextEmbeddingsWithAiSdk(
  runtime: ResolvedProviderRuntimeContext,
  batches: ReadonlyArray<ReadonlyArray<NormalizedEmbeddingItem>>,
  abortSignal?: AbortSignal,
): Promise<number[][]> {
  const model = await createEmbeddingModel(
    { ...runtime.runtimeConfig, apiKey: runtime.apiKey, apiHost: runtime.apiHost },
    runtime.modelId,
  )
  const values = batches.map((items) => collapseTextItems(items))
  const res = await embedMany({ model, values, abortSignal })
  return res.embeddings.map((embedding) => Array.isArray(embedding) ? embedding.map((value) => Number(value)) : [])
}

/**
 * 内部函数：`postCohereEmbeddings`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
async function postCohereEmbeddings(
  runtime: ResolvedProviderRuntimeContext,
  batchKind: EmbeddingBatchKind,
  values: ReadonlyArray<string>,
  abortSignal?: AbortSignal,
): Promise<number[][]> {
  const { authHeaders, headers } = resolveProviderRequestParams({
    ...runtime.runtimeConfig,
    apiKey: runtime.apiKey,
    apiHost: runtime.apiHost,
  })
  const response = await fetch(`${trimSlash(runtime.apiHost || DEFAULT_COHERE_BASE_URL)}/embed`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
      ...authHeaders,
    },
    body: JSON.stringify({
      model: runtime.modelId,
      embedding_types: ['float'],
      ...(batchKind === 'text'
        ? { texts: values, input_type: 'search_query' }
        : { images: values, input_type: 'image' }),
    }),
    signal: abortSignal,
  })

  if (!response.ok) {
    const detail = String(await response.text().catch(() => '') || response.statusText || '').trim().slice(0, 200)
    throw new I18nError('errors.embeddingFailedWithDetail', { detail: detail || `${response.status}` })
  }

  const json = await response.json().catch(() => null)
  const embeddings = Array.isArray((json as { embeddings?: { float?: unknown } } | null)?.embeddings?.float)
    ? (json as { embeddings: { float: unknown[] } }).embeddings.float
    : null
  if (!embeddings) throw new I18nError('errors.embeddingInvalidResponse')
  return embeddings.map((embedding) => Array.isArray(embedding) ? embedding.map((value) => Number(value)) : [])
}

/**
 * 内部函数：`createAiSdkEmbeddingExecutor`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function createAiSdkEmbeddingExecutor(runtime: ResolvedProviderRuntimeContext): EmbeddingExecutor {
  return {
        /**
     * 内部方法：`execute`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async execute(items, options) {
      const normalized = normalizeEmbeddingItems(items)
      const batchKind = detectBatchKind(normalized)
      assertEmbeddingKindSupported(runtime, batchKind)
      if (batchKind !== 'text') throw new I18nError('errors.embeddingImageInputNotSupported')
      const [embedding] = await executeTextEmbeddingsWithAiSdk(runtime, [normalized], options?.abortSignal)
      return embedding ?? []
    },
        /**
     * 内部方法：`executeMany`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async executeMany(itemsList, options) {
      const normalized = normalizeEmbeddingItemsList(itemsList)
      if (normalized.length === 0) return []
      const batchKind = detectBatchKind(normalized[0] ?? [])
      assertEmbeddingKindSupported(runtime, batchKind)
      if (batchKind !== 'text') throw new I18nError('errors.embeddingImageInputNotSupported')
      return await executeTextEmbeddingsWithAiSdk(runtime, normalized, options?.abortSignal)
    },
  }
}

/**
 * 内部函数：`createCohereEmbeddingExecutor`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function createCohereEmbeddingExecutor(runtime: ResolvedProviderRuntimeContext): EmbeddingExecutor {
  return {
        /**
     * 内部方法：`execute`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async execute(items, options) {
      const normalized = normalizeEmbeddingItems(items)
      const batchKind = detectBatchKind(normalized)
      assertEmbeddingKindSupported(runtime, batchKind)
      const values = batchKind === 'text' ? [collapseTextItems(normalized)] : [collapseImageItem(normalized)]
      const [embedding] = await postCohereEmbeddings(runtime, batchKind, values, options?.abortSignal)
      return embedding ?? []
    },
        /**
     * 内部方法：`executeMany`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async executeMany(itemsList, options) {
      const normalized = normalizeEmbeddingItemsList(itemsList)
      if (normalized.length === 0) return []
      const batchKind = detectBatchKind(normalized[0] ?? [])
      assertEmbeddingKindSupported(runtime, batchKind)
      const values = normalized.map((items) => {
        const nextKind = detectBatchKind(items)
        if (nextKind !== batchKind) throw new I18nError('errors.embeddingMixedItemsNotSupported')
        return batchKind === 'text' ? collapseTextItems(items) : collapseImageItem(items)
      })
      const results: number[][] = []
      for (const chunk of chunkArray(values, COHERE_MAX_EMBEDDINGS_PER_CALL)) {
        results.push(...await postCohereEmbeddings(runtime, batchKind, chunk, options?.abortSignal))
      }
      return results
    },
  }
}

/**
 * 导出函数：`createEmbeddingExecutor`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function createEmbeddingExecutor(runtime: ResolvedProviderRuntimeContext): EmbeddingExecutor {
  return runtime.runtimeConfig.type === 'cohere'
    ? createCohereEmbeddingExecutor(runtime)
    : createAiSdkEmbeddingExecutor(runtime)
}

/**
 * 导出函数：`resolveEmbeddingExecutor`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function resolveEmbeddingExecutor(
  params: ResolveProviderRuntimeContextParams,
): Promise<EmbeddingExecutor> {
  return createEmbeddingExecutor(await resolveProviderRuntimeContext(params))
}
