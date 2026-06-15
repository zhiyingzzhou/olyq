/**
 * 说明：`pipeline-types` 后台运行时模块。
 *
 * 职责：
 * - 承载 `pipeline-types` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ChatPipelineContext`、`PostStreamContext` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { ChatStreamParams } from '../../lib/ai/types';
import type { StreamChatEvent } from '@/lib/ai/stream-chat';
import type { StreamChatProgressEvent } from '@/lib/ai/stream-chat-types';

/**
 * 聊天流水线（pipeline）各阶段共享的上下文。
 *
 * 约束：每个 stage 只使用自己需要的字段，避免“全局大对象”被随意读写导致隐式耦合。
 */
export interface ChatPipelineContext {
  /** 本次流水线请求 ID，用于串联日志、事件和取消信号。 */
  requestId: string;
  /** 发起流式聊天时的完整输入参数。 */
  params: ChatStreamParams;
  /** 用于中止后续阶段的取消信号。 */
  signal: AbortSignal;
  /** 向上层 UI / 调度器发出流式事件。 */
  emit: (event: StreamChatEvent) => void;
  /** 工具执行等后台长耗时阶段的保活进度事件。 */
  emitProgress?: (event: Omit<StreamChatProgressEvent, 'requestId'>) => void;
}

/**
 * 流式结束后的扩展上下文（用于记忆写入/编排等后处理）。
 */
export interface PostStreamContext extends ChatPipelineContext {
  /** 最终拼装完成的助手文本，用于后处理阶段复用。 */
  assistantText: string;
}
