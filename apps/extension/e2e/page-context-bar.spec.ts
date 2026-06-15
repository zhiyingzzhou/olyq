/**
 * 说明：`page-context-bar.spec` 真实浏览器布局回归。
 *
 * 职责：
 * - 用真实 Chromium 布局验证 PageContextBar 的容器查询降级；
 * - 固化宽屏 inline 控件与窄屏 overflow menu 的互斥关系；
 * - 覆盖状态摘要、更多按钮和自动上下文开关在窄宽下不横向溢出、不重叠。
 *
 * 边界：
 * - 本文件只验证 sidepanel UI 布局，不触发真实网页正文采集；
 * - browser-context 采集、权限与发送前预检仍由各自单元测试和 E2E 覆盖。
 */
import { test, expect, type Page } from '@playwright/test';
import { MESSAGES_DB_NAME, MESSAGES_DB_STORE, MESSAGES_DB_VERSION } from '../src/lib/chat/messages-db';
import { CHAT_RUNTIME_STORAGE_KEY, ASSISTANTS_STORAGE_KEY } from '../src/lib/legal/preset-remediation';
import type { Assistant } from '../src/types/assistant';
import { closeExtension, launchExtension } from './extension';

type PageContextLayoutRect = {
  readonly id: string;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
};

type SupportedFixtureLanguage = 'zh-CN' | 'en-US';

/**
 * 为 sidepanel 种入一个浏览器场景助手和启用自动上下文的话题。
 *
 * @param page - 当前扩展页。
 */
async function seedBrowserContextConversation(page: Page) {
  const now = 1_730_000_100_000;
  const topicId = 'topic-page-context-responsive';
  const assistant: Assistant = {
    id: 'assistant-page-context',
    scenario: 'browser',
    name: '页面上下文布局助手',
    description: '用于 PageContextBar 响应式布局回归',
    prompt: '你是一个用于布局回归的浏览器场景助手。',
    topics: [{
      id: topicId,
      assistantId: 'assistant-page-context',
      name: 'PageContextBar 响应式话题',
      createdAt: now,
      updatedAt: now,
      pinned: false,
      order: now,
      isNameManuallyEdited: true,
      browserContextMode: {
        enabled: true,
        fullPageEnabled: false,
        styleSignalsEnabled: false,
      },
    }],
    order: now,
    createdAt: now,
    updatedAt: now,
  };
  const runtime = {
    activeAssistantId: assistant.id,
    activeTopicId: topicId,
  };

  await page.evaluate(async ({ assistantSeed, runtimeSeed, topicKey, storageKeys, messagesDb }) => {
    const chromeApi = (globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome;
    const storage = chromeApi?.storage?.local;
    if (!storage?.set) throw new Error('chrome.storage.local 不可用');

    await new Promise<void>((resolve, reject) => {
      storage.set({
        [storageKeys.assistants]: [assistantSeed],
        [storageKeys.runtime]: runtimeSeed,
      }, () => {
        const message = chromeApi?.runtime?.lastError?.message;
        if (message) {
          reject(new Error(message));
          return;
        }
        resolve();
      });
    });

    /**
     * 在测试页 IndexedDB 中写入当前话题消息行。
     *
     * @returns IndexedDB 写入完成信号。
     */
    const putTopicMessages = () => new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(messagesDb.name, messagesDb.version);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(messagesDb.store)) db.createObjectStore(messagesDb.store, { keyPath: 'id' });
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction([messagesDb.store], 'readwrite');
        tx.objectStore(messagesDb.store).put({ id: topicKey, messages: [] });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
    await putTopicMessages();

    /**
     * 写入扩展启动快照镜像，保证 reload 首帧能恢复目标会话。
     *
     * @param key - 共享存储 key。
     * @param value - 要写入启动镜像的值。
     */
    const writeBootstrapMirror = (key: string, value: unknown) => {
      localStorage.setItem(`__olyq.bootstrap__.${key}`, JSON.stringify({
        schemaVersion: 1,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        value,
      }));
    };
    writeBootstrapMirror(storageKeys.assistants, [assistantSeed]);
    writeBootstrapMirror(storageKeys.runtime, runtimeSeed);
  }, {
    assistantSeed: assistant,
    runtimeSeed: runtime,
    topicKey: topicId,
    storageKeys: {
      assistants: ASSISTANTS_STORAGE_KEY,
      runtime: CHAT_RUNTIME_STORAGE_KEY,
    },
    messagesDb: {
      name: MESSAGES_DB_NAME,
      version: MESSAGES_DB_VERSION,
      store: MESSAGES_DB_STORE,
    },
  });
}

