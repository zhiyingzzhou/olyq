/**
 * 说明：`shared.spec` 组件模块。
 *
 * 职责：
 * - 承载 `shared.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { InlineErrorDetails, PrimaryKindBadges, RowBadgeKeysBadges } from './shared';
import { TooltipProvider } from '@/components/ui/tooltip';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'modelRegistry.capabilities.image-generation': '图片生成',
        'modelManagerPanel.modelDialog.modelTypes.rerank': '重排',
      };
      return map[key] ?? key;
    },
  }),
}));

describe('model-manager/shared PrimaryKindBadges', () => {
  it('会把主类渲染成 icon-only badge，并保留可访问文案', () => {
    const { container } = render(
      <TooltipProvider>
        <PrimaryKindBadges primaryKindKeys={['image-generation']} />
      </TooltipProvider>,
    );

    expect(screen.getByLabelText('图片生成')).toBeInTheDocument();
    expect(container.querySelectorAll('svg').length).toBeGreaterThanOrEqual(1);
  });
});

describe('model-manager/shared RowBadgeKeysBadges', () => {
  it('会把 rerank 列表 badge 渲染成 icon-only badge，并保留可访问文案', () => {
    const { container } = render(
      <TooltipProvider>
        <RowBadgeKeysBadges badgeKeys={['rerank']} />
      </TooltipProvider>,
    );

    expect(screen.getByLabelText('重排')).toBeInTheDocument();
    expect(container.querySelectorAll('svg').length).toBeGreaterThanOrEqual(1);
  });
});

describe('model-manager/shared InlineErrorDetails', () => {
  it('摘要和详情相同且未截断时，不显示详情按钮', () => {
    const scrollWidth = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(100);
    const clientWidth = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100);

    render(<InlineErrorDetails summary="短错误" detail="短错误" />);

    expect(screen.getByText('短错误')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'message.details' })).not.toBeInTheDocument();

    scrollWidth.mockRestore();
    clientWidth.mockRestore();
  });

  it('摘要被截断时，显示详情按钮', () => {
    const scrollWidth = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(240);
    const clientWidth = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100);

    render(<InlineErrorDetails summary="被截断的错误摘要" detail="被截断的错误摘要" />);

    expect(screen.getByRole('button', { name: 'message.details' })).toBeInTheDocument();

    scrollWidth.mockRestore();
    clientWidth.mockRestore();
  });

  it('详情和摘要不同时时，显示详情按钮并可打开弹窗', () => {
    render(<InlineErrorDetails summary="短错误" detail="短错误\n附加堆栈" />);

    fireEvent.click(screen.getByRole('button', { name: 'message.details' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes('附加堆栈'))).toBeInTheDocument();
  });
});
