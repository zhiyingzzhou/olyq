/**
 * 说明：`offscreen/main.spec` 离屏入口模块。
 *
 * 职责：
 * - 守住独立 offscreen HTML 入口只启动离屏运行时；
 * - 防止删除 popup 后又把 Offscreen 退回用户可见扩展页启动链路。
 *
 * 边界：
 * - 本测试不覆盖具体 offscreen 能力，只覆盖入口分层。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  installExtensionPageRuntimeGuardMock,
  recoverExtensionPageFromScriptFetchErrorMock,
  startOffscreenRuntimeMock,
} = vi.hoisted(() => ({
  installExtensionPageRuntimeGuardMock: vi.fn(),
  recoverExtensionPageFromScriptFetchErrorMock: vi.fn(() => false),
  startOffscreenRuntimeMock: vi.fn(),
}));

vi.mock('@/lib/dev/extension-context-guard', () => ({
  installExtensionPageRuntimeGuard: installExtensionPageRuntimeGuardMock,
  recoverExtensionPageFromScriptFetchError: recoverExtensionPageFromScriptFetchErrorMock,
}));

vi.mock('./runtime', () => ({
  startOffscreenRuntime: startOffscreenRuntimeMock,
}));

describe('offscreen main entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('只启动离屏运行时，不执行扩展页 UI bootstrap', async () => {
    await import('./main');

    await vi.waitFor(() => {
      expect(startOffscreenRuntimeMock).toHaveBeenCalledTimes(1);
    });
    expect(installExtensionPageRuntimeGuardMock).toHaveBeenCalledTimes(1);
  });
});
