/**
 * 说明：`page-style.spec` 内容脚本测试模块。
 *
 * 职责：
 * - 验证页面风格采样已切到单轮遍历 + 值归一化 + 失效缓存的新内核；
 * - 覆盖缓存命中、结构/主题/viewport 失效、颜色 canonicalization 与复杂 CSS 判断；
 * - 确保稀疏页面、长列表页面和组件密集页面仍保持现有字段形状与上限策略。
 *
 * 边界：
 * - 本文件只验证 content script 页面风格抽样，不覆盖 SW 截图编排；
 * - 测试运行在 jsdom 下，矩形与文档高度由受控 mock 提供，不依赖真实浏览器排版引擎。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type PageStyleModule = typeof import('./page-style');

const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
const originalInnerWidth = window.innerWidth;
const originalInnerHeight = window.innerHeight;
const originalScrollY = window.scrollY;
const originalPageYOffset = window.pageYOffset;
const originalClientWidth = document.documentElement.clientWidth;
const originalClientHeight = document.documentElement.clientHeight;

/**
 * 以浏览器原生序列化方式归一化测试里的颜色预期。
 *
 * @param value - 原始颜色值。
 * @returns 浏览器会输出的稳定颜色字符串。
 */
function canonicalizeTestColor(value: string): string {
  const serializer = document.createElement('span');
  serializer.style.color = '';
  serializer.style.color = value;
  return serializer.style.color.replace(/\s+/g, ' ').trim();
}

/**
 * 为测试元素注入稳定的矩形信息，供 `getBoundingClientRect()` mock 读取。
 *
 * @param selector - 目标元素选择器。
 * @param rect - 需要写入的矩形尺寸与位置。
 */
function setElementRect(selector: string, rect: { left: number; top: number; width: number; height: number }) {
  const element = document.querySelector(selector) as HTMLElement | null;
  if (!element) throw new Error(`missing element: ${selector}`);
  element.dataset.left = String(rect.left);
  element.dataset.top = String(rect.top);
  element.dataset.width = String(rect.width);
  element.dataset.height = String(rect.height);
}

/**
 * 设置当前视口尺寸。
 *
 * @param width - 视口宽度。
 * @param height - 视口高度。
 */
function setViewport(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    writable: true,
    value: height,
  });
  Object.defineProperty(document.documentElement, 'clientWidth', {
    configurable: true,
    value: width,
  });
  Object.defineProperty(document.documentElement, 'clientHeight', {
    configurable: true,
    value: height,
  });
}

/**
 * 设置当前页面的滚动位置。
 *
 * @param scrollY - 目标滚动值。
 */
function setScrollPosition(scrollY: number): void {
  Object.defineProperty(window, 'scrollY', {
    configurable: true,
    writable: true,
    value: scrollY,
  });
  Object.defineProperty(window, 'pageYOffset', {
    configurable: true,
    writable: true,
    value: scrollY,
  });
  Object.defineProperty(document.documentElement, 'scrollTop', {
    configurable: true,
    writable: true,
    value: scrollY,
  });
  Object.defineProperty(document.body, 'scrollTop', {
    configurable: true,
    writable: true,
    value: scrollY,
  });
}

/**
 * 设置文档高度相关的受控度量。
 *
 * @param documentHeight - 目标文档总高度。
 */
function setDocumentHeight(documentHeight: number): void {
  Object.defineProperty(document.body, 'scrollHeight', {
    configurable: true,
    value: documentHeight,
  });
  Object.defineProperty(document.body, 'offsetHeight', {
    configurable: true,
    value: documentHeight,
  });
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    configurable: true,
    value: documentHeight,
  });
  Object.defineProperty(document.documentElement, 'offsetHeight', {
    configurable: true,
    value: documentHeight,
  });
}

/**
 * 为特定元素覆写 `getComputedStyle()` 的部分属性，模拟真实浏览器对复杂值的序列化输出。
 *
 * @param selector - 目标元素选择器。
 * @param overrides - 需要覆写的 CSS 属性。
 */