/**
 * 写入扩展页面语言，确保 E2E 可以覆盖英文长文案布局。
 *
 * @param page - 当前扩展页。
 * @param language - 目标 UI 语言。
 */
async function seedStoredLanguage(page: Page, language: SupportedFixtureLanguage) {
  await page.evaluate(async ({ nextLanguage }) => {
    const chromeApi = (globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome;
    const storage = chromeApi?.storage?.local;
    if (!storage?.set) throw new Error('chrome.storage.local 不可用');

    await new Promise<void>((resolve, reject) => {
      storage.set({ 'olyq.language.v1': nextLanguage }, () => {
        const message = chromeApi?.runtime?.lastError?.message;
        if (message) {
          reject(new Error(message));
          return;
        }
        resolve();
      });
    });
    localStorage.setItem('__olyq.bootstrap__.olyq.language.v1', JSON.stringify({
      schemaVersion: 1,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      value: nextLanguage,
    }));
  }, { nextLanguage: language });
}

/**
 * 在不改变外层 viewport 的情况下，给 PageContextBar 注入固定 inline-size。
 *
 * @param page - 当前扩展页。
 * @param width - 目标组件宽度。
 */
async function setPageContextBarFixtureWidth(page: Page, width: number) {
  await page.evaluate((nextWidth) => {
    const styleId = 'page-context-bar-width-fixture';
    let style = document.getElementById(styleId);
    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }
    style.textContent = `
      [data-testid="page-context-bar"] {
        inline-size: ${nextWidth}px !important;
        max-inline-size: ${nextWidth}px !important;
        align-self: flex-start !important;
      }
    `;
  }, width);

  await expect.poll(async () => (
    await page.getByTestId('page-context-bar').evaluate((node) => Math.round(node.getBoundingClientRect().width))
  )).toBe(width);
}

/**
 * 注入密集摘要夹具，用真实 DOM 布局压力覆盖隐藏截图、字数、profile、域名和技术栈入口同屏场景。
 *
 * @param page - 当前扩展页。
 */
async function injectDensePageContextSummaryFixture(page: Page) {
  await page.getByTestId('page-context-summary').evaluate((summary) => {
    const fixtureAttr = 'data-page-context-dense-fixture';
    summary.querySelectorAll(`[${fixtureAttr}="true"]`).forEach((node) => node.remove());

    const primary = summary.querySelector<HTMLElement>('.page-context-summary-primary');
    if (primary) {
      const title = primary.children.item(0) as HTMLElement | null;
      const subtitle = primary.children.item(1) as HTMLElement | null;
      if (title) title.textContent = 'GitHub';
      if (subtitle) subtitle.textContent = 'Full-page mode · 10441 chars injected';
    }

    /**
     * 创建与生产摘要徽标同类名的布局压力节点。
     *
     * @param className - 徽标类名。
     * @param text - 徽标文本。
     * @returns 可插入摘要行的徽标元素。
     */
    const createBadge = (className: string, text: string) => {
      const badge = document.createElement('span');
      badge.className = className;
      badge.setAttribute(fixtureAttr, 'true');
      const content = document.createElement('span');
      content.className = 'truncate';
      content.textContent = text;
      badge.append(content);
      return badge;
    };

    const profileBadge = createBadge(
      'page-context-profile-badge inline-flex min-w-0 max-w-[10rem] shrink rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground',
      'Lightweight Page',
    );
    const bodyBadge = createBadge(
      'page-context-body-badge inline-flex min-w-0 shrink rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary',
      '10441 chars',
    );
    const styleCaptureBadge = document.createElement('span');
    styleCaptureBadge.className = 'page-context-style-capture-badge inline-flex min-w-0 max-w-[16rem] shrink items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground';
    styleCaptureBadge.setAttribute(fixtureAttr, 'true');
    const cameraPlaceholder = document.createElement('span');
    cameraPlaceholder.className = 'h-3 w-3 shrink-0';
    cameraPlaceholder.setAttribute('aria-hidden', 'true');
    const styleCaptureText = document.createElement('span');
    styleCaptureText.className = 'truncate';
    styleCaptureText.textContent = '5 hidden screenshot(s) attached';
    styleCaptureBadge.append(cameraPlaceholder, styleCaptureText);

    const hostname = document.createElement('span');
    hostname.className = 'page-context-hostname min-w-0 max-w-[12rem] shrink truncate text-[10px] text-muted-foreground/70';
    hostname.setAttribute(fixtureAttr, 'true');
    hostname.textContent = 'github.com';

    summary.append(profileBadge, bodyBadge, styleCaptureBadge, hostname);
  });
}

