/**
 * 说明：Service Worker 运行时状态类型聚合。
 *
 * 职责：
 * - 为后续继续拆分 SW 总线提供状态边界；
 * - 当前只承载类型，不迁移持久化或业务真源；
 * - 明确这些 Map 都是 MV3 Service Worker 临时内存态。
 */
import type { ActiveHealthCheckEntry, ActiveRequestEntry } from '../message-handlers/types';

/** Service Worker 临时活动请求集合。 */
export type ServiceWorkerRuntimeState = {
  /** 聊天流活动请求。 */
  activeChats: Map<string, ActiveRequestEntry>;
  /** 图片生成活动请求。 */
  activeImages: Map<string, ActiveRequestEntry>;
  /** 音频转写活动请求。 */
  activeTranscriptions: Map<string, ActiveRequestEntry>;
  /** 语音合成活动请求。 */
  activeSpeeches: Map<string, ActiveRequestEntry>;
  /** 结构化对象生成活动请求。 */
  activeObjects: Map<string, ActiveRequestEntry>;
  /** 健康检查活动请求。 */
  activeHealthChecks: Map<string, ActiveHealthCheckEntry>;
  /** toolCallId 到 requestId 的临时反向索引。 */
  toolCallToRequestId: Map<string, string>;
};
