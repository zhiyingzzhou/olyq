/**
 * 说明：`MessageBubble.image-actions.spec` 组件模块。
 *
 * 职责：
 * - 承载 `MessageBubble.image-actions.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import * as React from 'react';
import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageBubble } from './MessageBubble';
import type { Message } from '@/types/chat';

const {
  ClipboardItemMock,
  downloadBlobMock,
  getAttachmentBlobMock,
  tMock,
  toastMock,
  writeClipboardMock,
  writeTextMock,
} = vi.hoisted(() => ({
  ClipboardItemMock: vi.fn(function ClipboardItemMock(this: unknown, items: Record<string, Blob>) {
    Object.assign(this as object, { items });
  }),
  downloadBlobMock: vi.fn(async () => undefined),
  getAttachmentBlobMock: vi.fn(async (_id: string) => new Blob(['image'], { type: 'image/png' })),
  tMock: (key: string) => key,
  toastMock: vi.fn(),
  writeClipboardMock: vi.fn(async () => undefined),
  writeTextMock: vi.fn(async () => undefined),
}));

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

vi.mock('@/components/ui/dropdown-menu', () => {
  type DropdownContextValue = {
    open: boolean;
    setOpen: (next: boolean) => void;
  };

  const DropdownContext = React.createContext<DropdownContextValue>({
    open: false,
    setOpen: () => undefined,
  });

    /**
   * 测试辅助函数：`DropdownMenu`。
   *
   * @remarks
   * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
   */
  function DropdownMenu({
    children,
    open,
    onOpenChange,
  }: {
    children: ReactNode;
    open?: boolean;
    onOpenChange?: (next: boolean) => void;
  }) {
    const [innerOpen, setInnerOpen] = React.useState(false);
    const controlled = typeof open === 'boolean';
    const resolvedOpen = controlled ? Boolean(open) : innerOpen;
        /**
     * 测试辅助函数：`setOpen`。
     *
     * @remarks
     * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
     */
    const setOpen = (next: boolean) => {
      if (!controlled) setInnerOpen(next);
      onOpenChange?.(next);
    };

    return (
      <DropdownContext.Provider value={{ open: resolvedOpen, setOpen }}>
        <div>{children}</div>
      </DropdownContext.Provider>
    );
  }

    /**
   * 测试辅助函数：`DropdownMenuTrigger`。
   *
   * @remarks
   * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
   */
  function DropdownMenuTrigger({ children }: { children: ReactNode }) {
    const { open, setOpen } = React.useContext(DropdownContext);
    if (!React.isValidElement(children)) return <>{children}</>;
    const child = children as React.ReactElement<{ onClick?: (event: React.MouseEvent) => void }>;
    return React.cloneElement(child, {
      onClick: (event: React.MouseEvent) => {
        child.props.onClick?.(event);
        setOpen(!open);
      },
    });
  }

    /**
   * 测试辅助函数：`DropdownMenuContent`。
   *
   * @remarks
   * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
   */
  function DropdownMenuContent({ children }: { children: ReactNode }) {
    const { open } = React.useContext(DropdownContext);
    return open ? <div>{children}</div> : null;
  }

    /**
   * 测试辅助函数：`DropdownMenuItem`。
   *
   * @remarks
   * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
   */
  function DropdownMenuItem({ children, onSelect }: { children: ReactNode; onSelect?: () => void }) {
    const { setOpen } = React.useContext(DropdownContext);
    return (
      <button
        type="button"
        onClick={() => {
          onSelect?.();
          setOpen(false);
        }}
      >
        {children}
      </button>
    );
  }

  return {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuSub: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DropdownMenuSubTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DropdownMenuSubContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  };
});

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
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
  ImageMessageCard: ({ index, onIndexChange }: { index: number; onIndexChange: (next: number) => void }) => (
    <div>
      <button type="button" onClick={() => onIndexChange(0)}>select-image-0</button>
      <button type="button" onClick={() => onIndexChange(1)}>select-image-1</button>
      <div>current-index:{index}</div>
    </div>
  ),
}));

