/**
 * 说明：`storage-schema` MCP 持久化契约模块。
 *
 * 职责：
 * - 定义 MCP 全局设置与 server 列表的当前 v1 规整逻辑；
 * - 为 MCP 存储模块、备份恢复、云同步和 Data Contract Registry 提供无副作用入口；
 * - 保持 remote-only MCP server schema 在一个地方收口。
 *
 * 边界：
 * - 本文件不读写 storage，不执行 MCP 网络请求；
 * - 审计日志与 OAuth token cache 不属于这里的配置契约。
 */
import type { McpServerConfig, McpSettingsConfig } from '@/types/mcp';
import { normalizeStoredMcpServer } from '@/lib/mcp/config';
import { isPlainRecord, isRecord } from '@/lib/utils/type-guards';

/** 返回 MCP 全局设置默认值。 */
export function getDefaultMcpSettingsConfig(): McpSettingsConfig {
  return {
    chatToolsEnabled: true,
  };
}

/**
 * 把任意输入规整为当前 MCP 全局设置 schema。
 *
 * @param value - 未信任的 storage / backup / sync 输入。
 * @returns 可直接写回 `olyq.mcp.settings.v1` 的当前结构。
 */
export function normalizeMcpSettingsConfig(value: unknown): McpSettingsConfig {
  if (isPlainRecord(value)) {
    return {
      chatToolsEnabled: typeof value.chatToolsEnabled === 'boolean' ? value.chatToolsEnabled : true,
    };
  }
  return getDefaultMcpSettingsConfig();
}

/**
 * 把任意输入规整为当前 MCP Server 列表 schema。
 *
 * @param value - 未信任的 storage / backup / sync 输入。
 * @returns 已过滤非法项的 remote-only MCP server 列表。
 */
export function normalizeMcpServersForStorage(value: unknown): McpServerConfig[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (isRecord(item) ? item : null))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((record) => normalizeStoredMcpServer(record))
    .filter((server): server is McpServerConfig => Boolean(server));
}
