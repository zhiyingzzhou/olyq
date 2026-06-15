/**
 * 说明：`native-web-search-request-body.test` AI 能力模块。
 *
 * 职责：
 * - 用 AI SDK 真实 provider adapter 固化内置联网搜索请求体形态；
 * - 防止再次把 OpenAI Responses 搜索误实现成无效 `web_search_options`。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { streamText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createVertex } from '@ai-sdk/google-vertex/edge';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { anthropicAdapter } from './providers/anthropic-adapter';
import { dashscopeAdapter } from './providers/dashscope-adapter';
import { xaiAdapter } from './providers/xai-adapter';
import { buildRuntimeTextCallArgs } from './runtime-text-call';
import type { RuntimeCallPlan } from './stream-chat-context';
import type { NativeWebSearchCapability } from './native-web-search-capability';
import type { ProviderConfig } from './types';

/** 消费 AI SDK 流，直到 mock provider 用 400 停止请求体捕获。 */
async function drainCapturedStream(result: { readonly fullStream: AsyncIterable<{ readonly type: string }> }) {
  try {
    for await (const part of result.fullStream) {
      if (part.type === 'error') break;
    }
  } catch {
    // 捕获请求体用例只关心发出的 payload；mock 400 是测试里的受控终止信号。
  }
}

