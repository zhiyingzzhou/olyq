/**
 * 说明：`ChatInput.paste-image.spec` 组件模块。
 *
 * 职责：
 * - 承载 `ChatInput.paste-image.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor, act, screen } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';

// 测试环境不需要完整 i18n（但需要保留 initReactI18next 等导出，避免 i18n 初始化报错）
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

vi.mock('@/components/chat/ModelPickerDialog', () => ({
  ModelPickerDialog: () => null,
}));

vi.mock('@/components/chat/MemoryButton', () => ({
  MemoryButton: () => null,
}));

vi.mock('@/lib/quick-phrases/phrase-store', () => ({
  getQuickPhrases: () => [],
  subscribeQuickPhrases: () => () => undefined,
}));

vi.mock('@/hooks/useModelOptions', () => ({
  useModelOptions: () => ({ models: [], getModelLabel: (id: string) => id }),
}));

const settingsState = {
  settings: {
    sendMessageShortcut: 'enter',
    pasteLongTextAsFile: true,
    pasteLongTextThreshold: 2000,
    autoTranslateWithSpace: false,
    translateLanguages: [],
    showTranslateConfirm: false,
    translateTargetLanguage: '',
    translateModel: 'mock-model',
    defaultModel: 'mock-model',
  },
};

vi.mock('@/hooks/useChatSettingsStore', () => ({
  useChatSettingsStore: (selector: (s: typeof settingsState) => unknown) => selector(settingsState),
}));

const assistantStoreState = {
  assistants: [],
  getAssistant: () => null,
  updateAssistantConfig: vi.fn(),
};

const useAssistantStoreMock = Object.assign(
  (selector: (s: typeof assistantStoreState) => unknown) => selector(assistantStoreState),
  {
    getState: () => assistantStoreState,
    subscribe: vi.fn(() => () => undefined),
  },
);

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

const reloadMcpServersResource = vi.fn(async () => {});

vi.mock('@/lib/mcp/use-mcp-servers-resource', () => ({
  useMcpServersResource: () => ({
    status: 'ready',
    data: [],
    error: null,
    enabledServers: [],
    reload: reloadMcpServersResource,
  }),
}));

const putImageAttachment = vi.fn(async (input: { blob: Blob; name: string; mime: string }) => ({
  id: 'img1',
  type: 'image' as const,
  name: input.name,
  mime: input.mime,
  size: Number((input.blob as unknown as { size?: unknown }).size ?? 0) || 0,
}));
const deleteAttachmentsMock = vi.fn(async () => undefined);

vi.mock('@/lib/attachments', () => ({
  putImageAttachment,
  putFileAttachment: vi.fn(),
  deleteAttachments: deleteAttachmentsMock,
  getAttachmentBlob: vi.fn(),
  blobToDataUrl: vi.fn(),
}));

describe('ChatInput: paste image', () => {
  beforeEach(() => {
    putImageAttachment.mockClear();
    deleteAttachmentsMock.mockClear();
    deleteAttachmentsMock.mockResolvedValue(undefined);
    let imageId = 0;
    putImageAttachment.mockImplementation(async (input: { blob: Blob; name: string; mime: string }) => ({
      id: `img${++imageId}`,
      type: 'image' as const,
      name: input.name,
      mime: input.mime,
      size: Number((input.blob as unknown as { size?: unknown }).size ?? 0) || 0,
    }));
    URL.createObjectURL = vi.fn(() => 'blob:preview') as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
  });

  it('应支持从 clipboardData.files 粘贴图片（items 为空的场景）', async () => {
    const { ChatInput } = await import('./ChatInput');

    const onSend = vi.fn();
    const { getByTestId, container } = render(
      <TooltipProvider>
        <ChatInput
          onSend={onSend}
          onStop={() => {}}
          isLoading={false}
          onOpenPrompts={() => {}}
        />
      </TooltipProvider>,
    );

    const textarea = getByTestId('chat-input') as HTMLTextAreaElement;
    const file = new File([new Uint8Array([1, 2, 3])], 'p.png', { type: 'image/png' });

    fireEvent.paste(textarea, {
      clipboardData: {
        files: [file],
        items: [],
        getData: () => '',
      },
    });

    await waitFor(() => expect(putImageAttachment).toHaveBeenCalledTimes(1));

    // 断言：附件预览区应出现图片缩略图
    const img = container.querySelector('img[alt="p.png"]');
    expect(img).toBeTruthy();
  }, 15_000);

  it('点击待发送图片缩略图会打开媒体预览层', async () => {
    const { ChatInput } = await import('./ChatInput');

    const { getByTestId } = render(
      <TooltipProvider>
        <ChatInput
          onSend={vi.fn()}
          onStop={() => {}}
          isLoading={false}
          onOpenPrompts={() => {}}
        />
      </TooltipProvider>,
    );

    const textarea = getByTestId('chat-input') as HTMLTextAreaElement;
    const file = new File([new Uint8Array([1, 2, 3])], 'p.png', { type: 'image/png' });

    fireEvent.paste(textarea, {
      clipboardData: {
        files: [file],
        items: [],
        getData: () => '',
      },
    });

    await waitFor(() => expect(putImageAttachment).toHaveBeenCalledTimes(1));

    fireEvent.click(await screen.findByTestId('chat-input-image-attachment-preview'));

    expect(await screen.findByTestId('media-preview-overlay')).toBeInTheDocument();
  }, 15_000);

  it('应串行处理并发粘贴，避免图片上限被第二批绕过', async () => {
    const { ChatInput } = await import('./ChatInput');

    let imageId = 0;
    putImageAttachment.mockImplementation(async (input: { blob: Blob; name: string; mime: string }) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return {
        id: `img${++imageId}`,
        type: 'image' as const,
        name: input.name,
        mime: input.mime,
        size: Number((input.blob as unknown as { size?: unknown }).size ?? 0) || 0,
      };
    });

    const { getByTestId, container } = render(
      <TooltipProvider>
        <ChatInput
          onSend={vi.fn()}
          onStop={() => {}}
          isLoading={false}
          onOpenPrompts={() => {}}
        />
      </TooltipProvider>,
    );

    const textarea = getByTestId('chat-input') as HTMLTextAreaElement;
    /**
     * 测试辅助函数：`makeImage`。
     *
     * @remarks
     * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
     */
    const makeImage = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });
    const batchA = [makeImage('a.png'), makeImage('b.png'), makeImage('c.png')];
    const batchB = [makeImage('d.png'), makeImage('e.png'), makeImage('f.png')];

    fireEvent.paste(textarea, {
      clipboardData: {
        files: batchA,
        items: [],
        getData: () => '',
      },
    });
    fireEvent.paste(textarea, {
      clipboardData: {
        files: batchB,
        items: [],
        getData: () => '',
      },
    });

    await waitFor(() => {
      expect(container.querySelectorAll('img')).toHaveLength(4);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120));
    });

    await waitFor(() => {
      expect(putImageAttachment).toHaveBeenCalledTimes(4);
      expect(container.querySelectorAll('img')).toHaveLength(4);
    });
  }, 15_000);
});
