/**
 * 说明：`health-check` 后台运行时模块。
 *
 * 职责：
 * - 承载 `health-check` 相关的当前文件实现与模块边界；
 * - 对外暴露 `HealthCheckKeyMode`、`HealthCheckRequestPayload`、`HealthModelStatus` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 模型平台（Provider）健康检查（Service Worker 侧）。
 *
 * 用途：
 * - 用于“模型管理”面板的连通性检测（按模型检测、按密钥检测）
 * - 复用一套后台能力，按当前实现的“多密钥管理 + 健康检查”体验
 *
 * 输出：
 * - 以事件流的形式回传（health/model → health/done / health/error）
 * - 单个模型的检测结果会聚合多密钥结果（success/failed/latency/error）
 *
 * 并发策略：
 * - isConcurrent=true：模型级并发（更快，但更容易触发平台限流）
 * - isConcurrent=false：模型级串行（更稳，避免并发导致的误判）
 *
 * 注意：
 * - error 字段使用 I18nText 透传，UI 侧负责渲染为最终字符串。
 */

import { APICallError, generateImage, generateText, rerank, streamText } from 'ai'
import type { I18nText } from '../../types/i18n'
import type { ProviderConfig, ProviderModelConfig } from '../../lib/ai/types'
import { getProviderView } from '../../lib/ai/provider-storage'
import { resolveProviderRuntimeContext } from '../../lib/ai/provider-runtime'
import { splitApiKeys } from '../../lib/ai/api-keys'
import { createImageModel, createLanguageModel, createRerankModel, createSpeechModel, createTranscriptionModel } from '../../lib/ai/provider-factory'
import { resolveModelMeta, type ResolvedModelMeta } from '../../lib/ai/model-registry'
import { createEmbeddingExecutor } from '../../lib/ai/embedding-executor'
import { buildRuntimeCallPlan, type StreamContext } from '../../lib/ai/stream-chat-context'
import { resolveProviderContract } from '../../lib/ai/providers/provider-contracts'
import { getOpenAiCompatibleProviderKey, getProviderOptionsKey, resolveEffectiveProviderType } from '../../lib/ai/stream-chat-utils'
import { I18nError } from '../../lib/i18n/error'
import { i18nText } from '../../lib/i18n/text'
import { isPlainRecord } from '../../lib/utils/type-guards'
import {
  buildFailedHealthCheckResult,
  buildHealthTextCallArgs,
  hasGenerateTextVisibleOutput,
  tryRecoverOpenAiResponsesVisibleOutput,
} from './health-check-support'
import { safePostMessage } from './port-manager'

/**
 * 健康检查的密钥检查模式。
 *
 * - `single`：只检测一个指定密钥
 * - `all`：检测该 Provider 配置里的全部密钥
 */
export type HealthCheckKeyMode = 'single' | 'all'

/** 健康检查请求负载。 */
export type HealthCheckRequestPayload = {
  /** Provider ID（对应 ProviderConfig.id） */
  providerId: string
  /** 需要检测的模型 ID 列表（ProviderModelConfig.id） */
  modelIds: string[]
  /** 密钥检测模式：single=仅检测一个密钥，all=检测全部密钥 */
  keyCheckMode: HealthCheckKeyMode
  /** 当 keyCheckMode=single 时，指定要检测的密钥下标 */
  selectedKeyIndex?: number
  /** 是否并发检测模型 */
  isConcurrent: boolean
  /** 单次请求超时（毫秒；会被下限/上限夹取） */
  timeoutMs: number
}

/** 单模型健康检查汇总状态。 */
export type HealthModelStatus = 'ok' | 'partial' | 'error'

/** 单模型健康检查事件负载。 */
export type HealthModelEventPayload = {
  /** 模型 ID */
  modelId: string
  /** 汇总状态：ok=全部成功，partial=部分成功，error=全部失败 */
  status: HealthModelStatus
  /** 可选：延迟（毫秒；来自成功请求的统计/代表值） */
  latency?: number
  /** 可选：错误摘要（I18nText；用于 UI 展示） */
  error?: I18nText
  /** 可选：技术详情（稳定、可复制、已清洗）。 */
  errorDetail?: string
  /** 可选：密钥成功/失败统计 */
  keySummary?: { total: number; success: number; failed: number }
}

