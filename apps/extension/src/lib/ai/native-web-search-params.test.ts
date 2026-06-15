/**
 * 说明：`native-web-search-params.test` AI 能力模块。
 *
 * 职责：
 * - 固化 `topic.modelParams.nativeWebSearch` 的唯一 schema 与清洗规则；
 * - 验证 provider-hosted tool factory 参数和 OpenRouter raw server tool 参数不会回退到废弃字段；
 * - 防止未支持 provider 被意外展示或下发伪参数。
 */
import { describe, expect, it } from 'vitest';

import type { NativeWebSearchCapability } from './native-web-search-capability';
import {
  buildModelParamsWithNativeWebSearchConfig,
  buildNativeWebSearchToolArgs,
  buildOpenRouterNativeWebSearchParameters,
  normalizeNativeWebSearchConfigMap,
  normalizeNativeWebSearchDomains,
  readNativeWebSearchProviderConfig,
  resolveNativeWebSearchParameterDescriptor,
} from './native-web-search-params';

/** 构造测试用 supported capability。 */
function makeCapability(
  overrides: Partial<NativeWebSearchCapability>,
): NativeWebSearchCapability {
  return {
    state: 'supported',
    injectionKind: 'provider-hosted-tool',
    officialEntry: 'test',
    evidenceDate: '2026-05-20',
    reason: 'test fixture',
    ...overrides,
  };
}

