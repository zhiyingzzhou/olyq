/**
 * 说明：`ChatInput.auto-translate.spec` 组件模块。
 *
 * 职责：
 * - 承载 `ChatInput.auto-translate.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

const { settingsState, assistantStoreState, runTranslate, reloadMcpServersResource } = vi.hoisted(() => ({
  settingsState: {
    settings: {
      sendMessageShortcut: 'enter',
      pasteLongTextAsFile: true,
      pasteLongTextThreshold: 2000,
      autoTranslateWithSpace: true,
      enableDeveloperMode: false,
      translateLanguages: ['English'],
      showTranslateConfirm: false,
      translateTargetLanguage: 'English',
      translateModel: 'mock-model',
      defaultModel: 'mock-model',
    },
  },
  assistantStoreState: {
    assistants: [],
    getAssistant: () => null,
    updateAssistantConfig: vi.fn(),
  },
  runTranslate: vi.fn(async () => {}),
  reloadMcpServersResource: vi.fn(async () => {}),
}));

const useAssistantStoreMock = Object.assign(
  (selector: (s: typeof assistantStoreState) => unknown) => selector(assistantStoreState),
  {
    getState: () => assistantStoreState,
    subscribe: vi.fn(() => () => undefined),
  },
);

vi.mock('react-i18next', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

vi.mock('@/hooks/useToast', () => ({
  toast: vi.fn(),
}));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children?: ReactNode }) => <>{children ?? null}</>,
}));

vi.mock('@/components/chat/MemoryButton', () => ({
  MemoryButton: () => null,
}));

vi.mock('@/lib/quick-phrases/phrase-store', () => ({
  getQuickPhrases: () => [],
  subscribeQuickPhrases: () => () => undefined,
}));

vi.mock('@/hooks/useModelOptions', () => ({
  useModelOptions: () => ({
    providers: [],
    models: [
      {
        id: 'openai/gpt-5.4',
        modelId: 'gpt-5.4',
        name: 'GPT-5.4',
        providerId: 'openai',
        providerName: 'OpenAI',
        providerType: 'openai',
      },
    ],
    getModelLabel: (id: string) => id,
  }),
}));

vi.mock('@/hooks/useChatSettingsStore', () => ({
  useChatSettingsStore: (selector: (s: typeof settingsState) => unknown) => selector(settingsState),
}));

vi.mock('@/hooks/useAssistantStore', () => ({
  useAssistantStore: useAssistantStoreMock,
}));

vi.mock('@/lib/storage/storage-adapter', () => ({
  getStorageAdapter: () => ({
    onChange: () => () => {},
    get: vi.fn(async () => ({})),
    set: vi.fn(async () => {}),
  }),
}));

vi.mock('@/lib/mcp/storage', () => ({
  loadMcpSettingsConfig: vi.fn(async () => ({
    chatToolsEnabled: true,
  })),
}));

vi.mock('@/lib/mcp/use-mcp-servers-resource', () => ({
  useMcpServersResource: () => ({
    status: 'ready',
    data: [],
    error: null,
    enabledServers: [],
    reload: reloadMcpServersResource,
  }),
}));

vi.mock('@/lib/attachments', () => ({
  putImageAttachment: vi.fn(),
  putFileAttachment: vi.fn(),
  deleteAttachments: vi.fn(),
  getAttachmentBlob: vi.fn(),
  blobToDataUrl: vi.fn(),
}));

vi.mock('@/components/chat/hooks/useChatTranslation', () => ({
  useChatTranslation: () => ({
    isTranslating: false,
    translateConfirmOpen: false,
    resolvedTranslateTargetLanguage: 'English',
    runTranslate,
    requestTranslateFromButton: vi.fn(),
    cancelTranslateConfirm: vi.fn(),
    confirmTranslateFromButton: vi.fn(),
  }),
}));

describe('ChatInput: auto translate', () => {
  beforeEach(() => {
    runTranslate.mockClear();
    reloadMcpServersResource.mockClear();
    settingsState.settings.autoTranslateWithSpace = true;
    settingsState.settings.enableDeveloperMode = false;
    settingsState.settings.translateTargetLanguage = 'English';
  });

  it('开发者模式关闭时停用三连空格翻译，重新开启后恢复生效', async () => {
    const { ChatInput } = await import('./ChatInput');
    const { TooltipProvider } = await import('@/components/ui/tooltip');

    let rerender: ReturnType<typeof render>['rerender'];
    await act(async () => {
      ({ rerender } = render(
        <TooltipProvider>
          <ChatInput
            onSend={vi.fn()}
            onStop={() => {}}
            isLoading={false}
            onOpenPrompts={() => {}}
          />
        </TooltipProvider>,
      ));
      await Promise.resolve();
    });

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '需要翻译的文本' } });

    fireEvent.keyDown(textarea, { key: ' ' });
    fireEvent.keyDown(textarea, { key: ' ' });
    fireEvent.keyDown(textarea, { key: ' ' });

    expect(runTranslate).not.toHaveBeenCalled();

    settingsState.settings.enableDeveloperMode = true;

    await act(async () => {
      rerender(
        <TooltipProvider>
          <ChatInput
            onSend={vi.fn()}
            onStop={() => {}}
            isLoading={false}
            onOpenPrompts={() => {}}
          />
        </TooltipProvider>,
      );
      await Promise.resolve();
    });

    const updatedTextarea = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    fireEvent.change(updatedTextarea, { target: { value: '需要翻译的文本' } });

    fireEvent.keyDown(updatedTextarea, { key: ' ' });
    fireEvent.keyDown(updatedTextarea, { key: ' ' });
    fireEvent.keyDown(updatedTextarea, { key: ' ' });

    expect(runTranslate).toHaveBeenCalledTimes(1);
    expect(runTranslate).toHaveBeenCalledWith('需要翻译的文本', 'auto');
  });
});