function mockComputedStyleProperties(selector: string, overrides: Record<string, string>): void {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`missing element for computed style override: ${selector}`);

  const rawGetComputedStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((target: Element) => {
    const style = rawGetComputedStyle(target);
    if (target !== element) return style;

    const propertyDescriptors = Object.fromEntries(
      Object.entries(overrides).map(([propertyName, value]) => {
        const camelName = propertyName.replace(/-([a-z])/g, (_match, char: string) => char.toUpperCase());
        return [camelName, { value }];
      }),
    );

    return Object.create(style, {
      getPropertyValue: {
        value: (propertyName: string) => overrides[propertyName] ?? style.getPropertyValue(propertyName),
      },
      ...propertyDescriptors,
    });
  });
}

/**
 * 等待 MutationObserver 等微任务型失效标记完成。
 */
async function flushDomObservers(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

/**
 * 每个测试都重新加载内容脚本模块，避免模块级缓存串用。
 *
 * @returns 新导入的 page-style 模块。
 */
async function loadPageStyleModule(): Promise<PageStyleModule> {
  vi.resetModules();
  return import('./page-style');
}

/**
 * 统计 page-style 自身的抽样 TreeWalker 调用。
 *
 * @param spy - document.createTreeWalker spy。
 * @returns 以 body 为根、遍历 element 的抽样次数。
 */
function countPageStyleSamplingWalks(spy: { mock: { calls: Array<Parameters<typeof document.createTreeWalker>> } }): number {
  return spy.mock.calls.filter(([root, whatToShow]) => root === document.body && whatToShow === NodeFilter.SHOW_ELEMENT).length;
}

/**
 * 渲染默认的“营销落地页”样本。
 */
function renderFeatureRichPage(): void {
  document.title = 'Acme Landing';
  window.history.replaceState({}, '', '/landing');
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.style.backgroundColor = 'rgb(250, 248, 240)';
  document.body.className = '';
  document.body.setAttribute('style', [
    'background: rgb(250, 248, 240)',
    'color: rgb(34, 34, 34)',
    'font-family: Inter, sans-serif',
    'font-size: 16px',
    'line-height: 24px',
    'margin: 0',
  ].join('; '));
  document.body.innerHTML = `
    <nav id="nav" style="position: sticky; top: 0; background: rgba(255, 255, 255, 0.82); border-bottom: 1px solid rgb(220, 220, 220); box-shadow: 0 6px 24px rgba(0, 0, 0, 0.08);">
      <a id="nav-link" href="/work" style="color: rgb(92, 54, 214);">Work</a>
    </nav>
    <header id="hero" style="background-image: linear-gradient(135deg, rgb(255, 240, 230), rgb(248, 248, 255)); padding: 48px 0;">
      <h1 style="font-family: &quot;Playfair Display&quot;, serif; font-size: 56px; font-weight: 700;">Hero headline</h1>
      <h2 style="font-family: &quot;Playfair Display&quot;, serif; font-size: 32px; font-weight: 600;">Sub headline</h2>
      <p>Editorial introduction copy</p>
      <button id="primary-button" style="background: rgb(20, 120, 230); color: rgb(255, 255, 255); border-radius: 999px; font-size: 14px; font-weight: 600; box-shadow: 0 8px 24px rgba(20, 120, 230, 0.32);">Primary</button>
      <button style="background: rgb(42, 136, 242); color: rgb(255, 255, 255); border-radius: 999px; font-size: 14px; font-weight: 600; box-shadow: 0 8px 24px rgba(42, 136, 242, 0.32);">Secondary</button>
      <button style="background: rgb(64, 152, 248); color: rgb(255, 255, 255); border-radius: 999px; font-size: 14px; font-weight: 600; box-shadow: 0 8px 24px rgba(64, 152, 248, 0.32);">Third</button>
      <button style="background: rgb(86, 168, 252); color: rgb(255, 255, 255); border-radius: 999px; font-size: 14px; font-weight: 600; box-shadow: 0 8px 24px rgba(86, 168, 252, 0.32);">Fourth</button>
      <button style="background: rgb(108, 184, 255); color: rgb(255, 255, 255); border-radius: 999px; font-size: 14px; font-weight: 600; box-shadow: 0 8px 24px rgba(108, 184, 255, 0.32);">Fifth</button>
    </header>
    <main id="main" style="max-width: 1200px; margin: 0 auto;">
      <section id="feature-grid" style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; margin: 48px 0; padding: 48px 0;">
        <div class="card card-a" style="background: rgba(255, 255, 255, 0.86); border: 1px solid rgb(224, 224, 232); border-radius: 24px; box-shadow: 0 20px 48px rgba(15, 23, 42, 0.12); backdrop-filter: blur(18px);">Card A</div>
        <div class="card card-b" style="background: rgba(250, 252, 255, 0.92); border: 1px solid rgb(220, 225, 235); border-radius: 22px; box-shadow: 0 18px 40px rgba(15, 23, 42, 0.10);">Card B</div>
        <div class="card card-c" style="background: rgba(252, 247, 241, 0.96); border: 1px solid rgb(231, 224, 214); border-radius: 20px; box-shadow: 0 14px 36px rgba(120, 86, 40, 0.10);">Card C</div>
        <div class="card card-d" style="background: rgba(243, 247, 255, 0.96); border: 1px solid rgb(212, 221, 236); border-radius: 18px; box-shadow: 0 12px 32px rgba(32, 74, 135, 0.10);">Card D</div>
        <div class="card card-e" style="background: rgba(255, 250, 244, 0.98); border: 1px solid rgb(235, 222, 208); border-radius: 16px; box-shadow: 0 10px 28px rgba(123, 76, 42, 0.10);">Card E</div>
        <a id="learn-link" href="/learn" style="color: rgb(92, 54, 214);">Learn more</a>
        <input aria-label="Email" value="team@example.com" style="border: 1px solid rgb(220, 220, 220); border-radius: 12px; background: rgb(255, 255, 255);" />
        <span class="badge" style="background: rgb(235, 242, 255); color: rgb(46, 76, 145); border-radius: 999px;">New</span>
        <span id="semantic-pill" style="background: rgb(221, 236, 255); color: rgb(45, 70, 112); border-radius: 999px;">Invite-only</span>
        <div id="semantic-cta" style="display: inline-flex; align-items: center; justify-content: center; min-height: 44px; min-width: 180px; padding: 0 16px; background: rgb(18, 88, 182); color: rgb(255, 255, 255); border-radius: 16px;">Semantic CTA</div>
        <img id="hero-image" src="hero.png" alt="Hero visual" />
      </section>
      <section id="stories" style="margin: 56px 0; padding: 56px 0;">
        <article style="background: rgb(255, 255, 255); border-radius: 20px; box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);">Story card</article>
      </section>
    </main>
    <svg id="illustration-a"></svg>
    <svg id="illustration-b"></svg>
  `;

  setElementRect('#nav', { left: 120, top: 0, width: 1200, height: 72 });
  setElementRect('#hero', { left: 120, top: 72, width: 1200, height: 380 });
  setElementRect('#main', { left: 120, top: 460, width: 1200, height: 1200 });
  setElementRect('#feature-grid', { left: 120, top: 520, width: 1200, height: 520 });
  setElementRect('.card-a', { left: 120, top: 560, width: 360, height: 240 });
  setElementRect('.card-b', { left: 520, top: 560, width: 360, height: 240 });
  setElementRect('.card-c', { left: 920, top: 560, width: 360, height: 240 });
  setElementRect('.card-d', { left: 120, top: 840, width: 360, height: 220 });
  setElementRect('.card-e', { left: 520, top: 840, width: 360, height: 220 });
  setElementRect('#hero-image', { left: 920, top: 840, width: 420, height: 320 });
  setElementRect('input[aria-label="Email"]', { left: 920, top: 1180, width: 260, height: 44 });
  setElementRect('#semantic-pill', { left: 920, top: 1244, width: 132, height: 32 });
  setElementRect('#semantic-cta', { left: 920, top: 1292, width: 180, height: 44 });
  setElementRect('#stories', { left: 120, top: 1120, width: 1200, height: 360 });
  setElementRect('#illustration-a', { left: 0, top: 0, width: 32, height: 32 });
  setElementRect('#illustration-b', { left: 40, top: 0, width: 32, height: 32 });
}

/**
 * 渲染稀疏语义页面，验证缺少语义容器时也不会崩。
 */
function renderSparsePage(): void {
  document.title = 'Sparse Notes';
  window.history.replaceState({}, '', '/sparse');
  document.documentElement.removeAttribute('data-theme');
  document.body.className = '';
  document.body.setAttribute('style', [
    'background: rgb(255, 255, 255)',
    'color: rgb(30, 30, 30)',
    'font-family: Georgia, serif',
    'font-size: 18px',
    'line-height: 28px',
    'margin: 0',
  ].join('; '));
  document.body.innerHTML = `
    <div id="sparse-root" style="max-width: 720px; margin: 32px auto;">
      <div id="sparse-copy">Only a plain block of copy with one actionable link.</div>
      <a id="sparse-link" href="/detail" style="color: rgb(25, 96, 196);">Read details</a>
      <button id="sparse-button" style="background: rgb(25, 96, 196); color: rgb(255, 255, 255); border-radius: 12px;">Continue</button>
    </div>
  `;

  setElementRect('#sparse-root', { left: 160, top: 32, width: 720, height: 180 });
  setElementRect('#sparse-copy', { left: 160, top: 32, width: 680, height: 72 });
  setElementRect('#sparse-link', { left: 160, top: 124, width: 120, height: 24 });
  setElementRect('#sparse-button', { left: 160, top: 160, width: 140, height: 40 });
}

/**
 * 渲染长列表 + 组件密集页面，验证样本上限与 TreeWalker 限额下字段仍合法。
 */
function renderDensePage(): void {
  document.title = 'Dense Catalog';
  window.history.replaceState({}, '', '/dense');
  document.documentElement.setAttribute('data-theme', 'catalog');
  document.body.className = 'catalog-page';

  const buttonMarkup = Array.from({ length: 18 }, (_, index) => (
    `<button class="dense-button" style="background: rgb(${40 + index}, ${110 + index}, ${190 + index}); color: rgb(255, 255, 255); border-radius: 999px;">CTA ${index + 1}</button>`
  )).join('');
  const cardMarkup = Array.from({ length: 18 }, (_, index) => (
    `<li class="card dense-card-${index + 1}" style="background: rgba(255, 255, 255, 0.92); border: 1px solid rgb(220, 225, 235); border-radius: ${16 + (index % 4) * 2}px; box-shadow: 0 12px 32px rgba(15, 23, 42, 0.1);">Card ${index + 1}</li>`
  )).join('');
  const paragraphMarkup = Array.from({ length: 24 }, (_, index) => `<li>Dense copy block ${index + 1}</li>`).join('');

  document.body.setAttribute('style', [
    'background: rgb(245, 247, 251)',
    'color: rgb(20, 26, 38)',
    'font-family: Inter, sans-serif',
    'font-size: 16px',
    'line-height: 24px',
    'margin: 0',
  ].join('; '));
  document.body.innerHTML = `
    <main id="dense-main" style="max-width: 1280px; margin: 0 auto;">
      <section id="dense-hero" style="padding: 40px 0;">
        <h1>Catalog headline</h1>
        ${buttonMarkup}
      </section>
      <section id="dense-grid" style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px; margin: 32px 0;">
        <ul id="dense-cards" style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px;">${cardMarkup}</ul>
      </section>
      <section id="dense-list" style="margin: 40px 0;">
        <ul id="dense-copy">${paragraphMarkup}</ul>
      </section>
    </main>
  `;

  setElementRect('#dense-main', { left: 80, top: 24, width: 1280, height: 2600 });
  setElementRect('#dense-hero', { left: 80, top: 24, width: 1280, height: 300 });
  setElementRect('#dense-grid', { left: 80, top: 360, width: 1280, height: 1200 });
  setElementRect('#dense-cards', { left: 80, top: 360, width: 1280, height: 1200 });
  setElementRect('#dense-list', { left: 80, top: 1640, width: 1280, height: 800 });
  setElementRect('#dense-copy', { left: 80, top: 1640, width: 1280, height: 800 });

  Array.from(document.querySelectorAll('.dense-button')).forEach((element, index) => {
    setElementRect(`.dense-button:nth-of-type(${index + 1})`, {
      left: 80 + (index % 6) * 180,
      top: 96 + Math.floor(index / 6) * 48,
      width: 160,
      height: 36,
    });
  });

  Array.from(document.querySelectorAll('#dense-cards > li')).forEach((element, index) => {
    setElementRect(`#dense-cards > li:nth-of-type(${index + 1})`, {
      left: 80 + (index % 4) * 320,
      top: 400 + Math.floor(index / 4) * 220,
      width: 280,
      height: 180,
    });
  });
}

describe('page-style content script engine', () => {
  beforeEach(() => {
    setViewport(1440, 900);
    setScrollPosition(0);
    setDocumentHeight(2400);

    Element.prototype.getBoundingClientRect = function getBoundingClientRectMock() {
      const element = this as HTMLElement;
      const left = Number(element.dataset.left ?? 0);
      const top = Number(element.dataset.top ?? 0);
      const width = Number(element.dataset.width ?? 0);
      const height = Number(element.dataset.height ?? 0);

      return {
        x: left,
        y: top,
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        toJSON: () => undefined,
      } as DOMRect;
    };
  });

  afterEach(() => {
    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: originalInnerWidth });
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: originalInnerHeight });
    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: originalScrollY });
    Object.defineProperty(window, 'pageYOffset', { configurable: true, writable: true, value: originalPageYOffset });
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: originalClientWidth });
    Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, value: originalClientHeight });
    vi.restoreAllMocks();
    vi.resetModules();
    document.title = '';
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.cssText = '';
    document.body.className = '';
    document.body.style.cssText = '';
    document.body.innerHTML = '';
  });

  it('同页重复请求会命中内容脚本缓存，不重复整页抽样', async () => {
    renderFeatureRichPage();
    const createTreeWalkerSpy = vi.spyOn(document, 'createTreeWalker');
    const getComputedStyleSpy = vi.spyOn(window, 'getComputedStyle');
    const getBoundingClientRectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect');
    const pageStyle = await loadPageStyleModule();

    const firstSignals = pageStyle.extractPageStyleSignals();
    const coldGetComputedStyleCalls = getComputedStyleSpy.mock.calls.length;
    const coldGetBoundingClientRectCalls = getBoundingClientRectSpy.mock.calls.length;
    const secondSignals = pageStyle.extractPageStyleSignals();
    const metrics = pageStyle.extractPageStyleLayoutMetrics();

    expect(countPageStyleSamplingWalks(createTreeWalkerSpy)).toBe(1);
    expect(coldGetComputedStyleCalls).toBeGreaterThan(0);
    expect(coldGetBoundingClientRectCalls).toBeGreaterThan(0);
    expect(getComputedStyleSpy).toHaveBeenCalledTimes(coldGetComputedStyleCalls);
    expect(getBoundingClientRectSpy).toHaveBeenCalledTimes(coldGetBoundingClientRectCalls);
    expect(secondSignals).toEqual(firstSignals);
    expect(metrics.pageFingerprint).toBe(firstSignals.pageFingerprint);
    expect(metrics.scrollY).toBe(0);
  });

  it('返回给调用方的 signals 是防御性拷贝，不会污染内容脚本缓存', async () => {
    renderFeatureRichPage();
    const pageStyle = await loadPageStyleModule();

    const firstSignals = pageStyle.extractPageStyleSignals();
    firstSignals.page.borderColors.push('rgb(1, 2, 3)');
    firstSignals.samples.headings.push('Mutated heading');
    firstSignals.components.cardStyles.push('mutated-style');

    const secondSignals = pageStyle.extractPageStyleSignals();

    expect(secondSignals.page.borderColors).not.toContain('rgb(1, 2, 3)');
    expect(secondSignals.samples.headings).not.toContain('Mutated heading');
    expect(secondSignals.components.cardStyles).not.toContain('mutated-style');
  });

  it('DOM 结构和 class/theme 变化后会正确失效并重采样', async () => {
    renderFeatureRichPage();
    const createTreeWalkerSpy = vi.spyOn(document, 'createTreeWalker');
    const pageStyle = await loadPageStyleModule();

    const firstSignals = pageStyle.extractPageStyleSignals();
    document.body.className = 'theme-night';
    document.documentElement.setAttribute('data-theme', 'night');
    document.querySelector('#main')?.setAttribute('class', 'main shell');
    document.querySelector('#main')?.insertAdjacentHTML(
      'beforeend',
      '<section id="late-section" style="margin: 64px 0; padding: 64px 0;">Late section</section>',
    );
    setElementRect('#late-section', { left: 120, top: 1520, width: 1200, height: 240 });
    await flushDomObservers();

    const secondSignals = pageStyle.extractPageStyleSignals();

    expect(countPageStyleSamplingWalks(createTreeWalkerSpy)).toBe(2);
    expect(secondSignals.pageFingerprint).not.toBe(firstSignals.pageFingerprint);
    expect(secondSignals.layout.sectionCount).toBeGreaterThan(firstSignals.layout.sectionCount);
    expect(secondSignals.samples.sectionSelectors).toContain('section');
  });

  it('role/type/data-badge 等语义属性变化后会正确失效并重采样', async () => {
    renderFeatureRichPage();
    const createTreeWalkerSpy = vi.spyOn(document, 'createTreeWalker');
    const pageStyle = await loadPageStyleModule();

    const firstSignals = pageStyle.extractPageStyleSignals();
    (document.querySelector('#nav-link') as HTMLElement).setAttribute('role', 'button');
    (document.querySelector('#semantic-pill') as HTMLElement).setAttribute('data-badge', 'invite-only');
    (document.querySelector('input[aria-label="Email"]') as HTMLInputElement).setAttribute('type', 'hidden');
    await flushDomObservers();

    const secondSignals = pageStyle.extractPageStyleSignals();

    expect(countPageStyleSamplingWalks(createTreeWalkerSpy)).toBe(2);
    expect(secondSignals.components.buttonStyles.some((sample) => sample.includes('text:rgb(92, 54, 214)'))).toBe(true);
    expect(secondSignals.components.tagStyles).not.toEqual(firstSignals.components.tagStyles);
    expect(secondSignals.components.tagStyles.some((sample) => sample.includes('bg:rgb(221, 236, 255)'))).toBe(true);
    expect(secondSignals.components.inputStyles.length).toBeLessThan(firstSignals.components.inputStyles.length);
  });

  it('仅 viewport height 变化也会改变 fingerprint，并保持 metrics-only 读取不重采样', async () => {
    renderFeatureRichPage();
    const createTreeWalkerSpy = vi.spyOn(document, 'createTreeWalker');
    const getComputedStyleSpy = vi.spyOn(window, 'getComputedStyle');
    const getBoundingClientRectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect');
    const pageStyle = await loadPageStyleModule();

    const firstSignals = pageStyle.extractPageStyleSignals();
    const coldGetComputedStyleCalls = getComputedStyleSpy.mock.calls.length;
    const coldGetBoundingClientRectCalls = getBoundingClientRectSpy.mock.calls.length;
    setViewport(1440, 768);
    window.dispatchEvent(new Event('resize'));

    const resizedMetrics = pageStyle.extractPageStyleLayoutMetrics();

    expect(countPageStyleSamplingWalks(createTreeWalkerSpy)).toBe(1);
    expect(getComputedStyleSpy).toHaveBeenCalledTimes(coldGetComputedStyleCalls);
    expect(getBoundingClientRectSpy).toHaveBeenCalledTimes(coldGetBoundingClientRectCalls);
    expect(resizedMetrics.pageFingerprint).not.toBe(firstSignals.pageFingerprint);

    const resizedSignals = pageStyle.extractPageStyleSignals();

    expect(countPageStyleSamplingWalks(createTreeWalkerSpy)).toBe(2);
    expect(resizedSignals.pageFingerprint).toBe(resizedMetrics.pageFingerprint);
  });

  it('滚动只刷新 metrics；viewport 变化先标记布局脏，再在 signals 请求时重采样', async () => {
    renderFeatureRichPage();
    const createTreeWalkerSpy = vi.spyOn(document, 'createTreeWalker');
    const getComputedStyleSpy = vi.spyOn(window, 'getComputedStyle');
    const getBoundingClientRectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect');
    const pageStyle = await loadPageStyleModule();

    const firstSignals = pageStyle.extractPageStyleSignals();
    const coldGetComputedStyleCalls = getComputedStyleSpy.mock.calls.length;
    const coldGetBoundingClientRectCalls = getBoundingClientRectSpy.mock.calls.length;
    setScrollPosition(640);

    const scrolledMetrics = pageStyle.extractPageStyleLayoutMetrics();
    expect(countPageStyleSamplingWalks(createTreeWalkerSpy)).toBe(1);
    expect(getComputedStyleSpy).toHaveBeenCalledTimes(coldGetComputedStyleCalls);
    expect(getBoundingClientRectSpy).toHaveBeenCalledTimes(coldGetBoundingClientRectCalls);
    expect(scrolledMetrics.scrollY).toBe(640);
    expect(scrolledMetrics.pageFingerprint).toBe(firstSignals.pageFingerprint);

    setViewport(1024, 768);
    window.dispatchEvent(new Event('resize'));

    const resizedMetrics = pageStyle.extractPageStyleLayoutMetrics();
    expect(countPageStyleSamplingWalks(createTreeWalkerSpy)).toBe(1);
    expect(getComputedStyleSpy).toHaveBeenCalledTimes(coldGetComputedStyleCalls);
    expect(getBoundingClientRectSpy).toHaveBeenCalledTimes(coldGetBoundingClientRectCalls);
    expect(resizedMetrics.pageFingerprint).not.toBe(firstSignals.pageFingerprint);

    const resizedSignals = pageStyle.extractPageStyleSignals();
    expect(countPageStyleSamplingWalks(createTreeWalkerSpy)).toBe(2);
    expect(getComputedStyleSpy.mock.calls.length).toBeGreaterThan(coldGetComputedStyleCalls);
    expect(getBoundingClientRectSpy.mock.calls.length).toBeGreaterThan(coldGetBoundingClientRectCalls);
    expect(resizedSignals.pageFingerprint).toBe(resizedMetrics.pageFingerprint);
  });

  it('rgb / rgba / hsl / hex 等颜色写法会收敛到稳定输出', async () => {
    renderFeatureRichPage();
    document.body.style.background = 'hsl(40, 33%, 96%)';
    (document.querySelector('#nav-link') as HTMLElement).style.color = '#5c36d6';
    (document.querySelector('#learn-link') as HTMLElement).style.color = 'rgba(92, 54, 214, 1)';
    (document.querySelector('#primary-button') as HTMLElement).style.background = '#1478e6';
    (document.querySelector('.card-a') as HTMLElement).style.border = '0';
    (document.querySelector('.card-a') as HTMLElement).style.borderTop = '1px solid hsl(240, 10%, 90%)';

    const pageStyle = await loadPageStyleModule();
    const signals = pageStyle.extractPageStyleSignals();

    expect(signals.page.backgroundColor).toBe(canonicalizeTestColor('hsl(40, 33%, 96%)'));
    expect(signals.page.linkColor).toBe(canonicalizeTestColor('#5c36d6'));
    expect(signals.page.primaryButtonColor).toBe(canonicalizeTestColor('#1478e6'));
    expect(signals.page.borderColors).toContain(canonicalizeTestColor('hsl(240, 10%, 90%)'));
  });

  it('渐变、阴影、玻璃态和边框判断不再依赖脆弱字符串包含', async () => {
    renderFeatureRichPage();
    (document.querySelector('#hero') as HTMLElement).style.backgroundImage =
      'repeating-linear-gradient(135deg, rgba(255, 240, 230, 0.95) 0%, rgba(248, 248, 255, 0.88) 100%)';
    (document.querySelector('.card-a') as HTMLElement).style.background = 'rgba(255, 255, 255, 0.72)';
    (document.querySelector('.card-a') as HTMLElement).style.backdropFilter = 'saturate(180%) blur(18px)';
    (document.querySelector('.card-a') as HTMLElement).style.boxShadow =
      '0 20px 48px rgba(15, 23, 42, 0.12), inset 0 0 0 1px rgba(255, 255, 255, 0.24)';
    (document.querySelector('.card-a') as HTMLElement).style.borderTop = '1px solid hsl(220, 18%, 88%)';
    mockComputedStyleProperties('#hero', {
      'background-image': 'repeating-linear-gradient(135deg, rgba(255, 240, 230, 0.95) 0%, rgba(248, 248, 255, 0.88) 100%)',
    });

    const pageStyle = await loadPageStyleModule();
    const signals = pageStyle.extractPageStyleSignals();

    expect(signals.decoration.usesGradients).toBe(true);
    expect(signals.decoration.usesGlass).toBe(true);
    expect(signals.decoration.usesShadows).toBe(true);
    expect(signals.decoration.usesBorders).toBe(true);
    expect(signals.page.borderColors).toContain(canonicalizeTestColor('hsl(220, 18%, 88%)'));
    expect(signals.page.shadowSamples.some((sample) => sample.includes('inset'))).toBe(true);
  });

  it('稀疏语义页面仍能维持现有字段输出', async () => {
    renderSparsePage();
    const pageStyle = await loadPageStyleModule();
    const signals = pageStyle.extractPageStyleSignals();

    expect(signals.title).toBe('Sparse Notes');
    expect(signals.url).toContain('/sparse');
    expect(signals.page.backgroundColor).toBe('rgb(255, 255, 255)');
    expect(signals.layout.sectionCount).toBe(0);
    expect(signals.layout.cardGridHint).toBe('none');
    expect(Array.isArray(signals.components.buttonStyles)).toBe(true);
    expect(Array.isArray(signals.samples.sectionSelectors)).toBe(true);
    expect(signals.samples.headings).toEqual([]);
  });

  it('长列表和组件密集页面仍会保持样本上限与字段兼容', async () => {
    renderDensePage();
    setDocumentHeight(3200);
    const pageStyle = await loadPageStyleModule();
    const signals = pageStyle.extractPageStyleSignals();

    expect(signals.layout.sectionCount).toBeGreaterThanOrEqual(3);
    expect(signals.layout.cardGridHint).toBe('multi-column-grid');
    expect(signals.samples.headings.length).toBeLessThanOrEqual(8);
    expect(signals.components.buttonStyles.length).toBeLessThanOrEqual(4);
    expect(signals.components.cardStyles.length).toBeLessThanOrEqual(4);
    expect(signals.typography.fontWeights.length).toBeLessThanOrEqual(4);
    expect(signals.page.radiusSamples.length).toBeLessThanOrEqual(4);
  });
});
