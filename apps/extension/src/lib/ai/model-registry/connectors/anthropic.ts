/**
 * 说明：`anthropic` AI 能力模块。
 *
 * 职责：
 * - 承载 `anthropic` 相关的当前文件实现与模块边界；
 * - 对外暴露 `anthropicConnector` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { createOpenAiCompatibleThinConnector } from './openai-compatible-thin'

/** Anthropic 目录连接器。 */
export const anthropicConnector = createOpenAiCompatibleThinConnector('anthropic', ['anthropic', 'vertex-anthropic'])
