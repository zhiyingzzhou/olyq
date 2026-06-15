/**
 * 说明：`WelcomeEmptyState.spec` 组件模块。
 *
 * 职责：
 * - 承载 `WelcomeEmptyState.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('WelcomeEmptyState', () => {
  it('只展示欢迎空态，不再渲染开发者调试演示入口', async () => {
    const { WelcomeEmptyState } = await import('./WelcomeEmptyState');

    render(<WelcomeEmptyState modelName="GPT-4o mini" />);

    expect(screen.getByText('welcome.title')).toBeInTheDocument();
    expect(screen.queryByText('welcome.debugTitle')).not.toBeInTheDocument();
  });

  it('欢迎空态外壳和能力卡片保持平面 surface', async () => {
    const { WelcomeEmptyState } = await import('./WelcomeEmptyState');

    render(<WelcomeEmptyState modelName="GPT-5.4" />);

    expect(screen.getByTestId('welcome-empty-state-panel')).toHaveClass('shadow-none');
    expect(screen.getByTestId('welcome-empty-state-panel')).not.toHaveClass('shadow-sm');
    expect(screen.getByTestId('welcome-empty-state-hero-icon')).toHaveClass('shadow-none');
    expect(screen.getByTestId('welcome-empty-state-hero-icon')).not.toHaveClass('shadow-sm');

    const featureCards = screen.getAllByTestId('welcome-empty-state-feature-card');
    expect(featureCards).toHaveLength(3);
    for (const card of featureCards) {
      expect(card).toHaveClass('shadow-none');
      expect(card).not.toHaveClass('shadow-sm');
    }
  });
});
