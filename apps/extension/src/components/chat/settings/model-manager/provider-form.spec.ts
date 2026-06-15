/**
 * 说明：`provider-form.spec` 组件模块。
 *
 * 职责：
 * - 承载 `provider-form.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { describe, expect, it } from 'vitest';

import {
  mergeProviderFormPatchByType,
  sanitizeProviderAdvancedConfigByType,
  sanitizeProviderPersistedAdvancedConfigByType,
} from './provider-form';
import type { ProviderFormState } from './shared';

/**
 * 测试辅助函数：`createProviderForm`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function createProviderForm(overrides: Partial<ProviderFormState> = {}): ProviderFormState {
  return {
    name: 'Test Provider',
    type: 'openai',
    authType: undefined,
    apiHost: 'https://example.com/v1',
    anthropicApiHost: '',
    apiVersion: '',
    logo: '',
    apiOptions: undefined,
    apiKeyAuth: undefined,
    serviceTier: undefined,
    verbosity: undefined,
    anthropicCacheControl: undefined,
    bedrock: undefined,
    vertex: undefined,
    rateLimit: '',
    notes: '',
    ...overrides,
  };
}

describe('provider-form sanitizeProviderAdvancedConfigByType', () => {
  it('从 new-api 切到 openai 时会清空 Anthropic Messages 专属地址', () => {
    const next = mergeProviderFormPatchByType(
      createProviderForm({
        type: 'new-api',
        anthropicApiHost: 'https://anthropic.example/v1',
      }),
      { type: 'openai' },
    );

    expect(next.type).toBe('openai');
    expect(next.anthropicApiHost).toBe('');
  });

  it('API Key 平台会保留自定义鉴权配置，切换到本地或专用鉴权平台会清理', () => {
    const withApiKeyAuth = createProviderForm({
      type: 'openai',
      apiKeyAuth: { headerName: 'xi-api-key' },
    });

    expect(sanitizeProviderAdvancedConfigByType(withApiKeyAuth).apiKeyAuth).toEqual({
      headerName: 'xi-api-key',
    });

    const ollama = mergeProviderFormPatchByType(withApiKeyAuth, { type: 'ollama' });
    expect(ollama.apiKeyAuth).toBeUndefined();

    const vertex = mergeProviderFormPatchByType(withApiKeyAuth, { type: 'vertexai' });
    expect(vertex.apiKeyAuth).toBeUndefined();

    const bedrock = mergeProviderFormPatchByType(withApiKeyAuth, { type: 'aws-bedrock' });
    expect(bedrock.apiKeyAuth).toBeUndefined();
  });

  it('OAuth 平台会清理 API Key 鉴权配置', () => {
    const next = sanitizeProviderAdvancedConfigByType(
      createProviderForm({
        type: 'openai',
        authType: 'oauth',
        apiKeyAuth: { headerName: 'Authorization', valuePrefix: 'Bearer' },
      }),
    );

    expect(next.apiKeyAuth).toBeUndefined();
  });

  it('保存前会丢弃非法 API Key 鉴权 header，但保留空前缀裸 key', () => {
    const invalid = sanitizeProviderPersistedAdvancedConfigByType(
      createProviderForm({
        type: 'openai',
        apiKeyAuth: { headerName: 'bad header', valuePrefix: 'Bearer' },
      }),
    );

    const rawKey = sanitizeProviderPersistedAdvancedConfigByType(
      createProviderForm({
        type: 'openai',
        apiKeyAuth: { headerName: 'Authorization', valuePrefix: '  ' },
      }),
    );

    expect(invalid.apiKeyAuth).toBeUndefined();
    expect(rawKey.apiKeyAuth).toEqual({ headerName: 'Authorization' });
  });

  it('保存前会把空自定义鉴权草稿清理为平台默认配置', () => {
    const draft = sanitizeProviderPersistedAdvancedConfigByType(
      createProviderForm({
        type: 'openai',
        apiKeyAuth: { headerName: '', valuePrefix: 'Token' },
      }),
    );

    expect(draft.apiKeyAuth).toBeUndefined();
  });

  it('new-api 会保留 Anthropic Messages 专属地址', () => {
    const next = sanitizeProviderAdvancedConfigByType(
      createProviderForm({
        type: 'new-api',
        anthropicApiHost: 'https://anthropic.example/v1',
      }),
    );

    expect(next.type).toBe('new-api');
    expect(next.anthropicApiHost).toBe('https://anthropic.example/v1');
  });

  it('切换到 openai 时会清空不再适用的 Bedrock / Vertex / Anthropic 残留配置', () => {
    const next = mergeProviderFormPatchByType(
      createProviderForm({
        type: 'aws-bedrock',
        anthropicApiHost: 'https://anthropic.example/v1',
        apiVersion: '2024-10-21',
        bedrock: {
          authType: 'iam',
          region: 'us-east-1',
          accessKeyId: 'ak',
          secretAccessKey: 'sk',
        },
        vertex: {
          authType: 'serviceAccount',
          projectId: 'demo-project',
          location: 'us-central1',
          serviceAccount: {
            clientEmail: 'svc@example.iam.gserviceaccount.com',
            privateKey: 'private-key',
          },
        },
        anthropicCacheControl: {
          tokenThreshold: 2048,
          cacheSystemMessage: true,
          cacheLastNMessages: 2,
        },
      }),
      { type: 'openai' },
    );

    expect(next.type).toBe('openai');
    expect(next.bedrock).toBeUndefined();
    expect(next.vertex).toBeUndefined();
    expect(next.anthropicCacheControl).toBeUndefined();
    expect(next.anthropicApiHost).toBe('');
    expect(next.apiVersion).toBe('');
  });

  it('vertex-anthropic 会保留 Vertex 与 Anthropic caching，但会清空 OpenAI 风格兼容参数', () => {
    const next = sanitizeProviderAdvancedConfigByType(
      createProviderForm({
        type: 'vertex-anthropic',
        apiOptions: {
          isNotSupportImageInput: true,
        },
        serviceTier: 'priority',
        verbosity: 'high',
        anthropicCacheControl: {
          tokenThreshold: 2048,
          cacheSystemMessage: true,
          cacheLastNMessages: 2,
        },
        bedrock: {
          authType: 'apiKey',
          region: 'us-east-1',
          apiKey: 'bedrock-key',
        },
        vertex: {
          authType: 'serviceAccount',
          projectId: 'demo-project',
          location: 'us-central1',
          serviceAccount: {
            clientEmail: 'svc@example.iam.gserviceaccount.com',
            privateKey: 'private-key',
          },
        },
      }),
    );

    expect(next.vertex).toEqual({
      authType: 'serviceAccount',
      projectId: 'demo-project',
      location: 'us-central1',
      serviceAccount: {
        clientEmail: 'svc@example.iam.gserviceaccount.com',
        privateKey: 'private-key',
      },
    });
    expect(next.anthropicCacheControl).toEqual({
      tokenThreshold: 2048,
      cacheSystemMessage: true,
      cacheLastNMessages: 2,
    });
    expect(next.apiOptions).toBeUndefined();
    expect(next.serviceTier).toBeUndefined();
    expect(next.verbosity).toBeUndefined();
    expect(next.bedrock).toBeUndefined();
  });

  it('vertexai 会保留 Vertex 基础配置，但不会保留 Vertex Anthropic 专属缓存配置', () => {
    const next = mergeProviderFormPatchByType(
      createProviderForm({
        type: 'vertex-anthropic',
        anthropicCacheControl: {
          tokenThreshold: 1024,
          cacheSystemMessage: false,
          cacheLastNMessages: 1,
        },
        vertex: {
          authType: 'serviceAccount',
          projectId: 'demo-project',
          location: 'us-central1',
          serviceAccount: {
            clientEmail: 'svc@example.iam.gserviceaccount.com',
            privateKey: 'private-key',
          },
        },
      }),
      { type: 'vertexai' },
    );

    expect(next.type).toBe('vertexai');
    expect(next.vertex).toEqual({
      authType: 'serviceAccount',
      projectId: 'demo-project',
      location: 'us-central1',
      serviceAccount: {
        clientEmail: 'svc@example.iam.gserviceaccount.com',
        privateKey: 'private-key',
      },
    });
    expect(next.anthropicCacheControl).toBeUndefined();
  });

  it('vertexai 的 API Key 模式只保留 express mode key，不保留 Service Account 字段', () => {
    const next = sanitizeProviderAdvancedConfigByType(
      createProviderForm({
        type: 'vertexai',
        vertex: {
          authType: 'apiKey',
          apiKey: 'vertex-api-key',
          projectId: 'demo-project',
          location: 'us-central1',
          serviceAccount: {
            clientEmail: 'svc@example.iam.gserviceaccount.com',
            privateKey: 'private-key',
          },
        },
      }),
    );

    expect(next.vertex).toEqual({
      authType: 'apiKey',
      apiKey: 'vertex-api-key',
    });
  });

  it('vertex-anthropic 会强制切成 Service Account，丢弃 API Key 模式', () => {
    const next = sanitizeProviderAdvancedConfigByType(
      createProviderForm({
        type: 'vertex-anthropic',
        vertex: {
          authType: 'apiKey',
          apiKey: 'vertex-api-key',
        },
      }),
    );

    expect(next.vertex).toEqual({
      authType: 'serviceAccount',
      projectId: '',
      location: '',
      serviceAccount: {
        clientEmail: '',
        privateKey: '',
      },
    });
  });
});
