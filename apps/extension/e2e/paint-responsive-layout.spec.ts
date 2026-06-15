/**
 * 说明：`paint-responsive-layout.spec` 真实浏览器布局回归。
 *
 * 职责：
 * - 验证 Paint 工作台在 compact 宽度下不会把三栏硬挤到逐字换行；
 * - 验证配置 / 记录抽屉能承载原侧栏内容；
 * - 验证 expanded 宽度继续保留三栏与 resize handle。
 *
 * 边界：
 * - 本文件只验证 Paint UI 布局；
 * - 图片生成、附件上传、provider 参数出站仍由单元测试与背景链路测试覆盖。
 */
import { test, expect, type Locator, type Page } from '@playwright/test';
import { closeExtension, launchExtension } from './extension';

const LEGACY_PAINT_LAYOUT_STORAGE_KEY = 'react-resizable-panels:olyq:paint:layout:paint-settings:paint-artboard:paint-history';

const PAINT_EXPANDED_LAYOUT_STORAGE_KEY = 'react-resizable-panels:olyq:paint:layout.v2:paint-settings:paint-artboard:paint-history';

/**
 * 跳转到 Paint 路由并等待工作台挂载。
 *
 * @param page - 当前扩展页。
 */
async function openPaintWorkspace(page: Page) {
  await page.evaluate(() => {
    window.location.hash = '#/paint';
  });
  await expect(page.getByTestId('paint-workspace')).toBeVisible({ timeout: 15_000 });
}

/**
 * 读取 Paint 根工作区横向溢出信息。
 *
 * @param page - 当前扩展页。
 * @returns 工作区 client / scroll 宽度。
 */
async function readPaintOverflow(page: Page) {
  return await page.getByTestId('paint-workspace').evaluate((node) => ({
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth,
  }));
}

/**
 * 断言 Paint 工作区当前没有横向溢出。
 *
 * @param page - 当前扩展页。
 */
