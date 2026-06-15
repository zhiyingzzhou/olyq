/**
 * 说明：`ChatDialogPanel.spec` 组件模块。
 *
 * 职责：
 * - 承载 `ChatDialogPanel.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ChatDialogPanel } from './ChatDialogPanel';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { OVERLAY_MODAL_STACK_SHELL_SELECTOR } from '@/components/ui/overlay-layers';
import { useChatSettingsStore } from '@/hooks/useChatSettingsStore';
import { DEFAULT_SETTINGS } from '@/types/chat';

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === 'chatDialog.removeTranslateLanguage') return `remove-language-${String(options?.language ?? '')}`;
      return key;
    },
  }),
}));

/**
 * 在真实设置类 dialog shell 中挂载 ChatDialogPanel，复现翻译语言列表的弹层路径。
 *
 * @returns dialog 内的 ChatDialogPanel。
 */
function ChatDialogPanelDialogHarness() {
  return (
    <Dialog open>
      <DialogContent>
        <DialogTitle>chat dialog settings</DialogTitle>
        <ChatDialogPanel />
      </DialogContent>
    </Dialog>
  );
}

describe('ChatDialogPanel', () => {
  beforeEach(() => {
    useChatSettingsStore.getState().setSettings({ ...DEFAULT_SETTINGS });
  });

  it('导出设置中只保留 6 个真实导出开关', () => {
    render(<ChatDialogPanel />);

    expect(screen.getByText('message.copyPlain')).toBeInTheDocument();
    expect(screen.getByText('message.copyImage')).toBeInTheDocument();
    expect(screen.getByText('message.exportImage')).toBeInTheDocument();
    expect(screen.getByText('message.exportMarkdown')).toBeInTheDocument();
    expect(screen.getByText('message.exportMarkdownReason')).toBeInTheDocument();
    expect(screen.getByText('message.exportWord')).toBeInTheDocument();

    expect(screen.queryByText('message.exportToNotion')).not.toBeInTheDocument();
    expect(screen.queryByText('message.exportToYuque')).not.toBeInTheDocument();
    expect(screen.queryByText('message.exportToObsidian')).not.toBeInTheDocument();
    expect(screen.queryByText('message.exportToJoplin')).not.toBeInTheDocument();
    expect(screen.queryByText('message.exportToSiyuan')).not.toBeInTheDocument();
    expect(screen.queryByText('chatDialog.autoTranslateWithSpace')).not.toBeInTheDocument();
    expect(screen.getByText('chatDialog.developerMode')).toBeInTheDocument();
  });

  it('设置弹窗里的翻译语言列表会回挂当前 modal shell，并且可以点击切换语言', async () => {
    const user = userEvent.setup();
    render(<ChatDialogPanelDialogHarness />);

    const trigger = screen.getByText('简体中文, English, 日本語 +3').closest('button');
    expect(trigger).not.toBeNull();
    expect(screen.getByRole('button', { name: 'remove-language-English' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remove / })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(Number(document.body.getAttribute('data-scroll-locked') ?? '0')).toBeGreaterThanOrEqual(1);
    });
    const initialScrollLockCount = Number(document.body.getAttribute('data-scroll-locked') ?? '0');

    await user.click(trigger as HTMLButtonElement);

    const searchInput = await screen.findByPlaceholderText('chatDialog.translateLanguagesSearchPlaceholder');
    const modalShell = document.body.querySelector(OVERLAY_MODAL_STACK_SHELL_SELECTOR);

    expect(modalShell).not.toBeNull();
    expect(modalShell?.contains(searchInput)).toBe(true);
    await waitFor(() => {
      expect(Number(document.body.getAttribute('data-scroll-locked') ?? '0')).toBeGreaterThan(initialScrollLockCount);
    });

    await user.click(screen.getByRole('button', { name: 'common.clear' }));
    await user.click(screen.getByRole('checkbox', { name: 'Русский' }));

    await waitFor(() => {
      expect(trigger).toHaveTextContent('Русский');
      expect(useChatSettingsStore.getState().settings.translateLanguages).toEqual(['Русский']);
      expect(useChatSettingsStore.getState().settings.translateTargetLanguage).toBe('Русский');
    });
  });
});