vi.mock('./FileAttachmentCard', () => ({
  FileAttachmentCard: () => <div>file-card</div>,
}));

describe('MessageBubble image actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: {
        write: writeClipboardMock,
        writeText: writeTextMock,
      },
    });

    Object.defineProperty(globalThis, 'ClipboardItem', {
      configurable: true,
      value: ClipboardItemMock,
    });

    getAttachmentBlobMock.mockImplementation(async (id: string) => {
      if (id === 'image-2') return new Blob(['image-second'], { type: 'image/png' });
      return new Blob(['image-first'], { type: 'image/png' });
    });
  });

    /**
   * 测试辅助函数：`renderImageMessage`。
   *
   * @remarks
   * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
   */
  function renderImageMessage(messageOverride?: Partial<Message>) {
    const message: Message = {
      id: 'assistant-image',
      role: 'assistant',
      content: '',
      attachments: [
        {
          type: 'image',
          id: 'image-1',
          name: 'first.png',
          mime: 'image/png',
          size: 11,
        },
        {
          type: 'image',
          id: 'image-2',
          name: 'second.png',
          mime: 'image/png',
          size: 12,
        },
      ],
      createdAt: 1_730_000_000_000,
      ...messageOverride,
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
  }

  it('导出图片命中当前选中的附件原图', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 26, 1, 7, 8, 123));

    try {
      renderImageMessage();

      fireEvent.click(screen.getByText('select-image-1'));
      fireEvent.click(screen.getByLabelText('message.more'));
      await act(async () => {
        fireEvent.click(screen.getByText('message.exportImage'));
        await Promise.resolve();
        await Promise.resolve();
      });

      const firstDownloadCall = downloadBlobMock.mock.calls[0] as unknown[] | undefined;
      expect(firstDownloadCall).toBeDefined();
      const blob = firstDownloadCall?.[0];
      const filename = firstDownloadCall?.[1];
      expect(getAttachmentBlobMock).toHaveBeenLastCalledWith('image-2');
      expect(blob).toBeTruthy();
      expect(filename).toBe('second_2026-03-26_01-07-08-123.png');
      expect(writeClipboardMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('复制图片命中当前选中的附件原图', async () => {
    renderImageMessage();

    fireEvent.click(screen.getByText('select-image-1'));
    fireEvent.click(screen.getByLabelText('message.more'));
    const copyImageMenuButton = (await screen.findAllByText('message.copyImage')).find((element) => {
      return element.tagName === 'BUTTON' && !element.hasAttribute('aria-label');
    });
    expect(copyImageMenuButton).toBeTruthy();
    fireEvent.click(copyImageMenuButton!);

    await waitFor(() => {
      expect(writeClipboardMock).toHaveBeenCalledTimes(1);
    });

    expect(ClipboardItemMock).toHaveBeenCalledTimes(1);
    expect(getAttachmentBlobMock).toHaveBeenLastCalledWith('image-2');
    const items = ClipboardItemMock.mock.calls[0]?.[0] as Record<string, Blob>;
    expect(items['image/png']).toBeTruthy();
    expect(downloadBlobMock).not.toHaveBeenCalled();
  });

  it('三点菜单打开期间会锁定操作栏显示，关闭后恢复', async () => {
    renderImageMessage({ id: 'assistant-text', content: 'assistant reply', attachments: undefined });

    const actionBar = screen.getByTestId('message-actions-assistant-text');
    expect(actionBar).toHaveAttribute('data-visible', 'false');

    fireEvent.click(screen.getByLabelText('message.more'));
    await waitFor(() => {
      expect(actionBar).toHaveAttribute('data-visible', 'true');
    });

    fireEvent.click(screen.getByLabelText('message.more'));
    await waitFor(() => {
      expect(actionBar).toHaveAttribute('data-visible', 'false');
    });
  });
});