describe('native web search params', () => {
  it('会归一化域名输入，去掉协议、路径、端口和重复值', () => {
    expect(normalizeNativeWebSearchDomains([
      'https://Example.com/path?q=1',
      'example.com',
      'sub.example.com:443',
      'invalid_domain',
      'https://user@example.org/a',
      'bad..example.com',
    ])).toEqual(['example.com', 'sub.example.com', 'example.org']);

    expect(normalizeNativeWebSearchDomains('openai.com, anthropic.com; https://docs.x.ai/tools')).toEqual([
      'openai.com',
      'anthropic.com',
      'docs.x.ai',
    ]);
  });

  it('只保留已声明 provider namespace 的当前 schema 字段', () => {
    expect(normalizeNativeWebSearchConfigMap({
      openai: {
        searchContextSize: 'high',
        allowedDomains: ['OpenAI.com'],
        userLocation: { type: 'exact', country: 'us', city: ' San Francisco ' },
        externalWebAccess: false,
        web_search_options: { enabled: true },
      },
      xai: {
        allowedDomains: ['a.com', 'b.com', 'c.com', 'd.com', 'e.com', 'f.com'],
        excludedDomains: 'bad.com https://skip.example/path',
        enableImageUnderstanding: true,
      },
      gemini: { fake: true },
    })).toEqual({
      openai: {
        searchContextSize: 'high',
        allowedDomains: ['openai.com'],
        userLocation: { type: 'approximate', country: 'US', city: 'San Francisco' },
        externalWebAccess: false,
      },
      xai: {
        allowedDomains: ['a.com', 'b.com', 'c.com', 'd.com', 'e.com'],
        enableImageUnderstanding: true,
      },
    });
  });

  it('会把 OpenAI Responses 配置映射成 AI SDK webSearch camelCase 参数', () => {
    const args = buildNativeWebSearchToolArgs(
      makeCapability({
        toolName: 'native__openai_web_search',
        officialEntry: 'OpenAI Responses web_search tool',
      }),
      {
        nativeWebSearch: {
          openai: {
            searchContextSize: 'low',
            allowedDomains: ['https://example.com/a', 'OpenAI.com'],
            userLocation: { type: 'approximate', country: 'us', timezone: 'America/Los_Angeles' },
            externalWebAccess: false,
          },
        },
      },
    );

    expect(args).toEqual({
      searchContextSize: 'low',
      filters: { allowedDomains: ['example.com', 'openai.com'] },
      userLocation: { type: 'approximate', country: 'US', timezone: 'America/Los_Angeles' },
      externalWebAccess: false,
    });
  });

  it('会把 Anthropic 与 xAI 配置映射为各自 provider-hosted tool 参数', () => {
    expect(buildNativeWebSearchToolArgs(
      makeCapability({
        toolName: 'native__anthropic_web_search',
        officialEntry: 'Anthropic Messages web_search_20260209 tool',
      }),
      {
        nativeWebSearch: {
          anthropic: {
            maxUses: 3,
            allowedDomains: ['anthropic.com'],
            blockedDomains: ['ads.example'],
            userLocation: { type: 'approximate', city: ' Paris ', country: 'fr' },
          },
        },
      },
    )).toEqual({
      maxUses: 3,
      allowedDomains: ['anthropic.com'],
      userLocation: { type: 'approximate', country: 'FR', city: 'Paris' },
    });

    expect(buildNativeWebSearchToolArgs(
      makeCapability({
        toolName: 'native__xai_web_search',
        officialEntry: 'xAI Responses web_search tool',
      }),
      {
        nativeWebSearch: {
          xai: {
            allowedDomains: ['a.com', 'b.com', 'c.com', 'd.com', 'e.com', 'f.com'],
            excludedDomains: ['skip.com'],
            enableImageUnderstanding: true,
          },
        },
      },
    )).toEqual({
      allowedDomains: ['a.com', 'b.com', 'c.com', 'd.com', 'e.com'],
      enableImageUnderstanding: true,
    });
  });

  it('会按 provider 官方限制清理互斥域名过滤', () => {
    expect(normalizeNativeWebSearchConfigMap({
      anthropic: {
        blockedDomains: ['blocked.example'],
      },
      xai: {
        excludedDomains: ['skip.example'],
      },
      openrouter: {
        engine: 'native',
        allowedDomains: ['docs.example'],
        excludedDomains: ['bad.example'],
      },
    })).toEqual({
      anthropic: { blockedDomains: ['blocked.example'] },
      xai: { excludedDomains: ['skip.example'] },
      openrouter: {
        engine: 'native',
        allowedDomains: ['docs.example'],
      },
    });

    expect(normalizeNativeWebSearchConfigMap({
      openrouter: {
        engine: 'exa',
        allowedDomains: ['docs.example'],
        excludedDomains: ['bad.example'],
      },
    })).toEqual({
      openrouter: {
        engine: 'exa',
        allowedDomains: ['docs.example'],
        excludedDomains: ['bad.example'],
      },
    });
  });

  it('会把 OpenRouter 配置映射成 openrouter:web_search server tool 的 snake_case 参数', () => {
    expect(buildOpenRouterNativeWebSearchParameters({
      nativeWebSearch: {
        openrouter: {
          engine: 'exa',
          maxResults: 50,
          maxTotalResults: 12,
          searchContextSize: 'medium',
          allowedDomains: ['https://docs.example/a'],
          excludedDomains: ['bad.example'],
          userLocation: { type: 'approximate', country: 'us' },
        },
      },
    })).toEqual({
      engine: 'exa',
      max_results: 25,
      max_total_results: 12,
      search_context_size: 'medium',
      allowed_domains: ['docs.example'],
      excluded_domains: ['bad.example'],
      user_location: { type: 'approximate', country: 'US' },
    });
  });

  it('无可配置参数的 provider 不展示也不下发参数', () => {
    const descriptor = resolveNativeWebSearchParameterDescriptor(makeCapability({
      toolName: 'native__google_search',
      officialEntry: 'Gemini Google Search grounding tool',
    }));

    expect(descriptor.hasConfigurableFields).toBe(false);
    expect(readNativeWebSearchProviderConfig(descriptor.providerKey, {
      nativeWebSearch: { openai: { searchContextSize: 'high' } },
    })).toBeUndefined();
    expect(buildNativeWebSearchToolArgs(
      makeCapability({
        toolName: 'native__google_search',
        officialEntry: 'Gemini Google Search grounding tool',
      }),
      { nativeWebSearch: { openai: { searchContextSize: 'high' } } },
    )).toBeUndefined();
  });

  it('写回当前 provider 配置时保留其它 namespace，并移除空 nativeWebSearch 根对象', () => {
    expect(buildModelParamsWithNativeWebSearchConfig({
      modelParams: {
        seed: 7,
        nativeWebSearch: {
          openai: { allowedDomains: ['old.example'] },
          anthropic: { maxUses: 2 },
        },
      },
      providerKey: 'openai',
      config: undefined,
    })).toEqual({
      seed: 7,
      nativeWebSearch: {
        anthropic: { maxUses: 2 },
      },
    });

    expect(buildModelParamsWithNativeWebSearchConfig({
      modelParams: { nativeWebSearch: { openai: { allowedDomains: ['old.example'] } } },
      providerKey: 'openai',
      config: undefined,
    })).toBeUndefined();
  });
});
