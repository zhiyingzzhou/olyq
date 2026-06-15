/**
 * 说明：`useModelManagerHeadersDialog.spec` 组件模块。
 *
 * 职责：
 * - 固定模型平台自定义 headers 弹窗的清洗规则；
 * - 确保普通 headers 不再承担 API Key 鉴权。
 *
 * 边界：
 * - 本测试只覆盖 hook 层保存逻辑，不渲染 Dialog 视图。
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useModelManagerHeadersDialog } from './useModelManagerHeadersDialog';
import type { Provider } from '../shared';

/** 构造最小 Provider，便于测试 headers 保存逻辑。 */
function createProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: 'openai',
    name: 'OpenAI',
    type: 'openai',
    apiKey: 'sk',
    apiHost: 'https://api.example.com/v1',
    enabled: true,
    models: [],
    ...overrides,
  };
}

describe('useModelManagerHeadersDialog', () => {
  it('保存普通 headers 时会过滤 Content-Type、常见鉴权头与当前 apiKeyAuth header', () => {
    const updateProvider = vi.fn();
    const { result } = renderHook(() => useModelManagerHeadersDialog({
      selected: createProvider({ apiKeyAuth: { headerName: 'xi-api-key' } }),
      t: ((key: string) => key) as never,
      updateProvider,
    }));

    act(() => {
      result.current.setCustomHeaders(JSON.stringify({
        Authorization: 'Bearer wrong',
        'Content-Type': 'application/json',
        'x-api-key': 'wrong',
        'x-goog-api-key': 'wrong',
        'api-key': 'wrong',
        'xi-api-key': 'wrong',
        'X-Title': 'Olyq',
      }));
    });
    act(() => {
      result.current.saveCustomHeaders();
    });

    expect(updateProvider).toHaveBeenCalledWith('openai', {
      headers: { 'X-Title': 'Olyq' },
    });
  });
});
