/**
 * 说明：`inline-ui-interactions.spec` content script 交互测试模块。
 *
 * 职责：
 * - 驱动真实 content-script Shadow DOM，覆盖 page-facing 网页工具浮层状态机；
 * - 锁住划词工具条、隐藏菜单、结果卡片、元素选择器入口与 tooltip 的互斥 / 关闭契约；
 * - 避免这些页面注入交互继续依赖人工截图穷举。
 *
 * 边界：
 * - 这里只模拟网页 DOM、Selection 与 Chrome runtime；
 * - 不启动真实 Service Worker，不访问持久化存储，不验证模型生成内容。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type PageToolsSettingsSnapshot = {
  enabled: boolean;
  disabledSiteOrigins: string[];
};

type PageToolsSubscriber = (settings: PageToolsSettingsSnapshot) => void;

type RuntimeMessageListener = (
  message: unknown,
  sender: unknown,
  sendResponse?: (response: unknown) => void,
) => boolean | void;

type TestPort = {
  postMessage: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  emit: (message: unknown) => void;
  onMessage: {
    addListener: (listener: (message: unknown) => void) => void;
  };
  onDisconnect: {
    addListener: (listener: () => void) => void;
  };
};

const runtimeState = vi.hoisted(() => ({
  messageListeners: [] as RuntimeMessageListener[],
  pageToolsSubscribers: [] as PageToolsSubscriber[],
  ports: [] as TestPort[],
  sendMessage: vi.fn(),
  disablePageToolsForSite: vi.fn(async () => undefined),
  setPageToolsEnabled: vi.fn(async () => undefined),
  isPageToolsEnabledForUrl: vi.fn(async () => true),
  openElementPicker: vi.fn(),
  isElementPickerOpenForAck: vi.fn(() => true),
  closeElementPicker: vi.fn(),
  openScreenshotEditorOnDemand: vi.fn(async () => undefined),
  showScreenshotOcrPopover: vi.fn(),
  isScreenshotEditorMode: vi.fn(() => false),
  isScreenshotEditorOpenForAck: vi.fn(() => false),
  closeScreenshotEditor: vi.fn(),
}));

vi.mock('../../lib/dev/extension-context-guard', () => ({
  installDevExtensionContextInvalidatedGuard: vi.fn(),
}));

vi.mock('../../i18n', () => ({
  default: {
    t: (key: string, params?: Record<string, unknown>) => {
      if (key === 'contentScript.card.label') return `Olyq · ${String(params?.action ?? '')}`;
      return key;
    },
  },
  ensureI18nReady: vi.fn(async () => 'en-US'),
}));

vi.mock('@/lib/extension/page-tools', () => ({
  disablePageToolsForSite: runtimeState.disablePageToolsForSite,
  isPageToolsEnabledForUrl: runtimeState.isPageToolsEnabledForUrl,
  loadPageToolsSettings: vi.fn(async () => ({ enabled: true, disabledSiteOrigins: [] })),
  normalizePageToolsSiteOrigin: vi.fn((value: string) => value.startsWith('http') ? 'https://example.com' : null),
  setPageToolsEnabled: runtimeState.setPageToolsEnabled,
  subscribePageToolsSettings: vi.fn((subscriber: PageToolsSubscriber) => {
    runtimeState.pageToolsSubscribers.push(subscriber);
    return () => undefined;
  }),
}));

vi.mock('./element-picker', () => ({
  closeElementPicker: runtimeState.closeElementPicker,
  isElementPickerMode: () => (globalThis as unknown as Record<string, unknown>).__olyq_element_picker_mode__ === true,
  isElementPickerOpenForAck: runtimeState.isElementPickerOpenForAck,
  openElementPicker: runtimeState.openElementPicker,
}));

vi.mock('@/plugins/page-tools/screenshot-capture/content/controller', () => ({
  closeScreenshotEditor: runtimeState.closeScreenshotEditor,
  isScreenshotEditorMode: runtimeState.isScreenshotEditorMode,
  isScreenshotEditorOpenForAck: runtimeState.isScreenshotEditorOpenForAck,
}));

vi.mock('@/plugins/page-tools/screenshot-capture/content/entry', () => ({
  openScreenshotEditorOnDemand: runtimeState.openScreenshotEditorOnDemand,
}));

vi.mock('@/plugins/page-tools/screenshot-capture/content/ocr-popover', () => ({
  showScreenshotOcrPopover: runtimeState.showScreenshotOcrPopover,
}));

let selectedText = '';
let selectionRect: DOMRect | null = null;
let removeAllRangesMock = vi.fn();

/**
 * 构造 jsdom 可消费的 DOMRect-like 选区矩形。
 *
 * @param left - 左侧视口坐标。
 * @param top - 顶部视口坐标。
 * @param width - 宽度。
 * @param height - 高度。
 * @returns DOMRect 测试替身。
 */
function makeRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

/**
 * 设置当前测试里的浏览器选区文本和矩形。
 *
 * @param text - 选区文本。
 * @param rect - 选区矩形；为空表示选区失效。
 */
function setSelection(text: string, rect: DOMRect | null = makeRect(80, 140, 260, 28)) {
  selectedText = text;
  selectionRect = rect;
}

/** 安装受控 Selection mock，供 content script 读取当前划词。 */
function installSelectionMock() {
  removeAllRangesMock = vi.fn(() => {
    selectedText = '';
    selectionRect = null;
  });
  Object.defineProperty(window, 'getSelection', {
    configurable: true,
    value: () => ({
      rangeCount: selectedText && selectionRect ? 1 : 0,
      toString: () => selectedText,
      getRangeAt: () => ({
        getBoundingClientRect: () => selectionRect,
      }),
      removeAllRanges: removeAllRangesMock,
    }),
  });
}

/**
 * 创建一条可观测的 runtime Port mock。
 *
 * @returns 支持 postMessage、disconnect 和主动 emit 的测试端口。
 */
function createPort(): TestPort {
  const messageListeners: Array<(message: unknown) => void> = [];
  const disconnectListeners: Array<() => void> = [];
  const port: TestPort = {
    postMessage: vi.fn(),
    disconnect: vi.fn(() => {
      disconnectListeners.forEach((listener) => listener());
    }),
    emit: (message: unknown) => {
      messageListeners.forEach((listener) => listener(message));
    },
    onMessage: {
      addListener: (listener) => messageListeners.push(listener),
    },
    onDisconnect: {
      addListener: (listener) => disconnectListeners.push(listener),
    },
  };
  runtimeState.ports.push(port);
  return port;
}

/** 安装 content script 运行所需的 Chrome runtime mock。 */
function installChromeMock() {
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      runtime: {
        lastError: undefined,
        onMessage: {
          addListener: (listener: RuntimeMessageListener) => {
            runtimeState.messageListeners.push(listener);
          },
        },
        sendMessage: runtimeState.sendMessage,
        connect: vi.fn(() => createPort()),
      },
    },
  });
}

/** 等待当前微任务队列完成。 */
async function flushAsync() {
  await Promise.resolve();
  await Promise.resolve();
}

/** 导入 content script 运行入口，并等待初始 page-tools 状态同步。 */
async function importContentScript() {
  await import('./index');
  await flushAsync();
}

/**
 * 获取 Olyq page-facing ShadowRoot。
 *
 * @returns 已挂载的 content script ShadowRoot。
 */
function getShadow() {
  const host = document.getElementById('__olyq_shadow_host__');
  expect(host).toBeTruthy();
  expect(host?.shadowRoot).toBeTruthy();
  return host!.shadowRoot!;
}

/**
 * 查询当前测试常用的 Shadow DOM 节点。
 *
 * @returns 划词工具条、隐藏菜单、结果卡片、tooltip 和隐藏入口引用。
 */
