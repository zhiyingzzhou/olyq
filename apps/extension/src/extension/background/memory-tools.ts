/**
 * 说明：`memory-tools` 后台运行时模块。
 *
 * 职责：
 * - 承载 `memory-tools` 相关的当前文件实现与模块边界；
 * - 对外暴露 `getCachedRelevantMemories`、`clearCachedRelevantMemories`、`collectMemoryToolsForChat` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { jsonSchema, rerank, tool, type ToolSet } from 'ai';

import { resolveRerankModel } from '../../lib/ai/provider-runtime';
import { resolveEmbeddingExecutor } from '../../lib/ai/embedding-executor';
import { searchMemoriesByVector, toUnifiedFloat32Embedding, l2NormalizeEmbedding } from '../../lib/memory';
import type { MemoryItem } from '../../lib/memory/types';
import { clamp } from '../../lib/utils/math';
import type { ChatPipelineContext } from './pipeline-types';
import { runWithChatPipelineHeartbeat } from './chat-pipeline-activity';

/** 单次请求缓存下来的记忆检索结果。 */
type CachedSearch = {
  /** 写入缓存的时间戳，用于 TTL 清理与过期判断。 */
  at: number;
  /** 本次请求已检索出的相关记忆列表，供后续写记忆流程复用。 */
  results: MemoryItem[];
};
const cachedRelevantMemoriesByRequestId = new Map<string, CachedSearch>();

/** 清理过期的请求级记忆缓存。 */
function cleanupCache(now = Date.now()) {
  // 简单 TTL：避免 SW 长时间运行时泄漏（10 分钟）
  const ttl = 10 * 60_000;
  for (const [k, v] of cachedRelevantMemoriesByRequestId) {
    if (!v || typeof v.at !== 'number' || now - v.at > ttl) cachedRelevantMemoriesByRequestId.delete(k);
  }
}

/**
 * 获取某个请求（requestId）已缓存的相关记忆检索结果。
 *
 * 说明：
 * - 用于在同一次对话请求中复用记忆结果（避免重复 embedding + 向量检索）；
 * - 带简单 TTL 清理，防止 SW 长时间运行导致内存泄漏。
 */
export function getCachedRelevantMemories(requestId: string): MemoryItem[] {
  cleanupCache();
  const key = String(requestId || '').trim();
  if (!key) return [];
  return cachedRelevantMemoriesByRequestId.get(key)?.results ?? [];
}

/**
 * 清理某个请求（requestId）的缓存记忆结果。
 *
 * @param requestId - 与聊天请求绑定的 requestId
 */
export function clearCachedRelevantMemories(requestId: string) {
  const key = String(requestId || '').trim();
  if (!key) return;
  cachedRelevantMemoriesByRequestId.delete(key);
}

/**
 * 为聊天流水线收集“全局记忆（Memory）”相关的工具集合。
 *
 * 返回 undefined 表示不启用（例如未开启/未配置 embedding 或 llm 模型）。
 */
export async function collectMemoryToolsForChat(ctx: Pick<ChatPipelineContext, 'requestId' | 'params' | 'signal' | 'emitProgress'>): Promise<ToolSet | undefined> {
  const mem = ctx.params.memory;
  if (!mem?.enabled) return undefined;
  if (!mem.embeddingModel) return undefined;
  if (!mem.llmModel) return undefined;

  const tools: ToolSet = {};

  tools['builtin__memory_search'] = tool({
    description: [
      '在本地全局记忆中检索与 query 最相关的“用户长期信息/偏好/约束”。',
      '当你需要引用用户的个人信息来回答（例如：姓名、偏好、长期目标、固定限制、常用环境等）时，应先调用本工具再回答；',
      '如果当前问题与用户个人信息无关，请不要调用（避免无谓检索）。',
      '返回结果为按相关度排序的记忆条目列表。',
    ].join('\n'),
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        query: { type: 'string', description: '要检索的查询文本' },
        limit: { type: 'number', minimum: 1, maximum: 20, description: '返回条数上限（可选）' },
      },
      required: ['query'],
    }),
    execute: async (input) => {
      // 说明：工具执行阶段才真正做 embedding/检索，避免“仅注入工具”就提前消耗资源。
      const query = String((input as { query?: unknown }).query || '').trim();
      if (!query) return [];

      return await runWithChatPipelineHeartbeat(ctx, 'memory-tool-execution', async () => {
        const userId = String(mem.userId || '').trim() || 'default-user';
        const limitRaw = Number((input as { limit?: unknown }).limit ?? mem.topK ?? 5);
        const limit = clamp(limitRaw, 1, 20);

        const embeddingExecutor = await resolveEmbeddingExecutor({ model: mem.embeddingModel! });
        const vec = await embeddingExecutor.execute([{ type: 'text', text: query }]);
        const q = l2NormalizeEmbedding(toUnifiedFloat32Embedding(vec));

        let results = await searchMemoriesByVector({
          userId,
          // 按当前实现：记忆检索默认按 assistant 维度隔离（同一用户不同助手互不污染）
          assistantId: mem.assistantId,
          queryEmbedding: q,
          limit,
        });

        // 可选：Rerank 二次语义重排（用专用 rerank 模型，不自己实现打分逻辑）
        const rerankModelId = typeof mem.rerankModel === 'string' ? mem.rerankModel.trim() : '';
        if (rerankModelId && results.length > 1) {
          try {
            const rerankModel = await resolveRerankModel(rerankModelId);
            const { ranking } = await rerank({
              model: rerankModel,
              query,
              documents: results.map((r) => r.memory),
              topN: Math.min(limit, results.length),
              maxRetries: 0,
              abortSignal: ctx.signal,
            });

            const reranked: MemoryItem[] = [];
            for (const item of ranking) {
              // 注意：AI SDK 的 rerank 返回的是 originalIndex（对应 documents 原数组下标），不是 index。
              const picked = results[item.originalIndex];
              if (picked) reranked.push(picked);
            }
            if (reranked.length > 0) results = reranked;
          } catch {
            // 说明：rerank 失败时回退到向量排序（不让记忆工具整体失败）。
          }
        }

        // 记录到 request 级缓存，供同一轮对话后续的记忆写入编排复用。
        if (cachedRelevantMemoriesByRequestId.size > 50) cleanupCache();
        cachedRelevantMemoriesByRequestId.set(ctx.requestId, { at: Date.now(), results });
        cleanupCache();
        return results;
      });
    },
  });

  return tools;
}
