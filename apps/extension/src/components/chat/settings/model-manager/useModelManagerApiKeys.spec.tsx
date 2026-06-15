/**
 * 说明：`useModelManagerApiKeys.spec` 组件模块。
 *
 * 职责：
 * - 覆盖模型管理 API Key 编辑 Hook 的 URL-like 输入拦截；
 * - 保证 inline 编辑与批量新增都复用 `api-keys.ts` 真源，不把 API 地址落入 provider.apiKey。
 *
 * 边界：
 * - 本测试只验证前端编辑保存语义；
 * - 运行时鉴权头与轮询行为由 `api-keys.test.ts`、`provider-auth.test.ts` 和 provider runtime 测试覆盖。
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { TFunction } from 'i18next';

import { useModelManagerApiKeys } from './useModelManagerApiKeys';
import type { Provider } from './shared';

const { toastError, toastSuccess } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));
const EMPTY_KEYS: ReadonlyArray<string> = [];

vi.mock('@/hooks/useToast', () => ({
  toast: {
    error: toastError,
    success: toastSuccess,
  },
}));

/** 构造最小 Provider，避免 Hook 用例依赖完整模型管理状态。 */
function makeProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: 'provider',
    name: 'Provider',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.example.com/v1',
    enabled: true,
    models: [],
    ...overrides,
  };
}

/** 渲染 API Key Hook，并注入稳定的空操作依赖。 */
function renderApiKeyHook(options: {
  readonly apiKeysForUi?: ReadonlyArray<string>;
  readonly selected?: Provider;
  readonly updateProvider?: (id: string, patch: Partial<Provider>) => void;
}) {
  const apiKeysForUi = options.apiKeysForUi ?? EMPTY_KEYS;
  const selected = options.selected ?? makeProvider();
  const updateProvider = options.updateProvider ?? vi.fn();
  const resetApiKeyHealthState = vi.fn();
  const retainApiKeyConnectivity = vi.fn();
  const setApiKeyCheckModelId = vi.fn();
  return renderHook(() => useModelManagerApiKeys({
    apiKeyCheckModelId: '',
    apiKeysForUi,
    isAnyApiKeyChecking: false,
    resetApiKeyHealthState,
    retainApiKeyConnectivity,
    selected,
    setApiKeyCheckModelId,
    t: ((key: string) => key) as TFunction,
    updateProvider,
  }));
}

describe('useModelManagerApiKeys', () => {
  beforeEach(() => {
    toastError.mockReset();
    toastSuccess.mockReset();
  });

  it('inline API Key 保存会拒绝误填的 URL', () => {
    const updateProvider = vi.fn();
    const { result } = renderApiKeyHook({ updateProvider });

    act(() => {
      result.current.setApiKeyDraft('https://api.ikuncode.cc/v1/messages');
    });
    act(() => {
      result.current.commitInlineApiKeyDraft();
    });

    expect(toastError).toHaveBeenCalledWith('modelManagerPanel.apiKey.errorUrlLike');
    expect(updateProvider).not.toHaveBeenCalled();
  });

  it('批量新增 API Key 时只要包含 URL-like 片段就阻止保存', async () => {
    const updateProvider = vi.fn();
    const { result } = renderApiKeyHook({ updateProvider });

    act(() => {
      result.current.beginAddApiKey();
    });
    await waitFor(() => expect(result.current.apiKeyEditing?.mode).toBe('add'));
    act(() => {
      result.current.setEditingValue('sk-valid\nhttps://api.ikuncode.cc/v1/messages');
    });
    await waitFor(() => expect(result.current.apiKeyEditing?.value).toBe('sk-valid\nhttps://api.ikuncode.cc/v1/messages'));
    act(() => {
      result.current.saveApiKeyEdit();
    });

    expect(toastError).toHaveBeenCalledWith('modelManagerPanel.apiKey.errorUrlLike');
    expect(updateProvider).not.toHaveBeenCalled();
  });

  it('合法批量输入仍会清理 Bearer、去重并保存', async () => {
    const updateProvider = vi.fn();
    const { result } = renderApiKeyHook({ updateProvider });

    act(() => {
      result.current.beginAddApiKey();
    });
    await waitFor(() => expect(result.current.apiKeyEditing?.mode).toBe('add'));
    act(() => {
      result.current.setEditingValue('Bearer sk-one\nsk-two\nsk-one');
    });
    await waitFor(() => expect(result.current.apiKeyEditing?.value).toBe('Bearer sk-one\nsk-two\nsk-one'));
    act(() => {
      result.current.saveApiKeyEdit();
    });

    expect(updateProvider).toHaveBeenCalledWith('provider', { apiKey: 'sk-one,sk-two' });
    expect(toastSuccess).toHaveBeenCalledWith('modelManagerPanel.apiKey.toastAdded');
  });
});
