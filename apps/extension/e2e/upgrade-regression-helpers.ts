/**
 * 说明：依赖升级回归 E2E 共享 helper。
 *
 * 职责：
 * - 为升级专项 E2E 提供严格 console / pageerror 监听；
 * - 提供跨视口几何和横向溢出断言；
 * - 保持断言贴近用户可见结果，而不是依赖组件内部实现。
 *
 * 边界：
 * - 本文件只服务 Playwright 测试；
 * - 不修改扩展运行时状态，不替代业务层单元测试。
 */
import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test';

type ExtensionServiceWorker = ReturnType<BrowserContext['serviceWorkers']>[number];

type StrictRuntimeIssue = {
  /** 问题来源。 */
  readonly source: 'page' | 'service-worker';
  /** 问题类型。 */
  readonly type: string;
  /** 问题文本。 */
  readonly text: string;
};

/** 严格运行时监听器。 */
export type StrictRuntimeMonitor = {
  /** 断言当前未捕获 console warning/error 或 pageerror。 */
  readonly assertNoIssues: () => void;
};

const ALLOWED_CONSOLE_MESSAGE_PATTERNS = [
  /Download the React DevTools/i,
];

/**
 * 判断 console 输出是否属于明确可忽略的开发提示。
 *
 * @param text - console 文本。
 * @returns 是否允许忽略。
 */
function isAllowedConsoleMessage(text: string) {
  return ALLOWED_CONSOLE_MESSAGE_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * 挂载严格运行时监听。
 *
 * @param context - Playwright persistent browser context。
 * @param page - 当前扩展页。
 * @returns 可在用例收尾处断言的 monitor。
 */
export function attachStrictRuntimeMonitor(context: BrowserContext, page: Page): StrictRuntimeMonitor {
  const issues: StrictRuntimeIssue[] = [];

  /**
   * 记录 page 或 service worker console 输出。
   *
   * @param source - 来源。
   * @param type - console 类型。
   * @param text - console 文本。
   */
  function recordConsole(source: StrictRuntimeIssue['source'], type: string, text: string) {
    if (type !== 'warning' && type !== 'error') return;
    if (isAllowedConsoleMessage(text)) return;
    issues.push({ source, type, text });
  }

  /**
   * 监听 MV3 Service Worker console。
   *
   * @param worker - 当前 Service Worker 实例。
   */
  function attachWorker(worker: ExtensionServiceWorker) {
    worker.on('console', (message) => {
      recordConsole('service-worker', message.type(), message.text());
    });
  }

  page.on('console', (message) => {
    recordConsole('page', message.type(), message.text());
  });
  page.on('pageerror', (error) => {
    issues.push({ source: 'page', type: 'pageerror', text: error.message });
  });

  for (const worker of context.serviceWorkers()) attachWorker(worker);
  context.on('serviceworker', attachWorker);

  return {
    assertNoIssues: () => {
      expect(issues).toEqual([]);
    },
  };
}

/**
 * 跳转到扩展 HashRouter 路由并等待目标锚点。
 *
 * @param page - 当前扩展页。
 * @param route - HashRouter 路由，例如 `/settings?tab=models`。
 * @param readyTestId - 目标页面 ready 锚点。
 */
export async function openHashRoute(page: Page, route: string, readyTestId: string) {
  await page.evaluate((nextRoute) => {
    window.location.hash = `#${nextRoute}`;
  }, route);
  await expect(page.getByTestId(readyTestId)).toBeVisible({ timeout: 15_000 });
}

/**
 * 读取元素布局盒。
 *
 * @param locator - 目标 locator。
 * @param label - 失败提示标签。
 * @returns 可测量的 bounding box。
 */
export async function readVisibleBox(locator: Locator, label: string) {
  const box = await locator.boundingBox();
  expect(box, `${label} 应存在可测量布局盒`).not.toBeNull();
  return box!;
}

/**
 * 断言元素没有横向溢出。
 *
 * @param locator - 目标元素。
 * @param label - 失败提示标签。
 */
export async function expectNoHorizontalOverflow(locator: Locator, label: string) {
  const overflow = await locator.evaluate((node) => ({
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth,
  }));
  expect(
    overflow.scrollWidth,
    `${label} 不应横向溢出：scrollWidth=${overflow.scrollWidth}, clientWidth=${overflow.clientWidth}`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

/**
 * 断言整个文档没有页面级横向滚动。
 *
 * @param page - 当前页面。
 * @param label - 失败提示标签。
 */
export async function expectDocumentNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body?.scrollWidth ?? 0,
  }));
  const maxScrollWidth = Math.max(overflow.scrollWidth, overflow.bodyScrollWidth);
  expect(
    maxScrollWidth,
    `${label} 不应产生页面级横向滚动：scrollWidth=${maxScrollWidth}, clientWidth=${overflow.clientWidth}`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

/**
 * 断言关键文本容器未被压成竖排窄条。
 *
 * @param locator - 目标元素。
 * @param minWidth - 最小可读宽度。
 * @param label - 失败提示标签。
 */
export async function expectReadableWidth(locator: Locator, minWidth: number, label: string) {
  const box = await readVisibleBox(locator, label);
  expect(box.width, `${label} 宽度异常，疑似被压成窄条：${box.width}`).toBeGreaterThanOrEqual(minWidth);
}

/**
 * 断言上下两个可见元素之间保留真实块轴间距。
 *
 * @param upper - 上方元素。
 * @param lower - 下方元素。
 * @param minGap - 最小可接受间距，单位 px。
 * @param label - 失败提示标签。
 */
export async function expectVerticalGapBetween(upper: Locator, lower: Locator, minGap: number, label: string) {
  const upperBox = await readVisibleBox(upper, `${label} 上方元素`);
  const lowerBox = await readVisibleBox(lower, `${label} 下方元素`);
  const gap = lowerBox.y - (upperBox.y + upperBox.height);
  expect(gap, `${label} 垂直间距异常：${gap}px`).toBeGreaterThanOrEqual(minGap);
}
