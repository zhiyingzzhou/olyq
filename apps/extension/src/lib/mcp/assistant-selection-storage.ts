/**
 * 说明：`assistant-selection-storage` 基础能力模块。
 *
 * 职责：
 * - 承载 `assistant-selection-storage` 相关的当前文件实现与模块边界；
 * - 对外暴露 `resolveAssistantMcpSelection` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { Assistant } from '@/types/assistant';
import type { McpServerSelection } from '@/lib/mcp/selection';
import {
  createAutoMcpServerSelection,
  sanitizeMcpServerSelection,
} from '@/lib/mcp/selection';

/**
 * 解析助手最终使用的 MCP 服务器选择配置。
 *
 * @param assistant - 助手配置；为空时回退到自动选择。
 * @returns 经过清洗后的 MCP 服务器选择结果。
 */
export function resolveAssistantMcpSelection(assistant: Assistant | null | undefined): McpServerSelection {
  return assistant?.mcpSelection
    ? sanitizeMcpServerSelection(assistant.mcpSelection, 'auto')
    : createAutoMcpServerSelection();
}
