/**
 * 说明：`types` 记忆模块。
 *
 * 职责：
 * - 承载 `types` 相关的当前文件实现与模块边界；
 * - 对外暴露 `GlobalMemoryConfig`、`DEFAULT_MEMORY_CONFIG`、`MemoryRecord` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 全局记忆（Memory）类型定义 v1（按当前实现语义）
 *
 * 特性：
 * - 全局开关：enabled
 * - 需要配置：embeddingModel + llmModel
 * - 存储：IndexedDB（文本 + 向量 embedding + 元数据）
 * - 检索：余弦相似度（向量已做 L2 normalize）
 * - 使用：通过工具 `builtin__memory_search` 按需检索（不再在每轮对话里预注入记忆文本）
 */

/** 全局记忆配置（UI 侧保存到 localStorage；每次对话会传给 SW）。 */
export interface GlobalMemoryConfig {
  /** 全局开关：关闭时整个记忆链路都不生效 */
  enabled: boolean;
  /** Embedding 模型（格式：providerId/modelId） */
  embeddingModel?: string;
  /** 用于“事实抽取 / 合并更新”的 LLM 模型（格式：providerId/modelId） */
  llmModel?: string;
  /**
   * 可选：重排（Rerank）模型（格式：providerId/modelId）
   *
   * 说明：
   * - 用于把“向量 Top-K 初筛结果”按 query 做二次语义重排，提升命中率；
   * - 仅当你配置了支持 rerank 的 Provider（例如 Cohere）时才有意义；
   * - 不配置则跳过（保持纯向量检索）。
   */
  rerankModel?: string;
  /** 检索返回条数上限（Top-K） */
  topK: number;
}

/**
 * 导出常量：`DEFAULT_MEMORY_CONFIG`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const DEFAULT_MEMORY_CONFIG: GlobalMemoryConfig = {
  enabled: false,
  embeddingModel: undefined,
  llmModel: undefined,
  rerankModel: undefined,
  topK: 5,
};

/** IndexedDB 中存储的一条记忆记录（内部结构）。 */
export interface MemoryRecord {
  /** 记忆记录主键。 */
  id: string;
  /** 记忆正文内容。 */
  memory: string;
  /** L2 normalize 后的统一维度向量（Float32Array） */
  embedding: Float32Array;
  /** 记忆所属用户，用于多用户隔离。 */
  userId: string;
  /** 可选：记忆关联的助手 ID。 */
  assistantId?: string;
  /** 可选：扩展元数据（来源、标签、额外上下文等）。 */
  metadata?: Record<string, unknown>;
  /** 创建时间（毫秒时间戳）。 */
  createdAt: number;
  /** 最近更新时间（毫秒时间戳）。 */
  updatedAt: number;
}

/** 对外展示/工具返回的记忆条目（可序列化）。 */
export interface MemoryItem {
  /** 记忆记录主键。 */
  id: string;
  /** 记忆正文内容。 */
  memory: string;
  /** 可选：检索命中时的相似度/排序分数。 */
  score?: number;
  /** 创建时间（毫秒时间戳）。 */
  createdAt: number;
  /** 最近更新时间（毫秒时间戳）。 */
  updatedAt: number;
  /** 可选：透传给 UI 或上层逻辑的元数据。 */
  metadata?: Record<string, unknown>;
}

/**
 * 记忆实体归属信息。
 *
 * 说明：
 * - 用于在检索、写入、过滤场景中表达“当前上下文属于谁”；
 * - 字段都可选，便于按用户粒度或按助手粒度分别使用。
 */
export type MemoryEntity = {
  /** 可选：用户维度标识。 */
  userId?: string;
  /** 可选：助手维度标识。 */
  assistantId?: string;
};

/** 随每次对话传给 Service Worker 的记忆参数（用于工具注入与后台写入）。 */
export interface ChatMemoryParams {
  /** 本次对话是否启用记忆（已综合全局开关 + 助手开关 + 配置完整性） */
  enabled: boolean;
  /** 记忆所属用户（默认 default-user） */
  userId: string;
  /** 当前话题绑定的助手 ID（用于写入 metadata/统计；检索默认不强制过滤） */
  assistantId?: string;
  /** embedding 模型（providerId/modelId） */
  embeddingModel?: string;
  /** LLM 模型（providerId/modelId） */
  llmModel?: string;
  /** 可选：rerank 模型（providerId/modelId） */
  rerankModel?: string;
  /** 检索条数上限 */
  topK: number;
}
