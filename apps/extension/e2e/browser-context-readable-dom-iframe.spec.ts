/**
 * 说明：browser-context iframe 正文采集 E2E。
 *
 * 职责：
 * - 用真实 Chromium 扩展上下文验证跨源 iframe 正文采集链路；
 * - 覆盖 Service Worker `webNavigation.getAllFrames`、`tabs.sendMessage({ frameId })`
 *   与 content script `all_frames` 静态注入的端到端协作。
 *
 * 边界：
 * - fixture 只使用本地两个不同端口模拟跨源，不访问真实第三方页面；
 * - 不测试聊天发送、截图或技术栈 source，这些由各自 E2E / 单测覆盖。
 */
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import http from 'node:http';
import { closeExtension, launchExtension } from './extension';

type FixtureServer = {
  /** 服务器 origin。 */
  readonly origin: string;
  /** 关闭本地 HTTP server。 */
  readonly close: () => Promise<void>;
};

/**
 * 启动单页 HTTP fixture server。
 *
 * @param body - 返回的 HTML。
 * @returns fixture server 信息。
 */
async function startHtmlServer(body: string): Promise<FixtureServer> {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    response.end(body);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('无法解析 fixture server 端口');

  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    }),
  };
}

/**
 * 从扩展页查询普通网页 tabId。
 *
 * @param sidepanelPage - 扩展 sidepanel 页面。
 * @param targetUrl - 目标网页 URL。
 * @returns 目标 tabId。
 */
async function queryTabIdForUrl(sidepanelPage: Page, targetUrl: string): Promise<number> {
  const tabId = await sidepanelPage.evaluate(async ({ url }) => {
    return await new Promise<number | null>((resolve, reject) => {
      chrome.tabs.query({}, (tabs) => {
        const detail = chrome.runtime.lastError?.message;
        if (detail) {
          reject(new Error(detail));
          return;
        }
        const tab = tabs.find((item) => item.url === url);
        resolve(typeof tab?.id === 'number' ? tab.id : null);
      });
    });
  }, { url: targetUrl });
  if (typeof tabId !== 'number') throw new Error(`无法定位目标 tab：${targetUrl}`);
  return tabId;
}

/**
 * 从扩展页请求 browser-context readable-dom。
 *
 * @param sidepanelPage - 扩展 sidepanel 页面。
 * @param tabId - 目标网页 tabId。
 * @returns 后台 readable-dom 响应。
 */
async function requestReadableDom(sidepanelPage: Page, tabId: number) {
  return await sidepanelPage.evaluate(async ({ targetTabId }) => {
    return await new Promise<unknown>((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'browser-context/readable-dom/get',
        payload: {
          tabId: targetTabId,
          intent: 'normal',
          stableWaitMs: 400,
        },
      }, (response) => {
        const detail = chrome.runtime.lastError?.message;
        if (detail) {
          reject(new Error(detail));
          return;
        }
        resolve(response);
      });
    });
  }, { targetTabId: tabId });
}

test.describe('browser-context iframe 正文采集', () => {
  const servers: FixtureServer[] = [];
  let handle: Awaited<ReturnType<typeof launchExtension>> | null = null;

  test.afterEach(async () => {
    if (handle) {
      await closeExtension(handle);
      handle = null;
    }
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  test('顶层正文不足时采集跨源可见 iframe 正文', async () => {
    const embeddedServer = await startHtmlServer(`<!doctype html>
      <html lang="en">
        <head><meta charset="utf-8" /><title>Embedded Article</title></head>
        <body>
          <main>
            <h1>Manage and simulate agentic workflows</h1>
            <div id="animated-shell" style="height:4px;width:120px;background:#111"></div>
            <p>We empower developers and technical teams to create, simulate, and manage AI-driven workflows visually.</p>
            <p>A drag-and-drop interface helps teams create, connect, and configure agents into logical workflows.</p>
            <p>Run agent workflows in a sandbox to preview behavior, debug logic, and test interactions before deployment.</p>
          </main>
          <script>
            let tick = 0;
            setInterval(() => {
              tick += 1;
              document.getElementById('animated-shell').style.transform = 'translateX(' + (tick % 8) + 'px)';
            }, 16);
          </script>
        </body>
      </html>`);
    servers.push(embeddedServer);

    const topServer = await startHtmlServer(`<!doctype html>
      <html lang="en">
        <head><meta charset="utf-8" /><title>Preview Shell</title></head>
        <body style="margin:0">
          <h1>Preview Shell</h1>
          <iframe
            src="${embeddedServer.origin}/"
            title="Embedded Article Preview"
            style="display:block;width:100vw;height:720px;border:0"
          ></iframe>
        </body>
      </html>`);
    servers.push(topServer);

    handle = await launchExtension();
    const target = await handle.context.newPage();
    const targetUrl = `${topServer.origin}/`;
    await target.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    await target.waitForLoadState('networkidle');

    const tabId = await queryTabIdForUrl(handle.page, targetUrl);
    const response = await requestReadableDom(handle.page, tabId);

    expect(response).toMatchObject({
      ok: true,
      payload: {
        sourceKind: 'embedded-frame',
        isTopFrame: false,
        frameUrl: `${embeddedServer.origin}/`,
      },
    });
    expect(JSON.stringify(response)).toContain('Manage and simulate agentic workflows');
  });
});
