/**
 * 说明：`siliconflow` AI 能力模块。
 *
 * 职责：
 * - 承载 `siliconflow` 相关的当前文件实现与模块边界；
 * - 对外暴露 `siliconflowConnector` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { createOpenAiCompatibleThinConnector } from './openai-compatible-thin'

/** SiliconFlow 目录连接器。 */
export const siliconflowConnector = createOpenAiCompatibleThinConnector('siliconflow', ['siliconflow'])
