/**
 * 说明：`openai-responses-store-capability` AI 能力模块。
 *
 * 职责：
 * - 承载 OpenAI Responses `store` 稳定化能力缓存；
 * - 记录哪些 provider/model/endpoint 组合已经确认“不支持持久化 tool items”；
 * - 为运行时首步参数构建提供稳定、可持久化的判定输入。
 *
 * 边界：
 * - 本文件只维护“是否已知不支持 `store`”这一份轻量状态；
 * - 不承担 provider 配置编辑、模型 registry 或 UI 暴露职责。
 */

import { readStoredJson, writeStoredJson } from '@/lib/storage/json-storage'

const OPENAI_RESPONSES_STORE_CAPABILITY_STORAGE_KEY = 'olyq.openai-responses-store-capability.v1'
const DEFAULT_API_HOST_SENTINEL = '__default_api_host__'

type UnsupportedOpenAiResponsesStoreTargets = Record<string, number>

/** OpenAI Responses `store` 稳定化判定所需的最小上下文。 */
export interface OpenAiResponsesStoreCapabilityContext {
  /** Provider ID。 */
  providerId: string
  /** 原始 modelId。 */
  modelId: string
  /** 当前实际生效的 ProviderType。 */
  effectiveProviderType?: string
  /** 当前模型 transport。 */
  transportProtocol?: string
  /** 当前 provider 的 API Host。 */
  apiHost?: string
}

/**
 * 归一化 API Host，保证同一端点能命中同一份稳定缓存。
 *
 * 说明：
 * - 这里只做最小归一化：trim + 去尾部 `/`；
 * - 不重写 path 或 query，避免把不同网关路径错误折叠成同一个端点。
 */
function normalizeApiHost(apiHost: string | undefined): string {
  const normalized = String(apiHost || '').trim().replace(/\/+$/, '')
  return normalized || DEFAULT_API_HOST_SENTINEL
}

/**
 * 校验并归一化持久化的“不支持 store”目标表。
 *
 * 说明：
 * - value 只接受有限数字时间戳；
 * - 非法结构直接被丢弃，避免坏数据继续污染运行时判定。
 */
function parseUnsupportedTargets(raw: unknown): UnsupportedOpenAiResponsesStoreTargets {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: UnsupportedOpenAiResponsesStoreTargets = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    out[String(key)] = value
  }
  return out
}

/**
 * 为当前 provider/model/endpoint 组合构建稳定缓存键。
 *
 * 说明：
 * - 组合维度显式包含 providerId、modelId、effectiveProviderType、transportProtocol 与 apiHost；
 * - 这样即使同一个 provider 指向不同网关路径，或同一网关下不同模型分流，也不会互相污染。
 */
export function buildOpenAiResponsesStoreCapabilityKey(
  ctx: OpenAiResponsesStoreCapabilityContext,
): string {
  return JSON.stringify({
    providerId: String(ctx.providerId || '').trim(),
    modelId: String(ctx.modelId || '').trim(),
    effectiveProviderType: String(ctx.effectiveProviderType || '').trim(),
    transportProtocol: String(ctx.transportProtocol || '').trim(),
    apiHost: normalizeApiHost(ctx.apiHost),
  })
}

/**
 * 读取当前目标是否已经确认“不支持 OpenAI Responses `store`”。
 */
export async function isKnownUnsupportedOpenAiResponsesStoreTarget(
  ctx: OpenAiResponsesStoreCapabilityContext,
): Promise<boolean> {
  const targets = await readStoredJson<UnsupportedOpenAiResponsesStoreTargets>(
    OPENAI_RESPONSES_STORE_CAPABILITY_STORAGE_KEY,
    {},
    parseUnsupportedTargets,
  )
  return Object.prototype.hasOwnProperty.call(
    targets,
    buildOpenAiResponsesStoreCapabilityKey(ctx),
  )
}

/**
 * 将当前目标标记为“不支持 OpenAI Responses `store`”。
 *
 * 说明：
 * - 只在真实观测到 `response.created.store=false` 时调用；
 * - 已有记录时不重复写入，避免无意义刷新共享存储。
 */
export async function rememberUnsupportedOpenAiResponsesStoreTarget(
  ctx: OpenAiResponsesStoreCapabilityContext,
): Promise<void> {
  const targets = await readStoredJson<UnsupportedOpenAiResponsesStoreTargets>(
    OPENAI_RESPONSES_STORE_CAPABILITY_STORAGE_KEY,
    {},
    parseUnsupportedTargets,
  )
  const key = buildOpenAiResponsesStoreCapabilityKey(ctx)
  if (Object.prototype.hasOwnProperty.call(targets, key)) return
  await writeStoredJson(OPENAI_RESPONSES_STORE_CAPABILITY_STORAGE_KEY, {
    ...targets,
    [key]: Date.now(),
  })
}
