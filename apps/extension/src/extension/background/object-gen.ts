/**
 * 说明：`object-gen` 后台运行时模块。
 *
 * 职责：
 * - 承载 `object-gen` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ObjectTaskId`、`ObjectGenerateRequest`、`ObjectGenerateEvent` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 后台任务型输出（Object Tasks）
 *
 * 目标：
 * - 统一在 Service Worker 内调用 AI SDK（避免 UI 侧直连第三方 API、避免密钥暴露与 CORS 问题）
 * - UI 侧只传 “taskId + input + modelId”，Prompt/规则固定在后台，确保：
 *   1) 结构稳定（不把 schema 序列化到 Port）
 *   2) 易维护（新增任务 = 新增一个分支/定义）
 *   3) 易扩展（后续可增加更多 taskId）
 *
 * 说明：
 * - 本模块只做“任务型调用”，不做通用的任意 schema 透传（安全 & 可维护性）。
 * - 输出仍以对象形式通过 Port 返回，但标题任务采用“纯文本输出 + 本地确定性清洗/兜底”，避免依赖部分平台不支持的 structured outputs 特性。
 */

import { APICallError, generateText, streamText, wrapLanguageModel } from 'ai';
import { z } from 'zod';

import type { I18nText } from '../../types/i18n';
import { toUserFacingAiErrorText } from '../../lib/ai/utils/api-errors';
import type { ModelCallParamsBase } from '../../lib/ai/types';
import { buildRuntimeCallPlan, resolveStreamContext } from '../../lib/ai/stream-chat-context';
import { I18nError } from '../../lib/i18n/error';
import { i18nText } from '../../lib/i18n/text';
import { isPlainRecord } from '../../lib/utils/type-guards';
import { safePostMessage } from './port-manager';
import { finalizeTopicTitle } from '../../lib/chat/topic-title';
import type { TransportProtocol } from '../../lib/ai/types';
import { parseOpenAiResponsesBodyVisibleOutput } from './openai-responses-sse';

/** 当前后台支持的任务型对象生成任务 ID。 */
export type ObjectTaskId = 'topic-title';

/**
 * UI 发往后台的对象任务请求。
 *
 * 说明：
 * - 这里只传任务标识、模型和可序列化输入，具体 prompt/schema 固定维护在后台；
 * - `requestId` 用于同一条 Port 上的多路复用与取消控制，不能省略。
 */
export type ObjectGenerateRequest = {
  /** 请求唯一 ID；用于同一 Port 上的多路复用与取消。 */
  requestId: string;
  /** 内置任务 ID（由后台维护 schema/prompt） */
  taskId: ObjectTaskId;
  /** 使用的模型（格式：providerId/modelId） */
  model: string;
  /** 任务入参（结构由 taskId 决定；需可序列化） */
  input: unknown;
  /** 可选：UI 侧超时（ms），仅用于展示；实际超时/取消由 message-handlers 侧 AbortController 负责 */
  timeoutMs?: number;
};

/**
 * 后台对象任务通过 Port 回传给 UI 的事件联合类型。
 *
 * 说明：
 * - `partial/result/done/error` 四类事件共同组成任务生命周期；
 * - UI 应按 `requestId` 把事件路由回对应任务实例，避免不同任务串线。
 */
export type ObjectGenerateEvent =
  | {
      /** 流式部分结果事件。 */
      type: 'object/partial';
      /** 对应的请求 ID。 */
      requestId: string;
      /** 当前可用于 UI 渐进展示的局部结果。 */
      partial: unknown;
    }
  | {
      /** 最终结构化结果事件。 */
      type: 'object/result';
      /** 对应的请求 ID。 */
      requestId: string;
      /** 最终输出对象。 */
      output: unknown;
    }
  | {
      /** 任务完成事件（终态）。 */
      type: 'object/done';
      /** 对应的请求 ID。 */
      requestId: string;
    }
  | {
      /** 任务失败事件（终态）。 */
      type: 'object/error';
      /** 对应的请求 ID。 */
      requestId: string;
      /** 可国际化错误信息。 */
      error: I18nText;
    };

/** 判断异常是否属于取消/中断类错误。 */
function isAbortLikeError(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === 'object') {
    const name = (error as { name?: unknown }).name;
    if (name === 'AbortError') return true;
  }
  const msg = error instanceof Error ? error.message : String(error);
  return /aborted|abort/i.test(msg);
}

