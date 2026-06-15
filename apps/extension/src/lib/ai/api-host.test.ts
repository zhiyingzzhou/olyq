/**
 * 说明：`api-host.test` AI 能力模块。
 *
 * 职责：
 * - 承载 `api-host.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 单元测试：Gemini/Google Generative AI 的 API Host 归一化规则。
 *
 * 覆盖：
 * - 版本段补全/迁移（v1 -\> v1beta）；
 * - 移除多余 path（例如 /models）。
 */

import { describe, it, expect } from 'vitest'
import {
  normalizeAnthropicApiBase,
  normalizeGoogleGenerativeAiApiBase,
  resolveProviderApiEndpoints,
} from './api-host'

describe('normalizeGoogleGenerativeAiApiBase', () => {
  it('should append v1beta when missing version', () => {
    expect(normalizeGoogleGenerativeAiApiBase('https://www.right.codes/gemini')).toBe(
      'https://www.right.codes/gemini/v1beta',
    )
  })

  it('should migrate v1 to v1beta by default', () => {
    expect(normalizeGoogleGenerativeAiApiBase('https://www.right.codes/gemini/v1')).toBe(
      'https://www.right.codes/gemini/v1beta',
    )
  })

  it('should strip /models segment', () => {
    expect(normalizeGoogleGenerativeAiApiBase('https://www.right.codes/gemini/v1beta/models')).toBe(
      'https://www.right.codes/gemini/v1beta',
    )
  })

  it('should keep explicit version when auto-append disabled (#)', () => {
    expect(normalizeGoogleGenerativeAiApiBase('https://www.right.codes/gemini/v1#')).toBe(
      'https://www.right.codes/gemini/v1',
    )
  })
})

describe('normalizeAnthropicApiBase', () => {
  it('会在缺少版本段时补齐 /v1', () => {
    expect(normalizeAnthropicApiBase('https://sub2api.h5doc.xyz')).toBe(
      'https://sub2api.h5doc.xyz/v1',
    )
  })

  it('会保留显式 /v1', () => {
    expect(normalizeAnthropicApiBase('https://sub2api.h5doc.xyz/v1')).toBe(
      'https://sub2api.h5doc.xyz/v1',
    )
  })

  it('会剥离误填的 /messages 与 /models 端点', () => {
    expect(normalizeAnthropicApiBase('https://sub2api.h5doc.xyz/messages')).toBe(
      'https://sub2api.h5doc.xyz/v1',
    )
    expect(normalizeAnthropicApiBase('https://sub2api.h5doc.xyz/v1/models')).toBe(
      'https://sub2api.h5doc.xyz/v1',
    )
  })

  it('末尾带 # 时会禁用自动补版本段，但仍只认 Anthropic native base', () => {
    expect(normalizeAnthropicApiBase('https://sub2api.h5doc.xyz#')).toBe(
      'https://sub2api.h5doc.xyz',
    )
  })
})

