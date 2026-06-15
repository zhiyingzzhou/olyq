/**
 * 说明：`runtime-text-call` AI 运行时文本调用共享模块。
 *
 * 职责：
 * - 把主聊天已经解析好的 `RuntimeCallPlan` 转成 AI SDK 可执行参数；
 * - 统一包裹 provider middleware、透传 providerOptions、过滤后的 call settings；
 * - 统一执行模式选择，避免 OCR / 后台任务绕开主聊天的 streamText / generateText 策略。
 *
 * 边界：
 * - 本模块不解析 provider/model，不做 vision/file/tool 能力判断；
 * - 不消费 UI 状态，也不处理 Port 事件或聊天事件流；
 * - 不写 provider、endpoint、模型名特判，所有平台差异只来自 `RuntimeCallPlan`。
 */
import {
  generateText as aiGenerateText,
  streamText as aiStreamText,
  wrapLanguageModel,
  type LanguageModelMiddleware,
  type ModelMessage,
  type ToolSet,
} from 'ai';
import type { JSONObject, SharedV3ProviderOptions } from '@ai-sdk/provider';

import type { ChatExecutionMode } from './providers/adapter-types';
import type { RuntimeCallPlan } from './stream-chat-context';

/** AI SDK `generateText` 与 `streamText` 都能接受的运行时文本调用参数。 */
export type RuntimeTextCallArgs =
  Parameters<typeof aiGenerateText>[0] &
  Parameters<typeof aiStreamText>[0];

/** 构建运行时文本调用参数时可选的主聊天附加行为。 */
export interface RuntimeTextCallArgsOptions {
  /** 已由 provider runtime 解析出的调用计划。 */
  readonly runtimeCallPlan: RuntimeCallPlan;
  /** 已转换成 AI SDK ModelMessage 的消息。 */
  readonly messages: ModelMessage[];
  /** 可选取消信号；主聊天必传，OCR 这类短任务可不传。 */
  readonly signal?: AbortSignal;
  /** 只允许主聊天等 owner 追加的 middleware，例如 OpenAI Responses store 探针。 */
  readonly additionalMiddlewares?: readonly LanguageModelMiddleware[];
  /** 可选工具集合；OCR 等纯文本任务不传。 */
  readonly tools?: ToolSet;
  /** AI SDK 工具循环停止条件；只由主聊天传入。 */
  readonly stopWhen?: RuntimeTextCallArgs['stopWhen'];
  /** AI SDK step 级参数准备器；只由主聊天传入。 */
  readonly prepareStep?: RuntimeTextCallArgs['prepareStep'];
  /** 可选默认最大输出 token；健康检查用它保持极短探测，主聊天不设置。 */
  readonly defaultMaxOutputTokens?: number;
}

/** 请求体形态策略应用后的消息和 providerOptions。 */
interface RuntimeRequestShapeApplication {
  /** 按 adapter 策略调整后的消息列表。 */
  readonly messages: ModelMessage[];
  /** 按 adapter 策略调整后的 providerOptions。 */
  readonly providerOptions?: SharedV3ProviderOptions;
}

/** 执行模式解析结果，包含模式和产生该模式的原因，便于调用方保留日志语义。 */
export interface RuntimeTextExecutionModeResolution {
  /** 最终应调用的 AI SDK 方法。 */
  readonly mode: ChatExecutionMode;
  /** 模式来源：provider runtime、no text-delta fallback，或默认流式。 */
  readonly reason: 'runtime-plan' | 'no-text-delta' | 'stream-text';
}

/**
 * 按主聊天策略解析最终文本调用执行模式。
 *
 * @param runtimeCallPlan - provider runtime 已经决定出的基础执行模式。
 * @param supportedTextDelta - 本地模型配置声明的 text-delta 支持情况。
 * @returns 最终执行模式与原因。
 */
export function resolveRuntimeTextExecutionMode(
  runtimeCallPlan: RuntimeCallPlan,
  supportedTextDelta: boolean | undefined,
): RuntimeTextExecutionModeResolution {
  if (runtimeCallPlan.executionMode === 'generateText') {
    return { mode: 'generateText', reason: 'runtime-plan' };
  }
  if (!runtimeCallPlan.wantsInlineImage && supportedTextDelta === false) {
    return { mode: 'generateText', reason: 'no-text-delta' };
  }
  return { mode: 'streamText', reason: 'stream-text' };
}

/** 把非空字符串按 Responses instructions 段落语义拼接。 */
function joinInstructionParts(parts: readonly string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n\n');
}

/** 把 providerOptions 命名空间值规整成可安全合并的浅拷贝。 */
function cloneProviderOptionsNamespace(value: unknown): JSONObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return { ...(value as JSONObject) };
}

/**
 * 按 `RuntimeCallPlan.requestShapePolicy` 应用请求体形态策略。
 *
 * @param options - 当前运行时调用计划、消息与已生成的 providerOptions。
 * @returns 策略应用后的消息与 providerOptions；没有策略时保持原样引用。
 */
