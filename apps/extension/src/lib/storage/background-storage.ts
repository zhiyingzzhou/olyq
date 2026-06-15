/**
 * 说明：后台 storage 副作用 Promise 消费工具。
 *
 * 职责：
 * - 统一消费不影响当前用户流程的 storage 后台副作用失败；
 * - 记录 owner / operation / key，避免 Chrome 把 fire-and-forget storage rejection 报成
 *   `Uncaught (in promise)`；
 * - 不改变关键路径 `await` storage 调用的失败语义。
 *
 * 边界：
 * - 本模块只负责诊断和 Promise rejection 消费；
 * - 不读取、不写入任何持久化数据，也不提供 fallback。
 */
import { logger } from '@/lib/logger';

/** 后台 storage 副作用的操作类型。 */
export type BackgroundStorageOperation = 'get' | 'set' | 'remove' | 'read-json' | 'write-json' | 'reload' | 'sync';

/** 后台 storage 失败诊断上下文。 */
export interface BackgroundStorageFailureContext {
  /** 发起后台副作用的模块或函数名。 */
  owner: string;
  /** 当前后台副作用的存储操作语义。 */
  operation: BackgroundStorageOperation;
  /** 受影响的 storage key；批量操作按字符串数组记录。 */
  key?: string | readonly string[];
}

/**
 * 把任意错误格式化成稳定单行摘要。
 *
 * @param error - 原始错误对象。
 * @returns 适合结构化日志记录的错误摘要。
 */
function formatBackgroundStorageError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

/**
 * 记录后台 storage 副作用失败。
 *
 * 说明：
 * - 只用于“调用方已经完成内存态更新或启动恢复不应被中断”的后台路径；
 * - 关键持久化路径仍应直接 `await` 原始 Promise，让上层决定用户可见错误。
 *
 * @param error - 被捕获的 storage 错误。
 * @param context - owner / operation / key 诊断上下文。
 */
export function reportBackgroundStorageFailure(
  error: unknown,
  context: BackgroundStorageFailureContext,
): void {
  logger.general.warn('background storage operation failed', {
    owner: context.owner,
    operation: context.operation,
    key: Array.isArray(context.key) ? context.key.join(',') : context.key,
    error: formatBackgroundStorageError(error),
  });
}

/**
 * 消费后台 storage Promise 的 rejection。
 *
 * 说明：
 * - 这是 fire-and-forget storage 副作用的唯一推荐入口；
 * - 返回 `void` 是有意设计，调用方不应继续对这个后台任务叠第二套时序；
 * - Promise 成功时不产生任何日志，失败时只记录诊断。
 *
 * @param promise - 待消费的后台 storage Promise。
 * @param context - owner / operation / key 诊断上下文。
 */
export function consumeBackgroundStoragePromise<T>(
  promise: Promise<T>,
  context: BackgroundStorageFailureContext,
): void {
  void promise.catch((error) => {
    reportBackgroundStorageFailure(error, context);
  });
}
