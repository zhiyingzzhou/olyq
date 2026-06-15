/**
 * 说明：`MemoryButton.spec` 组件模块。
 *
 * 职责：
 * - 承载 `MemoryButton.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MemoryButton } from './MemoryButton';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { GlobalMemoryConfig } from '@/lib/memory/types';

const mockState = vi.hoisted(() => ({
  currentAssistant: null as null | {
    id: string;
    enableMemory?: boolean;
  },
  updateAssistantConfig: vi.fn(),
  memoryConfig: {
    enabled: false,
    embeddingModel: undefined,
    llmModel: undefined,
    rerankModel: undefined,
    topK: 5,
  } as GlobalMemoryConfig,
  memoryConfigured: false,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/hooks/useAssistantStore', () => ({
  useAssistantStore: (selector: (state: {
    getAssistant: (assistantId?: string) => unknown;
    updateAssistantConfig: typeof mockState.updateAssistantConfig;
  }) => unknown) => selector({
    getAssistant: (assistantId?: string) => (
      assistantId && mockState.currentAssistant?.id === assistantId ? mockState.currentAssistant : null
    ),
    updateAssistantConfig: mockState.updateAssistantConfig,
  }),
}));

vi.mock('@/lib/memory', () => ({
  getMemoryConfig: () => mockState.memoryConfig,
  isMemoryConfigured: () => mockState.memoryConfigured,
  subscribeMemoryConfigChange: () => () => {},
}));

describe('MemoryButton', () => {
  beforeEach(() => {
    mockState.currentAssistant = null;
    mockState.updateAssistantConfig.mockReset();
    mockState.memoryConfig = {
      enabled: false,
      embeddingModel: undefined,
      llmModel: undefined,
      rerankModel: undefined,
      topK: 5,
    } satisfies GlobalMemoryConfig;
    mockState.memoryConfigured = false;
  });

  it('记忆按钮使用独立的 Database 图标，不再复用推理强度的 Brain 图标', () => {
    mockState.currentAssistant = {
      id: 'assistant-1',
      enableMemory: false,
    };

    render(
      <TooltipProvider>
        <MemoryButton assistantId="assistant-1" onOpenMemorySettings={vi.fn()} />
      </TooltipProvider>,
    );

    const trigger = screen.getByLabelText('chat.memory');
    expect(trigger.querySelector('svg.lucide-database')).not.toBeNull();
    expect(trigger.querySelector('svg.lucide-brain')).toBeNull();
  });

  it('未配置记忆时，弹层仍会显示不可用提示且开关禁用', async () => {
    mockState.currentAssistant = {
      id: 'assistant-1',
      enableMemory: false,
    };

    render(
      <TooltipProvider>
        <MemoryButton assistantId="assistant-1" onOpenMemorySettings={vi.fn()} />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByLabelText('chat.memory'));

    const popover = await screen.findByTestId('memory-popover');
    expect(popover).toBeInTheDocument();
    expect(popover).toHaveAttribute('role', 'dialog');
    expect(popover).toHaveAttribute('data-side', 'top');
    expect(screen.getAllByText('assistant.enableMemoryUnavailable').length).toBeGreaterThan(0);
    expect(screen.getByRole('switch')).toBeDisabled();
  });

  it('设置入口仍可触发并关闭弹层', async () => {
    const onOpenMemorySettings = vi.fn();
    mockState.currentAssistant = {
      id: 'assistant-1',
      enableMemory: false,
    };

    render(
      <TooltipProvider>
        <MemoryButton assistantId="assistant-1" onOpenMemorySettings={onOpenMemorySettings} />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByLabelText('chat.memory'));
    expect(await screen.findByTestId('memory-open-settings')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('memory-open-settings'));

    await waitFor(() => {
      expect(onOpenMemorySettings).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.queryByTestId('memory-popover')).not.toBeInTheDocument();
    });
  });

  it('点击记忆 icon 可稳定打开和关闭弹层，不会瞬开瞬关', async () => {
    mockState.currentAssistant = {
      id: 'assistant-1',
      enableMemory: false,
    };
    mockState.memoryConfig = {
      enabled: true,
      embeddingModel: 'openai/text-embedding-3-large',
      llmModel: 'openai/gpt-5.4',
      rerankModel: undefined,
      topK: 5,
    } satisfies GlobalMemoryConfig;
    mockState.memoryConfigured = true;

    render(
      <TooltipProvider>
        <MemoryButton assistantId="assistant-1" onOpenMemorySettings={vi.fn()} />
      </TooltipProvider>,
    );

    const trigger = screen.getByLabelText('chat.memory');

    fireEvent.click(trigger);
    expect(await screen.findByTestId('memory-popover')).toBeInTheDocument();

    fireEvent.click(trigger);
    await waitFor(() => {
      expect(screen.queryByTestId('memory-popover')).not.toBeInTheDocument();
    });
  });

  it('已启用记忆时点击主按钮会直接关闭能力而不是打开弹层', async () => {
    mockState.currentAssistant = {
      id: 'assistant-1',
      enableMemory: true,
    };
    mockState.memoryConfig = {
      enabled: true,
      embeddingModel: 'openai/text-embedding-3-large',
      llmModel: 'openai/gpt-5.4',
      rerankModel: undefined,
      topK: 5,
    } satisfies GlobalMemoryConfig;
    mockState.memoryConfigured = true;

    render(
      <TooltipProvider>
        <MemoryButton assistantId="assistant-1" onOpenMemorySettings={vi.fn()} />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByLabelText('common.close'));

    expect(mockState.updateAssistantConfig).toHaveBeenCalledWith('assistant-1', { enableMemory: false });
    expect(screen.queryByTestId('memory-popover')).not.toBeInTheDocument();
  });
});
