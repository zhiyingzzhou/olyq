/**
 * 说明：`object-gen` 基础能力模块。
 *
 * 职责：
 * - 承载 `object-gen` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ObjectTaskId`、`TopicTitleTaskInput`、`ObjectTaskInputMap` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { getUiPort, onUiPortMessage, postUiPortMessage } from '@/extension/bridge/ui-port';
import { createId } from '@/lib/utils/id';
import { I18nError } from '@/lib/i18n/error';
import { isI18nText } from '@/lib/i18n/text';
import { isPlainRecord } from '@/lib/utils/type-guards';

/**
 * UI 侧后台文本任务调用封装。
 *
 * 设计约束：
 * - 实际调用发生在 Service Worker（后台），UI 只负责消息封装与结果校验；
 * - prompt 和输出校验固定在后台，通过 taskId 选择（避免把任务细节透传到 Port）。
 */

/** 当前 UI 可调用的对象任务 ID。 */
export type ObjectTaskId = 'topic-title';

/** `topic-title` 后台任务的输入载荷。 */
export type TopicTitleTaskInput = {
  /** 对话片段（已在 UI 侧做截断/采样） */
  sample: string;
};

/** 任务 ID 到输入结构的映射表。 */
export type ObjectTaskInputMap = {
  'topic-title': TopicTitleTaskInput;
};

/** 任务 ID 到输出结构的映射表。 */
export type ObjectTaskOutputMap = {
  'topic-title': {
    /** 生成出的话题标题。 */
    title: string;
  };
};

/** UI 发起后台文本任务时需要提供的参数。 */
type GenerateObjectTaskParams<T extends ObjectTaskId> = {
  /** 要执行的后台任务 ID。 */
  taskId: T;
  /** 模型标识："providerId/modelId" */
  model: string;
  /** 当前任务对应的输入载荷。 */
  input: ObjectTaskInputMap[T];
  /** 超时（ms） */
  timeoutMs?: number;
  /** 可选：取消信号（用于“停止生成”） */
  signal?: AbortSignal;
};

/** 校验并规整 `topic-title` 任务的最终输出。 */
function parseTopicTitleOutput(output: unknown): { title: string } {
  if (!isPlainRecord(output)) throw new I18nError('errors.objectInvalidResponse');
  const title = typeof output.title === 'string' ? output.title.trim() : '';
  if (!title) throw new I18nError('errors.objectInvalidResponse');
  return { title };
}

/**
 * 通过 UI Port 向后台发起一次后台文本任务。
 *
 * 说明：
 * - 实际模型调用和输出校验主逻辑在后台；
 * - UI 侧只负责 requestId 管理、超时/中止控制和最终结果的本地二次校验。
 */
export async function generateObjectTask<T extends ObjectTaskId>({
  taskId,
  model,
  input,
  timeoutMs = 30_000,
  signal,
}: GenerateObjectTaskParams<T>): Promise<ObjectTaskOutputMap[T]> {
  const port = getUiPort();
  if (!port) throw new I18nError('errors.extensionPortUnavailable');

  const requestId = createId();

  return await new Promise<ObjectTaskOutputMap[T]>((resolve, reject) => {
    /** 标记当前请求是否已经进入终态，避免重复 resolve/reject。 */
    let done = false;
    /** 清理监听器、超时和 abort 监听；可选顺带把错误抛给调用方。 */
    const cleanup = (err?: unknown) => {
      if (done) return;
      done = true;
      off();
      window.clearTimeout(t);
      if (signal) signal.removeEventListener('abort', onAbort);
      if (err) reject(err);
    };

    /** 前端主动取消时通知后台停止对应任务。 */
    const onAbort = () => {
      postUiPortMessage({ type: 'object/abort', requestId });
      cleanup(new DOMException('Aborted', 'AbortError'));
    };

    const t = window.setTimeout(() => {
      // UI 超时：主动通知后台 abort（避免后台继续跑）
      postUiPortMessage({ type: 'object/abort', requestId });
      cleanup(new I18nError('errors.objectTimeout'));
    }, Math.max(1_000, timeoutMs));

    const off = onUiPortMessage((msg) => {
      const m = msg as { type?: unknown; requestId?: unknown; output?: unknown; error?: unknown } | null;
      if (!m || m.requestId !== requestId || typeof m.type !== 'string') return;

      if (m.type === 'object/result') {
        try {
          let parsed: unknown = m.output;
          // 输出结构按 taskId 做本地最终校验，避免 UI 直接信任后台原始对象。
          if (taskId === 'topic-title') parsed = parseTopicTitleOutput(m.output);
          cleanup();
          resolve(parsed as ObjectTaskOutputMap[T]);
        } catch (e: unknown) {
          cleanup(e);
        }
        return;
      }

      if (m.type === 'object/error') {
        if (isI18nText(m.error)) cleanup(new I18nError(m.error.key, m.error.params, { cause: m.error }));
        else cleanup(new I18nError('errors.objectGenerationFailed', undefined, { cause: m.error }));
      }
    });

    if (signal) signal.addEventListener('abort', onAbort, { once: true });

    const ok = postUiPortMessage({
      type: 'object/generate',
      requestId,
      payload: { taskId, model, input, timeoutMs },
    });
    if (!ok) cleanup(new I18nError('errors.objectRequestSendFailed'));
  });
}