describe('resolveProviderApiEndpoints', () => {
  it('Anthropic provider 会返回 /messages 预览与 /models 目录端点', () => {
    expect(resolveProviderApiEndpoints({
      providerId: 'anthropic',
      providerType: 'anthropic',
      apiBase: 'https://sub2api.h5doc.xyz',
    })).toEqual({
      baseUrl: 'https://sub2api.h5doc.xyz/v1',
      chatUrl: 'https://sub2api.h5doc.xyz/v1/messages',
      modelsUrl: 'https://sub2api.h5doc.xyz/v1/models',
      previewUrl: 'https://sub2api.h5doc.xyz/v1/messages',
      previewMode: 'chat',
      transportFamily: 'anthropic-messages',
    })
  })

  it('openai-response provider 会返回 /responses 预览', () => {
    expect(resolveProviderApiEndpoints({
      providerId: 'openai',
      providerType: 'openai-response',
      apiBase: 'https://api.example.com',
    })).toEqual({
      baseUrl: 'https://api.example.com/v1',
      chatUrl: 'https://api.example.com/v1/responses',
      modelsUrl: 'https://api.example.com/v1/models',
      previewUrl: 'https://api.example.com/v1/responses',
      previewMode: 'chat',
      transportFamily: 'openai-responses',
    })
  })

  it('OpenAI-like provider 会返回 /chat/completions 预览', () => {
    expect(resolveProviderApiEndpoints({
      providerId: 'custom-openai',
      providerType: 'openai',
      apiBase: 'https://api.example.com',
    })).toEqual({
      baseUrl: 'https://api.example.com/v1',
      chatUrl: 'https://api.example.com/v1/chat/completions',
      modelsUrl: 'https://api.example.com/v1/models',
      previewUrl: 'https://api.example.com/v1/chat/completions',
      previewMode: 'chat',
      transportFamily: 'openai-chat',
    })
  })

  it('Azure OpenAI legacy deployment 预览不会补 /v1，并会追加 api-version query', () => {
    expect(resolveProviderApiEndpoints({
      providerId: 'azure-openai',
      providerType: 'azure-openai',
      apiBase: 'https://example-resource.openai.azure.com/openai/deployments/demo',
      apiVersion: '2024-10-21',
    })).toEqual({
      baseUrl: 'https://example-resource.openai.azure.com/openai/deployments/demo',
      chatUrl: 'https://example-resource.openai.azure.com/openai/deployments/demo/chat/completions?api-version=2024-10-21',
      modelsUrl: 'https://example-resource.openai.azure.com/openai/deployments/demo/models?api-version=2024-10-21',
      previewUrl: 'https://example-resource.openai.azure.com/openai/deployments/demo/chat/completions?api-version=2024-10-21',
      previewMode: 'chat',
      transportFamily: 'azure-openai',
    })
  })

  it('Azure OpenAI v1 endpoint 预览不会追加 api-version query', () => {
    expect(resolveProviderApiEndpoints({
      providerId: 'azure-openai',
      providerType: 'azure-openai',
      apiBase: 'https://example-resource.openai.azure.com/openai/v1',
      skipApiVersion: true,
    })).toEqual({
      baseUrl: 'https://example-resource.openai.azure.com/openai/v1',
      chatUrl: 'https://example-resource.openai.azure.com/openai/v1/chat/completions',
      modelsUrl: 'https://example-resource.openai.azure.com/openai/v1/models',
      previewUrl: 'https://example-resource.openai.azure.com/openai/v1/chat/completions',
      previewMode: 'chat',
      transportFamily: 'azure-openai',
    })
  })

  it('Gemini provider 会返回 /models 预览', () => {
    expect(resolveProviderApiEndpoints({
      providerId: 'google',
      providerType: 'gemini',
      apiBase: 'https://generativelanguage.googleapis.com',
    })).toEqual({
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      chatUrl: null,
      modelsUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
      previewUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
      previewMode: 'models',
      transportFamily: 'gemini-generate-content',
    })
  })

  it('AWS Bedrock provider 预览 base 时不会自动补 OpenAI 风格 /v1', () => {
    expect(resolveProviderApiEndpoints({
      providerId: 'aws-bedrock',
      providerType: 'aws-bedrock',
      apiBase: 'https://bedrock-runtime.us-east-1.amazonaws.com',
    })).toEqual({
      baseUrl: 'https://bedrock-runtime.us-east-1.amazonaws.com',
      chatUrl: null,
      modelsUrl: null,
      previewUrl: 'https://bedrock-runtime.us-east-1.amazonaws.com',
      previewMode: 'base',
      transportFamily: 'bedrock-converse',
    })
  })

  it('new-api 在 provider 级别无法唯一确定 transport 时只预览 base', () => {
    expect(resolveProviderApiEndpoints({
      providerId: 'new-api',
      providerType: 'new-api',
      apiBase: 'https://sub-api.example.com',
    })).toEqual({
      baseUrl: 'https://sub-api.example.com/v1',
      chatUrl: null,
      modelsUrl: null,
      previewUrl: 'https://sub-api.example.com/v1',
      previewMode: 'transport-dependent',
      transportFamily: 'proxy',
    })
  })

  it('gateway 在显式命中 openai-responses transport 时会返回 /responses 预览', () => {
    expect(resolveProviderApiEndpoints({
      providerId: 'gateway-custom',
      providerType: 'gateway',
      apiBase: 'https://gateway.example.com',
      transportProtocol: 'openai-responses',
    })).toEqual({
      baseUrl: 'https://gateway.example.com/v1',
      chatUrl: 'https://gateway.example.com/v1/responses',
      modelsUrl: 'https://gateway.example.com/v1/models',
      previewUrl: 'https://gateway.example.com/v1/responses',
      previewMode: 'chat',
      transportFamily: 'openai-responses',
    })
  })
})
