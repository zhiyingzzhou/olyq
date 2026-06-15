/**
 * 说明：依赖升级后的核心 UI 几何回归。
 *
 * 职责：
 * - 覆盖 React 19 / React Router 7 / Tailwind 4 / Radix 组合下的主工作区、设置深链和常用 overlay；
 * - 用真实宽度、横向溢出和运行时 warning 断言替代人工截图穷举；
 * - 保护升级后最容易被样式或路由行为改坏的用户可见壳体。
 *
 * 边界：
 * - 本文件只验证核心壳体和导航交互；
 * - 业务数据生成、provider 出站和复杂聊天滚动由各自专项测试覆盖。
 */
import { test, expect, type Locator, type Page } from '@playwright/test';
import { closeExtension, launchExtension } from './extension';
import {
  attachStrictRuntimeMonitor,
  expectDocumentNoHorizontalOverflow,
  expectNoHorizontalOverflow,
  expectReadableWidth,
  expectVerticalGapBetween,
  openHashRoute,
  readVisibleBox,
} from './upgrade-regression-helpers';

const RESPONSIVE_WIDTHS = [360, 768, 1200] as const;

/**
 * 等待主聊天壳体完成首屏恢复。
 *
 * @param page - 当前扩展页。
 */
async function expectChatShellReady(page: Page) {
  await expect(page.getByTestId('chat-area-loading')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('chat-send')).toBeVisible({ timeout: 15_000 });
}

/**
 * 断言当前宽度下的主聊天侧栏布局符合工作区容器契约。
 *
 * @param page - 当前扩展页。
 * @param width - 当前视口宽度。
 */
async function expectChatSidebarMode(page: Page, width: number) {
  if (width >= 860) {
    await expect(page.getByTestId('topic-sidebar-panel')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('topic-sidebar-mini-rail')).toHaveCount(0);
    await expectReadableWidth(page.getByTestId('topic-sidebar-panel'), 220, '宽屏话题/助手侧栏');
    return;
  }

  await expect(page.getByTestId('topic-sidebar-mini-rail')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('topic-sidebar-panel')).toHaveCount(0);
  await page.getByTestId('topic-sidebar-rail-expand').click();
  await expect(page.getByTestId('topic-sidebar-floating-panel')).toBeVisible({ timeout: 10_000 });
  await expectReadableWidth(page.getByTestId('topic-sidebar-floating-panel'), Math.min(260, width - 48), '窄屏浮动侧栏');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('topic-sidebar-floating-panel')).toHaveCount(0);
}

/**
 * 断言 Paint 路由在当前视口下选择正确布局。
 *
 * @param page - 当前扩展页。
 * @param width - 当前视口宽度。
 */
async function expectPaintRouteGeometry(page: Page, width: number) {
  await openHashRoute(page, '/paint', 'paint-workspace');
  await expectNoHorizontalOverflow(page.getByTestId('paint-workspace'), `Paint ${width}px 工作区`);

  if (width >= 960) {
    await expect(page.getByTestId('paint-workspace')).toHaveAttribute('data-paint-layout', 'expanded');
    await expectReadableWidth(page.getByTestId('paint-settings'), 200, 'Paint 左侧设置栏');
    await expectReadableWidth(page.getByTestId('paint-history'), 200, 'Paint 右侧历史栏');
    await expectReadableWidth(page.getByTestId('paint-artboard'), 420, 'Paint 中央画板');
    return;
  }

  await expect(page.getByTestId('paint-workspace')).toHaveAttribute('data-paint-layout', 'compact');
  await expect(page.getByTestId('paint-expanded-panel-group')).toHaveCount(0);
  await expect(page.getByTestId('paint-main-workspace')).toBeVisible();
}

/**
 * 在页面或弹窗范围内定位表单 label。
 *
 * @param scope - 当前查找范围。
 * @param labelPattern - label 可见文案。
 * @returns 匹配到的 label locator。
 */
function formLabel(scope: Page | Locator, labelPattern: RegExp) {
  return scope.locator('label').filter({ hasText: labelPattern }).first();
}

/**
 * 断言 label 与紧随其后的字段控件保留真实垂直间距。
 *
 * @param scope - 当前查找范围。
 * @param labelPattern - label 可见文案。
 * @param description - 失败提示标签。
 */
async function expectLabelNextFieldGap(scope: Page | Locator, labelPattern: RegExp, description: string) {
  const label = formLabel(scope, labelPattern);
  const field = label.locator('xpath=following-sibling::*[1]');
  await expect(label, `${description} label 应可见`).toBeVisible();
  await expect(field, `${description} 字段应可见`).toBeVisible();
  await expectVerticalGapBetween(label, field, 6, description);
}

