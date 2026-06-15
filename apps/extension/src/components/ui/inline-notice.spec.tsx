/**
 * 说明：`inline-notice.spec` 组件模块。
 *
 * 职责：
 * - 锁住 `InlineNotice` 的图标与文案对齐契约；
 * - 防止提示行回退到业务侧 margin 微调；
 * - 验证装饰性状态图标不会重复进入辅助技术语义。
 */
import { render, screen } from '@testing-library/react';
import { AlertTriangle, Info } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { InlineNotice } from './inline-notice';

describe('InlineNotice', () => {
  it('默认把图标和短文案按交叉轴居中，并隐藏装饰性图标语义', () => {
    render(
      <InlineNotice icon={AlertTriangle} tone="warning">
        保存时会连接这个服务
      </InlineNotice>,
    );

    const notice = screen.getByText('保存时会连接这个服务').closest('[data-inline-notice]');
    expect(notice).toBeInTheDocument();
    expect(notice?.className).toContain('items-center');
    expect(notice?.className).toContain('border-amber-500/20');
    expect(notice?.querySelector('[data-inline-notice-icon] svg')).toHaveAttribute('aria-hidden', 'true');
    expect(notice?.querySelector('[data-inline-notice-icon] svg')?.getAttribute('class')).not.toContain('mt-0.5');
  });

  it('多行提示必须显式使用 start 变体，图标仍由首行高度容器承载', () => {
    render(
      <InlineNotice icon={Info} tone="info" align="start">
        <div>
          <p>第一行说明</p>
          <p>第二行说明</p>
        </div>
      </InlineNotice>,
    );

    const notice = screen.getByText('第一行说明').closest('[data-inline-notice]');
    const iconWrapper = notice?.querySelector('[data-inline-notice-icon]');

    expect(notice).toHaveAttribute('data-inline-notice-align', 'start');
    expect(notice?.className).toContain('items-start');
    expect(iconWrapper?.className).toContain('h-5');
    expect(iconWrapper?.querySelector('svg')).toHaveAttribute('focusable', 'false');
  });

  it('destructive tone 会同时约束边框、背景和图标语义色', () => {
    render(
      <InlineNotice icon={AlertTriangle} tone="destructive">
        配置格式错误
      </InlineNotice>,
    );

    const notice = screen.getByText('配置格式错误').closest('[data-inline-notice]');
    const icon = notice?.querySelector('[data-inline-notice-icon] svg');

    expect(notice?.className).toContain('border-destructive/30');
    expect(notice?.className).toContain('bg-destructive/5');
    expect(icon?.getAttribute('class')).toContain('text-destructive');
  });
});
