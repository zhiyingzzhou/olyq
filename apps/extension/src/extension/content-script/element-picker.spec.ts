/**
 * 说明：`element-picker.spec` 元素选择器 content script 交互测试模块。
 *
 * 职责：
 * - 验证用户点击页面元素后会进入结构化选中态；
 * - 验证缩小/扩大范围会更新最终提取目标；
 * - 验证点击“加入输入”后发送结构化上下文 `element/action`。
 *
 * 边界：
 * - 这里只模拟网页 DOM 与 Chrome runtime message；
 * - 不启动 Service Worker，不触碰侧栏和权限申请流程。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendMessageMock = vi.fn();
let closeElementPicker: (() => void) | null = null;

/**
 * 安装测试期 Chrome runtime mock。
 */
function installChromeMock() {
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      runtime: {
        lastError: undefined,
        sendMessage: (message: unknown, callback?: (response: unknown) => void) => {
          sendMessageMock(message);
          callback?.({ ok: true });
        },
      },
    },
  });
}

/**
 * 构造 jsdom 中缺失的 DOMRect-like 对象。
 *
 * @param left - 矩形左侧视口坐标。
 * @param top - 矩形顶部视口坐标。
 * @param width - 矩形宽度。
 * @param height - 矩形高度。
 * @returns 可供 `getBoundingClientRect` 返回的矩形。
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
 * 为指定元素挂载稳定的测试矩形。
 *
 * @param el - 目标 DOM 元素。
 * @param left - 矩形左侧视口坐标。
 * @param top - 矩形顶部视口坐标。
 * @param width - 矩形宽度。
 * @param height - 矩形高度。
 */
function mockRect(el: Element, left: number, top: number, width: number, height: number) {
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => makeRect(left, top, width, height),
  });
}

/**
 * 动态加载元素选择器模块，并记录清理入口。
 *
 * @returns 当前测试使用的元素选择器模块。
 */
async function importPicker() {
  const mod = await import('./element-picker');
  closeElementPicker = mod.closeElementPicker;
  return mod;
}

/**
 * 获取元素选择器 Shadow Root。
 *
 * @returns 已挂载的元素选择器 Shadow Root。
 */
function getPickerShadow() {
  const host = document.getElementById('__olyq_shadow_host__');
  expect(host).toBeTruthy();
  expect(host?.shadowRoot).toBeTruthy();
  return host!.shadowRoot!;
}

/**
 * 固定工具条测量值，避免 jsdom 因文本内容变化返回不稳定高度。
 *
 * 元素选择器运行时会按实际浮层尺寸贴近目标元素定位；测试只需要稳定验证
 * “相对当前目标定位”这条产品契约，不让虚拟布局环境的零尺寸/换行推导干扰断言。
 *
 * @param shadow - 元素选择器 Shadow Root。
 */
function mockHintToolbarRect(shadow: ShadowRoot) {
  const hint = shadow.querySelector('.hint');
  expect(hint).toBeTruthy();
  mockRect(hint!, 0, 0, 420, 42);
}

/**
 * 构造包含内联文本、段落和父级卡片的测试页面。
 *
 * @returns 当前测试页面中的关键元素引用。
 */
function setupPage() {
  document.title = '元素选择器测试页';
  document.body.innerHTML = `
    <article id="card">
      <p id="copy">这是一段用于元素选择器测试的正文，里面有 <span id="target">重点词</span>。</p>
    </article>
  `;

  const article = document.getElementById('card')!;
  const paragraph = document.getElementById('copy')!;
  const span = document.getElementById('target')!;

  mockRect(article, 8, 80, 320, 120);
  mockRect(paragraph, 20, 96, 260, 48);
  mockRect(span, 42, 108, 48, 18);

  Object.defineProperty(document, 'elementsFromPoint', {
    configurable: true,
    value: vi.fn(() => [span, paragraph, article, document.body, document.documentElement]),
  });

  return { article, paragraph, span };
}

/**
 * 模拟用户在目标内联文本处按下鼠标。
 */
function clickPageAtTarget() {
  document.dispatchEvent(new MouseEvent('mousedown', {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: 50,
    clientY: 112,
  }));
}

/**
 * 模拟真实浏览器里事件先落到元素选择器透明 shield。
 *
 * @param shadow - 元素选择器 Shadow Root。
 */
