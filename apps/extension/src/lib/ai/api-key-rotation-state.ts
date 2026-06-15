/**
 * 说明：Provider API Key 轮询状态存储 helper。
 *
 * 职责：
 * - 作为 `olyq.provider-api-key-rotation.v1` 的唯一读写域级 helper；
 * - 把底层 JSON storage 访问从业务轮询逻辑中隔离出来；
 * - 始终通过 schema normalizer 过滤非法 providerId 和非下标值。
 *
 * 边界：
 * - 本模块只保存 providerId 到 lastIndex 的映射，不接触真实 API Key；
 * - 轮询状态是可重建 cache，不进入备份或云同步。
 */
import { readStoredJson, writeStoredJson } from '@/lib/storage/json-storage'
import {
  normalizeProviderApiKeyRotationState,
  type ProviderApiKeyRotationState,
} from './api-key-rotation-schema'
import { PROVIDER_API_KEY_ROTATION_STATE_STORAGE_KEY } from './storage-keys'

/**
 * 读取 Provider API Key 轮询游标状态。
 *
 * @returns 规整后的 providerId 到 lastIndex 映射。
 */
export async function readProviderApiKeyRotationState(): Promise<ProviderApiKeyRotationState> {
  return await readStoredJson<ProviderApiKeyRotationState>(
    PROVIDER_API_KEY_ROTATION_STATE_STORAGE_KEY,
    {},
    normalizeProviderApiKeyRotationState,
  )
}

/**
 * 写入 Provider API Key 轮询游标状态。
 *
 * @param state - 已在调用方合并好的完整轮询状态。
 */
export async function writeProviderApiKeyRotationState(state: ProviderApiKeyRotationState): Promise<void> {
  await writeStoredJson(PROVIDER_API_KEY_ROTATION_STATE_STORAGE_KEY, normalizeProviderApiKeyRotationState(state))
}
