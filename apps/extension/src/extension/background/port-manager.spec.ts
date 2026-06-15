/**
 * 说明：`port-manager` 后台 Port 分类测试。
 *
 * 职责：
 * - 区分 sidepanel 主工作区 Port 与 content script 内联流式 Port；
 * - 证明共享 `olyq:ui` 只承担普通 UI 广播与缓冲；
 * - 防止页面工具业务重新回到 tab-scoped external bridge 双轨。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isSidePanelUiPort,
  postToAllUi,
  registerUiPort,
  sidePanelUiPorts,
  uiPorts,
  unregisterUiPort,
} from './port-manager';

/** 构造最小可用 Port mock。 */
function makePort(url: string): chrome.runtime.Port {
  return {
    name: 'olyq:ui',
    sender: { url } as chrome.runtime.MessageSender,
    postMessage: vi.fn(),
  } as unknown as chrome.runtime.Port;
}

describe('port-manager sidepanel port contract', () => {
  afterEach(() => {
    for (const port of [...uiPorts]) unregisterUiPort(port);
    vi.clearAllMocks();
  });

  it('只把扩展 sidepanel 页面识别为主面板 Port', () => {
    const sidepanelPort = makePort('chrome-extension://id/src/extension/sidepanel/index.html#/chat');
    const inlinePort = makePort('https://example.com/repo');

    expect(isSidePanelUiPort(sidepanelPort)).toBe(true);
    expect(isSidePanelUiPort(inlinePort)).toBe(false);

    registerUiPort(inlinePort);
    expect(uiPorts.has(inlinePort)).toBe(true);
    expect(sidePanelUiPorts.has(inlinePort)).toBe(false);
  });

  it('普通 UI 事件只补发给 sidepanel Port，内联 Port 不会消费主工作区 pending 事件', () => {
    const inlinePort = makePort('https://example.com/page');
    const sidepanelPort = makePort('chrome-extension://id/src/extension/sidepanel/index.html');
    registerUiPort(inlinePort);

    postToAllUi({
      type: 'ui/page-tool-error',
      payload: { error: { key: 'errors.pageToolsDisabled' } },
    });
    expect(inlinePort.postMessage).not.toHaveBeenCalled();

    registerUiPort(sidepanelPort);

    expect(sidepanelPort.postMessage).toHaveBeenCalledWith({
      type: 'ui/page-tool-error',
      payload: { error: { key: 'errors.pageToolsDisabled' } },
    });
  });

  it('共享 UI 广播不再承载按 tab 投递页面工具结果', () => {
    const sidepanelPort = makePort('chrome-extension://id/src/extension/sidepanel/index.html');
    registerUiPort(sidepanelPort);

    postToAllUi({
      type: 'ui/selection',
      payload: {
        action: 'ask',
        text: 'hello',
      },
    });

    expect(sidepanelPort.postMessage).toHaveBeenCalledWith({
      type: 'ui/selection',
      payload: {
        action: 'ask',
        text: 'hello',
      },
    });
  });
});
