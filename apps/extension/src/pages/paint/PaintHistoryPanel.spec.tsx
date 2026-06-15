/**
 * 说明：PaintHistoryPanel 视觉与可访问性测试。
 *
 * 职责：
 * - 锁住绘画历史右栏的记录数量、空态、元信息与 active 状态；
 * - 防止历史行回退成嵌套按钮或不可访问删除入口；
 * - 保证提示词摘要和图片数量 metadata 在列表项里稳定展示。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Painting } from '@/hooks/usePaintStore';

import { PaintHistoryPanel } from './PaintHistoryPanel';

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, params?: Record<string, unknown>) => {
        if (key === 'paint.historyCount') return `${String(params?.count ?? 0)} records`;
        if (key === 'paint.resultCount') return `${String(params?.count ?? 0)} results`;
        if (key === 'paint.inputCount') return `${String(params?.count ?? 0)} inputs`;
        if (key === 'paint.noPromptSummary') return 'No prompt summary';
        return key;
      },
    }),
  };
});

/** 构造历史面板测试绘画记录。 */
function makePainting(overrides: Partial<Painting> = {}): Painting {
  return {
    id: 'paint-1',
    title: 'Cover draft',
    model: 'openai/gpt-image-1',
    prompt: '生成游戏封面，赛博城市，强烈商业视觉',
    params: { n: 2 },
    inputImages: [
      { id: 'input-1', name: 'input.png', mime: 'image/png', size: 10 },
    ],
    outputImages: [
      { id: 'out-1', name: 'out-1.png', mime: 'image/png', size: 10 },
      { id: 'out-2', name: 'out-2.png', mime: 'image/png', size: 10 },
    ],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('PaintHistoryPanel', () => {
  it('空态显示记录数量和轻量说明', () => {
    render(
      <PaintHistoryPanel
        activeId={null}
        paintings={[]}
        getModelLabel={() => ''}
        onDelete={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText('0 records')).toBeInTheDocument();
    expect(screen.getByText('paint.noResults')).toBeInTheDocument();
    expect(screen.getByText('paint.empty')).toBeInTheDocument();
  });

  it('历史行展示 active 状态、提示词摘要和图片 metadata', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const onSelect = vi.fn();
    render(
      <PaintHistoryPanel
        activeId="paint-1"
        paintings={[makePainting()]}
        getModelLabel={() => 'GPT Image'}
        onDelete={onDelete}
        onSelect={onSelect}
      />,
    );

    const item = screen.getByRole('button', { name: /Cover draft/ });
    expect(item).toHaveAttribute('aria-current', 'true');
    expect(screen.getByText('GPT Image')).toBeInTheDocument();
    expect(screen.getByText(/生成游戏封面/)).toBeInTheDocument();
    expect(screen.getByText('2 results')).toBeInTheDocument();
    expect(screen.getByText('1 inputs')).toBeInTheDocument();

    await user.click(item);
    expect(onSelect).toHaveBeenCalledWith('paint-1');

    await user.click(screen.getByRole('button', { name: 'paint.delete' }));
    expect(onDelete).toHaveBeenCalledWith('paint-1');
  });
});
