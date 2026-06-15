/**
 * 说明：`ChatInput.element-draft.spec` 组件模块。
 *
 * 职责：
 * - 覆盖外部草稿进入聊天输入区的用户可见行为；
 * - 验证提示词模板、引用卡、隐藏模型上下文、附件队列和发送 payload 保持同步；
 *
 * 边界：
 * - 本文件只测试 ChatInput 组件本地交互，不启动 content script、Service Worker 或真实附件数据库。
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import type { ChatInputElementExternalDraft, ChatInputExternalDraft } from './chat-input/types';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('react-i18next');
  const dict: Record<string, string> = {
    'elementContext.kind.text': '文本',
    'elementContext.kind.code': '代码',
    'elementContext.kind.image': '图片',
    'elementContext.kind.table': '表格',
    'elementContext.kind.visual': '视觉区域',
    'elementContext.summary.table': '{{kind}} · {{tag}} · {{rows}} 行 × {{columns}} 列',
    'elementContext.summary.code': '{{kind}} · {{tag}}{{languagePart}} · {{lines}} 行',
    'elementContext.summary.codeLanguagePart': ' · {{language}}',
    'elementContext.summary.image': '{{kind}} · {{tag}} · {{count}} 张图',
    'elementContext.summary.visual': '{{kind}} · {{tag}} · 截图区域',
    'elementContext.summary.text': '{{kind}} · {{tag}} · 约 {{count}} 字',
    'common.delete': '删除',
  };
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, params?: Record<string, unknown>) => (dict[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(params?.[name] ?? '')),
    }),
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
  addQuickPhrase: vi.fn(),
  getQuickPhrases: () => [],
  subscribeQuickPhrases: vi.fn(() => () => undefined),
}));

vi.mock('@/hooks/useModelOptions', () => ({
  useModelOptions: () => ({ providers: [], models: [], getModelLabel: (id: string) => id }),
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

vi.mock('@/hooks/useChatStore', () => ({
  useChatStore: (selector: (s: { activeConversationKey: string; runtime: { activeTopicId: string } }) => unknown) => selector({
    activeConversationKey: 'topic-1',
    runtime: { activeTopicId: 'topic-1' },
  }),
}));

vi.mock('@/lib/browser-context', () => ({
  scheduleBrowserContextWork: vi.fn(),
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

const attachmentMocks = vi.hoisted(() => ({
  blobToDataUrl: vi.fn(),
  deleteAttachments: vi.fn(async () => undefined),
  getAttachmentBlob: vi.fn(async () => new Blob(['image'], { type: 'image/png' })),
  putFileAttachment: vi.fn(),
  putImageAttachment: vi.fn(),
}));

vi.mock('@/lib/attachments', () => attachmentMocks);

/**
 * 构造测试用页面元素外部草稿。
 *
 * @param overrides - 需要覆盖的草稿字段。
 * @returns 可直接传给 ChatInput 的外部草稿。
 */
function createElementDraft(overrides: Partial<ChatInputElementExternalDraft> = {}): ChatInputElementExternalDraft {
  return {
    id: 'draft-1',
    kind: 'element',
    element: {
      kind: 'table',
      tagName: 'TABLE',
      text: '| 项目 | 状态 |\n| --- | --- |\n| 选择元素 | 已重定位 |',
      table: {
        markdown: '| 项目 | 状态 |\n| --- | --- |\n| 选择元素 | 已重定位 |',
        headerCells: ['项目', '状态'],
        bodyRows: [['选择元素', '已重定位']],
        rows: 2,
        columns: 2,
      },
    },
    source: { title: 'Example Doc', url: 'https://example.com/doc' },
    ...overrides,
  };
}

/**
 * 渲染带 TooltipProvider 的 ChatInput。
 *
 * @param props - 需要覆盖的 ChatInput 入参。
 * @returns Testing Library 渲染结果与发送 spy。
 */