export function applyRuntimeRequestShapePolicy(options: {
  readonly runtimeCallPlan: RuntimeCallPlan;
  readonly messages: ModelMessage[];
  readonly providerOptions?: SharedV3ProviderOptions;
}): RuntimeRequestShapeApplication {
  const { runtimeCallPlan, messages, providerOptions } = options;
  const systemPromptPolicy = runtimeCallPlan.requestShapePolicy?.systemPrompt;
  if (!systemPromptPolicy || systemPromptPolicy.target !== 'provider-options-instructions') {
    return { messages, providerOptions };
  }

  const instructionParts: string[] = [];
  const nextMessages: ModelMessage[] = [];
  for (const message of messages) {
    if (message.role === 'system') {
      if (typeof message.content === 'string' && message.content.trim()) {
        instructionParts.push(message.content);
      }
      continue;
    }
    nextMessages.push(message);
  }

  const liftedInstructions = joinInstructionParts(instructionParts);
  if (!liftedInstructions) return { messages, providerOptions };

  const providerOptionsKey = systemPromptPolicy.providerOptionsKey.trim();
  const instructionsKey = systemPromptPolicy.instructionsKey.trim() || 'instructions';
  if (!providerOptionsKey) return { messages, providerOptions };

  const currentProviderOptions = cloneProviderOptionsNamespace(providerOptions?.[providerOptionsKey]);
  const existingInstructions = typeof currentProviderOptions[instructionsKey] === 'string'
    ? currentProviderOptions[instructionsKey]
    : '';
  const instructions = joinInstructionParts([existingInstructions, liftedInstructions]);

  return {
    messages: nextMessages,
    providerOptions: {
      ...(providerOptions ?? {}),
      [providerOptionsKey]: {
        ...currentProviderOptions,
        systemMessageMode: systemPromptPolicy.systemMessageMode,
        [instructionsKey]: instructions,
      },
    } satisfies SharedV3ProviderOptions,
  };
}

/**
 * 构建 AI SDK 文本调用参数。
 *
 * @param options - 运行时调用计划、消息与可选主聊天附加行为。
 * @returns 可传给 `generateText()` 或 `streamText()` 的参数对象。
 */
export function buildRuntimeTextCallArgs(options: RuntimeTextCallArgsOptions): RuntimeTextCallArgs {
  const {
    runtimeCallPlan,
    messages,
    signal,
    additionalMiddlewares,
    tools,
    stopWhen,
    prepareStep,
    defaultMaxOutputTokens,
  } = options;
  const middlewares = [
    ...runtimeCallPlan.middlewares,
    ...(additionalMiddlewares ?? []),
  ];
  const model = middlewares.length > 0
    ? wrapLanguageModel({
      model: runtimeCallPlan.languageModel,
      middleware: [...middlewares],
    })
    : runtimeCallPlan.languageModel;
  const requestShape = applyRuntimeRequestShapePolicy({
    runtimeCallPlan,
    messages,
    providerOptions: runtimeCallPlan.providerOptions,
  });
  const maxOutputTokens = runtimeCallPlan.callSettings.maxOutputTokens ?? defaultMaxOutputTokens;

  return {
    model,
    messages: requestShape.messages,
    ...(runtimeCallPlan.callSettings.temperature !== undefined
      ? { temperature: runtimeCallPlan.callSettings.temperature }
      : {}),
    ...(runtimeCallPlan.callSettings.topP !== undefined
      ? { topP: runtimeCallPlan.callSettings.topP }
      : {}),
    ...(maxOutputTokens !== undefined
      ? { maxOutputTokens }
      : {}),
    ...(runtimeCallPlan.callSettings.topK !== undefined
      ? { topK: runtimeCallPlan.callSettings.topK }
      : {}),
    ...(runtimeCallPlan.callSettings.presencePenalty !== undefined
      ? { presencePenalty: runtimeCallPlan.callSettings.presencePenalty }
      : {}),
    ...(runtimeCallPlan.callSettings.frequencyPenalty !== undefined
      ? { frequencyPenalty: runtimeCallPlan.callSettings.frequencyPenalty }
      : {}),
    ...(runtimeCallPlan.callSettings.seed !== undefined
      ? { seed: runtimeCallPlan.callSettings.seed }
      : {}),
    ...(runtimeCallPlan.callSettings.stopSequences && runtimeCallPlan.callSettings.stopSequences.length > 0
      ? { stopSequences: runtimeCallPlan.callSettings.stopSequences }
      : {}),
    ...(signal ? { abortSignal: signal } : {}),
    maxRetries: 0,
    ...(tools ? { tools } : {}),
    ...(stopWhen ? { stopWhen } : {}),
    ...(prepareStep ? { prepareStep } : {}),
    ...(requestShape.providerOptions ? { providerOptions: requestShape.providerOptions } : {}),
  } as RuntimeTextCallArgs;
}
