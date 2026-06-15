/**
 * 说明：`runtime-text-call.test` 共享文本调用 helper 测试。
 *
 * 职责：
 * - 锁住主聊天与 OCR 共用的 call args 组装规则；
 * - 确保执行模式只来自 runtime plan 与既有 no text-delta fallback。
 */
import { describe, expect, it } from 'vitest';

import {
  buildRuntimeTextCallArgs,
  resolveRuntimeTextExecutionMode,
} from './runtime-text-call';
import type { RuntimeCallPlan } from './stream-chat-context';

/** 构造共享 helper 测试用 runtime call plan。 */
function makeRuntimeCallPlan(overrides: Partial<RuntimeCallPlan> = {}): RuntimeCallPlan {
  return {
    context: {} as RuntimeCallPlan['context'],
    languageModel: { modelId: 'mock-model' } as RuntimeCallPlan['languageModel'],
    callSettings: {},
    middlewares: [],
    executionMode: 'streamText',
    wantsInlineImage: false,
    supportsInlineImage: false,
    hasInjectedMcpTools: false,
    toolParameterSupport: { tools: false, toolChoice: false },
    openAiResponsesStoreAutoStrategyApplied: false,
    openAiResponsesStoreKnownUnsupported: false,
    ...overrides,
  };
}

describe('runtime-text-call', () => {
  it('buildRuntimeTextCallArgs 复用 runtime plan 的模型、参数、providerOptions 并禁用隐式重试', () => {
    const plan = makeRuntimeCallPlan({
      providerOptions: { openai: { serviceTier: 'auto' } },
      callSettings: {
        temperature: 0,
        topP: 0.7,
        maxOutputTokens: 1024,
        stopSequences: ['</end>'],
      },
    });

    const args = buildRuntimeTextCallArgs({
      runtimeCallPlan: plan,
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(args).toMatchObject({
      model: plan.languageModel,
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0,
      topP: 0.7,
      maxOutputTokens: 1024,
      stopSequences: ['</end>'],
      providerOptions: { openai: { serviceTier: 'auto' } },
      maxRetries: 0,
    });
  });

  it('按 request shape policy 把 system prompt 提升为 provider instructions', () => {
    const plan = makeRuntimeCallPlan({
      requestShapePolicy: {
        systemPrompt: {
          target: 'provider-options-instructions',
          providerOptionsKey: 'openai',
          instructionsKey: 'instructions',
          systemMessageMode: 'remove',
        },
      },
      providerOptions: {
        openai: {
          systemMessageMode: 'system',
          reasoningEffort: 'high',
          store: false,
        },
      },
    });

    const args = buildRuntimeTextCallArgs({
      runtimeCallPlan: plan,
      messages: [
        { role: 'system', content: 'system prompt A' },
        { role: 'user', content: 'hi' },
        { role: 'system', content: 'system prompt B' },
      ],
    });

    expect(args.messages).toEqual([{ role: 'user', content: 'hi' }]);
    expect(args.providerOptions).toEqual({
      openai: {
        systemMessageMode: 'remove',
        reasoningEffort: 'high',
        store: false,
        instructions: 'system prompt A\n\nsystem prompt B',
      },
    });
  });

  it('没有 request shape policy 时不会按 provider/model/transport 自行猜测 instructions', () => {
    const plan = makeRuntimeCallPlan({
      context: {
        providerOptionsKey: 'openai',
        resolvedModelMeta: { transportProtocol: 'openai-responses' },
      } as unknown as RuntimeCallPlan['context'],
      providerOptions: {
        openai: {
          reasoningEffort: 'high',
        },
      },
    });
    const messages = [
      { role: 'system' as const, content: 'system prompt' },
      { role: 'user' as const, content: 'hi' },
    ];

    const args = buildRuntimeTextCallArgs({
      runtimeCallPlan: plan,
      messages,
    });

    expect(args.messages).toBe(messages);
    expect(args.providerOptions).toEqual({ openai: { reasoningEffort: 'high' } });
  });

  it('defaultMaxOutputTokens 只在 runtime plan 没有显式值时生效', () => {
    expect(buildRuntimeTextCallArgs({
      runtimeCallPlan: makeRuntimeCallPlan(),
      messages: [{ role: 'user', content: 'hi' }],
      defaultMaxOutputTokens: 1,
    })).toMatchObject({ maxOutputTokens: 1 });

    expect(buildRuntimeTextCallArgs({
      runtimeCallPlan: makeRuntimeCallPlan({ callSettings: { maxOutputTokens: 7 } }),
      messages: [{ role: 'user', content: 'hi' }],
      defaultMaxOutputTokens: 1,
    })).toMatchObject({ maxOutputTokens: 7 });
  });

  it('resolveRuntimeTextExecutionMode 默认保持 streamText', () => {
    expect(resolveRuntimeTextExecutionMode(makeRuntimeCallPlan(), undefined)).toEqual({
      mode: 'streamText',
      reason: 'stream-text',
    });
  });

  it('resolveRuntimeTextExecutionMode 尊重 runtime plan 的 generateText', () => {
    expect(resolveRuntimeTextExecutionMode(makeRuntimeCallPlan({
      executionMode: 'generateText',
    }), undefined)).toEqual({
      mode: 'generateText',
      reason: 'runtime-plan',
    });
  });

  it('resolveRuntimeTextExecutionMode 复用主聊天 no text-delta fallback', () => {
    expect(resolveRuntimeTextExecutionMode(makeRuntimeCallPlan({
      executionMode: 'streamText',
      wantsInlineImage: false,
    }), false)).toEqual({
      mode: 'generateText',
      reason: 'no-text-delta',
    });
  });
});
