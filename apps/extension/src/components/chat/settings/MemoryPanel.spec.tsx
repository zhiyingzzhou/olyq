/**
 * 说明：`MemoryPanel.spec` 组件模块。
 *
 * 职责：
 * - 承载 `MemoryPanel.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MemoryPanel } from './MemoryPanel';

const MOCK_MODELS = [
  {
    id: 'openai/text-embedding-3-large',
    modelId: 'text-embedding-3-large',
    name: 'Text Embedding 3 Large',
    providerId: 'openai',
    providerName: 'OpenAI',
    providerType: 'openai',
    kind: 'embedding',
  },
  {
    id: 'siliconflow/bge-large-zh',
    modelId: 'bge-large-zh',
    name: 'BGE Large ZH',
    providerId: 'siliconflow',
    providerName: 'SiliconFlow',
    providerType: 'openai',
    kind: 'embedding',
  },
  {
    id: 'openai/gpt-5.4',
    modelId: 'gpt-5.4',
    name: 'GPT-5.4',
    providerId: 'openai',
    providerName: 'OpenAI',
    providerType: 'openai',
    kind: 'chat',
  },
  {
    id: 'anthropic/claude-sonnet-4-6',
    modelId: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    providerId: 'anthropic',
    providerName: 'Anthropic',
    providerType: 'anthropic',
    kind: 'chat',
  },
  {
    id: 'cohere/rerank-v4.0-pro',
    modelId: 'rerank-v4.0-pro',
    name: 'Rerank v4.0 Pro',
    providerId: 'cohere',
    providerName: 'Cohere',
    providerType: 'cohere',
    kind: 'rerank',
  },
  {
    id: 'siliconflow/bge-reranker-v2-m3',
    modelId: 'bge-reranker-v2-m3',
    name: 'BGE Reranker v2 m3',
    providerId: 'siliconflow',
    providerName: 'SiliconFlow',
    providerType: 'openai',
    kind: 'rerank',
  },
] as const;

const PROVIDERS = [
  { id: 'openai', name: 'OpenAI', type: 'openai', enabled: true },
  { id: 'anthropic', name: 'Anthropic', type: 'anthropic', enabled: true },
  { id: 'cohere', name: 'Cohere', type: 'cohere', enabled: true },
  { id: 'siliconflow', name: 'SiliconFlow', type: 'openai', enabled: true },
] as const;

type MockModel = (typeof MOCK_MODELS)[number];
type MockModelPickerProps = {
  open: boolean;
  value: string;
  onSelect: (modelId: string) => void;
  onClose: () => void;
  filter: (model: MockModel) => boolean;
};

const mockState = vi.hoisted(() => {
  const state = {
    currentConfig: {
      enabled: true,
      embeddingModel: 'openai/text-embedding-3-large',
      llmModel: 'openai/gpt-5.4',
      rerankModel: 'cohere/rerank-v4.0-pro',
      topK: 5,
    },
    lastModelPickerProps: null as MockModelPickerProps | null,
    saveMemoryConfig: vi.fn((next) => {
      state.currentConfig = { ...next };
    }),
  };
  return state;
});

vi.mock('react-i18next', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, params?: Record<string, unknown>) => {
        if (key === 'memory.count') return `count:${params?.count ?? 0}`;
        if (key === 'memory.clearModelSelection') return `clear-model-${String(params?.model ?? '')}`;
        return key;
      },
    }),
  };
});

vi.mock('@/hooks/useConfirmDialog', () => ({
  useConfirmDialog: () => ({
    confirm: vi.fn(async () => true),
    ConfirmDialogPortal: () => null,
  }),
}));

vi.mock('@/hooks/useToast', () => ({
  toast: vi.fn(),
}));

vi.mock('@/lib/embedding', () => ({
  generateEmbedding: vi.fn(),
}));

vi.mock('@/lib/ai/model-filters', () => ({
  defaultChatModelFilter: (model: (typeof MOCK_MODELS)[number]) => model.kind === 'chat',
}));

vi.mock('@/lib/ai/provider-capabilities', () => ({
  supportsEmbeddingProvider: (provider: { id: string }) => provider.id !== 'cohere',
  supportsRerankProvider: (provider: { id: string }) => provider.id === 'cohere' || provider.id === 'siliconflow',
}));

vi.mock('@/hooks/useModelOptions', () => ({
  useModelOptions: () => ({
    providers: PROVIDERS,
    models: MOCK_MODELS,
    modelMap: new Map(MOCK_MODELS.map((model) => [model.id, model])),
    getModelLabel: (id: string) => id,
  }),
}));

vi.mock('@/lib/memory', () => ({
  DEFAULT_MEMORY_CONFIG: { enabled: false, topK: 5 },
  getMemoryConfig: () => mockState.currentConfig,
  isMemoryConfigured: (config: typeof mockState.currentConfig) => Boolean(config.embeddingModel && config.llmModel),
  listMemories: vi.fn(async () => []),
  saveMemoryConfig: mockState.saveMemoryConfig,
  subscribeMemoryConfigChange: vi.fn(() => () => {}),
  addMemory: vi.fn(),
  clearAllMemories: vi.fn(),
  deleteMemory: vi.fn(),
  updateMemory: vi.fn(),
}));

vi.mock('@/components/chat/settings/memory-panel/MemoryListSection', () => ({
  MemoryListSection: () => <div data-testid="memory-list-section" />,
}));

vi.mock('@/components/chat/settings/memory-panel/MemoryEditDialog', () => ({
  MemoryEditDialog: () => null,
}));

vi.mock('@/components/chat/ModelPickerDialog', () => ({
  ModelPickerDialog: (props: MockModelPickerProps) => {
    mockState.lastModelPickerProps = props;
    if (!props.open) return null;
    return (
      <button
        type="button"
        data-testid="mock-model-picker-select"
        onClick={() => {
          const filteredModels = MOCK_MODELS.filter((model) => props.filter(model));
          const nextModelId = filteredModels.at(-1)?.id ?? '';
          props.onSelect(nextModelId);
          props.onClose();
        }}
      >
        select
      </button>
    );
  },
}));

describe('MemoryPanel', () => {
  beforeEach(() => {
    mockState.currentConfig = {
      enabled: true,
      embeddingModel: 'openai/text-embedding-3-large',
      llmModel: 'openai/gpt-5.4',
      rerankModel: 'cohere/rerank-v4.0-pro',
      topK: 5,
    };
    mockState.lastModelPickerProps = null;
    mockState.saveMemoryConfig.mockClear();
  });

  it('配置说明收进 label 后帮助提示，不再常驻占用表单高度', async () => {
    render(<MemoryPanel />);

    await waitFor(() => {
      expect(screen.getByText('memory.rerankModel')).toBeInTheDocument();
    });

    const trigger = screen.getByTestId('memory-rerank-model-trigger');
    const helpTrigger = screen.getByRole('button', { name: 'memory.rerankModelDesc' });
    const label = screen.getByText('memory.rerankModel');
    const labelShell = label.closest('.memory-setting-label');

    expect(labelShell).not.toBeNull();
    expect(labelShell).toContainElement(helpTrigger);
    expect(helpTrigger.closest('.settings-responsive-lead')).not.toBeNull();
    expect(helpTrigger.closest('.memory-model-picker-field')).toBeNull();
    expect(screen.queryByText('memory.rerankModelDesc')).not.toBeInTheDocument();
    expect(trigger.closest('.memory-model-picker-field')).not.toContainElement(helpTrigger);

    fireEvent.focus(helpTrigger);

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('memory.rerankModelDesc');
  });

  it('启用全局记忆开关使用 Memory 专用右侧槽位', async () => {
    render(<MemoryPanel />);

    await waitFor(() => {
      expect(screen.getByText('memory.enable')).toBeInTheDocument();
    });

    const enableSwitch = screen.getByRole('switch');
    const row = enableSwitch.closest('.memory-switch-row');
    const control = enableSwitch.closest('.memory-switch-control');

    expect(row).not.toBeNull();
    expect(control).not.toBeNull();
    expect(row).toContainElement(control as HTMLElement);
    expect(control).toHaveClass('settings-responsive-control');
  });

  it.each([
    {
      triggerId: 'memory-embedding-model-trigger',
      expectedValue: 'openai/text-embedding-3-large',
      shouldMatch: 'siliconflow/bge-large-zh',
      shouldReject: 'openai/gpt-5.4',
      selectedValue: 'siliconflow/bge-large-zh',
    },
    {
      triggerId: 'memory-llm-model-trigger',
      expectedValue: 'openai/gpt-5.4',
      shouldMatch: 'anthropic/claude-sonnet-4-6',
      shouldReject: 'cohere/rerank-v4.0-pro',
      selectedValue: 'anthropic/claude-sonnet-4-6',
    },
    {
      triggerId: 'memory-rerank-model-trigger',
      expectedValue: 'cohere/rerank-v4.0-pro',
      shouldMatch: 'siliconflow/bge-reranker-v2-m3',
      shouldReject: 'openai/text-embedding-3-large',
      selectedValue: 'siliconflow/bge-reranker-v2-m3',
    },
  ])('会把 $triggerId 接到通用模型弹窗并按类型过滤', async ({ triggerId, expectedValue, shouldMatch, shouldReject, selectedValue }) => {
    render(<MemoryPanel />);

    await waitFor(() => {
      expect(screen.getByTestId(triggerId)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(triggerId));

    expect(mockState.lastModelPickerProps).not.toBeNull();
    const pickerProps = mockState.lastModelPickerProps as MockModelPickerProps;
    expect(pickerProps.open).toBe(true);
    expect(pickerProps.value).toBe(expectedValue);
    expect(pickerProps.filter(MOCK_MODELS.find((model) => model.id === shouldMatch)!)).toBe(true);
    expect(pickerProps.filter(MOCK_MODELS.find((model) => model.id === shouldReject)!)).toBe(false);

    fireEvent.click(screen.getByTestId('mock-model-picker-select'));

    await waitFor(() => {
      expect(mockState.saveMemoryConfig).toHaveBeenCalled();
    });

    expect(Object.values(mockState.saveMemoryConfig.mock.calls.at(-1)?.[0] ?? {})).toContain(selectedValue);
  });

  it('清空按钮会清掉对应模型配置', async () => {
    render(<MemoryPanel />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'clear-model-memory.rerankModel' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('memory-rerank-model-clear'));

    await waitFor(() => {
      expect(mockState.saveMemoryConfig).toHaveBeenCalledWith({
        ...mockState.currentConfig,
        rerankModel: undefined,
      });
    });
  });
});
