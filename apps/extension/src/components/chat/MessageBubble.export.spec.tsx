/**
 * 说明：`MessageBubble.export.spec` 组件模块。
 *
 * 职责：
 * - 承载 `MessageBubble.export.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import { MessageBubble } from './MessageBubble';
import type { Message } from '@/types/chat';

const { getAttachmentBlobMock } = vi.hoisted(() => ({
  getAttachmentBlobMock: vi.fn(async () => new Blob(['image'], { type: 'image/png' })),
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
    useTranslation: () => ({ t: tMock }),
  };
});

vi.mock('@/hooks/useConfirmDialog', () => ({
  useConfirmDialog: () => ({
    confirm: vi.fn(async () => true),
    ConfirmDialogPortal: () => null,
  }),
}));

vi.mock('@/lib/attachments', () => ({
  getAttachmentBlob: getAttachmentBlobMock,
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
  FileAttachmentCard: () => <div>file-card</div>,
}));

describe('MessageBubble export menu', () => {
  it('图片消息只渲染真实导出项，不再渲染 5 个伪渠道', async () => {
    const message: Message = {
      id: 'assistant-1',
      role: 'assistant',
      content: 'assistant reply',
      attachments: [
        {
          type: 'image',
          id: 'image-1',
          name: 'demo.png',
          mime: 'image/png',
          size: 4,
        },
      ],
      createdAt: 1_730_000_000_000,
    };

    render(
      <MessageBubble
        message={message}
        onDelete={() => {}}
        onEdit={() => {}}
        isLast={false}
        isLoading={false}
        exportMenuOptions={{
          copy_plain: true,
          copy_image: true,
          export_image: true,
          markdown: true,
          markdown_reason: true,
          word: true,
        }}
      />,
    );

    await waitFor(() => {
      expect(getAttachmentBlobMock).toHaveBeenCalledWith('image-1');
    });

    expect(screen.getByText('message.copyPlain')).toBeInTheDocument();
    expect(screen.getByText('message.copyImage')).toBeInTheDocument();
    expect(screen.getByText('message.exportImage')).toBeInTheDocument();
    expect(screen.getByText('message.exportMarkdown')).toBeInTheDocument();
    expect(screen.getByText('message.exportMarkdownReason')).toBeInTheDocument();
    expect(screen.getByText('message.exportWord')).toBeInTheDocument();

    expect(screen.queryByText('message.exportToNotion')).not.toBeInTheDocument();
    expect(screen.queryByText('message.exportToYuque')).not.toBeInTheDocument();
    expect(screen.queryByText('message.exportToObsidian')).not.toBeInTheDocument();
    expect(screen.queryByText('message.exportToJoplin')).not.toBeInTheDocument();
    expect(screen.queryByText('message.exportToSiyuan')).not.toBeInTheDocument();
  });

  it('纯文本消息不再渲染图片导出项', () => {
    const message: Message = {
      id: 'assistant-2',
      role: 'assistant',
      content: 'text only',
      createdAt: 1_730_000_000_100,
    };

    render(
      <MessageBubble
        message={message}
        onDelete={() => {}}
        onEdit={() => {}}
        isLast={false}
        isLoading={false}
        exportMenuOptions={{
          copy_plain: true,
          copy_image: true,
          export_image: true,
          markdown: true,
          markdown_reason: true,
          word: true,
        }}
      />,
    );

    expect(screen.getByText('message.copyPlain')).toBeInTheDocument();
    expect(screen.queryByText('message.copyImage')).not.toBeInTheDocument();
    expect(screen.queryByText('message.exportImage')).not.toBeInTheDocument();
    expect(screen.getByText('message.exportMarkdown')).toBeInTheDocument();
    expect(screen.getByText('message.exportMarkdownReason')).toBeInTheDocument();
    expect(screen.getByText('message.exportWord')).toBeInTheDocument();
  });
});
