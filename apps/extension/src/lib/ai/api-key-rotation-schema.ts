/**
 * 说明：Provider API Key 轮询状态 schema 模块。
 *
 * 职责：
 * - 定义 `providerId -> lastIndex` 轮询游标的 schema-only 归一化逻辑；
 * - 供运行时轮询 helper 与 Data Contract Registry 共同复用；
 * - 保证 registry 不 import 会读写 storage 的运行时模块。
 *
 * 边界：
 * - 本模块不读写 storage，不接触 ProviderConfig，不保存或解析真实 API Key；
 * - 轮询状态是可重建缓存，只能保存非负整数下标。
 */

/** Provider API Key 轮询游标状态。 */
export type ProviderApiKeyRotationState = Record<string, number>

/**
 * 规整 API Key 轮询状态。
 *
 * @param raw - 未信任的 storage 值。
 * @returns 只包含合法 providerId 与非负整数下标的状态。
 */
export function normalizeProviderApiKeyRotationState(raw: unknown): ProviderApiKeyRotationState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: ProviderApiKeyRotationState = {}
  for (const [rawProviderId, rawIndex] of Object.entries(raw)) {
    const providerId = String(rawProviderId || '').trim()
    if (!providerId) continue
    if (typeof rawIndex !== 'number' || !Number.isFinite(rawIndex)) continue
    const index = Math.floor(rawIndex)
    if (index < 0) continue
    out[providerId] = index
  }
  return out
}
