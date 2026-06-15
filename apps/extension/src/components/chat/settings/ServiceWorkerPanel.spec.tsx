/**
 * 说明：`ServiceWorkerPanel.spec` 组件模块。
 *
 * 职责：
 * - 承载 `ServiceWorkerPanel.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { act, render, screen } from '@testing-library/react';
import { ServiceWorkerPanel } from './ServiceWorkerPanel';

const bridgeMocks = vi.hoisted(() => ({
  getUiPort: vi.fn(),
  onUiPortMessage: vi.fn((_listener?: unknown) => vi.fn()),
  postUiPortMessage: vi.fn(),
}));

const translationMap: Record<string, string> = {
  'serviceWorkerPanel.keepalive.native.title': 'Native Messaging',
  'serviceWorkerPanel.keepalive.native.desc': '连接本地宿主程序实现最强保活（需安装本地程序）',
};

vi.mock('@/extension/bridge/ui-port', () => ({
  getUiPort: bridgeMocks.getUiPort,
  onUiPortMessage: bridgeMocks.onUiPortMessage,
  postUiPortMessage: bridgeMocks.postUiPortMessage,
}));

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => translationMap[key] ?? key,
      i18n: { language: 'zh-CN' },
    }),
  };
});

describe('ServiceWorkerPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    bridgeMocks.getUiPort.mockReturnValue({});
    bridgeMocks.onUiPortMessage.mockReturnValue(vi.fn());
    bridgeMocks.postUiPortMessage.mockReturnValue(true);
    (globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome = {
      runtime: {
        sendMessage: vi.fn((_message, callback) => callback?.({
          ok: true,
          payload: { alarmsEnabled: true, periodInMinutes: 1 },
        })),
      },
    } as unknown as typeof chrome;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('删除 Native Messaging 占位卡片', () => {
    render(<ServiceWorkerPanel />);

    expect(screen.queryByText('Native Messaging')).not.toBeInTheDocument();
    expect(screen.queryByText('连接本地宿主程序实现最强保活（需安装本地程序）')).not.toBeInTheDocument();
  });

  it('通过共享状态轮询 hook 请求并展示 Service Worker 状态', async () => {
    let statusListener: ((message: unknown) => void) | null = null;
    bridgeMocks.onUiPortMessage.mockImplementation((listener?: unknown) => {
      statusListener = typeof listener === 'function'
        ? (listener as (message: unknown) => void)
        : null;
      return vi.fn();
    });

    render(<ServiceWorkerPanel />);

    const statusRequest = bridgeMocks.postUiPortMessage.mock.calls.find(([message]) => {
      return (message as { type?: string }).type === 'sw/status/get';
    })?.[0] as { requestId?: string } | undefined;
    expect(statusRequest?.requestId).toBeTruthy();

    await act(async () => {
      statusListener?.({
        type: 'sw/status',
        requestId: statusRequest?.requestId,
        payload: {
          startedAt: Date.now() - 3_000,
          lastAlarmAt: Date.now() - 1_000,
          uiPortCount: 2,
          offscreenDoc: true,
          offscreenPortConnected: true,
        },
      });
    });

    expect(screen.getByText('serviceWorkerPanel.status.active')).toBeInTheDocument();
    expect(screen.getByText('serviceWorkerPanel.keepalive.port.connected')).toBeInTheDocument();
  });
});
