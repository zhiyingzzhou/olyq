/**
 * 说明：`global-search-jump.spec` 源码模块。
 *
 * 职责：
 * - 承载 `global-search-jump.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { test, expect } from '@playwright/test';
import { closeExtension, launchExtension } from './extension';

test.describe('olyq 全局搜索 — 打开到正确的话题', () => {
  test('从搜索结果「在对话中打开」应打开对应话题', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await expect(page.getByText('Olyq')).toBeVisible();

      const seed = Math.random().toString(16).slice(2);
      const firstTopicNeedle = `e2e-topic-a-${seed}`;
      const secondTopicNeedle = `e2e-topic-b-${seed}`;

      // 1) 创建第一个话题并发一条包含唯一关键词的消息
      await page.getByRole('button', { name: '新建话题' }).click();
      await page.getByTestId('chat-input').fill(firstTopicNeedle);
      await page.getByTestId('chat-send').click();
      await expect(page.getByText(firstTopicNeedle, { exact: true })).toBeVisible();

      // 2) 创建第二个话题并发一条包含唯一关键词的消息
      await page.getByRole('button', { name: '新建话题' }).click();
      await page.getByTestId('chat-input').fill(secondTopicNeedle);
      await page.getByTestId('chat-send').click();
      await expect(page.getByText(secondTopicNeedle, { exact: true })).toBeVisible();

            /**
       * 测试辅助函数：`openFromGlobalSearch`。
       *
       * @remarks
       * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
       */
      const openFromGlobalSearch = async (needle: string) => {
        await page.getByTestId('toolbar-global-search').click();

        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();

        const input = dialog.getByPlaceholder('搜索所有话题…');
        await input.fill(needle);
        await input.press('Enter');

        const result = dialog.locator('button').filter({ hasText: needle }).first();
        await expect(result).toBeVisible({ timeout: 15_000 });
        await result.click();

        await expect(dialog.getByRole('button', { name: '在对话中打开' })).toBeVisible();
        await dialog.getByRole('button', { name: '在对话中打开' }).click();

        await expect(page.getByRole('dialog')).toHaveCount(0);

        // 关键断言：主聊天仍停留在话题体系
        await expect(page.getByRole('button', { name: '新建话题' })).toBeVisible();

        // 关键断言：聊天区应能看到目标消息
        await expect(page.getByText(needle, { exact: true })).toBeVisible();
      };

      await openFromGlobalSearch(secondTopicNeedle);
      await openFromGlobalSearch(firstTopicNeedle);
    } finally {
      await closeExtension(h);
    }
  });
});
