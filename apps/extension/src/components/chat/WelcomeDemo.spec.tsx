/**
 * 说明：`WelcomeDemo.spec` 组件测试。
 *
 * 职责：
 * - 固化开发者渲染示例里的 assistant sample 视觉契约；
 * - 避免全局 surface 调整再次把示例 AI 气泡渲染成带阴影卡片。
 *
 * 边界：
 * - 本文件只测试示例气泡自身的 class contract，不覆盖 Markdown 渲染能力。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { WelcomeDemo } from './WelcomeDemo';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('./MarkdownRenderer', () => ({
  MarkdownRenderer: () => <div data-testid="welcome-demo-markdown" />,
}));

describe('WelcomeDemo', () => {
  it('开发者渲染示例的 assistant sample 保持平面 surface', () => {
    render(<WelcomeDemo modelName="AI" />);

    const surface = screen.getByTestId('welcome-demo-assistant-surface');
    expect(surface).toHaveClass('bg-card', 'shadow-none');
    expect(surface).not.toHaveClass('shadow-sm');
  });
});