/** 将对象生成链路中的异常归一为可序列化 I18nText。 */
function toObjectGenErrorText(e: unknown): I18nText {
  if (isAbortLikeError(e)) return i18nText('errors.cancelled');
  return toUserFacingAiErrorText(e);
}

/**
 * 构建 object task 的统一文本请求参数。
 *
 * 说明：
 * - `topic-title` 的 generate/stream 两条路径必须共用同一份 call settings 与 providerOptions；
 * - 这样才能保证 SSE-safe 切换只改变消费方式，不改变请求语义。
 */
function buildObjectTextCallArgs(params: {
  model: Awaited<ReturnType<typeof buildRuntimeCallPlan>>['languageModel'];
  system?: string;
  prompt: string;
  runtimeCallPlan: Awaited<ReturnType<typeof buildRuntimeCallPlan>>;
  signal: AbortSignal;
}) {
  const { model, system, prompt, runtimeCallPlan, signal } = params;
  return {
    model,
    ...(system ? { system } : {}),
    prompt,
    ...(runtimeCallPlan.callSettings.temperature !== undefined ? { temperature: runtimeCallPlan.callSettings.temperature } : {}),
    ...(runtimeCallPlan.callSettings.topP !== undefined ? { topP: runtimeCallPlan.callSettings.topP } : {}),
    ...(runtimeCallPlan.callSettings.maxOutputTokens !== undefined ? { maxOutputTokens: runtimeCallPlan.callSettings.maxOutputTokens } : {}),
    maxRetries: 0,
    abortSignal: signal,
    ...(runtimeCallPlan.providerOptions ? { providerOptions: runtimeCallPlan.providerOptions } : {}),
  };
}

/**
 * 判断 `topic-title` 当前应该走哪条文本完成态路径。
 *
 * 说明：
 * - OpenAI Responses 在当前最新 AI SDK 下，`fullStream` 仍不能稳定暴露可消费的完成态事件，
 *   因此这里直接切成 one-shot `generateText()`；
 * - 其它 transport 仍优先保留流式路径，只有模型显式声明不支持 text delta 时才退回 one-shot。
 */
function shouldUseFinalTextTopicTitle(params: {
  transportProtocol: TransportProtocol | undefined;
  supportedTextDelta: boolean | undefined;
}) {
  if (params.transportProtocol === 'openai-responses') return true;
  return params.supportedTextDelta === false;
}

/** 尝试从被错误包装的 Responses body 中恢复最终标题。 */
function tryRecoverTopicTitleFromResponsesBody(body: unknown, sampleForFallback: string): string | null {
  const finalText = parseOpenAiResponsesBodyVisibleOutput(body).finalText;
  if (!finalText.trim()) return null;

  const title = finalizeTopicTitle(finalText, sampleForFallback);
  return title || null;
}

/**
 * 将 `generateText()` 的“HTTP 200 + Responses body”误包装恢复成成功标题。
 *
 * 说明：
 * - 某些 OpenAI-compatible 网关在 one-shot Responses 请求上返回 JSON 或 SSE 成功体，
 *   但缺少当前 AI SDK strict schema 要求的辅助字段；
 * - AI SDK 会把这种 200 成功响应误抛成 `APICallError`；
 * - 自动命名单轨仍保持 `generateText()`，这里只在同一次响应里提取最终文本，不补第二次请求。
 */
function tryRecoverTopicTitleFromApiCallError(error: unknown, sampleForFallback: string): string | null {
  if (!(error instanceof Error) || !APICallError.isInstance(error)) return null;
  if (error.statusCode !== 200) return null;

  const body = error.responseBody ?? error.data;
  return tryRecoverTopicTitleFromResponsesBody(body, sampleForFallback);
}

/**
 * 消费 `topic-title` 的文本生成结果，并统一产出最终标题。
 *
 * 说明：
 * - 非 OpenAI Responses transport 默认优先走 `streamText().fullStream`，把 `text/event-stream` 的成功流视为成功；
 * - 模型显式声明 `supportedTextDelta === false` 时，或 transport 为 `openai-responses` 时，统一走 `generateText()`；
 * - `onPartialTitle` 仅在真正的流式路径下触发，供 `object/stream` 向 UI 发送渐进标题。
 */
