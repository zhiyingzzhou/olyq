/**
 * 说明：`storage` 基础能力模块。
 *
 * 职责：
 * - 承载 remote-only MCP 的持久化入口；
 * - 保存全局设置、server 列表与工具审计日志；
 * - 不再保存任何 bridge / stdio token / browser sync 配置。
 *
 * 边界：
 * - OAuth token cache 单独放在专用模块；
 * - 本文件只处理当前模块职责，不在这里扩散无关编排。
 */

import type { McpAuditRecord, McpServerConfig, McpSettingsConfig } from '@/types/mcp';
import { MCP_AUDIT_STORAGE_KEY, MCP_SERVERS_STORAGE_KEY, MCP_SETTINGS_STORAGE_KEY } from '@/lib/mcp/constants';
import { logger } from '@/lib/logger';
import { getStorageAdapter } from '@/lib/storage/storage-adapter';
import { isRecord } from '@/lib/utils/type-guards';
import {
  normalizeMcpServersForStorage,
  normalizeMcpSettingsConfig,
} from './storage-schema';

export {
  getDefaultMcpSettingsConfig,
  normalizeMcpServersForStorage,
  normalizeMcpSettingsConfig,
} from './storage-schema';

let auditAppendQueue: Promise<void> = Promise.resolve();
let serversWriteQueue: Promise<void> = Promise.resolve();
let settingsWriteQueue: Promise<void> = Promise.resolve();

/** 读取 MCP 全局设置。 */
export async function loadMcpSettingsConfig(): Promise<McpSettingsConfig> {
  const raw = await getStorageAdapter().get([MCP_SETTINGS_STORAGE_KEY]);
  return normalizeMcpSettingsConfig(raw[MCP_SETTINGS_STORAGE_KEY]);
}

/** 保存 MCP 全局设置。 */
export async function saveMcpSettingsConfig(next: McpSettingsConfig): Promise<void> {
  settingsWriteQueue = settingsWriteQueue
    .catch((error) => logger.mcp.error('settings write queue: previous step failed', error))
    .then(() => getStorageAdapter().set({ [MCP_SETTINGS_STORAGE_KEY]: next }));
  await settingsWriteQueue;
}

/** 读取 MCP Servers 列表时返回给 UI 的显式结果结构。 */
export type McpServersLoadResult =
  | { ok: true; data: McpServerConfig[] }
  | { ok: false; error: Error };

/** 从 storage 读取 MCP Servers 列表。 */
export async function loadMcpServers(): Promise<McpServerConfig[]> {
  const raw = await getStorageAdapter().get([MCP_SERVERS_STORAGE_KEY]);
  return normalizeMcpServersForStorage(raw[MCP_SERVERS_STORAGE_KEY]);
}

/** 读取 MCP Servers 并把异常包装成显式 Result。 */
export async function loadMcpServersResult(): Promise<McpServersLoadResult> {
  try {
    const data = await loadMcpServers();
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error ?? 'Unknown MCP storage error')),
    };
  }
}

/** 保存 MCP Servers 列表。 */
export async function saveMcpServers(next: McpServerConfig[]): Promise<void> {
  serversWriteQueue = serversWriteQueue
    .catch((error) => logger.mcp.error('servers write queue: previous step failed', error))
    .then(() => getStorageAdapter().set({ [MCP_SERVERS_STORAGE_KEY]: next }));
  await serversWriteQueue;
}

/** 读取 MCP 工具调用审计记录。 */
export async function loadMcpAudit(limit = 200): Promise<McpAuditRecord[]> {
  /** 把审计读取上限收口到稳定范围，避免异常参数拖垮 UI。 */
  const clamp = (value: number) => Math.max(1, Math.min(2000, value));
  const max = clamp(limit);

  const raw = await getStorageAdapter().get([MCP_AUDIT_STORAGE_KEY]);
  const value = raw[MCP_AUDIT_STORAGE_KEY];
  if (!Array.isArray(value)) return [];

  const entries = value
    .map((item) => (isRecord(item) ? item : null))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((record) => ({
      id: String(record.id || ''),
      at: typeof record.at === 'number' && Number.isFinite(record.at) ? record.at : 0,
      serverId: String(record.serverId || ''),
      tool: String(record.tool || ''),
      args: record.args as unknown,
      ok: Boolean(record.ok),
      durationMs: typeof record.durationMs === 'number' && Number.isFinite(record.durationMs) ? record.durationMs : 0,
      result: record.result as unknown,
      error: typeof record.error === 'string' ? record.error : undefined,
    }))
    .filter((item) => item.id && item.serverId && item.tool);

  return entries.slice(-max).reverse();
}

/** 追加一条审计记录。 */
export async function appendMcpAudit(record: McpAuditRecord, max = 200): Promise<void> {
  /** 把审计保留数量收口到稳定范围，避免写入无界增长。 */
  const clamp = (value: number) => Math.max(1, Math.min(2000, value));
  const limit = clamp(max);

  auditAppendQueue = auditAppendQueue
    .catch((error) => logger.mcp.error('audit append queue: previous step failed', error))
    .then(async () => {
      try {
        const current = await getStorageAdapter().get([MCP_AUDIT_STORAGE_KEY]);
        const entries = Array.isArray(current[MCP_AUDIT_STORAGE_KEY]) ? (current[MCP_AUDIT_STORAGE_KEY] as unknown[]) : [];
        const next = [...entries, record].slice(-limit);
        await getStorageAdapter().set({ [MCP_AUDIT_STORAGE_KEY]: next });
      } catch (error) {
        logger.mcp.error('audit append failed', error);
      }
    });

  await auditAppendQueue.catch((error) => logger.mcp.error('audit append queue: final step failed', error));
}
