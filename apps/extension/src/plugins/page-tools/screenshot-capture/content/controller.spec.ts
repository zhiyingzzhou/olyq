/**
 * 说明：`screenshot-editor.spec` 截图编辑器 content script 交互测试。
 *
 * 职责：
 * - 验证截图编辑器会挂载 Shadow DOM、渲染页面工具风格工具条；
 * - 验证拖拽可以生成选区并展示尺寸提示；
 * - 验证 Esc 会清理编辑器运行态。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let closeScreenshotEditor: (() => void) | null = null;
let closeScreenshotOcrPopoverForCleanup: (() => void) | null = null;
let canvasContext: ReturnType<typeof installCanvasMock> | null = null;

/**
 * 安装 canvas mock，覆盖 jsdom 不实现的绘图 API。
 */
function installCanvasMock() {
  const context = {
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    lineTo: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
    moveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    setLineDash: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'round',
    lineJoin: 'round',
    font: '',
    textBaseline: 'alphabetic',
    imageSmoothingEnabled: true,
  };
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: vi.fn(() => context),
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
    configurable: true,
    value: vi.fn(() => 'data:image/png;base64,MOCK'),
  });
  return context;
}

/**
 * 动态加载截图编辑器模块，并记录清理入口。
 */
async function importEditor() {
  const mod = await import('./controller');
  const ocr = await import('./ocr-popover');
  closeScreenshotEditor = mod.closeScreenshotEditor;
  closeScreenshotOcrPopoverForCleanup = () => ocr.closeScreenshotOcrPopover({ notifySession: false });
  return mod;
}

/** 动态加载 OCR 浮窗模块，并记录测试清理入口。 */
async function importOcrPopover() {
  const mod = await import('./ocr-popover');
  closeScreenshotOcrPopoverForCleanup = () => mod.closeScreenshotOcrPopover({ notifySession: false });
  return mod;
}

/**
 * 获取截图编辑器 Shadow Root。
 */
function getEditorShadow() {
  const host = document.getElementById('__olyq_shadow_host__');
  expect(host).toBeTruthy();
  expect(host?.shadowRoot).toBeTruthy();
  return host!.shadowRoot!;
}

/**
 * 触发截图图片加载完成。
 */
function finishImageLoad(shadow: ShadowRoot) {
  const image = shadow.querySelector<HTMLImageElement>('.source-image')!;
  Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 1200 });
  Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 800 });
  image.dispatchEvent(new Event('load'));
}

/**
 * 清空 canvas mock 的调用记录，便于按工具断言真实绘制路径。
 */
function clearCanvasCalls() {
  for (const value of Object.values(canvasContext ?? {})) {
    if (typeof value === 'function' && 'mockClear' in value) value.mockClear();
  }
}

/**
 * 读取截图文字 contentEditable 编辑层。
 */
function getTextEditor(shadow: ShadowRoot): HTMLDivElement {
  return shadow.querySelector<HTMLDivElement>('.text-editor')!;
}

/**
 * 读取已经提交的可拖拽文字标注 DOM。
 */
function getTextAnnotations(shadow: ShadowRoot): HTMLDivElement[] {
  return [...shadow.querySelectorAll<HTMLDivElement>('.text-annotation')];
}

/**
 * 读取截图工具条的撤销按钮。
 */
function getUndoButton(shadow: ShadowRoot): HTMLButtonElement {
  const button = shadow.querySelector<HTMLButtonElement>('button[data-action="undo"]');
  expect(button).toBeTruthy();
  return button!;
}

/**
 * 写入 contentEditable 草稿文本。
 */
function setTextDraft(editor: HTMLDivElement, text: string): void {
  editor.textContent = text;
}

/**
 * 在当前编辑器中拖出一个稳定选区。
 */
function dragSelection(shadow: ShadowRoot) {
  const canvas = shadow.querySelector('.annotation-canvas')!;
  canvas.dispatchEvent(new MouseEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: 20,
    clientY: 30,
  }));
  document.dispatchEvent(new MouseEvent('pointermove', {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: 220,
    clientY: 160,
  }));
  document.dispatchEvent(new MouseEvent('pointerup', {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: 220,
    clientY: 160,
  }));
}

/**
 * 打开截图编辑器并准备好一个可提交的选区。
 */
async function openEditorWithSelection(payload: Record<string, unknown> = {}) {
  const mod = await importEditor();
  mod.openScreenshotEditor({
    screenshot: {
      dataUrl: 'data:image/png;base64,AAAA',
      mime: 'image/png',
      name: 'screen.png',
    },
    ...payload,
  });
  const shadow = getEditorShadow();
  finishImageLoad(shadow);
  dragSelection(shadow);
  clearCanvasCalls();
  return { mod, shadow };
}

/**
 * 点击截图工具条里的工具或动作按钮。
 */
function clickToolbarButton(shadow: ShadowRoot, selector: string) {
  const button = shadow.querySelector<HTMLButtonElement>(selector);
  expect(button).toBeTruthy();
  button!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
  return button!;
}

/**
 * 点击截图工具条二级设置按钮。
 */
function clickToolOption(shadow: ShadowRoot, selector: string) {
  const button = shadow.querySelector<HTMLButtonElement>(selector);
  expect(button).toBeTruthy();
  button!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
  return button!;
}

/**
 * 在当前选区内拖拽一次标注工具。
 */
function drawInsideSelection(shadow: ShadowRoot) {
  const canvas = shadow.querySelector('.annotation-canvas')!;
  canvas.dispatchEvent(new MouseEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: 60,
    clientY: 70,
  }));
  document.dispatchEvent(new MouseEvent('pointermove', {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: 150,
    clientY: 120,
  }));
  document.dispatchEvent(new MouseEvent('pointerup', {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: 150,
    clientY: 120,
  }));
}

/**
 * 打开文字工具并在当前选区内创建一个文字草稿。
 */
function openTextDraft(shadow: ShadowRoot): HTMLDivElement {
  clickToolbarButton(shadow, 'button[data-tool="text"]');
  const canvas = shadow.querySelector('.annotation-canvas')!;
  canvas.dispatchEvent(new MouseEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: 80,
    clientY: 90,
  }));
  return getTextEditor(shadow);
}

