/**
 * 说明：`tooltip-action.spec` 组件模块。
 *
 * 职责：
 * - 覆盖共享 `TooltipAction` 原语的基础 contract；
 * - 防止 icon-only trigger 再次退回原生 `title`；
 * - 守住 aria-label 与真实 tooltip 同步这一条无障碍约束。
 *
 * 边界：
 * - 这里只验证共享 trigger 原语本身；
 * - 不扩散到具体业务按钮或弹窗组合场景。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TooltipAction } from './tooltip-action';

describe('TooltipAction', () => {
  it('会移除原生 title，并把 tooltip 文案收口为 accessible name', async () => {
    render(
      <TooltipAction tooltip="复制消息">
        <button type="button" title="legacy title">
          icon
        </button>
      </TooltipAction>,
    );

    const trigger = screen.getByRole('button', { name: '复制消息' });
    expect(trigger).not.toHaveAttribute('title');

    fireEvent.focus(trigger);

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('复制消息');
  });
});