async function renderChatInput(props: Partial<ComponentProps<typeof import('./ChatInput').ChatInput>> = {}) {
  const { ChatInput } = await import('./ChatInput');
  const onSend = vi.fn();
  const view = render(
    <TooltipProvider>
      <ChatInput
        onSend={onSend}
        onStop={() => {}}
        isLoading={false}
        onOpenPrompts={() => {}}
        {...props}
      />
    </TooltipProvider>,
  );
  return { ...view, onSend };
}

/**
 * 等待外部草稿 effect 中的异步附件入队和引用卡状态更新完成。
 */
async function flushElementDraftEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('ChatInput: element draft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    attachmentMocks.putImageAttachment.mockResolvedValue({
      type: 'image',
      id: 'img-1',
      name: 'screenshot.png',
      mime: 'image/png',
      size: 3,
    });
    URL.createObjectURL = vi.fn(() => 'blob:preview') as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
  });

  it('收到外部元素草稿后只展示引用卡，输入框保持空白', async () => {
    const onExternalDraftAccepted = vi.fn();
    await renderChatInput({
      externalDraft: createElementDraft(),
      onExternalDraftAccepted,
    });
    await flushElementDraftEffects();

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    await waitFor(() => {
      expect(screen.getByText('表格 · table')).toBeTruthy();
      expect(textarea.value).toBe('');
      expect(textarea.value).not.toContain('olyq-element-context');
    });
    expect(onExternalDraftAccepted).toHaveBeenCalledWith('draft-1', { ok: true });
  });

  it('收到截图 OCR 草稿后只加入图片附件并预填提取文字提示', async () => {
    const onExternalDraftAccepted = vi.fn();
    await renderChatInput({
      externalDraft: {
        id: 'screenshot-1',
        kind: 'screenshot',
        action: 'ocr',
        prompt: '请提取截图文字',
        image: { dataUrl: 'data:image/png;base64,aW1hZ2U=', name: 'screenshot.png', mime: 'image/png' },
      },
      onExternalDraftAccepted,
    });
    await flushElementDraftEffects();

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    await waitFor(() => {
      expect(textarea.value).toBe('请提取截图文字');
      expect(screen.getByAltText('screenshot.png')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('chat-input-image-attachment-preview'));
    expect(await screen.findByTestId('media-preview-overlay')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-input-element-draft-card')).toBeNull();
    expect(onExternalDraftAccepted).toHaveBeenCalledWith('screenshot-1', { ok: true });
  });

  it('收到提示词模板草稿后写入输入框，不生成元素引用卡', async () => {
    const draft: ChatInputExternalDraft = {
      id: 'prompt-template-1',
      kind: 'prompt-template',
      content: '请总结下面内容',
    };
    const onExternalDraftAccepted = vi.fn();

    await renderChatInput({
      externalDraft: draft,
      onExternalDraftAccepted,
    });

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    await waitFor(() => {
      expect(textarea.value).toBe('请总结下面内容');
      expect(screen.queryByTestId('chat-input-element-draft-card')).toBeNull();
    });
    expect(onExternalDraftAccepted).toHaveBeenCalledWith('prompt-template-1', { ok: true });
  });

  it('提示词模板草稿不会覆盖已有输入，而是换行追加', async () => {
    const { ChatInput } = await import('./ChatInput');
    const onSend = vi.fn();
    const onExternalDraftAccepted = vi.fn();
    const baseProps = {
      onSend,
      onStop: () => {},
      isLoading: false,
      onOpenPrompts: () => {},
    };
    const view = render(
      <TooltipProvider>
        <ChatInput {...baseProps} />
      </TooltipProvider>,
    );

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '已有问题' } });

    view.rerender(
      <TooltipProvider>
        <ChatInput
          {...baseProps}
          externalDraft={{
            id: 'prompt-template-2',
            kind: 'prompt-template',
            content: '补充模板',
          }}
          onExternalDraftAccepted={onExternalDraftAccepted}
        />
      </TooltipProvider>,
    );

    await waitFor(() => expect(textarea.value).toBe('已有问题\n补充模板'));
    expect(onExternalDraftAccepted).toHaveBeenCalledWith('prompt-template-2', { ok: true });
  });

  it('只有元素引用卡且输入框为空时不允许发送', async () => {
    const { onSend } = await renderChatInput({ externalDraft: createElementDraft() });
    await flushElementDraftEffects();

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    await waitFor(() => expect(screen.getByTestId('chat-input-element-draft-card')).toBeTruthy());

    expect(screen.getByTestId('chat-send')).toBeDisabled();
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('删除引用卡会同步移除隐藏模型上下文和待发送附件', async () => {
    const draft = createElementDraft({
      attachments: [{ type: 'image', id: 'img-1', name: 'picked.png', mime: 'image/png', size: 3 }],
    });
    await renderChatInput({ externalDraft: draft });
    await flushElementDraftEffects();

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    await waitFor(() => expect(screen.getByTestId('chat-input-element-draft-card')).toBeTruthy());
    expect(screen.queryByAltText('picked.png')).toBeNull();

    fireEvent.click(screen.getByTestId('chat-input-element-draft-remove'));

    expect(screen.queryByTestId('chat-input-element-draft-card')).toBeNull();
    expect(textarea.value).toBe('');
    expect(attachmentMocks.deleteAttachments).toHaveBeenCalledWith(['img-1']);
  });

  it('发送时用户正文保持纯净，并把结构化元素引用交给发送链路', async () => {
    const draft = createElementDraft({
      attachments: [{ type: 'image', id: 'img-1', name: 'picked.png', mime: 'image/png', size: 3 }],
    });
    const { onSend } = await renderChatInput({ externalDraft: draft });
    await flushElementDraftEffects();

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    await waitFor(() => expect(screen.getByTestId('chat-input-element-draft-card')).toBeTruthy());

    fireEvent.change(textarea, { target: { value: '请总结这个表格' } });

    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });

    expect(onSend).toHaveBeenCalledWith({
      text: '请总结这个表格',
      contextReferences: [{
        id: 'draft-1',
        kind: 'element',
        element: expect.objectContaining({
          kind: 'table',
          table: expect.objectContaining({
            markdown: expect.stringContaining('| 选择元素 | 已重定位 |'),
          }),
        }),
        source: { title: 'Example Doc', url: 'https://example.com/doc' },
        attachmentIds: ['img-1'],
      }],
      attachments: [{ type: 'image', id: 'img-1', name: 'picked.png', mime: 'image/png', size: 3 }],
    });
    expect(textarea.value).toBe('');
  });

  it('多个元素草稿会按顺序生成多张历史引用卡 payload', async () => {
    const { ChatInput } = await import('./ChatInput');
    const onSend = vi.fn();
    const baseProps = {
      onSend,
      onStop: () => {},
      isLoading: false,
      onOpenPrompts: () => {},
    };
    const view = render(
      <TooltipProvider>
        <ChatInput
          {...baseProps}
          externalDraft={createElementDraft({ id: 'draft-1' })}
        />
      </TooltipProvider>,
    );
    await flushElementDraftEffects();

    view.rerender(
      <TooltipProvider>
        <ChatInput
          {...baseProps}
          externalDraft={createElementDraft({
            id: 'draft-2',
            element: {
              kind: 'code',
              tagName: 'PRE',
              text: '代码块内容',
              lineCount: 1,
            },
          })}
        />
      </TooltipProvider>,
    );
    await flushElementDraftEffects();

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '帮我对比' } });
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });

    expect(onSend).toHaveBeenCalledWith(expect.objectContaining({
      text: '帮我对比',
      contextReferences: [
        expect.objectContaining({ id: 'draft-1', element: expect.objectContaining({ kind: 'table' }) }),
        expect.objectContaining({ id: 'draft-2', element: expect.objectContaining({ kind: 'code' }) }),
      ],
    }));
  });
});