/**
 * 判断元素是否在真实布局中可见。
 *
 * @param page - 当前扩展页。
 * @param testId - 目标 `data-testid`。
 * @returns 是否可见。
 */
async function isLayoutVisible(page: Page, testId: string) {
  return await page.getByTestId(testId).evaluate((node) => {
    const style = window.getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity) !== 0
      && rect.width > 0
      && rect.height > 0;
  });
}

/**
 * 判断 PageContextBar 内某个 selector 是否在真实布局中可见。
 *
 * @param page - 当前扩展页。
 * @param selector - PageContextBar 内部选择器。
 * @returns 是否可见。
 */
async function isPageContextSelectorVisible(page: Page, selector: string) {
  return await page.getByTestId('page-context-bar').evaluate((bar, targetSelector) => {
    const node = bar.querySelector<HTMLElement>(targetSelector);
    if (!node) return false;
    const style = window.getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity) !== 0
      && rect.width > 0
      && rect.height > 0;
  }, selector);
}

/**
 * 读取 PageContextBar 关键可见区域的几何信息。
 *
 * @param page - 当前扩展页。
 * @returns 状态条宽度与关键元素矩形。
 */
async function readPageContextBarLayout(page: Page) {
  return await page.getByTestId('page-context-bar').evaluate((bar) => {
    const selectors = [
      ['summary', '[data-testid="page-context-summary"]'],
      ['mode', '[data-testid="page-context-mode-group"]'],
      ['action', '[data-testid="page-context-action-group"]'],
      ['more', '[data-testid="page-context-compact-controls-trigger"]'],
      ['auto', '[data-testid="page-context-auto-group"]'],
      ['tech', '[data-testid="technology-stack-trigger"]'],
    ] as const;
    const rects: PageContextLayoutRect[] = [];

    for (const [id, selector] of selectors) {
      const node = bar.querySelector<HTMLElement>(selector);
      if (!node) continue;
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      const visible = style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity) !== 0
        && rect.width > 0
        && rect.height > 0;
      if (!visible) continue;
      rects.push({
        id,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      });
    }

    return {
      clientWidth: bar.clientWidth,
      scrollWidth: bar.scrollWidth,
      rects,
    };
  });
}

/**
 * 断言 PageContextBar 在当前宽度下没有横向溢出或关键元素重叠。
 *
 * @param page - 当前扩展页。
 */
async function expectPageContextBarLayoutStable(page: Page) {
  const layout = await readPageContextBarLayout(page);
  expect(layout.scrollWidth, `PageContextBar 不应横向溢出：scrollWidth=${layout.scrollWidth}, clientWidth=${layout.clientWidth}`)
    .toBeLessThanOrEqual(layout.clientWidth + 1);

  for (let leftIndex = 0; leftIndex < layout.rects.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < layout.rects.length; rightIndex += 1) {
      const left = layout.rects[leftIndex]!;
      const right = layout.rects[rightIndex]!;
      const overlaps = !(
        left.right <= right.left + 0.5
        || left.left >= right.right - 0.5
        || left.bottom <= right.top + 0.5
        || left.top >= right.bottom - 0.5
      );
      expect(overlaps, `${left.id} 不应与 ${right.id} 重叠`).toBe(false);
    }
  }
}