/** 健康检查事件流。 */
export type HealthCheckEvent =
  | { type: 'health/model'; requestId: string; payload: HealthModelEventPayload }
  | { type: 'health/done'; requestId: string }
  | { type: 'health/error'; requestId: string; error: I18nText; errorDetail?: string }

/** 单个密钥对单个模型的检查结果。 */
interface KeyCheckResult {
  /** 当前密钥检查是否成功。 */
  status: 'success' | 'failed'
  /** 请求耗时（毫秒）。 */
  latency?: number
  /** 失败时可展示的错误文案。 */
  error?: I18nText
  /** 失败时可复制的技术详情。 */
  errorDetail?: string
}

/** 已解析出统一语义的待检查模型。 */
interface ResolvedHealthModel {
  /** Provider 配置中的原始模型对象。 */
  model: ProviderModelConfig
  /** 结合注册表推导出的模型语义信息。 */
  meta: ResolvedModelMeta
}

const ONE_PIXEL_PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5Wf3sAAAAASUVORK5CYII='

/** 从 OpenAI-like 图片响应数组中提取 URL 列表。 */
function collectUrlStrings(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const it of v) {
    if (!isPlainRecord(it)) continue
    const url = it.url
    if (typeof url === 'string' && url.trim()) out.push(url.trim())
  }
  return out
}

/** 从 OpenAI-compatible 生图响应里提取图片 URL。 */
function extractOpenAiLikeImageUrls(json: unknown): string[] {
  if (!isPlainRecord(json)) return []
  const urls = [
    ...collectUrlStrings(json.data),
    ...collectUrlStrings(json.images),
  ]
  return Array.from(new Set(urls))
}

/**
 * 根据检查模式决定本轮要实际使用哪些密钥。
 *
 * 说明：
 * - `single` 模式下会按下标选择一个密钥，并自动夹取到合法范围；
 * - 若配置中没有任何密钥，会回退到 `['']`，让后续流程统一走“无 key”检查路径。
 */
function pickKeysToUse(keys: string[], keyCheckMode: HealthCheckKeyMode, selectedKeyIndex?: number): string[] {
  if (keys.length === 0) return ['']
  if (keyCheckMode !== 'single') return keys

  const idx = typeof selectedKeyIndex === 'number' && Number.isFinite(selectedKeyIndex) ? Math.floor(selectedKeyIndex) : 0
  const safe = Math.max(0, Math.min(keys.length - 1, idx))
  return [keys[safe] ?? keys[0] ?? '']
}

/**
 * 创建带超时能力的 AbortController。
 *
 * 说明：
 * - 既响应上游 signal，也会在超时时主动 abort；
 * - 返回的 `clear()` 必须在 finally 中调用，避免遗留定时器。
 */
function createTimeoutController(timeoutMs: number, signal: AbortSignal): { controller: AbortController; clear: () => void } {
  const controller = new AbortController()
  const ms = typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) ? Math.max(1_000, Math.floor(timeoutMs)) : 15_000

  const timer = setTimeout(() => controller.abort(), ms)
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true })
  return { controller, clear: () => clearTimeout(timer) }
}

/**
 * 使用单个密钥检查单个模型。
 *
 * 说明：
 * - 会根据模型语义选择不同检查路径：embedding / rerank / image / text；
 * - 返回值统一收敛成 success/failed + latency/error，供上层聚合。
 */
