/**
 * 说明：`useModelManagerHealth.spec` 测试模块。
 *
 * 职责：
 * - 覆盖模型管理 API key 单检的消息消费 contract；
 * - 守住 `health/model` 立即终态、`health/done` 不改判、超时兜底唯一生效这三条语义；
 * - 防止 UI 再把已有模型结果的请求误落成裸 `common.error`。
 *
 * 边界：
 * - 本文件只验证 hook 级单 key 检测消费逻辑，不扩展到完整 dialog 渲染或 SW 健康检查编排。
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import type { TFunction } from 'i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Provider } from './shared';
import { useModelManagerHealth } from './useModelManagerHealth';

const {
  createIdMock,
  postUiPortMessageMock,
  subscriberState,
  toastErrorMock,
} = vi.hoisted(() => ({
  createIdMock: vi.fn(() => 'req-api-key-check'),
  postUiPortMessageMock: vi.fn(() => true),
  subscriberState: {
    listener: null as null | ((message: unknown) => void),
  },
  toastErrorMock: vi.fn(),
}));

vi.mock('@/extension/bridge/ui-port', () => ({
  onUiPortMessage: (listener: (message: unknown) => void) => {
    subscriberState.listener = listener;
    return () => {
      if (subscriberState.listener === listener) subscriberState.listener = null;
    };
  },
  postUiPortMessage: postUiPortMessageMock,
}));

vi.mock('@/hooks/useToast', () => ({
  toast: {
    error: toastErrorMock,
  },
}));

vi.mock('@/lib/utils/id', () => ({
  createId: createIdMock,
}));

const selectedProvider: Provider = {
  id: 'openai',
  name: 'OpenAI',
  type: 'openai',
  enabled: true,
  apiKey: 'sk-test-1',
  apiHost: 'https://api.example.com/v1',
  models: [{ id: 'gpt-5.1', name: 'GPT-5.1' }],
};

const t = ((key: string) => {
  const translations: Record<string, string> = {
    'common.cancelled': '已取消',
    'errors.requestTimedOutOrDisconnected': '请求已超时或断开',
    'modelManagerPanel.healthDialog.noModels': '暂无模型',
    'modelManagerPanel.healthDialog.noPort': '端口不可用',
  };
  return translations[key] ?? key;
}) as unknown as TFunction;

/**
 * 渲染 `useModelManagerHealth` 的最小测试宿主。
 *
 * @param options - 可选覆写项，便于替换持久化 mock。
 * @returns `renderHook` 结果，供测试直接驱动 hook。
 */
function renderUseModelManagerHealth(options?: {
  persistProvidersNow?: (typeof defaultPersistProvidersNow);
}) {
  const persistProvidersNow = options?.persistProvidersNow ?? defaultPersistProvidersNow;
  return renderHook(() => useModelManagerHealth({
    apiKeysForUi: ['sk-test-1'],
    getResolvedProviderHostPatterns: () => [],
    persistProvidersNow,
    providers: [selectedProvider],
    selected: selectedProvider,
    t,
  }));
}

const defaultPersistProvidersNow = vi.fn(async () => ({ ok: true }));

/**
 * 向 hook 当前订阅的 UI Port 监听器注入一条后台事件。
 *
 * @param message - 模拟的后台消息。
 */
function emitUiPortMessage(message: unknown) {
  act(() => {
    subscriberState.listener?.(message);
  });
}

/**
 * 启动一轮单 key 连通性检测，并等待前置状态进入 checking。
 *
 * @param result - `renderHook` 返回的当前 hook result。
 */
async function startSingleApiKeyCheck(result: ReturnType<typeof renderUseModelManagerHealth>['result']) {
  await act(async () => {
    result.current.setApiKeyCheckModelId('gpt-5.1');
  });
  await act(async () => {
    void result.current.runApiKeyConnectivityCheck(0);
    await Promise.resolve();
  });
}

describe('useModelManagerHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    subscriberState.listener = null;
    createIdMock.mockReturnValue('req-api-key-check');
    defaultPersistProvidersNow.mockResolvedValue({ ok: true });
    postUiPortMessageMock.mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('API key 单检收到 health/model(error) 后会立即 settle 为失败结果', async () => {
    createIdMock.mockReturnValueOnce('req-api-key-check-error');

    const { result, unmount } = renderUseModelManagerHealth();
    await startSingleApiKeyCheck(result);

    await waitFor(() => {
      expect(postUiPortMessageMock).toHaveBeenCalledWith({
        type: 'health/check',
        requestId: 'req-api-key-check-error',
        payload: {
          providerId: 'openai',
          modelIds: ['gpt-5.1'],
          keyCheckMode: 'single',
          selectedKeyIndex: 0,
          isConcurrent: false,
          timeoutMs: 15_000,
        },
      });
    });
    expect(result.current.apiKeyConnectivity['sk-test-1']).toEqual({ status: 'checking' });

    emitUiPortMessage({
      type: 'health/model',
      requestId: 'req-api-key-check-error',
      payload: {
        modelId: 'gpt-5.1',
        status: 'error',
        error: {
          key: 'errors.apiCallHttpError',
          params: { status: 400 },
        },
        errorDetail: 'HTTP 400 · https://api.example.com/v1/responses · 端点/codex未开启模型gpt-5.1',
      },
    });

    await waitFor(() => {
      expect(result.current.apiKeyConnectivity['sk-test-1']).toEqual({
        status: 'failed',
        error: {
          key: 'errors.apiCallHttpError',
          params: { status: 400 },
        },
        errorDetail: 'HTTP 400 · https://api.example.com/v1/responses · 端点/codex未开启模型gpt-5.1',
        modelId: 'gpt-5.1',
      });
    });

    unmount();
  });

  it('API key 单检收到 health/model(ok) 后，后续 health/done 不会把结果覆盖成 common.error', async () => {
    createIdMock.mockReturnValueOnce('req-api-key-check-ok');

    const { result, unmount } = renderUseModelManagerHealth();
    await startSingleApiKeyCheck(result);

    emitUiPortMessage({
      type: 'health/model',
      requestId: 'req-api-key-check-ok',
      payload: {
        modelId: 'gpt-5.1',
        status: 'ok',
        latency: 42,
      },
    });

    await waitFor(() => {
      expect(result.current.apiKeyConnectivity['sk-test-1']).toEqual({
        status: 'success',
        latency: 42,
        modelId: 'gpt-5.1',
      });
    });

    emitUiPortMessage({
      type: 'health/done',
      requestId: 'req-api-key-check-ok',
    });

    expect(result.current.apiKeyConnectivity['sk-test-1']).toEqual({
      status: 'success',
      latency: 42,
      modelId: 'gpt-5.1',
    });

    unmount();
  });

  it('API key 单检若只收到 health/done，不会立即落成 common.error，而是保留超时链路兜底', async () => {
    vi.useFakeTimers();
    createIdMock.mockReturnValueOnce('req-api-key-check-done-only');

    const { result, unmount } = renderUseModelManagerHealth();
    await act(async () => {
      result.current.setHealthTimeout(5);
    });
    await startSingleApiKeyCheck(result);

    emitUiPortMessage({
      type: 'health/done',
      requestId: 'req-api-key-check-done-only',
    });

    expect(result.current.apiKeyConnectivity['sk-test-1']).toEqual({ status: 'checking' });

    act(() => {
      vi.advanceTimersByTime(6_001);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.apiKeyConnectivity['sk-test-1']).toEqual({
      status: 'failed',
      error: {
        key: 'errors.requestTimedOutOrDisconnected',
      },
    });

    unmount();
  });
});