test.describe('依赖升级 UI 回归', () => {
  for (const width of RESPONSIVE_WIDTHS) {
    test(`核心页面在 ${width}px 下无溢出、深链可 reload`, async () => {
      const handle = await launchExtension();
      const monitor = attachStrictRuntimeMonitor(handle.context, handle.page);
      try {
        const { page } = handle;
        await page.setViewportSize({ width, height: 820 });

        await expectChatShellReady(page);
        await expectChatSidebarMode(page, width);
        await expectNoHorizontalOverflow(page.getByTestId('chat-scroll-root'), `聊天滚动区 ${width}px`);
        await expectDocumentNoHorizontalOverflow(page, `聊天页 ${width}px`);

        await openHashRoute(page, '/settings?tab=models', 'extension-settings-page');
        await expect(page.getByTestId('model-manager-layout')).toBeVisible({ timeout: 15_000 });
        await expectNoHorizontalOverflow(page.getByTestId('extension-settings-layout'), `设置页 ${width}px`);
        await expectDocumentNoHorizontalOverflow(page, `设置页 ${width}px`);

        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(page.getByTestId('extension-settings-page')).toBeVisible({ timeout: 15_000 });
        await expect(page.getByTestId('extension-settings-panel-models')).toBeVisible({ timeout: 15_000 });
        await expect(page.getByTestId('model-manager-layout')).toBeVisible({ timeout: 15_000 });
        await expectDocumentNoHorizontalOverflow(page, `设置深链 reload ${width}px`);

        await expectPaintRouteGeometry(page, width);
        await expectDocumentNoHorizontalOverflow(page, `Paint ${width}px`);
        monitor.assertNoIssues();
      } finally {
        await closeExtension(handle);
      }
    });
  }

  test('常用 overlay 可打开、可关闭且不触发 React/Radix warning', async () => {
    const handle = await launchExtension();
    const monitor = attachStrictRuntimeMonitor(handle.context, handle.page);
    try {
      const { page } = handle;
      await page.setViewportSize({ width: 1200, height: 860 });
      await expectChatShellReady(page);

      await page.getByTestId('toolbar-extension-settings').click();
      await expect(page.getByTestId('extension-settings-dialog')).toBeVisible({ timeout: 10_000 });
      await expectNoHorizontalOverflow(page.getByTestId('extension-settings-dialog'), '设置弹窗');
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('extension-settings-dialog')).toHaveCount(0);

      await page.getByTestId('toolbar-phrases').click();
      await expect(page.getByTestId('quick-phrase-list-panel')).toBeVisible({ timeout: 10_000 });
      await expectDocumentNoHorizontalOverflow(page, '快捷短语弹窗');
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('quick-phrase-list-panel')).toHaveCount(0);

      await page.getByTestId('toolbar-launchpad').click();
      await expect(page.getByTestId('launchpad-dialog')).toBeVisible({ timeout: 10_000 });
      await expectNoHorizontalOverflow(page.getByTestId('launchpad-dialog'), '启动台弹窗');
      await page.getByTestId('launchpad-target-store').click();
      await expect(page.getByTestId('assistant-store-dialog')).toBeVisible({ timeout: 10_000 });
      await expectNoHorizontalOverflow(page.getByTestId('assistant-store-dialog'), '助手商店弹窗');
      await page.getByTestId('assistant-store-dialog').getByRole('button', { name: /浏览器场景|Browser/ }).click();
      await expect(page.getByTestId('assistant-store-browser-grid')).toBeVisible({ timeout: 10_000 });
      await expectDocumentNoHorizontalOverflow(page, '助手商店弹窗');
      await page.keyboard.press('Escape');

      await page.getByTestId('toolbar-launchpad').click();
      await page.getByTestId('launchpad-target-files').click();
      await expect(page.getByRole('dialog', { name: /文件|Files/ })).toBeVisible({ timeout: 10_000 });
      await expectDocumentNoHorizontalOverflow(page, '文件弹窗');
      await page.keyboard.press('Escape');

      const chatInputBox = await readVisibleBox(page.getByTestId('chat-input'), '聊天输入框');
      expect(chatInputBox.width, `overlay 关闭后输入框应恢复可用宽度，当前宽度=${chatInputBox.width}`).toBeGreaterThan(420);
      monitor.assertNoIssues();
    } finally {
      await closeExtension(handle);
    }
  });

  test('设置表单 label 与字段在 Tailwind 4 下保留垂直间距', async () => {
    const handle = await launchExtension();
    const monitor = attachStrictRuntimeMonitor(handle.context, handle.page);
    try {
      const { page } = handle;
      await page.setViewportSize({ width: 1200, height: 860 });

      await openHashRoute(page, '/settings?tab=web-search', 'extension-settings-page');
      await expect(page.getByTestId('extension-settings-panel-web-search')).toBeVisible({ timeout: 15_000 });
      await expectLabelNextFieldGap(page, /搜索引擎|Search Engine/, '联网搜索搜索引擎字段');
      await expectLabelNextFieldGap(page, /网络目标|Network Targets/, '联网搜索网络目标字段');

      await openHashRoute(page, '/settings?tab=mcp', 'extension-settings-page');
      await expect(page.getByTestId('extension-settings-panel-mcp')).toBeVisible({ timeout: 15_000 });
      await page.getByRole('button', { name: /^(添加服务|Add server)$/ }).click();

      const dialog = page.getByRole('dialog', { name: /^(添加 MCP 服务|Add MCP Server)$/ });
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      await expectLabelNextFieldGap(dialog, /服务类型|Server type/, 'MCP 服务类型字段');
      await expectLabelNextFieldGap(dialog, /服务名称|Server name/, 'MCP 服务名称字段');
      await expectLabelNextFieldGap(dialog, /服务 URL|Server URL/, 'MCP 服务 URL 字段');
      await expectLabelNextFieldGap(dialog, /请求头（可选）|Headers \(optional\)/, 'MCP 请求头字段');

      await dialog.getByRole('button', { name: /^(JSON 模式|JSON mode)$/ }).click();
      await expectLabelNextFieldGap(dialog, /完整的 JSON 配置|Full JSON config/, 'MCP JSON 配置字段');

      monitor.assertNoIssues();
    } finally {
      await closeExtension(handle);
    }
  });
});
