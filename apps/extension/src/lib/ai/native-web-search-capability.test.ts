/**
 * 说明：`native-web-search-capability.test` AI 能力模块。
 *
 * 职责：
 * - 固化模型内置联网搜索三态矩阵；
 * - 确保 UI 与运行时不会再按 OpenAI-compatible 模型名泛化猜测联网能力。
 */
import { describe, expect, it } from 'vitest';

import { resolveNativeWebSearchCapability, supportsNativeWebSearch } from './native-web-search-capability';

describe('native-web-search-capability', () => {
  it('OpenAI GPT-5 在 Responses transport 下通过 provider-hosted web_search tool 支持内置搜索', () => {
    expect(resolveNativeWebSearchCapability({
      providerId: 'openai',
      providerType: 'openai',
      effectiveProviderType: 'openai-response',
      transportProtocol: 'openai-responses',
      modelId: 'gpt-5.4',
    })).toMatchObject({
      state: 'supported',
      injectionKind: 'provider-hosted-tool',
      toolName: 'native__openai_web_search',
    });
  });

  it('OpenRouter 使用 raw server tool，而不是 deprecated plugins', () => {
    expect(resolveNativeWebSearchCapability({
      providerId: 'openrouter',
      providerType: 'openai',
      transportProtocol: 'openai-chat',
      modelId: 'openai/gpt-5.4',
    })).toMatchObject({
      state: 'supported',
      injectionKind: 'raw-server-tool',
      officialEntry: 'OpenRouter openrouter:web_search server tool',
    });
  });

  it('Anthropic Haiku 4.5 走 direct-only web_search_20260209，不按 programmatic tool calling 试探', () => {
    expect(resolveNativeWebSearchCapability({
      providerId: 'anthropic',
      providerType: 'anthropic',
      effectiveProviderType: 'anthropic',
      transportProtocol: 'anthropic-messages',
      modelId: 'claude-haiku-4-5-20251001',
    })).toMatchObject({
      state: 'supported',
      injectionKind: 'provider-hosted-tool',
      toolName: 'native__anthropic_web_search',
    });
  });

  it('search-native 模型不要求 tools 参数支持', () => {
    expect(resolveNativeWebSearchCapability({
      providerId: 'perplexity',
      providerType: 'openai',
      transportProtocol: 'openai-chat',
      modelId: 'sonar-pro',
      supportedParameters: ['max_tokens'],
    })).toMatchObject({
      state: 'supported',
      injectionKind: 'search-native-model',
    });
  });

  it('普通 OpenAI-compatible、Azure 与 DashScope Chat 不展示内置搜索', () => {
    expect(supportsNativeWebSearch({
      providerId: 'moonshot',
      providerType: 'openai',
      transportProtocol: 'openai-chat',
      modelId: 'gpt-4o-search-preview',
    })).toBe(false);
    expect(resolveNativeWebSearchCapability({
      providerId: 'azure-openai',
      providerType: 'azure-openai',
      transportProtocol: 'openai-chat',
      modelId: 'gpt-5.4',
    })).toMatchObject({ state: 'unverified', injectionKind: 'unsupported' });
    expect(supportsNativeWebSearch({
      providerId: 'qwen',
      providerType: 'dashscope',
      transportProtocol: 'openai-chat',
      modelId: 'qwen-plus',
    })).toBe(false);
  });

  it('NewAPI/Gateway 聚合入口不按模型名借用官方 OpenAI 或 Gemini 搜索结论', () => {
    expect(resolveNativeWebSearchCapability({
      providerId: 'new-api',
      providerType: 'new-api',
      effectiveProviderType: 'openai-response',
      transportProtocol: 'openai-responses',
      modelId: 'gpt-5.4',
    })).toMatchObject({ state: 'unsupported', injectionKind: 'unsupported' });

    expect(resolveNativeWebSearchCapability({
      providerId: 'new-api',
      providerType: 'new-api',
      effectiveProviderType: 'gemini',
      transportProtocol: 'gemini-generate-content',
      modelId: 'gemini-3-pro',
    })).toMatchObject({ state: 'unsupported', injectionKind: 'unsupported' });

    expect(resolveNativeWebSearchCapability({
      providerId: 'gateway',
      providerType: 'gateway',
      effectiveProviderType: 'gateway',
      transportProtocol: 'openai-responses',
      modelId: 'gpt-5.4',
    })).toMatchObject({ state: 'unsupported', injectionKind: 'unsupported' });
  });
});
