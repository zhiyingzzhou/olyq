/**
 * 说明：`QuickPhraseManager.spec` 组件测试模块。
 *
 * 职责：
 * - 固定快捷短语管理列表只保留拖拽排序入口；
 * - 防止上移/下移按钮回流成第二套排序交互；
 * - 验证全局管理弹窗继续通过快捷短语 store 读取当前结构。
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import { QuickPhraseManager } from './QuickPhraseManager';

const quickPhraseStoreMock = vi.hoisted(() => ({
  phrases: [
    {
      id: 'phrase-1',
      title: 'First',
      content: 'first content',
      createdAt: 1,
      updatedAt: 1,
      order: 2,
    },
    {
      id: 'phrase-2',
      title: 'Second',
      content: 'second content',
      createdAt: 1,
      updatedAt: 1,
      order: 1,
    },
  ],
  subscribeQuickPhrases: vi.fn(() => () => undefined),
}));

const assistantStoreMock = vi.hoisted(() => ({
  assistants: [] as Array<{
    id: string;
    name: string;
    regularPhrases?: Array<{
      id: string;
      title: string;
      content: string;
      createdAt: number;
      updatedAt: number;
      order: number;
    }>;
  }>,
  updateAssistantConfig: vi.fn(),
}));

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

vi.mock('@/lib/quick-phrases/phrase-store', () => ({
  getQuickPhrases: () => quickPhraseStoreMock.phrases.map((phrase) => ({ ...phrase })),
  subscribeQuickPhrases: quickPhraseStoreMock.subscribeQuickPhrases,
  addQuickPhrase: vi.fn(),
  updateQuickPhrase: vi.fn(),
  deleteQuickPhrase: vi.fn(),
  reorderQuickPhrases: vi.fn(),
}));

vi.mock('@/hooks/useAssistantStore', () => ({
  useAssistantStore: <T,>(selector: (state: {
    assistants: typeof assistantStoreMock.assistants;
    updateAssistantConfig: typeof assistantStoreMock.updateAssistantConfig;
  }) => T) => selector({
    assistants: assistantStoreMock.assistants,
    updateAssistantConfig: assistantStoreMock.updateAssistantConfig,
  }),
}));

describe('QuickPhraseManager', () => {
  beforeEach(() => {
    quickPhraseStoreMock.subscribeQuickPhrases.mockClear();
    assistantStoreMock.updateAssistantConfig.mockClear();
    assistantStoreMock.assistants = [];
  });

  it('只展示拖拽排序 handle，不再展示上移和下移按钮', () => {
    render(
      <TooltipProvider>
        <QuickPhraseManager open onClose={() => {}} />
      </TooltipProvider>,
    );

    expect(screen.getAllByLabelText('quickPhrase.dragHandle')).toHaveLength(2);
    expect(screen.queryByLabelText('quickPhrase.moveUp')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('quickPhrase.moveDown')).not.toBeInTheDocument();
  });

  it('用单行列表 surface 展示快捷短语，不再拆成多块胶囊控件或外层列表框', () => {
    render(
      <TooltipProvider>
        <QuickPhraseManager open onClose={() => {}} />
      </TooltipProvider>,
    );

    const firstPhrase = screen.getByTestId('quick-phrase-card-phrase-1');
    const listRoot = screen.getByTestId('quick-phrase-sortable-list');
    expect(firstPhrase).toHaveClass('rounded-lg', 'border');
    expect(firstPhrase).not.toHaveClass('rounded-2xl');
    expect(listRoot.parentElement).not.toHaveClass('rounded-lg', 'border', 'bg-card', 'p-2');
  });

  it('把当前助手短语放在管理弹窗的默认入口，并让列表区域固定为内部滚动', () => {
    assistantStoreMock.assistants = [{
      id: 'assistant-1',
      name: '当前助手',
      regularPhrases: [{
        id: 'regular-1',
        title: '助手短语',
        content: 'assistant content',
        createdAt: 1,
        updatedAt: 1,
        order: 1,
      }],
    }];

    render(
      <TooltipProvider>
        <QuickPhraseManager open activeAssistantId="assistant-1" onClose={() => {}} />
      </TooltipProvider>,
    );

    expect(screen.getByRole('dialog')).toHaveClass('h-[min(720px,calc(100vh-2rem))]');
    expect(screen.getByRole('tab', { name: 'quickPhrase.assistantScope' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByTestId('quick-phrase-list-panel')).toHaveClass('min-h-0', 'overflow-y-auto');
    expect(screen.getByTestId('quick-phrase-card-regular-1')).toBeInTheDocument();
    expect(screen.queryByTestId('quick-phrase-card-phrase-1')).not.toBeInTheDocument();
  });

  it('可以在管理弹窗里直接编辑当前助手短语', () => {
    assistantStoreMock.assistants = [{
      id: 'assistant-1',
      name: '当前助手',
      regularPhrases: [{
        id: 'regular-1',
        title: '旧短语',
        content: 'old content',
        createdAt: 1,
        updatedAt: 1,
        order: 1,
      }],
    }];

    render(
      <TooltipProvider>
        <QuickPhraseManager open activeAssistantId="assistant-1" onClose={() => {}} />
      </TooltipProvider>,
    );

    fireEvent.click(within(screen.getByTestId('quick-phrase-card-regular-1')).getByRole('button', { name: 'common.edit' }));
    fireEvent.change(screen.getByPlaceholderText('quickPhrase.titlePlaceholder'), {
      target: { value: '编辑后短语' },
    });
    fireEvent.change(screen.getByPlaceholderText('quickPhrase.contentPlaceholder'), {
      target: { value: 'edited content' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));

    expect(assistantStoreMock.updateAssistantConfig).toHaveBeenCalledWith('assistant-1', {
      regularPhrases: [expect.objectContaining({
        id: 'regular-1',
        title: '编辑后短语',
        content: 'edited content',
      })],
    });
  });

  it('可以在管理弹窗里直接删除当前助手短语', async () => {
    assistantStoreMock.assistants = [{
      id: 'assistant-1',
      name: '当前助手',
      regularPhrases: [{
        id: 'regular-1',
        title: '旧短语',
        content: 'old content',
        createdAt: 1,
        updatedAt: 1,
        order: 1,
      }],
    }];

    render(
      <TooltipProvider>
        <QuickPhraseManager open activeAssistantId="assistant-1" onClose={() => {}} />
      </TooltipProvider>,
    );

    fireEvent.click(within(screen.getByTestId('quick-phrase-card-regular-1')).getByRole('button', { name: 'common.delete' }));

    const confirmDialog = screen.getByRole('alertdialog');
    expect(confirmDialog).toHaveTextContent('quickPhrase.deleteConfirmTitle');
    expect(confirmDialog).toHaveTextContent('quickPhrase.deleteConfirmDesc');
    expect(screen.getByTestId('confirm-dialog-warning-icon')).toHaveClass('text-destructive');
    fireEvent.click(within(confirmDialog).getByRole('button', { name: 'common.delete' }));

    await waitFor(() => {
      expect(assistantStoreMock.updateAssistantConfig).toHaveBeenCalledWith('assistant-1', {
        regularPhrases: [],
      });
    });
  });
});
