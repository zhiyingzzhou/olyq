/**
 * 说明：`useModelManagerProviderDialog.spec` 组件模块。
 *
 * 职责：
 * - 锁定模型平台删除确认的共享危险确认入参；
 * - 防止模型管理面板重新退回只有标题的 destructive 确认。
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useModelManagerProviderDialog } from './useModelManagerProviderDialog';
import type { Provider } from '../shared';

/** 构造最小 Provider，便于测试删除确认路径。 */
function createProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: 'custom-openai',
    name: 'Custom OpenAI',
    type: 'openai',
    apiKey: 'sk',
    apiHost: 'https://api.example.com/v1',
    enabled: true,
    models: [],
    ...overrides,
  };
}

describe('useModelManagerProviderDialog', () => {
  it('删除模型平台时会传入完整 destructive 确认文案', async () => {
    const provider = createProvider();
    const confirm = vi.fn(async () => false);
    const commitProviders = vi.fn();

    const { result } = renderHook(() => useModelManagerProviderDialog({
      commitProviders,
      confirm,
      getProviderDisplayName: (item) => item.name,
      providers: [provider],
      selectedId: provider.id,
      setSelectedId: vi.fn(),
      t: ((key: string, params?: Record<string, unknown>) => params?.name ? `${key}:${String(params.name)}` : key) as never,
      updateProvider: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleRemoveProvider(provider);
    });

    expect(confirm).toHaveBeenCalledWith({
      title: 'modelManagerPanel.deleteProvider.confirm:Custom OpenAI',
      description: 'modelManagerPanel.deleteProvider.desc:Custom OpenAI',
      confirmLabel: 'common.delete',
      cancelLabel: 'common.cancel',
      variant: 'destructive',
    });
    expect(commitProviders).not.toHaveBeenCalled();
  });
});
