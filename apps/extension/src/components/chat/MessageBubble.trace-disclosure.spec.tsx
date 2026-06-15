/**
 * 说明：`MessageBubble.trace-disclosure.spec` 组件模块。
 *
 * 职责：
 * - 覆盖 assistant trace disclosure 的可访问性与固定 lane 宽度契约；
 * - 防止 thinking / tool-call 再回到内容驱动定宽，导致展开后气泡宽度抖动；
 * - 守住长工具名的截断与 trigger 语义。
 *
 * 边界：
 * - 这里只验证 trace disclosure 与 message lane 的交互；
 * - 不扩散到导出菜单、图片动作或其它消息操作。
 */
import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MessageBubble } from './MessageBubble';
import type { Message } from '@/types/chat';

const { getAttachmentBlobMock, toastMock } = vi.hoisted(() => ({
  getAttachmentBlobMock: vi.fn(async () => null),
  toastMock: vi.fn(),
}));

/**
 * 提供本测试文件需要的最小翻译桩，避免真实 i18n 资源影响 disclosure 断言。
 *
 * @param key - 当前请求的国际化 key。
 * @param params - 插值参数。
 * @returns 与当前测试断言匹配的稳定文案。
 */
const tMock = (key: string, params?: Record<string, string | number>) => {
  if (key === 'chat.thinking') return '思考中';
  if (key === 'chat.thinkingProcess') return '思考过程';
  if (key === 'chat.approxChars') return `约 ${params?.count ?? 0} 字`;
  if (key === 'chat.toolStatus.calling') return '调用中';
  if (key === 'chat.toolStatus.done') return '已完成';
  if (key === 'chat.toolStatus.expired') return '已超时';
  if (key === 'chat.toolStatus.cancelled') return '已取消';
  if (key === 'chat.toolStatus.error') return '失败';
  if (key === 'chat.copy') return '复制';
  if (key === 'chat.copied') return '已复制';
  if (key === 'chat.toolCopied') return '工具调用已复制';
  if (key === 'chat.toolAbort') return '中止工具';
  if (key === 'chat.args') return '参数';
  if (key === 'chat.toolInput') return '调用输入';
  if (key === 'chat.toolInputEmpty') return '无';
  if (key === 'chat.toolSearchQuery') return '搜索查询';
  if (key === 'chat.toolSearchSources') return '来源数量';
  if (key === 'chat.result') return '结果';
  if (key === 'common.error') return '错误';
  if (key === 'sidebar.clipboardFailed') return '复制失败';
  return key;
};

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

vi.mock('./WebSearchResultsBlock', () => ({
  WebSearchResultsBlock: () => <div>search-results</div>,
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

/**
 * 用最小依赖渲染一条消息气泡，聚焦当前文件要验证的 trace disclosure 行为。
 *
 * @param message - 待渲染的消息数据。
 * @returns Testing Library 的 render 结果。
 */
function renderBubble(message: Message) {
  return render(
    <MessageBubble
      message={message}
      onDelete={() => {}}
      onEdit={() => {}}
      isLast={false}
      isLoading={false}
      getModelLabel={() => 'OpenAI'}
    />,
  );
}

describe('MessageBubble trace disclosure', () => {
  it('reasoning disclosure 会暴露 aria contract，并且展开后 lane 宽度不变', () => {
    const message: Message = {
      id: 'assistant-trace-reasoning',
      role: 'assistant',
      content: '',
      trace: [{ kind: 'reasoning', text: '第一段思考内容\n第二段思考内容' }],
      createdAt: 1_730_000_000_010,
    };

    renderBubble(message);

    const lane = screen.getByTestId('message-lane-assistant-trace-reasoning');
    const laneClassName = lane.className;
    const trigger = screen.getByRole('button', { name: /思考过程/ });

    expect(laneClassName).toContain('w-full');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-controls');
    expect(trigger.className).toContain('ring-inset');

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(trigger.getAttribute('aria-controls') || '')).toHaveTextContent('第一段思考内容');
    expect(lane.className).toBe(laneClassName);
  });

  it('长工具名会在固定 lane 内截断，并复用同一套 disclosure 语义', () => {
    const longToolName = 'super-long-tool-name-with-many-many-many-segments-that-should-not-push-the-message-lane';
    const message: Message = {
      id: 'assistant-trace-tool',
      role: 'assistant',
      content: '',
      trace: [{
        kind: 'tool-call',
        toolCallId: 'tool-call-1',
        toolName: `server__${longToolName}`,
        args: { city: 'Shanghai' },
        status: 'done',
        result: { ok: true },
      }],
      createdAt: 1_730_000_000_011,
    };

    renderBubble(message);

    const lane = screen.getByTestId('message-lane-assistant-trace-tool');
    const trigger = screen.getByRole('button', { name: new RegExp(longToolName) });
    const title = screen.getByText(longToolName);

    expect(lane.className).toContain('w-full');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-controls');
    expect(trigger.className).toContain('ring-inset');
    expect(title.className).toContain('truncate');

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(trigger.getAttribute('aria-controls') || '')).toHaveTextContent('"city": "Shanghai"');
  });

  it('native 搜索工具显示 NATIVE 徽章、空输入和搜索摘要，不把空 args 渲染成 JSON', () => {
    const message: Message = {
      id: 'assistant-native-search-tool',
      role: 'assistant',
      content: '',
      trace: [{
        kind: 'tool-call',
        toolCallId: 'native-search-1',
        toolName: 'native__openai_web_search',
        args: {},
        status: 'done',
        result: {
          action: { query: 'today international headlines' },
          sources: [
            { type: 'url', url: 'https://example.com/a' },
            { type: 'url', url: 'https://example.com/b' },
          ],
        },
      }],
      createdAt: 1_730_000_000_012,
    };

    renderBubble(message);

    expect(screen.getByText('NATIVE')).toBeInTheDocument();
    const trigger = screen.getByRole('button', { name: /openai_web_search/ });
    fireEvent.click(trigger);

    const content = document.getElementById(trigger.getAttribute('aria-controls') || '');
    expect(content).toHaveTextContent('调用输入：无');
    expect(content).not.toHaveTextContent('{}');
    expect(content).toHaveTextContent('搜索查询：today international headlines');
    expect(content).toHaveTextContent('来源数量：2');
  });
});