function queryUi() {
  const shadow = getShadow();
  return {
    shadow,
    menu: shadow.querySelector<HTMLElement>('.menu')!,
    hidePanel: shadow.querySelector<HTMLElement>('.hide-panel')!,
    card: shadow.querySelector<HTMLElement>('.response-card')!,
    cardBody: shadow.querySelector<HTMLElement>('.response-body')!,
    tooltip: shadow.querySelector<HTMLElement>('.page-tooltip')!,
    hideTrigger: shadow.querySelector<HTMLButtonElement>('button[data-hide-trigger="menu"]')!,
  };
}

/**
 * 模拟用户划词后弹出工具条。
 *
 * @param text - 当前选区文本。
 * @returns 最新 UI 引用。
 */
async function showSelectionToolbar(text = 'Thoughtful directory') {
  setSelection(text);
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, composed: true }));
  await vi.advanceTimersByTimeAsync(0);
  await flushAsync();
  const ui = queryUi();
  expect(ui.menu.style.display).toBe('flex');
  return ui;
}

/**
 * 点击划词工具条的隐藏入口并打开隐藏菜单。
 *
 * @returns 最新 UI 引用。
 */
async function openHidePanel() {
  const ui = queryUi();
  ui.hideTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
  await flushAsync();
  expect(ui.hidePanel.style.display).toBe('flex');
  expect(ui.hideTrigger).toHaveAttribute('aria-expanded', 'true');
  return queryUi();
}

/**
 * 点击 Shadow DOM 内的交互元素。
 *
 * @param element - 待触发点击的 Shadow DOM 元素。
 */
function clickShadowElement(element: Element) {
  element.dispatchEvent(new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    composed: true,
  }));
}

/**
 * 启动一次解释 / 翻译 / 总结内联动作。
 *
 * @param action - 当前划词动作。
 * @returns 最新 UI 引用。
 */
async function startInlineAction(action: 'explain' | 'translate' | 'summarize' = 'explain') {
  const ui = await showSelectionToolbar(`${action} selection`);
  clickShadowElement(ui.shadow.querySelector(`button[data-action="${action}"]`)!);
  await flushAsync();
  return queryUi();
}

/** 通过 page-tools subscriber 模拟网页工具被全局关闭。 */
async function disablePageTools() {
  runtimeState.pageToolsSubscribers.forEach((subscriber) => subscriber({
    enabled: false,
    disabledSiteOrigins: [],
  }));
  await flushAsync();
}

