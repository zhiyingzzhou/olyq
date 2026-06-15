/**
 * 说明：`SidebarShellHeader.spec` 组件测试模块。
 *
 * 职责：
 * - 固定侧边栏公共头部不承载应用内品牌；
 * - 确认主工作区动作按钮仍通过统一 tooltip action 暴露可访问名称。
 *
 * 边界：
 * - 这里只验证头部壳体，不覆盖话题列表、助手列表或新标签页打开编排。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SidebarShellHeader } from './SidebarShellHeader';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'app.name': 'Olyq',
      'sidebar.openInNewTab': '在新标签页打开',
      'sidebar.collapse': '收起侧边栏',
    }[key] ?? key),
  }),
}));

describe('SidebarShellHeader', () => {
  it('公共头部隐藏应用内品牌，避免和浏览器外壳重复', () => {
    render(<SidebarShellHeader />);

    expect(screen.queryByTestId('sidebar-shell-logo')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Olyq' })).not.toBeInTheDocument();
  });

  it('打开新标签页和收起按钮保持可用且有可访问名称', () => {
    const onOpenInNewTab = vi.fn();
    const onToggleCollapse = vi.fn();

    render(
      <SidebarShellHeader
        onOpenInNewTab={onOpenInNewTab}
        onToggleCollapse={onToggleCollapse}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '在新标签页打开' }));
    fireEvent.click(screen.getByRole('button', { name: '收起侧边栏' }));

    expect(onOpenInNewTab).toHaveBeenCalledTimes(1);
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });
});
