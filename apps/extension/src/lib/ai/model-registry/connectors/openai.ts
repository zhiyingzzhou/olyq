/**
 * 说明：`openai` AI 能力模块。
 *
 * 职责：
 * - 承载 `openai` 相关的当前文件实现与模块边界；
 * - 对外暴露 `openaiConnector` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { createOpenAiCompatibleThinConnector } from './openai-compatible-thin'

/** OpenAI / OpenAI-compatible 目录连接器。 */
export const openaiConnector = createOpenAiCompatibleThinConnector('openai', ['openai', 'openai-response', 'azure-openai', 'deepseek', 'mistral', 'xai'])