describe('content script page-facing overlay interactions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    runtimeState.messageListeners = [];
    runtimeState.pageToolsSubscribers = [];
    runtimeState.ports = [];
    runtimeState.sendMessage.mockReset();
    runtimeState.disablePageToolsForSite.mockClear();
    runtimeState.setPageToolsEnabled.mockClear();
    runtimeState.isPageToolsEnabledForUrl.mockClear();
    runtimeState.openElementPicker.mockReset();
    runtimeState.isElementPickerOpenForAck.mockReset();
    runtimeState.isElementPickerOpenForAck.mockReturnValue(true);
    runtimeState.closeElementPicker.mockReset();
    runtimeState.openScreenshotEditorOnDemand.mockReset();
    runtimeState.isScreenshotEditorMode.mockReset();
    runtimeState.isScreenshotEditorMode.mockReturnValue(false);
    runtimeState.isScreenshotEditorOpenForAck.mockReset();
    runtimeState.isScreenshotEditorOpenForAck.mockReturnValue(false);
    runtimeState.closeScreenshotEditor.mockReset();
    delete (globalThis as unknown as Record<string, unknown>).__olyq_content_script_bootstrapped__;
    delete (globalThis as unknown as Record<string, unknown>).__olyq_element_picker_mode__;
    document.documentElement.querySelector('#__olyq_shadow_host__')?.remove();
    document.body.innerHTML = '<main><p id="copy">Thoughtful directory sample text.</p><button id="outside">outside</button></main>';
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(async () => undefined) },
    });
    installSelectionMock();
    installChromeMock();
  });

  afterEach(async () => {
    await disablePageTools();
    document.documentElement.querySelector('#__olyq_shadow_host__')?.remove();
    vi.useRealTimers();
  });

  it('点击解释会关闭划词工具条、隐藏菜单和 toolbar tooltip，并打开结果卡片', async () => {
    await importContentScript();
    let ui = await showSelectionToolbar();
    ui.hideTrigger.dispatchEvent(new MouseEvent('pointerover', { bubbles: true, composed: true }));
    expect(ui.tooltip.style.display).toBe('block');
    ui = await openHidePanel();

    clickShadowElement(ui.shadow.querySelector('button[data-action="explain"]')!);
    await flushAsync();
    ui = queryUi();

    expect(ui.menu.style.display).toBe('none');
    expect(ui.hidePanel.style.display).toBe('none');
    expect(ui.hidePanel).toHaveAttribute('aria-hidden', 'true');
    expect(ui.hideTrigger).toHaveAttribute('aria-expanded', 'false');
    expect(ui.tooltip.style.display).toBe('none');
    expect(ui.card.style.display).toBe('flex');
    expect(runtimeState.ports).toHaveLength(1);
  });

  it('选区清空后的延迟隐藏会同步关闭隐藏菜单', async () => {
    await importContentScript();
    await showSelectionToolbar();
    await openHidePanel();

    setSelection('', null);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, composed: true }));
    await vi.advanceTimersByTimeAsync(0);
    await flushAsync();
    await vi.advanceTimersByTimeAsync(130);
    await flushAsync();
    const ui = queryUi();

    expect(ui.menu.style.display).toBe('none');
    expect(ui.hidePanel.style.display).toBe('none');
    expect(ui.hideTrigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('外部点击关闭划词工具条和隐藏菜单，但不关闭已有结果卡片', async () => {
    await importContentScript();
    await startInlineAction('explain');
    await showSelectionToolbar('another selection');
    await openHidePanel();

    document.getElementById('outside')?.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      composed: true,
    }));
    const ui = queryUi();

    expect(ui.menu.style.display).toBe('none');
    expect(ui.hidePanel.style.display).toBe('none');
    expect(ui.card.style.display).toBe('flex');
  });

  it('点击已有结果卡片不会关闭划词工具条和隐藏菜单，并保留卡片阅读态', async () => {
    await importContentScript();
    await startInlineAction('explain');
    await showSelectionToolbar('card press selection');
    await openHidePanel();

    queryUi().card.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      composed: true,
    }));
    const ui = queryUi();

    expect(ui.menu.style.display).toBe('flex');
    expect(ui.hidePanel.style.display).toBe('flex');
    expect(ui.hideTrigger).toHaveAttribute('aria-expanded', 'true');
    expect(ui.card.style.display).toBe('flex');
  });

  it('关闭结果卡片不会触发划词工具条隐藏再重显', async () => {
    await importContentScript();
    await startInlineAction('translate');
    await showSelectionToolbar('close card selection');

    const closeButton = queryUi().card.querySelector('button[data-card-action="close"]')!;
    closeButton.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      composed: true,
    }));
    expect(queryUi().menu.style.display).toBe('flex');

    clickShadowElement(closeButton);
    await flushAsync();
    const ui = queryUi();

    expect(ui.card.style.display).toBe('none');
    expect(ui.menu.style.display).toBe('flex');
  });

  it('Escape 关闭隐藏菜单并把焦点归还给隐藏入口', async () => {
    await importContentScript();
    await showSelectionToolbar();
    const ui = await openHidePanel();
    const focusSpy = vi.spyOn(ui.hideTrigger, 'focus').mockImplementation(() => undefined);

    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
      composed: true,
    }));

    expect(ui.hidePanel.style.display).toBe('none');
    expect(ui.hideTrigger).toHaveAttribute('aria-expanded', 'false');
    expect(focusSpy).toHaveBeenCalled();
  });

  it('本次关闭动作会关闭所有普通网页工具浮层，并阻止本页生命周期内再次弹出划词工具条', async () => {
    await importContentScript();
    await startInlineAction('explain');
    await showSelectionToolbar('dismiss selection');
    const ui = await openHidePanel();

    clickShadowElement(ui.hidePanel.querySelector('button[data-hide-action="dismiss-session"]')!);
    await flushAsync();
    let nextUi = queryUi();
    expect(nextUi.menu.style.display).toBe('none');
    expect(nextUi.hidePanel.style.display).toBe('none');
    expect(nextUi.card.style.display).toBe('none');

    await showSelectionToolbar('should not reopen').catch(() => undefined);
    nextUi = queryUi();
    expect(nextUi.menu.style.display).toBe('none');
  });

  it('新一轮内联动作会中断旧流并替换当前结果卡片', async () => {
    await importContentScript();
    await startInlineAction('explain');
    const firstPort = runtimeState.ports[0];
    expect(firstPort.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'chat/stream-v1' }));

    const ui = await showSelectionToolbar('translate this text');
    clickShadowElement(ui.shadow.querySelector('button[data-action="translate"]')!);
    await flushAsync();

    expect(firstPort.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'chat/abort' }));
    expect(firstPort.disconnect).toHaveBeenCalled();
    expect(runtimeState.ports).toHaveLength(2);
    expect(queryUi().card.style.display).toBe('flex');
  });

  it('翻译内联结果会去掉模型返回的整段外层引号并保留正文内部引号', async () => {
    await importContentScript();
    await startInlineAction('translate');
    const port = runtimeState.ports[0];
    const streamRequest = port.postMessage.mock.calls[0]?.[0] as { requestId: string };

    port.emit({
      type: 'chat/delta',
      requestId: streamRequest.requestId,
      delta: '"API "Key" List"',
    });
    port.emit({ type: 'chat/done', requestId: streamRequest.requestId });
    await flushAsync();

    expect(queryUi().cardBody.textContent).toBe('API "Key" List');
  });

  it('翻译流式中间态不会先闪现开头包装引号', async () => {
    await importContentScript();
    await startInlineAction('translate');
    const port = runtimeState.ports[0];
    const streamRequest = port.postMessage.mock.calls[0]?.[0] as { requestId: string };

    port.emit({
      type: 'chat/delta',
      requestId: streamRequest.requestId,
      delta: '"',
    });
    await flushAsync();
    expect(queryUi().cardBody.textContent).toBe('');

    port.emit({
      type: 'chat/delta',
      requestId: streamRequest.requestId,
      delta: 'There are currently 5 valid API keys',
    });
    await flushAsync();
    expect(queryUi().cardBody.textContent).toBe('There are currently 5 valid API keys');

    port.emit({
      type: 'chat/delta',
      requestId: streamRequest.requestId,
      delta: '"',
    });
    port.emit({ type: 'chat/done', requestId: streamRequest.requestId });
    await flushAsync();
    expect(queryUi().cardBody.textContent).toBe('There are currently 5 valid API keys');
  });

  it('非翻译内联结果保留模型返回的整段引号', async () => {
    await importContentScript();
    await startInlineAction('explain');
    const port = runtimeState.ports[0];
    const streamRequest = port.postMessage.mock.calls[0]?.[0] as { requestId: string };

    port.emit({
      type: 'chat/delta',
      requestId: streamRequest.requestId,
      delta: '"Keep quoted explanation"',
    });
    port.emit({ type: 'chat/done', requestId: streamRequest.requestId });
    await flushAsync();

    expect(queryUi().cardBody.textContent).toBe('"Keep quoted explanation"');
  });

  it('复制保留结果卡片，打开侧边栏会关闭卡片并中断当前流', async () => {
    await importContentScript();
    const ui = await startInlineAction('summarize');
    ui.cardBody.textContent = 'copy me';

    clickShadowElement(ui.card.querySelector('button[data-card-action="copy"]')!);
    await flushAsync();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('copy me');
    expect(queryUi().card.style.display).toBe('flex');

    clickShadowElement(ui.card.querySelector('button[data-card-action="open"]')!);
    await flushAsync();
    expect(runtimeState.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'selection/action',
        payload: expect.objectContaining({ action: 'summarize' }),
      }),
      expect.any(Function),
    );
    expect(queryUi().card.style.display).toBe('none');
    expect(runtimeState.ports[0].postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'chat/abort' }));
  });

  it('进入元素选择器会关闭划词工具条、隐藏菜单、结果卡片和 tooltip，并清空原生选区', async () => {
    await importContentScript();
    await startInlineAction('explain');
    let ui = await showSelectionToolbar('element selection');
    ui.hideTrigger.dispatchEvent(new MouseEvent('pointerover', { bubbles: true, composed: true }));
    expect(ui.tooltip.style.display).toBe('block');
    await openHidePanel();

    const sendResponse = vi.fn();
    runtimeState.messageListeners[0]?.({ type: 'element/picker/open' }, {}, sendResponse);
    await flushAsync();
    ui = queryUi();

    expect(ui.menu.style.display).toBe('none');
    expect(ui.hidePanel.style.display).toBe('none');
    expect(ui.card.style.display).toBe('none');
    expect(ui.tooltip.style.display).toBe('none');
    expect(removeAllRangesMock).toHaveBeenCalled();
    expect(runtimeState.openElementPicker).toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({
      ok: true,
      opened: true,
      tool: 'element-picker',
    });
  });

  it('后台取消页面工具会话时关闭匹配 overlay 且不反向恢复 sidepanel', async () => {
    await importContentScript();
    runtimeState.isElementPickerOpenForAck.mockReturnValueOnce(true);
    runtimeState.isScreenshotEditorOpenForAck.mockReturnValueOnce(true);
    const sendResponse = vi.fn();

    runtimeState.messageListeners[0]?.({
      type: 'page-tool/session/cancel',
      payload: { sessionId: 'session-element', tool: 'element-picker', reason: 'replace' },
    }, {}, sendResponse);
    runtimeState.messageListeners[0]?.({
      type: 'page-tool/session/cancel',
      payload: { sessionId: 'session-screenshot', tool: 'screenshot-editor', reason: 'replace' },
    }, {}, sendResponse);

    expect(runtimeState.closeElementPicker).toHaveBeenCalledWith({ notifySession: false, reason: 'replace' });
    expect(runtimeState.closeScreenshotEditor).toHaveBeenCalledWith({ notifySession: false, reason: 'replace' });
    expect(runtimeState.sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({
      type: 'page-tool/session/closed',
    }));
    expect(sendResponse).toHaveBeenCalledWith({ ok: true });
  });

  it('page-tools 禁用会关闭所有浮层、退出元素选择器并中断 active stream', async () => {
    await importContentScript();
    await startInlineAction('explain');
    await showSelectionToolbar('disable selection');
    await openHidePanel();
    (globalThis as unknown as Record<string, unknown>).__olyq_element_picker_mode__ = true;

    await disablePageTools();
    const ui = queryUi();

    expect(ui.menu.style.display).toBe('none');
    expect(ui.hidePanel.style.display).toBe('none');
    expect(ui.card.style.display).toBe('none');
    expect(runtimeState.closeElementPicker).toHaveBeenCalled();
    expect(runtimeState.ports[0].postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'chat/abort' }));
  });
});
