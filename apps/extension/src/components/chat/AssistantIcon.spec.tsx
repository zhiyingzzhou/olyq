/**
 * 说明：`AssistantIcon.spec` 组件模块。
 *
 * 职责：
 * - 承载 `AssistantIcon.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AssistantIcon } from './AssistantIcon';

describe('AssistantIcon', () => {
  it('渲染稳定 iconId', () => {
    render(<AssistantIcon data-testid="icon" iconId="chart-column" />);

    const icon = screen.getByTestId('icon');
    expect(icon).toHaveAttribute('data-assistant-icon-source', 'icon');
    expect(icon).toHaveAttribute('data-assistant-icon-id', 'chart-column');
    expect(icon.querySelector('svg')).not.toBeNull();
  });

  it('渲染其它稳定 iconId', () => {
    render(<AssistantIcon data-testid="icon" iconId="palette" />);

    const icon = screen.getByTestId('icon');
    expect(icon).toHaveAttribute('data-assistant-icon-source', 'icon');
    expect(icon).toHaveAttribute('data-assistant-icon-id', 'palette');
    expect(icon.querySelector('svg')).not.toBeNull();
  });

  it('缺少 iconId 时回退到默认机器人图标', () => {
    render(<AssistantIcon data-testid="icon" />);

    const icon = screen.getByTestId('icon');
    expect(icon).toHaveAttribute('data-assistant-icon-source', 'default');
    expect(icon).toHaveAttribute('data-assistant-icon-id', 'bot');
  });
});
