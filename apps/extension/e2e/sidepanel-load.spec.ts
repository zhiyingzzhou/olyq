/**
 * 说明：`sidepanel-load.spec` 源码模块。
 *
 * 职责：
 * - 承载 `sidepanel-load.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { test, expect, chromium } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MESSAGES_DB_NAME, MESSAGES_DB_STORE, MESSAGES_DB_VERSION } from '../src/lib/chat/messages-db';
import {
  captureForegroundApp,
  parseExtensionIdFromUrl,
  resolveExtensionDistDir,
  resolveHeadlessMode,
  restoreForegroundApp,
} from './runtime';

/**
 * 测试辅助函数：`mustExist`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function mustExist(p: string) {
  if (!fs.existsSync(p)) throw new Error(`路径不存在：${p}`);
}

/**
 * 测试辅助函数：`launchSidepanel`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
async function launchSidepanel(options?: { userDataDir?: string }) {
  const extPath = resolveExtensionDistDir({ browser: 'chromium', preferTestBuild: true });
  mustExist(extPath);
  mustExist(path.join(extPath, 'manifest.json'));

  const userDataDir = options?.userDataDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'olyq-e2e-load-'));
  if (options?.userDataDir) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }
  const foregroundApp = captureForegroundApp();
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: resolveHeadlessMode(),
    args: [
      `--disable-extensions-except=${extPath}`,
      `--load-extension=${extPath}`,
    ],
  });

  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const extensionId = parseExtensionIdFromUrl(sw.url());
  if (!extensionId) {
    await context.close();
    throw new Error(`无法解析 extensionId（serviceWorkerUrl=${sw.url()}）`);
  }

  const page = await context.newPage();
  page.on('domcontentloaded', () => {
    restoreForegroundApp(foregroundApp);
  });
  restoreForegroundApp(foregroundApp);
  return { context, page, extensionId, userDataDir };
}

/**
 * 测试辅助函数：`closeSidepanel`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
async function closeSidepanel(
  handle: Awaited<ReturnType<typeof launchSidepanel>>,
  options?: { preserveUserDataDir?: boolean },
) {
  await handle.context.close();
  if (options?.preserveUserDataDir) return;
  try {
    fs.rmSync(handle.userDataDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

/**
 * 测试辅助函数：`openWorkspaceInNewTabFromVisibleSidebar`。
 *
 * @remarks
 * 覆盖主工作区当前响应式契约：完整宽度下从常驻侧栏头部打开；窄宽度下先通过
 * mini rail 展开 floating 侧栏，再从同一侧栏头部打开。测试只模拟用户能看见并操作的
 * 入口，不绕过 `openCurrentWorkspaceInNewTab()` 的启动快照与消息 flush 语义。
 */
async function openWorkspaceInNewTabFromVisibleSidebar(
  page: Awaited<ReturnType<typeof launchSidepanel>>['page'],
  context: Awaited<ReturnType<typeof launchSidepanel>>['context'],
) {
  const miniRail = page.getByTestId('topic-sidebar-mini-rail');
  const sidebarScope = await miniRail.isVisible()
    ? page.getByTestId('topic-sidebar-floating-panel')
    : page.getByTestId('topic-sidebar-panel');

  if (await miniRail.isVisible()) {
    await page.getByTestId('topic-sidebar-rail-expand').click();
  }

  await expect(sidebarScope).toBeVisible({ timeout: 15_000 });
  const openButton = sidebarScope.getByRole('button', { name: '在新标签页打开' });
  await expect(openButton).toBeVisible({ timeout: 15_000 });

  const [newTab] = await Promise.all([
    context.waitForEvent('page'),
    openButton.click(),
  ]);
  await newTab.waitForLoadState('domcontentloaded');
  return newTab;
}

/**
 * 测试辅助函数：`setChromeLocalItems`。
 *
 * @remarks
 * 统一给扩展页测试写入 `chrome.storage.local` 真源，
 * 避免各个启动场景继续依赖过期的 raw localStorage 协议。
 */
