/**
 * 说明：`api-keys` AI 能力模块。
 *
 * 职责：
 * - 承载 `api-keys` 相关的当前文件实现与模块边界；
 * - 对外暴露 `parseApiKeyInput`、`splitApiKeys`、`pickFirstApiKey`、`selectRotatedApiKeyForProvider` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理通用 `provider.apiKey` 字符串语义；
 * - 轮询状态只保存 provider 级下标，不保存原始 API Key 副本，避免 secret 域外泄。
 */
import { readProviderApiKeyRotationState, writeProviderApiKeyRotationState } from './api-key-rotation-state'

export {
  normalizeProviderApiKeyRotationState,
  type ProviderApiKeyRotationState,
} from './api-key-rotation-schema'

/**
 * 说明：API 密钥工具：
 * - 支持逗号/换行/分号分隔的多密钥
 * - 按 Cherry Studio 风格在每次真实调用前选择一个密钥
 *
 * 轮询状态是可重建缓存，只保存 `{ providerId: lastIndex }`。清空缓存或状态损坏时，
 * 下一次调用会从第一个 key 重新开始；失败后不会自动改用下一个 key 重放同一次请求。
 */

const rotationLocks = new Map<string, Promise<unknown>>()
const HTTP_URL_RE = /^https?:\/\//i
const PROTOCOL_RELATIVE_URL_RE = /^\/\/[^/\s]+/i
const HOST_WITH_PATH_RE = /^(?:(?:localhost)|(?:\d{1,3}(?:\.\d{1,3}){3})|(?:(?:[a-z0-9-]+\.)+[a-z]{2,}))(?::\d+)?[/?#].*/i
const HOST_WITH_PORT_RE = /^(?:(?:localhost)|(?:\d{1,3}(?:\.\d{1,3}){3})|(?:(?:[a-z0-9-]+\.)+[a-z]{2,})):\d+(?:[/?#].*)?$/i

/** API Key 输入解析结果。 */
export interface ParsedApiKeyInput {
  /** 可用于鉴权的有效 API Key，已按原始顺序去重。 */
  readonly keys: string[]
  /** 被拒绝的片段，通常是误粘贴的 API 地址或 endpoint。 */
  readonly rejected: string[]
}

/** 清理单个 API Key 片段里的空白、首尾引号和误粘贴的 Bearer 前缀。 */
function normalizeApiKeyFragment(raw: string): string {
  const withoutOuterQuotes = String(raw || '').trim().replace(/^['"]|['"]$/g, '').trim()
  return withoutOuterQuotes
    .replace(/^bearer\s+/i, '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .trim()
}

/**
 * 判断单个片段是否明显是 URL / endpoint，而不是 API Key。
 *
 * 说明：
 * - 这里只拒绝确定错误的地址形态，不按具体厂商的 key 正则猜测；
 * - 裸域名不直接拒绝，避免误伤 JWT 一类包含点号的合法 token；
 * - 带协议、协议相对地址、host + path、host + port 都属于常见误填 endpoint。
 */
function isUrlLikeApiKeyFragment(value: string): boolean {
  const normalized = String(value || '').trim()
  if (!normalized) return false
  if (HTTP_URL_RE.test(normalized)) return true
  if (PROTOCOL_RELATIVE_URL_RE.test(normalized)) return true
  if (HOST_WITH_PATH_RE.test(normalized)) return true
  if (HOST_WITH_PORT_RE.test(normalized)) return true
  return false
}

/**
 * 解析用户输入的 API Key 字符串，同时返回被拒绝的 URL-like 片段。
 *
 * @param raw - 用户存储或输入的 `provider.apiKey` 字符串。
 * @returns 有效 key 与拒绝片段；调用方可用 `rejected` 给 UI 明确提示。
 */
export function parseApiKeyInput(raw: string): ParsedApiKeyInput {
  const keys: string[] = []
  const rejected: string[] = []
  for (const fragment of String(raw || '').split(/[\n,;]+/g)) {
    const normalized = normalizeApiKeyFragment(fragment)
    if (!normalized) continue
    if (isUrlLikeApiKeyFragment(normalized)) {
      rejected.push(normalized)
      continue
    }
    keys.push(normalized)
  }
  return {
    keys: uniqKeepOrder(keys),
    rejected: uniqKeepOrder(rejected),
  }
}

/**
 * 从用户输入的 API Key 字符串中拆出有效 key。
 *
 * @param raw - 用户存储的 `provider.apiKey` 字符串。
 * @returns 已裁剪空白、清理 `Bearer` 前缀和首尾引号，并按原始顺序去重的 key 列表。
 */
export function splitApiKeys(raw: string): string[] {
  return parseApiKeyInput(raw).keys
}

/**
 * 在保留原始顺序的前提下去重 API Key 列表。
 *
 * 说明：
 * - 多 Key 轮询场景下顺序本身具有语义，不能像普通集合一样无序化；
 * - 同时会顺手裁剪空白并丢弃空字符串，避免把无效 key 写回存储。
 */
function uniqKeepOrder(items: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of items) {
    const s = String(raw || '').trim()
    if (!s) continue
    if (seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  return out
}

/**
 * 将输入 key 字符串规范化为“去重、逗号分隔”的格式。
 *
 * @param raw - 原始 key 字符串。
 * @returns 可落库的标准多 key 字符串。
 */
export function normalizeApiKeyString(raw: string): string {
  return splitApiKeys(raw).join(',')
}

/**
 * 从候选 API Key 字符串中提取第一条有效 key。
 *
 * @param raw - 原始 key 字符串。
 * @returns 第一条有效 key；没有可用 key 时返回空字符串。
 */
export function pickFirstApiKey(raw: string): string {
  return splitApiKeys(raw)[0] ?? ''
}

/**
 * 在同一运行时内串行化单个 provider 的轮询状态读写。
 *
 * 说明：
 * - `chrome.storage.local` 没有 compare-and-swap；
 * - 多模型并发发送时，如果完全并行读写同一个游标，多个请求可能拿到同一 key；
 * - 这里仅在当前 JS runtime 内做轻量队列，Service Worker 重启或多宿主竞争时仍以 cache 语义处理。
 *
 * @param providerId - Provider ID。
 * @param run - 需要串行执行的轮询读写任务。
 * @returns `run` 的返回值。
 */
async function withProviderRotationLock<T>(providerId: string, run: () => Promise<T>): Promise<T> {
  const key = providerId || '__unknown__'
  const previous = rotationLocks.get(key) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  const tail = previous.then(() => current, () => current)
  rotationLocks.set(key, tail)
  try {
    await previous.catch(() => undefined)
    return await run()
  } finally {
    release()
    if (rotationLocks.get(key) === tail) {
      rotationLocks.delete(key)
    }
  }
}

/**
 * 按 provider 的轮询游标选择本次真实调用使用的 API Key。
 *
 * @param providerId - ProviderConfig.id；空值时不持久化游标，直接返回第一条 key。
 * @param raw - ProviderConfig.apiKey 原始字符串。
 * @returns 本次调用应使用的单个 API Key。
 */
export async function selectRotatedApiKeyForProvider(providerId: string, raw: string): Promise<string> {
  const id = String(providerId || '').trim()
  const keys = splitApiKeys(raw)
  if (keys.length === 0) return ''
  if (keys.length === 1) return keys[0]!
  if (!id) return keys[0]!

  return await withProviderRotationLock(id, async () => {
    const state = await readProviderApiKeyRotationState()
    const previous = state[id]
    const current = typeof previous === 'number' && previous >= 0 && previous < keys.length ? previous : -1
    const next = (current + 1) % keys.length
    await writeProviderApiKeyRotationState({
      ...state,
      [id]: next,
    })
    return keys[next]!
  })
}
