/**
 * 说明：Port 长任务生命周期工具。
 *
 * 职责：
 * - 统一 requestId 覆盖、AbortController 登记、异常回传和最终清理；
 * - 统一 UI Port 断线后的批量 abort 与 map 清扫；
 * - 避免聊天、图片、视频、语音、转写、object 等后台任务各自维护一套易漂移流程。
 *
 * 边界：
 * - 本模块只管理“端口任务生命周期”，不理解具体业务事件协议；
 * - 业务 handler 仍负责构造请求 payload、选择错误事件类型和决定是否追加 done 事件。
 */

/** 可被 Port 生命周期工具管理的最小任务条目。 */
export type PortLifecycleEntry = {
  /** 本次任务的取消控制器。 */
  controller: AbortController;
  /** 发起任务的 UI Port。 */
  port: chrome.runtime.Port;
};

/** 创建任务条目时需要的上下文。 */
export type CreatePortLifecycleEntryContext = {
  /** 新建的取消控制器。 */
  controller: AbortController;
  /** 发起任务的 UI Port。 */
  port: chrome.runtime.Port;
};

/** 启动并跟踪一个 Port 长任务所需的参数。 */
export type StartTrackedPortTaskOptions<TEntry extends PortLifecycleEntry> = {
  /** 当前任务类型对应的活动表。 */
  active: Map<string, TEntry>;
  /** 请求 ID，必须由上游保证非空。 */
  requestId: string;
  /** 发起任务的 UI Port。 */
  port: chrome.runtime.Port;
  /** 可选：自定义活动表条目，用于聊天这类需要额外 bookkeeping 的任务。 */
  createEntry?: (ctx: CreatePortLifecycleEntryContext) => TEntry;
  /** 覆盖同 requestId 的旧任务前执行的清理逻辑。 */
  onReplace?: (entry: TEntry) => void;
  /** 任务主体。 */
  run: (ctx: { controller: AbortController; entry: TEntry }) => Promise<void>;
  /** 任务主体抛错且当前条目仍有效时执行的错误回传逻辑。 */
  onError?: (error: unknown, ctx: { controller: AbortController; entry: TEntry }) => void;
  /** 当前条目仍有效并准备删除前执行的最终清理逻辑。 */
  onFinally?: (entry: TEntry) => void;
};

/**
 * 启动一个可取消、可按 requestId 覆盖的 Port 长任务。
 *
 * 说明：
 * - 同 requestId 的新任务会先 abort 旧任务，并执行旧任务的业务清理；
 * - 异步错误只有在“当前 map 中仍然是同一个 controller”时才会回传，避免旧任务晚到污染新任务；
 * - finally 同样只允许当前 holder 删除活动表条目。
 */
export function startTrackedPortTask<TEntry extends PortLifecycleEntry>(
  options: StartTrackedPortTaskOptions<TEntry>,
): AbortController {
  const {
    active,
    requestId,
    port,
    createEntry,
    onReplace,
    run,
    onError,
    onFinally,
  } = options;
  const existing = active.get(requestId);
  if (existing) {
    existing.controller.abort();
    onReplace?.(existing);
    active.delete(requestId);
  }

  const controller = new AbortController();
  const entry = createEntry?.({ controller, port }) ?? ({ controller, port } as TEntry);
  active.set(requestId, entry);

  void run({ controller, entry })
    .catch((error: unknown) => {
      if (active.get(requestId)?.controller !== controller) return;
      onError?.(error, { controller, entry });
    })
    .finally(() => {
      const current = active.get(requestId);
      if (current?.controller !== controller) return;
      onFinally?.(current);
      active.delete(requestId);
    });

  return controller;
}

/**
 * 取消某个 requestId 对应的活动任务。
 *
 * 说明：这里只触发 abort，不主动删除活动表；真正清理由任务自己的 finally 完成。
 */
export function abortTrackedPortTask<TEntry extends PortLifecycleEntry>(
  active: Map<string, TEntry>,
  requestId: string,
): void {
  active.get(requestId)?.controller.abort();
}

/**
 * 取消并清理某个 UI Port 绑定的全部活动任务。
 *
 * 说明：
 * - Port 断线时任务已无法再向 UI 可靠回传事件，因此这里同步删除活动表条目；
 * - 业务侧可用 `onAbortEntry` 清理 toolCallId 等反向索引。
 */
export function abortTrackedPortTasksForPort<TEntry extends PortLifecycleEntry>(
  active: Map<string, TEntry>,
  port: chrome.runtime.Port,
  onAbortEntry?: (entry: TEntry) => void,
): void {
  for (const [requestId, entry] of active) {
    if (entry.port !== port) continue;
    entry.controller.abort();
    onAbortEntry?.(entry);
    active.delete(requestId);
  }
}