async function setChromeLocalItems(
  page: Awaited<ReturnType<typeof launchSidepanel>>['page'],
  items: Record<string, unknown>,
) {
  await page.evaluate(async (nextItems) => {
    await new Promise<void>((resolve, reject) => {
      try {
        chrome.storage.local.set(nextItems, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }, items);
}

/**
 * 测试辅助函数：`writeBootstrapMirrorValue`。
 *
 * @remarks
 * 为启动前 boot.js 提供同源 mirror，确保测试同时覆盖：
 * - boot.js 的预应用路径；
 * - 启动快照回填后的最终首帧路径。
 */
async function writeBootstrapMirrorValue(
  page: Awaited<ReturnType<typeof launchSidepanel>>['page'],
  key: string,
  value: unknown,
) {
  await page.evaluate(({ nextKey, nextValue }) => {
    localStorage.setItem(`__olyq.bootstrap__.${nextKey}`, JSON.stringify({
      schemaVersion: 1,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      value: nextValue,
    }));
  }, { nextKey: key, nextValue: value });
}

/**
 * 测试辅助函数：`seedTopicStartup`。
 *
 * @remarks
 * 为 Side Panel 启动稳定性测试写入一份统一的话题启动场景；
 * 调用方只需要传入当前话题的消息数组，即可复用同一套 assistants/runtime/bootstrap seed。
 */
async function seedTopicStartup(
  page: Awaited<ReturnType<typeof launchSidepanel>>['page'],
  messages: Array<Record<string, unknown>>,
) {
  await page.evaluate(async ({ startupMessages, messagesDb }) => {
        /**
     * 测试辅助函数：`deleteDb`。
     *
     * @remarks
     * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
     */
    const deleteDb = (name: string) => new Promise<void>((resolve) => {
      try {
        const req = indexedDB.deleteDatabase(name);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      } catch {
        resolve();
      }
    });

        /**
     * 测试辅助函数：`putTopicRow`。
     *
     * @remarks
     * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
     */
    const putTopicRow = (id: string, messages: unknown[]) => new Promise<void>((resolve, reject) => {
      try {
        const req = indexedDB.open(messagesDb.name, messagesDb.version);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(messagesDb.store)) db.createObjectStore(messagesDb.store, { keyPath: 'id' });
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction([messagesDb.store], 'readwrite');
          tx.objectStore(messagesDb.store).put({ id, messages });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      } catch (error) {
        reject(error);
      }
    });

    try { localStorage.clear(); } catch { /* ignore */ }
    await deleteDb(messagesDb.name);

    const now = Date.now();
    const assistants = [
      {
        id: '__builtin_default__',
        name: '默认助手',
        emoji: '🤖',
        description: '默认 AI 助手',
        prompt: '你是一个有帮助的 AI 助手。',
        topics: [
          {
            id: 'topic-boot',
            assistantId: '__builtin_default__',
            name: '启动话题',
            createdAt: now,
            updatedAt: now,
            pinned: false,
            order: now,
            isNameManuallyEdited: false,
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
    ];
    const chatRuntime = {
      activeAssistantId: '__builtin_default__',
      activeTopicId: 'topic-boot',
    };
    const remediationMarker = {
      presetSet: 'olyq-browser-v1',
      appliedAt: now,
    };

    await new Promise<void>((resolve, reject) => {
      try {
        chrome.storage.local.set({
          'olyq.legal.preset-remediation.v1': remediationMarker,
          'olyq.language.v1': 'zh-CN',
          'olyq.theme.v1': 'dark',
          'olyq.assistants.v1': assistants,
          'olyq.chat.runtime.v1': chatRuntime,
        }, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
    localStorage.setItem('__olyq.bootstrap__.olyq.legal.preset-remediation.v1', JSON.stringify({
      schemaVersion: 1,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      value: remediationMarker,
    }));
    localStorage.setItem('__olyq.bootstrap__.olyq.language.v1', JSON.stringify({
      schemaVersion: 1,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      value: 'zh-CN',
    }));
    localStorage.setItem('__olyq.bootstrap__.olyq.theme.v1', JSON.stringify({
      schemaVersion: 1,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      value: 'dark',
    }));
    localStorage.setItem('__olyq.bootstrap__.olyq.assistants.v1', JSON.stringify({
      schemaVersion: 1,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      value: assistants,
    }));
    localStorage.setItem('__olyq.bootstrap__.olyq.chat.runtime.v1', JSON.stringify({
      schemaVersion: 1,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      value: chatRuntime,
    }));

    await putTopicRow('topic-boot', startupMessages);
  }, {
    startupMessages: messages,
    messagesDb: {
      name: MESSAGES_DB_NAME,
      version: MESSAGES_DB_VERSION,
      store: MESSAGES_DB_STORE,
    },
  });
}

/**
 * 测试辅助函数：`seedExistingTopic`。
 *
 * @remarks
 * 构造一个已有消息的话题，验证启动时不会退回空态或欢迎态。
 */
async function seedExistingTopic(page: Awaited<ReturnType<typeof launchSidepanel>>['page']) {
  const now = Date.now();
  await seedTopicStartup(page, [
    {
      id: 'user-boot',
      askId: 'ask-boot',
      role: 'user',
      content: 'Side panel startup probe',
      createdAt: now,
    },
    {
      id: 'assistant-boot',
      askId: 'ask-boot',
      role: 'assistant',
      modelId: 'openai/gpt-5.4',
      content: 'Restored message',
      status: 'success',
      createdAt: now + 1,
    },
  ]);
}

/**
 * 测试辅助函数：`seedExistingTopicWithCompareGroup`。
 *
 * @remarks
 * 构造一个同时包含普通消息和多模型分组消息的话题，
 * 用于覆盖 fresh host 首屏恢复时最容易被压坏的混合布局。
 */
async function seedExistingTopicWithCompareGroup(page: Awaited<ReturnType<typeof launchSidepanel>>['page']) {
  const now = Date.now();
  await seedTopicStartup(page, [
    {
      id: 'user-boot',
      askId: 'ask-boot',
      role: 'user',
      content: 'Side panel startup probe',
      createdAt: now,
    },
    {
      id: 'assistant-boot',
      askId: 'ask-boot',
      role: 'assistant',
      modelId: 'openai/gpt-5.4',
      content: 'Restored message',
      status: 'success',
      createdAt: now + 1,
    },
    {
      id: 'user-compare',
      askId: 'ask-compare',
      role: 'user',
      content: 'Compare startup layout',
      groupPrefs: {
        style: 'horizontal',
      },
      createdAt: now + 2,
    },
    {
      id: 'assistant-compare-a',
      askId: 'ask-compare',
      role: 'assistant',
      modelId: 'openai/gpt-5.4',
      content: 'Compare response A',
      status: 'success',
      createdAt: now + 3,
    },
    {
      id: 'assistant-compare-b',
      askId: 'ask-compare',
      role: 'assistant',
      modelId: 'anthropic/claude-3.7-sonnet',
      content: 'Compare response B',
      status: 'success',
      createdAt: now + 4,
    },
  ]);
}

/**
 * 测试辅助函数：`seedExistingTopicWithLongWrappedAssistant`。
 *
 * @remarks
 * 构造“长 assistant markdown + 下一条 user 消息”的真实回归场景，
 * 用来覆盖 reload 与宽度收窄时最容易出现的虚拟行高失真问题。
 */
async function seedExistingTopicWithLongWrappedAssistant(page: Awaited<ReturnType<typeof launchSidepanel>>['page']) {
  const now = Date.now();
  const longMarkdown = [
    '## 页面主旨',
    '',
    '- 当前页面是 Bootstrap 官网首页，核心信息是：Bootstrap 是一个“功能完整、可扩展”的前端工具包，用于快速搭建响应式网站。',
    '- 页面重点强调 4 个能力：快速接入、Sass 定制、CSS 变量扩展、无需 jQuery 的 JavaScript 插件。',
    '- 页面还补充推广了 `Bootstrap Icons`，说明它可以独立于 Bootstrap 使用。',
    '',
    '## 页面结构',
    '',
    '- 顶部导航：有 `Docs`、`Examples`、`Icons`、`Blog`，并带搜索框和版本切换。',
    '- Hero 首屏：主标题是 `Build fast, responsive sites with Bootstrap`。',
    '- 简介：介绍它支持 Sass、预置栅格和组件，以及 JavaScript 插件。',
    '- 快速操作：提供 `npm i bootstrap@5.3.8` 命令和 `Read the docs` 按钮。',
    '',
    '## 设计规范',
    '',
    '- 视觉目标：把 Bootstrap 表达成现代、易上手、可扩展的前端框架，视觉上兼顾技术感与亲和力。',
    '- 字重上，正文多为 `400`，重点按钮/标题常用 `500`、`600`。',
    '- 首屏主标题采用超大号黑体式粗字，形成强品牌锚点；正文则明显回归功能说明导向。',
    '- 页面整体是居中布局，最大内容宽度接近 `1378px`。',
    '- 结构上是典型的粘附导航 + Hero + 多个 section + 页脚。',
    '- section 间距较大，常见为 `24px / 48px / 96px`，说明它依赖充足留白建立层级。',
    '- 组件上大量使用浅灰底、细边框、小圆角、轻阴影，视觉更克制。',
    '- 页面不是纯平白底，而是带有柔和的大面积光晕/渐变背景。',
    '- `radius/md`：`6px`。',
    '- `type/body`：`16px / 24px`。',
    '- `space/section`：`48px` 到 `96px`。',
    '',
    '## 页面模式',
    '',
    '- 首屏：品牌图标 + 超大标题 + 简短说明 + 双 CTA。',
    '- 内容段落：大标题 + 描述 + 代码示例/图示。',
    '- 示例区：浅底卡片式代码框，突出“即拿即用”。',
    '- 底部：多列导航页脚，承接文档生态。',
    '',
    '## 补充说明',
    '',
    '- 这是一段额外补充说明，用来把回复继续拉长，模拟真实页面分析场景。'.repeat(16),
  ].join('\n');

  await seedTopicStartup(page, [
    {
      id: 'user-long',
      askId: 'ask-long',
      role: 'user',
      content: '请给我一份很长的 Markdown 说明。',
      createdAt: now,
    },
    {
      id: 'assistant-long',
      askId: 'ask-long',
      role: 'assistant',
      modelId: 'openai/gpt-5.4',
      content: longMarkdown,
      status: 'success',
      createdAt: now + 1,
    },
    {
      id: 'user-next',
      askId: 'ask-next',
      role: 'user',
      content: '这是下一条用户消息，用来验证不会被上一条长回复压住。',
      createdAt: now + 2,
    },
    {
      id: 'assistant-next',
      askId: 'ask-next',
      role: 'assistant',
      modelId: 'openai/gpt-5.4',
      content: '收到，这是下一条消息的回复。',
      status: 'success',
      createdAt: now + 3,
    },
  ]);
}

/**
 * 测试辅助函数：`seedExistingTopicWithTableAndMermaid`。
 *
 * @remarks
 * 构造一条同时包含 GFM 表格、普通 Mermaid 和宽 Gantt 图的历史 assistant 消息，
 * 用真实 sidepanel 页面验证 Markdown 可视块不会被 Typography 默认样式污染，且宽图不会被压成缩略图。
 */
async function seedExistingTopicWithTableAndMermaid(page: Awaited<ReturnType<typeof launchSidepanel>>['page']) {
  const now = Date.now();
  await seedTopicStartup(page, [
    {
      id: 'user-markdown-visual',
      askId: 'ask-markdown-visual',
      role: 'user',
      content: '渲染表格和 Mermaid。',
      createdAt: now,
    },
    {
      id: 'assistant-markdown-visual',
      askId: 'ask-markdown-visual',
      role: 'assistant',
      modelId: 'openai/gpt-5.4',
      content: [
        '## 可视块验证',
        '',
        '| 表达式 | 含义 |',
        '| --- | --- |',
        '| `.` | 任意单个字符（除换行） |',
        '| `\\d` | 数字，等价 `[0-9]` |',
        '',
        '```mermaid',
        'flowchart LR',
        '  A[输入] --> B{校验}',
        '  B -->|通过| C[渲染]',
        '  B -->|失败| D[源码]',
        '```',
        '',
        '```mermaid',
        'gantt',
        '  title Project Timeline',
        '  dateFormat  YYYY-MM-DD',
        '  axisFormat %Y-%m-%d',
        '  section Planning',
        '  Requirements       :done, req, 2025-08-01, 3d',
        '  Design             :active, design, after req, 5d',
        '  section Development',
        '  Backend            :backend, 2025-08-09, 7d',
        '  Frontend           :frontend, 2025-08-09, 6d',
        '  section Testing',
        '  Integration        :testing, 2025-08-16, 5d',
        '  Launch             :milestone, launch, 2025-08-21, 0d',
        '```',
      ].join('\n'),
      status: 'success',
      createdAt: now + 1,
    },
  ]);
}

/**
 * 测试辅助函数：`seedExistingTopicWithShortConversation`。
 *
 * @remarks
 * 构造一个“消息都很短、但估高偏保守”的低消息量场景，
 * 用来卡住“测量后仍沿用旧 totalSize / 旧 start”导致的中间和底部大空白。
 */
async function seedExistingTopicWithShortConversation(page: Awaited<ReturnType<typeof launchSidepanel>>['page']) {
  const now = Date.now();
  await seedTopicStartup(page, [
    {
      id: 'user-short-1',
      askId: 'ask-short-1',
      role: 'user',
      content: '你好',
      createdAt: now,
    },
    {
      id: 'assistant-short-1',
      askId: 'ask-short-1',
      role: 'assistant',
      modelId: 'openai/gpt-5.4',
      content: '收到。',
      status: 'success',
      createdAt: now + 1,
    },
    {
      id: 'user-short-2',
      askId: 'ask-short-2',
      role: 'user',
      content: '继续',
      createdAt: now + 2,
    },
    {
      id: 'assistant-short-2',
      askId: 'ask-short-2',
      role: 'assistant',
      modelId: 'openai/gpt-5.4',
      content: '好的。',
      status: 'success',
      createdAt: now + 3,
    },
  ]);
}

/**
 * 测试辅助函数：`seedEmptyTopic`。
 *
 * @remarks
 * 构造一个真正空消息的话题，验证欢迎态只会稳定出现一次。
 */
async function seedEmptyTopic(page: Awaited<ReturnType<typeof launchSidepanel>>['page']) {
  await seedTopicStartup(page, []);
}

/**
 * 测试辅助函数：`assertEmptyTopicReady`。
 *
 * @remarks
 * 空话题的完成态必须是欢迎态和可用输入区，而不是聊天 loading 壳。
 */
async function assertEmptyTopicReady(page: Awaited<ReturnType<typeof launchSidepanel>>['page']) {
  await expect(page.getByTestId('chat-area-loading')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: '欢迎开始新的话题' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('chat-input')).toBeEnabled();
  await expect(page.getByTestId('chat-send')).toBeVisible({ timeout: 15_000 });
}

/**
 * 测试辅助函数：`assertPromptAndMockReplyVisible`。
 *
 * @remarks
 * 验证 mock E2E 发送后的用户消息与 assistant 回显都已经进入当前宿主 transcript。
 */
async function assertPromptAndMockReplyVisible(
  page: Awaited<ReturnType<typeof launchSidepanel>>['page'],
  prompt: string,
) {
  await expect(page.getByText(prompt, { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(`你说：${prompt}`, { exact: false })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('chat-area-loading')).toHaveCount(0, { timeout: 15_000 });
}

/**
 * 测试辅助函数：`sendPromptAndWaitForMockReply`。
 *
 * @remarks
 * 使用真实 UI 输入区触发 mock chat stream，并等待当前宿主完成可见回显。
 */
async function sendPromptAndWaitForMockReply(
  page: Awaited<ReturnType<typeof launchSidepanel>>['page'],
  prompt: string,
) {
  await expect(page.getByTestId('chat-input')).toBeEnabled({ timeout: 15_000 });
  await page.getByTestId('chat-input').fill(prompt);
  await page.getByTestId('chat-send').click();
  await assertPromptAndMockReplyVisible(page, prompt);
}

/**
 * 测试辅助函数：`assertChatGeometryStable`。
 *
 * @remarks
 * 直接从真实页面采集普通消息行、消息 lane 和多模型分组的矩形，
 * 确保 fresh host 启动后不会出现互相覆盖、零宽高或列被压坏的情况。
 */
async function assertChatGeometryStable(
  page: Awaited<ReturnType<typeof launchSidepanel>>['page'],
  options?: { expectCompareGroup?: boolean },
) {
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
  await page.waitForTimeout(120);

  const geometry = await page.evaluate(() => {
    const messageRows = Array.from(document.querySelectorAll<HTMLElement>('[data-msg-id]'));
    const groupRows = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="message-group"]'));
    const topLevelRows = Array.from(document.querySelectorAll<HTMLElement>('[data-index]'))
      .filter((element) => Boolean(
        element.querySelector(':scope > [data-msg-id], :scope > [data-testid="message-group"], :scope > [data-testid="context-divider-row"]'),
      ));
    const orderedRows = topLevelRows
      .map((element, index) => {
        const rect = element.getBoundingClientRect();
        return {
          id: element.querySelector<HTMLElement>(':scope > [data-msg-id]')?.dataset.msgId
            || element.querySelector<HTMLElement>(':scope > [data-testid="message-group"]')?.getAttribute('data-testid')
            || element.querySelector<HTMLElement>(':scope > [data-testid="context-divider-row"]')?.getAttribute('data-testid')
            || `row-${index}`,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      })
      .sort((left, right) => left.top - right.top);

    const rowOverlaps: string[] = [];
    for (let index = 1; index < orderedRows.length; index += 1) {
      const previous = orderedRows[index - 1];
      const current = orderedRows[index];
      if (!previous || !current) continue;
      if (previous.bottom - current.top > 1) {
        rowOverlaps.push(`${previous.id}->${current.id}`);
      }
    }

    const laneCollisions = messageRows.flatMap((row) => {
      const avatar = row.firstElementChild as HTMLElement | null;
      const lane = row.querySelector<HTMLElement>('[data-testid^="message-lane-"]');
      if (!avatar || !lane) return [];

      const avatarRect = avatar.getBoundingClientRect();
      const laneRect = lane.getBoundingClientRect();
      const intersects = !(
        avatarRect.right <= laneRect.left + 1
        || laneRect.right <= avatarRect.left + 1
        || avatarRect.bottom <= laneRect.top + 1
        || laneRect.bottom <= avatarRect.top + 1
      );

      return [{
        id: row.dataset.msgId || '',
        intersects,
        laneWidth: laneRect.width,
        avatarWidth: avatarRect.width,
      }];
    });

    const zeroSizedRows = orderedRows.filter((row) => row.width <= 0 || row.height <= 0).map((row) => row.id);
    const horizontalColumns = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="message-group-horizontal-column"]'))
      .map((element, index) => {
        const rect = element.getBoundingClientRect();
        return {
          id: `column-${index}`,
          width: rect.width,
          height: rect.height,
        };
      });

    return {
      messageCount: messageRows.length,
      groupCount: groupRows.length,
      orderedRows,
      rowOverlaps,
      laneCollisions,
      zeroSizedRows,
      horizontalColumns,
    };
  });

  expect(geometry.messageCount).toBeGreaterThan(0);
  expect(geometry.rowOverlaps).toEqual([]);
  expect(geometry.zeroSizedRows).toEqual([]);
  expect(geometry.laneCollisions.filter((item) => item.intersects)).toEqual([]);

  if (options?.expectCompareGroup) {
    expect(geometry.groupCount).toBeGreaterThan(0);
    expect(geometry.horizontalColumns.length).toBeGreaterThan(0);
    expect(geometry.horizontalColumns.every((column) => column.width > 160 && column.height > 0)).toBe(true);
  }

  return geometry;
}

/**
 * 测试辅助函数：`assertOrderedRowsStrictlyIncreasing`。
 *
 * @remarks
 * 对顶层聊天行做严格顺序断言，确保每一行的 top/bottom 都单调递增，且没有相互覆盖。
 */
function assertOrderedRowsStrictlyIncreasing(rows: Array<{ id: string; top: number; bottom: number; height: number }>) {
  expect(rows.length).toBeGreaterThan(0);

  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    if (!previous || !current) continue;

    expect(current.top, `${previous.id} -> ${current.id} 的 top 应严格递增`).toBeGreaterThan(previous.top);
    expect(current.bottom, `${previous.id} -> ${current.id} 的 bottom 应严格递增`).toBeGreaterThan(previous.bottom);
    expect(current.top, `${previous.id} -> ${current.id} 不应重叠`).toBeGreaterThanOrEqual(previous.bottom - 1);
    expect(current.height, `${current.id} 不应出现零高度`).toBeGreaterThan(0);
  }
}

/**
 * 测试辅助函数：`assertVirtualListSpacingStable`。
 *
 * @remarks
 * 针对低消息量场景额外检查：
 * - 相邻顶层行之间不应留下异常大空洞；
 * - 最后一行到底部占位容器之间不应残留过期的大块空白。
 */
async function assertVirtualListSpacingStable(
  page: Awaited<ReturnType<typeof launchSidepanel>>['page'],
  options?: { maxRowGap?: number; maxTrailingGap?: number },
) {
  const maxRowGap = options?.maxRowGap ?? 120;
  const maxTrailingGap = options?.maxTrailingGap ?? 120;

  const spacing = await page.evaluate(() => {
    const contentRoot = document.querySelector<HTMLElement>('[data-testid="chat-virtual-content"]');
    const topLevelRows = Array.from(document.querySelectorAll<HTMLElement>('[data-index]'))
      .filter((element) => Boolean(
        element.querySelector(':scope > [data-msg-id], :scope > [data-testid="message-group"], :scope > [data-testid="context-divider-row"]'),
      ));
    const orderedRows = topLevelRows
      .map((element, index) => {
        const rect = element.getBoundingClientRect();
        return {
          id: element.querySelector<HTMLElement>(':scope > [data-msg-id]')?.dataset.msgId
            || element.querySelector<HTMLElement>(':scope > [data-testid="message-group"]')?.getAttribute('data-ask-id')
            || element.querySelector<HTMLElement>(':scope > [data-testid="context-divider-row"]')?.getAttribute('data-testid')
            || `row-${index}`,
          top: rect.top,
          bottom: rect.bottom,
        };
      })
      .sort((left, right) => left.top - right.top);

    const rowGaps = [];
    for (let index = 1; index < orderedRows.length; index += 1) {
      const previous = orderedRows[index - 1];
      const current = orderedRows[index];
      if (!previous || !current) continue;
      rowGaps.push({
        from: previous.id,
        to: current.id,
        gap: current.top - previous.bottom,
      });
    }

    const trailingGap = orderedRows.length > 0 && contentRoot
      ? contentRoot.getBoundingClientRect().bottom - orderedRows[orderedRows.length - 1]!.bottom
      : null;

    return {
      rowGaps,
      trailingGap,
    };
  });

  const excessiveGaps = spacing.rowGaps.filter((item) => item.gap > maxRowGap);
  expect(excessiveGaps).toEqual([]);
  if (typeof spacing.trailingGap === 'number') {
    expect(spacing.trailingGap).toBeLessThanOrEqual(maxTrailingGap);
  }

  return spacing;
}

test.describe('olyq SidePanel — 启动健壮性', () => {
  test('sidepanel 首屏可渲染（无致命 JS 报错）', async () => {
    const handle = await launchSidepanel();

    const errors: string[] = [];
    const logs: string[] = [];
    const consoleErrors: string[] = [];

    try {
      const { page, extensionId } = handle;

      page.on('pageerror', (err) => {
        const msg = `[pageerror] ${err?.message ?? String(err)}\n${err?.stack ?? ''}`.trim();
        errors.push(msg);
        // 输出到 stdout，便于 CI/本地快速定位
        console.log(msg);
      });

      page.on('console', (m) => {
        const text = `[console.${m.type()}] ${m.text()}`;
        logs.push(text);
        if (m.type() === 'error') {
          consoleErrors.push(text);
          console.log(text);
        }
      });

      await page.goto(`chrome-extension://${extensionId}/src/extension/sidepanel/index.html`, { waitUntil: 'domcontentloaded' });

      // 等首屏有内容：Side Panel 宿主的品牌由浏览器外壳展示，页面内以工作区控件作为 ready 信号。
      await expect(page.locator('#root')).toBeVisible();
      await expect(page.getByTestId('topic-sidebar-panel')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole('tab', { name: '助手' })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole('tab', { name: '话题' })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole('heading', { name: 'Olyq' })).toHaveCount(0);

      // 若页面在启动阶段抛异常，通常会导致首屏空白；这里直接把错误当作失败信号。
      expect(errors, `启动期出现页面异常：\n${errors.join('\n\n')}\n\nConsole:\n${logs.join('\n')}`).toHaveLength(0);
      expect(consoleErrors, `启动期出现控制台错误：\n${consoleErrors.join('\n\n')}`).toHaveLength(0);
    } finally {
      await closeSidepanel(handle);
    }
  });

  test('dark 主题会在首个 root mount 前完成预应用', async () => {
    const handle = await launchSidepanel();

    try {
      const { page, extensionId } = handle;
      const sidepanelUrl = `chrome-extension://${extensionId}/src/extension/sidepanel/index.html`;

      await page.goto(sidepanelUrl, { waitUntil: 'domcontentloaded' });
      await setChromeLocalItems(page, { 'olyq.theme.v1': 'dark' });
      await writeBootstrapMirrorValue(page, 'olyq.theme.v1', 'dark');

      await page.addInitScript(() => {
        const probe = {
          firstRootMount: null as null | {
            dark: boolean;
            htmlBg: string;
            bodyBg: string;
          },
        };
        (globalThis as typeof globalThis & { __olyqBootProbe?: typeof probe }).__olyqBootProbe = probe;

                /**
         * 测试辅助函数：`observeRoot`。
         *
         * @remarks
         * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
         */
        const observeRoot = () => {
          const root = document.getElementById('root');
          if (!root) return;
                    /**
           * 测试辅助函数：`mark`。
           *
           * @remarks
           * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
           */
          const mark = () => {
            if (root.childNodes.length === 0 || probe.firstRootMount) return;
            probe.firstRootMount = {
              dark: document.documentElement.classList.contains('dark'),
              htmlBg: getComputedStyle(document.documentElement).backgroundColor,
              bodyBg: getComputedStyle(document.body).backgroundColor,
            };
          };
          new MutationObserver(mark).observe(root, { childList: true, subtree: true });
          mark();
        };

        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', observeRoot, { once: true });
          return;
        }
        observeRoot();
      });

      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('topic-sidebar-panel')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole('tab', { name: '助手' })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole('heading', { name: 'Olyq' })).toHaveCount(0);

      const probe = await page.evaluate(() => {
        return (globalThis as typeof globalThis & {
          __olyqBootProbe?: {
            firstRootMount: null | {
              dark: boolean;
              htmlBg: string;
              bodyBg: string;
            };
          };
        }).__olyqBootProbe;
      });

      expect(probe?.firstRootMount?.dark).toBe(true);
      expect(probe?.firstRootMount?.htmlBg).not.toBe('rgb(255, 255, 255)');
      expect(probe?.firstRootMount?.bodyBg).not.toBe('rgb(255, 255, 255)');
    } finally {
      await closeSidepanel(handle);
    }
  });

  test('已有话题启动时不会短暂退回 selectOrCreate 空态', async () => {
    const handle = await launchSidepanel();

    try {
      const { page, extensionId } = handle;

      await page.goto(`chrome-extension://${extensionId}/src/extension/sidepanel/index.html`, { waitUntil: 'domcontentloaded' });
      await seedExistingTopic(page);

      await page.addInitScript(() => {
        const probe = { selectOrCreateSeen: false, welcomeSeen: false };
        (globalThis as typeof globalThis & { __olyqStartupProbe?: typeof probe }).__olyqStartupProbe = probe;

                /**
         * 测试辅助函数：`scan`。
         *
         * @remarks
         * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
         */
        const scan = () => {
          const text = document.body?.textContent || '';
          if (
            text.includes('chat.selectOrCreate')
            || text.includes('请选择或创建')
            || text.includes('select or create')
          ) {
            probe.selectOrCreateSeen = true;
          }
          if (
            text.includes('欢迎开始新的话题')
            || text.includes('Start a new conversation')
          ) {
            probe.welcomeSeen = true;
          }
        };

        new MutationObserver(scan).observe(document, {
          childList: true,
          subtree: true,
          characterData: true,
        });
        scan();
      });

      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: '启动话题' })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId('toolbar-model-picker')).toBeVisible({ timeout: 15_000 });

      const probe = await page.evaluate(() => {
        return (globalThis as typeof globalThis & {
          __olyqStartupProbe?: { selectOrCreateSeen: boolean; welcomeSeen: boolean };
        }).__olyqStartupProbe;
      });

      expect(probe?.selectOrCreateSeen).toBe(false);
      expect(probe?.welcomeSeen).toBe(false);
    } finally {
      await closeSidepanel(handle);
    }
  });

  test('已有消息在 fresh sidepanel、重新打开 sidepanel、以及打开到新标签页后都不会出现聊天布局挤压', async () => {
    const firstHandle = await launchSidepanel();
    const preservedUserDataDir = firstHandle.userDataDir;

    try {
      const { page, context, extensionId } = firstHandle;

      await page.goto(`chrome-extension://${extensionId}/src/extension/sidepanel/index.html`, { waitUntil: 'domcontentloaded' });
      await seedExistingTopicWithCompareGroup(page);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: '启动话题' })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId('toolbar-model-picker')).toBeVisible({ timeout: 15_000 });
      await assertChatGeometryStable(page, { expectCompareGroup: true });

      const newTab = await openWorkspaceInNewTabFromVisibleSidebar(page, context);
      await expect(newTab.getByTestId('topic-sidebar-panel')).toBeVisible({ timeout: 15_000 });
      await expect(newTab.getByRole('heading', { name: '启动话题' })).toBeVisible({ timeout: 15_000 });
      await assertChatGeometryStable(newTab, { expectCompareGroup: true });
    } finally {
      await closeSidepanel(firstHandle, { preserveUserDataDir: true });
    }

    const reopenedHandle = await launchSidepanel({ userDataDir: preservedUserDataDir });
    try {
      const { page, extensionId } = reopenedHandle;
      await page.goto(`chrome-extension://${extensionId}/src/extension/sidepanel/index.html`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: '启动话题' })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId('toolbar-model-picker')).toBeVisible({ timeout: 15_000 });
      await assertChatGeometryStable(page, { expectCompareGroup: true });
    } finally {
      await closeSidepanel(reopenedHandle);
    }
  });

  test('长 assistant 回复在 reload 后不会压住下一条 user，且顶层行矩形严格递增', async () => {
    const handle = await launchSidepanel();

    try {
      const { page, extensionId } = handle;
      await page.setViewportSize({ width: 760, height: 900 });
      await page.goto(`chrome-extension://${extensionId}/src/extension/sidepanel/index.html`, { waitUntil: 'domcontentloaded' });
      await seedExistingTopicWithLongWrappedAssistant(page);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: '启动话题' })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('这是下一条用户消息，用来验证不会被上一条长回复压住。')).toBeVisible({ timeout: 15_000 });

      const geometry = await assertChatGeometryStable(page);
      assertOrderedRowsStrictlyIncreasing(geometry.orderedRows);
      await assertVirtualListSpacingStable(page);

      const longAssistantRow = geometry.orderedRows.find((row) => row.id === 'assistant-long');
      const nextUserRow = geometry.orderedRows.find((row) => row.id === 'user-next');
      expect(longAssistantRow).toBeTruthy();
      expect(nextUserRow).toBeTruthy();
      expect(nextUserRow!.top).toBeGreaterThanOrEqual(longAssistantRow!.bottom - 1);
    } finally {
      await closeSidepanel(handle);
    }
  });

  test('Markdown 表格和 Mermaid 图表在真实 sidepanel 中保持紧凑清晰', async () => {
    const handle = await launchSidepanel();

    try {
      const { page, extensionId } = handle;
      await page.setViewportSize({ width: 900, height: 900 });
      await page.goto(`chrome-extension://${extensionId}/src/extension/sidepanel/index.html`, { waitUntil: 'domcontentloaded' });
      await seedExistingTopicWithTableAndMermaid(page);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: '启动话题' })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('可视块验证')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('[data-msg-id="assistant-markdown-visual"] .olyq-mermaid-inline-scroll')).toHaveCount(2, { timeout: 15_000 });

      const metrics = await page.evaluate(async () => {
        if (document.fonts?.ready) await document.fonts.ready;
        const row = document.querySelector<HTMLElement>('[data-msg-id="assistant-markdown-visual"]');
        const tableWrapper = row?.querySelector<HTMLElement>('.not-prose table')?.parentElement as HTMLElement | null;
        const table = row?.querySelector<HTMLElement>('.not-prose table');
        const thead = table?.querySelector<HTMLElement>('thead');
        const mermaidBlocks = Array.from(row?.querySelectorAll<HTMLElement>('.olyq-mermaid-inline-scroll') ?? []);
        const flowchartSvg = mermaidBlocks[0]?.querySelector<SVGSVGElement>('.olyq-mermaid-diagram svg') ?? null;
        const ganttScroll = mermaidBlocks[1] ?? null;
        const ganttSvg = ganttScroll?.querySelector<SVGSVGElement>('.olyq-mermaid-diagram svg') ?? null;
        const ganttTrigger = ganttScroll?.querySelector<HTMLElement>('.olyq-mermaid-inline-trigger') ?? null;
        const ganttHoverLayer = ganttTrigger?.querySelector<HTMLElement>('.olyq-mermaid-preview-hover-layer') ?? null;
        if (!row || !tableWrapper || !table || !thead || !flowchartSvg || !ganttScroll || !ganttSvg || !ganttTrigger || !ganttHoverLayer) return null;

        const wrapperRect = tableWrapper.getBoundingClientRect();
        const theadRect = thead.getBoundingClientRect();
        const flowchartRect = flowchartSvg.getBoundingClientRect();
        const ganttRect = ganttSvg.getBoundingClientRect();
        const ganttTriggerRect = ganttTrigger.getBoundingClientRect();
        const ganttHoverLayerRect = ganttHoverLayer.getBoundingClientRect();
        const computedTable = getComputedStyle(table);
        const computedGanttSvg = getComputedStyle(ganttSvg);
        const computedGanttTrigger = getComputedStyle(ganttTrigger);
        return {
          tableTopGap: theadRect.top - wrapperRect.top,
          tableMarginTop: computedTable.marginTop,
          tableBorderCollapse: computedTable.borderCollapse,
          flowchartWidth: flowchartRect.width,
          flowchartHeight: flowchartRect.height,
          flowchartViewBox: flowchartSvg.getAttribute('viewBox'),
          flowchartPreserveAspectRatio: flowchartSvg.getAttribute('preserveAspectRatio'),
          flowchartClass: flowchartSvg.getAttribute('class'),
          ganttClientWidth: ganttScroll.clientWidth,
          ganttScrollWidth: ganttScroll.scrollWidth,
          ganttWidth: ganttRect.width,
          ganttHeight: ganttRect.height,
          ganttOverflowX: getComputedStyle(ganttScroll).overflowX,
          ganttReadableWidth: computedGanttSvg.getPropertyValue('--olyq-mermaid-readable-width').trim(),
          ganttTriggerReadableWidth: computedGanttTrigger.getPropertyValue('--olyq-mermaid-readable-width').trim(),
          ganttMaxWidth: computedGanttSvg.maxWidth,
          ganttTriggerWidth: ganttTriggerRect.width,
          ganttHoverLayerWidth: ganttHoverLayerRect.width,
          ganttHoverLayerRightDelta: ganttHoverLayerRect.right - ganttRect.right,
        };
      });

      expect(metrics).toBeTruthy();
      expect(metrics!.tableTopGap).toBeLessThan(8);
      expect(metrics!.tableMarginTop).toBe('0px');
      expect(metrics!.tableBorderCollapse).toBe('collapse');
      expect(metrics!.flowchartWidth).toBeGreaterThan(320);
      expect(metrics!.flowchartHeight).toBeGreaterThan(120);
      expect(metrics!.flowchartViewBox).toMatch(/\d/);
      expect(metrics!.flowchartPreserveAspectRatio).toBe('xMidYMid meet');
      expect(metrics!.flowchartClass).toContain('olyq-mermaid-svg');
      expect(metrics!.ganttWidth).toBeGreaterThanOrEqual(720);
      expect(metrics!.ganttHeight).toBeGreaterThan(160);
      expect(metrics!.ganttScrollWidth).toBeGreaterThan(metrics!.ganttClientWidth);
      expect(metrics!.ganttOverflowX).toBe('auto');
      expect(metrics!.ganttReadableWidth).toMatch(/px$/);
      expect(metrics!.ganttTriggerReadableWidth).toMatch(/px$/);
      expect(metrics!.ganttMaxWidth).toBe('none');
      expect(metrics!.ganttTriggerWidth).toBeGreaterThanOrEqual(metrics!.ganttWidth - 1);
      expect(metrics!.ganttHoverLayerWidth).toBeGreaterThanOrEqual(metrics!.ganttWidth - 1);
      expect(metrics!.ganttHoverLayerRightDelta).toBeGreaterThanOrEqual(-1);
    } finally {
      await closeSidepanel(handle);
    }
  });

  test('长 assistant 回复从 sidepanel 打开到新标签页后，顶层行仍严格递增且不互相压住', async () => {
    const handle = await launchSidepanel();

    try {
      const { page, context, extensionId } = handle;
      await page.setViewportSize({ width: 760, height: 900 });
      await page.goto(`chrome-extension://${extensionId}/src/extension/sidepanel/index.html`, { waitUntil: 'domcontentloaded' });
      await seedExistingTopicWithLongWrappedAssistant(page);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: '启动话题' })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('这是下一条用户消息，用来验证不会被上一条长回复压住。')).toBeVisible({ timeout: 15_000 });

      const sidepanelGeometry = await assertChatGeometryStable(page);
      assertOrderedRowsStrictlyIncreasing(sidepanelGeometry.orderedRows);
      await assertVirtualListSpacingStable(page);

      const newTab = await openWorkspaceInNewTabFromVisibleSidebar(page, context);
      await expect(newTab.getByRole('heading', { name: '启动话题' })).toBeVisible({ timeout: 15_000 });
      await expect(newTab.getByText('这是下一条用户消息，用来验证不会被上一条长回复压住。')).toBeVisible({ timeout: 15_000 });

      const newTabGeometry = await assertChatGeometryStable(newTab);
      assertOrderedRowsStrictlyIncreasing(newTabGeometry.orderedRows);
      await assertVirtualListSpacingStable(newTab);

      const longAssistantRow = newTabGeometry.orderedRows.find((row) => row.id === 'assistant-long');
      const nextUserRow = newTabGeometry.orderedRows.find((row) => row.id === 'user-next');
      expect(longAssistantRow).toBeTruthy();
      expect(nextUserRow).toBeTruthy();
      expect(nextUserRow!.top).toBeGreaterThanOrEqual(longAssistantRow!.bottom - 1);
    } finally {
      await closeSidepanel(handle);
    }
  });

  test('sidepanel 收窄后长 markdown 会重新测量行高，不会复用旧尺寸', async () => {
    const handle = await launchSidepanel();

    try {
      const { page, extensionId } = handle;
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`chrome-extension://${extensionId}/src/extension/sidepanel/index.html`, { waitUntil: 'domcontentloaded' });
      await seedExistingTopicWithLongWrappedAssistant(page);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: '启动话题' })).toBeVisible({ timeout: 15_000 });

      const wideGeometry = await assertChatGeometryStable(page);
      const wideLongAssistantRow = wideGeometry.orderedRows.find((row) => row.id === 'assistant-long');
      expect(wideLongAssistantRow).toBeTruthy();

      await page.setViewportSize({ width: 560, height: 900 });
      await page.waitForTimeout(250);

      const narrowGeometry = await assertChatGeometryStable(page);
      assertOrderedRowsStrictlyIncreasing(narrowGeometry.orderedRows);
      await assertVirtualListSpacingStable(page);

      const narrowLongAssistantRow = narrowGeometry.orderedRows.find((row) => row.id === 'assistant-long');
      const nextUserRow = narrowGeometry.orderedRows.find((row) => row.id === 'user-next');
      expect(narrowLongAssistantRow).toBeTruthy();
      expect(nextUserRow).toBeTruthy();
      expect(narrowLongAssistantRow!.height).toBeGreaterThan((wideLongAssistantRow?.height ?? 0) + 40);
      expect(nextUserRow!.top).toBeGreaterThanOrEqual(narrowLongAssistantRow!.bottom - 1);
    } finally {
      await closeSidepanel(handle);
    }
  });

  test('短消息 reload 后不会残留过期虚拟高度，行间和底部都不应出现大空白', async () => {
    const handle = await launchSidepanel();

    try {
      const { page, extensionId } = handle;
      await page.setViewportSize({ width: 760, height: 900 });
      await page.goto(`chrome-extension://${extensionId}/src/extension/sidepanel/index.html`, { waitUntil: 'domcontentloaded' });
      await seedExistingTopicWithShortConversation(page);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: '启动话题' })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('好的。')).toBeVisible({ timeout: 15_000 });

      const geometry = await assertChatGeometryStable(page);
      assertOrderedRowsStrictlyIncreasing(geometry.orderedRows);
      await assertVirtualListSpacingStable(page, { maxRowGap: 96, maxTrailingGap: 96 });
    } finally {
      await closeSidepanel(handle);
    }
  });

  test('空话题启动时欢迎态只稳定出现一次', async () => {
    const handle = await launchSidepanel();

    try {
      const { page, extensionId } = handle;

      await page.goto(`chrome-extension://${extensionId}/src/extension/sidepanel/index.html`, { waitUntil: 'domcontentloaded' });
      await seedEmptyTopic(page);

      await page.addInitScript(() => {
        const probe = { welcomeMountCount: 0, lastVisible: false };
        (globalThis as typeof globalThis & { __olyqWelcomeProbe?: typeof probe }).__olyqWelcomeProbe = probe;

                /**
         * 测试辅助函数：`scan`。
         *
         * @remarks
         * 用于统计欢迎态从“不可见 -\> 可见”的挂载次数，确保空话题启动时只稳定出现一次。
         */
        const scan = () => {
          const text = document.body?.textContent || '';
          const visible = text.includes('欢迎开始新的话题') || text.includes('Start a new conversation');
          if (visible && !probe.lastVisible) probe.welcomeMountCount += 1;
          probe.lastVisible = visible;
        };

        new MutationObserver(scan).observe(document, {
          childList: true,
          subtree: true,
          characterData: true,
        });
        scan();
      });

      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: '欢迎开始新的话题' })).toBeVisible({ timeout: 15_000 });

      const probe = await page.evaluate(() => {
        return (globalThis as typeof globalThis & {
          __olyqWelcomeProbe?: { welcomeMountCount: number };
        }).__olyqWelcomeProbe;
      });

      expect(probe?.welcomeMountCount).toBe(1);
    } finally {
      await closeSidepanel(handle);
    }
  });

  test('空话题从 sidepanel 打开到新标签页后两边都不显示聊天 loading', async () => {
    const handle = await launchSidepanel();

    try {
      const { page, context, extensionId } = handle;

      await page.goto(`chrome-extension://${extensionId}/src/extension/sidepanel/index.html`, { waitUntil: 'domcontentloaded' });
      await seedEmptyTopic(page);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await assertEmptyTopicReady(page);

      const newTab = await openWorkspaceInNewTabFromVisibleSidebar(page, context);

      await assertEmptyTopicReady(page);
      await assertEmptyTopicReady(newTab);
    } finally {
      await closeSidepanel(handle);
    }
  });

  test('同一空话题在 sidepanel 与新标签页之间会同步后续消息', async () => {
    const handle = await launchSidepanel();

    try {
      const { page, context, extensionId } = handle;

      await page.goto(`chrome-extension://${extensionId}/src/extension/sidepanel/index.html`, { waitUntil: 'domcontentloaded' });
      await seedEmptyTopic(page);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await assertEmptyTopicReady(page);

      const newTab = await openWorkspaceInNewTabFromVisibleSidebar(page, context);
      await assertEmptyTopicReady(newTab);

      const fromNewTab = `sync-new-tab-${Date.now()}`;
      await sendPromptAndWaitForMockReply(newTab, fromNewTab);
      await assertPromptAndMockReplyVisible(page, fromNewTab);

      const fromSidepanel = `sync-sidepanel-${Date.now()}`;
      await sendPromptAndWaitForMockReply(page, fromSidepanel);
      await assertPromptAndMockReplyVisible(newTab, fromSidepanel);
    } finally {
      await closeSidepanel(handle);
    }
  });
});
