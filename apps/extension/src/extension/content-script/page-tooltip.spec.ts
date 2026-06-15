/**
 * 说明：`page-tooltip.spec` 内容脚本模块。
 *
 * 职责：
 * - 覆盖 page-facing shadow DOM tooltip contract；
 * - 防止内容脚本小控件退回原生 `title`；
 * - 守住 `data-olyq-tooltip + aria-label` 这一条共享语义。
 *
 * 边界：
 * - 这里只验证轻量 tooltip 属性和样式生成；
 * - 不扩散到具体内容脚本 UI 的模板拼装。
 */
import { beforeEach, describe, expect, it } from 'vitest';

import {
  buildPageTooltipAttributes,
  installPageTooltipController,
  PAGE_TOOLTIP_ATTRIBUTE,
  PAGE_TOOLTIP_STYLES,
} from './page-tooltip';

describe('page tooltip contract', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 240 });
  });

  it('会输出 data-olyq-tooltip 和 aria-label，而不是原生 title', () => {
    const attributes = buildPageTooltipAttributes('关闭');

    expect(attributes).toContain(`${PAGE_TOOLTIP_ATTRIBUTE}="关闭"`);
    expect(attributes).toContain('aria-label="关闭"');
    expect(attributes).not.toContain('title=');
  });

  it('会转义 attribute 文本，避免把内容直接注入模板', () => {
    const attributes = buildPageTooltipAttributes('5" < 6 & ok');

    expect(attributes).toContain(`${PAGE_TOOLTIP_ATTRIBUTE}="5&quot; &lt; 6 &amp; ok"`);
    expect(attributes).toContain('aria-label="5&quot; &lt; 6 &amp; ok"');
  });

  it('共享样式使用真实 DOM tooltip，不再用触发器伪元素固定上方', () => {
    expect(PAGE_TOOLTIP_STYLES).toContain('.page-tooltip');
    expect(PAGE_TOOLTIP_STYLES).toContain('z-index: 1000');
    expect(PAGE_TOOLTIP_STYLES).not.toContain('::before');
    expect(PAGE_TOOLTIP_STYLES).not.toContain('::after');
    expect(PAGE_TOOLTIP_STYLES).not.toContain('bottom: calc(100%');
  });

  it('controller 会创建单例 tooltip，并在顶部不足时落到右侧', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const trigger = document.createElement('button');
    trigger.setAttribute(PAGE_TOOLTIP_ATTRIBUTE, '隐藏网页工具');
    trigger.setAttribute('aria-label', '隐藏网页工具');
    Object.defineProperty(trigger, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 20,
        top: 4,
        right: 54,
        bottom: 38,
        width: 34,
        height: 34,
      }),
    });
    shadow.appendChild(trigger);
    const cleanup = installPageTooltipController(shadow);
    const tooltip = shadow.querySelector<HTMLElement>('.page-tooltip')!;
    Object.defineProperty(tooltip, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        right: 120,
        bottom: 30,
        width: 120,
        height: 30,
      }),
    });

    trigger.dispatchEvent(new MouseEvent('pointerover', { bubbles: true, composed: true }));

    expect(tooltip).toHaveAttribute('role', 'tooltip');
    expect(tooltip).toHaveAttribute('data-placement', 'right');
    expect(tooltip).toHaveTextContent('隐藏网页工具');
    expect(tooltip.style.display).toBe('block');
    expect(trigger).toHaveAttribute('aria-describedby', 'olyq-page-tooltip');

    cleanup();
    expect(tooltip.style.display).toBe('none');
  });

  it('统一 React root 存在时会把 tooltip 挂到 page tools top layer 内', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const root = document.createElement('div');
    root.className = 'page-tools-root';
    const trigger = document.createElement('button');
    trigger.setAttribute(PAGE_TOOLTIP_ATTRIBUTE, '截图');
    trigger.setAttribute('aria-label', '截图');
    root.appendChild(trigger);
    shadow.appendChild(root);

    const cleanup = installPageTooltipController(shadow);
    const tooltip = shadow.querySelector<HTMLElement>('.page-tooltip');

    expect(tooltip).toBeTruthy();
    expect(tooltip?.parentElement).toBe(root);

    cleanup();
  });

  it('owner 浮层关闭时可以主动收起当前 tooltip', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const trigger = document.createElement('button');
    trigger.setAttribute(PAGE_TOOLTIP_ATTRIBUTE, '隐藏网页工具');
    trigger.setAttribute('aria-label', '隐藏网页工具');
    Object.defineProperty(trigger, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 20,
        top: 60,
        right: 54,
        bottom: 94,
        width: 34,
        height: 34,
      }),
    });
    shadow.appendChild(trigger);
    const cleanup = installPageTooltipController(shadow);
    const tooltip = shadow.querySelector<HTMLElement>('.page-tooltip')!;
    Object.defineProperty(tooltip, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        right: 120,
        bottom: 30,
        width: 120,
        height: 30,
      }),
    });

    trigger.dispatchEvent(new MouseEvent('pointerover', { bubbles: true, composed: true }));
    expect(tooltip.style.display).toBe('block');

    shadow.dispatchEvent(new Event('olyq:page-tooltip-dismiss'));

    expect(tooltip.style.display).toBe('none');
    expect(trigger).not.toHaveAttribute('aria-describedby');

    cleanup();
  });
});
