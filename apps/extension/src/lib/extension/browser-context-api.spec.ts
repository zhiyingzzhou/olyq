/**
 * 说明：`browser-context-api.spec` 浏览器上下文扩展 contract 测试。
 *
 * 职责：
 * - 验证 browser-context 的 one-shot 请求都会统一走共享 `sendExtensionMessage`；
 * - 守住正文、布局、设计信号和截图请求的消息类型与负载拼装。
 *
 * 边界：
 * - 这里只测试 contract 层，不覆盖上层 collector 的可采集性判断和错误降级。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendExtensionMessage = vi.fn();

vi.mock('./runtime-api', () => ({
  sendExtensionMessage,
}));

describe('browser-context-api', () => {
  beforeEach(() => {
    sendExtensionMessage.mockReset();
  });

  it('requestBrowserContextReadableDom 会投递正文采集消息', async () => {
    const response = { ok: true, payload: { html: '<article>Hello</article>' } };
    sendExtensionMessage.mockResolvedValue(response);

    const { requestBrowserContextReadableDom } = await import('./browser-context-api');
    const result = await requestBrowserContextReadableDom({ tabId: 11 });

    expect(sendExtensionMessage).toHaveBeenCalledWith({
      type: 'browser-context/readable-dom/get',
      payload: { tabId: 11 },
    });
    expect(result).toBe(response);
  });

  it('requestBrowserContextPageStyleLayout 会投递布局采集消息', async () => {
    const response = { ok: true, payload: { pageFingerprint: 'fingerprint', viewportHeight: 900 } };
    sendExtensionMessage.mockResolvedValue(response);

    const { requestBrowserContextPageStyleLayout } = await import('./browser-context-api');
    const result = await requestBrowserContextPageStyleLayout({ tabId: 12 });

    expect(sendExtensionMessage).toHaveBeenCalledWith({
      type: 'browser-context/page-style-layout/get',
      payload: { tabId: 12 },
    });
    expect(result).toBe(response);
  });

  it('requestBrowserContextPageStyleSignals 会投递设计信号采集消息', async () => {
    const response = { ok: true, payload: { page: { backgroundColors: [] } } };
    sendExtensionMessage.mockResolvedValue(response);

    const { requestBrowserContextPageStyleSignals } = await import('./browser-context-api');
    const result = await requestBrowserContextPageStyleSignals({ tabId: 13 });

    expect(sendExtensionMessage).toHaveBeenCalledWith({
      type: 'browser-context/page-style-signals/get',
      payload: { tabId: 13 },
    });
    expect(result).toBe(response);
  });

  it('requestBrowserContextPageStyleCaptures 会投递截图采集消息', async () => {
    const response = { ok: true, payload: { frames: [] } };
    sendExtensionMessage.mockResolvedValue(response);

    const { requestBrowserContextPageStyleCaptures } = await import('./browser-context-api');
    const result = await requestBrowserContextPageStyleCaptures({ tabId: 14, maxCaptures: 5 });

    expect(sendExtensionMessage).toHaveBeenCalledWith({
      type: 'browser-context/page-style-captures/get',
      payload: { tabId: 14, maxCaptures: 5 },
    });
    expect(result).toBe(response);
  });
});
