/**
 * 说明：`ui-actions.spec` 扩展 UI 语义动作测试模块。
 *
 * 职责：
 * - 固定 sidepanel 新标签页入口只打开主工作区页面；
 * - 防止 UI 动作重新引入宿主 query 分支。
 *
 * 边界：
 * - 这里只验证 UI 语义动作传给 runtime-api 的扩展页路径；
 * - 不覆盖真实浏览器 tabs.create 行为。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtimeApiMocks = vi.hoisted(() => ({
  canOpenExtensionPageInTab: vi.fn(),
  openExtensionPageInTab: vi.fn(),
}));

vi.mock('./runtime-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./runtime-api')>();
  return {
    ...actual,
    canOpenExtensionPageInTab: runtimeApiMocks.canOpenExtensionPageInTab,
    openExtensionPageInTab: runtimeApiMocks.openExtensionPageInTab,
  };
});

import {
  canOpenSidepanelPageInNewTab,
  openSidepanelPageInNewTab,
} from './ui-actions';

describe('ui-actions sidepanel workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('检测新标签页入口时使用原始 sidepanel 页面路径', () => {
    runtimeApiMocks.canOpenExtensionPageInTab.mockReturnValue(true);

    expect(canOpenSidepanelPageInNewTab()).toBe(true);

    expect(runtimeApiMocks.canOpenExtensionPageInTab).toHaveBeenCalledWith(
      'src/extension/sidepanel/index.html',
    );
  });

  it('打开新标签页时不携带宿主标记', async () => {
    const tab = { id: 42 } as chrome.tabs.Tab;
    runtimeApiMocks.openExtensionPageInTab.mockResolvedValue(tab);

    await expect(openSidepanelPageInNewTab()).resolves.toBe(tab);

    expect(runtimeApiMocks.openExtensionPageInTab).toHaveBeenCalledWith(
      'src/extension/sidepanel/index.html',
    );
  });
});
