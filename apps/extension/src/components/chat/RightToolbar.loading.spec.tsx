/**
 * 说明：`RightToolbar.loading.spec` 组件模块。
 *
 * 职责：
 * - 承载 `RightToolbar.loading.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RightToolbar } from './RightToolbar';

const { clearTopicMessagesMock, dialogOpenMock, storeState } = vi.hoisted(() => ({
  clearTopicMessagesMock: vi.fn(),
  dialogOpenMock: vi.fn(),
  storeState: {
    activeConversationKey: 'topic-1',
    activeMessagesLoading: true,
    activeMessages: [],
  },
}));

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

vi.mock('@/hooks/useChatStore', () => ({
  useChatStore: Object.assign(
    <T,>(selector: (state: {
      activeConversationKey: string;
      activeMessagesLoading: boolean;
      activeMessages: never[];
      clearTopicMessages: typeof clearTopicMessagesMock;
    }) => T) => selector({
      ...storeState,
      clearTopicMessages: clearTopicMessagesMock,
    }),
    {
      getState: () => ({
        ...storeState,
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
              name: '加载中主题',
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
                name: '加载中主题',
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
  useChatSettingsStore: (selector: (state: {
    settings: {
      defaultModel: string;
      defaultSystemPrompt: string;
      defaultTemperature: number;
      defaultTopP: number;
      defaultMaxTokens: number;
      defaultContextLength: number;
      reasoningEffort: 'medium';
    };
  }) => unknown) => selector({
    settings: {
      defaultModel: 'openai/gpt-5.4',
      defaultSystemPrompt: '默认系统提示词',
      defaultTemperature: 0.7,
      defaultTopP: 0.9,
      defaultMaxTokens: 2048,
      defaultContextLength: 10,
      reasoningEffort: 'medium',
    },
  }),
}));

vi.mock('@/hooks/useModelOptions', () => ({
  useModelOptions: () => ({
    providers: [],
    getModelShortLabel: () => '5.4',
  }),
}));

vi.mock('@/components/chat/ThemeToggle', () => ({
  ThemeToggle: () => null,
}));

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, disabled, className, 'data-testid': dataTestId }: {
    children: ReactNode;
    disabled?: boolean;
    className?: string;
    'data-testid'?: string;
  }) => (
    <button type="button" disabled={disabled} className={className} data-testid={dataTestId}>
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

describe('RightToolbar loading state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeState.activeMessagesLoading = true;
  });

  it('消息恢复期间保留话题入口，并禁用依赖消息内容的动作', () => {
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
        open={dialogOpenMock}
        onOpenExtensionSettings={() => {}}
        toggle={vi.fn()}
        onStartElementPicker={() => {}}
        onStartScreenshotEditor={() => {}}
      />,
    );

    expect(screen.getByTestId('toolbar-model-picker')).toBeVisible();
    expect(screen.getByTestId('toolbar-topic-settings')).toBeVisible();
    expect(screen.getByTestId('toolbar-clear-messages')).toBeDisabled();
    expect(screen.getByTestId('toolbar-compare')).toBeDisabled();
    expect(screen.getByTestId('toolbar-export-topic')).toBeDisabled();
    expect(screen.queryByTestId('toolbar-more-actions')).toBeNull();
    expect(screen.queryByTestId('toolbar-assistants')).toBeNull();

    const screenshotButton = screen.getByTestId('toolbar-screenshot-editor');
    expect(screenshotButton.querySelector('.lucide-camera')).not.toBeNull();
    expect(screenshotButton.querySelector('.lucide-scan-line')).toBeNull();
  });

  it('扩展设置按钮交给页面路由层处理，不直接打开弹窗', () => {
    const openExtensionSettings = vi.fn();

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
        open={dialogOpenMock}
        onOpenExtensionSettings={openExtensionSettings}
        toggle={vi.fn()}
        onStartElementPicker={() => {}}
        onStartScreenshotEditor={() => {}}
      />,
    );

    fireEvent.click(screen.getByTestId('toolbar-extension-settings'));

    expect(openExtensionSettings).toHaveBeenCalledTimes(1);
    expect(dialogOpenMock).not.toHaveBeenCalledWith('showExtSettings');
  });
});
