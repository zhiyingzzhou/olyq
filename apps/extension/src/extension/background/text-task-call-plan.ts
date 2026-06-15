/**
 * 说明：`text-task-call-plan` 后台文本任务模型调用计划。
 *
 * 职责：
 * - 让 MCP 自动路由、外部联网搜索意图识别、记忆抽取/更新等后台文本任务复用聊天主链的
 *   provider/model 能力过滤、providerOptions 构造与 transport 解析；
 * - 后台任务只声明期望的 `temperature/maxTokens`，最终是否下发由 `buildRuntimeCallPlan()` 决定；
 * - 不负责工具注入，也不读取 UI 状态之外的额外模型能力。
 */
import type { LanguageModelV3, SharedV3ProviderOptions } from '@ai-sdk/provider';

import {
  buildRuntimeCallPlan,
  resolveStreamContext,
  type CallSettings,
  type RuntimeCallPlan,
} from '../../lib/ai/stream-chat-context';
import type { ModelCallParamsBase } from '../../lib/ai/types';

/** 后台文本任务可直接交给 AI SDK 的模型调用计划。 */
export interface TextTaskCallPlan {
  /** 已按 provider/transport 真源创建好的语言模型实例。 */
  readonly languageModel: LanguageModelV3;
  /** 经过 provider contract 与显式 supportedParameters 过滤后的 providerOptions。 */
  readonly providerOptions?: SharedV3ProviderOptions;
  /** 经过 adapter 基础矩阵与显式 supportedParameters 过滤后的通用 call settings。 */
  readonly callSettings: CallSettings;
  /** 原始 runtime plan，供需要诊断 executionMode 等额外信息的调用方读取。 */
  readonly runtimeCallPlan: RuntimeCallPlan;
}

/** 方便测试替换运行时计划构造依赖。 */
export interface TextTaskCallPlanDeps {
  /** 可选：替换上下文解析函数。 */
  readonly resolveContext?: typeof resolveStreamContext;
  /** 可选：替换 runtime plan 构造函数。 */
  readonly buildPlan?: typeof buildRuntimeCallPlan;
}

/**
 * 为后台文本任务构建统一模型调用计划。
 *
 * @param params - 后台任务期望的模型与普通参数。
 * @param deps - 测试依赖注入。
 * @returns 已完成 provider/model 能力过滤的调用计划。
 */
export async function buildTextTaskCallPlan(
  params: ModelCallParamsBase,
  deps: TextTaskCallPlanDeps = {},
): Promise<TextTaskCallPlan> {
  const resolveContext = deps.resolveContext ?? resolveStreamContext;
  const buildPlan = deps.buildPlan ?? buildRuntimeCallPlan;
  const ctx = await resolveContext(params);
  const runtimeCallPlan = await buildPlan(ctx, params);
  return {
    languageModel: runtimeCallPlan.languageModel,
    ...(runtimeCallPlan.providerOptions ? { providerOptions: runtimeCallPlan.providerOptions } : {}),
    callSettings: runtimeCallPlan.callSettings,
    runtimeCallPlan,
  };
}

/**
 * 把统一 call settings 转成 AI SDK `generateText()` 参数片段。
 *
 * @param callSettings - runtime plan 里已经过滤好的通用参数。
 * @returns 只包含允许下发字段的浅对象。
 */
export function toGenerateTextCallSettings(callSettings: CallSettings): Record<string, unknown> {
  return {
    ...(callSettings.temperature !== undefined ? { temperature: callSettings.temperature } : {}),
    ...(callSettings.topP !== undefined ? { topP: callSettings.topP } : {}),
    ...(callSettings.maxOutputTokens !== undefined ? { maxOutputTokens: callSettings.maxOutputTokens } : {}),
    ...(callSettings.topK !== undefined ? { topK: callSettings.topK } : {}),
    ...(callSettings.presencePenalty !== undefined ? { presencePenalty: callSettings.presencePenalty } : {}),
    ...(callSettings.frequencyPenalty !== undefined ? { frequencyPenalty: callSettings.frequencyPenalty } : {}),
    ...(callSettings.seed !== undefined ? { seed: callSettings.seed } : {}),
    ...(callSettings.stopSequences && callSettings.stopSequences.length > 0 ? { stopSequences: callSettings.stopSequences } : {}),
  };
}
