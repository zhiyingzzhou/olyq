/**
 * 说明：`index` 记忆模块。
 *
 * 职责：
 * - 承载 `index` 相关的当前文件实现与模块边界；
 * - 对外暴露 `listMemories`、`addMemory`、`updateMemory` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 全局记忆（Memory）模块门面。
 *
 * 结构：
 * - `memory-store`：记忆记录的持久化读写；
 * - `memory-search`：向量归一化与相似度检索；
 * - `memory-settings/types`：配置与类型定义。
 *
 * 本文件提供两类能力：
 * 1) 重新导出底层能力，供高级用法直接调用；
 * 2) 提供面向业务的便捷 API（list/add/update/get/delete）与 chat 参数构建 helper。
 */

export { clearAllMemories, countMemories, deleteMemoryRecord, getMemoryRecord, listMemoryRecords, putMemoryRecord } from './memory-store';
export { UNIFIED_EMBEDDING_DIMENSION, l2NormalizeEmbedding, searchMemoriesByVector, toUnifiedFloat32Embedding } from './memory-search';
export { DEFAULT_MEMORY_CONFIG } from './types';
export type { GlobalMemoryConfig, MemoryEntity, MemoryItem, MemoryRecord } from './types';
export { getMemoryConfig, isMemoryConfigured, loadMemoryConfig, saveMemoryConfig, subscribeMemoryConfigChange } from './memory-settings';

import { createId } from '@/lib/utils/id';
import type { GlobalMemoryConfig, MemoryItem, MemoryRecord } from './types';
import { deleteMemoryRecord, getMemoryRecord, listMemoryRecords, putMemoryRecord } from './memory-store';
import { l2NormalizeEmbedding, toUnifiedFloat32Embedding } from './memory-search';

/**
 * 把底层存储记录投影成面向业务层的 MemoryItem。
 *
 * 说明：
 * - 会保留 UI 和检索逻辑真正需要的公开字段；
 * - 底层 embedding、userId 等内部字段不会暴露给上层列表视图。
 */
function toItem(r: MemoryRecord): MemoryItem {
  return {
    id: r.id,
    memory: r.memory,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    ...(r.metadata ? { metadata: r.metadata } : {}),
  };
}

/**
 * 列出记忆条目（按底层存储的排序规则返回）。
 *
 * @param params - 查询参数对象。
 *
 * @remarks
 * - `params.userId`：用户标识，用于多用户隔离。
 * - `params.assistantId`：可选，按 assistant 维度过滤。
 * - `params.limit`：可选，分页大小。
 * - `params.offset`：可选，分页偏移。
 */
export async function listMemories(params: { userId: string; assistantId?: string; limit?: number; offset?: number }): Promise<MemoryItem[]> {
  const records = await listMemoryRecords(params);
  return records.map(toItem);
}

/**
 * 新增一条记忆（会将 embedding 统一为 float32 并做 L2 归一化）。
 *
 * @returns 新增后的 MemoryItem（便于 UI 直接插入列表）
 */
export async function addMemory(params: {
  userId: string;
  assistantId?: string;
  memory: string;
  embedding: number[] | Float32Array;
  metadata?: Record<string, unknown>;
}): Promise<MemoryItem> {
  const now = Date.now();
  const memory = String(params.memory || '').trim();
  if (!memory) throw new Error('memory must not be empty');
  const record: MemoryRecord = {
    id: createId(),
    userId: String(params.userId || '').trim() || 'default-user',
    assistantId: typeof params.assistantId === 'string' ? params.assistantId.trim() || undefined : undefined,
    memory,
    embedding: l2NormalizeEmbedding(toUnifiedFloat32Embedding(params.embedding)),
    metadata: params.metadata,
    createdAt: now,
    updatedAt: now,
  };
  await putMemoryRecord(record);
  return toItem(record);
}

/**
 * 更新一条记忆（按 id 查找，存在则覆盖 memory/embedding/metadata）。
 *
 * 说明：embedding 会重新归一化；metadata 若未提供则沿用旧值。
 *
 * @returns 更新后的 MemoryItem；若记录不存在返回 null
 */
export async function updateMemory(params: {
  id: string;
  memory: string;
  embedding: number[] | Float32Array;
  metadata?: Record<string, unknown>;
}): Promise<MemoryItem | null> {
  const existing = await getMemoryRecord(params.id);
  if (!existing) return null;
  const memory = String(params.memory || '').trim();
  if (!memory) throw new Error('memory must not be empty');
  const updated: MemoryRecord = {
    ...existing,
    memory,
    embedding: l2NormalizeEmbedding(toUnifiedFloat32Embedding(params.embedding)),
    metadata: params.metadata ?? existing.metadata,
    updatedAt: Date.now(),
  };
  await putMemoryRecord(updated);
  return toItem(updated);
}

/** 删除一条记忆（按 id）。 */
export async function deleteMemory(id: string): Promise<void> {
  await deleteMemoryRecord(id);
}

/** 获取一条记忆（按 id）。 */
export async function getMemory(id: string): Promise<MemoryItem | null> {
  const r = await getMemoryRecord(id);
  return r ? toItem(r) : null;
}

/**
 * 构建与 ChatStream 协议一致的 memory 参数（用于“是否启用记忆”与模型选择）。
 *
 * 规则：
 * - 需要同时满足：全局启用 + assistant 允许 + embeddingModel/llmModel 已配置；
 * - userId 默认回退到 `default-user`，避免空值导致存储/检索维度错乱。
 */
export function buildMemoryChatParams(params: {
  assistantEnableMemory?: boolean;
  assistantId?: string;
  userId?: string;
  config: GlobalMemoryConfig;
}) {
  const cfg = params.config;
  const userId = String(params.userId || '').trim() || 'default-user';
  const assistantId = typeof params.assistantId === 'string' ? params.assistantId.trim() || undefined : undefined;
  const assistantEnableMemory = Boolean(params.assistantEnableMemory);
  const enabled = Boolean(cfg.enabled && assistantEnableMemory && cfg.embeddingModel && cfg.llmModel);
  return {
    enabled,
    userId,
    assistantId,
    embeddingModel: cfg.embeddingModel,
    llmModel: cfg.llmModel,
    rerankModel: cfg.rerankModel,
    topK: cfg.topK,
  };
}