/**
 * 等待工具条异步动作里的 Promise 链完成。
 */
async function flushToolbarAction() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('screenshot editor content script', () => {
  beforeEach(() => {
    vi.resetModules();
    canvasContext = installCanvasMock();
    closeScreenshotEditor = null;
    document.getElementById('__olyq_shadow_host__')?.remove();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 600 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 400 });
  });

  afterEach(() => {
    closeScreenshotOcrPopoverForCleanup?.();
    closeScreenshotEditor?.();
    document.getElementById('__olyq_shadow_host__')?.remove();
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.useRealTimers();
    canvasContext = null;
    closeScreenshotOcrPopoverForCleanup = null;
  });

  it('打开后拖拽生成选区，并可用 Esc 清理运行态', async () => {
    const { isScreenshotEditorMode, isScreenshotEditorOpenForAck, openScreenshotEditor } = await importEditor();

    openScreenshotEditor({
      screenshot: {
        dataUrl: 'data:image/png;base64,AAAA',
        mime: 'image/png',
        name: 'screen.png',
      },
    });
    const shadow = getEditorShadow();
    finishImageLoad(shadow);

    dragSelection(shadow);

    expect(shadow.querySelector('.selection')).toHaveStyle({
      display: 'block',
      left: '20px',
      top: '30px',
      width: '200px',
      height: '130px',
    });
    expect(shadow.querySelector('.size-badge')).toHaveTextContent('200 × 130');
    expect(shadow.querySelector('.screenshot-toolbar')).toHaveStyle({ display: 'flex' });
    expect(isScreenshotEditorMode()).toBe(true);
    expect(isScreenshotEditorOpenForAck()).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(isScreenshotEditorMode()).toBe(false);
    expect(shadow.querySelector('.screenshot-editor')).toHaveStyle({ display: 'none' });
  });

  it('Esc 关闭带会话的截图编辑器时会通知后台恢复 sidepanel', async () => {
    const sendMessage = vi.fn();
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const { openScreenshotEditor } = await importEditor();

    openScreenshotEditor({
      screenshot: {
        dataUrl: 'data:image/png;base64,AAAA',
        mime: 'image/png',
        name: 'screen.png',
      },
      sessionId: 'page-tool-screenshot-editor-42-test',
      returnToPanel: true,
    });
    const shadow = getEditorShadow();
    finishImageLoad(shadow);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

    expect(sendMessage).toHaveBeenCalledWith(
      {
        type: 'page-tool/session/closed',
        payload: {
          sessionId: 'page-tool-screenshot-editor-42-test',
          tool: 'screenshot-editor',
          reason: 'escape',
          returnToPanel: true,
          source: expect.objectContaining({ url: expect.any(String), title: expect.any(String) }),
        },
      },
      expect.any(Function),
    );
  });

  it('工具条工具按钮会真实激活并驱动对应 Canvas 标注路径', async () => {
    const { shadow } = await openEditorWithSelection();
    const ctx = canvasContext!;

    clickToolbarButton(shadow, 'button[data-tool="rect"]');
    expect(shadow.querySelector<HTMLButtonElement>('button[data-tool="rect"]')?.dataset.active).toBe('true');
    drawInsideSelection(shadow);
    expect(ctx.strokeRect).toHaveBeenCalled();

    clearCanvasCalls();
    clickToolbarButton(shadow, 'button[data-tool="circle"]');
    expect(shadow.querySelector<HTMLButtonElement>('button[data-tool="circle"]')?.dataset.active).toBe('true');
    drawInsideSelection(shadow);
    expect(ctx.ellipse).toHaveBeenCalled();

    clearCanvasCalls();
    clickToolbarButton(shadow, 'button[data-tool="arrow"]');
    expect(shadow.querySelector<HTMLButtonElement>('button[data-tool="arrow"]')?.dataset.active).toBe('true');
    drawInsideSelection(shadow);
    expect(ctx.lineTo).toHaveBeenCalled();

    clearCanvasCalls();
    clickToolbarButton(shadow, 'button[data-tool="pen"]');
    expect(shadow.querySelector<HTMLButtonElement>('button[data-tool="pen"]')?.dataset.active).toBe('true');
    drawInsideSelection(shadow);
    expect(ctx.stroke).toHaveBeenCalled();

    clearCanvasCalls();
    clickToolbarButton(shadow, 'button[data-tool="mosaic"]');
    expect(shadow.querySelector<HTMLButtonElement>('button[data-tool="mosaic"]')?.dataset.active).toBe('true');
    drawInsideSelection(shadow);
    expect(ctx.drawImage).toHaveBeenCalled();

    clearCanvasCalls();
    clickToolbarButton(shadow, 'button[data-tool="text"]');
    expect(shadow.querySelector<HTMLButtonElement>('button[data-tool="text"]')?.dataset.active).toBe('true');
    const canvas = shadow.querySelector('.annotation-canvas')!;
    canvas.dispatchEvent(new MouseEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: 80,
      clientY: 90,
    }));
    const input = getTextEditor(shadow);
    expect(input).toHaveStyle({ display: 'block' });
    setTextDraft(input, 'Caption');
    input.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }));
    expect(ctx.fillText).not.toHaveBeenCalled();
    expect(getTextAnnotations(shadow)).toHaveLength(1);
    expect(getTextAnnotations(shadow)[0]).toHaveTextContent('Caption');
    expect(getTextAnnotations(shadow)[0]).toHaveAttribute('data-selected', 'true');

    clearCanvasCalls();
    clickToolbarButton(shadow, 'button[data-action="undo"]');
    await flushToolbarAction();
    expect(ctx.clearRect).toHaveBeenCalled();
    expect(getTextAnnotations(shadow)).toHaveLength(0);
  });

  it('颜色和粗细设置会驱动形状、箭头和画笔的预览与提交', async () => {
    const { shadow } = await openEditorWithSelection();
    const ctx = canvasContext!;

    clickToolbarButton(shadow, 'button[data-tool="rect"]');
    expect(shadow.querySelector<HTMLElement>('.tool-options')).toHaveStyle({ display: 'flex' });
    expect(shadow.querySelector<HTMLElement>('.tool-options')?.dataset.activeTool).toBe('rect');
    clickToolOption(shadow, 'button[data-style-color="#426CEC"]');
    clickToolOption(shadow, 'button[data-style-size="8"]');
    drawInsideSelection(shadow);

    expect(ctx.strokeStyle).toBe('#426CEC');
    expect(ctx.lineWidth).toBe(16);
    expect(shadow.querySelector<HTMLButtonElement>('button[data-style-color="#426CEC"]')?.dataset.active).toBe('true');
    expect(shadow.querySelector<HTMLButtonElement>('button[data-style-size="8"]')?.dataset.active).toBe('true');

    clearCanvasCalls();
    clickToolbarButton(shadow, 'button[data-tool="pen"]');
    clickToolOption(shadow, 'button[data-style-color="#5ABA4D"]');
    clickToolOption(shadow, 'button[data-style-size="4"]');
    drawInsideSelection(shadow);

    expect(ctx.strokeStyle).toBe('#5ABA4D');
    expect(ctx.lineWidth).toBe(8);
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('文字字号和颜色设置会同步到透明 contentEditable 与最终 Canvas 文本', async () => {
    const { shadow } = await openEditorWithSelection();
    const ctx = canvasContext!;

    clickToolbarButton(shadow, 'button[data-tool="text"]');
    expect(shadow.querySelector<HTMLElement>('.tool-options')?.dataset.activeTool).toBe('text');
    expect(shadow.querySelector<HTMLElement>('[data-options-group="size"]')?.hidden).toBe(true);
    clickToolOption(shadow, 'button[data-style-color="#000000"]');
    clickToolOption(shadow, 'button[data-style-font-size="36"]');

    const canvas = shadow.querySelector('.annotation-canvas')!;
    canvas.dispatchEvent(new MouseEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: 80,
      clientY: 90,
    }));
    const textEditor = getTextEditor(shadow);
    expect(textEditor).toHaveStyle({ display: 'block' });
    expect(textEditor.style.color).toBe('rgb(0, 0, 0)');
    expect(textEditor.style.lineHeight).toBe('36px');
    expect(textEditor.style.font).toContain('36px');

    setTextDraft(textEditor, 'Styled text');
    textEditor.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    }));

    const annotation = getTextAnnotations(shadow)[0];
    expect(annotation).toHaveTextContent('Styled text');
    expect(annotation.style.color).toBe('rgb(0, 0, 0)');
    expect(annotation.style.lineHeight).toBe('36px');
    expect(ctx.fillText).not.toHaveBeenCalled();

    const write = vi.fn(async () => undefined);
    vi.stubGlobal('fetch', vi.fn(async () => ({
      blob: async () => new Blob(['png'], { type: 'image/png' }),
    })));
    vi.stubGlobal('ClipboardItem', vi.fn(function ClipboardItemMock(items: unknown) {
      return { items };
    }));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { write },
    });
    clearCanvasCalls();
    clickToolbarButton(shadow, 'button[data-action="copy"]');
    await flushToolbarAction();

    expect(ctx.font).toContain('72px');
    expect(ctx.fillStyle).toBe('#000000');
    expect(ctx.fillText).toHaveBeenCalledWith('Styled text', expect.any(Number), expect.any(Number));
  });

  it('滚轮会调节当前工具尺寸并阻止页面滚动，马赛克只显示尺寸设置', async () => {
    const { shadow } = await openEditorWithSelection();
    const ctx = canvasContext!;

    clickToolbarButton(shadow, 'button[data-tool="pen"]');
    const editor = shadow.querySelector<HTMLElement>('.screenshot-editor')!;
    const wheelEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: -120,
    });
    editor.dispatchEvent(wheelEvent);
    expect(wheelEvent.defaultPrevented).toBe(true);
    expect(shadow.querySelector<HTMLButtonElement>('button[data-style-size="4"]')?.dataset.active).toBe('true');
    drawInsideSelection(shadow);
    expect(ctx.lineWidth).toBe(8);

    clickToolbarButton(shadow, 'button[data-tool="mosaic"]');
    expect(shadow.querySelector<HTMLElement>('.tool-options')?.dataset.activeTool).toBe('mosaic');
    expect(shadow.querySelector<HTMLElement>('[data-options-group="color"]')?.hidden).toBe(true);
    expect(shadow.querySelector<HTMLElement>('[data-options-group="size"]')?.hidden).toBe(false);
    expect(shadow.querySelector<HTMLButtonElement>('button[data-mosaic-style-size="8"]')?.dataset.active).toBe('true');
  });

  it('标注工具态会覆盖选区层 cursor，文字工具进入文本插入态', async () => {
    const { shadow } = await openEditorWithSelection();
    const selection = shadow.querySelector<HTMLElement>('.selection')!;
    const canvas = shadow.querySelector<HTMLElement>('.annotation-canvas')!;

    expect(selection.style.cursor).toBe('move');
    expect(canvas.style.cursor).toBe('crosshair');

    for (const tool of ['rect', 'circle', 'arrow', 'pen', 'mosaic'] as const) {
      clickToolbarButton(shadow, `button[data-tool="${tool}"]`);
      expect(selection.style.cursor).toBe('crosshair');
      expect(canvas.style.cursor).toBe('crosshair');
    }

    clickToolbarButton(shadow, 'button[data-tool="text"]');
    expect(selection.style.cursor).toBe('text');
    expect(canvas.style.cursor).toBe('text');
  });

  it('文字工具使用 contentEditable 编辑态，支持换行、取消和快捷提交', async () => {
    const { shadow } = await openEditorWithSelection();
    const ctx = canvasContext!;
    const textEditor = openTextDraft(shadow);
    const canvas = shadow.querySelector('.annotation-canvas')!;
    expect(shadow.querySelectorAll('.text-editor')).toHaveLength(1);
    expect(textEditor.tagName).toBe('DIV');
    expect(textEditor).toHaveAttribute('contenteditable', 'true');
    expect(textEditor).toHaveAttribute('role', 'textbox');
    expect(textEditor).toHaveAttribute('aria-multiline', 'true');
    expect(textEditor).toHaveAttribute('data-olyq-text-editor', 'true');
    expect(textEditor).toHaveStyle({ display: 'block', cursor: 'text' });
    expect(textEditor.style.width).toBe('');
    expect(textEditor.style.height).toBe('');
    expect(textEditor.style.maxWidth).toBeTruthy();
    expect(textEditor.dataset.height).toBeUndefined();
    expect(textEditor.dataset.width).toBeUndefined();
    const selection = shadow.querySelector<HTMLElement>('.selection')!;
    expect(parseFloat(textEditor.style.left))
      .toBeLessThanOrEqual(parseFloat(selection.style.left) + parseFloat(selection.style.width));
    expect(parseFloat(textEditor.style.top))
      .toBeLessThanOrEqual(parseFloat(selection.style.top) + parseFloat(selection.style.height));

    setTextDraft(textEditor, 'draft');
    textEditor.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
      composed: true,
    }));
    expect(ctx.fillText).not.toHaveBeenCalled();
    expect(textEditor).toHaveStyle({ display: 'block' });
    expect(textEditor.dataset.open).toBe('true');

    const escapeEvent = new textEditor.ownerDocument.defaultView!.KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    textEditor.dispatchEvent(escapeEvent);
    expect(textEditor.dataset.open).toBeUndefined();
    expect(textEditor.style.display).toBe('none');
    expect(ctx.fillText).not.toHaveBeenCalled();

    canvas.dispatchEvent(new MouseEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: 80,
      clientY: 90,
    }));
    setTextDraft(textEditor, 'Title\nCaption');
    textEditor.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    }));
    expect(ctx.fillText).not.toHaveBeenCalled();
    expect(getTextAnnotations(shadow)).toHaveLength(1);
    expect(getTextAnnotations(shadow)[0].textContent).toBe('Title\nCaption');
    expect(textEditor.style.display).toBe('none');
  });

  it('英文普通输入不会退出 contentEditable 输入态', async () => {
    const { shadow } = await openEditorWithSelection();
    const ctx = canvasContext!;
    const textEditor = openTextDraft(shadow);

    for (const key of ['O', 'l', 'y', 'q']) {
      textEditor.dispatchEvent(new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
        composed: true,
      }));
      setTextDraft(textEditor, `${textEditor.textContent ?? ''}${key}`);
      textEditor.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        composed: true,
        data: key,
        inputType: 'insertText',
      }));
    }

    expect(ctx.fillText).not.toHaveBeenCalled();
    expect(textEditor.dataset.open).toBe('true');
    expect(textEditor.style.display).toBe('block');
  });

  it('中文 IME 组合输入期间不会被 Enter 或 Esc 提前提交', async () => {
    const { shadow, mod } = await openEditorWithSelection({
      sessionId: 'page-tool-screenshot-editor-ime-test',
      returnToPanel: true,
    });
    const ctx = canvasContext!;
    const textEditor = openTextDraft(shadow);

    textEditor.dispatchEvent(new CompositionEvent('compositionstart', {
      bubbles: true,
      cancelable: true,
      composed: true,
      data: 'zhong',
    }));
    setTextDraft(textEditor, '中文输入测试');

    for (const key of ['Enter', 'Escape']) {
      const event = new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
        composed: true,
      });
      Object.defineProperty(event, 'isComposing', { configurable: true, value: true });
      textEditor.dispatchEvent(event);
    }

    expect(ctx.fillText).not.toHaveBeenCalled();
    expect(textEditor.dataset.open).toBe('true');
    expect(textEditor.dataset.composing).toBe('true');
    expect(textEditor.style.display).toBe('block');
    expect(mod.isScreenshotEditorMode()).toBe(true);

    textEditor.dispatchEvent(new CompositionEvent('compositionend', {
      bubbles: true,
      cancelable: true,
      composed: true,
      data: '中文输入测试',
    }));
    expect(textEditor.dataset.open).toBe('true');
    expect(textEditor.dataset.composing).toBeUndefined();

    textEditor.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
      composed: true,
    }));
    expect(ctx.fillText).not.toHaveBeenCalled();
    expect(getTextAnnotations(shadow)[0]).toHaveTextContent('中文输入测试');
    expect(textEditor.style.display).toBe('none');
  });

  it('文字工具 blur 不再抢占提交，外部点击才提交可见草稿', async () => {
    const { shadow } = await openEditorWithSelection();
    const ctx = canvasContext!;
    const toDataUrlSpy = vi.mocked(HTMLCanvasElement.prototype.toDataURL);
    const canvas = shadow.querySelector('.annotation-canvas')!;
    const textEditor = openTextDraft(shadow);
    const undoButton = getUndoButton(shadow);
    expect(undoButton).toHaveAttribute('aria-disabled', 'true');
    expect(undoButton).toHaveAttribute('data-disabled', 'true');

    setTextDraft(textEditor, '   ');
    textEditor.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
    expect(ctx.fillText).not.toHaveBeenCalled();
    expect(toDataUrlSpy).not.toHaveBeenCalled();
    expect(textEditor.dataset.open).toBe('true');
    expect(textEditor.style.display).toBe('block');

    setTextDraft(textEditor, ' Blur submit ');
    textEditor.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
    expect(ctx.fillText).not.toHaveBeenCalled();
    expect(textEditor.dataset.open).toBe('true');

    canvas.dispatchEvent(new MouseEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: 300,
      clientY: 280,
    }));
    expect(ctx.fillText).not.toHaveBeenCalled();
    expect(getTextAnnotations(shadow)[0].textContent).toBe(' Blur submit ');
    expect(toDataUrlSpy).toHaveBeenCalledTimes(1);
    expect(textEditor.style.display).toBe('none');
    expect(undoButton).toHaveAttribute('aria-disabled', 'false');
    expect(undoButton).toHaveAttribute('data-disabled', 'false');
  });

  it('点击文字编辑层内部不会提交或退出输入态', async () => {
    const { shadow } = await openEditorWithSelection();
    const ctx = canvasContext!;
    const textEditor = openTextDraft(shadow);
    setTextDraft(textEditor, 'Still editing');

    textEditor.dispatchEvent(new MouseEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: 92,
      clientY: 98,
    }));

    expect(ctx.fillText).not.toHaveBeenCalled();
    expect(textEditor.dataset.open).toBe('true');
    expect(textEditor.style.display).toBe('block');
  });

  it('文字编辑态会禁用撤销，点击灰态撤销只退出编辑态，下一次点击才撤销', async () => {
    const { shadow } = await openEditorWithSelection();
    const ctx = canvasContext!;
    clickToolbarButton(shadow, 'button[data-tool="rect"]');
    drawInsideSelection(shadow);
    const undoButton = getUndoButton(shadow);
    expect(undoButton).toHaveAttribute('aria-disabled', 'false');
    expect(undoButton).toHaveAttribute('data-disabled', 'false');

    const textEditor = openTextDraft(shadow);
    setTextDraft(textEditor, 'Commit first');
    expect(undoButton).toHaveAttribute('aria-disabled', 'true');
    expect(undoButton).toHaveAttribute('data-disabled', 'true');

    clearCanvasCalls();
    clickToolbarButton(shadow, 'button[data-action="undo"]');
    await flushToolbarAction();

    expect(ctx.clearRect).not.toHaveBeenCalled();
    expect(textEditor.style.display).toBe('none');
    expect(getTextAnnotations(shadow)).toHaveLength(1);
    expect(getTextAnnotations(shadow)[0]).toHaveTextContent('Commit first');
    expect(undoButton).toHaveAttribute('aria-disabled', 'false');
    expect(undoButton).toHaveAttribute('data-disabled', 'false');

    clickToolbarButton(shadow, 'button[data-action="undo"]');
    await flushToolbarAction();

    expect(ctx.clearRect).toHaveBeenCalled();
    expect(getTextAnnotations(shadow)).toHaveLength(0);
  });

  it('文字草稿打开时点击画布空白只提交文字，不复用同一次点击创建新选区', async () => {
    const { shadow } = await openEditorWithSelection();
    const ctx = canvasContext!;
    clickToolbarButton(shadow, 'button[data-tool="text"]');
    const canvas = shadow.querySelector('.annotation-canvas')!;
    const selection = shadow.querySelector<HTMLElement>('.selection')!;
    const originalSelection = {
      left: selection.style.left,
      top: selection.style.top,
      width: selection.style.width,
      height: selection.style.height,
    };

    canvas.dispatchEvent(new MouseEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: 80,
      clientY: 90,
    }));
    const textEditor = getTextEditor(shadow);
    setTextDraft(textEditor, 'Only submit');

    canvas.dispatchEvent(new MouseEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: 300,
      clientY: 280,
    }));

    expect(ctx.fillText).not.toHaveBeenCalled();
    expect(getTextAnnotations(shadow)[0]).toHaveTextContent('Only submit');
    expect(selection.style.left).toBe(originalSelection.left);
    expect(selection.style.top).toBe(originalSelection.top);
    expect(selection.style.width).toBe(originalSelection.width);
    expect(selection.style.height).toBe(originalSelection.height);
    expect(textEditor.style.display).toBe('none');
  });

  it('提交后的文字标注支持拖拽移动，并按移动后位置参与导出', async () => {
    const { shadow } = await openEditorWithSelection();
    const ctx = canvasContext!;
    const write = vi.fn(async () => undefined);
    vi.stubGlobal('fetch', vi.fn(async () => ({
      blob: async () => new Blob(['png'], { type: 'image/png' }),
    })));
    vi.stubGlobal('ClipboardItem', vi.fn(function ClipboardItemMock(items: unknown) {
      return { items };
    }));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { write },
    });

    const textEditor = openTextDraft(shadow);
    setTextDraft(textEditor, 'Drag me');
    textEditor.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
      composed: true,
    }));

    const annotation = getTextAnnotations(shadow)[0];
    const initialLeft = parseFloat(annotation.style.left);
    annotation.dispatchEvent(new MouseEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: initialLeft + 8,
      clientY: parseFloat(annotation.style.top) + 8,
    }));
    document.dispatchEvent(new MouseEvent('pointermove', {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: initialLeft + 48,
      clientY: parseFloat(annotation.style.top) + 28,
    }));
    document.dispatchEvent(new MouseEvent('pointerup', {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: initialLeft + 48,
      clientY: parseFloat(annotation.style.top) + 28,
    }));

    const movedAnnotation = getTextAnnotations(shadow)[0];
    expect(parseFloat(movedAnnotation.style.left)).toBeGreaterThan(initialLeft);
    expect(movedAnnotation).not.toHaveAttribute('data-dragging', 'true');

    clearCanvasCalls();
    clickToolbarButton(shadow, 'button[data-action="copy"]');
    await flushToolbarAction();

    const call = vi.mocked(ctx.fillText).mock.calls.find(([text]) => text === 'Drag me');
    expect(call).toBeTruthy();
    expect(Number(call?.[1])).toBeGreaterThan(128);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('导出类动作前会先提交当前文字草稿', async () => {
    const { shadow } = await openEditorWithSelection();
    const ctx = canvasContext!;
    const write = vi.fn(async () => undefined);
    const fetchMock = vi.fn(async () => ({
      blob: async () => new Blob(['png'], { type: 'image/png' }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('ClipboardItem', vi.fn(function ClipboardItemMock(items: unknown) {
      return { items };
    }));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { write },
    });

    clickToolbarButton(shadow, 'button[data-tool="text"]');
    const canvas = shadow.querySelector('.annotation-canvas')!;
    canvas.dispatchEvent(new MouseEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: 80,
      clientY: 90,
    }));
    const textEditor = getTextEditor(shadow);
    setTextDraft(textEditor, 'Before export');

    clickToolbarButton(shadow, 'button[data-action="copy"]');
    await flushToolbarAction();

    expect(ctx.fillText).toHaveBeenCalledWith('Before export', expect.any(Number), expect.any(Number));
    expect(write).toHaveBeenCalledTimes(1);
    expect(textEditor.style.display).toBe('none');
  });

  it('复制和下载按钮会执行真实导出动作，失败时显示工具内错误', async () => {
    const { shadow } = await openEditorWithSelection();
    const write = vi.fn(async () => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const fetchMock = vi.fn(async () => ({
      blob: async () => new Blob(['png'], { type: 'image/png' }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('ClipboardItem', vi.fn(function ClipboardItemMock(items: unknown) {
      return { items };
    }));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { write },
    });

    clickToolbarButton(shadow, 'button[data-action="copy"]');
    await flushToolbarAction();
    expect(fetchMock).toHaveBeenCalledWith('data:image/png;base64,MOCK');
    expect(write).toHaveBeenCalledTimes(1);
    const feedback = shadow.querySelector<HTMLElement>('.tool-feedback')!;
    expect(feedback).toHaveStyle({ display: 'block' });
    expect(feedback).toHaveAttribute('data-variant', 'success');
    expect(feedback.textContent).toMatch(/已复制截图|Screenshot copied|screenshotEditor\.feedback\.copied/);

    clickToolbarButton(shadow, 'button[data-action="download"]');
    expect(click).toHaveBeenCalledTimes(1);

    write.mockRejectedValueOnce(new Error('clipboard denied'));
    clickToolbarButton(shadow, 'button[data-action="copy"]');
    await flushToolbarAction();
    expect(shadow.querySelector('.size-badge')).toHaveTextContent('clipboard denied');
    expect(shadow.querySelector('.size-badge')).toHaveAttribute('data-variant', 'error');
  });

  it('Clipboard API 不支持图片写入时会显示错误，不再静默成功', async () => {
    const { shadow } = await openEditorWithSelection();
    vi.stubGlobal('fetch', vi.fn(async () => ({
      blob: async () => new Blob(['png'], { type: 'image/png' }),
    })));
    Object.defineProperty(globalThis, 'ClipboardItem', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });

    clickToolbarButton(shadow, 'button[data-action="copy"]');
    await flushToolbarAction();

    expect(shadow.querySelector('.tool-feedback')).not.toHaveAttribute('data-variant', 'success');
    expect(shadow.querySelector('.size-badge')).toHaveAttribute('data-variant', 'error');
    expect(shadow.querySelector('.size-badge')?.textContent).not.toBe('');
  });

  it.each([
    ['chat', 'chat'],
    ['ocr', 'ocr'],
    ['confirm', 'chat'],
  ] as const)('点击 %s 成功后发送截图动作并关闭编辑器', async (buttonAction, expectedAction) => {
    const sendMessage = vi.fn((_message: unknown, callback: (response: unknown) => void) => {
      callback({ ok: true });
    });
    vi.stubGlobal('chrome', { runtime: { lastError: null, sendMessage } });
    const { mod, shadow } = await openEditorWithSelection({
      sessionId: `session-${buttonAction}`,
      returnToPanel: true,
    });

    clickToolbarButton(shadow, `button[data-action="${buttonAction}"]`);
    await flushToolbarAction();

    expect(sendMessage).toHaveBeenCalledWith({
      type: 'screenshot/action',
      payload: expect.objectContaining({
        action: expectedAction,
        sessionId: `session-${buttonAction}`,
        returnToPanel: true,
        image: expect.objectContaining({
          dataUrl: 'data:image/png;base64,MOCK',
          mime: 'image/png',
          name: expect.stringMatching(/^screenshot-\d+\.png$/),
        }),
        rect: expect.objectContaining({ x: 20, y: 30, width: 200, height: 130 }),
      }),
    }, expect.any(Function));
    expect(mod.isScreenshotEditorMode()).toBe(false);
    expect(shadow.querySelector('.screenshot-editor')).toHaveStyle({ display: 'none' });
  });

  it('OCR 导出会在 PNG 过大时压缩为 JPEG 再提交，避免后台模型请求直接失败', async () => {
    const hugePng = `data:image/png;base64,${'A'.repeat(6_000_000)}`;
    const jpeg = 'data:image/jpeg;base64,SkZJRg==';
    vi.mocked(HTMLCanvasElement.prototype.toDataURL).mockImplementation((mime?: string) => (
      mime === 'image/jpeg' ? jpeg : hugePng
    ));
    const sendMessage = vi.fn((_message: unknown, callback: (response: unknown) => void) => {
      callback({ ok: true, text: 'text', ocrRequestId: 'ocr-compressed' });
    });
    vi.stubGlobal('chrome', { runtime: { lastError: null, sendMessage } });
    const { shadow } = await openEditorWithSelection({
      sessionId: 'session-ocr-compress',
      returnToPanel: true,
    });

    clickToolbarButton(shadow, 'button[data-action="ocr"]');
    await flushToolbarAction();

    expect(sendMessage).toHaveBeenCalledWith({
      type: 'screenshot/action',
      payload: expect.objectContaining({
        action: 'ocr',
        image: {
          dataUrl: jpeg,
          mime: 'image/jpeg',
          name: expect.stringMatching(/^screenshot-\d+\.jpg$/),
        },
      }),
    }, expect.any(Function));
  });

  it('点击发送后在后台回包前立即关闭编辑器，避免 sidepanel 打开时遮罩偏移', async () => {
    const sendMessage = vi.fn();
    vi.stubGlobal('chrome', { runtime: { lastError: null, sendMessage } });
    const { mod, shadow } = await openEditorWithSelection({
      sessionId: 'session-submit-pending',
      returnToPanel: true,
    });

    clickToolbarButton(shadow, 'button[data-action="chat"]');
    await flushToolbarAction();

    expect(sendMessage).toHaveBeenCalled();
    expect(mod.isScreenshotEditorMode()).toBe(false);
    expect(shadow.querySelector('.screenshot-editor')).toHaveStyle({ display: 'none' });
  });

  it('OCR 点击后立即关闭编辑器并显示 loading 浮窗，等待用户关闭后再恢复 sidepanel', async () => {
    const sendMessage = vi.fn();
    vi.stubGlobal('chrome', { runtime: { lastError: null, sendMessage } });
    const { isScreenshotOcrPopoverOpenForAck } = await importOcrPopover();
    const { mod, shadow } = await openEditorWithSelection({
      sessionId: 'session-ocr-loading',
      returnToPanel: true,
    });

    clickToolbarButton(shadow, 'button[data-action="ocr"]');
    await flushToolbarAction();

    expect(sendMessage).toHaveBeenCalledWith({
      type: 'screenshot/action',
      payload: expect.objectContaining({
        action: 'ocr',
        sessionId: 'session-ocr-loading',
        returnToPanel: true,
        ocrRequestId: expect.stringMatching(/^screenshot-ocr-/),
      }),
    }, expect.any(Function));
    expect(mod.isScreenshotEditorMode()).toBe(false);
    expect(shadow.querySelector('.screenshot-editor')).toHaveStyle({ display: 'none' });
    expect(shadow.querySelector('.ocr-popover')).toHaveStyle({ display: 'flex' });
    expect(shadow.querySelector('.ocr-popover')).toHaveAttribute('data-open', 'true');
    expect(shadow.querySelector('.ocr-popover')).toHaveAttribute('data-state', 'loading');
    expect(shadow.querySelector('.screenshot-editor')?.contains(shadow.querySelector('.ocr-popover'))).toBe(false);
    expect(isScreenshotOcrPopoverOpenForAck('session-ocr-loading')).toBe(true);
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({
      type: 'page-tool/session/closed',
    }));
  });

  it('OCR loading 浮窗作为 detached result surface，普通 owner replace cancel 不会关闭', async () => {
    const sendMessage = vi.fn();
    vi.stubGlobal('chrome', { runtime: { lastError: null, sendMessage } });
    const { isScreenshotOcrPopoverOpenForAck } = await importOcrPopover();
    const { cancelPageToolSessionFromBackground } = await import('../../../../extension/content-script/page-tool-session-cancel');
    const { shadow } = await openEditorWithSelection({
      sessionId: 'session-ocr-detached',
      returnToPanel: true,
    });

    clickToolbarButton(shadow, 'button[data-action="ocr"]');
    await flushToolbarAction();
    cancelPageToolSessionFromBackground({
      sessionId: 'session-ocr-detached',
      tool: 'screenshot-editor',
      reason: 'replace',
    });

    expect(shadow.querySelector('.ocr-popover')).toHaveStyle({ display: 'flex' });
    expect(shadow.querySelector('.ocr-popover')).toHaveAttribute('data-state', 'loading');
    expect(isScreenshotOcrPopoverOpenForAck('session-ocr-detached')).toBe(true);
  });

  it('OCR 浮窗点击后按当前 viewport 首次定位，并在后续 resize 时跟随原选区', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
    const sendMessage = vi.fn();
    vi.stubGlobal('chrome', { runtime: { lastError: null, sendMessage } });
    await importOcrPopover();
    const { shadow } = await openEditorWithSelection({
      sessionId: 'session-ocr-resize',
      returnToPanel: true,
    });

    clickToolbarButton(shadow, 'button[data-action="ocr"]');
    await flushToolbarAction();
    const popover = shadow.querySelector<HTMLElement>('.ocr-popover')!;
    expect(popover.style.left).toBe('230px');

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 240 });
    window.dispatchEvent(new Event('resize'));

    expect(popover.style.left).toBe('10px');
    expect(popover.style.top).toBe('30px');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
  });

  it.each([
    [{ ok: true, text: 'First line\r\nSecond line' }, 'result', 'First line\nSecond line'],
    [{ ok: true, text: '**smart-subscription**' }, 'result', '**smart-subscription**'],
    [{ ok: true, text: '   ' }, 'empty', /未识别到文字|No text found|screenshotEditor\.ocr\.empty/],
    [{ ok: false, error: { key: 'errors.screenshotOcrFailed' } }, 'error', /截图文字识别失败|Screenshot OCR failed|errors\.screenshotOcrFailed/],
  ] as const)('OCR 后台回包会更新浮窗 %s', async (response, expectedState, expectedText) => {
    const sendMessage = vi.fn((_message: unknown, callback: (value: unknown) => void) => {
      callback(response);
    });
    vi.stubGlobal('chrome', { runtime: { lastError: null, sendMessage } });
    await importOcrPopover();
    const { shadow } = await openEditorWithSelection({
      sessionId: `session-ocr-${expectedState}`,
      returnToPanel: true,
    });

    clickToolbarButton(shadow, 'button[data-action="ocr"]');
    await flushToolbarAction();

    expect(shadow.querySelector('.ocr-popover')).toHaveAttribute('data-state', expectedState);
    const content = shadow.querySelector('.ocr-content')!;
    if (typeof expectedText === 'string') {
      expect(content.textContent).toBe(expectedText);
    } else {
      expect(content).toHaveTextContent(expectedText);
    }
  });

  it('OCR 正文区域允许原生鼠标选择，不阻止 mousedown 默认行为', async () => {
    const sendMessage = vi.fn((_message: unknown, callback: (value: unknown) => void) => {
      callback({ ok: true, text: 'Selectable OCR text' });
    });
    vi.stubGlobal('chrome', { runtime: { lastError: null, sendMessage } });
    await importOcrPopover();
    const { shadow } = await openEditorWithSelection({
      sessionId: 'session-ocr-selectable',
      returnToPanel: true,
    });

    clickToolbarButton(shadow, 'button[data-action="ocr"]');
    await flushToolbarAction();

    const body = shadow.querySelector<HTMLElement>('.ocr-body')!;
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true });
    const dispatchResult = body.dispatchEvent(event);

    expect(dispatchResult).toBe(true);
    expect(event.defaultPrevented).toBe(false);
  });

  it('OCR 结果复制按钮会写入文本并显示 2.5 秒复制反馈', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const sendMessage = vi.fn((_message: unknown, callback: (value: unknown) => void) => {
      callback({ ok: true, text: 'Detected OCR text' });
    });
    vi.stubGlobal('chrome', { runtime: { lastError: null, sendMessage } });
    await importOcrPopover();
    const { shadow } = await openEditorWithSelection({
      sessionId: 'session-ocr-copy',
      returnToPanel: true,
    });

    clickToolbarButton(shadow, 'button[data-action="ocr"]');
    await flushToolbarAction();
    clickToolbarButton(shadow, 'button[data-ocr-action="copy"]');
    await flushToolbarAction();

    const copyButton = shadow.querySelector<HTMLButtonElement>('button[data-ocr-action="copy"]')!;
    expect(writeText).toHaveBeenCalledWith('Detected OCR text');
    expect(copyButton).toHaveAttribute('data-copied', 'true');
    expect(copyButton.textContent).toMatch(/已复制|Copied|screenshotEditor\.ocr\.copied/);

    vi.advanceTimersByTime(2_500);
    await flushToolbarAction();
    expect(copyButton).not.toHaveAttribute('data-copied');
  });

  it('OCR 浮窗关闭按钮与 Esc 会通知后台恢复 sidepanel', async () => {
    const sendMessage = vi.fn((_message: unknown, callback?: (value: unknown) => void) => {
      callback?.({ ok: true, text: 'Detected OCR text' });
    });
    vi.stubGlobal('chrome', { runtime: { lastError: null, sendMessage } });
    await importOcrPopover();
    const { shadow } = await openEditorWithSelection({
      sessionId: 'session-ocr-close',
      returnToPanel: true,
    });

    clickToolbarButton(shadow, 'button[data-action="ocr"]');
    await flushToolbarAction();
    sendMessage.mockClear();
    clickToolbarButton(shadow, 'button[data-ocr-action="close"]');

    expect(sendMessage).toHaveBeenCalledWith(
      {
        type: 'page-tool/session/closed',
        payload: expect.objectContaining({
          sessionId: 'session-ocr-close',
          reason: 'close',
          returnToPanel: true,
        }),
      },
      expect.any(Function),
    );

    sendMessage.mockClear();
    const { shadow: shadowAgain } = await openEditorWithSelection({
      sessionId: 'session-ocr-escape',
      returnToPanel: true,
    });
    clickToolbarButton(shadowAgain, 'button[data-action="ocr"]');
    await flushToolbarAction();
    sendMessage.mockClear();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

    expect(sendMessage).toHaveBeenCalledWith(
      {
        type: 'page-tool/session/closed',
        payload: expect.objectContaining({
          sessionId: 'session-ocr-escape',
          reason: 'escape',
          returnToPanel: true,
        }),
      },
      expect.any(Function),
    );
  });

  it('OCR loading 中关闭后，后台晚到回包不会重新弹出浮窗', async () => {
    let firstCallback: ((value: unknown) => void) | undefined;
    const sendMessage = vi.fn((_message: unknown, callback?: (value: unknown) => void) => {
      if (callback && !firstCallback) firstCallback = callback;
    });
    vi.stubGlobal('chrome', { runtime: { lastError: null, sendMessage } });
    await importOcrPopover();
    const { shadow } = await openEditorWithSelection({
      sessionId: 'session-ocr-late-response',
      returnToPanel: true,
    });

    clickToolbarButton(shadow, 'button[data-action="ocr"]');
    await flushToolbarAction();
    expect(shadow.querySelector('.ocr-popover')).toHaveStyle({ display: 'flex' });
    sendMessage.mockClear();
    clickToolbarButton(shadow, 'button[data-ocr-action="close"]');
    firstCallback?.({ ok: true, text: 'Late OCR text' });
    await flushToolbarAction();

    expect(sendMessage).toHaveBeenCalledWith(
      {
        type: 'page-tool/session/closed',
        payload: expect.objectContaining({
          sessionId: 'session-ocr-late-response',
          reason: 'close',
          returnToPanel: true,
        }),
      },
      expect.any(Function),
    );
    expect(shadow.querySelector('.ocr-popover')).not.toHaveStyle({ display: 'flex' });
    expect(shadow.querySelector('.ocr-content')?.textContent).toBe('');
  });

  it('截图提交失败后不恢复全屏编辑器，避免和 sidepanel 形成双浮层', async () => {
    const sendMessage = vi.fn((_message: unknown, callback: (response: unknown) => void) => {
      callback({ ok: false, error: { key: 'errors.pageToolSidePanelUnavailable' } });
    });
    vi.stubGlobal('chrome', { runtime: { lastError: null, sendMessage } });
    const { mod, shadow } = await openEditorWithSelection({
      sessionId: 'session-submit-failed',
      returnToPanel: true,
    });

    clickToolbarButton(shadow, 'button[data-action="chat"]');
    await flushToolbarAction();

    expect(sendMessage).toHaveBeenCalled();
    expect(mod.isScreenshotEditorMode()).toBe(false);
    expect(shadow.querySelector('.screenshot-editor')).toHaveStyle({ display: 'none' });
  });

  it('点击关闭按钮会按会话通知后台恢复 sidepanel', async () => {
    const sendMessage = vi.fn();
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const { shadow } = await openEditorWithSelection({
      sessionId: 'page-tool-screenshot-editor-close-test',
      returnToPanel: true,
    });

    clickToolbarButton(shadow, 'button[data-action="close"]');

    expect(sendMessage).toHaveBeenCalledWith(
      {
        type: 'page-tool/session/closed',
        payload: {
          sessionId: 'page-tool-screenshot-editor-close-test',
          tool: 'screenshot-editor',
          reason: 'close',
          returnToPanel: true,
          source: expect.objectContaining({ url: expect.any(String), title: expect.any(String) }),
        },
      },
      expect.any(Function),
    );
  });
});