async function resolveTopicTitleOutput(params: {
  callArgs: ReturnType<typeof buildObjectTextCallArgs>;
  sampleForFallback: string;
  signal: AbortSignal;
  transportProtocol: TransportProtocol | undefined;
  supportedTextDelta: boolean | undefined;
  onPartialTitle?: (title: string) => void;
}) {
  const { callArgs, sampleForFallback, signal, transportProtocol, supportedTextDelta, onPartialTitle } = params;

  if (shouldUseFinalTextTopicTitle({ transportProtocol, supportedTextDelta })) {
    try {
      const result = await generateText(callArgs);
      return finalizeTopicTitle(result.text, sampleForFallback);
    } catch (error) {
      const recoveredTitle = tryRecoverTopicTitleFromApiCallError(error, sampleForFallback);
      if (recoveredTitle) return recoveredTitle;
      throw error;
    }
  }

  const result = streamText(callArgs);
  let acc = '';
  let lastPartialTitle = '';

  for await (const part of result.fullStream) {
    if (signal.aborted) break;
    if (part.type !== 'text-delta' || !part.text) continue;
    acc += part.text;

    if (!onPartialTitle) continue;
    const nextTitle = finalizeTopicTitle(acc, sampleForFallback);
    if (!nextTitle || nextTitle === lastPartialTitle) continue;
    lastPartialTitle = nextTitle;
    onPartialTitle(nextTitle);
  }

  return finalizeTopicTitle(acc, sampleForFallback);
}

/** 解析 `topic-title` 任务的输入载荷。 */
function parseTopicTitleInput(input: unknown): { sample: string } {
  const rec = isPlainRecord(input) ? input : {};
  const sample = typeof rec.sample === 'string' ? rec.sample.trim() : '';
  if (!sample) throw new I18nError('errors.objectTaskInputInvalid');
  return { sample };
}

/** `topic-title` 任务最终输出的最小合法结构。 */
const TopicTitleSchema = z.object({
  title: z.string().min(1),
});

/**
 * 后台“一次性任务输出”入口。
 *
 * 说明：
 * - UI 侧只传 taskId + input + modelId；
 * - schema/prompt 固定在 SW 内部，避免 schema 透传带来的兼容性与安全问题；
 * - 结果通过 Port 事件回传：object/result + object/done 或 object/error。
 */
export async function generateObjectToPort({
  req,
  port,
  signal,
}: {
  req: ObjectGenerateRequest;
  port: chrome.runtime.Port;
  signal: AbortSignal;
}) {
  /** 向 UI 回传任务事件；Port 断开时静默忽略。 */
  const post = (evt: ObjectGenerateEvent) => safePostMessage(port, evt);

  try {
    const modelId = String(req.model || '').trim();
    if (!modelId) throw new I18nError('errors.objectModelRequired');

    // 任务参数：使用“模型调用基础参数”统一走 stream-chat-context 的 providerOptions/callSettings 规则。
    // 这里固定关闭生图和联网，避免任务型生成意外获得其它能力。
    const callParams: ModelCallParamsBase = {
      model: modelId,
      temperature: 0.3,
      topP: 0.9,
      maxTokens: 96,
      enableGenerateImage: false,
      enableWebSearch: false,
    };

    const ctx = await resolveStreamContext(callParams);
    const runtimeCallPlan = await buildRuntimeCallPlan(ctx, callParams);

    // 解析任务定义（system/prompt + 本地兜底所需信息）
    let system: string | undefined;
    let prompt: string | undefined;
    let sampleForFallback: string | undefined;

    switch (req.taskId) {
      case 'topic-title': {
        const { sample } = parseTopicTitleInput(req.input);
        sampleForFallback = sample;
        system = '你是一个对话标题生成器。';
        prompt = [
          '请根据下面对话片段生成一个简短标题：',
          '- 中文为主，尽量 8~18 个字',
          '- 不要包含引号、句号、冒号',
          '- 不要输出换行',
          '- 只输出标题本身，不要输出 JSON、代码块或解释',
          '',
          sample,
        ].join('\n');
        break;
      }
      default:
        throw new I18nError('errors.objectTaskUnsupported', { taskId: String((req as { taskId?: unknown }).taskId) });
    }

    const promptText = typeof prompt === 'string' ? prompt : '';
    if (!promptText.trim()) throw new I18nError('errors.objectTaskInputInvalid');

    const model = runtimeCallPlan.middlewares.length > 0
      ? wrapLanguageModel({ model: runtimeCallPlan.languageModel, middleware: [...runtimeCallPlan.middlewares] })
      : runtimeCallPlan.languageModel;

    const title = await resolveTopicTitleOutput({
      callArgs: buildObjectTextCallArgs({
        model,
        system,
        prompt: promptText,
        runtimeCallPlan,
        signal,
      }),
      sampleForFallback: sampleForFallback || '',
      signal,
      transportProtocol: ctx.resolvedModelMeta.transportProtocol,
      supportedTextDelta: ctx.modelConfig?.supportedTextDelta,
    });
    const parsed = TopicTitleSchema.safeParse({ title });
    if (!parsed.success) throw new I18nError('errors.objectInvalidResponse', undefined, { cause: parsed.error });

    post({ type: 'object/result', requestId: req.requestId, output: parsed.data });
    post({ type: 'object/done', requestId: req.requestId });
  } catch (e: unknown) {
    post({ type: 'object/error', requestId: req.requestId, error: toObjectGenErrorText(e) });
  }
}

