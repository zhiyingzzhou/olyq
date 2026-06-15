/**
 * 说明：`playwright.config` 源码模块。
 *
 * 职责：
 * - 承载 `playwright.config` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    screenshot: 'only-on-failure',
    // 扩展 E2E 使用 persistent context；Playwright 在该模式下保留 trace 容易与上下文关闭顺序冲突。
    // 默认关闭，必要时可通过 `PW_EXTENSION_TRACE=1` 临时开启失败保留。
    trace: process.env.PW_EXTENSION_TRACE === '1' ? 'retain-on-failure' : 'off',
  },
});
