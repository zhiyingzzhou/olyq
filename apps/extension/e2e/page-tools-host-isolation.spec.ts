/**
 * 说明：page-facing content script 宿主隔离 E2E。
 *
 * 职责：
 * - 在真实 http fixture 页面里触发划词菜单；
 * - 验证网页工具只渲染在 Olyq Shadow DOM 内；
 * - 验证宿主页面全局变量、按钮样式和恶意 CSS 不会与扩展 UI 互相污染。
 *
 * 边界：
 * - 本文件不验证截图导出、OCR 或后台 page-tool session；
 * - 这些深层事务由 service worker / content plugin 单元测试和页面工具专项测试覆盖。
 */
import { test, expect, type Page } from '@playwright/test';
import http from 'node:http';
import { closeExtension, launchExtension } from './extension';
import {
  attachStrictRuntimeMonitor,
  expectDocumentNoHorizontalOverflow,
} from './upgrade-regression-helpers';

type FixtureServer = {
  /** Fixture 首页 URL。 */
  readonly url: string;
  /** 关闭本地 HTTP server。 */
  readonly close: () => Promise<void>;
};

const HOST_FIXTURE_HTML = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>Olyq page tools isolation fixture</title>
    <script>
      window.__olyqHostGlobalMarker = { stable: true };
    </script>
    <style>
      html, body { margin: 0; min-height: 100%; }
      body { font: 16px/1.6 system-ui, sans-serif; color: #111827; background: #f8fafc; }
      main { max-width: 760px; margin: 48px auto; padding: 24px; }
      button { background: rgb(185, 28, 28); color: white; border: 0; border-radius: 4px; padding: 8px 12px; writing-mode: horizontal-tb; }
      .chip { color: rgb(255, 0, 0) !important; background: rgb(254, 226, 226) !important; border-radius: 0 !important; }
    </style>
  </head>
  <body>
    <main>
      <h1>Host page</h1>
      <p id="target">Olyq selection target text for host isolation regression.</p>
      <button id="host-button" class="chip">Host button</button>
    </main>
  </body>
</html>`;

/** 启动本地 HTTP fixture。 */
async function startFixtureServer(): Promise<FixtureServer> {
  const server = http.createServer((_, response) => {
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    response.end(HOST_FIXTURE_HTML);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('无法解析 fixture server 端口');

  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    }),
  };
}

/**
 * 触发真实页面选区并等待 Olyq Shadow host。
 *
 * @param page - fixture 页面。
 */
async function triggerSelectionToolbar(page: Page) {
  await expect.poll(async () => {
    return await page.evaluate(() => {
      const target = document.querySelector('#target');
      if (!target) throw new Error('缺少 target 段落');

      const range = document.createRange();
      range.selectNodeContents(target);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: 220,
        clientY: 140,
      }));

      const host = document.querySelector('#__olyq_shadow_host__');
      const shadow = host?.shadowRoot;
      const menu = shadow?.querySelector<HTMLElement>('.menu');
      return Boolean(host && shadow && menu?.style.display === 'flex');
    });
  }, { timeout: 10_000 }).toBe(true);
}

/** 读取宿主页面与 Olyq Shadow DOM 的隔离指标。 */
async function readIsolationMetrics(page: Page) {
  return await page.evaluate(() => {
    const marker = (window as typeof window & { __olyqHostGlobalMarker?: { stable?: boolean }; Olyq?: unknown }).__olyqHostGlobalMarker;
    const hostButton = document.querySelector<HTMLElement>('#host-button');
    const host = document.querySelector('#__olyq_shadow_host__');
    const shadow = host?.shadowRoot;
    const shadowButton = shadow?.querySelector<HTMLElement>('.menu button[data-action="translate"]');
    const menu = shadow?.querySelector<HTMLElement>('.menu');
    const hostStyle = hostButton ? getComputedStyle(hostButton) : null;
    const shadowStyle = shadowButton ? getComputedStyle(shadowButton) : null;

    return {
      hostMarkerStable: marker?.stable === true,
      leakedGlobal: typeof (window as typeof window & { Olyq?: unknown }).Olyq !== 'undefined',
      hostTagName: host?.tagName.toLowerCase() ?? '',
      hostButtonBackground: hostStyle?.backgroundColor ?? '',
      hostButtonWritingMode: hostStyle?.writingMode ?? '',
      shadowButtonColor: shadowStyle?.color ?? '',
      shadowButtonWritingMode: shadowStyle?.writingMode ?? '',
      shadowMenuDisplay: menu?.style.display ?? '',
      shadowHostCount: document.querySelectorAll('#__olyq_shadow_host__').length,
      lightDomMenuCount: document.querySelectorAll('body > .menu, body > .response-card, body > .hide-panel').length,
    };
  });
}

test.describe('page tools 宿主隔离', () => {
  test('划词菜单只进入 Shadow DOM，且不污染宿主页面', async () => {
    const server = await startFixtureServer();
    const handle = await launchExtension();
    let hostPage: Page | null = null;

    try {
      hostPage = await handle.context.newPage();
      const extensionMonitor = attachStrictRuntimeMonitor(handle.context, handle.page);
      const hostMonitor = attachStrictRuntimeMonitor(handle.context, hostPage);
      await hostPage.goto(server.url, { waitUntil: 'domcontentloaded' });
      await triggerSelectionToolbar(hostPage);

      const metrics = await readIsolationMetrics(hostPage);
      expect(metrics.hostMarkerStable).toBe(true);
      expect(metrics.leakedGlobal).toBe(false);
      expect(metrics.hostTagName).toBe('olyq-shadow-host');
      expect(metrics.shadowHostCount).toBe(1);
      expect(metrics.lightDomMenuCount).toBe(0);
      expect(metrics.shadowMenuDisplay).toBe('flex');
      expect(metrics.hostButtonBackground).toBe('rgb(254, 226, 226)');
      expect(metrics.hostButtonWritingMode).toBe('horizontal-tb');
      expect(metrics.shadowButtonColor).not.toBe('rgb(255, 0, 0)');
      expect(metrics.shadowButtonWritingMode).toBe('horizontal-tb');
      await expectDocumentNoHorizontalOverflow(hostPage, 'page tools fixture');

      await hostPage.evaluate(() => {
        window.getSelection()?.removeAllRanges();
        document.body.dispatchEvent(new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX: 16,
          clientY: 16,
        }));
      });
      await expect.poll(async () => (await readIsolationMetrics(hostPage!)).shadowMenuDisplay).toBe('none');
      extensionMonitor.assertNoIssues();
      hostMonitor.assertNoIssues();
    } finally {
      await hostPage?.close().catch(() => undefined);
      await closeExtension(handle);
      await server.close();
    }
  });
});
