/**
 * 说明：`PerformancePanel.spec` 组件模块。
 *
 * 职责：
 * - 承载 `PerformancePanel.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { act, render, screen } from '@testing-library/react';
import { PerformancePanel } from './PerformancePanel';
import { OFFSCREEN_UNLOAD_CONFIG_KEY } from '@/lib/extension/offscreen-unload-config';

const bridgeMocks = vi.hoisted(() => ({
  getUiPort: vi.fn(),
  onUiPortMessage: vi.fn(() => vi.fn()),
  postUiPortMessage: vi.fn(),
}));

const translationMap: Record<string, string> = {
  'common.created': '已创建',
  'common.notCreated': '未创建',
  'common.connected': '已连接',
  'common.disconnected': '未连接',
  'common.enabled': '已启用',
  'performancePanel.title': '性能调优与资源管理',
  'performancePanel.description': '监控和管理扩展的 CPU、内存与 WASM 资源使用。',
  'performancePanel.metrics.cpu': 'CPU',
  'performancePanel.metrics.jsHeap': 'JS Heap',
  'performancePanel.metrics.storageUsage': '存储占用',
  'performancePanel.metrics.background': '后台组件',
  'performancePanel.cpu.loading': '正在采样 CPU 使用率',
  'performancePanel.cpu.loadingDesc': '首次采样约需 2 秒。',
  'performancePanel.cpu.estimated': '系统 CPU 使用率（估算值，近 2 秒）',
  'performancePanel.cpu.unavailable': 'CPU 指标不可用',
  'performancePanel.cpu.unavailableDesc': '需要 Chrome system.cpu 权限（或请在扩展侧边栏中打开）。',
  'performancePanel.background.summary': 'UI Port：{{uiPortCount}} ｜ Offscreen：{{offscreen}}',
  'performancePanel.background.offscreenPort': 'Offscreen Port：{{status}}',
  'performancePanel.unload.title': '资源回收策略',
  'performancePanel.unload.autoUnload': '自动回收离屏资源',
  'performancePanel.unload.autoUnloadDesc': '当后台空闲且没有挂起任务时，自动关闭 Offscreen Document（best-effort）。',
  'performancePanel.unload.idleTimeout': '空闲超时',
  'performancePanel.units.seconds': '{{count}} 秒',
  'performancePanel.storage.title': '数据落盘位置',
  'performancePanel.storage.chatPrompts': '聊天/提示词',
  'performancePanel.storage.chatPromptsDesc': '聊天设置、提示词和轻量偏好使用 shared storage，并通过启动快照/镜像加速加载。',
  'performancePanel.storage.sharedJson': 'Shared JSON',
  'performancePanel.storage.modelKeys': '模型平台 Key',
  'performancePanel.storage.modelKeysDesc': '使用 chrome.storage.local（跨上下文共享）。',
  'performancePanel.storage.memory': '全局记忆',
  'performancePanel.storage.memoryDesc': '记忆数据保存在 IndexedDB，向量由已配置模型在线生成。',
  'performancePanel.tips.title': '性能提示',
  'performancePanel.tips.swMemoryLimit': '多标签页场景注意 Service Worker 共享内存限制',
  'performancePanel.tips.webgpuBoost': 'WebGPU 嵌入可提升 5-10x 但需 GPU 支持',
  'performancePanel.tips.largeVectorDb': '大规模向量库建议启用 IndexedDB 分片策略',
};

/**
 * 测试辅助函数：`translate`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function translate(key: string, params?: Record<string, unknown>) {
  const template = translationMap[key] ?? key;
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_match, name) => String(params[name] ?? ''));
}

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
      t: (key: string, params?: Record<string, unknown>) => translate(key, params),
      i18n: { language: 'zh-CN' },
    }),
  };
});

/**
 * 测试辅助函数：`createCpuInfo`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function createCpuInfo(idle: number, total: number) {
  return {
    processors: [{ usage: { idle, total } }],
  };
}

/**
 * 测试辅助函数：`installBaseBrowserMocks`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function installBaseBrowserMocks() {
  bridgeMocks.getUiPort.mockReturnValue(null);
  bridgeMocks.onUiPortMessage.mockReturnValue(vi.fn());
  bridgeMocks.postUiPortMessage.mockReturnValue(true);

  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: undefined,
  });
}

describe('PerformancePanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    installBaseBrowserMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

    /**
   * 测试辅助函数：`renderPanel`。
   *
   * @remarks
   * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
   */
  async function renderPanel() {
    await act(async () => {
      render(<PerformancePanel />);
      await Promise.resolve();
    });
  }

  it('CPU 可用时先显示 loading，再在第二次采样后显示百分比', async () => {
    const cpuSamples = [createCpuInfo(50, 100), createCpuInfo(70, 200)];
    let sampleIndex = 0;

    (globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome = {
      system: {
        cpu: {
          getInfo: vi.fn((callback) => callback?.(cpuSamples[Math.min(sampleIndex++, cpuSamples.length - 1)] as chrome.system.cpu.CpuInfo)),
        },
      },
    } as unknown as typeof chrome;

    await renderPanel();

    expect(screen.getByText('正在采样 CPU 使用率')).toBeInTheDocument();
    expect(screen.getByText('首次采样约需 2 秒。')).toBeInTheDocument();
    expect(screen.queryByText('CPU 指标不可用')).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('系统 CPU 使用率（估算值，近 2 秒）')).toBeInTheDocument();
    expect(screen.queryByText('正在采样 CPU 使用率')).not.toBeInTheDocument();
    expect(screen.getByText('记忆数据保存在 IndexedDB，向量由已配置模型在线生成。')).toBeInTheDocument();
    expect(screen.getByText('全局记忆')).toBeInTheDocument();
    expect(screen.queryByText('堆内存阈值')).not.toBeInTheDocument();
    expect(screen.queryByText('WebGPU 嵌入可提升 5-10x 但需 GPU 支持')).not.toBeInTheDocument();
    expect(screen.queryByText('大规模向量库建议启用 IndexedDB 分片策略')).not.toBeInTheDocument();
  });

  it('CPU API 不可用时直接显示 unavailable，而不是 loading', async () => {
    (globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome = {} as typeof chrome;

    await renderPanel();

    expect(screen.getByText('CPU 指标不可用')).toBeInTheDocument();
    expect(screen.queryByText('正在采样 CPU 使用率')).not.toBeInTheDocument();
  });

  it('读取旧 Offscreen 配置后写回当前 schema', async () => {
    const extraKey = ['memory', 'Threshold'].join('');
    localStorage.setItem(OFFSCREEN_UNLOAD_CONFIG_KEY, JSON.stringify({
      autoUnload: false,
      idleTimeout: 120,
      [extraKey]: 70,
    }));

    await renderPanel();

    await act(async () => {
      vi.advanceTimersByTime(250);
      await Promise.resolve();
    });

    expect(JSON.parse(localStorage.getItem(OFFSCREEN_UNLOAD_CONFIG_KEY) || '{}')).toEqual({
      autoUnload: false,
      idleTimeout: 120,
    });
  });
});
