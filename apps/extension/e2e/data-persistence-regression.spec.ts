/**
 * 说明：依赖升级后的大内容持久化回归 E2E。
 *
 * 职责：
 * - 覆盖长消息、宽表格、长代码块和长 URL 在聊天区内的布局；
 * - 覆盖发送后的 IndexedDB 历史在 reload 后仍可恢复；
 * - 防止虚拟列表、Markdown Typography 或 Tailwind 升级后重新出现横向溢出。
 *
 * 边界：
 * - 本文件只验证本地 mock 聊天数据；
 * - WebDAV / S3 真实远端凭证链路不进入默认本地回归。
 */
import { test, expect, type Page } from '@playwright/test';
import { closeExtension, launchExtension } from './extension';
import {
  attachStrictRuntimeMonitor,
  expectDocumentNoHorizontalOverflow,
  expectNoHorizontalOverflow,
} from './upgrade-regression-helpers';

const LONG_REGRESSION_PROMPT = [
  '@layout-markdown',
  '请保留以下长内容形态，用于依赖升级回归：',
  '',
  '长 URL：https://example.com/deep/path/with/a/very-very-very-long-token-and-query-string?alpha=abcdefghijklmnopqrstuvwxyz&beta=012345678901234567890123456789',
  '',
  '| Column A with long title | Column B with long title | Column C with long title |',
  '| --- | --- | --- |',
  '| very-long-cell-value-abcdefghijklmnopqrstuvwxyz0123456789 | 中文英文混排内容需要换行而不是挤成竖排 | https://example.com/table/cell/long-long-long |',
  '',
  '```ts',
  'const extremelyLongToken = "abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789";',
  'export function regressionSmoke() {',
  '  return extremelyLongToken;',
  '}',
  '```',
].join('\n');

/**
 * 通过聊天 UI 发送大内容消息。
 *
 * @param page - 当前扩展页。
 */
async function sendLargeMessage(page: Page) {
  await page.getByTestId('chat-input').fill(LONG_REGRESSION_PROMPT);
  await expect(page.getByTestId('chat-send')).toBeEnabled({ timeout: 10_000 });
  await page.getByTestId('chat-send').click();
  await expect(page.getByText('页面主旨').last()).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText('（来自 E2E Mock）').last()).toBeVisible({ timeout: 45_000 });
}

test.describe('大内容持久化升级回归', () => {
  test('长 Markdown / 表格 / 代码块 reload 后仍恢复且不横向溢出', async () => {
    const handle = await launchExtension();
    const monitor = attachStrictRuntimeMonitor(handle.context, handle.page);
    try {
      const { page } = handle;
      await page.setViewportSize({ width: 360, height: 820 });
      await sendLargeMessage(page);

      await expectNoHorizontalOverflow(page.getByTestId('chat-scroll-root'), '发送后窄屏聊天滚动区');
      await expectDocumentNoHorizontalOverflow(page, '发送后窄屏聊天页');

      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('页面主旨').last()).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText('very-long-cell-value').last()).toBeVisible({ timeout: 20_000 });
      await expectNoHorizontalOverflow(page.getByTestId('chat-scroll-root'), 'reload 后窄屏聊天滚动区');
      await expectDocumentNoHorizontalOverflow(page, 'reload 后窄屏聊天页');

      await page.setViewportSize({ width: 1200, height: 860 });
      await expect(page.getByText('页面结构').last()).toBeVisible({ timeout: 10_000 });
      await expectNoHorizontalOverflow(page.getByTestId('chat-scroll-root'), '宽屏聊天滚动区');
      await expectDocumentNoHorizontalOverflow(page, '宽屏聊天页');
      monitor.assertNoIssues();
    } finally {
      await closeExtension(handle);
    }
  });
});
