/**
 * 说明：`WebSearchResultsBlock.spec` 组件测试。
 *
 * 职责：
 * - 固化联网搜索结果块作为聊天内嵌过程块的平面视觉契约；
 * - 避免全局 surface 调整再次把搜索结果渲染成带阴影卡片。
 *
 * 边界：
 * - 本文件只测试结果块自身的 class contract，不覆盖联网搜索数据流。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { WebSearchResultsBlock } from './WebSearchResultsBlock';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('WebSearchResultsBlock', () => {
  it('搜索中状态保持平面内嵌块，不叠卡片阴影', () => {
    const { container } = render(<WebSearchResultsBlock results={[]} isSearching query="query" />);

    expect(screen.getByText('webSearch.results.searching')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass('bg-muted/20', 'shadow-none');
    expect(container.firstElementChild).not.toHaveClass('bg-card', 'shadow-sm');
  });

  it('搜索结果摘要状态保持平面内嵌块，不叠卡片阴影', () => {
    const { container } = render(
      <WebSearchResultsBlock
        isSearching={false}
        results={[
          {
            title: 'Result',
            url: 'https://example.com',
            snippet: 'Snippet',
          },
        ]}
      />,
    );

    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass('bg-muted/20', 'shadow-none');
    expect(container.firstElementChild).not.toHaveClass('bg-card', 'shadow-sm');
  });
});