async function checkOneKey({
  provider,
  resolvedModel,
  apiKey,
  timeoutMs,
  signal,
}: {
  provider: ProviderConfig
  resolvedModel: ResolvedHealthModel
  apiKey: string
  timeoutMs: number
  signal: AbortSignal
}): Promise<KeyCheckResult> {
  const start = performance.now()
  const { model, meta } = resolvedModel

  const { controller, clear } = createTimeoutController(timeoutMs, signal)
  try {
    const runtimeContext = await resolveProviderRuntimeContext({
      model: `${provider.id}/${model.id}`,
      providerConfigOverride: { ...provider, apiKey },
      apiKeyOverride: apiKey,
      resolvedModelMeta: meta,
    })
    const runtimeProviderConfig: ProviderConfig = {
      ...runtimeContext.runtimeConfig,
      apiKey: runtimeContext.apiKey,
      apiHost: runtimeContext.apiHost,
    }
    const runtimeMeta = runtimeContext.resolvedModelMeta

    if (runtimeMeta.kind === 'unknown') {
      throw new I18nError('errors.modelSemanticsUnresolved')
    } else if (runtimeMeta.kind === 'embedding') {
      const embeddingExecutor = createEmbeddingExecutor({
        ...runtimeContext,
        runtimeConfig: runtimeProviderConfig,
      })
      const items = runtimeMeta.inputModalities.includes('image') && !runtimeMeta.inputModalities.includes('text')
        ? [{ type: 'image' as const, dataUrl: ONE_PIXEL_PNG_DATA_URL }]
        : [{ type: 'text' as const, text: 'hi' }]
      await new Promise<void>((resolve, reject) => {
        /** 将外层超时/取消信号桥接到嵌入检查调用。 */
        const onAbort = () => reject(new DOMException('Aborted', 'AbortError'))
        if (controller.signal.aborted) return onAbort()
        controller.signal.addEventListener('abort', onAbort, { once: true })
        embeddingExecutor.execute(items, { abortSignal: controller.signal })
          .then(() => resolve())
          .catch(reject)
          .finally(() => {
            controller.signal.removeEventListener('abort', onAbort)
          })
      })
    } else if (runtimeMeta.kind === 'rerank') {
      const rerankModel = await createRerankModel(runtimeProviderConfig, runtimeContext.modelId)
      await rerank({
        model: rerankModel,
        query: 'hi',
        documents: ['hello', 'hi'],
        topN: 1,
        maxRetries: 0,
        abortSignal: controller.signal,
      })
    } else if (runtimeMeta.kind === 'transcription') {
      // transcription v1 健康检查先做 preflight：
      // - resolveProviderRuntimeContext 已覆盖鉴权、协议与 base URL；
      // - 这里只再确认 provider adapter 能实例化 transcription model；
      // - 不上传真实音频，避免长耗时与额外计费。
      await createTranscriptionModel(runtimeProviderConfig, runtimeContext.modelId)
    } else if (runtimeMeta.kind === 'speech-generation') {
      // speech v1 健康检查也保持 preflight，不实际触发 TTS 计费请求。
      await createSpeechModel(runtimeProviderConfig, runtimeContext.modelId)
    } else if (runtimeMeta.kind === 'moderation') {
      // moderation v1 只验证 runtime 主干可解析，不在健康检查里发送真实审核请求。
    } else if (runtimeMeta.kind === 'video-generation') {
      // Video 工作区和 video-api runtime 已彻底下线。
      // 模型目录仍可展示 video-generation 元数据，但健康检查不能再实例化可执行 VideoModel。
      throw new I18nError('errors.providerTypeVideoGenNotSupported', { providerType: String(runtimeProviderConfig.type) })
    } else if (runtimeMeta.kind === 'image-generation') {
      const imageModel = await createImageModel(runtimeProviderConfig, runtimeContext.modelId)
      try {
        await generateImage({ model: imageModel, prompt: 'hi', n: 1, maxRetries: 0, abortSignal: controller.signal })
      } catch (e: unknown) {
        // 兼容：部分 OpenAI-compatible 平台 200 成功只返回图片 URL（导致 AI SDK schema 校验失败）。
        if (e instanceof APICallError && e.statusCode === 200) {
          const body = e.responseBody ?? e.data
          const json = typeof body === 'string'
            ? (() => { try { return JSON.parse(body) } catch { return body } })()
            : body
          const urls = extractOpenAiLikeImageUrls(json)
          if (urls.length > 0) {
            // 只要拿到 URL，就说明 key/连通性正常；健康检查按成功处理。
          } else {
            throw e
          }
        } else {
          throw e
        }
      }
    } else {
      const callParams = {
        model: `${provider.id}/${model.id}`,
        temperature: 0,
        topP: 1,
        maxTokens: 1,
      } as const
      const effectiveProviderType = resolveEffectiveProviderType({
        providerId: runtimeProviderConfig.id,
        providerType: runtimeProviderConfig.type,
        transportProtocol: runtimeMeta.transportProtocol,
      })
      const providerOptionsKey = getProviderOptionsKey({
        providerId: runtimeProviderConfig.id,
        providerType: runtimeProviderConfig.type,
        effectiveProviderType,
      })
      const openaiCompatibleProviderKey = getOpenAiCompatibleProviderKey({
        providerId: runtimeProviderConfig.id,
        providerType: runtimeProviderConfig.type,
        effectiveProviderType,
      })
      const runtimeLanguageModel = await createLanguageModel(runtimeProviderConfig, runtimeContext.modelId)
      const streamContext: StreamContext = {
        providerId: runtimeProviderConfig.id,
        modelId: runtimeContext.modelId,
        providerConfig: runtimeProviderConfig,
        providerType: runtimeProviderConfig.type,
        effectiveProviderType,
        providerOptionsKey,
        openaiCompatibleProviderKey,
        modelConfig: runtimeProviderConfig.models.find((item) => item.id === runtimeContext.modelId),
        resolvedModelMeta: runtimeMeta,
        featureKeys: new Set(runtimeMeta.features.map((feature) => String(feature || '').trim().toLowerCase())),
        providerContract: resolveProviderContract({
          providerId: runtimeProviderConfig.id,
          providerType: runtimeProviderConfig.type,
          effectiveProviderType,
          transportProtocol: runtimeMeta.transportProtocol,
        }),
      }
      const runtimeCallPlan = await buildRuntimeCallPlan(
        streamContext,
        callParams,
        undefined,
        { languageModel: runtimeLanguageModel },
      )
      const messages = [
        { role: 'system' as const, content: 'test' },
        { role: 'user' as const, content: 'hi' },
      ]
      const textCallArgs = buildHealthTextCallArgs({
        messages,
        runtimeCallPlan,
        signal: controller.signal,
      })

      if (runtimeMeta.transportProtocol === 'openai-responses') {
        try {
          const result = await generateText(textCallArgs)
          if (!hasGenerateTextVisibleOutput(result)) {
            throw new I18nError('errors.modelNoOutput')
          }
        } catch (error: unknown) {
          const recovered = tryRecoverOpenAiResponsesVisibleOutput(error)
          if (recovered.matched) {
            if (!recovered.hasVisibleOutput) {
              throw new I18nError('errors.modelNoOutput', undefined, { cause: error })
            }
          } else {
            throw error
          }
        }
      } else if (model.supportedTextDelta === false || runtimeCallPlan.executionMode === 'generateText') {
        const result = await generateText(textCallArgs)
        if (!hasGenerateTextVisibleOutput(result)) {
          throw new I18nError('errors.modelNoOutput')
        }
      } else {
        const result = streamText(textCallArgs)
        let visibleText = ''
        let hasToolOutput = false
        let hasFileOutput = false

        for await (const part of result.fullStream) {
          if (controller.signal.aborted) break

          switch (part.type) {
            case 'text-delta':
              if (part.text) visibleText += part.text
              break
            case 'tool-call':
            case 'tool-result':
              hasToolOutput = true
              break
            case 'file':
              if (part.file) hasFileOutput = true
              break
            default:
              break
          }
        }

        if (!controller.signal.aborted && !visibleText.trim() && !hasToolOutput && !hasFileOutput) {
          throw new I18nError('errors.modelNoOutput')
        }
      }
    }

    const latency = Math.round(performance.now() - start)
    return { status: 'success', latency }
  } catch (error: unknown) {
    const latency = Math.round(performance.now() - start)
    return buildFailedHealthCheckResult(error, latency)
  } finally {
    clear()
  }
}