test.describe('PageContextBar 响应式布局', () => {
  test('宽屏保留模式和操作 label，更多按钮只在窄宽出现', async () => {
    const handle = await launchExtension();
    try {
      const { page } = handle;
      await page.setViewportSize({ width: 1200, height: 820 });
      await seedBrowserContextConversation(page);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('page-context-bar')).toBeVisible({ timeout: 15_000 });

      await setPageContextBarFixtureWidth(page, 1040);
      await expect(page.getByTestId('page-context-mode-group')).toContainText('模式');
      await expect(page.getByTestId('page-context-action-group')).toContainText('操作');
      await expect(page.getByTestId('page-context-auto-group')).toContainText('自动上下文');
      expect(await isLayoutVisible(page, 'page-context-mode-group')).toBe(true);
      expect(await isLayoutVisible(page, 'page-context-action-group')).toBe(true);
      expect(await isLayoutVisible(page, 'page-context-compact-controls-trigger')).toBe(false);
      await expectPageContextBarLayoutStable(page);

      await setPageContextBarFixtureWidth(page, 920);
      await expect(page.getByTestId('page-context-mode-group')).toContainText('模式');
      await expect(page.getByTestId('page-context-action-group')).toContainText('操作');
      await expect(page.getByTestId('page-context-auto-group')).toContainText('自动上下文');
      expect(await isLayoutVisible(page, 'page-context-mode-group')).toBe(true);
      expect(await isLayoutVisible(page, 'page-context-action-group')).toBe(true);
      expect(await isLayoutVisible(page, 'page-context-compact-controls-trigger')).toBe(false);
      await expectPageContextBarLayoutStable(page);

      await setPageContextBarFixtureWidth(page, 720);
      expect(await isLayoutVisible(page, 'page-context-mode-group')).toBe(true);
      expect(await isLayoutVisible(page, 'page-context-action-group')).toBe(true);
      expect(await isLayoutVisible(page, 'page-context-compact-controls-trigger')).toBe(false);
      await expectPageContextBarLayoutStable(page);
    } finally {
      await closeExtension(handle);
    }
  });

  test('窄宽隐藏 inline 模式和操作组，并用更多菜单承载次级操作', async () => {
    const handle = await launchExtension();
    try {
      const { page } = handle;
      await page.setViewportSize({ width: 1200, height: 820 });
      await seedBrowserContextConversation(page);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('page-context-bar')).toBeVisible({ timeout: 15_000 });

      for (const width of [520, 420, 360]) {
        await setPageContextBarFixtureWidth(page, width);
        expect(await isLayoutVisible(page, 'page-context-mode-group')).toBe(false);
        expect(await isLayoutVisible(page, 'page-context-action-group')).toBe(false);
        expect(await isLayoutVisible(page, 'page-context-compact-controls-trigger')).toBe(true);
        await expectPageContextBarLayoutStable(page);
      }

      await setPageContextBarFixtureWidth(page, 520);
      expect(await isLayoutVisible(page, 'page-context-auto-label')).toBe(true);

      await setPageContextBarFixtureWidth(page, 420);
      expect(await isLayoutVisible(page, 'page-context-auto-label')).toBe(false);
      await expect(page.getByTestId('page-context-enable-switch')).toBeVisible();

      await page.getByTestId('page-context-compact-controls-trigger').click();
      const menu = page.getByRole('menu');
      await expect(menu.getByText('全文')).toBeVisible();
      await expect(menu.getByText('风格')).toBeVisible();
      await expect(menu.getByText('刷新')).toBeVisible();
    } finally {
      await closeExtension(handle);
    }
  });

  test('英文长摘要和多徽标不会覆盖模式、操作和技术栈入口', async () => {
    const handle = await launchExtension();
    try {
      const { page } = handle;
      await page.setViewportSize({ width: 1200, height: 820 });
      await seedBrowserContextConversation(page);
      await seedStoredLanguage(page, 'en-US');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('page-context-bar')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId('page-context-mode-group')).toContainText('Mode');
      await expect(page.getByTestId('page-context-action-group')).toContainText('Actions');
      await expect(page.getByTestId('page-context-auto-group')).toContainText('Auto Context');
      await injectDensePageContextSummaryFixture(page);

      for (const width of [1060, 1040, 920, 720, 520, 420, 360]) {
        await setPageContextBarFixtureWidth(page, width);
        if (width > 680) {
          expect(await isLayoutVisible(page, 'page-context-mode-group')).toBe(true);
          expect(await isLayoutVisible(page, 'page-context-action-group')).toBe(true);
          expect(await isLayoutVisible(page, 'page-context-compact-controls-trigger')).toBe(false);
        } else {
          expect(await isLayoutVisible(page, 'page-context-mode-group')).toBe(false);
          expect(await isLayoutVisible(page, 'page-context-action-group')).toBe(false);
          expect(await isLayoutVisible(page, 'page-context-compact-controls-trigger')).toBe(true);
        }

        expect(await isPageContextSelectorVisible(page, '.page-context-style-capture-badge')).toBe(width > 1040);
        expect(await isPageContextSelectorVisible(page, '.page-context-technology-stack-trigger span')).toBe(width > 1040);
        await expectPageContextBarLayoutStable(page);
      }

      await setPageContextBarFixtureWidth(page, 520);
      await page.getByTestId('page-context-compact-controls-trigger').click();
      const menu = page.getByRole('menu');
      await expect(menu.getByText('Full-page')).toBeVisible();
      await expect(menu.getByText('Style')).toBeVisible();
      await expect(menu.getByText('Refresh')).toBeVisible();
    } finally {
      await closeExtension(handle);
    }
  });
});
