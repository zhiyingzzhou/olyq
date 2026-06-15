/**
 * 说明：`McpPanelSectionHelpers` 工具模块。
 *
 * 职责：
 * - 承载 MCP 设置页分区组件共享的纯函数 helper；
 * - 让视图文件只导出 React 组件，避免 fast refresh guard 持续报警；
 * - 统一授权形状与 JSON 展示格式，避免各组件再各自拼接。
 */
import type { McpServerConfig, McpServerDraftConfig } from '@/types/mcp';

/**
 * 把 MCP 结果值格式化成可读 JSON。
 *
 * @param value - 工具结果或审计载荷。
 * @returns 优先格式化后的 JSON 文本，失败时回退字符串。
 */
export function formatMcpPanelJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? '');
  }
}

/**
 * 生成会影响授权缓存命名空间的最小形状。
 *
 * @param server - 已保存的 server 或编辑中的草稿。
 * @returns 只包含 URL 与 OAuth 配置的稳定比较串。
 */
export function buildMcpAuthorizationShape(server: McpServerConfig | McpServerDraftConfig): string {
  return JSON.stringify({
    url: server.url,
    oauth: server.oauth,
  });
}