/** 多密钥聚合后的模型检查结果。 */
interface AggregatedKeyResult {
  /** 最终模型状态。 */
  status: HealthModelStatus
  /** 第一条可展示的错误摘要。 */
  error?: I18nText
  /** 与第一条错误摘要对应的技术详情。 */
  errorDetail?: string
  /** 成功请求中的代表性延迟。 */
  latency?: number
  /** 密钥级成功/失败统计。 */
  keySummary: { total: number; success: number; failed: number }
}

/**
 * 聚合单模型下多个密钥的检查结果。
 *
 * 说明：
 * - 只保留第一条错误作为摘要，避免在 SW 侧拼接不可国际化的长字符串；
 * - 成功延迟采用最小值，表达“该模型在当前密钥集合里的最佳可用表现”。
 */
function aggregateKeyResults(results: KeyCheckResult[]): AggregatedKeyResult {
  const success = results.filter((r) => r.status === 'success')
  const failed = results.filter((r) => r.status === 'failed')

  const latency = success.length > 0 ? Math.min(...success.map((r) => r.latency ?? Infinity)) : undefined
  // 说明：保持 error 为 I18nText（不在 SW 侧拼接字符串）。
  // - 多个密钥失败时，这里仅选取第一个错误作为摘要，避免把多条错误“硬拼”成不可国际化的长字符串。
  // - UI 如需更强诊断，可按需扩展为透传 errors 列表并在前端渲染。
  const firstFailed = failed.find((r) => r.error)
  const firstError = firstFailed?.error
  const firstErrorDetail = firstFailed?.errorDetail

  const status: HealthModelStatus =
    failed.length === 0 ? 'ok' : success.length === 0 ? 'error' : 'partial'

  return {
    status,
    ...(firstError ? { error: firstError } : {}),
    ...(firstErrorDetail ? { errorDetail: firstErrorDetail } : {}),
    ...(latency !== undefined && Number.isFinite(latency) ? { latency } : {}),
    keySummary: { total: results.length, success: success.length, failed: failed.length },
  }
}

