/**
 * 说明：`background-refresh` AI 能力模块。
 *
 * 职责：
 * - 承载 `background-refresh` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ModelRegistryRefreshReason`、`refreshModelRegistryInBackground` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { ModelRegistryState } from './types'
import { buildModelRegistryPreviewWithProviders } from './sync-preview-core'
import { refreshModelRegistryInBackground as refreshInRuntime } from './sync'

const IS_E2E = import.meta.env.VITE_OLYQ_E2E === '1'

/** 导出类型：`ModelRegistryRefreshReason`。 */
export type ModelRegistryRefreshReason =
  | 'onInstalled'
  | 'swIdle'
  | 'modelOptions'
  | 'modelManager'

/**
 * 导出函数：`refreshModelRegistryInBackground`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function refreshModelRegistryInBackground(
  reason: ModelRegistryRefreshReason,
  options?: {
    force?: boolean
    signal?: AbortSignal
  },
): Promise<ModelRegistryState> {
  // 说明：mock E2E 只需要一份可预测的本地 registry preview。
  // 这里直接切断外网目录刷新，避免测试被 OpenRouter 抓取、失败退避和冷启动抖动拖慢或打乱。
  if (IS_E2E) {
    return await buildModelRegistryPreviewWithProviders()
  }

  return await refreshInRuntime(reason, options)
}
