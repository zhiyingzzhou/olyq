/**
 * 说明：`memory-search` 记忆模块。
 *
 * 职责：
 * - 承载 `memory-search` 相关的当前文件实现与模块边界；
 * - 对外暴露 `UNIFIED_EMBEDDING_DIMENSION`、`toUnifiedFloat32Embedding`、`l2NormalizeEmbedding` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 记忆检索 v1：向量相似度（cosine / dot product）
 *
 * 约束：
 * - 向量应已做 L2 normalize；因此 cosine similarity = dot product
 * - 为了兼容不同 embedding 维度，存储时会“统一维度”（pad / truncate）
 */

import type { MemoryItem, MemoryRecord } from './types';
import { listMemoryRecords } from './memory-store';

/** 默认统一的 embedding 维度：不足补 0，超出截断。 */
export const UNIFIED_EMBEDDING_DIMENSION = 1536;

/**
 * 把任意 number[] / Float32Array 收敛为统一维度的 Float32Array。
 *
 * 设计原因：
 * - 不同 provider / 模型可能产生不同维度的 embedding；
 * - 检索层要求所有向量维度一致，因此这里做统一维度适配。
 */
export function toUnifiedFloat32Embedding(vec: number[] | Float32Array): Float32Array {
  // 普通 number[] 会先转换成 Float32Array，确保后续运算路径一致。
  const src = vec instanceof Float32Array ? vec : Float32Array.from(vec.map((x) => Number(x)));
  if (src.length === UNIFIED_EMBEDDING_DIMENSION) return src;
  const out = new Float32Array(UNIFIED_EMBEDDING_DIMENSION);
  // 长度不足时未写入的尾部天然为 0；长度超出时则自动截断。
  out.set(src.subarray(0, UNIFIED_EMBEDDING_DIMENSION), 0);
  return out;
}

/**
 * 对 embedding 做 L2 normalize。
 *
 * 归一化后：
 * - 向量长度约等于 1
 * - cosine similarity 可以直接退化为 dot product
 */
export function l2NormalizeEmbedding(vec: Float32Array): Float32Array {
  let s = 0;
  for (let i = 0; i < vec.length; i += 1) {
    const x = vec[i] ?? 0;
    s += x * x;
  }
  const n = Math.sqrt(s) || 1;
  // 已经是单位向量时，返回副本而不是原引用，避免调用方后续误改原数组。
  if (n === 1) return new Float32Array(vec);
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i += 1) out[i] = (vec[i] ?? 0) / n;
  return out;
}

/** 计算两个向量的点积；仅遍历二者共同的最小长度。 */
function dot(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i += 1) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
}

/** 把内部存储记录转换成对外暴露的 `MemoryItem`。 */
function toItem(r: MemoryRecord, score?: number): MemoryItem {
  return {
    id: r.id,
    memory: r.memory,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    ...(r.metadata ? { metadata: r.metadata } : {}),
    ...(typeof score === 'number' && Number.isFinite(score) ? { score } : {}),
  };
}

/**
 * 按查询向量检索最相关的记忆。
 *
 * 当前实现流程：
 * 1. 根据 `userId` / `assistantId` 取候选记录
 * 2. 统一并归一化查询向量
 * 3. 对每条候选记录计算点积分数
 * 4. 按分数从高到低排序
 * 5. 返回 Top-K 的 `MemoryItem`
 *
 * 说明：
 * - 这里不做 rerank，纯粹是第一阶段向量召回；
 * - rerank 如需启用，会在更上层的 orchestration / tools 流程里处理。
 */
export async function searchMemoriesByVector(params: {
  userId: string;
  assistantId?: string;
  queryEmbedding: number[] | Float32Array;
  limit: number;
}): Promise<MemoryItem[]> {
  const userId = String(params.userId || '').trim();
  if (!userId) return [];

  const limit = typeof params.limit === 'number' && Number.isFinite(params.limit)
    ? Math.max(1, Math.min(50, Math.floor(params.limit)))
    : 5;

  // 当前直接取该用户（及可选 assistant）的全量候选：
  // - 记忆规模通常不大，这样实现简单且足够稳定；
  // - 若后续数据量继续增大，可演进为分片游标或近似检索索引。
  const candidates = await listMemoryRecords({
    userId,
    assistantId: params.assistantId,
    limit: 50_000,
    offset: 0,
  }).catch(() => [] as MemoryRecord[]);

  if (candidates.length === 0) return [];

  // 查询向量始终先走“统一维度 + L2 归一化”，保证与存储向量可直接比较。
  const q = l2NormalizeEmbedding(toUnifiedFloat32Embedding(params.queryEmbedding));

  // 存储层约定 embedding 已经预先做过 normalize，因此这里只需点积即可。
  const scored = candidates.map((r) => ({ r, score: dot(q, r.embedding) }));
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((x) => toItem(x.r, x.score));
}