function clickShieldAtTarget(shadow: ShadowRoot) {
  shadow.querySelector('.event-shield')?.dispatchEvent(new MouseEvent('mousedown', {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: 50,
    clientY: 112,
  }));
}

/**
 * 模拟用户在目标内联文本处移动鼠标。
 */
function moveOverTarget() {
  document.dispatchEvent(new MouseEvent('mousemove', {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: 50,
    clientY: 112,
  }));
}

/**
 * 模拟点击 Shadow DOM 内的按钮。
 *
 * @param button - 待点击的按钮元素。
 */
function clickShadowButton(button: Element) {
  button.dispatchEvent(new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    composed: true,
  }));
}

/** 等待元素选择器提交链路中的异步提取和 typed runtime callback 完成。 */
async function flushElementPickerAsync() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('element picker content script', () => {
  beforeEach(() => {
    vi.resetModules();
    sendMessageMock.mockReset();
    closeElementPicker = null;
    document.getElementById('__olyq_shadow_host__')?.remove();
    installChromeMock();
    setupPage();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
  });

  afterEach(() => {
    closeElementPicker?.();
    document.getElementById('__olyq_shadow_host__')?.remove();
    document.body.innerHTML = '';
  });

  it('点击内联文本后默认选中真实 span，并展示精细结构摘要', async () => {
    const { openElementPicker } = await importPicker();

    openElementPicker();
    const shadow = getPickerShadow();
    mockHintToolbarRect(shadow);
    clickShieldAtTarget(shadow);

    expect(shadow.querySelector('[data-role="text"]')).toHaveTextContent('已选 span');
    expect(shadow.querySelector('[data-role="summary"]')).toHaveTextContent(/文本 · span · 约 \d+ 字/);
    expect(shadow.querySelector('.highlight')).toHaveStyle({
      left: '40px',
      top: '106px',
      width: '52px',
      height: '22px',
    });
    expect(shadow.querySelector('.hint')).toHaveAttribute('data-placement', 'top');
    expect(shadow.querySelector('.hint')).toHaveStyle({
      left: '12px',
      top: '56px',
      transform: 'none',
    });
    expect(shadow.querySelector<HTMLButtonElement>('button[data-action="shrink"]')).toBeDisabled();
    expect(shadow.querySelector<HTMLButtonElement>('button[data-action="expand"]')).not.toBeDisabled();
    expect(shadow.querySelector('button[data-action="commit"]')).toHaveTextContent('添加到对话');
    expect(shadow.querySelector('.hint button[data-action="ask"]')).toBeNull();
    expect(shadow.querySelector('.hint button[data-action="explain"]')).toBeNull();
  });

  it('打开确认只在选择器真实显示后成立，Esc 关闭会带 returnToPanel 通知后台', async () => {
    const { isElementPickerOpenForAck, openElementPicker } = await importPicker();

    openElementPicker({
      sessionId: 'page-tool-element-picker-42-test',
      returnToPanel: true,
    });
    const shadow = getPickerShadow();

    expect(shadow.querySelector('.event-shield')).toHaveStyle({ display: 'block' });
    expect(shadow.querySelector('.hint')).toHaveStyle({ display: 'flex' });
    expect(isElementPickerOpenForAck('page-tool-element-picker-42-test')).toBe(true);
    expect(isElementPickerOpenForAck('other-session')).toBe(false);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: 'page-tool/session/closed',
      payload: {
        sessionId: 'page-tool-element-picker-42-test',
        tool: 'element-picker',
        reason: 'escape',
        returnToPanel: true,
        source: expect.objectContaining({ url: expect.any(String), title: expect.any(String) }),
      },
    });
  });

  it('英文语言下确认按钮显示 Add to conversation', async () => {
    const i18n = (await import('@/i18n')).default;
    await i18n.changeLanguage('en-US');
    const { openElementPicker } = await importPicker();

    openElementPicker();
    const shadow = getPickerShadow();

    expect(shadow.querySelector('button[data-action="commit"]')).toHaveTextContent('Add to conversation');
  });

  it('选择模式会拦截完整点击链路，不触发页面原本按钮事件', async () => {
    document.body.innerHTML = `
      <button id="danger">原页面按钮</button>
    `;
    const button = document.getElementById('danger')!;
    mockRect(button, 20, 80, 140, 40);
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: vi.fn(() => [button, document.body, document.documentElement]),
    });
    const pageHandler = vi.fn();
    for (const type of ['mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu']) {
      button.addEventListener(type, pageHandler);
    }
    const { openElementPicker } = await importPicker();

    openElementPicker();
    const shadow = getPickerShadow();
    mockHintToolbarRect(shadow);
    for (const type of ['mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu']) {
      button.dispatchEvent(new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: 48,
        clientY: 96,
      }));
    }

    expect(pageHandler).not.toHaveBeenCalled();
    expect(shadow.querySelector('[data-role="text"]')).toHaveTextContent('已选 button');
    expect(shadow.querySelector('[data-role="summary"]')).toHaveTextContent(/文本 · button · 约 \d+ 字/);
  });

  it('选择模式会拦截页面键盘激活，工具条内 Esc 仍能退出', async () => {
    document.body.innerHTML = `
      <button id="danger">原页面按钮</button>
    `;
    const button = document.getElementById('danger')!;
    mockRect(button, 20, 80, 140, 40);
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: vi.fn(() => [button, document.body, document.documentElement]),
    });
    const pageKeyHandler = vi.fn();
    button.addEventListener('keydown', pageKeyHandler);
    const { openElementPicker } = await importPicker();

    openElementPicker();
    const shadow = getPickerShadow();
    mockHintToolbarRect(shadow);

    button.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
      composed: true,
    }));
    button.dispatchEvent(new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
      composed: true,
    }));

    expect(pageKeyHandler).not.toHaveBeenCalled();

    shadow.querySelector('button[data-action="commit"]')?.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
      composed: true,
    }));

    expect(shadow.querySelector<HTMLElement>('.hint')?.style.display).toBe('none');
  });

  it('退出选择模式时会同步收起工具条 tooltip', async () => {
    const { openElementPicker } = await importPicker();

    openElementPicker();
    const shadow = getPickerShadow();
    const shrink = shadow.querySelector('button[data-action="shrink"]')!;
    const tooltip = shadow.querySelector<HTMLElement>('.page-tooltip')!;
    mockRect(shrink, 40, 80, 34, 34);
    mockRect(tooltip, 0, 0, 120, 30);

    shrink.dispatchEvent(new MouseEvent('pointerover', { bubbles: true, composed: true }));
    expect(tooltip.style.display).toBe('block');

    closeElementPicker?.();

    expect(tooltip.style.display).toBe('none');
    expect(shrink).not.toHaveAttribute('aria-describedby');
  });

  it('空壳遮罩盖住正文时会命中下方有意义文本块，而不是选中 0 字 div', async () => {
    document.body.innerHTML = `
      <article id="card">
        <p id="copy">真正要选择的正文内容。</p>
        <div id="overlay" aria-hidden="true"></div>
      </article>
    `;
    const article = document.getElementById('card')!;
    const paragraph = document.getElementById('copy')!;
    const overlay = document.getElementById('overlay')!;
    mockRect(article, 8, 80, 320, 120);
    mockRect(paragraph, 20, 96, 260, 48);
    mockRect(overlay, 8, 80, 320, 120);
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: vi.fn(() => [overlay, paragraph, article, document.body, document.documentElement]),
    });
    const { openElementPicker } = await importPicker();

    openElementPicker();
    const shadow = getPickerShadow();
    mockHintToolbarRect(shadow);
    clickPageAtTarget();

    expect(shadow.querySelector('[data-role="text"]')).toHaveTextContent('已选 p');
    expect(shadow.querySelector('[data-role="summary"]')).toHaveTextContent(/文本 · p · 约 \d+ 字/);
  });

  it('hover 时工具条跟随当前高亮区域，而不是固定在页面顶部', async () => {
    const { openElementPicker } = await importPicker();

    openElementPicker();
    const shadow = getPickerShadow();
    mockHintToolbarRect(shadow);
    moveOverTarget();

    expect(shadow.querySelector('[data-role="text"]')).toHaveTextContent('点击选择网页元素');
    expect(shadow.querySelector('.highlight')).toHaveStyle({
      left: '40px',
      top: '106px',
      width: '52px',
      height: '22px',
    });
    expect(shadow.querySelector('.hint')).toHaveAttribute('data-placement', 'top');
    expect(shadow.querySelector('.hint')).toHaveStyle({
      left: '12px',
      top: '56px',
    });
  });

  it('缩小和扩大范围会从精细元素逐级切到父级结构', async () => {
    const { openElementPicker } = await importPicker();

    openElementPicker();
    const shadow = getPickerShadow();
    mockHintToolbarRect(shadow);
    clickPageAtTarget();

    clickShadowButton(shadow.querySelector('button[data-action="expand"]')!);

    expect(shadow.querySelector('[data-role="text"]')).toHaveTextContent('已选 p');
    expect(shadow.querySelector('[data-role="summary"]')).toHaveTextContent(/文本 · p · 约 \d+ 字/);
    expect(shadow.querySelector('.highlight')).toHaveStyle({
      left: '18px',
      top: '94px',
      width: '264px',
      height: '52px',
    });

    clickShadowButton(shadow.querySelector('button[data-action="expand"]')!);

    expect(shadow.querySelector('[data-role="text"]')).toHaveTextContent('已选 article');
    expect(shadow.querySelector('[data-role="summary"]')).toHaveTextContent(/文本 · article · 约 \d+ 字/);
    const articleHighlight = shadow.querySelector('.highlight') as HTMLElement;
    expect(articleHighlight.style.left).toBe('6px');
    expect(articleHighlight.style.top).toBe('78px');
    expect(articleHighlight.style.width).toBe('324px');
    expect(articleHighlight.style.height).toBe('124px');
    expect(shadow.querySelector('.hint')).toHaveStyle({
      left: '12px',
      top: '28px',
    });
    expect(shadow.querySelector<HTMLButtonElement>('button[data-action="expand"]')).toBeDisabled();

    clickShadowButton(shadow.querySelector('button[data-action="shrink"]')!);
    expect(shadow.querySelector('[data-role="text"]')).toHaveTextContent('已选 p');
    const shrinkHighlight = shadow.querySelector<HTMLElement>('.highlight');
    expect(shrinkHighlight?.style.left).toBe('18px');
    expect(shrinkHighlight?.style.top).toBe('94px');
    expect(shrinkHighlight?.style.width).toBe('264px');
    expect(shrinkHighlight?.style.height).toBe('52px');
    expect(shadow.querySelector('.hint')).toHaveAttribute('data-placement', 'top');
    expect(shadow.querySelector('.hint')).toHaveStyle({
      left: '12px',
    });
    expect(shadow.querySelector<HTMLElement>('.hint')?.style.top).not.toBe('14px');

    clickShadowButton(shadow.querySelector('button[data-action="shrink"]')!);
    expect(shadow.querySelector('[data-role="text"]')).toHaveTextContent('已选 span');
    expect(shadow.querySelector<HTMLButtonElement>('button[data-action="shrink"]')).toBeDisabled();
  });

  it('选择区域靠近视口顶部时工具条会落到区域下方', async () => {
    const paragraph = document.getElementById('copy')!;
    const span = document.getElementById('target')!;
    mockRect(paragraph, 20, 8, 260, 30);
    mockRect(span, 42, 16, 48, 12);
    const { openElementPicker } = await importPicker();

    openElementPicker();
    const shadow = getPickerShadow();
    mockHintToolbarRect(shadow);
    clickPageAtTarget();

    expect(shadow.querySelector('.hint')).toHaveAttribute('data-placement', 'bottom');
    expect(shadow.querySelector('.hint')).toHaveStyle({
      left: '12px',
      top: '38px',
    });
  });

  it('选择区域靠近视口右侧时工具条会按真实宽度向左 shift', async () => {
    const article = document.getElementById('card')!;
    const paragraph = document.getElementById('copy')!;
    const span = document.getElementById('target')!;
    mockRect(article, 180, 80, 100, 120);
    mockRect(paragraph, 188, 96, 90, 48);
    mockRect(span, 248, 108, 28, 18);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 });
    const { openElementPicker } = await importPicker();

    openElementPicker();
    const shadow = getPickerShadow();
    mockHintToolbarRect(shadow);
    clickShieldAtTarget(shadow);

    const hint = shadow.querySelector<HTMLElement>('.hint')!;
    expect(hint).toHaveAttribute('data-placement', 'top');
    expect(hint.style.left).toBe('12px');
    expect(hint.style.maxWidth).toBe('296px');
    expect(Number.parseFloat(hint.style.left) + 296).toBeLessThanOrEqual(window.innerWidth - 12);
    expect(hint.style.transform).toBe('none');
  });

  it('点击加入输入发送当前范围对应的结构化元素 payload', async () => {
    const { openElementPicker } = await importPicker();

    openElementPicker();
    const shadow = getPickerShadow();
    mockHintToolbarRect(shadow);
    clickPageAtTarget();

    clickShadowButton(shadow.querySelector('button[data-action="expand"]')!);
    clickShadowButton(shadow.querySelector('button[data-action="expand"]')!);
    clickShadowButton(shadow.querySelector('button[data-action="commit"]')!);
    await Promise.resolve();
    await Promise.resolve();

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: 'element/action',
      payload: {
        element: expect.objectContaining({
          kind: 'text',
          tagName: 'ARTICLE',
          selector: 'article#card',
          summary: expect.stringMatching(/文本 · article · 约 \d+ 字/),
          text: expect.stringContaining('这是一段用于元素选择器测试的正文'),
        }),
        source: {
          url: location.href,
          title: '元素选择器测试页',
        },
      },
    });
  });

  it('提交失败时展示 Service Worker 返回的 i18n 错误', async () => {
    Object.defineProperty(globalThis, 'chrome', {
      configurable: true,
      value: {
        runtime: {
          lastError: undefined,
          sendMessage: (message: unknown, callback?: (response: unknown) => void) => {
            sendMessageMock(message);
            callback?.({ ok: false, error: { key: 'errors.pageToolsDisabled' } });
          },
        },
      },
    });
    const { openElementPicker } = await importPicker();

    openElementPicker();
    const shadow = getPickerShadow();
    mockHintToolbarRect(shadow);
    clickPageAtTarget();
    clickShadowButton(shadow.querySelector('button[data-action="commit"]')!);
    await flushElementPickerAsync();

    expect(shadow.querySelector('[data-role="summary"]')).toHaveTextContent('网页工具已在设置中关闭');
  });

  it('canvas 这类 DOM 无文本但视觉有效的区域会生成 visual payload', async () => {
    document.body.innerHTML = `
      <canvas id="chart" aria-label="销售图表"></canvas>
    `;
    const canvas = document.getElementById('chart')!;
    mockRect(canvas, 30, 90, 240, 120);
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: vi.fn(() => [canvas, document.body, document.documentElement]),
    });
    const { openElementPicker } = await importPicker();

    openElementPicker();
    const shadow = getPickerShadow();
    mockHintToolbarRect(shadow);
    clickPageAtTarget();

    expect(shadow.querySelector('[data-role="text"]')).toHaveTextContent('已选 canvas');
    expect(shadow.querySelector('[data-role="summary"]')).toHaveTextContent('视觉区域 · canvas · 截图区域');

    clickShadowButton(shadow.querySelector('button[data-action="commit"]')!);
    await Promise.resolve();
    await Promise.resolve();

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: 'element/action',
      payload: {
        element: expect.objectContaining({
          kind: 'visual',
          tagName: 'CANVAS',
          selector: 'canvas#chart',
          summary: '视觉区域 · canvas · 截图区域',
          text: '销售图表',
          visual: expect.objectContaining({
            rect: expect.objectContaining({
              x: 30,
              y: 90,
              width: 240,
              height: 120,
            }),
            viewport: expect.objectContaining({
              width: 1024,
              height: 768,
            }),
          }),
        }),
        source: {
          url: location.href,
          title: '元素选择器测试页',
        },
      },
    });
  });

  it('iframe 只作为页面块选择，不深入 frame 内部', async () => {
    document.body.innerHTML = `
      <iframe id="embed" title="外部报表" src="https://example.com/report"></iframe>
    `;
    const iframe = document.getElementById('embed')!;
    mockRect(iframe, 40, 100, 320, 180);
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: vi.fn(() => [iframe, document.body, document.documentElement]),
    });
    const { openElementPicker } = await importPicker();

    openElementPicker();
    const shadow = getPickerShadow();
    mockHintToolbarRect(shadow);
    clickPageAtTarget();
    clickShadowButton(shadow.querySelector('button[data-action="commit"]')!);
    await Promise.resolve();
    await Promise.resolve();

    expect(sendMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        element: expect.objectContaining({
          kind: 'visual',
          tagName: 'IFRAME',
          text: expect.stringContaining('iframe.title=外部报表'),
          visual: expect.objectContaining({
            rect: expect.objectContaining({ width: 320, height: 180 }),
          }),
        }),
      }),
    }));
  });

  it('点击表格单元格默认选中 td，扩大范围后发送 Markdown 表格', async () => {
    document.body.innerHTML = `
      <table id="price-table">
        <tr><th>名称</th><th>价格</th></tr>
        <tr><td id="cell">咖啡</td><td>18</td></tr>
      </table>
    `;
    const table = document.getElementById('price-table')!;
    const cell = document.getElementById('cell')!;
    const row = cell.parentElement!;
    mockRect(table, 12, 60, 360, 120);
    mockRect(row, 18, 94, 320, 42);
    mockRect(cell, 24, 100, 120, 30);
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: vi.fn(() => [cell, row, table, document.body, document.documentElement]),
    });
    const { openElementPicker } = await importPicker();

    openElementPicker();
    const shadow = getPickerShadow();
    mockHintToolbarRect(shadow);
    clickPageAtTarget();

    expect(shadow.querySelector('[data-role="text"]')).toHaveTextContent('已选 td');
    expect(shadow.querySelector('[data-role="summary"]')).toHaveTextContent(/文本 · td · 约 \d+ 字/);

    clickShadowButton(shadow.querySelector('button[data-action="expand"]')!);
    expect(shadow.querySelector('[data-role="text"]')).toHaveTextContent('已选 tr');

    clickShadowButton(shadow.querySelector('button[data-action="expand"]')!);
    expect(shadow.querySelector('[data-role="text"]')).toHaveTextContent('已选 table');
    expect(shadow.querySelector('[data-role="summary"]')).toHaveTextContent('表格 · table · 2 行 × 2 列');

    clickShadowButton(shadow.querySelector('button[data-action="commit"]')!);
    await Promise.resolve();
    await Promise.resolve();

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: 'element/action',
      payload: {
        element: expect.objectContaining({
          kind: 'table',
          tagName: 'TABLE',
          selector: 'table#price-table',
          summary: '表格 · table · 2 行 × 2 列',
          table: expect.objectContaining({
            rows: 2,
            columns: 2,
            markdown: expect.stringContaining('| 名称 | 价格 |'),
          }),
        }),
        source: {
          url: location.href,
          title: '元素选择器测试页',
        },
      },
    });
  });

  it('点击代码高亮子节点默认保留精细元素，扩大后才进入代码块', async () => {
    document.body.innerHTML = `
      <pre id="snippet"><code class="language-js"><span id="token">const value = 1</span></code></pre>
    `;
    const pre = document.getElementById('snippet')!;
    const code = pre.querySelector('code')!;
    const token = document.getElementById('token')!;
    mockRect(pre, 16, 70, 420, 120);
    mockRect(code, 24, 82, 380, 80);
    mockRect(token, 32, 94, 120, 20);
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: vi.fn(() => [token, code, pre, document.body, document.documentElement]),
    });
    const { openElementPicker } = await importPicker();

    openElementPicker();
    const shadow = getPickerShadow();
    mockHintToolbarRect(shadow);
    clickPageAtTarget();

    expect(shadow.querySelector('[data-role="text"]')).toHaveTextContent('已选 span');
    expect(shadow.querySelector('[data-role="summary"]')).toHaveTextContent(/文本 · span · 约 \d+ 字/);

    clickShadowButton(shadow.querySelector('button[data-action="expand"]')!);
    expect(shadow.querySelector('[data-role="text"]')).toHaveTextContent('已选 code');

    clickShadowButton(shadow.querySelector('button[data-action="expand"]')!);
    expect(shadow.querySelector('[data-role="text"]')).toHaveTextContent('已选 pre');
    expect(shadow.querySelector('[data-role="summary"]')).toHaveTextContent('代码 · pre · 1 行');
  });

  it('空内容且无视觉价值的元素不会生成 0 字引用卡', async () => {
    document.body.innerHTML = `
      <div id="empty"></div>
      <section id="shell"><div id="blank"></div></section>
    `;
    const blank = document.getElementById('blank')!;
    const empty = document.getElementById('empty')!;
    mockRect(blank, 20, 80, 80, 30);
    mockRect(empty, 140, 80, 80, 30);
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: vi.fn(() => [blank, empty, document.body, document.documentElement]),
    });
    const { openElementPicker } = await importPicker();

    openElementPicker();
    const shadow = getPickerShadow();
    mockHintToolbarRect(shadow);
    clickPageAtTarget();

    expect(shadow.querySelector('[data-role="text"]')).toHaveTextContent('点击选择网页元素');
    expect(shadow.querySelector('button[data-action="commit"]')).toBeDisabled();
    expect(sendMessageMock).not.toHaveBeenCalled();
  });
});