/**
 * 后台“流式任务输出”入口。
 *
 * 说明：
 * - 与 `generateObjectToPort` 的差异在于：会持续发送 object/partial；
 * - UI 可用于实时预览/渐进式渲染（例如标题生成的逐字补全）。
 */
export async function streamObjectToPort({
  req,
  port,
  signal,
}: {
  req: ObjectGenerateRequest;
  port: chrome.runtime.Port;
  signal: AbortSignal;
}) {
  /** 向 UI 回传任务事件；Port 断开时静默忽略。 */
  const post = (evt: ObjectGenerateEvent) => safePostMessage(port, evt);

  try {
    const modelId = String(req.model || '').trim();
    if (!modelId) throw new I18nError('errors.objectModelRequired');

    const callParams: ModelCallParamsBase = {
      model: modelId,
      temperature: 0.3,
      topP: 0.9,
      maxTokens: 96,
      enableGenerateImage: false,
      enableWebSearch: false,
    };

    const ctx = await resolveStreamContext(callParams);
    const runtimeCallPlan = await buildRuntimeCallPlan(ctx, callParams);

    let system: string | undefined;
    let prompt: string | undefined;
    let sampleForFallback: string | undefined;

    switch (req.taskId) {
      case 'topic-title': {
        const { sample } = parseTopicTitleInput(req.input);
        sampleForFallback = sample;
        system = '你是一个对话标题生成器。';
        prompt = [
          '请根据下面对话片段生成一个简短标题：',
          '- 中文为主，尽量 8~18 个字',
          '- 不要包含引号、句号、冒号',
          '- 不要输出换行',
          '- 只输出标题本身，不要输出 JSON、代码块或解释',
          '',
          sample,
        ].join('\n');
        break;
      }
      default:
        throw new I18nError('errors.objectTaskUnsupported', { taskId: String((req as { taskId?: unknown }).taskId) });
    }

    const promptText = typeof prompt === 'string' ? prompt : '';
    if (!promptText.trim()) throw new I18nError('errors.objectTaskInputInvalid');

    const model = runtimeCallPlan.middlewares.length > 0
      ? wrapLanguageModel({ model: runtimeCallPlan.languageModel, middleware: [...runtimeCallPlan.middlewares] })
      : runtimeCallPlan.languageModel;

    const finalTitle = await resolveTopicTitleOutput({
      callArgs: buildObjectTextCallArgs({
        model,
        system,
        prompt: promptText,
        runtimeCallPlan,
        signal,
      }),
      sampleForFallback: sampleForFallback || '',
      signal,
      transportProtocol: ctx.resolvedModelMeta.transportProtocol,
      supportedTextDelta: ctx.modelConfig?.supportedTextDelta,
      onPartialTitle: (titleNow) => {
        post({ type: 'object/partial', requestId: req.requestId, partial: { title: titleNow } });
      },
    });
    const parsed = TopicTitleSchema.safeParse({ title: finalTitle });
    if (!parsed.success) throw new I18nError('errors.objectInvalidResponse', undefined, { cause: parsed.error });

    post({ type: 'object/result', requestId: req.requestId, output: parsed.data });
    post({ type: 'object/done', requestId: req.requestId });
  } catch (e: unknown) {
    post({ type: 'object/error', requestId: req.requestId, error: toObjectGenErrorText(e) });
  }
}
