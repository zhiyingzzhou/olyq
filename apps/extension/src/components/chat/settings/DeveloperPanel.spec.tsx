/**
 * 说明：`DeveloperPanel.spec` 组件模块。
 *
 * 职责：
 * - 承载 `DeveloperPanel.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_SETTINGS } from '@/types/chat';
import { useChatSettingsStore } from '@/hooks/useChatSettingsStore';
import { useDeveloperToolsStore } from '@/hooks/useDeveloperToolsStore';
import { DeveloperPanel } from './DeveloperPanel';

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('./useContentScriptStatus', () => ({
  useContentScriptStatus: () => ({
    status: {
      enabled: true,
      registered: true,
      registrationMethod: 'scripting',
      declaredHostMatches: ['https://example.com/*'],
      bundledJs: ['assets/content-script.js'],
    },
    busy: false,
    refresh: vi.fn(),
  }),
}));

vi.mock('../WelcomeDemo', () => ({
  WelcomeDemo: () => <div data-testid="developer-render-demo">developer-render-demo</div>,
}));

describe('DeveloperPanel', () => {
  beforeEach(() => {
    useChatSettingsStore.getState().setSettings({ ...DEFAULT_SETTINGS, enableDeveloperMode: true });
    useDeveloperToolsStore.setState({
      events: [
        {
          id: 'evt-1',
          timestamp: Date.now() - 1000,
          requestId: 'req-1',
          source: 'chat-topic',
          kind: 'websearch/execute',
          payload: { query: 'older-event' },
        },
        {
          id: 'evt-2',
          timestamp: Date.now(),
          requestId: 'req-2',
          source: 'chat-compare',
          kind: 'ai-sdk/raw',
          payload: '{"query":"latest-event","nested":{"value":"formatted"}}',
        },
      ],
    });
  });

  it('展示固定高度的调试事件列表和独立详情区，并支持切换当前选中事件', async () => {
    const user = userEvent.setup();

    render(<DeveloperPanel />);

    expect(screen.getByText('developerPanel.experimental.title')).toBeInTheDocument();
    expect(screen.getByText('developerPanel.debugEvents.title')).toBeInTheDocument();
    expect(screen.getByText('developerPanel.snapshot.title')).toBeInTheDocument();
    expect(screen.getByText('developerPanel.rendering.title')).toBeInTheDocument();
    expect(screen.getByTestId('developer-render-demo')).toBeInTheDocument();
    expect(screen.getByText('websearch/execute')).toBeInTheDocument();
    expect(screen.getAllByText('ai-sdk/raw').length).toBeGreaterThan(0);

    const listScroll = screen.getByTestId('developer-debug-events-list-scroll');
    const listContent = screen.getByTestId('developer-debug-events-list-content');
    const detail = screen.getByTestId('developer-debug-event-detail');
    const payloadScroll = screen.getByTestId('developer-debug-event-payload-scroll');
    const payloadSurface = screen.getByTestId('developer-debug-event-payload-surface');
    const payloadText = screen.getByTestId('developer-debug-event-payload-text');

    expect(listScroll.className).toContain('h-[22rem]');
    expect(listContent.className).toContain('divide-y');
    expect(detail.className).toContain('h-[22rem]');
    expect(detail.className).toContain('flex-col');
    expect(payloadScroll.className).toContain('flex-1');
    expect(payloadScroll).toHaveAttribute('data-scrollbars', 'vertical');
    expect(payloadSurface.className).toContain('w-full');
    expect(payloadSurface.className).not.toContain('min-h-full');
    expect(payloadText.className).toContain('min-w-full');
    expect(payloadText.className).toContain('bg-background/70');
    expect(payloadText.className).toContain('whitespace-pre-wrap');
    expect(payloadText.className).not.toContain('min-h-full');

    expect(detail).toHaveTextContent('latest-event');
    expect(detail).not.toHaveTextContent('older-event');

    await user.click(screen.getByRole('button', { name: /websearch\/execute/i }));

    expect(detail).toHaveTextContent('older-event');
  });

  it('支持在详情区切换自动换行和 JSON 格式化', async () => {
    const user = userEvent.setup();

    render(<DeveloperPanel />);

    const prettifyToggle = screen.getByTestId('developer-debug-event-prettify-toggle');
    const wrapToggle = screen.getByTestId('developer-debug-event-wrap-toggle');
    const payloadScroll = screen.getByTestId('developer-debug-event-payload-scroll');
    const payloadText = screen.getByTestId('developer-debug-event-payload-text');

    expect(payloadText.textContent).toContain('"nested": {');
    expect(prettifyToggle).toHaveAttribute('aria-pressed', 'true');
    expect(wrapToggle).toHaveAttribute('aria-pressed', 'true');

    await user.click(prettifyToggle);

    expect(prettifyToggle).toHaveAttribute('aria-pressed', 'false');
    expect(payloadText.textContent).toBe('{"query":"latest-event","nested":{"value":"formatted"}}');

    await user.click(wrapToggle);

    expect(wrapToggle).toHaveAttribute('aria-pressed', 'false');
    expect(payloadScroll).toHaveAttribute('data-scrollbars', 'both');
    expect(payloadText.className).toContain('whitespace-pre');
  });

  it('支持放大查看当前事件 JSON，并保持同一套阅读控制状态', async () => {
    const user = userEvent.setup();

    render(<DeveloperPanel />);

    await user.click(screen.getByTestId('developer-debug-event-expand-button'));

    const dialog = screen.getByTestId('developer-debug-event-dialog');
    const dialogPayloadSurface = screen.getByTestId('developer-debug-event-dialog-payload-surface');
    const dialogPayloadText = screen.getByTestId('developer-debug-event-dialog-payload-text');
    const dialogWrapToggle = screen.getByTestId('developer-debug-event-dialog-wrap-toggle');
    const dialogCopyButton = screen.getByTestId('developer-debug-event-dialog-copy-button');

    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent('developerPanel.debugEvents.payloadDialogTitle');
    expect(dialogPayloadSurface.className).toContain('w-full');
    expect(dialogPayloadSurface.className).not.toContain('min-h-full');
    expect(dialogPayloadText.className).toContain('bg-background/70');
    expect(dialogPayloadText.textContent).toContain('"nested": {');
    expect(dialogPayloadText.className).not.toContain('min-h-full');
    expect(dialogWrapToggle).toHaveAttribute('aria-pressed', 'true');
    expect(dialogCopyButton).toBeInTheDocument();
  });

  it('支持清空调试事件并回到空态', async () => {
    const user = userEvent.setup();

    render(<DeveloperPanel />);

    await user.click(screen.getByRole('button', { name: 'developerPanel.debugEvents.clear' }));

    expect(screen.getByText('developerPanel.debugEvents.empty')).toBeInTheDocument();
  });
});
