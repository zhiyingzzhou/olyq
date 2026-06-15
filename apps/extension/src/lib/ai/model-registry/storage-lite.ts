/**
 * 说明：`storage-lite` AI 能力模块。
 *
 * 职责：
 * - 承载 `storage-lite` 相关的当前文件实现与模块边界；
 * - 对外暴露 `coerceModelRegistryStateLite`、`loadModelRegistryFast` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { MODEL_REGISTRY_STORAGE_KEY } from '../storage-keys'
import { getStorageAdapter } from '@/lib/storage/storage-adapter'

import { createEmptyModelRegistry } from './state'
import type { ModelRegistryState } from './types'

/**
 * 内部函数：`isPlainRecord`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 内部函数：`readString`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/**
 * 内部函数：`readRecord`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function readRecord<T>(value: unknown): Record<string, T> {
  return isPlainRecord(value) ? (value as Record<string, T>) : {}
}

/**
 * 对 registry 快照做轻量结构收敛。
 *
 * 说明：
 * - 只保证 preview / 运行时读取需要的顶层结构稳定；
 * - 不在这里做深度 schema 校验，避免把 zod 校验链卷进热路径；
 * - 任何真正落盘前的强约束仍由 `storage.ts` 里的重校验负责。
 */
export function coerceModelRegistryStateLite(raw: unknown): ModelRegistryState {
  if (!isPlainRecord(raw) || raw.schema !== 2) return createEmptyModelRegistry()

  return {
    schema: 2,
    generatedAt: readString(raw.generatedAt) ?? new Date(0).toISOString(),
    ...(readString(raw.openrouterLastSyncAt) ? { openrouterLastSyncAt: readString(raw.openrouterLastSyncAt) } : {}),
    canonicalModels: readRecord(raw.canonicalModels),
    aliasIndex: readRecord(raw.aliasIndex),
    providerModelMap: readRecord(raw.providerModelMap),
    providerScopedModels: readRecord(raw.providerScopedModels),
    syncMeta: readRecord(raw.syncMeta),
  }
}

/** 从存储中读取模型注册表的轻量快照。 */
export async function loadModelRegistryFast(): Promise<ModelRegistryState> {
  const raw = await getStorageAdapter().get([MODEL_REGISTRY_STORAGE_KEY])
  const value = raw[MODEL_REGISTRY_STORAGE_KEY]
  if (!value) return createEmptyModelRegistry()
  return coerceModelRegistryStateLite(value)
}
