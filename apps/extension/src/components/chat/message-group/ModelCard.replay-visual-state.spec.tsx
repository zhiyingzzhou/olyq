/**
 * 说明：`ModelCard.replay-visual-state.spec` 组件模块。
 *
 * 职责：
 * - 承载多模型分组卡片在 resend / preparing 态下的视觉语义回归测试；
 * - 确保分组卡片与单条 assistant 气泡使用同一套状态表达。
 *
 * 边界：
 * - 本文件只覆盖 `ModelCard` 的 replacement pending / stub preparing 渲染，不测试其它动作菜单细节。
 */
import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { Message } from '@/types/chat';

import { ModelCard } from './ModelCard';

/**
 * 测试辅助函数：`tMock`。
 *
 * @remarks
 * 用于当前测试文件中的文案映射，不作为运行时代码复用。
 */
function tMock(key: string) {
  if (key === 'chat.preparingReply') return '准备回复中…';
  if (key === 'chat.collectingPageScreenshots') return '正在采集页面截图…';
  if (key === 'chat.replacementPendingTitle') return '正在重新生成，将替换当前回复';
  if (key === 'chat.replacementPendingDesc') return '以下内容是上一版回复快照，不是正在生成的新回复。';
  if (key === 'group.empty') return '无内容';
  if (key === 'chat.assistant') return '助手';
  if (key === 'chat.copy') return '复制';
  if (key === 'chat.regenerate') return '重新生成';
  if (key === 'chat.regenerateDisabledWhileLoading') return '当前有生成任务进行中，暂时不能重新生成';
  if (key === 'message.multiSelect') return '多选';
  if (key === 'chat.image') return '图片';
  if (key === 'message.copyImage') return '复制图片';
  return key;
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: tMock,
    i18n: { language: 'zh-CN' },
  }),
}));

vi.mock('@/hooks/useConfirmDialog', () => ({
  useConfirmDialog: () => ({
    confirm: vi.fn(async () => true),
    ConfirmDialogPortal: () => null,
  }),
}));

vi.mock('@/hooks/useToast', () => ({
  toast: vi.fn(),
}));

vi.mock('@/components/chat/MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>,
}));

vi.mock('@/components/chat/PreviewableImage', () => ({
  PreviewableImage: ({ alt }: { alt: string }) => <div>{alt}</div>,
}));

vi.mock('@/components/chat/MessageOutline', () => ({
  MessageOutline: () => null,
}));

vi.mock('@/components/chat/MessageErrorNotice', () => ({
  MessageErrorNotice: () => null,
}));

vi.mock('@/components/chat/MessageTranslationsBlock', () => ({
  MessageTranslationsBlock: () => null,
}));

vi.mock('@/components/chat/ThinkingBlock', () => ({
  ThinkingBlock: ({ content }: { content: string }) => <div>{content}</div>,
}));

vi.mock('@/components/chat/ToolCallBlock', () => ({
  ToolCallBlock: () => <div>tool-call</div>,
}));

vi.mock('@/components/chat/WebSearchResultsBlock', () => ({
  WebSearchResultsBlock: () => <div>search-results</div>,
}));

vi.mock('@/components/ui/ProviderIcon', () => ({
  ProviderIcon: () => <div>provider-icon</div>,
}));

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onSelect }: { children: ReactNode; onSelect?: () => void }) => (
    <button type="button" onClick={onSelect}>{children}</button>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

/**
 * 测试辅助函数：`createMessage`。
 *
 * @remarks
 * 用于快速构造 `ModelCard` assistant 消息，不作为运行时代码复用。
 */
function createMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'assistant-1',
    askId: 'ask-1',
    role: 'assistant',
    modelId: 'provider/model-a',
    content: '',
    status: 'success',
    createdAt: 1,
    ...overrides,
  };
}

describe('ModelCard replay visual state', () => {
  it('preparing 且保留旧答时显示替换状态条和旧答快照', async () => {
    await act(async () => {
      render(
        <ModelCard
          message={createMessage({
            status: 'preparing',
            content: '旧回复 A',
          })}
          isLoading={true}
          getModelLabel={() => '模型 A'}
          onToggleUseful={() => undefined}
        />,
      );
      await Promise.resolve();
    });

    expect(screen.getByText('正在重新生成，将替换当前回复')).toBeInTheDocument();
    expect(screen.getByText('以下内容是上一版回复快照，不是正在生成的新回复。')).toBeInTheDocument();
    expect(screen.getByText('旧回复 A')).toBeInTheDocument();
    expect(screen.queryByText('准备回复中…')).not.toBeInTheDocument();
  });

  it('preparing 且没有旧输出时只显示 preflight 占位，不显示空内容', async () => {
    await act(async () => {
      render(
        <ModelCard
          message={createMessage({
            status: 'preparing',
            content: '',
          })}
          isLoading={true}
          getModelLabel={() => '模型 A'}
          onToggleUseful={() => undefined}
        />,
      );
      await Promise.resolve();
    });

    expect(screen.getByText('准备回复中…')).toBeInTheDocument();
    expect(screen.queryByText('正在重新生成，将替换当前回复')).not.toBeInTheDocument();
    expect(screen.queryByText('无内容')).not.toBeInTheDocument();
  });

  it('页面风格截图 preflight 期间显示采集提示', async () => {
    await act(async () => {
      render(
        <ModelCard
          message={createMessage({
            status: 'preparing',
            content: '',
          })}
          isLoading={true}
          browserContextPreflightPhase="style-capture"
          getModelLabel={() => '模型 A'}
          onToggleUseful={() => undefined}
        />,
      );
      await Promise.resolve();
    });

    expect(screen.getByText('正在采集页面截图…')).toBeInTheDocument();
    expect(screen.queryByText('准备回复中…')).not.toBeInTheDocument();
    expect(screen.queryByText('无内容')).not.toBeInTheDocument();
  });
});