/**
 * 执行一次 Provider/模型健康检查，并将事件流写回指定 Port。
 *
 * 说明：
 * - 该函数仅负责“后台检测 + 事件回传”，不负责 UI 渲染；
 * - 错误以 I18nText 透传，保证可国际化与跨上下文序列化；
 * - 并发/超时策略由 payload 控制（并有上下限保护）。
 */
export async function runHealthCheckToPort({
  requestId,
  payload,
  port,
  signal,
}: {
  requestId: string
  payload: HealthCheckRequestPayload
  port: chrome.runtime.Port
  signal: AbortSignal
}) {
  const providerId = String(payload.providerId || '').trim()
  if (!providerId) {
    safePostMessage(port, { type: 'health/error', requestId, error: i18nText('errors.providerIdRequired') } satisfies HealthCheckEvent)
    return
  }

  const provider = await getProviderView(providerId)
  if (!provider) {
    safePostMessage(port, { type: 'health/error', requestId, error: i18nText('errors.providerNotFound', { providerId }) } satisfies HealthCheckEvent)
    return
  }
  if (!provider.enabled) {
    safePostMessage(port, { type: 'health/error', requestId, error: i18nText('errors.providerDisabled', { providerName: provider.name }) } satisfies HealthCheckEvent)
    return
  }

  const modelIds = Array.isArray(payload.modelIds) ? payload.modelIds.map((x) => String(x || '').trim()).filter(Boolean) : []
  if (modelIds.length === 0) {
    safePostMessage(port, { type: 'health/error', requestId, error: i18nText('errors.healthCheckNoModels') } satisfies HealthCheckEvent)
    return
  }

  const models: ProviderModelConfig[] = []
  for (const modelId of modelIds) {
    const matchedModel = provider.models?.find((model) => model.id === modelId) ?? null
    if (!matchedModel) {
      safePostMessage(port, {
        type: 'health/model',
        requestId,
        payload: {
          modelId,
          status: 'error',
          error: i18nText('errors.modelNotFound', { modelId }),
          keySummary: { total: 0, success: 0, failed: 0 },
        },
      } satisfies HealthCheckEvent)
      continue
    }
    models.push(matchedModel)
  }

  const modelsToCheck: ResolvedHealthModel[] = await Promise.all(
    models.map(async (model) => ({
      model,
      meta: await resolveModelMeta({
        providerType: provider.type,
        providerId: provider.id,
        apiHost: provider.apiHost,
        rawModelId: model.id,
        rawModelName: model.name || model.id,
      }),
    })),
  )
  if (modelsToCheck.length === 0) {
    safePostMessage(port, { type: 'health/done', requestId } satisfies HealthCheckEvent)
    return
  }

  const allKeys = splitApiKeys(provider.apiKey)
  const keys = allKeys.length > 0 ? allKeys : ['']
  const keyCheckMode: HealthCheckKeyMode = payload.keyCheckMode === 'single' ? 'single' : 'all'
  const keysToUse = pickKeysToUse(keys, keyCheckMode, payload.selectedKeyIndex)
  const timeoutMs = typeof payload.timeoutMs === 'number' && Number.isFinite(payload.timeoutMs) ? payload.timeoutMs : 15_000

  /**
   * 检查单个模型，并把聚合结果写回 Port。
   *
   * 说明：
   * - 每个模型内部始终按“多密钥”维度聚合；
   * - 无论单个密钥成功还是失败，都会尽量产出一条 `health/model` 事件。
   */
  const checkOneModel = async (resolvedModel: ResolvedHealthModel, _index: number) => {
    if (signal.aborted) return

    const perKeyResults = await Promise.allSettled(
      keysToUse.map(async (key) =>
        checkOneKey({ provider, resolvedModel, apiKey: key, timeoutMs, signal }),
      ),
    )

    const results: KeyCheckResult[] = perKeyResults.map((r) => {
      if (r.status === 'fulfilled') return r.value
      return buildFailedHealthCheckResult(r.reason)
    })

    const analysis = aggregateKeyResults(results)
    safePostMessage(port, {
      type: 'health/model',
      requestId,
      payload: {
        modelId: resolvedModel.model.id,
        status: analysis.status,
        ...(analysis.latency !== undefined ? { latency: analysis.latency } : {}),
        ...(analysis.error ? { error: analysis.error } : {}),
        ...(analysis.errorDetail ? { errorDetail: analysis.errorDetail } : {}),
        keySummary: analysis.keySummary,
      },
    } satisfies HealthCheckEvent)
  }

  try {
    if (payload.isConcurrent) {
      await Promise.allSettled(modelsToCheck.map((m, i) => checkOneModel(m, i)))
    } else {
      // 说明：串行执行用于避免某些平台对并发请求较敏感（限流/连接数上限/网关排队）。
      /**
       * 串行递归执行模型检查。
       *
       * @param idx - 当前待检查模型索引。
       */
      const runSequential = async (idx: number): Promise<void> => {
        if (signal.aborted) return
        const resolvedModel = modelsToCheck[idx]
        if (!resolvedModel) return
        await checkOneModel(resolvedModel, idx)
        await runSequential(idx + 1)
      }
      await runSequential(0)
    }
    safePostMessage(port, { type: 'health/done', requestId } satisfies HealthCheckEvent)
  } catch (error: unknown) {
    if (!signal.aborted) {
      const failed = buildFailedHealthCheckResult(error)
      safePostMessage(port, {
        type: 'health/error',
        requestId,
        error: failed.error ?? i18nText('common.error'),
        ...(failed.errorDetail ? { errorDetail: failed.errorDetail } : {}),
      } satisfies HealthCheckEvent)
    } else {
      safePostMessage(port, { type: 'health/done', requestId } satisfies HealthCheckEvent)
    }
  }
}
