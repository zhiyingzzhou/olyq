/**
 * 说明：`AppearancePanel.spec` 外观设置测试模块。
 *
 * 职责：
 * - 验证深色主题色设置只在深色模式展示；
 * - 固化预设点击和自定义 Hex 提交的共享配置写入行为。
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  setThemeMock,
  subscribeThemeChangeMock,
  loadDarkThemeColorSelectionMock,
  updateDarkThemeColorSelectionMock,
  subscribeDarkThemeColorSelectionChangeMock,
  loadDisplaySettingsMock,
  updateDisplaySettingsMock,
} = vi.hoisted(() => ({
  setThemeMock: vi.fn(),
  subscribeThemeChangeMock: vi.fn(),
  loadDarkThemeColorSelectionMock: vi.fn(),
  updateDarkThemeColorSelectionMock: vi.fn(),
  subscribeDarkThemeColorSelectionChangeMock: vi.fn(),
  loadDisplaySettingsMock: vi.fn(),
  updateDisplaySettingsMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'zh-CN' } }),
}));

vi.mock('@/i18n', () => ({
  setLanguage: vi.fn(),
}));

vi.mock('@/lib/theme', () => ({
  setTheme: setThemeMock,
  subscribeThemeChange: subscribeThemeChangeMock,
}));

vi.mock('@/lib/display-settings', () => ({
  loadDisplaySettings: loadDisplaySettingsMock,
  updateDisplaySettings: updateDisplaySettingsMock,
}));

vi.mock('@/lib/dark-theme-color-settings', () => ({
  loadDarkThemeColorSelection: loadDarkThemeColorSelectionMock,
  updateDarkThemeColorSelection: updateDarkThemeColorSelectionMock,
  subscribeDarkThemeColorSelectionChange: subscribeDarkThemeColorSelectionChangeMock,
}));

import { AppearancePanel } from './AppearancePanel';

describe('AppearancePanel', () => {
  beforeEach(() => {
    cleanup();
    document.documentElement.className = '';
    Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
      configurable: true,
      value: () => false,
    });
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: () => undefined,
    });
    Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
      configurable: true,
      value: () => undefined,
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: () => undefined,
    });
    setThemeMock.mockReset();
    subscribeThemeChangeMock.mockReset();
    subscribeThemeChangeMock.mockReturnValue(() => undefined);
    loadDarkThemeColorSelectionMock.mockReset();
    loadDarkThemeColorSelectionMock.mockReturnValue({
      kind: 'preset',
      presetId: 'olyq-brand',
      sourceHex: '#00D9A3',
    });
    updateDarkThemeColorSelectionMock.mockReset();
    updateDarkThemeColorSelectionMock.mockImplementation((next) => next);
    subscribeDarkThemeColorSelectionChangeMock.mockReset();
    subscribeDarkThemeColorSelectionChangeMock.mockReturnValue(() => undefined);
    loadDisplaySettingsMock.mockReset();
    loadDisplaySettingsMock.mockReturnValue({
      pinTopicsToTop: false,
      extensionSettingsOpenMode: 'dialog',
    });
    updateDisplaySettingsMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('浅色模式下不显示深色主题颜色设置', () => {
    render(<AppearancePanel />);

    expect(screen.queryByText('appearance.themeColor')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('appearance.themeColorHexLabel')).not.toBeInTheDocument();
    expect(screen.queryByText('appearance.glassMorphism')).not.toBeInTheDocument();
  });

  it('深色模式下显示预设与 Hex 输入，并可点击黄色预设更新共享配置', async () => {
    const user = userEvent.setup();
    document.documentElement.classList.add('dark');

    render(<AppearancePanel />);

    expect(screen.getByText('appearance.themeColor')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'appearance.themeColorPresets.amber' }));

    expect(updateDarkThemeColorSelectionMock).toHaveBeenCalledWith({
      kind: 'preset',
      presetId: 'amber',
      sourceHex: '#FCD34D',
    });
  });

  it('主题颜色行保护文案可读宽度，空间不足时右侧控件自然换行', () => {
    document.documentElement.classList.add('dark');

    render(<AppearancePanel />);

    const presetGroup = screen.getByRole('group', { name: 'appearance.themeColorPresetList' });
    const presetButtons = within(presetGroup).getAllByRole('button');
    const hexInput = screen.getByLabelText('appearance.themeColorHexLabel');
    const title = screen.getByText('appearance.themeColor');
    const copyColumn = title.closest('div')?.parentElement;

    expect(copyColumn).toHaveClass('max-w-56');
    expect(copyColumn).toHaveClass('shrink-0');
    expect(title).toHaveClass('whitespace-nowrap');
    expect(presetGroup).toHaveClass('flex-wrap');
    expect(presetGroup.className).not.toContain('overflow-x-auto');
    expect(presetGroup.className).not.toContain('overscroll-x-contain');
    expect(presetGroup.className).not.toContain('flex-nowrap');
    expect(presetButtons).toHaveLength(12);
    for (const button of presetButtons) {
      expect(button).toHaveClass('h-6');
      expect(button).toHaveClass('w-6');
      expect(button).toHaveClass('shrink-0');
    }
    expect(hexInput).toHaveClass('w-24');
    expect(hexInput).toHaveClass('shrink-0');
  });

  it('Hex 输入只在合法 #RRGGBB 时提交自定义主题色，非法时回到当前值', async () => {
    const user = userEvent.setup();
    document.documentElement.classList.add('dark');
    updateDarkThemeColorSelectionMock.mockImplementation((next) => ({
      kind: 'custom',
      presetId: null,
      sourceHex: next.sourceHex,
    }));

    render(<AppearancePanel />);

    const input = screen.getByLabelText('appearance.themeColorHexLabel');
    await user.clear(input);
    await user.type(input, '#14b8a6');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(updateDarkThemeColorSelectionMock).toHaveBeenCalledWith({
      kind: 'custom',
      presetId: null,
      sourceHex: '#14B8A6',
    });

    await user.clear(input);
    await user.type(input, 'bad');
    fireEvent.blur(input);

    await waitFor(() => {
      expect(input).toHaveValue('#14B8A6');
    });
  });

  it('切换设置打开方式时写入 display-settings 共享配置', async () => {
    const user = userEvent.setup();

    render(<AppearancePanel />);

    await user.click(screen.getByRole('combobox', { name: 'appearance.extensionSettingsOpenMode' }));
    await user.click(await screen.findByRole('option', { name: 'appearance.extensionSettingsOpenModeWorkspace' }));

    expect(updateDisplaySettingsMock).toHaveBeenCalledWith({
      extensionSettingsOpenMode: 'workspace',
    });
  });

  it('设置打开方式和语言选择器使用一致宽度', () => {
    render(<AppearancePanel />);

    expect(screen.getByRole('combobox', { name: 'appearance.extensionSettingsOpenMode' })).toHaveClass('w-36');
    expect(screen.getByRole('combobox', { name: 'appearance.language' })).toHaveClass('w-36');
  });
});