async function expectPaintWorkspaceNoHorizontalOverflow(page: Page) {
  const overflow = await readPaintOverflow(page);
  expect(
    overflow.scrollWidth,
    `Paint 工作区不应横向溢出：scrollWidth=${overflow.scrollWidth}, clientWidth=${overflow.clientWidth}`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

/**
 * 读取 locator 的可见几何盒。
 *
 * @param locator - 目标元素。
 * @param label - 失败时展示的元素说明。
 * @returns Playwright bounding box。
 */
async function readBox(locator: Locator, label: string) {
  const box = await locator.boundingBox();
  expect(box, `${label} 应该存在可测量布局盒`).not.toBeNull();
  return box!;
}

/**
 * 断言 expanded 三栏保持可读宽度。
 *
 * @param page - 当前扩展页。
 */
async function expectExpandedPaintColumnsReadable(page: Page) {
  const workspaceBox = await readBox(page.getByTestId('paint-workspace'), 'Paint 工作区');
  const settingsBox = await readBox(page.getByTestId('paint-settings'), 'Paint 左侧设置栏');
  const artboardBox = await readBox(page.getByTestId('paint-artboard'), 'Paint 中央画板');
  const historyBox = await readBox(page.getByTestId('paint-history'), 'Paint 右侧记录栏');
  const settingsPanelBox = await readBox(page.getByTestId('paint-settings-panel'), 'Paint 设置面板内容');
  const historyPanelBox = await readBox(page.getByTestId('paint-history-panel'), 'Paint 历史面板内容');

  expect(settingsBox.width, `左侧设置栏不应被压成窄条，当前宽度=${settingsBox.width}`).toBeGreaterThanOrEqual(200);
  expect(settingsPanelBox.width, `左侧设置内容不应泄漏到 0 宽面板，当前宽度=${settingsPanelBox.width}`).toBeGreaterThanOrEqual(190);
  expect(historyBox.width, `右侧记录栏不应被压成窄条，当前宽度=${historyBox.width}`).toBeGreaterThanOrEqual(200);
  expect(historyPanelBox.width, `右侧记录内容不应泄漏到 0 宽面板，当前宽度=${historyPanelBox.width}`).toBeGreaterThanOrEqual(190);
  expect(artboardBox.width, `中央画板应保留主要工作区宽度，当前宽度=${artboardBox.width}`).toBeGreaterThanOrEqual(480);
  expect(artboardBox.width, `中央画板不应吞掉全部三栏空间，当前宽度=${artboardBox.width}`).toBeLessThan(workspaceBox.width - 320);
}

/**
 * 写入升级前或坏布局状态，模拟用户本地已有异常持久化宽度。
 *
 * @param page - 当前扩展页。
 */
async function seedLegacyPaintLayout(page: Page) {
  await page.evaluate(({ legacyKey, currentKey }) => {
    localStorage.setItem(legacyKey, JSON.stringify({
      'paint-settings,paint-artboard,paint-history': { layout: [0, 100, 0] },
    }));
    localStorage.setItem(currentKey, JSON.stringify({
      'paint-settings,paint-artboard,paint-history': { layout: [0, 100, 0] },
    }));
  }, {
    legacyKey: LEGACY_PAINT_LAYOUT_STORAGE_KEY,
    currentKey: PAINT_EXPANDED_LAYOUT_STORAGE_KEY,
  });
}

test.describe('Paint 工作台响应式布局', () => {
  test('compact 宽度使用主画板加左右抽屉，不再渲染三栏', async () => {
    const handle = await launchExtension();
    try {
      const { page } = handle;
      await page.setViewportSize({ width: 560, height: 900 });
      await openPaintWorkspace(page);

      await expect(page.getByTestId('paint-workspace')).toHaveAttribute('data-paint-layout', 'compact');
      await expect(page.getByTestId('paint-main-workspace')).toBeVisible();
      await expect(page.getByTestId('paint-expanded-panel-group')).toHaveCount(0);
      await expectPaintWorkspaceNoHorizontalOverflow(page);

      await page.getByTestId('paint-toggle-settings').click();
      const settingsDrawer = page.getByTestId('paint-settings-drawer');
      await expect(settingsDrawer).toBeVisible();
      await expect(settingsDrawer.getByTestId('paint-settings-panel')).toBeVisible();
      await expect(settingsDrawer.getByText('模型与输出')).toBeVisible();
      await expect(settingsDrawer.getByRole('button', { name: /选择模型|Select model/ })).toBeVisible();
      await expectPaintWorkspaceNoHorizontalOverflow(page);

      await page.keyboard.press('Escape');
      await expect(settingsDrawer).toBeHidden();

      await page.getByTestId('paint-toggle-history').click();
      const historyDrawer = page.getByTestId('paint-history-drawer');
      await expect(historyDrawer).toBeVisible();
      await expect(historyDrawer.getByText(/暂无结果|No results yet/)).toBeVisible();
      await expectPaintWorkspaceNoHorizontalOverflow(page);
    } finally {
      await closeExtension(handle);
    }
  });

  test('expanded 宽度保留三栏和 resize handle', async () => {
    const handle = await launchExtension();
    try {
      const { page } = handle;
      await page.setViewportSize({ width: 1200, height: 900 });
      await openPaintWorkspace(page);

      await expect(page.getByTestId('paint-workspace')).toHaveAttribute('data-paint-layout', 'expanded');
      await expect(page.getByTestId('paint-expanded-panel-group')).toBeVisible();
      await expect(page.getByTestId('paint-left-resize-handle')).toBeVisible();
      await expect(page.getByTestId('paint-right-resize-handle')).toBeVisible();
      await expect(page.getByTestId('paint-settings-panel')).toBeVisible();
      await expect(page.getByTestId('paint-history-panel')).toBeVisible();
      await expect(page.getByText(/0 条记录|0 record/)).toBeVisible();
      await expect(page.getByTestId('paint-settings-drawer')).toHaveCount(0);
      await expect(page.getByTestId('paint-history-drawer')).toHaveCount(0);
      await expectExpandedPaintColumnsReadable(page);
      await expectPaintWorkspaceNoHorizontalOverflow(page);
    } finally {
      await closeExtension(handle);
    }
  });

  test('expanded 宽度忽略升级前坏布局并恢复默认三栏', async () => {
    const handle = await launchExtension();
    try {
      const { page } = handle;
      await page.setViewportSize({ width: 1200, height: 900 });
      await seedLegacyPaintLayout(page);
      await openPaintWorkspace(page);

      await expect(page.getByTestId('paint-workspace')).toHaveAttribute('data-paint-layout', 'expanded');
      await expectExpandedPaintColumnsReadable(page);
      await expectPaintWorkspaceNoHorizontalOverflow(page);
    } finally {
      await closeExtension(handle);
    }
  });

  test('expanded 宽度折叠左右栏时不泄漏侧栏内容', async () => {
    const handle = await launchExtension();
    try {
      const { page } = handle;
      await page.setViewportSize({ width: 1200, height: 900 });
      await openPaintWorkspace(page);

      await page.getByTestId('paint-toggle-settings').click();
      await expect(page.getByTestId('paint-settings-panel')).toHaveCount(0);
      let artboardBox = await readBox(page.getByTestId('paint-artboard'), '折叠左栏后的 Paint 中央画板');
      expect(artboardBox.width, `折叠左栏后中央画板应扩展，当前宽度=${artboardBox.width}`).toBeGreaterThanOrEqual(720);

      await page.getByTestId('paint-toggle-history').click();
      await expect(page.getByTestId('paint-history-panel')).toHaveCount(0);
      artboardBox = await readBox(page.getByTestId('paint-artboard'), '折叠双侧栏后的 Paint 中央画板');
      expect(artboardBox.width, `折叠双侧栏后中央画板应占主要宽度，当前宽度=${artboardBox.width}`).toBeGreaterThanOrEqual(1000);
      await expectPaintWorkspaceNoHorizontalOverflow(page);
    } finally {
      await closeExtension(handle);
    }
  });
});
