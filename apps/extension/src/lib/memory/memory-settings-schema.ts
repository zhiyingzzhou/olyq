/**
 * 说明：`memory-settings-schema` 全局记忆设置契约模块。
 *
 * 职责：
 * - 定义 `olyq.memory.config.v1` 的当前 v1 存储 key；
 * - 提供全局记忆配置的无副作用规整函数；
 * - 供运行时设置模块、备份恢复、云同步和 Data Contract Registry 共用。
 *
 * 边界：
 * - 本文件不创建 shared-json channel，不读写 memory records；
 * - 记忆配置的缓存、保存与订阅仍由 `memory-settings.ts` 负责。
 */
import { DEFAULT_MEMORY_CONFIG, type GlobalMemoryConfig } from './types';

/** 当前全局记忆配置的固定存储 key。 */
export const MEMORY_CONFIG_STORAGE_KEY = 'olyq.memory.config.v1';

/**
 * 把任意输入收敛为合法的 `GlobalMemoryConfig`。
 *
 * @param raw - 未信任的 storage / backup / sync 输入。
 * @returns 当前 v1 全局记忆配置。
 */
export function normalizeMemoryConfig(raw: unknown): GlobalMemoryConfig {
  const rec = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? (raw as Record<string, unknown>) : {};
  const enabled = typeof rec.enabled === 'boolean' ? rec.enabled : DEFAULT_MEMORY_CONFIG.enabled;
  const embeddingModel = typeof rec.embeddingModel === 'string' ? rec.embeddingModel.trim() : '';
  const llmModel = typeof rec.llmModel === 'string' ? rec.llmModel.trim() : '';
  const rerankModel = typeof rec.rerankModel === 'string' ? rec.rerankModel.trim() : '';
  const topK = typeof rec.topK === 'number' && Number.isFinite(rec.topK)
    ? Math.max(1, Math.min(20, Math.floor(rec.topK)))
    : DEFAULT_MEMORY_CONFIG.topK;

  return {
    enabled,
    embeddingModel: embeddingModel || undefined,
    llmModel: llmModel || undefined,
    rerankModel: rerankModel || undefined,
    topK,
  };
}
