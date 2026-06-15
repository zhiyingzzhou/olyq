/**
 * 说明：`useModelManagerProviderDialog.spec` 组件模块。
 *
 * 职责：
 * - 覆盖 Add/Edit Provider 保存链路中的专用凭据校验；
 * - 保证 Bedrock / Vertex express API Key 模式不会把 API endpoint 误保存为密钥。
 *
 * 边界：
 * - 本测试只覆盖 provider dialog Hook 的保存前校验；
 * - Bedrock 运行时 adapter 与 schema 的 URL-like 过滤由 AI 层测试覆盖。
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TFunction } from 'i18next';

import { useModelManagerProviderDialog } from './useModelManagerProviderDialog';
import type { Provider, ProviderFormState } from '../shared';

const { toastError } = vi.hoisted(() => ({
  toastError: vi.fn(),
}));

vi.mock('@/hooks/useToast', () => ({
  toast: {
    error: toastError,
  },
}));

/** 构造最小 Provider 表单，聚焦保存前校验行为。 */
function createProviderForm(overrides: Partial<ProviderFormState> = {}): ProviderFormState {
  return {
    name: 'Bedrock',
    type: 'aws-bedrock',
    authType: undefined,
    apiHost: 'https://bedrock-runtime.us-east-1.amazonaws.com',
    anthropicApiHost: '',
    apiVersion: '',
    logo: '',
    apiOptions: undefined,
    apiKeyAuth: undefined,
    serviceTier: undefined,
    verbosity: undefined,
    anthropicCacheControl: undefined,
    bedrock: {
      authType: 'apiKey',
      region: 'us-east-1',
      apiKey: '',
    },
    vertex: undefined,
    rateLimit: '',
    notes: '',
    ...overrides,
  };
}

/** 渲染 provider dialog Hook，并返回关键 spy。 */
function renderProviderDialogHook() {
  const commitProviders = vi.fn();
  const updateProvider = vi.fn();
  const hook = renderHook(() => useModelManagerProviderDialog({
    commitProviders,
    confirm: vi.fn(async () => true),
    getProviderDisplayName: (provider: Pick<Provider, 'id' | 'name'>) => provider.name || provider.id,
    providers: [],
    selectedId: 'bedrock',
    setSelectedId: vi.fn(),
    t: ((key: string) => key) as TFunction,
    updateProvider,
  }));
  return { hook, commitProviders, updateProvider };
}

describe('useModelManagerProviderDialog', () => {
  beforeEach(() => {
    toastError.mockReset();
  });

  it('Bedrock API Key 保存会拒绝 URL-like 输入', () => {
    const { hook, updateProvider } = renderProviderDialogHook();

    act(() => {
      hook.result.current.setEditingProviderId('bedrock');
      hook.result.current.setAddProviderForm(createProviderForm({
        bedrock: {
          authType: 'apiKey',
          region: 'us-east-1',
          apiKey: 'https://bedrock-runtime.us-east-1.amazonaws.com/model/foo',
        },
      }));
    });
    act(() => {
      hook.result.current.saveProvider();
    });

    expect(toastError).toHaveBeenCalledWith('modelManagerPanel.apiKey.errorUrlLike');
    expect(updateProvider).not.toHaveBeenCalled();
  });

  it('Bedrock API Key 保存会清理 Bearer 前缀并只保留有效 key', () => {
    const { hook, updateProvider } = renderProviderDialogHook();

    act(() => {
      hook.result.current.setEditingProviderId('bedrock');
      hook.result.current.setAddProviderForm(createProviderForm({
        bedrock: {
          authType: 'apiKey',
          region: 'us-east-1',
          apiKey: 'Bearer bedrock-valid-key',
        },
      }));
    });
    act(() => {
      hook.result.current.saveProvider();
    });

    expect(updateProvider).toHaveBeenCalledWith('bedrock', expect.objectContaining({
      bedrock: {
        authType: 'apiKey',
        region: 'us-east-1',
        apiKey: 'bedrock-valid-key',
      },
    }));
  });

  it('Vertex express API Key 保存会拒绝 URL-like 输入', () => {
    const { hook, updateProvider } = renderProviderDialogHook();

    act(() => {
      hook.result.current.setEditingProviderId('vertexai');
      hook.result.current.setAddProviderForm(createProviderForm({
        name: 'Vertex',
        type: 'vertexai',
        apiHost: 'https://{region}-aiplatform.googleapis.com',
        bedrock: undefined,
        vertex: {
          authType: 'apiKey',
          apiKey: 'https://aiplatform.googleapis.com/v1/publishers/google',
        },
      }));
    });
    act(() => {
      hook.result.current.saveProvider();
    });

    expect(toastError).toHaveBeenCalledWith('modelManagerPanel.apiKey.errorUrlLike');
    expect(updateProvider).not.toHaveBeenCalled();
  });

  it('Vertex express API Key 保存会清理 Bearer 前缀并只保留有效 key', () => {
    const { hook, updateProvider } = renderProviderDialogHook();

    act(() => {
      hook.result.current.setEditingProviderId('vertexai');
      hook.result.current.setAddProviderForm(createProviderForm({
        name: 'Vertex',
        type: 'vertexai',
        apiHost: 'https://{region}-aiplatform.googleapis.com',
        bedrock: undefined,
        vertex: {
          authType: 'apiKey',
          apiKey: 'Bearer vertex-valid-key',
        },
      }));
    });
    act(() => {
      hook.result.current.saveProvider();
    });

    expect(updateProvider).toHaveBeenCalledWith('vertexai', expect.objectContaining({
      vertex: {
        authType: 'apiKey',
        apiKey: 'vertex-valid-key',
      },
    }));
  });
});