describe('native web search request body', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('OpenAI Responses reasoning 请求会把 system prompt 提升为顶层 instructions', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const provider = createOpenAI({
      apiKey: 'test-key',
      fetch: async (_url, init) => {
        capturedBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
        return new Response(JSON.stringify({ error: { message: 'stop after capture' } }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    const runtimeCallPlan: RuntimeCallPlan = {
      context: {
        providerOptionsKey: 'openai',
        resolvedModelMeta: { transportProtocol: 'openai-responses' },
      } as unknown as RuntimeCallPlan['context'],
      languageModel: provider.responses('gpt-5.4'),
      providerOptions: {
        openai: {
          systemMessageMode: 'system',
          reasoningEffort: 'high',
          store: false,
        },
      },
      requestShapePolicy: {
        systemPrompt: {
          target: 'provider-options-instructions',
          providerOptionsKey: 'openai',
          instructionsKey: 'instructions',
          systemMessageMode: 'remove',
        },
      },
      callSettings: {},
      middlewares: [],
      executionMode: 'streamText',
      wantsInlineImage: false,
      supportsInlineImage: false,
      hasInjectedMcpTools: false,
      toolParameterSupport: { tools: true, toolChoice: true },
      openAiResponsesStoreAutoStrategyApplied: true,
      openAiResponsesStoreKnownUnsupported: false,
      openAiResponsesStoreValue: false,
    };

    await drainCapturedStream(streamText(buildRuntimeTextCallArgs({
      runtimeCallPlan,
      messages: [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'hello' },
      ],
    })));

    expect(capturedBody).toMatchObject({
      instructions: 'system prompt',
      reasoning: { effort: 'high' },
      input: [{
        role: 'user',
        content: [{ type: 'input_text', text: 'hello' }],
      }],
    });
    expect((capturedBody?.input as Array<{ role?: string }> | undefined)?.some(item => item.role === 'system')).toBe(false);
  });

  it('xAI Responses system message 保持 xAI 请求体形态，不出现 OpenAI instructions', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      return new Response(JSON.stringify({ error: { message: 'stop after capture' } }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    });
    const config: ProviderConfig = {
      id: 'xai',
      name: 'xAI',
      type: 'xai',
      apiKey: 'test-key',
      apiHost: 'https://api.x.ai/v1',
      enabled: true,
      models: [{
        id: 'grok-4',
        name: 'grok-4',
        transportProtocol: 'openai-responses',
      }],
    };
    const runtimeCallPlan: RuntimeCallPlan = {
      context: {} as RuntimeCallPlan['context'],
      languageModel: xaiAdapter.createLanguageModel(config, 'grok-4'),
      providerOptions: { xai: { reasoningEffort: 'high' } },
      callSettings: {},
      middlewares: [],
      executionMode: 'streamText',
      wantsInlineImage: false,
      supportsInlineImage: false,
      hasInjectedMcpTools: false,
      toolParameterSupport: { tools: true, toolChoice: true },
      openAiResponsesStoreAutoStrategyApplied: false,
      openAiResponsesStoreKnownUnsupported: false,
    };

    await drainCapturedStream(streamText(buildRuntimeTextCallArgs({
      runtimeCallPlan,
      messages: [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'hello' },
      ],
    })));

    expect(capturedBody).not.toHaveProperty('instructions');
    expect(capturedBody).toMatchObject({
      reasoning: { effort: 'high' },
      input: [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: [{ type: 'input_text', text: 'hello' }] },
      ],
    });
  });

  it('OpenAI-compatible Chat GPT 模型仍走 messages，不出现 Responses 顶层 instructions', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const provider = createOpenAICompatible({
      name: 'custom-openai',
      apiKey: 'test-key',
      baseURL: 'https://example.com/v1',
      fetch: async (_url, init) => {
        capturedBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
        return new Response(JSON.stringify({ error: { message: 'stop after capture' } }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    const runtimeCallPlan: RuntimeCallPlan = {
      context: {} as RuntimeCallPlan['context'],
      languageModel: provider('gpt-5.4'),
      providerOptions: { 'custom-openai': { reasoningEffort: 'high' } },
      callSettings: {},
      middlewares: [],
      executionMode: 'streamText',
      wantsInlineImage: false,
      supportsInlineImage: false,
      hasInjectedMcpTools: false,
      toolParameterSupport: { tools: true, toolChoice: true },
      openAiResponsesStoreAutoStrategyApplied: false,
      openAiResponsesStoreKnownUnsupported: false,
    };

    await drainCapturedStream(streamText(buildRuntimeTextCallArgs({
      runtimeCallPlan,
      messages: [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'hello' },
      ],
    })));

    expect(capturedBody).not.toHaveProperty('instructions');
    expect(capturedBody).not.toHaveProperty('input');
    expect(capturedBody).toMatchObject({
      messages: [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'hello' },
      ],
      reasoning_effort: 'high',
    });
  });

  it('OpenRouter Chat 上的 OpenAI 模型仍按 Chat messages 发送，不套 Responses instructions', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const provider = createOpenAICompatible({
      name: 'openrouter',
      apiKey: 'test-key',
      baseURL: 'https://openrouter.ai/api/v1',
      fetch: async (_url, init) => {
        capturedBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
        return new Response(JSON.stringify({ error: { message: 'stop after capture' } }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    const runtimeCallPlan: RuntimeCallPlan = {
      context: {} as RuntimeCallPlan['context'],
      languageModel: provider('openai/gpt-5.4'),
      providerOptions: { openrouter: { reasoning: { effort: 'high' } } },
      callSettings: {},
      middlewares: [],
      executionMode: 'streamText',
      wantsInlineImage: false,
      supportsInlineImage: false,
      hasInjectedMcpTools: false,
      toolParameterSupport: { tools: true, toolChoice: true },
      openAiResponsesStoreAutoStrategyApplied: false,
      openAiResponsesStoreKnownUnsupported: false,
    };

    await drainCapturedStream(streamText(buildRuntimeTextCallArgs({
      runtimeCallPlan,
      messages: [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'hello' },
      ],
    })));

    expect(capturedBody).not.toHaveProperty('instructions');
    expect(capturedBody).not.toHaveProperty('input');
    expect(capturedBody).toMatchObject({
      messages: [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'hello' },
      ],
      reasoning: { effort: 'high' },
    });
  });

  it('OpenAI Responses 使用 tools:[{ type:"web_search" }]，并按官方字段发送参数', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const provider = createOpenAI({
      apiKey: 'test-key',
      fetch: async (_url, init) => {
        capturedBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
        return new Response(JSON.stringify({ error: { message: 'stop after capture' } }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      },
    });

    const result = streamText({
      model: provider.responses('gpt-5.4'),
      messages: [{ role: 'user', content: 'latest international headlines' }],
      tools: {
        native__openai_web_search: provider.tools.webSearch({
          searchContextSize: 'high',
          filters: { allowedDomains: ['openai.com', 'example.com'] },
          userLocation: { type: 'approximate', country: 'US', city: 'San Francisco' },
          externalWebAccess: false,
        }),
      },
      maxRetries: 0,
    });

    await drainCapturedStream(result);

    expect(capturedBody).toMatchObject({
      tools: [{
        type: 'web_search',
        filters: { allowed_domains: ['openai.com', 'example.com'] },
        user_location: { type: 'approximate', country: 'US', city: 'San Francisco' },
        external_web_access: false,
        search_context_size: 'high',
      }],
      tool_choice: 'auto',
      include: ['web_search_call.action.sources'],
    });
    expect(capturedBody).not.toHaveProperty('web_search_options');
  });

  it('Anthropic Messages 使用 web_search_20260209，并按官方字段发送参数', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      return new Response(JSON.stringify({ error: { message: 'stop after capture' } }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    });

    const config: ProviderConfig = {
      id: 'anthropic',
      name: 'Anthropic',
      type: 'anthropic',
      apiKey: 'test-key',
      apiHost: '',
      enabled: true,
      models: [{
        id: 'claude-haiku-4-5-20251001',
        name: 'claude-haiku-4-5-20251001',
        transportProtocol: 'anthropic-messages',
      }],
    };
    const capability: NativeWebSearchCapability = {
      state: 'supported',
      injectionKind: 'provider-hosted-tool',
      toolName: 'native__anthropic_web_search',
      officialEntry: 'Anthropic Messages web_search_20260209 tool',
      evidenceDate: '2026-05-20',
      reason: 'test fixture',
    };
    const tools = anthropicAdapter.createNativeWebSearchTools?.({
      providerId: 'anthropic',
      modelId: 'claude-haiku-4-5-20251001',
      config,
      transportProtocol: 'anthropic-messages',
      capability,
      params: {
        modelParams: {
          nativeWebSearch: {
            anthropic: {
              maxUses: 3,
              allowedDomains: ['anthropic.com'],
              blockedDomains: ['ads.example'],
              userLocation: { type: 'approximate', country: 'US', city: 'New York' },
            },
          },
        },
      },
    });

    const result = streamText({
      model: anthropicAdapter.createLanguageModel(config, 'claude-haiku-4-5-20251001'),
      messages: [{ role: 'user', content: 'latest international headlines' }],
      tools,
      maxRetries: 0,
    });

    await drainCapturedStream(result);

    expect(capturedBody).toMatchObject({
      tools: [{
        type: 'web_search_20260209',
        name: 'web_search',
        allowed_callers: ['direct'],
        max_uses: 3,
        allowed_domains: ['anthropic.com'],
        user_location: { type: 'approximate', country: 'US', city: 'New York' },
      }],
    });
  });

  it('Gemini 和 Vertex 只发送 googleSearch 空工具，不发送伪参数', async () => {
    let geminiBody: Record<string, unknown> | undefined;
    const google = createGoogleGenerativeAI({
      apiKey: 'test-key',
      fetch: async (_url, init) => {
        geminiBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
        return new Response(JSON.stringify({ error: { message: 'stop after capture' } }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      },
    });

    await drainCapturedStream(streamText({
      model: google('gemini-2.5-flash'),
      messages: [{ role: 'user', content: 'latest international headlines' }],
      tools: {
        native__google_search: google.tools.googleSearch({}),
      },
      maxRetries: 0,
    }));

    expect(geminiBody).toMatchObject({
      tools: [{ googleSearch: {} }],
    });

    let vertexBody: Record<string, unknown> | undefined;
    const vertex = createVertex({
      apiKey: 'test-key',
      fetch: async (_url, init) => {
        vertexBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
        return new Response(JSON.stringify({ error: { message: 'stop after capture' } }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      },
    });

    await drainCapturedStream(streamText({
      model: vertex('gemini-2.5-flash'),
      messages: [{ role: 'user', content: 'latest international headlines' }],
      tools: {
        native__vertex_google_search: vertex.tools.googleSearch({}),
      },
      maxRetries: 0,
    }));

    expect(vertexBody).toMatchObject({
      tools: [{ googleSearch: {} }],
    });
  });

  it('xAI Responses 使用 web_search，并按官方字段发送参数', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      return new Response(JSON.stringify({ error: { message: 'stop after capture' } }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    });
    const config: ProviderConfig = {
      id: 'xai',
      name: 'xAI',
      type: 'xai',
      apiKey: 'test-key',
      apiHost: 'https://api.x.ai/v1',
      enabled: true,
      models: [{
        id: 'grok-4',
        name: 'grok-4',
        transportProtocol: 'openai-responses',
      }],
    };
    const capability: NativeWebSearchCapability = {
      state: 'supported',
      injectionKind: 'provider-hosted-tool',
      toolName: 'native__xai_web_search',
      officialEntry: 'xAI Responses web_search tool',
      evidenceDate: '2026-05-20',
      reason: 'test fixture',
    };
    const tools = xaiAdapter.createNativeWebSearchTools?.({
      providerId: 'xai',
      modelId: 'grok-4',
      config,
      transportProtocol: 'openai-responses',
      capability,
      params: {
        modelParams: {
          nativeWebSearch: {
            xai: {
              allowedDomains: ['x.ai'],
              excludedDomains: ['ads.example'],
              enableImageUnderstanding: true,
            },
          },
        },
      },
    });

    await drainCapturedStream(streamText({
      model: xaiAdapter.createLanguageModel(config, 'grok-4'),
      messages: [{ role: 'user', content: 'latest international headlines' }],
      tools,
      maxRetries: 0,
    }));

    expect(capturedBody).toMatchObject({
      tools: [{
        type: 'web_search',
        allowed_domains: ['x.ai'],
        enable_image_understanding: true,
      }],
    });
  });

  it('DashScope Responses adapter 复用 web_search 工具形态，不恢复 Chat enable_search', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      return new Response(JSON.stringify({ error: { message: 'stop after capture' } }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    });

    const config: ProviderConfig = {
      id: 'dashscope',
      name: 'DashScope',
      type: 'dashscope',
      apiKey: 'test-key',
      apiHost: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      enabled: true,
      models: [{
        id: 'qwen-max',
        name: 'qwen-max',
        transportProtocol: 'openai-responses',
      }],
    };
    const capability: NativeWebSearchCapability = {
      state: 'supported',
      injectionKind: 'provider-hosted-tool',
      toolName: 'native__dashscope_web_search',
      officialEntry: 'DashScope OpenAI-compatible Responses web_search tool',
      evidenceDate: '2026-05-20',
      reason: 'test fixture',
    };
    const tools = dashscopeAdapter.createNativeWebSearchTools?.({
      providerId: 'dashscope',
      modelId: 'qwen-max',
      config,
      transportProtocol: 'openai-responses',
      capability,
      params: {
        modelParams: {
          nativeWebSearch: {
            openai: { searchContextSize: 'high' },
          },
        },
      },
    });

    await drainCapturedStream(streamText({
      model: dashscopeAdapter.createLanguageModel(config, 'qwen-max'),
      messages: [{ role: 'user', content: 'latest international headlines' }],
      tools,
      maxRetries: 0,
    }));

    expect(capturedBody).toMatchObject({
      tools: [{ type: 'web_search' }],
    });
    expect(capturedBody).not.toHaveProperty('enable_search');
    expect(capturedBody).not.toHaveProperty('web_search_options');
  });
});
