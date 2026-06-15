/**
 * 说明：`RightToolbar.export.spec` 组件模块。
 *
 * 职责：
 * - 承载 `RightToolbar.export.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { exportTopic } from '@/lib/export';
import { RightToolbar } from './RightToolbar';

const { clearTopicMessagesMock, confirmMock } = vi.hoisted(() => ({
  clearTopicMessagesMock: vi.fn(),
  confirmMock: vi.fn(async () => false),
}));

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

vi.mock('@/hooks/useConfirmDialog', () => ({
  useConfirmDialog: () => ({
    confirm: confirmMock,
    ConfirmDialogPortal: () => null,
  }),
}));

vi.mock('@/hooks/useChatStore', () => ({
  useChatStore: Object.assign(
    <T,>(selector: (state: {
      activeConversationKey: string;
      activeMessagesLoading: boolean;
      activeMessages: Array<{ id: string; role: 'assistant'; content: string; createdAt: number }>;
      clearTopicMessages: ReturnType<typeof vi.fn>;
    }) => T) => selector({
      activeConversationKey: 'topic-1',
      activeMessagesLoading: false,
      activeMessages: [
        {
          id: 'msg-1',
          role: 'assistant',
          content: 'hello export',
          createdAt: 1_730_000_000_000,
        },
      ],
      clearTopicMessages: clearTopicMessagesMock,
    }),
    {
      getState: () => ({
        activeConversationKey: 'topic-1',
        activeMessagesLoading: false,
        activeMessages: [
          {
            id: 'msg-1',
            role: 'assistant' as const,
            content: 'hello export',
            createdAt: 1_730_000_000_000,
          },
        ],
        clearTopicMessages: clearTopicMessagesMock,
      }),
    },
  ),
}));

vi.mock('@/hooks/useAssistantStore', () => ({
  useAssistantStore: Object.assign(
    <T,>(selector: (state: {
      assistants: Array<{
        id: string;
        prompt: string;
        model: string;
        topics: Array<{
          id: string;
          assistantId: string;
          name: string;
          prompt?: string;
          pinned: boolean;
          createdAt: number;
          updatedAt: number;
        }>;
        createdAt: number;
        updatedAt: number;
      }>;
    }) => T) => selector({
      assistants: [
        {
          id: 'assistant-1',
          prompt: 'system prompt',
          model: 'openai/gpt-5.4',
          topics: [
            {
              id: 'topic-1',
              assistantId: 'assistant-1',
              name: '导出主题',
              prompt: '',
              pinned: false,
              createdAt: 1_730_000_000_000,
              updatedAt: 1_730_000_000_100,
            },
          ],
          createdAt: 1_730_000_000_000,
          updatedAt: 1_730_000_000_100,
        },
      ],
    }),
    {
      getState: () => ({
        assistants: [
          {
            id: 'assistant-1',
            prompt: 'system prompt',
            model: 'openai/gpt-5.4',
            topics: [
              {
                id: 'topic-1',
                assistantId: 'assistant-1',
                name: '导出主题',
                prompt: '',
                pinned: false,
                createdAt: 1_730_000_000_000,
                updatedAt: 1_730_000_000_100,
              },
            ],
            createdAt: 1_730_000_000_000,
            updatedAt: 1_730_000_000_100,
          },
        ],
      }),
    },
  ),
}));

vi.mock('@/hooks/useChatSettingsStore', () => ({
  useChatSettingsStore: Object.assign(
    <T,>(selector: (state: {
      settings: {
        defaultModel: string;
        defaultSystemPrompt: string;
        defaultTemperature: number;
        defaultTopP: number;
        defaultMaxTokens: number;
        defaultContextLength: number;
      };
    }) => T) => selector({
      settings: {
        defaultModel: 'openai/gpt-5.4',
        defaultSystemPrompt: '默认系统提示词',
        defaultTemperature: 0.7,
        defaultTopP: 0.9,
        defaultMaxTokens: 2048,
        defaultContextLength: 10,
      },
    }),
    {
      getState: () => ({
        settings: {
          defaultModel: 'openai/gpt-5.4',
          defaultSystemPrompt: '默认系统提示词',
          defaultTemperature: 0.7,
          defaultTopP: 0.9,
          defaultMaxTokens: 2048,
          defaultContextLength: 10,
        },
      }),
    },
  ),
}));

vi.mock('@/hooks/useModelOptions', () => ({
  useModelOptions: () => ({
    providers: [],
    getModelShortLabel: () => '4o',
  }),
}));

vi.mock('@/components/chat/ThemeToggle', () => ({
  ThemeToggle: () => null,
}));

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick, disabled, className, 'data-testid': dataTestId }: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
    'data-testid'?: string;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled} className={className} data-testid={dataTestId}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/ui/ProviderIcon', () => ({
  ProviderIcon: () => <div>provider-icon</div>,
}));

vi.mock('@/lib/export', () => ({
  exportTopic: vi.fn(async () => {}),
}));

describe('RightToolbar export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirmMock.mockResolvedValue(false);
  });

  it('保留的话题导出三项会继续触发统一导出入口', async () => {
    const exportTopicMock = vi.mocked(exportTopic);

    render(
      <RightToolbar
        dialogs={{
          showSettings: false,
          showAssistantStore: false,
          showCompare: false,
          showGlobalSearch: false,
          showLaunchpad: false,
          showPhrases: false,
          showTranslation: false,
          showExtSettings: false,
          showPrompts: false,
          showModelPicker: false,
          showAssistantRolePicker: false,
          showAssistantEditor: false,
          showFiles: false,
        } as never}
        open={() => {}}
        onOpenExtensionSettings={() => {}}
        toggle={() => {}}
        onStartElementPicker={() => {}}
        onStartScreenshotEditor={() => {}}
      />,
    );

    fireEvent.click(screen.getByTestId('toolbar-export-markdown'));
    fireEvent.click(screen.getByTestId('toolbar-export-html'));
    fireEvent.click(screen.getByTestId('toolbar-export-word'));

    await waitFor(() => {
      expect(exportTopicMock).toHaveBeenCalledTimes(3);
    });
    expect(exportTopicMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      id: 'topic-1',
      title: '导出主题',
      messages: [
        expect.objectContaining({
          id: 'msg-1',
          content: 'hello export',
        }),
      ],
    }), 'markdown');
    expect(exportTopicMock).toHaveBeenNthCalledWith(2, expect.any(Object), 'html');
    expect(exportTopicMock).toHaveBeenNthCalledWith(3, expect.any(Object), 'word');
  });

  it('右侧工具条动作直接展示并复用原回调，不再经过更多菜单', () => {
    const open = vi.fn();
    const toggle = vi.fn();
    const startElementPicker = vi.fn();
    const startScreenshotEditor = vi.fn();

    render(
      <RightToolbar
        dialogs={{
          showSettings: false,
          showAssistantStore: false,
          showCompare: false,
          showGlobalSearch: false,
          showLaunchpad: false,
          showPhrases: false,
          showTranslation: false,
          showExtSettings: false,
          showPrompts: false,
          showModelPicker: false,
          showAssistantRolePicker: false,
          showAssistantEditor: false,
          showFiles: false,
        } as never}
        open={open}
        onOpenExtensionSettings={() => {}}
        toggle={toggle}
        onStartElementPicker={startElementPicker}
        onStartScreenshotEditor={startScreenshotEditor}
      />,
    );

    expect(screen.queryByTestId('toolbar-more-actions')).toBeNull();
    fireEvent.click(screen.getByTestId('toolbar-compare'));
    fireEvent.click(screen.getByTestId('toolbar-launchpad'));
    fireEvent.click(screen.getByTestId('toolbar-element-picker'));
    fireEvent.click(screen.getByTestId('toolbar-screenshot-editor'));
    fireEvent.click(screen.getByTestId('toolbar-phrases'));
    fireEvent.click(screen.getByTestId('toolbar-translation'));

    expect(open).toHaveBeenCalledWith('showCompare');
    expect(open).toHaveBeenCalledWith('showLaunchpad');
    expect(open).toHaveBeenCalledWith('showPhrases');
    expect(toggle).toHaveBeenCalledWith('showTranslation');
    expect(startElementPicker).toHaveBeenCalledTimes(1);
    expect(startScreenshotEditor).toHaveBeenCalledTimes(1);
  });

  it('右侧工具条清空消息会先走二次确认，取消时不清空', async () => {
    confirmMock.mockResolvedValue(false);

    render(
      <RightToolbar
        dialogs={{
          showSettings: false,
          showAssistantStore: false,
          showCompare: false,
          showGlobalSearch: false,
          showLaunchpad: false,
          showPhrases: false,
          showTranslation: false,
          showExtSettings: false,
          showPrompts: false,
          showModelPicker: false,
          showAssistantRolePicker: false,
          showAssistantEditor: false,
          showFiles: false,
        } as never}
        open={() => {}}
        onOpenExtensionSettings={() => {}}
        toggle={() => {}}
        onStartElementPicker={() => {}}
        onStartScreenshotEditor={() => {}}
      />,
    );

    fireEvent.click(screen.getByTestId('toolbar-clear-messages'));

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith({
        title: 'chat.clearMessages',
        description: 'chat.clearMessagesConfirmDesc',
        confirmLabel: 'common.clear',
        cancelLabel: 'common.cancel',
        variant: 'destructive',
      });
    });
    expect(clearTopicMessagesMock).not.toHaveBeenCalled();
  });

  it('右侧工具条确认清空后才调用统一 clearTopicMessages', async () => {
    confirmMock.mockResolvedValue(true);

    render(
      <RightToolbar
        dialogs={{
          showSettings: false,
          showAssistantStore: false,
          showCompare: false,
          showGlobalSearch: false,
          showLaunchpad: false,
          showPhrases: false,
          showTranslation: false,
          showExtSettings: false,
          showPrompts: false,
          showModelPicker: false,
          showAssistantRolePicker: false,
          showAssistantEditor: false,
          showFiles: false,
        } as never}
        open={() => {}}
        onOpenExtensionSettings={() => {}}
        toggle={() => {}}
        onStartElementPicker={() => {}}
        onStartScreenshotEditor={() => {}}
      />,
    );

    fireEvent.click(screen.getByTestId('toolbar-clear-messages'));

    await waitFor(() => {
      expect(clearTopicMessagesMock).toHaveBeenCalledWith('topic-1');
    });
  });

  it('直接展示的网页工具入口继承禁用态', () => {
    render(
      <RightToolbar
        dialogs={{
          showSettings: false,
          showAssistantStore: false,
          showCompare: false,
          showGlobalSearch: false,
          showLaunchpad: false,
          showPhrases: false,
          showTranslation: false,
          showExtSettings: false,
          showPrompts: false,
          showModelPicker: false,
          showAssistantRolePicker: false,
          showAssistantEditor: false,
          showFiles: false,
        } as never}
        open={() => {}}
        onOpenExtensionSettings={() => {}}
        toggle={() => {}}
        onStartElementPicker={() => {}}
        onStartScreenshotEditor={() => {}}
        pageToolsEnabled={false}
      />,
    );

    expect(screen.queryByTestId('toolbar-more-actions')).toBeNull();
    expect(screen.getByTestId('toolbar-element-picker')).toBeDisabled();
    expect(screen.getByTestId('toolbar-screenshot-editor')).toBeDisabled();
  });
});
