/**
 * 说明：`useExternalUiPortBridge.spec` 页面模块。
 *
 * 职责：
 * - 覆盖外部 UI bridge 的元素选择器启动链路；
 * - 守住侧栏按钮必须向 SW 发出 `element/picker/start`，避免本地 handler 再次遮蔽同名 runtime action。
 *
 * 边界：
 * - 本文件只验证 sidepanel/UI 层的动作编排；
 * - SW 插件、content script 注入和页面 Shadow DOM 元素选择器由各自模块测试覆盖。
 */
import { act, renderHook } from '@testing-library/react';
import type { TFunction } from 'i18next';
import type { RefObject } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatAreaHandle } from '@/components/chat/ChatArea';
import { useExternalUiPortBridge } from './useExternalUiPortBridge';

const {
  dataUrlToBlobMock,
  ensureSidePanelPageToolPortReadyMock,
  ensureUiPortReadyMock,
  initBrowserContextListenerMock,
  onSidePanelPageToolCommandMock,
  onUiPortMessageMock,
  postSidePanelPageToolMessageMock,
  postUiPortMessageMock,
  putImageAttachmentMock,
  requestStartElementPickerMock,
  requestStartScreenshotEditorMock,
  resolvePreferredBrowserContextTabMock,
  setBrowserContextElementSnapshotMock,
  toastMock,
} = vi.hoisted(() => ({
  dataUrlToBlobMock: vi.fn(),
  ensureSidePanelPageToolPortReadyMock: vi.fn(async (): Promise<unknown> => null),
  ensureUiPortReadyMock: vi.fn(async (): Promise<unknown> => null),
  initBrowserContextListenerMock: vi.fn(),
  onSidePanelPageToolCommandMock: vi.fn((_listener: (msg: { type: string; requestId: string; generation: number; command: unknown }) => void) => () => undefined),
  onUiPortMessageMock: vi.fn((_listener: (msg: { type: string; payload?: unknown; requestId?: string; event?: unknown }) => void) => () => undefined),
  postSidePanelPageToolMessageMock: vi.fn(),
  postUiPortMessageMock: vi.fn(),
  putImageAttachmentMock: vi.fn(),
  requestStartElementPickerMock: vi.fn(),
  requestStartScreenshotEditorMock: vi.fn(),
  resolvePreferredBrowserContextTabMock: vi.fn(),
  setBrowserContextElementSnapshotMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock('@/extension/bridge/ui-port', () => ({
  ensureUiPortReady: ensureUiPortReadyMock,
  onUiPortMessage: onUiPortMessageMock,
  postUiPortMessage: postUiPortMessageMock,
}));

vi.mock('@/extension/bridge/sidepanel-page-tool-port', () => ({
  ensureSidePanelPageToolPortReady: ensureSidePanelPageToolPortReadyMock,
  onSidePanelPageToolCommand: onSidePanelPageToolCommandMock,
  postSidePanelPageToolMessage: postSidePanelPageToolMessageMock,
}));

vi.mock('@/lib/attachments', () => ({
  blobToDataUrl: vi.fn(),
  dataUrlToBlob: dataUrlToBlobMock,
  putImageAttachment: putImageAttachmentMock,
}));

vi.mock('@/lib/ai/image-download', () => ({
  downloadUrlToFile: vi.fn(),
  getHostMatchPatternsForUrls: vi.fn(() => []),
}));

vi.mock('@/hooks/useToast', () => ({
  toast: toastMock,
}));

vi.mock('@/lib/browser-context', () => ({
  initBrowserContextListener: initBrowserContextListenerMock,
  resolvePreferredBrowserContextTab: resolvePreferredBrowserContextTabMock,
  setBrowserContextElementSnapshot: setBrowserContextElementSnapshotMock,
  setBrowserContextSelectionSnapshot: vi.fn(),
}));

vi.mock('@/lib/extension/ui-actions', () => ({
  startElementPicker: requestStartElementPickerMock,
  startScreenshotEditor: requestStartScreenshotEditorMock,
}));

const t = ((key: string) => key) as TFunction;

/**
 * 渲染外部 UI bridge hook。
 *
 * @param pageToolsEnabled - 网页工具总开关。
 * @returns Testing Library renderHook 结果。
 */
function renderBridge(pageToolsEnabled = true) {
  const chatHandle = {
      send: vi.fn(),
      sendWithAttachments: vi.fn(),
      insertDraft: vi.fn(),
      acceptExternalDraft: vi.fn(async () => undefined),
      completeExternalDraft: vi.fn(),
      stop: vi.fn(),
    sendCompare: vi.fn(),
  } satisfies ChatAreaHandle;
  const chatRef = { current: chatHandle } as RefObject<ChatAreaHandle | null>;
  const focusChat = vi.fn();
  const hook = renderHook(() => useExternalUiPortBridge({
    activeLoadedTopicId: 'topic-1',
    chatRef,
    ensureActiveTopicForExternalSend: vi.fn(() => 'topic-1'),
    focusChat,
    pageToolsEnabled,
    t,
  }));
  return { ...hook, chatHandle, focusChat };
}

/**
 * 安装视觉区域裁剪所需的 Image/Canvas mock。
 */
function installVisualCropMocks() {
  const drawImage = vi.fn();
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: vi.fn(() => ({ drawImage })),
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
    configurable: true,
    value: vi.fn(() => 'data:image/png;base64,AAAA'),
  });
  class MockImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 1200;
    naturalHeight = 900;
    width = 1200;
    height = 900;
    /**
     * 模拟浏览器 Image 解码完成：设置 data URL 后在 microtask 触发 onload。
     *
     * @param _value - 测试里传入的图片 data URL。
     */
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal('Image', MockImage);
  return { drawImage };
}

/**
 * 等待 bridge effect 完成 UI Port 连接并注册消息监听。
 */
async function flushBridgeEffect() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** 通过专用 Sidepanel Port 命令协议向 bridge 投递页面工具事件。 */
function dispatchExternalEvent(
  listener: ((msg: { type: string; requestId: string; generation: number; command: unknown }) => void) | undefined,
  event: { type: string; payload?: unknown },
  requestId = 'external-req-1',
) {
  listener?.({
    type: 'sidepanel/page-tool-command',
    requestId,
    generation: 1,
    command: event,
  });
}

describe('useExternalUiPortBridge: element picker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installVisualCropMocks();
    ensureUiPortReadyMock.mockResolvedValue(null);
    ensureSidePanelPageToolPortReadyMock.mockResolvedValue({ name: 'sidepanel-port' });
    resolvePreferredBrowserContextTabMock.mockResolvedValue({
      id: 42,
      title: 'Example',
      url: 'https://example.com/article',
    });
    requestStartElementPickerMock.mockResolvedValue({ ok: true });
    requestStartScreenshotEditorMock.mockResolvedValue({ ok: true });
    dataUrlToBlobMock.mockReturnValue({ blob: new Blob(['img'], { type: 'image/png' }), mime: 'image/png' });
    putImageAttachmentMock.mockResolvedValue({ id: 'img-1', name: 'picked.png', mime: 'image/png', size: 3 });
  });

  it('网页工具开启时直接通过 SW 启动同一个 tabId 的元素选择器', async () => {
    const { result } = renderBridge(true);

    await act(async () => {
      await result.current.startElementPicker();
    });

    expect(resolvePreferredBrowserContextTabMock).toHaveBeenCalledTimes(1);
    expect(requestStartElementPickerMock).toHaveBeenCalledWith({ tabId: 42 });
    expect(toastMock).not.toHaveBeenCalled();
  });

  it('SW 拒绝启动元素选择器时展示结构化错误', async () => {
    requestStartElementPickerMock.mockResolvedValue({
      ok: false,
      error: { key: 'errors.contentScriptUnreachable' },
    });
    const { result } = renderBridge(true);

    await act(async () => {
      await result.current.startElementPicker();
    });

    expect(resolvePreferredBrowserContextTabMock).toHaveBeenCalledTimes(1);
    expect(requestStartElementPickerMock).toHaveBeenCalledWith({ tabId: 42 });
    expect(toastMock).toHaveBeenCalledWith({
      title: 'common.error',
      description: 'errors.contentScriptUnreachable',
      variant: 'destructive',
    });
  });

  it('网页工具关闭时，只提示用户开启，不请求权限也不发起 SW 动作', async () => {
    const { result } = renderBridge(false);

    await act(async () => {
      await result.current.startElementPicker();
    });

    expect(resolvePreferredBrowserContextTabMock).not.toHaveBeenCalled();
    expect(requestStartElementPickerMock).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith({
      title: 'common.tip',
      description: 'sitePermissionsPanel.pageTools.disabledHint',
    });
  });

  it('网页工具开启时通过 SW 启动同一个 tabId 的截图编辑器', async () => {
    const { result } = renderBridge(true);

    await act(async () => {
      await result.current.startScreenshotEditor();
    });

    expect(resolvePreferredBrowserContextTabMock).toHaveBeenCalledTimes(1);
    expect(requestStartScreenshotEditorMock).toHaveBeenCalledWith({ tabId: 42 });
    expect(toastMock).not.toHaveBeenCalled();
  });

  it('UI Port 连接后只承载普通消息，页面工具命令走专用 Sidepanel Port', async () => {
    ensureUiPortReadyMock.mockResolvedValue({ name: 'ui-port' });
    renderBridge(true);
    await flushBridgeEffect();

    expect(onUiPortMessageMock).toHaveBeenCalledTimes(1);
    expect(onSidePanelPageToolCommandMock).toHaveBeenCalledTimes(1);
    expect(postUiPortMessageMock).toHaveBeenCalledWith({ type: 'offscreen/ensure' });
  });

  it('收到截图事件后把图片作为输入附件草稿插入，不自动发送', async () => {
    ensureUiPortReadyMock.mockResolvedValue({ name: 'ui-port' });
    const { chatHandle, focusChat } = renderBridge(true);
    await flushBridgeEffect();
    const listener = onSidePanelPageToolCommandMock.mock.calls[0]?.[0] as ((msg: { type: string; requestId: string; generation: number; command: unknown }) => void) | undefined;

    await act(async () => {
      dispatchExternalEvent(listener, {
        type: 'ui/screenshot',
        payload: {
          action: 'ocr',
          image: { dataUrl: 'data:image/png;base64,CCCC', name: 'shot.png', mime: 'image/png' },
          source: { url: 'https://example.com/page', title: 'Example Page' },
        },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(putImageAttachmentMock).not.toHaveBeenCalled();
    expect(focusChat).toHaveBeenCalled();
    expect(chatHandle.acceptExternalDraft).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'screenshot',
      action: 'ocr',
      prompt: 'screenshotEditor.ocrPrompt',
      source: { url: 'https://example.com/page', title: 'Example Page' },
      image: expect.objectContaining({
        dataUrl: 'data:image/png;base64,CCCC',
        name: 'shot.png',
        mime: 'image/png',
      }),
    }));
    expect(chatHandle.send).not.toHaveBeenCalled();
    expect(chatHandle.sendWithAttachments).not.toHaveBeenCalled();
    expect(postSidePanelPageToolMessageMock).toHaveBeenCalledWith({
      type: 'sidepanel/page-tool-command-ack',
      requestId: 'external-req-1',
      generation: 1,
      payload: { ok: true },
    });
  });

  it('截图事件会等 ChatArea ref ready 并真实插入草稿后才 ack', async () => {
    ensureUiPortReadyMock.mockResolvedValue({ name: 'ui-port' });
    const chatHandle = {
      send: vi.fn(),
      sendWithAttachments: vi.fn(),
      insertDraft: vi.fn(),
      acceptExternalDraft: vi.fn(async () => undefined),
      completeExternalDraft: vi.fn(),
      stop: vi.fn(),
      sendCompare: vi.fn(),
    } satisfies ChatAreaHandle;
    const chatRef = { current: null } as { current: ChatAreaHandle | null };
    renderHook(() => useExternalUiPortBridge({
      activeLoadedTopicId: 'topic-1',
      chatRef,
      ensureActiveTopicForExternalSend: vi.fn(() => 'topic-1'),
      focusChat: vi.fn(),
      pageToolsEnabled: true,
      t,
    }));
    await flushBridgeEffect();
    const listener = onSidePanelPageToolCommandMock.mock.calls[0]?.[0] as ((msg: { type: string; requestId: string; generation: number; command: unknown }) => void) | undefined;

    await act(async () => {
      dispatchExternalEvent(listener, {
        type: 'ui/screenshot',
        payload: {
          action: 'chat',
          image: { dataUrl: 'data:image/png;base64,CCCC', name: 'shot.png', mime: 'image/png' },
        },
      }, 'external-wait-chat-ref');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(chatHandle.acceptExternalDraft).not.toHaveBeenCalled();
    expect(postSidePanelPageToolMessageMock.mock.calls.some((call) => (
      call[0]?.type === 'sidepanel/page-tool-command-ack'
      && call[0]?.requestId === 'external-wait-chat-ref'
    ))).toBe(false);

    chatRef.current = chatHandle;
    await act(async () => {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      await Promise.resolve();
    });

    expect(chatHandle.acceptExternalDraft).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'screenshot',
      action: 'chat',
      image: expect.objectContaining({ dataUrl: 'data:image/png;base64,CCCC' }),
    }));
    expect(postSidePanelPageToolMessageMock).toHaveBeenCalledWith({
      type: 'sidepanel/page-tool-command-ack',
      requestId: 'external-wait-chat-ref',
      generation: 1,
      payload: { ok: true },
    });
  });

  it('收到页面工具启动失败事件时展示本地化错误 toast', async () => {
    ensureUiPortReadyMock.mockResolvedValue({ name: 'ui-port' });
    renderBridge(true);
    await flushBridgeEffect();
    const listener = onSidePanelPageToolCommandMock.mock.calls[0]?.[0] as ((msg: { type: string; requestId: string; generation: number; command: unknown }) => void) | undefined;

    await act(async () => {
      dispatchExternalEvent(listener, {
        type: 'ui/page-tool-error',
        payload: { error: { key: 'errors.screenshotEditorContentScriptUnavailable' } },
      }, 'external-error-1');
      await Promise.resolve();
    });

    expect(toastMock).toHaveBeenCalledWith({
      title: 'common.error',
      description: 'errors.screenshotEditorContentScriptUnavailable',
      variant: 'destructive',
    });
    expect(postSidePanelPageToolMessageMock).toHaveBeenCalledWith({
      type: 'sidepanel/page-tool-command-ack',
      requestId: 'external-error-1',
      generation: 1,
      payload: { ok: true },
    });
  });

  it('收到结构化元素后只插入输入草稿，不自动发送消息', async () => {
    ensureUiPortReadyMock.mockResolvedValue({ name: 'ui-port' });
    const { chatHandle, focusChat } = renderBridge(true);
    await flushBridgeEffect();
    const listener = onSidePanelPageToolCommandMock.mock.calls[0]?.[0] as ((msg: { type: string; requestId: string; generation: number; command: unknown }) => void) | undefined;
    expect(listener).toBeTruthy();

    await act(async () => {
      dispatchExternalEvent(listener, {
        type: 'ui/element',
        payload: {
          element: {
            kind: 'table',
            tagName: 'TABLE',
            selector: 'table#plan',
            text: '| 项目 | 状态 |\n| --- | --- |\n| 选择元素 | 已重定位 |',
            summary: '表格 · table · 2 行 × 2 列',
            table: {
              markdown: '| 项目 | 状态 |\n| --- | --- |\n| 选择元素 | 已重定位 |',
              rows: 2,
              columns: 2,
            },
          },
          source: { url: 'https://example.com/doc', title: 'Example Doc' },
        },
      }, 'external-element-table');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(setBrowserContextElementSnapshotMock).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'table',
      text: expect.stringContaining('选择元素'),
      url: 'https://example.com/doc',
      title: 'Example Doc',
    }));
    expect(focusChat).toHaveBeenCalled();
    expect(chatHandle.acceptExternalDraft).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'element',
      element: expect.objectContaining({
        kind: 'table',
        tagName: 'TABLE',
        text: expect.stringContaining('| 项目 | 状态 |'),
      }),
      source: { url: 'https://example.com/doc', title: 'Example Doc' },
    }));
    const tableDraft = (chatHandle.acceptExternalDraft as unknown as { mock: { calls: Array<[unknown]> } }).mock.calls[0]?.[0] as { element?: Record<string, unknown> } | undefined;
    expect(tableDraft?.element).not.toHaveProperty('summary');
    expect(chatHandle.send).not.toHaveBeenCalled();
    expect(chatHandle.sendWithAttachments).not.toHaveBeenCalled();
    expect(postSidePanelPageToolMessageMock).toHaveBeenCalledWith({
      type: 'sidepanel/page-tool-command-ack',
      requestId: 'external-element-table',
      generation: 1,
      payload: { ok: true },
    });
  });

  it('图片元素先按现有附件链路落库，再作为输入草稿附件等待发送', async () => {
    ensureUiPortReadyMock.mockResolvedValue({ name: 'ui-port' });
    const { chatHandle } = renderBridge(true);
    await flushBridgeEffect();
    const listener = onSidePanelPageToolCommandMock.mock.calls[0]?.[0] as ((msg: { type: string; requestId: string; generation: number; command: unknown }) => void) | undefined;

    await act(async () => {
      dispatchExternalEvent(listener, {
        type: 'ui/element',
        payload: {
          element: {
            kind: 'image',
            tagName: 'IMG',
            text: '产品截图',
            summary: '图片 · img · 1 张图',
            images: [{ dataUrl: 'data:image/png;base64,AAAA', name: 'picked.png', mime: 'image/png', alt: '产品截图' }],
          },
          source: { url: 'https://example.com/image', title: 'Image Page' },
        },
      }, 'external-element-image');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(dataUrlToBlobMock).not.toHaveBeenCalled();
    expect(putImageAttachmentMock).toHaveBeenCalledWith(expect.objectContaining({
      name: 'picked.png',
      mime: 'image/png',
    }));
    expect(chatHandle.acceptExternalDraft).toHaveBeenCalledWith(expect.objectContaining({
      element: expect.objectContaining({
        kind: 'image',
      }),
      attachments: [{
        type: 'image',
        id: 'img-1',
        name: 'picked.png',
        mime: 'image/png',
        size: 3,
      }],
    }));
    const imageDraft = (chatHandle.acceptExternalDraft as unknown as { mock: { calls: Array<[unknown]> } }).mock.calls[0]?.[0] as { element?: { images?: Array<Record<string, unknown>> } } | undefined;
    expect(imageDraft?.element?.images?.[0]).not.toHaveProperty('dataUrl');
    expect(chatHandle.send).not.toHaveBeenCalled();
    expect(chatHandle.sendWithAttachments).not.toHaveBeenCalled();
    expect(postSidePanelPageToolMessageMock).toHaveBeenCalledWith({
      type: 'sidepanel/page-tool-command-ack',
      requestId: 'external-element-image',
      generation: 1,
      payload: { ok: true },
    });
  });

  it('视觉区域会先裁剪截图成 PNG 附件，再插入输入草稿', async () => {
    ensureUiPortReadyMock.mockResolvedValue({ name: 'ui-port' });
    const { chatHandle } = renderBridge(true);
    await flushBridgeEffect();
    const listener = onSidePanelPageToolCommandMock.mock.calls[0]?.[0] as ((msg: { type: string; requestId: string; generation: number; command: unknown }) => void) | undefined;

    await act(async () => {
      dispatchExternalEvent(listener, {
        type: 'ui/element',
        payload: {
          element: {
            kind: 'visual',
            tagName: 'CANVAS',
            text: '销售图表',
            summary: '视觉区域 · canvas · 截图区域',
            visual: {
              rect: { x: 120, y: 90, width: 240, height: 180 },
              viewport: { width: 600, height: 450, scrollX: 0, scrollY: 0, devicePixelRatio: 2 },
              screenshot: { dataUrl: 'data:image/png;base64,BBBB', name: 'visual.png', mime: 'image/png' },
            },
          },
          source: { url: 'https://example.com/chart', title: 'Chart Page' },
        },
      }, 'external-element-visual');
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(putImageAttachmentMock).toHaveBeenCalledWith(expect.objectContaining({
      name: 'visual.png',
      mime: 'image/png',
    }));
    expect(chatHandle.acceptExternalDraft).toHaveBeenCalledWith(expect.objectContaining({
      element: expect.objectContaining({
        kind: 'visual',
        tagName: 'CANVAS',
        visual: expect.not.objectContaining({
          screenshot: expect.anything(),
        }),
      }),
      attachments: [{
        type: 'image',
        id: 'img-1',
        name: 'picked.png',
        mime: 'image/png',
        size: 3,
      }],
    }));
    expect(postSidePanelPageToolMessageMock).toHaveBeenCalledWith({
      type: 'sidepanel/page-tool-command-ack',
      requestId: 'external-element-visual',
      generation: 1,
      payload: { ok: true },
    });
  });

  it('视觉区域截图缺失时会阻断草稿插入并提示错误', async () => {
    ensureUiPortReadyMock.mockResolvedValue({ name: 'ui-port' });
    const { chatHandle } = renderBridge(true);
    await flushBridgeEffect();
    const listener = onSidePanelPageToolCommandMock.mock.calls[0]?.[0] as ((msg: { type: string; requestId: string; generation: number; command: unknown }) => void) | undefined;

    await act(async () => {
      dispatchExternalEvent(listener, {
        type: 'ui/element',
        payload: {
          element: {
            kind: 'visual',
            tagName: 'IFRAME',
            text: 'iframe.title=外部报表',
            summary: '视觉区域 · iframe · 截图区域',
            visual: {
              rect: { x: 20, y: 30, width: 200, height: 120 },
              viewport: { width: 600, height: 450, scrollX: 0, scrollY: 0, devicePixelRatio: 1 },
            },
          },
          source: { url: 'https://example.com/frame', title: 'Frame Page' },
        },
      }, 'external-element-visual-failed');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(chatHandle.acceptExternalDraft).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({
      title: 'common.error',
      description: 'errors.elementPickerVisualScreenshotFailed',
      variant: 'destructive',
    }));
    expect(postSidePanelPageToolMessageMock).toHaveBeenCalledWith({
      type: 'sidepanel/page-tool-command-ack',
      requestId: 'external-element-visual-failed',
      generation: 1,
      payload: { ok: false, error: { key: 'errors.elementPickerVisualScreenshotFailed' } },
    });
  });
});
