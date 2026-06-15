/**
 * 说明：`fireworks` AI 能力模块。
 *
 * 职责：
 * - 承载 `fireworks` 相关的当前文件实现与模块边界；
 * - 对外暴露 `FIREWORKS_MODEL_RULES` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * Fireworks 规则。
 *
 * 对齐来源：
 * - Fireworks Serverless Availability 文档
 *
 * 说明：
 * - Fireworks 官方稳定文档更强调“模型是否可在 serverless 可用”，而不是完整语义矩阵；
 * - 因此这里刻意不补充大量 provider-specific 语义，只保留空规则表；
 * - 真正的 embedding / vision / reasoning 仍交给共享 fallback 与公共身份归并层处理。
 */

import type { ProviderModelRule } from '../types'

/**
 * 导出常量：`FIREWORKS_MODEL_RULES`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const FIREWORKS_MODEL_RULES: ReadonlyArray<ProviderModelRule> = []

