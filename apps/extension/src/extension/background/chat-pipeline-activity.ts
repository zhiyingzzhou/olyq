/**
 * 说明：聊天前置 pipeline activity 归一化模块。
 *
 * 职责：
 * - 为模型正文流开始前、工具执行中这类后台真实长任务统一发送 `chat/progress`；
 * - 让 UI watchdog 能感知后台仍在推进，但不伪造正文、reasoning、tool result 或成功终态；
 * - 避免 Web Search、MCP、Memory 等后台 pipeline 各自维护零散 heartbeat。
 *
 * 边界：
 * - 本模块只负责内部 activity 事件，不处理用户可见输出、不改 Port 协议；
 * - 只在调用方明确包裹真实异步任务时发送 heartbeat，任务完成、失败或取消后必须停止。
 */
import type {
  StreamChatProgressEvent,
  StreamChatProgressStage,
} from '../../lib/ai/stream-chat-types';

/** 聊天 pipeline activity heartbeat 间隔；需短于 UI idle watchdog。 */
export const CHAT_PIPELINE_ACTIVITY_HEARTBEAT_MS = 10_000;

/** 聊天 pipeline activity 所需的最小上下文。 */
export interface ChatPipelineActivityContext {
  /** 当前聊天请求 ID。 */
  readonly requestId: string;
  /** 当前请求取消信号；已取消时不再继续发送 activity。 */
  readonly signal?: AbortSignal;
  /** 发送内部 `chat/progress` 的回调。 */
  readonly emitProgress?: (event: Omit<StreamChatProgressEvent, 'requestId'>) => void;
}

/**
 * 发送一次聊天 pipeline activity。
 *
 * @param ctx - 当前聊天 pipeline activity 上下文。
 * @param stage - 当前后台活动阶段。
 */
export function emitChatPipelineProgress(
  ctx: ChatPipelineActivityContext,
  stage: StreamChatProgressStage,
): void {
  if (ctx.signal?.aborted) return;
  ctx.emitProgress?.({ type: 'chat/progress', stage });
}

/**
 * 在真实异步后台任务 pending 期间持续发送 `chat/progress`。
 *
 * @param ctx - 当前聊天 pipeline activity 上下文。
 * @param stage - 当前后台活动阶段。
 * @param task - 被 activity 包裹的真实异步任务。
 * @returns 原任务的返回值。
 */
export async function runWithChatPipelineHeartbeat<T>(
  ctx: ChatPipelineActivityContext,
  stage: StreamChatProgressStage,
  task: () => Promise<T>,
): Promise<T> {
  emitChatPipelineProgress(ctx, stage);

  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let removeAbortListener: (() => void) | null = null;
  /** 清理本模块创建的 heartbeat interval，允许被完成态和 abort 复用。 */
  const clearHeartbeat = () => {
    if (!heartbeat) return;
    clearInterval(heartbeat);
    heartbeat = null;
  };

  if (ctx.emitProgress && !ctx.signal?.aborted) {
    heartbeat = setInterval(() => {
      emitChatPipelineProgress(ctx, stage);
    }, CHAT_PIPELINE_ACTIVITY_HEARTBEAT_MS);

    if (ctx.signal) {
      // 说明：Abort 只停止本模块自己的 heartbeat，不替调用方改写任务 Promise。
      /** 当前请求被取消时停止 pipeline heartbeat，不改变原始 task 的完成/失败语义。 */
      const onAbort = () => clearHeartbeat();
      ctx.signal.addEventListener('abort', onAbort, { once: true });
      removeAbortListener = () => ctx.signal?.removeEventListener('abort', onAbort);
    }
  }

  try {
    return await task();
  } finally {
    clearHeartbeat();
    removeAbortListener?.();
  }
}
