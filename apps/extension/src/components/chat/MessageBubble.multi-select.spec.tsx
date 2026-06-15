/**
 * 说明：`MessageBubble.multi-select.spec` 组件模块。
 *
 * 职责：
 * - 承载 `MessageBubble.multi-select.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageBubble } from './MessageBubble';
import type { Message } from '@/types/chat';

const { downloadBlobMock, getAttachmentBlobMock, toastMock } = vi.hoisted(() => ({
  downloadBlobMock: vi.fn(async () => undefined),
  getAttachmentBlobMock: vi.fn(async () => new Blob(['file'], { type: 'text/plain' })),
  toastMock: vi.fn(),
}));

/**
 * 测试辅助函数：`tMock`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
const tMock = (key: string) => key;

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({ t: tMock, i18n: { language: 'zh-CN' } }),
  };
});

vi.mock('@/hooks/useConfirmDialog', () => ({
  useConfirmDialog: () => ({
    confirm: vi.fn(async () => true),
    ConfirmDialogPortal: () => null,
  }),
}));

vi.mock('@/hooks/useToast', () => ({
  toast: toastMock,
}));

vi.mock('@/lib/attachments', () => ({
  getAttachmentBlob: getAttachmentBlobMock,
}));

vi.mock('@/lib/export/download', () => ({
  downloadBlob: downloadBlobMock,
  downloadText: vi.fn(async () => undefined),
  sanitizeFilename: (name: string) => name,
}));

vi.mock('@/lib/export/document-builder', () => ({
  buildMarkdownExportDocument: vi.fn(async () => '# mock'),
  buildWordExportDocument: vi.fn(async () => '<html />'),
}));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuSub: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSubTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSubContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('./MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>,
}));

vi.mock('./ThinkingBlock', () => ({
  ThinkingBlock: () => <div>thinking</div>,
}));

vi.mock('./WebSearchResultsBlock', () => ({
  WebSearchResultsBlock: () => <div>search-results</div>,
}));

vi.mock('./ToolCallBlock', () => ({
  ToolCallBlock: () => <div>tool-call</div>,
}));

vi.mock('./MessageOutline', () => ({
  MessageOutline: () => null,
}));

vi.mock('./MessageErrorNotice', () => ({
  MessageErrorNotice: () => null,
}));

vi.mock('@/components/chat/ModelPickerDialog', () => ({
  ModelPickerDialog: () => null,
}));

vi.mock('@/components/ui/ProviderIcon', () => ({
  ProviderIcon: () => <div>provider-icon</div>,
}));

vi.mock('./PreviewableImage', () => ({
  PreviewableImage: () => <div>preview-image</div>,
}));

vi.mock('./ImageMessageCard', () => ({
  ImageMessageCard: () => <div>image-card</div>,
}));

vi.mock('./FileAttachmentCard', () => ({
  FileAttachmentCard: ({ onClick }: { onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      file-card
    </button>
  ),
}));

/**
 * 测试辅助函数：`renderBubble`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function renderBubble(
  message: Message,
  options?: {
    onToggleSelect?: () => void;
    isSelected?: boolean;
    getModelLabel?: (id: string) => string;
  },
) {
  return render(
    <MessageBubble
      message={message}
      onDelete={() => {}}
      onEdit={() => {}}
      isLast={false}
      isLoading={false}
      getModelLabel={options?.getModelLabel}
      multiSelectMode
      isSelected={options?.isSelected ?? false}
      onToggleSelect={options?.onToggleSelect}
    />,
  );
}

describe('MessageBubble 多选交互', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('多选模式下点击整行消息会切换选择', () => {
    const onToggleSelect = vi.fn();
    const message: Message = {
      id: 'assistant-1',
      role: 'assistant',
      content: 'assistant reply',
      createdAt: 1_730_000_000_000,
    };

    renderBubble(message, { onToggleSelect });

    fireEvent.click(screen.getByText('assistant reply'));

    expect(onToggleSelect).toHaveBeenCalledTimes(1);
  });

  it('点击右上角 checkbox 只会触发一次选择切换', () => {
    const onToggleSelect = vi.fn();
    const message: Message = {
      id: 'assistant-2',
      role: 'assistant',
      content: 'assistant reply',
      createdAt: 1_730_000_000_001,
    };

    renderBubble(message, { onToggleSelect });

    fireEvent.click(screen.getByRole('checkbox'));

    expect(onToggleSelect).toHaveBeenCalledTimes(1);
  });

  it('点击消息内交互子元素时不会误触整行选择', async () => {
    const onToggleSelect = vi.fn();
    const message: Message = {
      id: 'assistant-3',
      role: 'assistant',
      content: 'assistant reply',
      attachments: [
        {
          type: 'file',
          id: 'file-1',
          name: 'report.txt',
          mime: 'text/plain',
          size: 12,
        },
      ],
      createdAt: 1_730_000_000_002,
    };

    renderBubble(message, { onToggleSelect });

    fireEvent.click(screen.getByText('file-card'));

    await waitFor(() => {
      expect(downloadBlobMock).toHaveBeenCalledTimes(1);
    });
    expect(onToggleSelect).not.toHaveBeenCalled();
  });

  it('system 消息在多选模式下不会响应整行点击', () => {
    const onToggleSelect = vi.fn();
    const message: Message = {
      id: 'system-1',
      role: 'system',
      content: 'system message',
      createdAt: 1_730_000_000_003,
    };

    renderBubble(message, { onToggleSelect });

    fireEvent.click(screen.getByText('system message'));

    expect(onToggleSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('assistant 消息头与正文共享阅读列宽，标题可截断且时间/checkbox 不再抢空间', () => {
    const message: Message = {
      id: 'assistant-layout-1',
      role: 'assistant',
      modelId: 'provider/super-long-model-id',
      content: 'assistant reply',
      createdAt: 1_730_000_000_004,
    };

    renderBubble(message, {
      getModelLabel: () => '一个非常非常非常非常长的模型标题，用来验证 header 的截断与宽度约束',
      onToggleSelect: vi.fn(),
    });

    const lane = screen.getByTestId('message-lane-assistant-layout-1');
    expect(lane.className).toContain('w-full');
    expect(lane.className).not.toContain('max-w-[85%]');
    expect(screen.getByTestId('message-header-assistant-layout-1').className).toContain('w-full');
    expect(screen.getByTestId('message-header-text-assistant-layout-1').className).toContain('min-w-0');
    expect(screen.getByTestId('message-header-text-assistant-layout-1').textContent).toContain('一个非常非常非常非常长的模型标题');
    expect(screen.getByTestId('message-header-time-assistant-layout-1').className).toContain('shrink-0');
    expect(screen.getByRole('checkbox').className).toContain('shrink-0');
    expect(screen.getByRole('checkbox').className).not.toContain('ml-auto');
  });

  it('user 消息头使用显式文本区与元数据区，不再依赖反向 flex 挤压', () => {
    const message: Message = {
      id: 'user-layout-1',
      role: 'user',
      content: 'user reply',
      createdAt: 1_730_000_000_005,
    };

    renderBubble(message, { isSelected: true });

    const header = screen.getByTestId('message-header-user-layout-1');
    const text = screen.getByTestId('message-header-text-user-layout-1');
    const meta = screen.getByTestId('message-header-meta-user-layout-1');

    expect(screen.getByTestId('message-lane-user-layout-1').className).toContain('max-w-[min(72%,42rem)]');
    expect(header.className).toContain('justify-end');
    expect(text.className).toContain('text-right');
    expect(meta.className).toContain('shrink-0');
    expect(header.firstElementChild).toBe(meta);
    expect(header.lastElementChild).toBe(text);
  });

  it('assistant 的纯 preparing 短态会铺满消息 lane，而不是缩成一小块', () => {
    const message: Message = {
      id: 'assistant-short-preparing',
      role: 'assistant',
      status: 'preparing',
      content: '',
      createdAt: 1_730_000_000_006,
    };

    renderBubble(message);

    expect(screen.getByTestId('message-lane-assistant-short-preparing').className).toContain('w-full');
    expect(screen.getByTestId('message-surface-assistant-short-preparing').className).toContain('w-full');
  });

  it('assistant 的纯错误短态也会铺满消息 lane', () => {
    const message: Message = {
      id: 'assistant-short-error',
      role: 'assistant',
      status: 'error',
      content: '',
      error: { key: 'errors.unknownWithDetail', params: { detail: 'boom' } },
      createdAt: 1_730_000_000_007,
    };

    renderBubble(message);

    expect(screen.getByTestId('message-lane-assistant-short-error').className).toContain('w-full');
    expect(screen.getByTestId('message-surface-assistant-short-error').className).toContain('w-full');
  });

  it('有正文的 assistant 会复用同一条固定 lane 宽度', () => {
    const message: Message = {
      id: 'assistant-normal',
      role: 'assistant',
      content: 'assistant reply',
      createdAt: 1_730_000_000_008,
    };

    renderBubble(message);

    const surface = screen.getByTestId('message-surface-assistant-normal');
    expect(screen.getByTestId('message-lane-assistant-normal').className).toContain('w-full');
    expect(surface.className).toContain('w-full');
    expect(surface.className).toContain('shadow-none');
    expect(surface.className).not.toContain('shadow-sm');
    expect(surface.className).not.toContain('group-hover:shadow-md');
  });

  it('只有 trace 的 assistant 也会复用同一条固定 lane 宽度', () => {
    const message: Message = {
      id: 'assistant-trace-only',
      role: 'assistant',
      content: '',
      trace: [{ kind: 'reasoning', text: 'reasoning only' }],
      createdAt: 1_730_000_000_009,
    };

    renderBubble(message);

    expect(screen.getByTestId('message-lane-assistant-trace-only').className).toContain('w-full');
    expect(screen.getByTestId('message-surface-assistant-trace-only').className).toContain('w-full');
  });
});
