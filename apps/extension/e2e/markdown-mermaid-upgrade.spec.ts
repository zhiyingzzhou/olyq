/**
 * 说明：Markdown / Mermaid 依赖升级回归 E2E。
 *
 * 职责：
 * - 通过真实聊天 UI 和 E2E mock provider 渲染 Mermaid fenced block；
 * - 验证成功图表、源码切换、失败源码回退和横向溢出；
 * - 防止 Mermaid / Markdown / 代码高亮升级后把底层异常直接泄漏给用户。
 *
 * 边界：
 * - 本文件只覆盖聊天消息里的 Markdown 渲染结果；
 * - Mermaid 内部语法正确性和组件级细节由 `MarkdownMermaidBlock.spec.tsx` 继续覆盖。
 */
import { test, expect, type Page } from '@playwright/test';
import { closeExtension, launchExtension } from './extension';
import {
  attachStrictRuntimeMonitor,
  expectDocumentNoHorizontalOverflow,
  expectNoHorizontalOverflow,
} from './upgrade-regression-helpers';

/**
 * 通过聊天输入发送一条消息。
 *
 * @param page - 当前扩展页。
 * @param text - 消息文本。
 */
async function sendChatMessage(page: Page, text: string) {
  await page.getByTestId('chat-input').fill(text);
  await expect(page.getByTestId('chat-send')).toBeEnabled({ timeout: 10_000 });
  await page.getByTestId('chat-send').click();
}

/** 等待 E2E mock 回复完成。 */
async function waitForMockAnswer(page: Page) {
  await expect(page.getByText('（来自 E2E Mock）').last()).toBeVisible({ timeout: 45_000 });
}

test.describe('Markdown / Mermaid 升级回归', () => {
  test('宽 Mermaid 图表可渲染、可切源码且不产生页面溢出', async () => {
    const handle = await launchExtension();
    const monitor = attachStrictRuntimeMonitor(handle.context, handle.page);
    try {
      const { page } = handle;
      await page.setViewportSize({ width: 1200, height: 860 });

      await sendChatMessage(page, [
        '请原样展示这个 Mermaid 宽图：',
        '```mermaid',
        'flowchart LR',
        '  A[Very long start node with mixed 中文 English URL https://example.com/some/really/long/path/token-token-token] --> B[Middle analysis node]',
        '  B --> C[Decision node]',
        '  C --> D[Result node]',
        '  D --> E[Follow up node]',
        '```',
      ].join('\n'));
      await waitForMockAnswer(page);

      const block = page.getByTestId('markdown-mermaid-block').last();
      await expect(block).toBeVisible({ timeout: 20_000 });
      await expect(block).not.toContainText(/NaN|Error:/);
      await expect(block.getByTestId('markdown-mermaid-diagram')).toBeVisible({ timeout: 20_000 });
      await expectNoHorizontalOverflow(page.getByTestId('chat-scroll-root'), 'Mermaid 聊天滚动区');

      await block.getByTestId('markdown-mermaid-view-source').click();
      await expect(block.getByTestId('markdown-mermaid-source')).toContainText('flowchart LR');
      await expect(block.getByTestId('markdown-mermaid-source')).toContainText('Very long start node');

      await block.getByTestId('markdown-mermaid-view-diagram').click();
      await expect(block.getByTestId('markdown-mermaid-diagram')).toBeVisible({ timeout: 10_000 });
      await expectDocumentNoHorizontalOverflow(page, 'Mermaid 图表消息');
      monitor.assertNoIssues();
    } finally {
      await closeExtension(handle);
    }
  });

  test('Mermaid 失败态回退源码卡片，不泄漏底层 SVG/NaN 异常', async () => {
    const handle = await launchExtension();
    const monitor = attachStrictRuntimeMonitor(handle.context, handle.page);
    try {
      const { page } = handle;
      await page.setViewportSize({ width: 900, height: 760 });

      await sendChatMessage(page, [
        '请原样展示这个错误 Mermaid：',
        '```mermaid',
        'flowchart TD',
        '  A -->',
        '```',
      ].join('\n'));
      await waitForMockAnswer(page);

      const block = page.getByTestId('markdown-mermaid-block').last();
      await expect(block).toBeVisible({ timeout: 20_000 });
      await expect(block.getByTestId('markdown-mermaid-source')).toContainText('flowchart TD');
      await expect(block).not.toContainText(/NaN|Expected length|attribute x1|TypeError|SyntaxError/);
      await expectDocumentNoHorizontalOverflow(page, 'Mermaid 失败源码回退');
      monitor.assertNoIssues();
    } finally {
      await closeExtension(handle);
    }
  });
});
