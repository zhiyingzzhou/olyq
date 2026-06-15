/**
 * 说明：`chat-dialog.spec` 源码模块。
 *
 * 职责：
 * - 承载 `chat-dialog.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { test, expect, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { buildModelRegistry } from '../src/lib/ai/model-registry/merge';
import type { MetadataEvidence } from '../src/lib/ai/model-registry/types';
import type { ProviderConfig } from '../src/lib/ai/types';
import { MESSAGES_DB_NAME, MESSAGES_DB_STORE, MESSAGES_DB_VERSION } from '../src/lib/chat/messages-db';
import type { Assistant } from '../src/types/assistant';
import { closeExtension, launchExtension, seedAssistantsInExtension, seedMcpServersInExtension, seedModelRegistryInExtension, seedProvidersInExtension } from './extension';

const DEEPSEEK_V32_FETCHED_AT = '2026-04-01T00:00:00.000Z';
const E2E_MEMORY_CONFIG_STORAGE_KEY = 'olyq.memory.config.v1';

const DEEPSEEK_V32_PROVIDER: ProviderConfig = {
  id: 'siliconflow',
  name: 'SiliconFlow',
  type: 'siliconflow',
  apiKey: '',
  apiHost: 'https://api.siliconflow.cn/v1',
  enabled: true,
  models: [
    {
      id: 'siliconflow/deepseek-v3.2',
      name: 'DeepSeek V3.2',
      group: 'Chat',
      isDefault: true,
    },
  ],
};

const RESPONSIVE_MODEL_MANAGER_PROVIDER: ProviderConfig = {
  id: 'openai',
  name: 'OpenAI',
  type: 'openai-response',
  apiKey: '',
  apiHost: 'https://api.openai.com/v1',
  enabled: true,
  models: [
    { id: 'gpt-5.4', name: 'GPT-5.4', group: 'Chat', isDefault: true },
    { id: 'gpt-5.4-mini', name: 'GPT-5.4 mini', group: 'Chat' },
    { id: 'gpt-5.2', name: 'GPT-5.2', group: 'Chat' },
    { id: 'gpt-5.1', name: 'GPT-5.1', group: 'Chat' },
    { id: 'gpt-4.1', name: 'GPT-4.1', group: 'Chat' },
    { id: 'gpt-4.1-mini', name: 'GPT-4.1 mini', group: 'Chat' },
    { id: 'gpt-4.1-nano', name: 'GPT-4.1 nano', group: 'Chat' },
    { id: 'gpt-4o', name: 'GPT-4o', group: 'Chat' },
    { id: 'gpt-4o-mini', name: 'GPT-4o mini', group: 'Chat' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', group: 'Chat' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', group: 'Chat' },
    { id: 'o3', name: 'o3', group: 'Reasoning' },
    { id: 'o4-mini', name: 'o4-mini', group: 'Reasoning' },
    { id: 'text-embedding-3-large', name: 'Text Embedding 3 Large', group: 'Embedding' },
    { id: 'text-embedding-3-small', name: 'Text Embedding 3 Small', group: 'Embedding' },
  ],
};

const EMPTY_MODEL_MANAGER_PROVIDER: ProviderConfig = {
  id: 'openai',
  name: 'OpenAI',
  type: 'openai-response',
  apiKey: '',
  apiHost: 'https://api.openai.com/v1',
  enabled: true,
  models: [],
};

/**
 * 为设置页响应式 E2E 写入当前 v1 全局记忆配置。
 *
 * @param page - 当前扩展页。
 */
async function seedResponsiveMemoryConfig(page: Page) {
  const config = {
    enabled: true,
    embeddingModel: 'openai/text-embedding-3-large',
    llmModel: 'openai/gpt-5.4',
    topK: 5,
  };

  await page.evaluate(async ({ key, value }) => {
    const chromeApi = (globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome;
    const storage = chromeApi?.storage?.local;
    if (!storage?.set) throw new Error('chrome.storage.local 不可用');

    await new Promise<void>((resolve, reject) => {
      storage.set({ [key]: value }, () => {
        const message = chromeApi?.runtime?.lastError?.message;
        if (message) reject(new Error(message));
        else resolve();
      });
    });

    localStorage.setItem(`__olyq.bootstrap__.${key}`, JSON.stringify({
      schemaVersion: 1,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      value,
    }));
  }, { key: E2E_MEMORY_CONFIG_STORAGE_KEY, value: config });
}


const VERTEX_MODEL_MANAGER_SCROLL_PROVIDER: ProviderConfig = {
  id: 'vertexai',
  name: 'Vertex AI',
  type: 'vertexai',
  apiKey: '',
  apiHost: 'https://{region}-aiplatform.googleapis.com',
  enabled: true,
  vertex: {
    authType: 'serviceAccount',
    projectId: 'demo-project',
    location: 'us-central1',
    serviceAccount: {
      clientEmail: 'svc@example.iam.gserviceaccount.com',
      privateKey: [
        '-----BEGIN PRIVATE KEY-----',
        'MIIEvAIBADANBgkqhkiG9w0BAQEFAASC...',
        '-----END PRIVATE KEY-----',
      ].join('\n'),
      privateKeyId: 'demo-private-key',
    },
  },
  models: [
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', group: 'Chat', isDefault: true },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', group: 'Chat' },
  ],
};

const PAGE_TOOL_E2E_ORIGIN = 'http://olyq-e2e.test';

/**
 * 测试辅助函数：`buildDeepSeekV32ReasoningRegistry`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function buildDeepSeekV32ReasoningRegistry() {
  const seedEvidences: MetadataEvidence[] = [
    {
      sourcePriority: 'seed',
      providerType: 'openrouter',
      providerId: 'openrouter',
      rawModelId: 'deepseek/deepseek-chat-v3.2',
      displayName: 'DeepSeek V3.2',
      vendorHint: 'deepseek',
      modelHint: 'deepseek-chat-v3.2',
      kindHint: 'chat',
      inputModalities: ['text'],
      outputModalities: ['text'],
      featureHints: ['reasoning', 'tool-call', 'structured-output'],
      references: [
        { system: 'openrouter', refType: 'model-id', value: 'deepseek/deepseek-chat-v3.2' },
        { system: 'openrouter', refType: 'canonical', value: 'deepseek/deepseek-chat-v3.2' },
        { system: 'public-official', refType: 'upstream', value: 'deepseek-ai/DeepSeek-V3.2' },
      ],
      scopeHint: 'public',
      confidence: 'high',
      fetchedAt: DEEPSEEK_V32_FETCHED_AT,
    },
  ];

  return buildModelRegistry({
    providers: [DEEPSEEK_V32_PROVIDER],
    seedEvidences,
    openrouterLastSyncAt: DEEPSEEK_V32_FETCHED_AT,
    openrouterLastSyncStatus: 'success',
  });
}

/**
 * 测试辅助函数：`sendChatMessage`。
 *
 * @remarks
 * E2E 中输入框是受控组件，连续 `fill()` 后发送按钮会有一拍状态同步。
 * 这里统一等待按钮进入 enabled，再触发点击，避免“文本已填但点击时仍 disabled”的偶发抖动。
 */
async function sendChatMessage(page: Page, text: string) {
  await page.getByTestId('chat-input').fill(text);
  await expect(page.getByTestId('chat-send')).toBeEnabled();
  await page.getByTestId('chat-send').click();
}

/**
 * 在当前激活会话里追加一条真实消息节点。
 *
 * @remarks
 * bottom banner 的产品契约是“用户离底阅读时，已读标记之后出现新的消息节点，或已读尾部 assistant
 * 正文/附件继续增长才提示”。reasoning 增长和 tail status 变化仍是非正文原位更新，不应伪造未读横幅；
 * 因此这里通过当前扩展页 store 追加真实节点，专门验证节点型横幅点击链路本身。
 */
async function appendActiveConversationMessageForE2E(page: Page, message: Record<string, unknown>) {
  await page.evaluate(({ nextMessage }) => {
    type ChatStoreForE2E = {
      getState: () => {
        activeMessages?: unknown[];
        setMessagesForActiveConversation?: (messages: unknown[], options?: { touchTopicMeta?: boolean }) => void;
      };
    };
    const store = (globalThis as typeof globalThis & { __olyqUseChatStoreV4__?: ChatStoreForE2E }).__olyqUseChatStoreV4__;
    if (!store) throw new Error('E2E append failed: chat store is not mounted');
    const state = store.getState();
    if (typeof state.setMessagesForActiveConversation !== 'function') {
      throw new Error('E2E append failed: active conversation writer is unavailable');
    }
    const currentMessages = Array.isArray(state.activeMessages) ? state.activeMessages : [];
    state.setMessagesForActiveConversation([...currentMessages, nextMessage], { touchTopicMeta: false });
  }, { nextMessage: message });
}

/**
 * 为扩展页种入一个可直接恢复的话题启动场景。
 *
 * @remarks
 * 这里复用 sidepanel 启动真实链路：
 * - `chrome.storage.local` 负责 assistants/runtime 真源；
 * - IndexedDB 当前消息库写入话题消息；
 * - localStorage bootstrap mirror 负责 reload 后首帧恢复。
 */
async function seedTopicStartup(
  page: Page,
  messages: Array<Record<string, unknown>>,
  options?: {
    topicId?: string;
    topicName?: string;
  },
) {
  await page.evaluate(async ({ startupMessages, topicId, topicName, messagesDb }) => {
    /**
     * 测试局部辅助：`deleteDb`。
     *
     * @remarks
     * 每次种入启动话题前先清空旧 IndexedDB，避免上一条 E2E 残留的 schema 或数据污染当前场景。
     * 删除失败不阻断当前测试，因为这里的目标只是尽量把环境收回到干净起点。
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
     * 测试局部辅助：`putTopicRow`。
     *
     * @remarks
     * 在 extension 自己的 IndexedDB 里写入单条 topic 记录，模拟 reload 后可直接恢复的历史会话。
     * 这里只保留最小 schema 与消息负载，不把测试数据扩散到运行时代码。
     */
    const putTopicRow = (id: string, nextMessages: unknown[]) => new Promise<void>((resolve, reject) => {
      try {
        const req = indexedDB.open(messagesDb.name, messagesDb.version);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(messagesDb.store)) db.createObjectStore(messagesDb.store, { keyPath: 'id' });
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction([messagesDb.store], 'readwrite');
          tx.objectStore(messagesDb.store).put({ id, messages: nextMessages });
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
    const resolvedTopicId = String(topicId || 'topic-boot');
    const resolvedTopicName = String(topicName || '启动话题');
    const assistants = [
      {
        id: '__builtin_default__',
        name: '默认助手',
        emoji: '🤖',
        description: '默认 AI 助手',
        prompt: '你是一个有帮助的 AI 助手。',
        topics: [
          {
            id: resolvedTopicId,
            assistantId: '__builtin_default__',
            name: resolvedTopicName,
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
      activeTopicId: resolvedTopicId,
    };

    await new Promise<void>((resolve, reject) => {
      try {
        chrome.storage.local.set({
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

    await putTopicRow(resolvedTopicId, startupMessages);
  }, {
    startupMessages: messages,
    topicId: options?.topicId ?? 'topic-boot',
    topicName: options?.topicName ?? '启动话题',
    messagesDb: {
      name: MESSAGES_DB_NAME,
      version: MESSAGES_DB_VERSION,
      store: MESSAGES_DB_STORE,
    },
  });
}

/**
 * 生成一段足够长的历史消息，供滚动回归测试复用。
 */
function buildHistoryMessages(totalAsks: number) {
  const messages: Array<Record<string, unknown>> = [];
  const startAt = 1_730_000_000_000;
  for (let index = 0; index < totalAsks; index += 1) {
    const askNumber = index + 1;
    const askId = `ask-${askNumber}`;
    messages.push({
      id: `user-${askNumber}`,
      askId,
      role: 'user',
      content: `历史提问 ${askNumber}`,
      createdAt: startAt + askNumber * 2,
    });
    messages.push({
      id: `assistant-${askNumber}`,
      askId,
      role: 'assistant',
      modelId: 'openai/gpt-5.4',
      content: askNumber % 7 === 0
        ? `第 ${askNumber} 条历史回复会故意写得更长一些，覆盖换行与动态高度。\n\n- 第一段说明\n- 第二段说明\n- 第三段说明`
        : `历史回复 ${askNumber}`,
      status: 'success',
      createdAt: startAt + askNumber * 2 + 1,
    });
  }
  return messages;
}

/**
 * 生成带历史页面元素引用卡的长对话，用于验证引用卡展开不会触发贴底跳动。
 */
function buildHistoryMessagesWithElementReference() {
  const messages = buildHistoryMessages(48);
  const elementText = [
    'Bootstrap selected content',
    'Get a jump on including Bootstrap source files in a new project with official guides.',
  ].join('\n\n');

  messages.push({
    id: 'user-element-reference',
    askId: 'ask-element-reference',
    role: 'user',
    content: '翻译这个元素',
    contextReferences: [{
      id: 'ctx-history-element-1',
      kind: 'element',
      element: {
        kind: 'text',
        tagName: 'P',
        selector: 'main p.lead',
        text: elementText,
        charCount: elementText.replace(/\s+/g, '').length,
      },
      source: {
        title: 'Bootstrap · The most popular HTML, CSS, and JS library in the world.',
        url: 'https://getbootstrap.com/',
      },
      attachmentIds: [],
    }],
    createdAt: 1_730_000_100_000,
  });

  return messages;
}

/**
 * 生成一组专供“上一问 / 下一问 / flow”导航回归的短历史。
 *
 * @remarks
 * 第一问和第二问的 assistant 回复故意写成长段落，保证目标 ask 在“当前已部分可见但尚未锚到顶部”的状态下触发导航。
 */
function buildAnchorNavigationMessages() {
  /**
   * 生成一条足够长的 assistant 回复，稳定触发动态高度与“目标已部分可见”的导航场景。
   *
   * @remarks
   * 问答导航要验证的是“目标 ask 就算已经露出一点，也必须重新锚到阅读线”，
   * 因此这里固定拉长回复文本，避免短消息把场景退化成普通可见跳转。
   */
  const longReply = (prefix: string) => Array.from({ length: 12 }, (_, index) => (
    `${prefix} 第 ${index + 1} 段，覆盖换行和动态高度。`
  )).join('\n\n');

  return [
    {
      id: 'user-1',
      askId: 'ask-1',
      role: 'user',
      content: '第一问：请概述当前页面',
      createdAt: 1_730_100_000_001,
    },
    {
      id: 'assistant-1',
      askId: 'ask-1',
      role: 'assistant',
      modelId: 'openai/gpt-5.4',
      content: longReply('第一问回答'),
      status: 'success',
      createdAt: 1_730_100_000_002,
    },
    {
      id: 'user-2',
      askId: 'ask-2',
      role: 'user',
      content: '第二问：继续展开细节',
      createdAt: 1_730_100_000_003,
    },
    {
      id: 'assistant-2',
      askId: 'ask-2',
      role: 'assistant',
      modelId: 'openai/gpt-5.4',
      content: longReply('第二问回答'),
      status: 'success',
      createdAt: 1_730_100_000_004,
    },
    {
      id: 'user-3',
      askId: 'ask-3',
      role: 'user',
      content: '第三问：给出总结',
      createdAt: 1_730_100_000_005,
    },
    {
      id: 'assistant-3',
      askId: 'ask-3',
      role: 'assistant',
      modelId: 'openai/gpt-5.4',
      content: '第三问回答：总结当前页重点。',
      status: 'success',
      createdAt: 1_730_100_000_006,
    },
  ];
}

/**
 * 打开一个普通 http 页面作为 page-tools 真实目标页。
 *
 * @remarks
 * 这些用例必须走 content script -> Service Worker -> Sidepanel 的真实链路；
 * 不能从扩展页直接伪造 `element/action`，否则会绕过页面工具 session owner。
 */
async function openPageToolTargetPage(
  context: BrowserContext,
  sidepanelPage: Page,
  path: string,
  html: string,
) {
  const url = `${PAGE_TOOL_E2E_ORIGIN}${path}`;
  await context.route(url, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: html,
    });
  });

  const target = await context.newPage();
  await target.goto(url, { waitUntil: 'domcontentloaded' });
  const tabId = await sidepanelPage.evaluate(async ({ targetUrl }) => {
    const chromeApi = (globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome;
    if (!chromeApi?.tabs?.query) return null;
    return await new Promise<number | null>((resolve, reject) => {
      chromeApi.tabs.query({}, (tabs) => {
        const detail = chromeApi.runtime?.lastError?.message;
        if (detail) {
          reject(new Error(detail));
          return;
        }
        const tab = tabs.find((item) => item.url === targetUrl);
        resolve(typeof tab?.id === 'number' ? tab.id : null);
      });
    });
  }, { targetUrl: url });

  if (typeof tabId !== 'number') throw new Error(`无法定位页面工具目标 tab：${url}`);
  return { target, tabId, url };
}

/**
 * 从 sidepanel 启动目标 tab 的元素选择器。
 */
async function startElementPickerForE2ETab(sidepanelPage: Page, tabId: number) {
  const response = await sidepanelPage.evaluate(async ({ targetTabId }) => {
    return await new Promise<unknown>((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ type: 'element/picker/start', payload: { tabId: targetTabId } }, (res) => {
          const detail = chrome.runtime.lastError?.message;
          if (detail) {
            reject(new Error(detail));
            return;
          }
          resolve(res);
        });
      } catch (error) {
        reject(error);
      }
    });
  }, { targetTabId: tabId });
  expect(response).toMatchObject({ ok: true });
}

/**
 * 从 sidepanel 启动目标 tab 的网页截图编辑器。
 *
 * @remarks
 * 调用方需要先让目标网页 tab 处于前台，保证浏览器截图捕获的是当前网页视口。
 */
async function startScreenshotEditorForE2ETab(sidepanelPage: Page, tabId: number) {
  const response = await sidepanelPage.evaluate(async ({ targetTabId }) => {
    return await new Promise<unknown>((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ type: 'screenshot/editor/start', payload: { tabId: targetTabId } }, (res) => {
          const detail = chrome.runtime.lastError?.message;
          if (detail) {
            reject(new Error(detail));
            return;
          }
          resolve(res);
        });
      } catch (error) {
        reject(error);
      }
    });
  }, { targetTabId: tabId });
  expect(response).toMatchObject({ ok: true });
}

/**
 * 用真实鼠标事件选择页面元素并点击 Shadow DOM 工具条里的提交按钮。
 */
async function pickElementAndCommitForE2E(target: Page, selector: string) {
  await expect.poll(async () => {
    return await target.evaluate(() => Boolean(document.getElementById('__olyq_shadow_host__')?.shadowRoot));
  }, { timeout: 10_000 }).toBe(true);

  const elementBox = await target.locator(selector).boundingBox();
  if (!elementBox) throw new Error(`无法读取目标元素位置：${selector}`);
  await target.mouse.move(elementBox.x + elementBox.width / 2, elementBox.y + elementBox.height / 2);
  await target.mouse.click(elementBox.x + elementBox.width / 2, elementBox.y + elementBox.height / 2);

  await expect.poll(async () => {
    return await target.evaluate(() => {
      const button = document
        .getElementById('__olyq_shadow_host__')
        ?.shadowRoot
        ?.querySelector<HTMLButtonElement>('button[data-action="commit"]');
      return Boolean(button && !button.disabled);
    });
  }, { timeout: 10_000 }).toBe(true);

  const commitBox = await target.evaluate(() => {
    const button = document
      .getElementById('__olyq_shadow_host__')
      ?.shadowRoot
      ?.querySelector<HTMLButtonElement>('button[data-action="commit"]');
    if (!button) return null;
    const rect = button.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  if (!commitBox) throw new Error('无法读取元素选择器提交按钮位置');
  await target.mouse.click(commitBox.x + commitBox.width / 2, commitBox.y + commitBox.height / 2);

  await expect.poll(async () => {
    return await target.evaluate(() => {
      const shadow = document.getElementById('__olyq_shadow_host__')?.shadowRoot;
      const button = shadow?.querySelector<HTMLButtonElement>('button[data-action="commit"]');
      if (!button) return { visible: false, summary: '' };
      const rect = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      const visible = rect.width > 0
        && rect.height > 0
        && style.display !== 'none'
        && style.visibility !== 'hidden';
      const summary = shadow?.textContent?.trim().replace(/\s+/g, ' ').slice(0, 240) ?? '';
      return { visible, summary };
    });
  }, { timeout: 15_000 }).toMatchObject({ visible: false });
}

/**
 * 在截图编辑器中拖出选区，并用真实鼠标点击“发送到对话”。
 */
async function selectScreenshotRegionAndSendToChatForE2E(target: Page) {
  await expect.poll(async () => {
    return await target.evaluate(() => {
      const shadow = document.getElementById('__olyq_shadow_host__')?.shadowRoot;
      const editor = shadow?.querySelector<HTMLElement>('.screenshot-editor');
      const sourceImage = shadow?.querySelector<HTMLImageElement>('.source-image');
      return editor?.style.display === 'block' && Boolean(sourceImage?.complete);
    });
  }, { timeout: 15_000 }).toBe(true);

  await target.mouse.move(80, 90);
  await target.mouse.down();
  await target.mouse.move(280, 210, { steps: 8 });
  await target.mouse.up();

  await expect.poll(async () => {
    return await target.evaluate(() => {
      const shadow = document.getElementById('__olyq_shadow_host__')?.shadowRoot;
      const selection = shadow?.querySelector<HTMLElement>('.selection');
      const chatButton = shadow?.querySelector<HTMLButtonElement>('button[data-action="chat"]');
      return selection?.style.display === 'block' && Boolean(chatButton && !chatButton.disabled);
    });
  }, { timeout: 10_000 }).toBe(true);

  const chatButtonBox = await target.evaluate(() => {
    const button = document
      .getElementById('__olyq_shadow_host__')
      ?.shadowRoot
      ?.querySelector<HTMLButtonElement>('button[data-action="chat"]');
    if (!button) return null;
    const rect = button.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  if (!chatButtonBox) throw new Error('无法读取截图发送到对话按钮位置');
  await target.mouse.click(chatButtonBox.x + chatButtonBox.width / 2, chatButtonBox.y + chatButtonBox.height / 2);

  await expect.poll(async () => {
    return await target.evaluate(() => {
      const shadow = document.getElementById('__olyq_shadow_host__')?.shadowRoot;
      const editor = shadow?.querySelector<HTMLElement>('.screenshot-editor');
      return editor?.style.display !== 'block';
    });
  }, { timeout: 1_500 }).toBe(true);
}

/**
 * 读取聊天主列表当前滚动状态与可见虚拟行。
 */
async function readChatScrollState(page: Page) {
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
  await page.waitForTimeout(120);

  return await page.getByTestId('chat-scroll-root').evaluate((node) => {
    if (!(node instanceof HTMLDivElement)) return null;
    const viewportRect = node.getBoundingClientRect();
    const mountedRows = Array.from(node.querySelectorAll<HTMLElement>('[data-index]'))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          index: Number(element.dataset.index || '-1'),
          top: rect.top,
          bottom: rect.bottom,
          id: element.querySelector<HTMLElement>(':scope > [data-msg-id]')?.dataset.msgId
            || element.querySelector<HTMLElement>(':scope > [data-testid="message-group"]')?.getAttribute('data-ask-id')
            || `row-${element.dataset.index || 'unknown'}`,
        };
      });
    const visibleRows = mountedRows
      .filter((row) => Number.isFinite(row.index) && row.bottom > viewportRect.top && row.top < viewportRect.bottom)
      .sort((left, right) => left.top - right.top);
    const highestMounted = mountedRows
      .filter((row) => Number.isFinite(row.index))
      .sort((left, right) => right.index - left.index)[0] ?? null;

    return {
      clientHeight: node.clientHeight,
      firstVisibleId: visibleRows[0]?.id ?? null,
      firstVisibleIndex: visibleRows[0]?.index ?? null,
      highestMountedId: highestMounted?.id ?? null,
      highestMountedIndex: highestMounted?.index ?? null,
      lastVisibleIndex: visibleRows.at(-1)?.index ?? null,
      mountedCount: mountedRows.length,
      followBottomIntent: node.dataset.followBottomIntent ?? null,
      strictBottomState: node.dataset.strictBottom ?? null,
      bottomBannerCount: node.dataset.bottomBannerCount ?? null,
      scrollHeight: node.scrollHeight,
      scrollTop: node.scrollTop,
    };
  });
}

/**
 * 读取模型管理在当前视口下的关键几何。
 */
async function readModelManagerResponsiveMetrics(page: Page) {
  return await page.evaluate(() => {
    const root = document.documentElement;
    const nav = document.querySelector('[data-testid="model-manager-provider-nav"]');
    const providerScroll = document.querySelector('[data-testid="model-manager-provider-scroll"]');
    const compactSelect = document.querySelector('[data-testid="model-manager-provider-compact-select"]');
    const detail = document.querySelector('[data-testid="model-manager-provider-detail"]');
    const list = document.querySelector('[data-testid="model-manager-model-list"]');
    const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="model-manager-model-row-"]'));
    if (!(nav instanceof HTMLElement) || !(detail instanceof HTMLElement) || !(list instanceof HTMLElement)) return null;

    const navRect = nav.getBoundingClientRect();
    const providerScrollRect = providerScroll instanceof HTMLElement ? providerScroll.getBoundingClientRect() : null;
    const compactSelectRect = compactSelect instanceof HTMLElement ? compactSelect.getBoundingClientRect() : null;
    const detailRect = detail.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    const rowMetrics = rows.slice(0, 6).map((row) => {
      const rowRect = row.getBoundingClientRect();
      const title = row.querySelector<HTMLElement>('.model-manager-model-row-title');
      const badges = row.querySelector<HTMLElement>('.model-manager-model-row-badges');
      const actions = row.querySelector<HTMLElement>('.model-manager-model-row-actions');
      const badgeStrip = badges?.firstElementChild instanceof HTMLElement ? badges.firstElementChild : null;
      const titleRect = title?.getBoundingClientRect();
      const badgeRect = badges?.getBoundingClientRect();
      const badgeStripRect = badgeStrip?.getBoundingClientRect();
      const actionRect = actions?.getBoundingClientRect();
      const badgeStripStyle = badgeStrip ? getComputedStyle(badgeStrip) : null;
      const actionButtons = Array.from(row.querySelectorAll<HTMLElement>('.model-manager-model-row-actions button'))
        .map((button) => button.getBoundingClientRect());
      return {
        rowWidth: rowRect.width,
        rowHeight: rowRect.height,
        titleWidth: titleRect?.width ?? 0,
        titleTop: titleRect?.top ?? 0,
        badgeTop: badgeRect?.top ?? 0,
        badgeLeft: badgeRect?.left ?? 0,
        badgeRight: badgeRect?.right ?? 0,
        badgeStripPresent: Boolean(badgeStrip),
        badgeStripTop: badgeStripRect?.top ?? 0,
        badgeStripLeft: badgeStripRect?.left ?? 0,
        badgeStripRight: badgeStripRect?.right ?? 0,
        badgeJustifyContent: badgeStripStyle?.justifyContent ?? '',
        badgeFlexWrap: badgeStripStyle?.flexWrap ?? '',
        actionTop: actionRect?.top ?? 0,
        actionLeft: actionRect?.left ?? 0,
        actionRight: actionRect?.right ?? 0,
        titleRight: titleRect?.right ?? 0,
        actionButtonsOk: actionButtons.length === 2 && actionButtons.every((rect) => rect.width >= 26 && rect.height >= 26),
        badgesSameLineAsTitle: badgeStripRect && titleRect ? Math.abs(badgeStripRect.top - titleRect.top) <= 8 : true,
        badgesBelowTitle: badgeStripRect ? badgeStripRect.top >= (titleRect?.bottom ?? rowRect.top) - 2 : true,
        badgesRightAligned: badgeStripRect ? rowRect.right - badgeStripRect.right <= 24 : true,
        badgesBeforeActions: badgeStripRect && actionRect ? badgeStripRect.right <= actionRect.left - 4 : true,
        noTitleActionOverlap: titleRect && actionRect ? titleRect.right <= actionRect.left - 4 : false,
      };
    });

    return {
      rootScrollWidth: root.scrollWidth,
      rootClientWidth: root.clientWidth,
      navTop: navRect.top,
      navBottom: navRect.bottom,
      navRight: navRect.right,
      compactSelectVisible: compactSelect instanceof HTMLElement
        && getComputedStyle(compactSelect).display !== 'none'
        && (compactSelectRect?.width ?? 0) > 0
        && (compactSelectRect?.height ?? 0) > 0,
      providerScrollVisible: providerScroll instanceof HTMLElement
        && getComputedStyle(providerScroll).display !== 'none'
        && (providerScrollRect?.width ?? 0) > 0
        && (providerScrollRect?.height ?? 0) > 0,
      detailTop: detailRect.top,
      detailLeft: detailRect.left,
      listHeight: listRect.height,
      rowMetrics,
    };
  });
}

/**
 * 断言模型管理窄宽布局没有横向溢出，且模型行的名称、badge、操作按钮不互相覆盖。
 */
async function expectModelManagerResponsiveLayout(page: Page, mode: 'stacked' | 'split') {
  const metrics = await readModelManagerResponsiveMetrics(page);
  expect(metrics).not.toBeNull();
  expect(metrics!.rootScrollWidth).toBeLessThanOrEqual(metrics!.rootClientWidth + 1);
  expect(metrics!.listHeight).toBeGreaterThanOrEqual(80);
  expect(metrics!.rowMetrics.length).toBeGreaterThan(0);
  for (const row of metrics!.rowMetrics) {
    expect(row.rowWidth).toBeGreaterThan(240);
    expect(row.titleWidth).toBeGreaterThan(92);
    expect(row.actionButtonsOk).toBe(true);
    expect(row.noTitleActionOverlap).toBe(true);
    if (row.badgeStripPresent) {
      expect(row.badgeJustifyContent).toBe('flex-end');
      expect(row.badgeFlexWrap).toBe(row.badgesSameLineAsTitle ? 'nowrap' : 'wrap');
    }
    if (mode === 'stacked') {
      if (row.rowWidth >= 430) {
        expect(row.badgesSameLineAsTitle).toBe(true);
        if (row.badgeStripPresent) expect(row.badgesBeforeActions).toBe(true);
      } else {
        if (row.badgeStripPresent) {
          expect(row.badgesBelowTitle).toBe(true);
          expect(row.badgesRightAligned).toBe(true);
        }
      }
    } else {
      expect(row.badgesSameLineAsTitle).toBe(true);
      if (row.badgeStripPresent) expect(row.badgesRightAligned).toBe(true);
    }
  }
  if (mode === 'stacked') {
    expect(metrics!.compactSelectVisible).toBe(true);
    expect(metrics!.providerScrollVisible).toBe(false);
    expect(metrics!.navBottom).toBeLessThanOrEqual(metrics!.detailTop + 2);
  } else {
    expect(metrics!.compactSelectVisible).toBe(false);
    expect(metrics!.providerScrollVisible).toBe(true);
    expect(metrics!.navRight).toBeLessThanOrEqual(metrics!.detailLeft + 2);
  }
}

/**
 * 在指定视口下打开模型管理并选中用于响应式断言的 provider。
 *
 * @remarks
 * 小屏模型管理回归需要从真实设置入口进入，确保 compact select、桌面 tab、
 * provider 选择和列表滚动都走同一条用户路径；这里只负责准备测试数据和导航，
 * 不直接改 DOM 尺寸或强行滚动列表，避免把布局问题藏在测试 setup 里。
 * 480px 下设置按钮会被主工作区隐藏，因此先在 640px 打开真实设置入口，再收窄到目标视口验证布局。
 */
async function openModelManagerAtViewport(
  page: Page,
  viewport: { width: number; height: number },
  options: {
    providers?: ProviderConfig[];
    providerId?: string;
  } = {},
) {
  const providers = options.providers ?? [RESPONSIVE_MODEL_MANAGER_PROVIDER];
  const providerId = options.providerId ?? 'openai';
  await seedProvidersInExtension(page, providers);
  await page.reload({ waitUntil: 'domcontentloaded' });
  const entryViewport = viewport.width < 640 ? { ...viewport, width: 640 } : viewport;
  await page.setViewportSize(entryViewport);
  await page.waitForFunction(
    ({ width, height }) => window.innerWidth === width && window.innerHeight === height,
    entryViewport,
  );
  await expect(page.getByTestId('toolbar-extension-settings')).toBeVisible();
  await page.getByTestId('toolbar-extension-settings').click();
  await expect(page.getByRole('dialog', { name: '扩展设置' })).toBeVisible();

  if (entryViewport.width < 640) {
    await page.getByTestId('extension-settings-compact-select').click();
    await page.getByRole('option', { name: '模型管理' }).click();
  } else {
    await page.getByTestId('extension-settings-tab-models').click();
  }

  if (entryViewport.width !== viewport.width || entryViewport.height !== viewport.height) {
    await page.setViewportSize(viewport);
    await page.waitForFunction(
      ({ width, height }) => window.innerWidth === width && window.innerHeight === height,
      viewport,
    );
    await expect(page.getByRole('dialog', { name: '扩展设置' })).toBeVisible();
  }

  await expect(page.getByTestId('model-manager-provider-nav')).toBeVisible();
  const compactProviderSelect = page.getByTestId('model-manager-provider-compact-select');
  if (await compactProviderSelect.isVisible()) {
    await compactProviderSelect.click();
    await page.getByTestId(`model-manager-provider-compact-option-${providerId}`).click();
  } else {
    await page.getByTestId(`model-manager-provider-${providerId}`).click();
  }
}

/**
 * 等待聊天主列表当前滚动位置稳定下来。
 *
 * @remarks
 * 标题可见并不代表 startup restore、字体回流和虚拟测量都已经结束；
 * 这里要求 `scrollTop` 连续两轮保持稳定，避免导航测试在首屏恢复半途中就提前点击按钮。
 */
async function waitForChatScrollSettle(page: Page) {
  let previousTop: number | null = null;
  let stableRounds = 0;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const snapshot = await readChatScrollState(page);
    const currentTop = snapshot?.scrollTop ?? 0;
    if (previousTop != null && Math.abs(currentTop - previousTop) <= 1) {
      stableRounds += 1;
      if (stableRounds >= 2) return;
    } else {
      stableRounds = 0;
    }
    previousTop = currentTop;
  }

  throw new Error("聊天主列表滚动在预期时间内没有稳定下来");
}

/**
 * 直接驱动主聊天 transcript 的真实滚动容器。
 *
 * @remarks
 * 扩展 sidepanel / 独立页环境里，Playwright 的 `mouse.wheel()` 命中滚动 owner 并不稳定；
 * 这里直接写 `chat-scroll-root.scrollTop`，仍然只走主聊天唯一滚动 owner 的 `scroll` 事件链路，
 * 不会误伤 trace / tool / Mermaid 内层滚动契约。
 */
async function scrollChatTranscriptBy(page: Page, deltaY: number) {
  await page.getByTestId('chat-scroll-root').evaluate(async (node, delta) => {
    if (!(node instanceof HTMLDivElement)) {
      throw new Error('chat-scroll-root 不是 HTMLDivElement');
    }
    if (Number.isFinite(delta) && delta !== 0) {
      node.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true,
        cancelable: false,
        deltaY: delta,
      }));
    }
    const nextTop = Math.max(0, Math.min(
      node.scrollHeight - node.clientHeight,
      node.scrollTop + delta,
    ));
    node.scrollTop = nextTop;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }, deltaY);
  await page.waitForTimeout(120);
}

/**
 * 用小数滚轮 delta 驱动主聊天 transcript。
 *
 * @remarks
 * 这个 helper 专门覆盖触控板小数 delta：用户的“我要上翻”意图必须先交给滚动 owner，
 * 即使原生 scrollTop 只离开 strict-bottom 区间不到 1px，也不能继续被流式 auto-bottom 抢回。
 * Playwright 合成 WheelEvent 不会执行浏览器默认滚动，因此这里同步补一段同等小数位移；
 * 它只模拟真实输入产生的亚像素滚动，不复用旧用例里的大幅脚本滚动。
 */
async function scrollChatTranscriptByFractionalWheel(page: Page, deltaY: number) {
  const box = await page.getByTestId('chat-scroll-root').boundingBox();
  if (!box) throw new Error('chat-scroll-root 没有可用 bounding box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, deltaY);
  await page.waitForTimeout(120);
}

/**
 * 通过真实鼠标事件拖拽主聊天原生纵向滚动条向上移动。
 *
 * @remarks
 * 这个 helper 不直接写 `scrollTop`：它先按 DOM 几何找到当前浏览器保留的
 * scrollbar gutter 与底部 thumb，再用 Playwright mouse 模拟按下和拖动，
 * 用来覆盖 wheel / touch / key 之外的用户阅读接管入口。
 */
async function dragChatTranscriptScrollbarUp(page: Page, distance: number) {
  const dragPoint = await page.getByTestId('chat-scroll-root').evaluate((node, dragDistance) => {
    if (!(node instanceof HTMLDivElement)) {
      throw new Error('chat-scroll-root 不是 HTMLDivElement');
    }

    const rect = node.getBoundingClientRect();
    const totalReservedWidth = node.offsetWidth - node.clientWidth;
    const style = getComputedStyle(node);
    const borderLeft = Number.parseFloat(style.borderLeftWidth) || 0;
    const borderRight = Number.parseFloat(style.borderRightWidth) || 0;
    const leftScrollbarWidth = Math.max(0, node.clientLeft - borderLeft);
    const rightScrollbarWidth = Math.max(0, totalReservedWidth - node.clientLeft - borderRight);
    const scrollbarSide = rightScrollbarWidth > 0 ? 'right' : leftScrollbarWidth > 0 ? 'left' : null;
    const overlayScrollbarWidth = Number.parseFloat(style.getPropertyValue('--olyq-scrollbar-size')) || 0;
    if (!scrollbarSide && overlayScrollbarWidth <= 0) {
      throw new Error(`当前浏览器没有可测量的原生纵向 scrollbar 区域: offsetWidth=${node.offsetWidth}, clientWidth=${node.clientWidth}, clientLeft=${node.clientLeft}`);
    }

    const scrollbarWidth = scrollbarSide === 'right'
      ? rightScrollbarWidth
      : scrollbarSide === 'left'
        ? leftScrollbarWidth
        : overlayScrollbarWidth;
    const x = scrollbarSide === 'left'
      ? rect.left + borderLeft + scrollbarWidth / 2
      : rect.right - borderRight - scrollbarWidth / 2;
    const maxScrollTop = Math.max(1, node.scrollHeight - node.clientHeight);
    const thumbHeight = Math.max(24, (node.clientHeight / node.scrollHeight) * node.clientHeight);
    const trackHeight = Math.max(1, node.clientHeight - thumbHeight);
    const thumbTop = rect.top + (node.scrollTop / maxScrollTop) * trackHeight;
    const y = Math.min(rect.bottom - 8, Math.max(rect.top + 8, thumbTop + thumbHeight / 2));

    return {
      fromX: x,
      fromY: y,
      toY: Math.max(rect.top + 8, y - Math.abs(dragDistance)),
    };
  }, distance);

  await page.mouse.move(dragPoint.fromX, dragPoint.fromY);
  await page.mouse.down();
  await expect.poll(async () => (await readChatScrollState(page))?.followBottomIntent ?? 'true').toBe('false');
  await page.mouse.move(dragPoint.fromX, dragPoint.toY, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(160);
}

/**
 * 在真实原生滚动条拖拽会话中上移并保持按住一段时间。
 *
 * @remarks
 * 这个 helper 专门覆盖“用户已经按住/推动 scrollbar，AI 仍在持续输出”的竞争窗口；
 * 调用方负责在完成断言后释放鼠标，避免 helper 自己把流式增长期间的抢占窗口提前结束。
 */
async function holdChatTranscriptScrollbarUp(page: Page, distance: number) {
  const dragPoint = await page.getByTestId('chat-scroll-root').evaluate((node, dragDistance) => {
    if (!(node instanceof HTMLDivElement)) {
      throw new Error('chat-scroll-root 不是 HTMLDivElement');
    }

    const rect = node.getBoundingClientRect();
    const totalReservedWidth = node.offsetWidth - node.clientWidth;
    const style = getComputedStyle(node);
    const borderLeft = Number.parseFloat(style.borderLeftWidth) || 0;
    const borderRight = Number.parseFloat(style.borderRightWidth) || 0;
    const leftScrollbarWidth = Math.max(0, node.clientLeft - borderLeft);
    const rightScrollbarWidth = Math.max(0, totalReservedWidth - node.clientLeft - borderRight);
    const scrollbarSide = rightScrollbarWidth > 0 ? 'right' : leftScrollbarWidth > 0 ? 'left' : null;
    const overlayScrollbarWidth = Number.parseFloat(style.getPropertyValue('--olyq-scrollbar-size')) || 0;
    if (!scrollbarSide && overlayScrollbarWidth <= 0) {
      throw new Error(`当前浏览器没有可测量的原生纵向 scrollbar 区域: offsetWidth=${node.offsetWidth}, clientWidth=${node.clientWidth}, clientLeft=${node.clientLeft}`);
    }

    const scrollbarWidth = scrollbarSide === 'right'
      ? rightScrollbarWidth
      : scrollbarSide === 'left'
        ? leftScrollbarWidth
        : overlayScrollbarWidth;
    const x = scrollbarSide === 'left'
      ? rect.left + borderLeft + scrollbarWidth / 2
      : rect.right - borderRight - scrollbarWidth / 2;
    const maxScrollTop = Math.max(1, node.scrollHeight - node.clientHeight);
    const thumbHeight = Math.max(24, (node.clientHeight / node.scrollHeight) * node.clientHeight);
    const trackHeight = Math.max(1, node.clientHeight - thumbHeight);
    const thumbTop = rect.top + (node.scrollTop / maxScrollTop) * trackHeight;
    const y = Math.min(rect.bottom - 8, Math.max(rect.top + 8, thumbTop + thumbHeight / 2));

    return {
      fromX: x,
      fromY: y,
      toY: Math.max(rect.top + 8, y - Math.abs(dragDistance)),
    };
  }, distance);

  await page.mouse.move(dragPoint.fromX, dragPoint.fromY);
  await page.mouse.down();
  await expect.poll(async () => (await readChatScrollState(page))?.followBottomIntent ?? 'true').toBe('false');
  await page.mouse.move(dragPoint.fromX, dragPoint.toY, { steps: 8 });
  await page.waitForTimeout(160);
}

/**
 * 等待聊天主列表进入“可滚动且贴底”的稳定状态。
 *
 * @remarks
 * detached-reading / follow-bottom 相关回归必须从真实贴底起点开始；
 * 否则 startup restore、字体回流或流式首帧尚未稳定时，测试会把未完成的初始化误报成滚动回归。
 */
async function waitForChatScrollableBottom(page: Page, minimumScrollTop = 24) {
  await expect.poll(async () => {
    const snapshot = await readChatScrollState(page);
    if (!snapshot) return Number.MAX_SAFE_INTEGER;
    return snapshot.scrollHeight - snapshot.clientHeight - snapshot.scrollTop;
  }).toBeLessThan(24);

  await expect.poll(async () => (await readChatScrollState(page))?.scrollTop ?? -1).toBeGreaterThan(minimumScrollTop);
  return await readChatScrollState(page);
}

/**
 * 在页面内记录 bottom banner 的 DOM 插入次数。
 *
 * @remarks
 * 这个 helper 专门防“一帧闪现”：最终 `toHaveCount(0)` 只能证明断言时不存在，
 * 但 MutationObserver 能证明测试窗口内没有被插入过。
 */
async function startBottomBannerInsertionObserver(page: Page) {
  await page.evaluate(() => {
    type BottomBannerObserverWindow = typeof globalThis & {
      __olyqBottomBannerInsertions?: number;
      __olyqBottomBannerObserver?: MutationObserver;
    };
    const state = globalThis as BottomBannerObserverWindow;
    state.__olyqBottomBannerObserver?.disconnect();
    state.__olyqBottomBannerInsertions = 0;

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (!(node instanceof HTMLElement)) continue;
          if (
            node.matches('[data-testid="chat-scroll-bottom-banner"]')
            || node.querySelector('[data-testid="chat-scroll-bottom-banner"]')
          ) {
            state.__olyqBottomBannerInsertions = (state.__olyqBottomBannerInsertions ?? 0) + 1;
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    state.__olyqBottomBannerObserver = observer;
  });
}

/**
 * 读取并关闭 bottom banner 插入监听器。
 *
 * @param page - 当前扩展页。
 */
async function stopBottomBannerInsertionObserver(page: Page) {
  return await page.evaluate(() => {
    type BottomBannerObserverWindow = typeof globalThis & {
      __olyqBottomBannerInsertions?: number;
      __olyqBottomBannerObserver?: MutationObserver;
    };
    const state = globalThis as BottomBannerObserverWindow;
    const count = state.__olyqBottomBannerInsertions ?? 0;
    state.__olyqBottomBannerObserver?.disconnect();
    delete state.__olyqBottomBannerObserver;
    return count;
  });
}

/**
 * 等待当前尾部消息经历多次文本增长。
 *
 * @remarks
 * `@slow` mock 会按 chunk 输出；这里用真实 DOM 文本长度增长证明测试窗口覆盖了多轮流式提交，
 * 而不是只看某个最终稳定帧。
 */
async function waitForTailMessageTextGrowth(page: Page, minimumGrowthSteps = 4) {
  let previousLength = 0;
  let growthSteps = 0;

  await expect.poll(async () => {
    const currentLength = await page.locator('[data-msg-id]').last().evaluate((node) => node.textContent?.length ?? 0).catch(() => 0);
    if (currentLength > previousLength) {
      growthSteps += 1;
      previousLength = currentLength;
    }
    return growthSteps;
  }, {
    timeout: 8_000,
    intervals: [100, 160, 220, 280, 340],
  }).toBeGreaterThanOrEqual(minimumGrowthSteps);
}

/**
 * 读取当前尾部消息的文本长度。
 *
 * @remarks
 * 小数 wheel 滚动锁回归需要证明“用户上翻之后”仍然发生了流式正文增长；
 * 不能把 wheel 前已经存在的 mock 文本误算成后续增长。
 */
async function readTailMessageTextLength(page: Page) {
  return await page.locator('[data-msg-id]').last().evaluate((node) => node.textContent?.length ?? 0).catch(() => 0);
}

/**
 * 把 mock 流式会话收尾到“发送按钮重新可用”。
 *
 * @remarks
 * `@slow` / `@slow-reasoning` 可能在断言阶段自然结束；
 * 这里优先复用现有停止按钮，但如果会话已经自行完成，就直接等 `chat-send` 返回。
 */
async function finishStreamingIfNeeded(page: Page) {
  const stopButton = page.getByTestId('chat-stop');
  if (await stopButton.isVisible().catch(() => false)) {
    await stopButton.click();
  }
  await expect(page.getByTestId('chat-send')).toBeVisible();
}

/**
 * 让右侧问答导航按钮进入可见状态。
 */
async function revealChatNavigation(page: Page) {
  await page.getByTestId('chat-nav-handle').click();
  await expect(page.getByTestId('chat-nav-panel')).toBeVisible();
  await expect(page.getByTestId('chat-nav-next')).toBeVisible();
}

/**
 * 右侧悬浮导航按钮按最终产品契约只认标准 button `click`。
 *
 * @remarks
 * 主聊天已经明确收口到标准 `click` 语义；测试也必须走同一条路径，
 * 不能继续用坐标点按去伪造另一套输入时序，否则会把 hover 浮层的几何抖动误报成产品滚动回归。
 * 这里直接触发 DOM button `click()`，验证的是“按钮 click 契约、导航命令、滚动结果”这一条产品真路径。
 */
async function pressFloatingNavButton(page: Page, testId: string) {
  const button = page.getByTestId(testId);
  await expect(button).toBeVisible();
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });
  });
  await button.evaluate((node) => {
    if (!(node instanceof HTMLButtonElement)) {
      throw new Error("目标元素不是按钮");
    }
    node.click();
  });
}

/**
 * 读取指定消息相对聊天视口顶部的偏移。
 */
async function readMessageOffsetInChat(page: Page, messageId: string) {
  return await page.evaluate((targetId) => {
    const container = document.querySelector<HTMLElement>('[data-testid="chat-scroll-root"]');
    const message = document.querySelector<HTMLElement>(`[data-msg-id="${targetId}"]`);
    if (!container || !message) return null;
    const containerRect = container.getBoundingClientRect();
    const rect = message.getBoundingClientRect();
    return {
      bottomOffset: rect.bottom - containerRect.top,
      topOffset: rect.top - containerRect.top,
    };
  }, messageId);
}

/**
 * 读取导航聚焦前后的 ask 几何。
 *
 * @remarks
 * 这里不关心滚动把消息带到什么位置，而是只关心导航激活态有没有把 ask 本体几何撑厚、变宽或外扩。
 * `message-frame` 是当前唯一允许承载导航聚焦视觉的 DOM 锚点；如果未来有人再往上叠 padding / 背景块，
 * 这个几何快照会直接把回归卡住。
 */
async function readMessageFrameGeometryInChat(page: Page, messageId: string) {
  return await page.evaluate((targetId) => {
    const container = document.querySelector<HTMLElement>('[data-testid="chat-scroll-root"]');
    const row = document.querySelector<HTMLElement>(`[data-msg-id="${targetId}"]`);
    const frame = document.querySelector<HTMLElement>(`[data-testid="message-frame-${targetId}"]`);
    const surface = document.querySelector<HTMLElement>(`[data-testid="message-surface-${targetId}"]`);
    if (!container || !row || !frame || !surface) return null;
    const containerRect = container.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const surfaceRect = surface.getBoundingClientRect();
    const frameStyle = getComputedStyle(frame);
    return {
      backgroundColor: frameStyle.backgroundColor,
      borderBottomWidth: frameStyle.borderBottomWidth,
      borderLeftWidth: frameStyle.borderLeftWidth,
      borderRightWidth: frameStyle.borderRightWidth,
      borderTopWidth: frameStyle.borderTopWidth,
      boxShadow: frameStyle.boxShadow,
      frameHeight: frameRect.height,
      navActive: row.getAttribute('data-nav-active'),
      paddingBottom: frameStyle.paddingBottom,
      paddingLeft: frameStyle.paddingLeft,
      paddingRight: frameStyle.paddingRight,
      paddingTop: frameStyle.paddingTop,
      surfaceHeight: surfaceRect.height,
      surfaceLeft: surfaceRect.left - containerRect.left,
      surfaceWidth: surfaceRect.width,
    };
  }, messageId);
}

/**
 * 读取当前聊天主列表顶层行矩形。
 *
 * @remarks
 * 用于真实发送链路里的几何回归，直接检查虚拟列表最终摆位是否严格递增。
 */
async function collectChatTopLevelRows(page: Page) {
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
  await page.waitForTimeout(180);

  return await page.evaluate(() => (
    Array.from(document.querySelectorAll<HTMLElement>('[data-index]'))
      .filter((element) => Boolean(
        element.querySelector(':scope > [data-msg-id], :scope > [data-testid="message-group"], :scope > [data-testid="context-divider-row"]'),
      ))
      .map((element, index) => {
        const rect = element.getBoundingClientRect();
        const previewText = (element.innerText || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 120);
        return {
          id: element.querySelector<HTMLElement>(':scope > [data-msg-id]')?.dataset.msgId
            || element.querySelector<HTMLElement>(':scope > [data-testid="message-group"]')?.getAttribute('data-ask-id')
            || element.querySelector<HTMLElement>(':scope > [data-testid="context-divider-row"]')?.getAttribute('data-testid')
            || `row-${index}`,
          index: element.getAttribute('data-index'),
          transform: element.style.transform || '',
          top: rect.top,
          bottom: rect.bottom,
          height: rect.height,
          previewText,
        };
      })
      .sort((left, right) => left.top - right.top)
  ));
}

/**
 * 断言聊天顶层行严格递增且没有互相覆盖。
 */
function expectChatTopLevelRowsStrictlyIncreasing(rows: Array<{ id: string; top: number; bottom: number; height: number }>) {
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
 * 测试辅助函数：`makeAssistantSeed`。
 *
 * @remarks
 * 用于为助手拖拽回归快速构造最小可用的助手实体。
 */
function makeAssistantSeed(
  id: string,
  name: string,
  order: number,
  options?: {
    tags?: string[];
  },
): Assistant {
  const now = 1_730_000_000_000 + order;
  return {
    id,
    scenario: 'general',
    name,
    description: `${name}描述`,
    prompt: `${name}提示词`,
    tags: options?.tags,
    topics: [],
    order,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 测试辅助函数：`getAssistantRowOrder`。
 *
 * @remarks
 * 读取当前助手列表的渲染顺序，供拖拽回归断言复用。
 */
async function getAssistantRowOrder(page: Page) {
  return await page.locator('[data-testid^="assistant-row-"]').evaluateAll((elements) => (
    elements
      .map((element) => element.getAttribute('data-testid') || '')
      .filter(Boolean)
  ));
}

/** 读取当前助手侧栏列表渲染模式。 */
async function getAssistantRowsRenderMode(page: Page) {
  return await page.getByTestId('assistant-browser-rows').getAttribute('data-render-mode');
}

/**
 * 打开左侧助手标签页。
 *
 * @remarks
 * 右侧工具条不再提供泛化助手快捷入口，助手列表 e2e 统一通过左侧侧栏 tab 进入。
 */
async function openAssistantSidebar(page: Page) {
  await page.getByRole('tab', { name: '助手' }).click();
  await expect(page.getByTestId('assistant-browser-rows')).toBeVisible();
}

/**
 * 读取当前页面里 dnd-kit 残留的 dragging / dropping 标记数量。
 *
 * @remarks
 * 用于在真实浏览器回归里等待上一轮拖拽清场完成，再开始下一次 pointer drag。
 */
async function getAssistantDndDebugState(page: Page) {
  return await page.evaluate(() => ({
    droppingCount: document.querySelectorAll('[data-dnd-dropping]').length,
    draggingCount: document.querySelectorAll('[data-dnd-dragging]').length,
  }));
}

/**
 * 等待当前页面进入“可以开始下一次助手拖拽”的稳定状态。
 *
 * @remarks
 * 这里不依赖固定 sleep，而是直接盯 dnd-kit 的 dragging / dropping 标记，
 * 避免连续拖拽时撞上上一轮尚未清干净的会话。
 */
async function waitForAssistantDragReady(page: Page) {
  await expect.poll(() => getAssistantDndDebugState(page)).toEqual({
    droppingCount: 0,
    draggingCount: 0,
  });
}

/**
 * 等待 dnd-kit 确认当前 pointer 会话已经进入真实 dragging 阶段。
 *
 * @remarks
 * 大列表在 pointerdown 后会先把虚拟窗口切成全量 DOM；这一步完成并不等于
 * PointerSensor 已经激活。显式等待 dragging 标记可以避免后续鼠标轨迹丢在
 * prepare 窗口里，导致多文件 E2E 套件下偶发没有写回排序。
 */
async function waitForAssistantDragActive(page: Page) {
  await expect.poll(async () => {
    const state = await getAssistantDndDebugState(page);
    return state.draggingCount > 0;
  }).toBe(true);
}

/**
 * 测试辅助函数：`dragAssistantHandleToRow`。
 *
 * @remarks
 * dnd-kit PointerSensor 不走原生 HTML5 drag 事件，因此这里直接驱动真实 pointer/mouse 轨迹。
 */
async function dragAssistantHandleToRow(page: Page, handleTestId: string, targetRowTestId: string) {
  const dragState = await beginAssistantHandleDrag(page, handleTestId);
  await continueAssistantHandleDragToRow(page, dragState, handleTestId, targetRowTestId);
  await page.mouse.up();
}

/**
 * 测试辅助函数：`continueAssistantHandleDragToRow`。
 *
 * @remarks
 * 让当前已经开始的 pointer drag 按真实列表路径继续经过中间行，再落到目标行前/后。
 * 这用于需要先断言“拖拽会话已切到全量 DOM”后，再继续同一会话重排的场景。
 */
async function continueAssistantHandleDragToRow(
  page: Page,
  dragState: {
    currentX: number;
    currentY: number;
  },
  handleTestId: string,
  targetRowTestId: string,
  options?: {
    /**
     * 是否要求在松手前就等待 source / target 的投影相对位置稳定。
     *
     * 说明：
     * - 普通列表拖拽需要保留这条断言，用来验证投影在 pointer move 阶段已经生效；
     * - 大列表从 virtualized 切到 static 的场景只关心“切全量 DOM 后最终能排成功”，
     *   不要求同一 helper 在鼠标松开前强行等待投影关系收敛。
     */
    settleProjectedRelation?: boolean;
  },
) {
  const handle = page.getByTestId(handleTestId);
  const targetRow = page.getByTestId(targetRowTestId);
  const sourceRowTestId = handleTestId.replace('assistant-drag-handle-', 'assistant-row-');

  await expect(handle).toBeVisible();
  await expect(targetRow).toBeVisible();

  const rowOrder = await getAssistantRowOrder(page);
  const sourceIndex = rowOrder.indexOf(sourceRowTestId);
  const targetIndex = rowOrder.indexOf(targetRowTestId);
  if (sourceIndex < 0 || targetIndex < 0) {
    throw new Error(`无法解析助手拖拽路径：source=${sourceRowTestId} target=${targetRowTestId}`);
  }

  const movingUp = targetIndex < sourceIndex;
  const rowPath = movingUp
    ? rowOrder.slice(targetIndex, sourceIndex).reverse()
    : rowOrder.slice(sourceIndex + 1, targetIndex + 1);

  let { currentX, currentY } = dragState;

  for (const rowTestId of rowPath) {
    const row = page.getByTestId(rowTestId);
    await expect(row).toBeVisible();
    const rowBox = await row.boundingBox();
    if (!rowBox) throw new Error(`无法获取拖拽路径行的 bounding box: ${rowTestId}`);

    const rowX = rowBox.x + rowBox.width / 2;
    const rowCenterY = rowBox.y + rowBox.height / 2;
    const insertionPadding = movingUp
      ? Math.min(rowBox.height * 0.12, 6)
      : Math.min(rowBox.height * 0.18, 14);
    const rowInsertY = movingUp
      ? rowBox.y + insertionPadding
      : rowBox.y + rowBox.height - insertionPadding;
    const travelToCenterSteps = Math.max(8, Math.ceil(Math.abs(rowCenterY - currentY) / 8));
    const settleSteps = Math.max(4, Math.ceil(Math.abs(rowInsertY - rowCenterY) / 4));

    await page.mouse.move(rowX, rowCenterY, { steps: travelToCenterSteps });
    await page.waitForTimeout(40);
    await page.mouse.move(rowX, rowInsertY, { steps: settleSteps });
    await page.waitForTimeout(90);

    currentX = rowX;
    currentY = rowInsertY;
  }

  if (rowPath.length > 0) {
    const needsProjectedRelationSettle = (options?.settleProjectedRelation ?? true) && Math.abs(sourceIndex - targetIndex) > 1;

    if (needsProjectedRelationSettle) {
    await expect.poll(async () => {
      const order = await getAssistantRowOrder(page);
      const currentSourceIndex = order.indexOf(sourceRowTestId);
      const currentTargetIndex = order.indexOf(targetRowTestId);
      if (currentSourceIndex < 0 || currentTargetIndex < 0) {
        return false;
      }
      return movingUp
        ? currentSourceIndex < currentTargetIndex
        : currentSourceIndex > currentTargetIndex;
    }).toBe(true);
    }
    await page.waitForTimeout(100);
    return;
  }

  const finalRowBox = await targetRow.boundingBox();
  if (!finalRowBox) throw new Error(`无法获取目标行的最终 bounding box: ${targetRowTestId}`);
  const finalX = finalRowBox.x + finalRowBox.width / 2;
  const finalInsertionPadding = movingUp
    ? Math.min(finalRowBox.height * 0.12, 6)
    : Math.min(finalRowBox.height * 0.18, 14);
  const finalInsertY = movingUp
    ? finalRowBox.y + finalInsertionPadding
    : finalRowBox.y + finalRowBox.height - finalInsertionPadding;
  const finalSteps = Math.max(6, Math.ceil(Math.abs(finalInsertY - currentY) / 4));

  await page.mouse.move(finalX, finalInsertY, { steps: finalSteps });
  await page.waitForTimeout(100);
}

/**
 * 测试辅助函数：`beginAssistantHandleDrag`。
 *
 * @remarks
 * 触发 dnd-kit pointer drag 但不立刻松手，方便在真实浏览器里断言拖拽中的视觉状态。
 */
async function beginAssistantHandleDrag(page: Page, handleTestId: string) {
  await waitForAssistantDragReady(page);
  const handle = page.getByTestId(handleTestId);
  await expect(handle).toBeVisible();

  const handleBox = await handle.boundingBox();
  if (!handleBox) throw new Error('无法获取助手拖拽所需的 handle bounding box');

  const handleX = handleBox.x + handleBox.width / 2;
  const handleY = handleBox.y + handleBox.height / 2;
  const activationY = handleY + 18;

  await page.mouse.move(handleX, handleY);
  await page.mouse.down();
  await expect.poll(() => getAssistantRowsRenderMode(page)).toBe('static');
  await page.mouse.move(handleX, activationY, { steps: 6 });
  await waitForAssistantDragActive(page);

  return {
    currentX: handleX,
    currentY: activationY,
  };
}

/**
 * 测试辅助函数：`collectMessageBubbleLayoutMetrics`。
 *
 * @remarks
 * 用于在真实浏览器里确认头像、header 与正文在窄宽度下不会互相重叠。
 */
async function collectMessageBubbleLayoutMetrics(row: Locator) {
  return await row.evaluate((node) => {
    if (!(node instanceof HTMLElement)) return null;
    const avatar = node.firstElementChild;
    const header = node.querySelector<HTMLElement>('[data-testid^="message-header-"]');
    const surface = node.querySelector<HTMLElement>('[data-search-scope="true"]');
    if (!(avatar instanceof HTMLElement) || !header || !surface) return null;

    const avatarRect = avatar.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    const surfaceRect = surface.getBoundingClientRect();
    /**
     * 这里用矩形是否真正相交来判断“视觉互相挤压”，
     * 比只比 top/left 更稳，能同时覆盖头像、header、正文在窄宽度下的横向和纵向重叠。
     */
    const overlaps = (a: DOMRect, b: DOMRect) => !(
      a.right <= b.left
      || a.left >= b.right
      || a.bottom <= b.top
      || a.top >= b.bottom
    );

    return {
      avatarOverlapsHeader: overlaps(avatarRect, headerRect),
      avatarOverlapsSurface: overlaps(avatarRect, surfaceRect),
      headerBottom: headerRect.bottom,
      surfaceTop: surfaceRect.top,
      surfaceBottom: surfaceRect.bottom,
      rowBottom: node.getBoundingClientRect().bottom,
    };
  });
}

test.describe('Olyq — 对话框全链路冒烟', () => {
  test('话题：创建/重命名/置顶/话题 Prompt', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await expect(page.getByText('Olyq')).toBeVisible();

      // 新建话题（确保列表里至少 2 个，便于后续操作）
      await page.getByRole('button', { name: '新建话题' }).click();

      const firstTopic = page.locator('[data-topic-id]').first();
      await expect(firstTopic).toBeVisible();

      // 重命名：双击进入编辑
      await firstTopic.dblclick();
      const renameInput = firstTopic.locator('input');
      await expect(renameInput).toBeVisible();
      await renameInput.fill('E2E 话题');
      await renameInput.press('Enter');
      await expect(page.getByRole('heading', { name: 'E2E 话题' })).toBeVisible();
      const renamedTopic = page.locator('[data-topic-id]').filter({ hasText: 'E2E 话题' }).first();
            /**
       * 测试辅助函数：`openTopicMenu`。
       *
       * @remarks
       * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
       */
      const openTopicMenu = async () => {
        await page.keyboard.press('Escape').catch(() => undefined);
        await renamedTopic.click({ button: 'right' });
        const menu = page.getByRole('menu');
        await expect(menu).toBeVisible();
        return menu;
      };

      // 置顶：右键菜单
      const pinMenu = await openTopicMenu();
      const pinItem = pinMenu.getByRole('menuitem', { name: '置顶' });
      const unpinItem = pinMenu.getByRole('menuitem', { name: '取消置顶' });
      const canPin = await pinItem.isVisible().catch(() => false);
      if (canPin) {
        await pinItem.click();
      } else {
        await expect(unpinItem).toBeVisible();
        await page.keyboard.press('Escape');
      }

      const pinnedMenu = await openTopicMenu();
      await expect(pinnedMenu.getByRole('menuitem', { name: '取消置顶' })).toBeVisible();
      await page.keyboard.press('Escape');

      // 话题 Prompt
      const promptMenu = await openTopicMenu();
      await promptMenu.getByRole('menuitem', { name: '话题 Prompt' }).click();
      await expect(page.getByRole('heading', { name: '话题 Prompt' })).toBeVisible();
      await page.getByTestId('topic-prompt-input').fill('E2E Prompt');
      await page.getByTestId('topic-prompt-save').click();
      await expect(page.getByText('E2E Prompt')).toBeVisible();
    } finally {
      await closeExtension(h);
    }
  });

  test('侧边栏：删除话题会先确认，再在确认后删除', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await expect(page.getByText('Olyq')).toBeVisible();

      // 新建 → 重命名 → 触发删除确认
      await page.getByRole('button', { name: '新建话题' }).click();

      // 新建的话题默认会出现在列表顶部
      const topicRow = page.locator('[data-topic-id]').first();
      await expect(topicRow).toBeVisible();

      await topicRow.dblclick();
      const topicRenameInput = topicRow.locator('input');
      await expect(topicRenameInput).toBeVisible();
      await topicRenameInput.fill('E2E 删除话题');
      await topicRenameInput.press('Enter');
      await expect(page.locator('[data-topic-id]').filter({ hasText: 'E2E 删除话题' }).first()).toBeVisible();

      const topicRowByName = page.locator('[data-topic-id]').filter({ hasText: 'E2E 删除话题' }).first();
      await topicRowByName.click({ button: 'right' });
      const topicMenu = page.getByRole('menu');
      await expect(topicMenu).toBeVisible();
      await topicMenu.getByRole('menuitem', { name: '删除' }).click();
      const confirmDialog = page.getByRole('alertdialog');
      await expect(confirmDialog.getByRole('heading', { name: '删除话题' })).toBeVisible();
      await expect(page.locator('[data-topic-id]').filter({ hasText: 'E2E 删除话题' })).toHaveCount(1);
      await confirmDialog.getByRole('button', { name: '删除' }).click();
      await expect(page.locator('[data-topic-id]').filter({ hasText: 'E2E 删除话题' })).toHaveCount(0);
    } finally {
      await closeExtension(h);
    }
  });

  test('助手列表：拖拽 handle 可以真实重排，并在刷新后保持顺序', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      const passiveListenerErrors: string[] = [];
      page.on('console', (message) => {
        const text = message.text();
        if (text.includes('Unable to preventDefault inside passive event listener invocation')) {
          passiveListenerErrors.push(text);
        }
      });

      await expect(page.getByText('Olyq')).toBeVisible();

      await seedAssistantsInExtension(page, [
        makeAssistantSeed('assistant-1', '默认助手', 400),
        makeAssistantSeed('assistant-2', '代码助手', 300),
        makeAssistantSeed('assistant-3', '研究助手', 200),
        makeAssistantSeed('assistant-4', '翻译助手', 100),
      ]);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByText('Olyq')).toBeVisible();

      await openAssistantSidebar(page);
      await expect(page.getByTestId('assistant-row-assistant-1')).toBeVisible();
      await expect(page.getByTestId('assistant-row-assistant-2')).toBeVisible();

      await expect.poll(() => getAssistantRowOrder(page)).toEqual([
        'assistant-row-assistant-1',
        'assistant-row-assistant-2',
        'assistant-row-assistant-3',
        'assistant-row-assistant-4',
      ]);

      await dragAssistantHandleToRow(page, 'assistant-drag-handle-assistant-4', 'assistant-row-assistant-1');

      await expect.poll(() => getAssistantRowOrder(page)).toEqual([
        'assistant-row-assistant-4',
        'assistant-row-assistant-1',
        'assistant-row-assistant-2',
        'assistant-row-assistant-3',
      ]);

      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByText('Olyq')).toBeVisible();
      await openAssistantSidebar(page);

      await expect.poll(() => getAssistantRowOrder(page)).toEqual([
        'assistant-row-assistant-4',
        'assistant-row-assistant-1',
        'assistant-row-assistant-2',
        'assistant-row-assistant-3',
      ]);

      expect(passiveListenerErrors).toEqual([]);
    } finally {
      await closeExtension(h);
    }
  });

  test('助手列表：拖到目标助手上边缘时，松手前就会先投影到目标前，不会卡在原位', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;

      await expect(page.getByText('Olyq')).toBeVisible();

      await seedAssistantsInExtension(page, [
        makeAssistantSeed('assistant-1', '默认助手', 400),
        makeAssistantSeed('assistant-2', '代码助手', 300),
        makeAssistantSeed('assistant-3', '研究助手', 200),
        makeAssistantSeed('assistant-4', '翻译助手', 100),
      ]);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByText('Olyq')).toBeVisible();

      await openAssistantSidebar(page);
      await expect.poll(() => getAssistantRowOrder(page)).toEqual([
        'assistant-row-assistant-1',
        'assistant-row-assistant-2',
        'assistant-row-assistant-3',
        'assistant-row-assistant-4',
      ]);

      const dragState = await beginAssistantHandleDrag(page, 'assistant-drag-handle-assistant-4');
      const targetRow = page.getByTestId('assistant-row-assistant-1');
      const targetBox = await targetRow.boundingBox();
      if (!targetBox) throw new Error('无法获取目标助手行的 bounding box');

      const targetX = targetBox.x + targetBox.width / 2;
      const targetY = targetBox.y + Math.min(targetBox.height * 0.12, 6);
      await page.mouse.move(targetX, targetY, {
        steps: Math.max(8, Math.ceil(Math.abs(targetY - dragState.currentY) / 6)),
      });
      await page.waitForTimeout(120);

      await expect.poll(() => getAssistantRowOrder(page)).toEqual([
        'assistant-row-assistant-4',
        'assistant-row-assistant-1',
        'assistant-row-assistant-2',
        'assistant-row-assistant-3',
      ]);

      await page.mouse.up();
      await expect.poll(() => getAssistantRowOrder(page)).toEqual([
        'assistant-row-assistant-4',
        'assistant-row-assistant-1',
        'assistant-row-assistant-2',
        'assistant-row-assistant-3',
      ]);
    } finally {
      await closeExtension(h);
    }
  });

  test('助手标签视图：只允许组内重排，并在刷新后保持组内顺序', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;

      await expect(page.getByText('Olyq')).toBeVisible();

      await seedAssistantsInExtension(page, [
        makeAssistantSeed('assistant-1', '写作助手', 400, { tags: ['写作'] }),
        makeAssistantSeed('assistant-2', '代码助手', 300, { tags: ['开发'] }),
        makeAssistantSeed('assistant-3', '审稿助手', 200, { tags: ['写作'] }),
      ]);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByText('Olyq')).toBeVisible();

      await openAssistantSidebar(page);
      await page.getByTestId('assistant-view-mode-tags').click();

      await expect.poll(() => getAssistantRowOrder(page)).toEqual([
        'assistant-row-assistant-1',
        'assistant-row-assistant-3',
        'assistant-row-assistant-2',
      ]);

      await dragAssistantHandleToRow(page, 'assistant-drag-handle-assistant-3', 'assistant-row-assistant-1');

      await expect.poll(() => getAssistantRowOrder(page)).toEqual([
        'assistant-row-assistant-3',
        'assistant-row-assistant-1',
        'assistant-row-assistant-2',
      ]);

      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByText('Olyq')).toBeVisible();
      await openAssistantSidebar(page);
      await page.getByTestId('assistant-view-mode-tags').click();

      await expect.poll(() => getAssistantRowOrder(page)).toEqual([
        'assistant-row-assistant-3',
        'assistant-row-assistant-1',
        'assistant-row-assistant-2',
      ]);
    } finally {
      await closeExtension(h);
    }
  });

  test('大助手列表：常态保持虚拟化，开始拖拽后临时切全量 DOM 仍可完成排序', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;

      await expect(page.getByText('Olyq')).toBeVisible();

      await seedAssistantsInExtension(page, Array.from({ length: 120 }, (_, index) => (
        makeAssistantSeed(
          `assistant-${index}`,
          `大列表助手 ${index}`,
          10_000 - index,
        )
      )));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByText('Olyq')).toBeVisible();

      await openAssistantSidebar(page);

      await expect.poll(() => getAssistantRowsRenderMode(page)).toBe('virtualized');
      await expect.poll(async () => (await getAssistantRowOrder(page)).length).toBeLessThan(120);

      const dragState = await beginAssistantHandleDrag(page, 'assistant-drag-handle-assistant-5');
      await expect.poll(() => getAssistantRowsRenderMode(page)).toBe('static');
      await expect.poll(async () => (await getAssistantRowOrder(page)).length).toBe(120);
      await continueAssistantHandleDragToRow(
        page,
        dragState,
        'assistant-drag-handle-assistant-5',
        'assistant-row-assistant-1',
        { settleProjectedRelation: false },
      );
      await page.mouse.up();

      await expect.poll(async () => {
        const order = await getAssistantRowOrder(page);
        const sourceIndex = order.indexOf('assistant-row-assistant-5');
        const targetIndex = order.indexOf('assistant-row-assistant-1');
        /**
         * 大列表用例只守“虚拟化切全量 DOM 后能完成真实重排”这个产品契约。
         *
         * dnd-kit optimistic sorting 的最终真源是 `source.sortable.index`；
         * 在全量 DOM 刚从虚拟窗口切出后，落到目标行前或后都属于同一目标邻域的有效排序结果，
         * 这里不把具体前后插入方向当成跨版本稳定契约。
         */
        return {
          movedNearTarget: sourceIndex >= 0
          && targetIndex >= 0
          && sourceIndex < 5
          && Math.abs(sourceIndex - targetIndex) <= 1,
          sourceIndex,
          targetIndex,
          firstRows: order.slice(0, 8),
        };
      }).toMatchObject({ movedNearTarget: true });
    } finally {
      await closeExtension(h);
    }
  });

  test('助手列表：连续两次拖拽不会串状态，第二次重排仍按最新顺序生效', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;

      await expect(page.getByText('Olyq')).toBeVisible();

      await seedAssistantsInExtension(page, [
        makeAssistantSeed('assistant-1', '默认助手', 400),
        makeAssistantSeed('assistant-2', '代码助手', 300),
        makeAssistantSeed('assistant-3', '研究助手', 200),
        makeAssistantSeed('assistant-4', '翻译助手', 100),
      ]);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByText('Olyq')).toBeVisible();

      await openAssistantSidebar(page);

      await expect.poll(() => getAssistantRowOrder(page)).toEqual([
        'assistant-row-assistant-1',
        'assistant-row-assistant-2',
        'assistant-row-assistant-3',
        'assistant-row-assistant-4',
      ]);

      await dragAssistantHandleToRow(page, 'assistant-drag-handle-assistant-4', 'assistant-row-assistant-1');

      await expect.poll(() => getAssistantRowOrder(page)).toEqual([
        'assistant-row-assistant-4',
        'assistant-row-assistant-1',
        'assistant-row-assistant-2',
        'assistant-row-assistant-3',
      ]);
      await expect(page.getByTestId('assistant-browser-rows')).toHaveAttribute('data-render-mode', 'static');

      await dragAssistantHandleToRow(page, 'assistant-drag-handle-assistant-1', 'assistant-row-assistant-3');

      await expect.poll(() => getAssistantRowOrder(page)).toEqual([
        'assistant-row-assistant-4',
        'assistant-row-assistant-2',
        'assistant-row-assistant-3',
        'assistant-row-assistant-1',
      ]);
    } finally {
      await closeExtension(h);
    }
  });

  test('助手列表：拖拽进行中 source 行会隐藏，只保留 overlay 这一份可见实体', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;

      await expect(page.getByText('Olyq')).toBeVisible();

      await seedAssistantsInExtension(page, [
        makeAssistantSeed('assistant-1', '默认助手', 400),
        makeAssistantSeed('assistant-2', '任务执行', 300),
        makeAssistantSeed('assistant-3', '研究助手', 200),
      ]);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByText('Olyq')).toBeVisible();

      await openAssistantSidebar(page);
      const sourceCard = page.getByTestId('assistant-card-assistant-2');
      const overlayCard = page.getByTestId('assistant-overlay-assistant-2');
      const targetRow = page.getByTestId('assistant-row-assistant-1');

      const dragState = await beginAssistantHandleDrag(page, 'assistant-drag-handle-assistant-2');
      const targetBox = await targetRow.boundingBox();
      if (!targetBox) throw new Error('无法获取拖拽目标行的 bounding box');

      const targetX = targetBox.x + targetBox.width / 2;
      const targetY = targetBox.y + Math.min(targetBox.height * 0.2, 14);
      await page.mouse.move(targetX, targetY, {
        steps: Math.max(8, Math.ceil(Math.abs(targetY - dragState.currentY) / 6)),
      });
      await page.waitForTimeout(120);

      await expect.poll(async () => {
        return await sourceCard.getAttribute('data-drag-visual-state');
      }).toBe('dragSource');
      await expect(overlayCard).toBeVisible();
      await expect.poll(async () => {
        return await sourceCard.evaluate((element) => Number.parseFloat(getComputedStyle(element).opacity));
      }).toBe(0);
      await expect.poll(async () => {
        return await page.locator('[data-testid="assistant-card-assistant-2"], [data-testid="assistant-overlay-assistant-2"]').evaluateAll((elements) => {
          return elements.filter((element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none'
              && style.visibility !== 'hidden'
              && Number.parseFloat(style.opacity || '1') > 0.01
              && rect.width > 0
            && rect.height > 0;
        }).length;
      });
      }).toBe(1);
      await expect(page.locator('[data-dnd-placeholder]')).toHaveCount(0);
      await expect(page.locator('[data-dnd-dragging]:not([data-dnd-overlay])')).toHaveCount(0);

      await page.mouse.up();
    } finally {
      await closeExtension(h);
    }
  });

  test('助手列表：松手后 overlay 会立即卸载，source 行恢复时不会和 overlay 重影', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;

      await expect(page.getByText('Olyq')).toBeVisible();

      await seedAssistantsInExtension(page, [
        makeAssistantSeed('assistant-1', '默认助手', 400),
        makeAssistantSeed('assistant-2', '任务执行', 300),
        makeAssistantSeed('assistant-3', '研究助手', 200),
      ]);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByText('Olyq')).toBeVisible();

      await openAssistantSidebar(page);
      const sourceCard = page.getByTestId('assistant-card-assistant-2');
      const overlayCard = page.getByTestId('assistant-overlay-assistant-2');
      const targetRow = page.getByTestId('assistant-row-assistant-1');

      const dragState = await beginAssistantHandleDrag(page, 'assistant-drag-handle-assistant-2');
      const targetBox = await targetRow.boundingBox();
      if (!targetBox) throw new Error('无法获取拖拽目标行的 bounding box');

      const targetX = targetBox.x + targetBox.width / 2;
      const targetY = targetBox.y + Math.min(targetBox.height * 0.2, 14);
      await page.mouse.move(targetX, targetY, {
        steps: Math.max(8, Math.ceil(Math.abs(targetY - dragState.currentY) / 6)),
      });
      await page.waitForTimeout(80);

      await expect(overlayCard).toBeVisible();
      await expect.poll(async () => {
        return await sourceCard.getAttribute('data-drag-visual-state');
      }).toBe('dragSource');
      await expect.poll(async () => {
        return await sourceCard.evaluate((element) => Number.parseFloat(getComputedStyle(element).opacity));
      }).toBe(0);
      await expect.poll(async () => {
        return await page.locator('[data-testid="assistant-card-assistant-2"], [data-testid="assistant-overlay-assistant-2"]').evaluateAll((elements) => {
          return elements.filter((element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none'
              && style.visibility !== 'hidden'
              && Number.parseFloat(style.opacity || '1') > 0.01
              && rect.width > 0
              && rect.height > 0;
          }).length;
        });
      }).toBe(1);

      await page.mouse.up();
      await expect(overlayCard).toHaveCount(0);
      await waitForAssistantDragReady(page);
      await expect.poll(async () => {
        return await sourceCard.getAttribute('data-drag-visual-state');
      }).toBe('idle');
      await expect.poll(async () => {
        return await sourceCard.evaluate((element) => Number.parseFloat(getComputedStyle(element).opacity));
      }).toBeGreaterThan(0.9);
      await expect.poll(async () => {
        return await page.locator('[data-testid="assistant-card-assistant-2"], [data-testid="assistant-overlay-assistant-2"]').evaluateAll((elements) => {
          return elements.filter((element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none'
              && style.visibility !== 'hidden'
              && Number.parseFloat(style.opacity || '1') > 0.01
              && rect.width > 0
              && rect.height > 0;
          }).length;
        });
      }).toBe(1);
      await expect(page.locator('[data-dnd-placeholder]')).toHaveCount(0);
      await expect(page.locator('[data-dnd-dragging], [data-dnd-dropping]')).toHaveCount(0);
    } finally {
      await closeExtension(h);
    }
  });

  test('基础对话：发送 → Mock 流式回复', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await expect(page.getByText('Olyq')).toBeVisible();

      await sendChatMessage(page, '你好，E2E');

      await expect(page.getByText('（来自 E2E Mock）')).toBeVisible();
    } finally {
      await closeExtension(h);
    }
  });

  test('长历史从底部连续上滚时不会回弹，回到底部后仍保持稳定布局', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await page.setViewportSize({ width: 760, height: 900 });
      await seedTopicStartup(page, buildHistoryMessages(90), { topicName: '滚动回归话题' });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: '滚动回归话题' })).toBeVisible({ timeout: 15_000 });

      const atBottom = await waitForChatScrollableBottom(page);
      expect(atBottom?.scrollTop ?? 0).toBeGreaterThan(0);

      const firstVisibleIndices: number[] = [];
      for (let step = 0; step < 3; step += 1) {
        await scrollChatTranscriptBy(page, -900);
        const snapshot = await readChatScrollState(page);
        expect(snapshot).not.toBeNull();
        firstVisibleIndices.push(snapshot?.firstVisibleIndex ?? -1);
      }

      expect(firstVisibleIndices[0]).toBeLessThan(atBottom?.firstVisibleIndex ?? Number.MAX_SAFE_INTEGER);
      expect(firstVisibleIndices[1]).toBeLessThanOrEqual(firstVisibleIndices[0] ?? Number.MAX_SAFE_INTEGER);
      expect(firstVisibleIndices[2]).toBeLessThanOrEqual(firstVisibleIndices[1] ?? Number.MAX_SAFE_INTEGER);

      const afterUp = await readChatScrollState(page);
      await page.waitForTimeout(400);
      const settled = await readChatScrollState(page);
      expect(settled?.scrollTop ?? Number.MAX_SAFE_INTEGER).toBeLessThanOrEqual((afterUp?.scrollTop ?? 0) + 6);

      const visibleRows = await collectChatTopLevelRows(page);
      expectChatTopLevelRowsStrictlyIncreasing(visibleRows);

      await scrollChatTranscriptBy(page, 1200);
      await scrollChatTranscriptBy(page, 1200);
      await scrollChatTranscriptBy(page, 1200);
      await expect.poll(async () => {
        const snapshot = await readChatScrollState(page);
        if (!snapshot) return Number.MAX_SAFE_INTEGER;
        return snapshot.scrollHeight - snapshot.clientHeight - snapshot.scrollTop;
      }).toBeLessThan(24);
    } finally {
      await closeExtension(h);
    }
  });

  test('聊天输入区：小屏空态 composer 保持紧凑并给历史区留出主要空间', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await page.setViewportSize({ width: 1280, height: 720 });
      await seedTopicStartup(page, buildHistoryMessages(36), { topicName: '输入区高度回归话题' });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: '输入区高度回归话题' })).toBeVisible({ timeout: 15_000 });
      await waitForChatScrollSettle(page);

      /**
       * 测试辅助函数：`expectComposerCompact`。
       *
       * @remarks
       * 直接读取 transcript 与 composer 的真实几何，保证空输入区不会在低高度视口下挤占历史阅读空间。
       */
      const expectComposerCompact = async () => {
        const metrics = await page.evaluate(() => {
          const scroll = document.querySelector('[data-testid="chat-scroll-root"]');
          const shell = document.querySelector('[data-chat-composer-shell]');
          const input = document.querySelector('[data-testid="chat-input"]');
          if (!(scroll instanceof HTMLElement) || !(shell instanceof HTMLElement) || !(input instanceof HTMLElement)) return null;
          const scrollRect = scroll.getBoundingClientRect();
          const shellRect = shell.getBoundingClientRect();
          const inputRect = input.getBoundingClientRect();
          return {
            scrollHeight: scrollRect.height,
            composerHeight: shellRect.height,
            inputHeight: inputRect.height,
            shellHeightVar: shell.style.getPropertyValue('--chat-composer-shell-height'),
            shellMinHeight: getComputedStyle(shell).minHeight,
            inputMinHeight: getComputedStyle(input).minHeight,
          };
        });
        expect(metrics).not.toBeNull();
        expect(metrics!.composerHeight).toBeLessThanOrEqual(150);
        expect(metrics!.inputHeight).toBeLessThanOrEqual(72);
        expect(metrics!.inputMinHeight).toBe('44px');
        expect(metrics!.shellHeightVar).toBe('124px');
        expect(Number.parseFloat(metrics!.shellMinHeight)).toBeLessThanOrEqual(150);
        expect(metrics!.scrollHeight).toBeGreaterThan(metrics!.composerHeight * 2.6);
      };

      /**
       * 测试辅助函数：`expectComposerControlsContained`。
       *
       * @remarks
       * 窄宽输入区通过更多菜单收纳次要工具，几何上必须保证发送区和更多入口
       * 仍留在 composer 外壳内部，不能再被圆角外壳裁掉。
       */
      const expectComposerControlsContained = async (viewportWidth: number) => {
        await page.setViewportSize({ width: viewportWidth, height: 720 });
        await page.waitForFunction((width) => window.innerWidth === width && window.innerHeight === 720, viewportWidth);
        await waitForChatScrollSettle(page);
        const metrics = await page.evaluate(() => {
          const shell = document.querySelector('[data-chat-composer-shell]');
          const toolbar = document.querySelector('[data-chat-input-toolbar]');
          const tools = document.querySelector('.chat-input-toolbar-tools');
          const actions = document.querySelector('.chat-input-toolbar-actions');
          const more = document.querySelector('[data-testid="chat-input-more-tools-trigger"]');
          const send = document.querySelector('[data-testid="chat-send"], [data-testid="chat-stop"]');
          const sendLabel = document.querySelector('.chat-input-send-label');
          if (
            !(shell instanceof HTMLElement)
            || !(toolbar instanceof HTMLElement)
            || !(tools instanceof HTMLElement)
            || !(actions instanceof HTMLElement)
            || !(more instanceof HTMLElement)
            || !(send instanceof HTMLElement)
          ) return null;
          const shellRect = shell.getBoundingClientRect();
          const toolbarRect = toolbar.getBoundingClientRect();
          const toolsRect = tools.getBoundingClientRect();
          const actionsRect = actions.getBoundingClientRect();
          const moreRect = more.getBoundingClientRect();
          const sendRect = send.getBoundingClientRect();
          const moreStyle = getComputedStyle(more);
          const sendLabelStyle = sendLabel instanceof HTMLElement ? getComputedStyle(sendLabel) : null;
          const sendLabelRect = sendLabel instanceof HTMLElement ? sendLabel.getBoundingClientRect() : null;
          return {
            shellBottom: shellRect.bottom,
            shellLeft: shellRect.left,
            shellRight: shellRect.right,
            toolbarBottom: toolbarRect.bottom,
            toolbarLeft: toolbarRect.left,
            toolbarRight: toolbarRect.right,
            toolbarWidth: toolbarRect.width,
            toolsRight: toolsRect.right,
            toolsWidth: toolsRect.width,
            actionsRight: actionsRect.right,
            moreBottom: moreRect.bottom,
            moreVisible: moreStyle.display !== 'none' && moreStyle.visibility !== 'hidden' && moreRect.width > 0 && moreRect.height > 0,
            sendBottom: sendRect.bottom,
            sendLeft: sendRect.left,
            sendRight: sendRect.right,
            sendLabelDisplay: sendLabelStyle?.display ?? '',
            sendLabelVisible: Boolean(
              sendLabel
              && sendLabelStyle
              && sendLabelRect
              && sendLabelStyle.display !== 'none'
              && sendLabelStyle.visibility !== 'hidden'
              && sendLabelRect.width > 0
              && sendLabelRect.height > 0,
            ),
          };
        });
        expect(metrics).not.toBeNull();
        expect(metrics!.moreVisible).toBe(true);
        expect(metrics!.toolbarLeft).toBeGreaterThanOrEqual(metrics!.shellLeft - 1);
        expect(metrics!.toolbarRight).toBeLessThanOrEqual(metrics!.shellRight + 1);
        expect(metrics!.toolbarBottom).toBeLessThanOrEqual(metrics!.shellBottom + 1);
        expect(metrics!.actionsRight).toBeGreaterThanOrEqual(metrics!.toolbarRight - 1);
        if (viewportWidth <= 360) {
          expect(metrics!.toolsWidth).toBeGreaterThanOrEqual(metrics!.toolbarWidth - 1);
          expect(metrics!.toolsRight).toBeGreaterThanOrEqual(metrics!.toolbarRight - 1);
        }
        expect(metrics!.moreBottom).toBeLessThanOrEqual(metrics!.shellBottom + 1);
        expect(metrics!.sendBottom).toBeLessThanOrEqual(metrics!.shellBottom + 1);
        expect(metrics!.sendLeft).toBeGreaterThanOrEqual(metrics!.shellLeft - 1);
        expect(metrics!.sendRight).toBeLessThanOrEqual(metrics!.shellRight + 1);
        expect(metrics!.sendLabelDisplay).not.toBe('none');
        expect(metrics!.sendLabelVisible).toBe(true);
      };

      await expectComposerCompact();

      await page.setViewportSize({ width: 480, height: 720 });
      await page.waitForFunction(() => window.innerWidth === 480 && window.innerHeight === 720);
      await waitForChatScrollSettle(page);
      await expectComposerCompact();
      await expectComposerControlsContained(480);
      await expectComposerControlsContained(360);
      await expectComposerControlsContained(320);
      await page.setViewportSize({ width: 480, height: 720 });
      await page.waitForFunction(() => window.innerWidth === 480 && window.innerHeight === 720);
      await waitForChatScrollSettle(page);

      const input = page.getByTestId('chat-input');
      await input.fill(['第一行', '第二行', '第三行', '第四行', '第五行'].join('\n'));
      await expect(input).toHaveValue(/第五行/);
      await input.click();
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.press('Backspace');

      await input.click();
      await page.keyboard.type('/快捷');
      const inlineQuickPanel = page.locator('[data-quick-panel-placement="inline"][data-quick-panel-variant="input-replica"]');
      await expect(inlineQuickPanel).toBeVisible({ timeout: 10_000 });
      await expect.poll(async () => inlineQuickPanel.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        const hitTarget = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return Boolean(hitTarget && (hitTarget === node || node.contains(hitTarget)));
      })).toBe(true);
      await page.keyboard.press('Escape');

      const shellAfterInteractions = await page.locator('[data-chat-composer-shell]').evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return { height: rect.height };
      });
      expect(shellAfterInteractions.height).toBeLessThanOrEqual(170);
    } finally {
      await closeExtension(h);
    }
  });

  test('聊天输入区：拖高 composer 后 textarea 占满工具栏外剩余空间', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await page.setViewportSize({ width: 1280, height: 720 });
      await seedTopicStartup(page, buildHistoryMessages(12), { topicName: '输入区拖拽高度话题' });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: '输入区拖拽高度话题' })).toBeVisible({ timeout: 15_000 });
      await waitForChatScrollSettle(page);

      const resizeHandle = page.getByRole('separator', { name: '拖拽调整输入框高度' });
      const handleBox = await resizeHandle.boundingBox();
      if (!handleBox) throw new Error('无法读取输入区 resize handle 几何');
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y - 240, { steps: 8 });
      await page.mouse.up();
      await expect.poll(async () => {
        return await page.locator('[data-chat-composer-shell]').evaluate((node) => node.getBoundingClientRect().height);
      }).toBeGreaterThanOrEqual(330);

      const metrics = await page.evaluate(() => {
        const shell = document.querySelector('[data-chat-composer-shell]');
        const input = document.querySelector('[data-testid="chat-input"]');
        const toolbar = document.querySelector('[data-chat-input-toolbar]');
        if (!(shell instanceof HTMLElement) || !(input instanceof HTMLElement) || !(toolbar instanceof HTMLElement)) return null;
        const shellRect = shell.getBoundingClientRect();
        const inputRect = input.getBoundingClientRect();
        const toolbarRect = toolbar.getBoundingClientRect();
        return {
          shellHeight: shellRect.height,
          inputHeight: inputRect.height,
          inputBottom: inputRect.bottom,
          toolbarTop: toolbarRect.top,
          toolbarBottom: toolbarRect.bottom,
          toolbarHeight: toolbarRect.height,
          emptyBelowToolbar: shellRect.bottom - toolbarRect.bottom,
        };
      });

      expect(metrics).not.toBeNull();
      expect(metrics!.inputHeight).toBeGreaterThan(metrics!.shellHeight - metrics!.toolbarHeight - 56);
      expect(metrics!.toolbarTop - metrics!.inputBottom).toBeGreaterThanOrEqual(0);
      expect(metrics!.toolbarTop - metrics!.inputBottom).toBeLessThanOrEqual(16);
      expect(metrics!.emptyBelowToolbar).toBeLessThanOrEqual(16);
    } finally {
      await closeExtension(h);
    }
  });

  test('右侧工具条：窄宽也直接保留完整 rail', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await expect(page.getByText('Olyq')).toBeVisible();

      /**
       * 测试辅助函数：`expectRightToolbarFullRailReachable`。
       *
       * @remarks
       * 右侧工具条的窄宽契约是“完整 rail 继续直接展示”：
       * - 不再按 viewport 整体隐藏；
       * - 不再把原本能放下的动作收进更多菜单；
       * - 页面根不产生横向滚动。
       */
      const expectRightToolbarFullRailReachable = async (viewportWidth: number) => {
        await page.setViewportSize({ width: viewportWidth, height: 720 });
        await page.waitForFunction((width) => window.innerWidth === width && window.innerHeight === 720, viewportWidth);
        await waitForChatScrollSettle(page);

        await expect(page.locator('[data-chat-right-toolbar]')).toBeVisible();
        await expect(page.getByTestId('toolbar-model-picker')).toBeVisible();
        await expect(page.getByTestId('toolbar-topic-settings')).toBeVisible();
        await expect(page.getByTestId('toolbar-clear-messages')).toBeVisible();
        await expect(page.getByTestId('toolbar-compare')).toBeVisible();
        await expect(page.getByTestId('toolbar-global-search')).toBeVisible();
        await expect(page.getByTestId('toolbar-export-topic')).toBeVisible();
        await expect(page.getByTestId('toolbar-launchpad')).toBeVisible();
        await expect(page.getByTestId('toolbar-element-picker')).toBeVisible();
        await expect(page.getByTestId('toolbar-screenshot-editor')).toBeVisible();
        await expect(page.getByTestId('toolbar-phrases')).toBeVisible();
        await expect(page.getByTestId('toolbar-translation')).toBeVisible();
        await expect(page.getByTestId('toolbar-extension-settings')).toBeVisible();
        await expect(page.getByTestId('toolbar-more-actions')).toHaveCount(0);

        const rootMetrics = await page.evaluate(() => ({
          documentScrollWidth: document.documentElement.scrollWidth,
          documentClientWidth: document.documentElement.clientWidth,
          bodyScrollWidth: document.body.scrollWidth,
          bodyClientWidth: document.body.clientWidth,
        }));
        expect(rootMetrics.documentScrollWidth).toBeLessThanOrEqual(rootMetrics.documentClientWidth + 1);
        expect(rootMetrics.bodyScrollWidth).toBeLessThanOrEqual(rootMetrics.bodyClientWidth + 1);

        await page.getByTestId('toolbar-translation').focus();
        await expect.poll(async () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.testid ?? null)).toBe('toolbar-translation');
      };

      await expectRightToolbarFullRailReachable(500);
      await expectRightToolbarFullRailReachable(420);
      await expectRightToolbarFullRailReachable(360);
    } finally {
      await closeExtension(h);
    }
  });

  test('侧栏中窄工作区使用 rail + floating，不再挤压聊天输入区宽度', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await page.setViewportSize({ width: 780, height: 720 });
      await seedTopicStartup(page, buildHistoryMessages(3), { topicName: '侧栏响应式话题' });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: '侧栏响应式话题' })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId('topic-sidebar-mini-rail')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId('topic-sidebar-panel')).toHaveCount(0);

      const beforeOpen = await page.locator('[data-chat-composer-shell]').evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, width: rect.width };
      });

      await page.getByTestId('topic-sidebar-rail-expand').click();
      await expect(page.getByTestId('topic-sidebar-floating-panel')).toBeVisible({ timeout: 10_000 });
      const floatingPanelBackdropFilter = await page.getByTestId('topic-sidebar-floating-panel').evaluate((node) => {
        const style = getComputedStyle(node);
        return style.backdropFilter || style.getPropertyValue('-webkit-backdrop-filter') || 'none';
      });
      const miniRailBackdropFilter = await page.getByTestId('topic-sidebar-mini-rail').evaluate((node) => {
        const style = getComputedStyle(node);
        return style.backdropFilter || style.getPropertyValue('-webkit-backdrop-filter') || 'none';
      });
      expect(floatingPanelBackdropFilter).toBe('none');
      expect(miniRailBackdropFilter).toBe('none');

      const afterOpen = await page.locator('[data-chat-composer-shell]').evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, width: rect.width };
      });
      expect(Math.abs(afterOpen.left - beforeOpen.left)).toBeLessThanOrEqual(1);
      expect(Math.abs(afterOpen.width - beforeOpen.width)).toBeLessThanOrEqual(1);

      await page.keyboard.press('Escape');
      await expect(page.getByTestId('topic-sidebar-floating-panel')).toHaveCount(0);

      await page.setViewportSize({ width: 1100, height: 720 });
      await page.waitForFunction(() => window.innerWidth === 1100 && window.innerHeight === 720);
      await expect(page.getByTestId('topic-sidebar-panel')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId('topic-sidebar-mini-rail')).toHaveCount(0);
    } finally {
      await closeExtension(h);
    }
  });

  test('页面元素引用：展开和收起历史引用卡不会改写当前滚动位置', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await page.setViewportSize({ width: 760, height: 900 });
      await seedTopicStartup(page, buildHistoryMessagesWithElementReference(), { topicName: '页面元素引用滚动话题' });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: '页面元素引用滚动话题' })).toBeVisible({ timeout: 15_000 });

      const atBottom = await waitForChatScrollableBottom(page);
      expect(atBottom?.scrollTop ?? 0).toBeGreaterThan(0);

      const toggle = page.getByTestId('message-context-reference-toggle').last();
      await expect(toggle).toBeVisible({ timeout: 15_000 });
      const beforeTop = await toggle.evaluate((node) => node.getBoundingClientRect().top);
      const beforeScroll = await readChatScrollState(page);

      await toggle.click();
      await page.waitForTimeout(180);
      const afterExpand = await readChatScrollState(page);
      const afterExpandTop = await toggle.evaluate((node) => node.getBoundingClientRect().top);
      const expandedText = await page.getByTestId('message-context-reference-body').last().evaluate((node) => node.textContent || '');
      expect(Math.abs((afterExpand?.scrollTop ?? 0) - (beforeScroll?.scrollTop ?? 0))).toBeLessThanOrEqual(12);
      expect(Math.abs(afterExpandTop - beforeTop)).toBeLessThanOrEqual(16);
      expect(expandedText).toContain('Bootstrap selected content');

      await toggle.click();
      await page.waitForTimeout(180);
      const afterCollapse = await readChatScrollState(page);
      const afterCollapseTop = await toggle.evaluate((node) => node.getBoundingClientRect().top);
      const bodyCountAfterCollapse = await page.getByTestId('message-context-reference-body').count();
      expect(Math.abs((afterCollapse?.scrollTop ?? 0) - (afterExpand?.scrollTop ?? 0))).toBeLessThanOrEqual(12);
      expect(Math.abs(afterCollapseTop - afterExpandTop)).toBeLessThanOrEqual(16);
      expect(bodyCountAfterCollapse).toBe(0);
    } finally {
      await closeExtension(h);
    }
  });

  test('选择元素：视觉区域引用只进入输入区卡片，不写入正文', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 15_000 });

      const { target, tabId } = await openPageToolTargetPage(h.context, page, '/element-visual', `
        <!doctype html>
        <html lang="zh-CN">
          <head><title>Chart Page</title></head>
          <body style="margin:40px;font-family:system-ui,sans-serif;">
            <h1>销售图表</h1>
            <canvas id="sales-chart" width="240" height="120" style="width:240px;height:120px;border:1px solid #94a3b8;background:#f8fafc;"></canvas>
            <script>
              const canvas = document.getElementById('sales-chart');
              const ctx = canvas.getContext('2d');
              ctx.fillStyle = '#e0f2fe';
              ctx.fillRect(0, 0, 240, 120);
              ctx.fillStyle = '#2563eb';
              ctx.fillRect(28, 70, 28, 34);
              ctx.fillRect(82, 48, 28, 56);
              ctx.fillRect(136, 28, 28, 76);
              ctx.fillRect(190, 58, 28, 46);
            </script>
          </body>
        </html>
      `);
      await startElementPickerForE2ETab(page, tabId);
      await target.bringToFront();
      await pickElementAndCommitForE2E(target, '#sales-chart');
      await page.bringToFront();

      const elementDraftCard = page.getByTestId('chat-input-element-draft-card');
      await expect(elementDraftCard).toBeVisible({ timeout: 10_000 });
      await expect(elementDraftCard.getByText('视觉区域 · canvas', { exact: true })).toBeVisible();
      await expect.poll(async () => page.getByTestId('chat-input').inputValue()).toBe('');
    } finally {
      await closeExtension(h);
    }
  });

  test('选择元素：细粒度文本元素进入输入区卡片，不写入正文', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 15_000 });

      const { target, tabId } = await openPageToolTargetPage(h.context, page, '/element-text', `
        <!doctype html>
        <html lang="zh-CN">
          <head><title>Article Page</title></head>
          <body style="margin:120px 40px 40px;font-family:system-ui,sans-serif;">
            <article id="card">
              <p id="copy">这段正文包含一个 <span id="target">重点词</span> 作为精细选择目标。</p>
            </article>
          </body>
        </html>
      `);
      await startElementPickerForE2ETab(page, tabId);
      await target.bringToFront();
      await pickElementAndCommitForE2E(target, '#target');
      await page.bringToFront();

      const elementDraftCard = page.getByTestId('chat-input-element-draft-card');
      await expect(elementDraftCard).toBeVisible({ timeout: 10_000 });
      await expect(elementDraftCard.getByText('文本 · span', { exact: true })).toBeVisible();
      await expect(elementDraftCard.getByText('文本 · span · 约 3 字')).toBeVisible();
      await expect.poll(async () => page.getByTestId('chat-input').inputValue()).toBe('');
    } finally {
      await closeExtension(h);
    }
  });

  test('网页截图：发送到对话后图片附件进入输入区', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 15_000 });

      const { target, tabId } = await openPageToolTargetPage(h.context, page, '/screenshot-chat', `
        <!doctype html>
        <html lang="zh-CN">
          <head><title>Screenshot Page</title></head>
          <body style="margin:0;font-family:system-ui,sans-serif;background:#f8fafc;">
            <main style="min-height:640px;padding:72px;background:linear-gradient(135deg,#e0f2fe 0%,#f8fafc 55%,#dcfce7 100%);">
              <section style="width:360px;border:1px solid #94a3b8;border-radius:16px;background:white;padding:24px;box-shadow:0 16px 40px rgba(15,23,42,.14);">
                <h1 style="margin:0 0 12px;color:#0f172a;">截图发送测试</h1>
                <p style="margin:0;color:#475569;">这块区域会被拖选并作为 PNG 附件进入 Olyq 输入区。</p>
              </section>
            </main>
          </body>
        </html>
      `);
      await target.bringToFront();
      await startScreenshotEditorForE2ETab(page, tabId);
      await target.bringToFront();
      await selectScreenshotRegionAndSendToChatForE2E(target);
      await page.bringToFront();

      const screenshotAttachment = page.locator('[data-chat-input-container] img[alt^="screenshot-"]').first();
      await expect(screenshotAttachment).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('已选 1 个附件')).toBeVisible();
      await expect.poll(async () => page.getByTestId('chat-input').inputValue()).toBe('');
    } finally {
      await closeExtension(h);
    }
  });

  test('网页截图：其它 tab 打开 sidepanel 会取消旧 tab 截图 overlay', async () => {
    const h = await launchExtension();
    let secondSidepanel: Page | null = null;
    try {
      const { page } = h;
      await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 15_000 });

      const { target, tabId } = await openPageToolTargetPage(h.context, page, '/screenshot-owner-cancel', `
        <!doctype html>
        <html lang="zh-CN">
          <head><title>Screenshot Owner Cancel</title></head>
          <body style="margin:0;font-family:system-ui,sans-serif;background:#f8fafc;">
            <main style="min-height:640px;padding:72px;">
              <section style="width:360px;border:1px solid #94a3b8;border-radius:16px;background:white;padding:24px;">
                <h1 style="margin:0 0 12px;color:#0f172a;">截图互斥测试</h1>
                <p style="margin:0;color:#475569;">另一个标签页打开 Sidepanel 后，这里的截图 overlay 必须退出。</p>
              </section>
            </main>
          </body>
        </html>
      `);
      await target.bringToFront();
      await startScreenshotEditorForE2ETab(page, tabId);
      await target.bringToFront();

      await expect.poll(async () => {
        return await target.evaluate(() => {
          const shadow = document.getElementById('__olyq_shadow_host__')?.shadowRoot;
          const editor = shadow?.querySelector<HTMLElement>('.screenshot-editor');
          return editor?.style.display === 'block';
        });
      }, { timeout: 15_000 }).toBe(true);

      secondSidepanel = await h.context.newPage();
      await secondSidepanel.goto(page.url(), { waitUntil: 'domcontentloaded' });
      await expect(secondSidepanel.getByText('Olyq')).toBeVisible({ timeout: 15_000 });
      await target.bringToFront();

      await expect.poll(async () => {
        return await target.evaluate(() => {
          const shadow = document.getElementById('__olyq_shadow_host__')?.shadowRoot;
          const editor = shadow?.querySelector<HTMLElement>('.screenshot-editor');
          return editor?.style.display !== 'block';
        });
      }, { timeout: 10_000 }).toBe(true);
    } finally {
      await secondSidepanel?.close().catch(() => undefined);
      await closeExtension(h);
    }
  });

  test('问答导航：下一问即使目标已部分可见也会重新锚定，flow 复用同一条 anchor jump', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await page.setViewportSize({ width: 760, height: 900 });
      await seedTopicStartup(page, buildAnchorNavigationMessages(), { topicName: '问答导航话题' });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: '问答导航话题' })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('第三问：给出总结')).toBeVisible({ timeout: 15_000 });
      await waitForChatScrollSettle(page);

      await revealChatNavigation(page);
      await pressFloatingNavButton(page, 'chat-nav-top');
      await expect.poll(async () => await page.getByTestId('chat-scroll-root').evaluate((node) => (
        node instanceof HTMLDivElement ? node.scrollTop : Number.MAX_SAFE_INTEGER
      ))).toBeLessThan(24);

      const beforeNext = await readMessageOffsetInChat(page, 'user-2');
      expect(beforeNext).not.toBeNull();
      expect(beforeNext?.topOffset ?? 0).toBeGreaterThan(180);
      const beforeNextGeometry = await readMessageFrameGeometryInChat(page, 'user-2');
      expect(beforeNextGeometry).not.toBeNull();
      expect(beforeNextGeometry?.navActive).toBe('false');

      await pressFloatingNavButton(page, 'chat-nav-next');
      await expect.poll(async () => await page.getByTestId('chat-nav-next').getAttribute('data-nav-active-index')).toBe('1');
      await expect.poll(async () => (await readMessageOffsetInChat(page, 'user-2'))?.topOffset ?? Number.MAX_SAFE_INTEGER).toBeLessThan(120);
      await expect.poll(async () => (await readMessageOffsetInChat(page, 'user-2'))?.topOffset ?? 0).toBeGreaterThan(20);
      await expect.poll(async () => Boolean(await readMessageFrameGeometryInChat(page, 'user-2'))).toBe(true);
      const afterNextGeometry = await readMessageFrameGeometryInChat(page, 'user-2');
      expect(afterNextGeometry?.navActive).toBe('true');
      expect(afterNextGeometry?.paddingLeft).toBe(beforeNextGeometry?.paddingLeft);
      expect(afterNextGeometry?.paddingRight).toBe(beforeNextGeometry?.paddingRight);
      expect(afterNextGeometry?.paddingTop).toBe(beforeNextGeometry?.paddingTop);
      expect(afterNextGeometry?.paddingBottom).toBe(beforeNextGeometry?.paddingBottom);
      expect(afterNextGeometry?.borderLeftWidth).toBe(beforeNextGeometry?.borderLeftWidth);
      expect(afterNextGeometry?.borderRightWidth).toBe(beforeNextGeometry?.borderRightWidth);
      expect(afterNextGeometry?.borderTopWidth).toBe(beforeNextGeometry?.borderTopWidth);
      expect(afterNextGeometry?.borderBottomWidth).toBe(beforeNextGeometry?.borderBottomWidth);
      expect(afterNextGeometry?.backgroundColor).toBe(beforeNextGeometry?.backgroundColor);
      expect(afterNextGeometry?.boxShadow).toBe(beforeNextGeometry?.boxShadow);
      expect(Math.abs((afterNextGeometry?.frameHeight ?? 0) - (beforeNextGeometry?.frameHeight ?? 0))).toBeLessThanOrEqual(1);
      expect(Math.abs((afterNextGeometry?.surfaceWidth ?? 0) - (beforeNextGeometry?.surfaceWidth ?? 0))).toBeLessThanOrEqual(1);
      expect(Math.abs((afterNextGeometry?.surfaceHeight ?? 0) - (beforeNextGeometry?.surfaceHeight ?? 0))).toBeLessThanOrEqual(1);
      expect(Math.abs((afterNextGeometry?.surfaceLeft ?? 0) - (beforeNextGeometry?.surfaceLeft ?? 0))).toBeLessThanOrEqual(1);

      await pressFloatingNavButton(page, 'chat-nav-next');
      await expect.poll(async () => await page.getByTestId('chat-nav-next').getAttribute('data-nav-active-index')).toBe('2');
      await expect.poll(async () => (await readMessageOffsetInChat(page, 'user-3'))?.topOffset ?? Number.MAX_SAFE_INTEGER).toBeLessThan(120);
      await expect.poll(async () => (await readMessageOffsetInChat(page, 'user-3'))?.topOffset ?? 0).toBeGreaterThan(20);

      await pressFloatingNavButton(page, 'chat-nav-flow');
      await expect(page.getByRole('dialog').getByText('第一问：请概述当前页面')).toBeVisible();
      await page.getByRole('button', { name: /第一问：请概述当前页面/ }).click();
      await expect(page.getByRole('dialog')).not.toBeVisible();
      await expect.poll(async () => (await readMessageOffsetInChat(page, 'user-1'))?.topOffset ?? Number.MAX_SAFE_INTEGER).toBeLessThan(120);
      /**
       * 第一问是列表首条消息，顶部锚点会被 `paddingStart=16` 的真实几何夹住。
       *
       * 说明：
       * - 问答导航默认仍然走 `start` 语义；
       * - 但当目标就是首条消息时，不存在再往上留出 20px+ 额外空白的空间；
       * - 这里直接按当前真实 top clamp 断言，避免测试反过来逼实现伪造第二套顶部补偿。
       */
      await expect.poll(async () => (await readMessageOffsetInChat(page, 'user-1'))?.topOffset ?? 0).toBeGreaterThan(8);
    } finally {
      await closeExtension(h);
    }
  });

  test('贴底 @slow 流式期间不会插入底部更新 banner', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await page.setViewportSize({ width: 760, height: 900 });
      await seedTopicStartup(page, buildHistoryMessages(36), { topicName: '贴底流式横幅防闪话题' });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: '贴底流式横幅防闪话题' })).toBeVisible({ timeout: 15_000 });

      await waitForChatScrollableBottom(page);
      await startBottomBannerInsertionObserver(page);
      await sendChatMessage(page, '@slow 贴底流式横幅防闪测试');
      await expect(page.getByTestId('chat-stop')).toBeVisible();
      await waitForChatScrollableBottom(page);
      await waitForTailMessageTextGrowth(page);

      const bannerInsertions = await stopBottomBannerInsertionObserver(page);
      expect(bannerInsertions).toBe(0);
      await expect(page.getByTestId('chat-scroll-bottom-banner')).toHaveCount(0);

      await finishStreamingIfNeeded(page);
    } finally {
      await closeExtension(h);
    }
  });

  test('流式回复期间用户上翻后不会被拉回底部且会显示底部更新 banner', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await page.setViewportSize({ width: 760, height: 900 });
      await seedTopicStartup(page, buildHistoryMessages(36), { topicName: '流式滚动锁话题' });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: '流式滚动锁话题' })).toBeVisible({ timeout: 15_000 });

      await sendChatMessage(page, '@slow 流式上翻锁测试');
      await expect(page.getByTestId('chat-stop')).toBeVisible();

      const beforeUp = await waitForChatScrollableBottom(page);
      await scrollChatTranscriptBy(page, -900);
      await scrollChatTranscriptBy(page, -900);

      await expect.poll(async () => (await readChatScrollState(page))?.scrollTop ?? Number.MAX_SAFE_INTEGER).toBeLessThan((beforeUp?.scrollTop ?? 0) - 80);
      const afterUp = await readChatScrollState(page);
      expect((afterUp?.scrollHeight ?? 0) - (afterUp?.clientHeight ?? 0) - (afterUp?.scrollTop ?? 0)).toBeGreaterThan(24);

      await page.waitForTimeout(800);
      const afterStreaming = await readChatScrollState(page);
      expect(afterStreaming?.scrollTop ?? Number.MAX_SAFE_INTEGER).toBeLessThanOrEqual((afterUp?.scrollTop ?? 0) + 6);
      await expect(page.getByTestId('chat-scroll-bottom-banner')).toBeVisible({ timeout: 15_000 });

      await page.getByTestId('chat-scroll-bottom-banner').click();
      await expect.poll(async () => {
        const snapshot = await readChatScrollState(page);
        if (!snapshot) return Number.MAX_SAFE_INTEGER;
        return snapshot.scrollHeight - snapshot.clientHeight - snapshot.scrollTop;
      }).toBeLessThan(24);
      await expect(page.getByTestId('chat-scroll-bottom-banner')).toHaveCount(0);

      await page.waitForTimeout(900);
      await expect.poll(async () => {
        const snapshot = await readChatScrollState(page);
        if (!snapshot) return Number.MAX_SAFE_INTEGER;
        return snapshot.scrollHeight - snapshot.clientHeight - snapshot.scrollTop;
      }).toBeLessThan(24);
      await expect(page.getByTestId('chat-scroll-bottom-banner')).toHaveCount(0);

      await finishStreamingIfNeeded(page);
    } finally {
      await closeExtension(h);
    }
  });

  test('流式回复期间小数 wheel 上翻意图不会被贴底跟随覆盖', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await page.setViewportSize({ width: 760, height: 900 });
      await seedTopicStartup(page, buildHistoryMessages(36), { topicName: '小数 wheel 滚动锁话题' });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: '小数 wheel 滚动锁话题' })).toBeVisible({ timeout: 15_000 });

      await sendChatMessage(page, '@slow 小数 wheel 上翻锁测试');
      await expect(page.getByTestId('chat-stop')).toBeVisible();

      const beforeIntent = await waitForChatScrollableBottom(page);
      const tailTextLengthBeforeIntent = await readTailMessageTextLength(page);
      await scrollChatTranscriptByFractionalWheel(page, -0.5);
      const afterIntent = await readChatScrollState(page);
      expect(afterIntent?.followBottomIntent, JSON.stringify({ beforeIntent, afterIntent })).toBe('false');
      await expect.poll(async () => (
        await readTailMessageTextLength(page)
      ) - tailTextLengthBeforeIntent, {
        timeout: 8_000,
        intervals: [100, 160, 220, 280, 340],
      }).toBeGreaterThanOrEqual(8);

      const afterStreaming = await readChatScrollState(page);
      expect(afterStreaming?.scrollTop ?? Number.MAX_SAFE_INTEGER, JSON.stringify({ beforeIntent, afterStreaming })).toBeLessThanOrEqual((beforeIntent?.scrollTop ?? 0) + 6);
      expect(afterStreaming?.followBottomIntent, JSON.stringify({ beforeIntent, afterStreaming })).toBe('false');
      expect(
        (afterStreaming?.scrollHeight ?? 0) - (afterStreaming?.clientHeight ?? 0) - (afterStreaming?.scrollTop ?? 0),
        JSON.stringify({ beforeIntent, afterStreaming }),
      ).toBeGreaterThan(0);
      expect(afterStreaming?.bottomBannerCount, JSON.stringify({ beforeIntent, afterStreaming })).toBe('1');
      await expect(page.getByTestId('chat-scroll-bottom-banner')).toBeVisible({ timeout: 15_000 });

      await page.getByTestId('chat-scroll-bottom-banner').click();
      await expect.poll(async () => {
        const snapshot = await readChatScrollState(page);
        if (!snapshot) return Number.MAX_SAFE_INTEGER;
        return snapshot.scrollHeight - snapshot.clientHeight - snapshot.scrollTop;
      }).toBeLessThan(24);
      await expect.poll(async () => (await readChatScrollState(page))?.followBottomIntent ?? 'false').toBe('true');
      await expect(page.getByTestId('chat-scroll-bottom-banner')).toHaveCount(0);

      await page.waitForTimeout(900);
      await expect.poll(async () => {
        const snapshot = await readChatScrollState(page);
        if (!snapshot) return Number.MAX_SAFE_INTEGER;
        return snapshot.scrollHeight - snapshot.clientHeight - snapshot.scrollTop;
      }).toBeLessThan(24);
      await expect(page.getByTestId('chat-scroll-bottom-banner')).toHaveCount(0);

      await finishStreamingIfNeeded(page);
    } finally {
      await closeExtension(h);
    }
  });

  test('流式回复期间拖拽右侧原生滚动条不会被贴底跟随覆盖', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await page.setViewportSize({ width: 760, height: 900 });
      await seedTopicStartup(page, buildHistoryMessages(36), { topicName: '原生滚动条拖拽锁话题' });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: '原生滚动条拖拽锁话题' })).toBeVisible({ timeout: 15_000 });

      await sendChatMessage(page, '@slow 原生滚动条拖拽锁测试');
      await expect(page.getByTestId('chat-stop')).toBeVisible();

      const beforeDrag = await waitForChatScrollableBottom(page);
      const tailTextLengthBeforeDrag = await readTailMessageTextLength(page);
      let afterDrag = beforeDrag;
      try {
        await holdChatTranscriptScrollbarUp(page, 4);

        await expect.poll(async () => (await readChatScrollState(page))?.scrollTop ?? Number.MAX_SAFE_INTEGER).toBeLessThan((beforeDrag?.scrollTop ?? 0) - 12);
        afterDrag = await readChatScrollState(page);
        expect(afterDrag?.followBottomIntent, JSON.stringify({ beforeDrag, afterDrag })).toBe('false');
        await expect.poll(async () => (
          await readTailMessageTextLength(page)
        ) - tailTextLengthBeforeDrag, {
          timeout: 8_000,
          intervals: [100, 160, 220, 280, 340],
        }).toBeGreaterThanOrEqual(8);

        const duringHeldStreaming = await readChatScrollState(page);
        expect(duringHeldStreaming?.scrollTop ?? Number.MAX_SAFE_INTEGER, JSON.stringify({ beforeDrag, afterDrag, duringHeldStreaming })).toBeLessThanOrEqual((afterDrag?.scrollTop ?? 0) + 6);
        expect(duringHeldStreaming?.followBottomIntent, JSON.stringify({ beforeDrag, afterDrag, duringHeldStreaming })).toBe('false');
      } finally {
        await page.mouse.up();
        await page.waitForTimeout(160);
      }

      const afterStreaming = await readChatScrollState(page);
      expect(afterStreaming?.scrollTop ?? Number.MAX_SAFE_INTEGER, JSON.stringify({ beforeDrag, afterDrag, afterStreaming })).toBeLessThanOrEqual((afterDrag?.scrollTop ?? 0) + 6);
      expect(afterStreaming?.followBottomIntent, JSON.stringify({ beforeDrag, afterDrag, afterStreaming })).toBe('false');
      expect(
        (afterStreaming?.scrollHeight ?? 0) - (afterStreaming?.clientHeight ?? 0) - (afterStreaming?.scrollTop ?? 0),
        JSON.stringify({ beforeDrag, afterDrag, afterStreaming }),
      ).toBeGreaterThan(12);
      await expect(page.getByTestId('chat-scroll-bottom-banner')).toBeVisible({ timeout: 15_000 });

      await page.getByTestId('chat-scroll-bottom-banner').click();
      await expect.poll(async () => {
        const snapshot = await readChatScrollState(page);
        if (!snapshot) return Number.MAX_SAFE_INTEGER;
        return snapshot.scrollHeight - snapshot.clientHeight - snapshot.scrollTop;
      }).toBeLessThan(24);
      await expect.poll(async () => (await readChatScrollState(page))?.followBottomIntent ?? 'false').toBe('true');
      await expect(page.getByTestId('chat-scroll-bottom-banner')).toHaveCount(0);

      await page.waitForTimeout(900);
      await expect(page.getByTestId('chat-scroll-bottom-banner')).toHaveCount(0);

      await finishStreamingIfNeeded(page);
    } finally {
      await closeExtension(h);
    }
  });

  test('展开思考过程后上翻阅读，reasoning 持续增长也不会把 transcript 拉回去', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await page.setViewportSize({ width: 760, height: 900 });
      await seedTopicStartup(page, buildHistoryMessages(36), { topicName: 'reasoning 滚动锁话题' });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'reasoning 滚动锁话题' })).toBeVisible({ timeout: 15_000 });

      await sendChatMessage(page, '@slow-reasoning 展开思考过程后上翻抖动测试');
      await expect(page.getByTestId('chat-stop')).toBeVisible();

      const reasoningTrigger = page.getByRole('button', { name: /思考/ }).first();
      await expect(reasoningTrigger).toBeVisible({ timeout: 15_000 });
      await reasoningTrigger.click();
      await expect(reasoningTrigger).toHaveAttribute('aria-expanded', 'true');

      const beforeUp = await waitForChatScrollableBottom(page);
      await scrollChatTranscriptBy(page, -900);
      await scrollChatTranscriptBy(page, -900);

      await expect.poll(async () => (await readChatScrollState(page))?.scrollTop ?? Number.MAX_SAFE_INTEGER).toBeLessThan((beforeUp?.scrollTop ?? 0) - 80);
      const afterUp = await readChatScrollState(page);
      expect((afterUp?.scrollHeight ?? 0) - (afterUp?.clientHeight ?? 0) - (afterUp?.scrollTop ?? 0)).toBeGreaterThan(24);

      await page.waitForTimeout(1000);
      const afterReasoningGrowth = await readChatScrollState(page);
      expect(afterReasoningGrowth?.scrollTop ?? Number.MAX_SAFE_INTEGER).toBeLessThanOrEqual((afterUp?.scrollTop ?? 0) + 6);

      const visibleRows = await collectChatTopLevelRows(page);
      expectChatTopLevelRowsStrictlyIncreasing(visibleRows);

      await expect(page.getByTestId('chat-scroll-bottom-banner')).toHaveCount(0);

      await finishStreamingIfNeeded(page);
    } finally {
      await closeExtension(h);
    }
  });

  test('流式回复期间点击 transcript 内容后也不会重新贴底', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await page.setViewportSize({ width: 760, height: 900 });
      await seedTopicStartup(page, buildHistoryMessages(36), { topicName: '流式点击锁话题' });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: '流式点击锁话题' })).toBeVisible({ timeout: 15_000 });

      await sendChatMessage(page, '@slow 流式点击锁测试');
      await expect(page.getByTestId('chat-stop')).toBeVisible();

      const beforeUp = await waitForChatScrollableBottom(page);
      await scrollChatTranscriptBy(page, -900);
      await scrollChatTranscriptBy(page, -900);

      await expect.poll(async () => (await readChatScrollState(page))?.scrollTop ?? Number.MAX_SAFE_INTEGER).toBeLessThan((beforeUp?.scrollTop ?? 0) - 80);
      const afterUp = await readChatScrollState(page);

      const clickedMsgId = await page.getByTestId('chat-scroll-root').evaluate((node) => {
        if (!(node instanceof HTMLDivElement)) return null;
        const viewportRect = node.getBoundingClientRect();
        const candidate = Array.from(node.querySelectorAll<HTMLElement>('[data-msg-id]'))
          .find((element) => {
            const rect = element.getBoundingClientRect();
            return rect.bottom > viewportRect.top + 64 && rect.top < viewportRect.bottom - 64;
          });
        return candidate?.dataset.msgId ?? null;
      });

      expect(clickedMsgId).toBeTruthy();
      await page.locator(`[data-msg-id="${clickedMsgId}"]`).click({ force: true });

      const afterClick = await readChatScrollState(page);
      expect(afterClick?.scrollTop ?? Number.MAX_SAFE_INTEGER).toBeLessThanOrEqual((afterUp?.scrollTop ?? 0) + 6);

      await page.waitForTimeout(900);
      const afterStreaming = await readChatScrollState(page);
      expect(afterStreaming?.scrollTop ?? Number.MAX_SAFE_INTEGER).toBeLessThanOrEqual((afterClick?.scrollTop ?? 0) + 6);

      await finishStreamingIfNeeded(page);
    } finally {
      await closeExtension(h);
    }
  });

  test('离底时点击底部更新横幅后会稳定停在最新位置，不会再回弹到旧阅读点', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await page.setViewportSize({ width: 760, height: 900 });
      await seedTopicStartup(page, buildHistoryMessages(36), { topicName: '底部更新横幅话题' });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: '底部更新横幅话题' })).toBeVisible({ timeout: 15_000 });

      const beforeUp = await waitForChatScrollableBottom(page);
      await scrollChatTranscriptBy(page, -900);
      await scrollChatTranscriptBy(page, -900);

      await expect.poll(async () => (await readChatScrollState(page))?.scrollTop ?? Number.MAX_SAFE_INTEGER).toBeLessThan((beforeUp?.scrollTop ?? 0) - 80);
      const detached = await readChatScrollState(page);
      expect((detached?.scrollHeight ?? 0) - (detached?.clientHeight ?? 0) - (detached?.scrollTop ?? 0)).toBeGreaterThan(24);

      await appendActiveConversationMessageForE2E(page, {
        id: 'assistant-e2e-bottom-banner-new-node',
        askId: 'ask-e2e-bottom-banner-new-node',
        role: 'assistant',
        modelId: 'openai/gpt-5.4',
        content: '这是一条离底阅读时追加的新消息节点，用于验证底部更新横幅。',
        status: 'success',
        createdAt: Date.now(),
      });

      await expect(page.getByTestId('chat-scroll-bottom-banner')).toBeVisible({ timeout: 15_000 });
      await page.getByTestId('chat-scroll-bottom-banner').click();

      await expect.poll(async () => {
        const snapshot = await readChatScrollState(page);
        if (!snapshot) return Number.MAX_SAFE_INTEGER;
        return snapshot.scrollHeight - snapshot.clientHeight - snapshot.scrollTop;
      }).toBeLessThan(24);
      await expect(page.getByTestId('chat-scroll-bottom-banner')).toHaveCount(0);

      await page.waitForTimeout(900);
      const settled = await readChatScrollState(page);
      expect((settled?.scrollHeight ?? 0) - (settled?.clientHeight ?? 0) - (settled?.scrollTop ?? 0)).toBeLessThan(24);
      await expect(page.getByTestId('chat-scroll-bottom-banner')).toHaveCount(0);
    } finally {
      await closeExtension(h);
    }
  });

  test('流式回复期间手动滚到底也会清掉底部更新 banner', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await page.setViewportSize({ width: 760, height: 900 });
      await seedTopicStartup(page, buildHistoryMessages(36), { topicName: '手动滚底清横幅话题' });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: '手动滚底清横幅话题' })).toBeVisible({ timeout: 15_000 });

      await sendChatMessage(page, '@slow 手动滚底清横幅测试');
      await expect(page.getByTestId('chat-stop')).toBeVisible();

      const beforeUp = await waitForChatScrollableBottom(page);
      await scrollChatTranscriptBy(page, -900);
      await scrollChatTranscriptBy(page, -900);

      await expect.poll(async () => (await readChatScrollState(page))?.scrollTop ?? Number.MAX_SAFE_INTEGER).toBeLessThan((beforeUp?.scrollTop ?? 0) - 80);
      await expect(page.getByTestId('chat-scroll-bottom-banner')).toBeVisible({ timeout: 15_000 });

      await scrollChatTranscriptBy(page, 20_000);
      await expect.poll(async () => {
        const snapshot = await readChatScrollState(page);
        if (!snapshot) return Number.MAX_SAFE_INTEGER;
        return snapshot.scrollHeight - snapshot.clientHeight - snapshot.scrollTop;
      }).toBeLessThan(24);
      await expect(page.getByTestId('chat-scroll-bottom-banner')).toHaveCount(0);

      await page.waitForTimeout(900);
      await expect(page.getByTestId('chat-scroll-bottom-banner')).toHaveCount(0);

      await finishStreamingIfNeeded(page);
    } finally {
      await closeExtension(h);
    }
  });

  test('离底阅读时发送新消息会立即跳到最新消息，并保持后续回复跟随', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await page.setViewportSize({ width: 760, height: 900 });
      await seedTopicStartup(page, buildHistoryMessages(36), { topicName: '离底发送跳底话题' });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: '离底发送跳底话题' })).toBeVisible({ timeout: 15_000 });

      const bottomBeforeUp = await waitForChatScrollableBottom(page);
      await scrollChatTranscriptBy(page, -900);
      await scrollChatTranscriptBy(page, -900);

      await expect.poll(async () => (await readChatScrollState(page))?.scrollTop ?? Number.MAX_SAFE_INTEGER).toBeLessThan((bottomBeforeUp?.scrollTop ?? 0) - 80);
      const detached = await readChatScrollState(page);
      expect((detached?.scrollHeight ?? 0) - (detached?.clientHeight ?? 0) - (detached?.scrollTop ?? 0)).toBeGreaterThan(24);

      await sendChatMessage(page, '@slow 离底发送跳底测试');
      await expect(page.getByTestId('chat-stop')).toBeVisible();

      await expect.poll(async () => {
        const snapshot = await readChatScrollState(page);
        if (!snapshot) return Number.MAX_SAFE_INTEGER;
        return snapshot.scrollHeight - snapshot.clientHeight - snapshot.scrollTop;
      }).toBeLessThan(24);

      await page.waitForTimeout(900);
      const afterStreaming = await readChatScrollState(page);
      expect((afterStreaming?.scrollHeight ?? 0) - (afterStreaming?.clientHeight ?? 0) - (afterStreaming?.scrollTop ?? 0)).toBeLessThan(24);

      await finishStreamingIfNeeded(page);
    } finally {
      await closeExtension(h);
    }
  });

  test('停止生成：@slow 流式中点击停止', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await expect(page.getByText('Olyq')).toBeVisible();

      await sendChatMessage(page, '@slow 停止测试');

      await expect(page.getByTestId('chat-stop')).toBeVisible();
      await page.getByTestId('chat-stop').click();

      // 停止后应回到“发送”状态
      await expect(page.getByTestId('chat-send')).toBeVisible();
    } finally {
      await closeExtension(h);
    }
  });

  test('模型选择弹窗：搜索/模型类型筛选/置顶/键盘选择/跳转模型管理', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await expect(page.getByText('Olyq')).toBeVisible();

      // 1) 打开模型选择弹窗（右侧工具条入口）
      await page.getByTestId('toolbar-model-picker').click();
      await expect(page.getByTestId('model-picker-search')).toBeVisible();

      // 2) 模型类型筛选：开启“推理”，确保不会出现无推理能力的模型（例如 openai/gpt-5-nano）
      await page.getByTestId('model-picker-type-reasoning').click();
      await expect(page.locator('[data-testid="model-picker-list"] [data-model-id="openai/gpt-5-nano"]')).toHaveCount(0);
      // 还原模型类型筛选，避免影响后续步骤
      await page.getByTestId('model-picker-type-reasoning').click();

      // 3) 搜索并选择 Claude（anthropic）——便于通过工具条缩写验证切换成功（C）
      await page.getByTestId('model-picker-search').fill('Claude');
      const firstClaude = page.locator('[data-testid="model-picker-list"] [data-model-id^="anthropic/"]').first();
      await expect(firstClaude).toBeVisible();
      await firstClaude.click();
      await expect(page.getByTestId('toolbar-model-picker')).toContainText('C');

      // 4) 置顶/取消置顶：在无搜索时 pin 一个模型，应出现“置顶”分组
      await page.getByTestId('toolbar-model-picker').click();
      const list = page.getByTestId('model-picker-list');
      const firstRow = page.locator('[data-testid="model-picker-list"] [data-model-id]').first();
      await firstRow.hover();
      await firstRow.getByTestId('model-picker-pin').click();
      await expect(list.getByText('置顶', { exact: true })).toBeVisible();
      const pinnedRow = list.locator('[data-model-key$="__pinned"]').first();
      await expect(pinnedRow).toBeVisible();
      await pinnedRow.getByTestId('model-picker-pin').click();
      await expect(list.getByText('置顶', { exact: true })).toHaveCount(0);

      // 5) 键盘选择：搜索 moonshot 后按 Enter 选择首项（工具条缩写应变为 M）
      await page.getByTestId('model-picker-search').fill('moonshot');
      await expect(page.locator('[data-testid="model-picker-list"] [data-model-id^="moonshot/"]').first()).toBeVisible();
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('toolbar-model-picker')).toContainText('M');

      // 6) 从弹窗跳转“模型管理”
      await page.getByTestId('toolbar-model-picker').click();
      await page.getByTestId('model-picker-list').getByRole('button', { name: '模型管理' }).first().click();
      await expect(page.getByPlaceholder('搜索模型平台...')).toBeVisible();
    } finally {
      await closeExtension(h);
    }
  });

  test('扩展设置：窄宽使用分类下拉，设置行不再把 label 挤成竖排', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await seedProvidersInExtension(page, [RESPONSIVE_MODEL_MANAGER_PROVIDER]);
      await seedResponsiveMemoryConfig(page);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.setViewportSize({ width: 820, height: 900 });
      await expect(page.getByTestId('toolbar-extension-settings')).toBeVisible();

      await page.getByTestId('toolbar-extension-settings').click();
      const dialog = page.getByRole('dialog', { name: '扩展设置' });
      await expect(dialog).toBeVisible();

      /**
       * 测试辅助函数：`expectNoHorizontalOverflow`。
       *
       * @remarks
       * 用于确认窄宽设置弹窗没有把页面根节点撑出横向滚动。
       */
      const expectNoHorizontalOverflow = async () => {
        const metrics = await page.evaluate(() => {
          const root = document.documentElement;
          return {
            rootScrollWidth: root.scrollWidth,
            rootClientWidth: root.clientWidth,
            bodyScrollWidth: document.body.scrollWidth,
          };
        });
        expect(metrics.rootScrollWidth).toBeLessThanOrEqual(metrics.rootClientWidth + 1);
        expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.rootClientWidth + 1);
      };

      /**
       * 测试辅助函数：`expectPanelLabelsReadable`。
       *
       * @remarks
       * 通过 label 的几何比例守住“不能被挤成逐字竖排”的视觉契约。
       */
      const expectPanelLabelsReadable = async (panelTestId: string, labels: string[]) => {
        const metrics = await page.getByTestId(panelTestId).evaluate((panel, targetLabels) => {
          /**
           * 测试辅助函数：`normalize`。
           *
           * @remarks
           * 在浏览器上下文内把候选节点文本收敛成可比较的单行字符串。
           */
          const normalize = (value: string | null | undefined) => String(value || '').replace(/\s+/g, ' ').trim();
          const elements = Array.from(panel.querySelectorAll<HTMLElement>('label,h3,h4,p,span,button'));
          return targetLabels.map((label) => {
            const candidates = elements
              .filter((element) => normalize(element.textContent) === label)
              .map((element) => {
                const rect = element.getBoundingClientRect();
                return {
                  text: label,
                  found: true,
                  width: rect.width,
                  height: rect.height,
                };
              })
              .sort((left, right) => right.width - left.width);
            return candidates[0] ?? { text: label, found: false, width: 0, height: 0 };
          });
        }, labels);

        for (const metric of metrics) {
          expect(metric.found).toBe(true);
          expect(metric.width).toBeGreaterThan(metric.height);
          expect(metric.height).toBeLessThanOrEqual(48);
        }
      };

      /**
       * 测试辅助函数：`expectCompactSelectValueInline`。
       *
       * @remarks
       * 守住自定义 Select trigger 内“图标 + label”必须横向同行，避免被 SelectTrigger 的默认 span 截断样式改成纵向排布。
       */
      const expectCompactSelectValueInline = async (valueTestId: string) => {
        const metrics = await page.getByTestId(valueTestId).evaluate((valueNode) => {
          const icon = valueNode.querySelector('svg');
          const label = valueNode.querySelector('span');
          const trigger = valueNode.closest('[role="combobox"]') ?? valueNode.closest('button');
          const valueRect = valueNode.getBoundingClientRect();
          const iconRect = icon?.getBoundingClientRect();
          const labelRect = label?.getBoundingClientRect();
          const triggerRect = trigger?.getBoundingClientRect();
          const styles = window.getComputedStyle(valueNode);
          return {
            display: styles.display,
            flexDirection: styles.flexDirection,
            hasIcon: Boolean(iconRect),
            hasLabel: Boolean(labelRect),
            iconCenterY: iconRect ? iconRect.top + iconRect.height / 2 : 0,
            labelCenterY: labelRect ? labelRect.top + labelRect.height / 2 : 1000,
            iconLeft: iconRect?.left ?? 0,
            labelLeft: labelRect?.left ?? 0,
            triggerHeight: triggerRect?.height ?? 0,
            valueHeight: valueRect.height,
          };
        });

        expect(metrics.display).toBe('flex');
        expect(metrics.flexDirection).toBe('row');
        expect(metrics.hasIcon).toBe(true);
        expect(metrics.hasLabel).toBe(true);
        expect(Math.abs(metrics.iconCenterY - metrics.labelCenterY)).toBeLessThanOrEqual(3);
        expect(metrics.labelLeft).toBeGreaterThan(metrics.iconLeft);
        expect(metrics.triggerHeight).toBeLessThanOrEqual(40);
        expect(metrics.valueHeight).toBeLessThanOrEqual(24);
      };

      /**
       * 测试辅助函数：`expectVisibleSwitchesKeepNativeSize`。
       *
       * @remarks
       * 扫描设置弹窗内当前可见 Switch，防止窄容器全宽按钮规则把 switch 轨道拉成整行。
       */
      const expectVisibleSwitchesKeepNativeSize = async () => {
        const metrics = await page.getByTestId('extension-settings-dialog').evaluate((dialogNode) => {
          const switches = Array.from(dialogNode.querySelectorAll<HTMLElement>('[role="switch"]'))
            .filter((node) => {
              const rect = node.getBoundingClientRect();
              const style = window.getComputedStyle(node);
              return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
            });
          return switches.map((node) => {
            const rect = node.getBoundingClientRect();
            const style = window.getComputedStyle(node);
            return {
              width: rect.width,
              height: rect.height,
              flexGrow: style.flexGrow,
              flexBasis: style.flexBasis,
            };
          });
        });

        expect(metrics.length).toBeGreaterThan(0);
        for (const metric of metrics) {
          expect(metric.width).toBeGreaterThanOrEqual(40);
          expect(metric.width).toBeLessThanOrEqual(52);
          expect(metric.height).toBeGreaterThanOrEqual(20);
          expect(metric.height).toBeLessThanOrEqual(32);
          expect(metric.flexGrow).toBe('0');
          expect(metric.flexBasis).toBe('auto');
        }
      };

      /**
       * 测试辅助函数：`expectMemorySettingsLayout`。
       *
       * @remarks
       * 用真实几何结果守住全局记忆模型帮助提示归属、选择器 shell 边界，以及启用开关固定在右侧槽位。
       */
      const expectMemorySettingsLayout = async () => {
        const metrics = await page.getByTestId('extension-settings-panel-memory').evaluate((panel) => {
          /**
           * 将 DOMRect 收敛成可序列化的布局指标。
           *
           * @param node - 浏览器上下文里的候选元素。
           * @returns 元素矩形；缺失元素返回 `null`，由外层断言给出具体失败原因。
           */
          const toRect = (node: Element | null | undefined) => {
            if (!node) return null;
            const rect = node.getBoundingClientRect();
            return {
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
              left: rect.left,
              width: rect.width,
              height: rect.height,
            };
          };
          const switchNode = panel.querySelector<HTMLElement>('[role="switch"]');
          const switchRow = switchNode?.closest<HTMLElement>('.memory-switch-row');
          const switchLead = switchRow?.querySelector<HTMLElement>('.settings-responsive-lead');
          const switchControl = switchNode?.closest<HTMLElement>('.memory-switch-control');
          const switchRect = toRect(switchNode);
          const switchRowRect = toRect(switchRow);
          const switchLeadRect = toRect(switchLead);
          const switchControlRect = toRect(switchControl);
          const switchColumns = switchRow ? window.getComputedStyle(switchRow).gridTemplateColumns : '';
          const switchVerticalOverlap = switchRect && switchLeadRect
            ? Math.min(switchRect.bottom, switchLeadRect.bottom) - Math.max(switchRect.top, switchLeadRect.top)
            : 0;
          const modelRows = [
            'memory-embedding-model-trigger',
            'memory-llm-model-trigger',
            'memory-rerank-model-trigger',
          ].map((triggerId) => {
            const trigger = panel.querySelector<HTMLElement>(`[data-testid="${triggerId}"]`);
            const clearId = triggerId.replace('-trigger', '-clear');
            const clear = panel.querySelector<HTMLElement>(`[data-testid="${clearId}"]`);
            const row = trigger?.closest<HTMLElement>('.memory-model-picker-row');
            const lead = row?.querySelector<HTMLElement>('.settings-responsive-lead');
            const labelShell = row?.querySelector<HTMLElement>('.memory-setting-label');
            const helpTrigger = labelShell?.querySelector<HTMLElement>('button');
            const field = trigger?.closest<HTMLElement>('.memory-model-picker-field');
            const shell = trigger?.closest<HTMLElement>('.memory-model-picker-shell');
            const legacyDescription = row?.querySelector<HTMLElement>('.memory-model-picker-description');
            const rowRect = toRect(row);
            const leadRect = toRect(lead);
            const labelShellRect = toRect(labelShell);
            const helpTriggerRect = toRect(helpTrigger);
            const fieldRect = toRect(field);
            const triggerRect = toRect(trigger);
            const shellRect = toRect(shell);
            const clearRect = toRect(clear);
            const helpVerticalOverlap = helpTriggerRect && labelShellRect
              ? Math.min(helpTriggerRect.bottom, labelShellRect.bottom) - Math.max(helpTriggerRect.top, labelShellRect.top)
              : 0;
            const leadFieldVerticalOverlap = leadRect && fieldRect
              ? Math.min(leadRect.bottom, fieldRect.bottom) - Math.max(leadRect.top, fieldRect.top)
              : 0;
            const fieldTopGap = leadRect && fieldRect ? fieldRect.top - leadRect.bottom : -999;
            return {
              triggerId,
              hasRow: Boolean(rowRect),
              hasLead: Boolean(leadRect),
              hasLabelShell: Boolean(labelShellRect),
              hasHelpTrigger: Boolean(helpTriggerRect),
              helpInLead: Boolean(lead && helpTrigger && lead.contains(helpTrigger)),
              helpOutsideField: Boolean(field && helpTrigger && !field.contains(helpTrigger)),
              hasLegacyDescription: Boolean(legacyDescription),
              labelIsInline: labelShellRect ? labelShellRect.width > labelShellRect.height : false,
              helpVerticalOverlap,
              hasField: Boolean(fieldRect),
              hasTrigger: Boolean(triggerRect),
              hasShell: Boolean(shellRect),
              shellInsideField: Boolean(field && shell && field.contains(shell)),
              triggerInsideShell: Boolean(shell && trigger && shell.contains(trigger)),
              hasExternalClearButton: Boolean(clear && shell && !shell.contains(clear)),
              clearInsideShell: !clear || Boolean(shell && shell.contains(clear)),
              shellLeftGap: shellRect && fieldRect ? shellRect.left - fieldRect.left : -999,
              shellRightGap: shellRect && fieldRect ? fieldRect.right - shellRect.right : -999,
              rowLeftGap: shellRect && rowRect ? shellRect.left - rowRect.left : -999,
              rowRightGap: shellRect && rowRect ? rowRect.right - shellRect.right : -999,
              clearRightGap: clearRect && shellRect ? shellRect.right - clearRect.right : null,
              clearVerticalOverlap: clearRect && shellRect
                ? Math.min(clearRect.bottom, shellRect.bottom) - Math.max(clearRect.top, shellRect.top)
                : null,
              fieldTopGap,
              leadFieldVerticalOverlap,
            };
          });

          return {
            switch: {
              hasSwitch: Boolean(switchRect),
              hasRow: Boolean(switchRowRect),
              hasControl: Boolean(switchControlRect),
              columns: switchColumns,
              rightGap: switchRect && switchRowRect ? switchRowRect.right - switchRect.right : -999,
              controlRightGap: switchControlRect && switchRowRect ? switchRowRect.right - switchControlRect.right : -999,
              isToRightOfLead: switchRect && switchLeadRect ? switchRect.left > switchLeadRect.left : false,
              verticalOverlap: switchVerticalOverlap,
            },
            modelRows,
          };
        });

        expect(metrics.switch.hasSwitch).toBe(true);
        expect(metrics.switch.hasRow).toBe(true);
        expect(metrics.switch.hasControl).toBe(true);
        expect(metrics.switch.columns.trim().split(/\s+/).length).toBeGreaterThanOrEqual(2);
        expect(metrics.switch.rightGap).toBeGreaterThanOrEqual(-1);
        expect(metrics.switch.rightGap).toBeLessThanOrEqual(2);
        expect(metrics.switch.controlRightGap).toBeGreaterThanOrEqual(-1);
        expect(metrics.switch.controlRightGap).toBeLessThanOrEqual(2);
        expect(metrics.switch.isToRightOfLead).toBe(true);
        expect(metrics.switch.verticalOverlap).toBeGreaterThanOrEqual(8);
        expect(metrics.modelRows.some((row) => row.clearRightGap !== null)).toBe(true);
        for (const row of metrics.modelRows) {
          expect(row.hasRow).toBe(true);
          expect(row.hasLead).toBe(true);
          expect(row.hasLabelShell).toBe(true);
          expect(row.hasHelpTrigger).toBe(true);
          expect(row.helpInLead).toBe(true);
          expect(row.helpOutsideField).toBe(true);
          expect(row.hasLegacyDescription).toBe(false);
          expect(row.labelIsInline).toBe(true);
          expect(row.helpVerticalOverlap).toBeGreaterThanOrEqual(8);
          expect(row.hasField).toBe(true);
          expect(row.hasTrigger).toBe(true);
          expect(row.hasShell).toBe(true);
          expect(row.shellInsideField).toBe(true);
          expect(row.triggerInsideShell).toBe(true);
          expect(row.hasExternalClearButton).toBe(false);
          expect(row.clearInsideShell).toBe(true);
          expect(Math.abs(row.shellLeftGap)).toBeLessThanOrEqual(1);
          expect(Math.abs(row.shellRightGap)).toBeLessThanOrEqual(1);
          expect(row.rowLeftGap).toBeGreaterThanOrEqual(-1);
          expect(row.rowRightGap).toBeGreaterThanOrEqual(-1);
          if (row.clearRightGap !== null) {
            expect(row.clearRightGap).toBeGreaterThanOrEqual(3);
            expect(row.clearRightGap).toBeLessThanOrEqual(10);
          }
          if (row.clearVerticalOverlap !== null) expect(row.clearVerticalOverlap).toBeGreaterThanOrEqual(20);
          if (row.fieldTopGap >= 0) {
            expect(row.fieldTopGap).toBeLessThanOrEqual(12);
          } else {
            expect(row.leadFieldVerticalOverlap).toBeGreaterThanOrEqual(8);
          }
        }
      };

      /**
       * 测试辅助函数：`selectCompactSettingsCategory`。
       *
       * @remarks
       * 驱动窄宽设置分类 Select，并在每次切换后复用布局与可读性断言。
       */
      const selectCompactSettingsCategory = async (name: string, panelTestId: string, readableLabels: string[]) => {
        await page.getByTestId('extension-settings-compact-select').click();
        await page.getByRole('option', { name }).click();
        await expect(page.getByTestId(panelTestId)).toBeVisible();
        await expect(page.getByTestId(panelTestId)).toHaveAttribute('role', 'region');
        await expectNoHorizontalOverflow();
        await expectPanelLabelsReadable(panelTestId, readableLabels);
        await expectVisibleSwitchesKeepNativeSize();
      };

      const dialogMetrics = await dialog.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        const root = document.documentElement;
        return {
          left: rect.left,
          rightGap: root.clientWidth - rect.right,
          width: rect.width,
          viewportWidth: root.clientWidth,
          scrollWidth: root.scrollWidth,
          scrollHeight: root.scrollHeight,
          clientHeight: root.clientHeight,
        };
      });
      expect(dialogMetrics.left).toBeGreaterThanOrEqual(10);
      expect(dialogMetrics.rightGap).toBeGreaterThanOrEqual(10);
      expect(dialogMetrics.width).toBeLessThan(dialogMetrics.viewportWidth);
      expect(dialogMetrics.scrollWidth).toBeLessThanOrEqual(dialogMetrics.viewportWidth);

      const sideRailMetrics = await page.getByTestId('extension-settings-tab-nav').evaluate((node) => {
        const rect = node.getBoundingClientRect();
        const tabList = node.querySelector('[role="tablist"]');
        return {
          orientation: tabList?.getAttribute('aria-orientation') ?? null,
          width: rect.width,
        };
      });
      expect(sideRailMetrics.orientation).toBe('vertical');
      expect(sideRailMetrics.width).toBeGreaterThan(160);

      await page.getByTestId('extension-settings-tab-memory').click();
      await expect(page.getByTestId('extension-settings-panel-memory')).toBeVisible();
      await expect(page.getByTestId('memory-embedding-model-clear')).toBeVisible();
      await expectMemorySettingsLayout();

      await page.setViewportSize({ width: 480, height: 900 });
      await page.waitForFunction(() => window.innerWidth === 480);
      await expect(page.getByTestId('extension-settings-compact-select')).toBeVisible();
      await expect(page.getByTestId('extension-settings-tab-nav')).toHaveCount(0);
      await expect(page.getByTestId('extension-settings-tab-scroll')).toHaveCount(0);
      await expectNoHorizontalOverflow();
      await expectCompactSelectValueInline('extension-settings-compact-select-value');
      await expectVisibleSwitchesKeepNativeSize();

      await selectCompactSettingsCategory('模型与提示', 'extension-settings-panel-default-models', [
        '默认对话模型',
        '话题命名模型',
        '全局对话提示词',
      ]);
      await selectCompactSettingsCategory('模型管理', 'extension-settings-panel-models', [
        'API 密钥',
        'API 地址',
        '模型',
      ]);
      await selectCompactSettingsCategory('全局记忆', 'extension-settings-panel-memory', [
        'Embedding 模型',
        '记忆抽取模型',
        '检索数量 (Top-K)',
      ]);
      await expect(page.getByTestId('memory-embedding-model-clear')).toBeVisible();
      await expectMemorySettingsLayout();
      await selectCompactSettingsCategory('云同步', 'extension-settings-panel-cloud-sync', [
        '快照备份',
        '精简备份',
        '应用数据',
      ]);
      await expectCompactSelectValueInline('extension-settings-compact-select-value');
      await expectCompactSelectValueInline('cloud-sync-compact-select-value');
    } finally {
      await closeExtension(h);
    }
  });

  test('扩展设置：翻译语言 Popover 打开后只允许弹层内部滚动', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await page.setViewportSize({ width: 820, height: 640 });
      await expect(page.getByTestId('toolbar-extension-settings')).toBeVisible();

      await page.getByTestId('toolbar-extension-settings').click();
      await expect(page.getByRole('dialog', { name: '扩展设置' })).toBeVisible();
      await page.getByTestId('extension-settings-tab-chat-dialog').click();
      const panel = page.getByTestId('extension-settings-panel-chat-dialog');
      await expect(panel).toBeVisible();

      const settingsViewport = panel.locator('[data-slot="scroll-area-viewport"]').first();
      await expect(settingsViewport).toBeVisible();
      const viewportScrollable = await settingsViewport.evaluate((node) => {
        node.scrollTop = 0;
        return node.scrollHeight > node.clientHeight + 16;
      });
      expect(viewportScrollable).toBe(true);

      await page.getByTestId('chat-dialog-translate-languages-trigger').click();
      const languageList = page.getByTestId('chat-dialog-translate-language-list');
      await expect(languageList).toBeVisible();
      await page.waitForFunction(() => Number(document.body.getAttribute('data-scroll-locked') ?? '0') >= 2);

      const viewportBox = await settingsViewport.boundingBox();
      if (!viewportBox) throw new Error('无法读取对话设置滚动视口位置');
      await page.mouse.move(viewportBox.x + viewportBox.width / 2, viewportBox.y + viewportBox.height - 24);
      await page.mouse.wheel(0, 420);
      await page.waitForTimeout(120);
      await expect.poll(async () => settingsViewport.evaluate((node) => node.scrollTop)).toBe(0);

      const listScrollable = await languageList.evaluate((node) => {
        node.scrollTop = 0;
        return node.scrollHeight > node.clientHeight + 16;
      });
      expect(listScrollable).toBe(true);

      const listBox = await languageList.boundingBox();
      if (!listBox) throw new Error('无法读取翻译语言列表位置');
      await page.mouse.move(listBox.x + listBox.width / 2, listBox.y + listBox.height / 2);
      await page.mouse.wheel(0, 420);
      await expect.poll(async () => languageList.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
    } finally {
      await closeExtension(h);
    }
  });

  test('模型管理：480 窄宽模型行保持可读且不重叠', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await openModelManagerAtViewport(page, { width: 480, height: 720 });
      await expectModelManagerResponsiveLayout(page, 'stacked');
      await page.getByText('Reasoning', { exact: true }).click();
      await expect(page.getByTestId('model-manager-model-row-o3')).toHaveCount(0);
      await page.getByText('Reasoning', { exact: true }).click();
      await expect(page.getByTestId('model-manager-model-row-o3')).toBeVisible();
    } finally {
      await closeExtension(h);
    }
  });

  test('模型管理：640 窄宽模型行保持可读且不重叠', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await openModelManagerAtViewport(page, { width: 640, height: 720 });
      await expectModelManagerResponsiveLayout(page, 'stacked');
    } finally {
      await closeExtension(h);
    }
  });

  test('模型管理：820 低高度初始视图保留底部间距并内部滚动', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await openModelManagerAtViewport(page, { width: 820, height: 620 });
      const providerNav = page.getByTestId('model-manager-provider-nav');
      const providerDetail = page.getByTestId('model-manager-provider-detail');
      const providerScroll = page.getByTestId('model-manager-provider-scroll');
      const compactProviderSelect = page.getByTestId('model-manager-provider-compact-select');
      const settingsDialog = page.getByTestId('extension-settings-dialog');
      const providerDetailBody = page.getByTestId('model-manager-provider-detail-body');
      const modelList = page.getByTestId('model-manager-model-list');
      const modelListScroll = page.getByTestId('model-manager-model-list-scroll');
      const modelListContent = page.getByTestId('model-manager-model-list-content');
      await expect(providerNav).toBeVisible();
      await expect(providerDetail).toBeVisible();
      await expect(providerScroll).toBeHidden();
      await expect(compactProviderSelect).toBeVisible();
      await expect(settingsDialog).toBeVisible();
      await expect(providerDetailBody).toBeVisible();
      await expect(modelList).toBeVisible();
      await expect(modelListScroll).toBeVisible();
      await expect(modelListContent).toBeVisible();
      await expect(providerScroll).toHaveAttribute('data-scrollbars', 'vertical');

      const modelListMetrics = await modelList.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        const section = document.querySelector('[data-testid="model-manager-model-section"]');
        const sectionRect = section instanceof HTMLElement ? section.getBoundingClientRect() : null;
        const sectionStyle = section instanceof HTMLElement ? window.getComputedStyle(section) : null;
        return {
          height: rect.height,
          sectionHeight: sectionRect?.height ?? 0,
          sectionMinHeight: sectionStyle?.minHeight ?? '',
          minHeight: window.getComputedStyle(node).minHeight,
          className: node.getAttribute('class') ?? '',
        };
      });
      expect(modelListMetrics.minHeight).toBe('0px');
      expect(Number.parseFloat(modelListMetrics.sectionMinHeight)).toBeGreaterThanOrEqual(208);
      expect(modelListMetrics.sectionHeight).toBeGreaterThanOrEqual(208);
      expect(modelListMetrics.className).not.toContain('100dvh');
      expect(modelListMetrics.height).toBeGreaterThanOrEqual(140);

      const modelListContentMetrics = await modelListContent.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return {
          minHeight: window.getComputedStyle(node).minHeight,
          height: rect.height,
        };
      });
      expect(modelListContentMetrics.minHeight).toBe('0px');
      expect(modelListContentMetrics.height).toBeGreaterThan(modelListMetrics.height);

      const modelScrollMetrics = await modelListScroll.evaluate((node) => {
        if (!(node instanceof HTMLElement)) return null;
        return {
          clientHeight: node.clientHeight,
          scrollHeight: node.scrollHeight,
        };
      });
      expect(modelScrollMetrics).not.toBeNull();
      expect(modelScrollMetrics!.scrollHeight).toBeGreaterThan(modelScrollMetrics!.clientHeight);

      const detailBodyScrollMetrics = await providerDetailBody.evaluate((node) => {
        if (!(node instanceof HTMLElement)) return null;
        return {
          clientHeight: node.clientHeight,
          scrollHeight: node.scrollHeight,
          overflowY: window.getComputedStyle(node).overflowY,
        };
      });
      expect(detailBodyScrollMetrics).not.toBeNull();
      expect(detailBodyScrollMetrics!.overflowY).toBe('auto');

      const initialModelListVisibilityMetrics = await page.evaluate(() => {
        const body = document.querySelector('[data-testid="model-manager-provider-detail-body"]');
        const list = document.querySelector('[data-testid="model-manager-model-list"]');
        const scroll = document.querySelector('[data-testid="model-manager-model-list-scroll"]');
        const safeArea = document.querySelector('[data-testid="model-manager-provider-detail-bottom-safe-area"]');
        if (
          !(body instanceof HTMLElement)
          || !(list instanceof HTMLElement)
          || !(scroll instanceof HTMLElement)
          || !(safeArea instanceof HTMLElement)
        ) return null;
        const bodyRect = body.getBoundingClientRect();
        const listRect = list.getBoundingClientRect();
        const scrollRect = scroll.getBoundingClientRect();
        const safeAreaRect = safeArea.getBoundingClientRect();
        const safeAreaStyle = window.getComputedStyle(safeArea);
        const visibleModelRowCount = Array.from(document.querySelectorAll('[data-testid^="model-manager-model-row-"]'))
          .filter((row): row is HTMLElement => row instanceof HTMLElement)
          .filter((row) => {
            const rect = row.getBoundingClientRect();
            return rect.bottom > scrollRect.top + 1 && rect.top < scrollRect.bottom - 1;
          }).length;
        return {
          listBottomGap: bodyRect.bottom - listRect.bottom,
          safeAreaBottomDelta: Math.abs(bodyRect.bottom - safeAreaRect.bottom),
          safeAreaHeight: safeAreaRect.height,
          safeAreaPointerEvents: safeAreaStyle.pointerEvents,
          visibleModelRowCount,
        };
      });
      expect(initialModelListVisibilityMetrics).not.toBeNull();
      expect(initialModelListVisibilityMetrics!.safeAreaBottomDelta).toBeLessThanOrEqual(1);
      expect(initialModelListVisibilityMetrics!.safeAreaHeight).toBeGreaterThanOrEqual(16);
      expect(initialModelListVisibilityMetrics!.safeAreaPointerEvents).toBe('none');
      expect(initialModelListVisibilityMetrics!.visibleModelRowCount).toBeGreaterThanOrEqual(2);

      await providerDetailBody.evaluate((node) => {
        if (node instanceof HTMLElement) node.scrollTop = node.scrollHeight;
      });
      await page.waitForTimeout(50);

      const modelListVisibilityMetrics = await page.evaluate(() => {
        const body = document.querySelector('[data-testid="model-manager-provider-detail-body"]');
        const list = document.querySelector('[data-testid="model-manager-model-list"]');
        const scroll = document.querySelector('[data-testid="model-manager-model-list-scroll"]');
        if (!(body instanceof HTMLElement) || !(list instanceof HTMLElement) || !(scroll instanceof HTMLElement)) return null;
        const bodyRect = body.getBoundingClientRect();
        const listRect = list.getBoundingClientRect();
        const scrollRect = scroll.getBoundingClientRect();
        const visibleModelRowCount = Array.from(document.querySelectorAll('[data-testid^="model-manager-model-row-"]'))
          .filter((row): row is HTMLElement => row instanceof HTMLElement)
          .filter((row) => {
            const rect = row.getBoundingClientRect();
            return rect.bottom > scrollRect.top + 1 && rect.top < scrollRect.bottom - 1;
          }).length;
        return {
          listBottomGap: bodyRect.bottom - listRect.bottom,
          visibleModelRowCount,
        };
      });
      expect(modelListVisibilityMetrics).not.toBeNull();
      expect(modelListVisibilityMetrics!.listBottomGap).toBeGreaterThanOrEqual(12);
      expect(modelListVisibilityMetrics!.visibleModelRowCount).toBeGreaterThanOrEqual(2);

      const splitLayout = await page.evaluate(() => {
        const nav = document.querySelector('[data-testid="model-manager-provider-nav"]');
        const detail = document.querySelector('[data-testid="model-manager-provider-detail"]');
        const root = document.documentElement;
        if (!(nav instanceof HTMLElement) || !(detail instanceof HTMLElement)) return null;
        const navRect = nav.getBoundingClientRect();
        const detailRect = detail.getBoundingClientRect();
        return {
          navBottom: navRect.bottom,
          detailTop: detailRect.top,
          navRight: navRect.right,
          detailLeft: detailRect.left,
          scrollWidth: root.scrollWidth,
          clientWidth: root.clientWidth,
          scrollHeight: root.scrollHeight,
          clientHeight: root.clientHeight,
        };
      });
      expect(splitLayout).not.toBeNull();
      expect(splitLayout!.navBottom).toBeLessThanOrEqual(splitLayout!.detailTop + 2);
      expect(splitLayout!.scrollWidth).toBeLessThanOrEqual(splitLayout!.clientWidth);
      await expectModelManagerResponsiveLayout(page, 'stacked');
    } finally {
      await closeExtension(h);
    }
  });

  test('模型管理：820 低高度空模型列表底部保留间距', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await openModelManagerAtViewport(page, { width: 820, height: 620 }, {
        providers: [EMPTY_MODEL_MANAGER_PROVIDER],
      });

      const providerDetailBody = page.getByTestId('model-manager-provider-detail-body');
      const modelList = page.getByTestId('model-manager-model-list');
      await expect(providerDetailBody).toBeVisible();
      await expect(modelList).toBeVisible();
      await expect(page.getByText('暂无模型')).toBeVisible();

      await providerDetailBody.evaluate((node) => {
        if (node instanceof HTMLElement) node.scrollTop = node.scrollHeight;
      });
      await page.waitForTimeout(50);

      const emptyListMetrics = await page.evaluate(() => {
        const body = document.querySelector('[data-testid="model-manager-provider-detail-body"]');
        const list = document.querySelector('[data-testid="model-manager-model-list"]');
        const root = document.documentElement;
        if (!(body instanceof HTMLElement) || !(list instanceof HTMLElement)) return null;
        const bodyRect = body.getBoundingClientRect();
        const listRect = list.getBoundingClientRect();
        const bodyStyle = window.getComputedStyle(body);
        return {
          listBottomGap: bodyRect.bottom - listRect.bottom,
          paddingBottom: Number.parseFloat(bodyStyle.paddingBottom),
          scrollPaddingBottom: bodyStyle.scrollPaddingBottom,
          rootScrollWidth: root.scrollWidth,
          rootClientWidth: root.clientWidth,
        };
      });
      expect(emptyListMetrics).not.toBeNull();
      expect(emptyListMetrics!.paddingBottom).toBeGreaterThanOrEqual(16);
      expect(emptyListMetrics!.scrollPaddingBottom).toBe('16px');
      expect(emptyListMetrics!.listBottomGap).toBeGreaterThanOrEqual(12);
      expect(emptyListMetrics!.rootScrollWidth).toBeLessThanOrEqual(emptyListMetrics!.rootClientWidth + 1);
    } finally {
      await closeExtension(h);
    }
  });

  test('模型管理：Vertex AI 低高度右侧详情区可滚到底', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await openModelManagerAtViewport(page, { width: 820, height: 680 }, {
        providers: [RESPONSIVE_MODEL_MANAGER_PROVIDER, VERTEX_MODEL_MANAGER_SCROLL_PROVIDER],
        providerId: 'vertexai',
      });

      const providerDetailBody = page.getByTestId('model-manager-provider-detail-body');
      await expect(providerDetailBody).toBeVisible();
      await expect(page.getByLabel('Private Key', { exact: true })).toBeAttached();

      const beforeScroll = await providerDetailBody.evaluate((node) => {
        if (!(node instanceof HTMLElement)) return null;
        const style = window.getComputedStyle(node);
        return {
          clientHeight: node.clientHeight,
          scrollHeight: node.scrollHeight,
          overflowX: style.overflowX,
          overflowY: style.overflowY,
        };
      });
      expect(beforeScroll).not.toBeNull();
      expect(beforeScroll!.overflowY).toBe('auto');
      expect(beforeScroll!.overflowX).toBe('hidden');
      expect(beforeScroll!.scrollHeight).toBeGreaterThan(beforeScroll!.clientHeight + 16);

      await page.evaluate(() => {
        document.getElementById('provider-detail-vertex-private-key')?.scrollIntoView({ block: 'center' });
      });
      await page.waitForTimeout(50);

      const privateKeyAccessMetrics = await page.evaluate(() => {
        const body = document.querySelector('[data-testid="model-manager-provider-detail-body"]');
        const privateKey = document.getElementById('provider-detail-vertex-private-key');
        if (!(body instanceof HTMLElement) || !(privateKey instanceof HTMLElement)) return null;
        const bodyRect = body.getBoundingClientRect();
        const privateKeyRect = privateKey.getBoundingClientRect();
        return {
          scrollTop: body.scrollTop,
          privateKeyVisibleInBody: privateKeyRect.top >= bodyRect.top - 1 && privateKeyRect.bottom <= bodyRect.bottom + 1,
        };
      });
      expect(privateKeyAccessMetrics).not.toBeNull();
      expect(privateKeyAccessMetrics!.scrollTop).toBeGreaterThanOrEqual(0);
      expect(privateKeyAccessMetrics!.privateKeyVisibleInBody).toBe(true);

      await providerDetailBody.evaluate((node) => {
        if (node instanceof HTMLElement) node.scrollTop = node.scrollHeight;
      });
      await page.waitForTimeout(50);

      const bottomMetrics = await page.evaluate(() => {
        const body = document.querySelector('[data-testid="model-manager-provider-detail-body"]');
        const modelSection = document.querySelector('[data-testid="model-manager-model-section"]');
        const modelList = document.querySelector('[data-testid="model-manager-model-list"]');
        const root = document.documentElement;
        if (!(body instanceof HTMLElement) || !(modelSection instanceof HTMLElement) || !(modelList instanceof HTMLElement)) {
          return null;
        }
        const bodyRect = body.getBoundingClientRect();
        const modelSectionRect = modelSection.getBoundingClientRect();
        const modelListRect = modelList.getBoundingClientRect();
        const apiBaseLabel = Array.from(document.querySelectorAll('label'))
          .find((label) => label.textContent?.includes('API 地址'));
        const apiBaseRect = apiBaseLabel instanceof HTMLElement
          ? apiBaseLabel.getBoundingClientRect()
          : null;

        return {
          scrollTop: body.scrollTop,
          scrollBottomGap: body.scrollHeight - body.clientHeight - body.scrollTop,
          apiBaseVisibleInBody: apiBaseRect
            ? apiBaseRect.top >= bodyRect.top - 1 && apiBaseRect.bottom <= bodyRect.bottom + 1
            : false,
          modelSectionVisibleInBody: modelSectionRect.top < bodyRect.bottom && modelSectionRect.bottom > bodyRect.top,
          modelListBottomGap: bodyRect.bottom - modelListRect.bottom,
          rootScrollWidth: root.scrollWidth,
          rootClientWidth: root.clientWidth,
        };
      });
      expect(bottomMetrics).not.toBeNull();
      expect(bottomMetrics!.scrollTop).toBeGreaterThan(0);
      expect(bottomMetrics!.scrollBottomGap).toBeLessThanOrEqual(2);
      expect(bottomMetrics!.apiBaseVisibleInBody).toBe(true);
      expect(bottomMetrics!.modelSectionVisibleInBody).toBe(true);
      expect(bottomMetrics!.modelListBottomGap).toBeGreaterThanOrEqual(12);
      expect(bottomMetrics!.rootScrollWidth).toBeLessThanOrEqual(bottomMetrics!.rootClientWidth + 1);
    } finally {
      await closeExtension(h);
    }
  });

  test('模型管理：桌面宽度保留左右分栏布局', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await openModelManagerAtViewport(page, { width: 1280, height: 900 });

      const desktopLayout = await page.evaluate(() => {
        const nav = document.querySelector('[data-testid="model-manager-provider-nav"]');
        const detail = document.querySelector('[data-testid="model-manager-provider-detail"]');
        const firstRow = document.querySelector<HTMLElement>('[data-testid^="model-manager-model-row-"]');
        const rowWithBadges = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="model-manager-model-row-"]'))
          .find((row) => row.querySelector<HTMLElement>('.model-manager-model-row-badges')?.firstElementChild);
        const title = rowWithBadges?.querySelector<HTMLElement>('.model-manager-model-row-title');
        const badges = rowWithBadges?.querySelector<HTMLElement>('.model-manager-model-row-badges');
        const badgeStrip = badges?.firstElementChild instanceof HTMLElement ? badges.firstElementChild : null;
        const actions = rowWithBadges?.querySelector<HTMLElement>('.model-manager-model-row-actions');
        if (!(nav instanceof HTMLElement) || !(detail instanceof HTMLElement)) return null;
        const navRect = nav.getBoundingClientRect();
        const detailRect = detail.getBoundingClientRect();
        const titleRect = title?.getBoundingClientRect();
        const badgeRect = badgeStrip?.getBoundingClientRect();
        const actionRect = actions?.getBoundingClientRect();
        return {
          navRight: navRect.right,
          detailLeft: detailRect.left,
          hasBadgeRow: Boolean(rowWithBadges && badgeStrip),
          badgeSameLine: badgeRect && titleRect ? Math.abs(badgeRect.top - titleRect.top) <= 8 : false,
          badgeRightOfTitle: badgeRect && titleRect ? badgeRect.left >= titleRect.right - 1 : false,
          badgeBeforeActions: badgeRect && actionRect ? badgeRect.right <= actionRect.left - 4 : false,
        };
      });
      expect(desktopLayout).not.toBeNull();
      expect(desktopLayout!.navRight).toBeLessThanOrEqual(desktopLayout!.detailLeft + 1);
      expect(desktopLayout!.hasBadgeRow).toBe(true);
      expect(desktopLayout!.badgeSameLine).toBe(true);
      expect(desktopLayout!.badgeRightOfTitle).toBe(true);
      expect(desktopLayout!.badgeBeforeActions).toBe(true);
    } finally {
      await closeExtension(h);
    }
  });

  test('模型管理与模型选择器：DeepSeek V3 基础款和子版本排序一致且不重复', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await seedProvidersInExtension(page, [
        {
          id: 'siliconflow',
          name: 'SiliconFlow',
          type: 'siliconflow',
          apiKey: '',
          apiHost: 'https://api.siliconflow.cn/v1',
          enabled: true,
          models: [
            { id: 'deepseek-ai/DeepSeek-V3.1-Terminus', name: 'DeepSeek V3.1 Terminus', group: 'deepseek-ai' },
            { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3', group: 'deepseek-ai', isDefault: true },
            { id: 'deepseek-ai/DeepSeek-V3.2', name: 'DeepSeek V3.2', group: 'deepseek-ai' },
          ],
        },
      ]);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByText('Olyq')).toBeVisible();

      await page.getByTestId('toolbar-extension-settings').click();
      await page.getByTestId('extension-settings-tab-models').click();
      await page.getByTestId('model-manager-provider-siliconflow').click();
      await expect(page.getByTestId('model-manager-model-list-content')).toBeVisible();

      const settingsOrder = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('[data-testid="model-manager-model-list-content"] .text-sm.font-medium.truncate'))
          .map((node) => node.textContent?.trim() || '')
          .filter(Boolean)
      });

      expect(settingsOrder).toEqual([
        'DeepSeek V3',
        'DeepSeek V3.1 Terminus',
        'DeepSeek V3.2',
      ]);

      await page.getByRole('button', { name: '关闭' }).click();
      await page.getByTestId('toolbar-model-picker').click();
      await expect(page.getByTestId('model-picker-search')).toBeVisible();
      await page.getByTestId('model-picker-search').fill('DeepSeek');

      const pickerOrder = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('[data-testid="model-picker-list"] [data-model-id]'))
          .map((node) => ({
            id: node.getAttribute('data-model-id') || '',
            text: node.textContent?.trim() || '',
          }))
          .filter((item) => item.id.includes('DeepSeek-V3'))
      });

      expect(pickerOrder.map((item) => item.id)).toEqual([
        'siliconflow/deepseek-ai/DeepSeek-V3',
        'siliconflow/deepseek-ai/DeepSeek-V3.1-Terminus',
        'siliconflow/deepseek-ai/DeepSeek-V3.2',
      ]);
      expect(new Set(pickerOrder.map((item) => item.id)).size).toBe(3);
    } finally {
      await closeExtension(h);
    }
  });

  test('推理控制：选择 DeepSeek V3.2 后切到开启，当前模型不应回退到 gpt-5.4', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;

      await seedProvidersInExtension(page, [DEEPSEEK_V32_PROVIDER]);
      await seedModelRegistryInExtension(page, buildDeepSeekV32ReasoningRegistry());
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByText('Olyq')).toBeVisible();

      await page.getByTestId('toolbar-model-picker').click();
      await expect(page.getByTestId('model-picker-search')).toBeVisible();
      await page.getByTestId('model-picker-search').fill('DeepSeek V3.2');

      const deepSeekOption = page.locator(
        '[data-testid="model-picker-list"] [data-model-id="siliconflow/siliconflow/deepseek-v3.2"] [role="option"]',
      );
      await expect(deepSeekOption).toBeVisible();
      await deepSeekOption.click();
      await expect(page.getByTestId('toolbar-model-picker')).toContainText('D');

      await expect(page.getByTestId('chat-reasoning-effort-trigger')).toBeVisible();
      await page.getByTestId('chat-reasoning-effort-trigger').click();
      await expect(page.getByTestId('chat-reasoning-effort-on')).toBeVisible();
      await expect(page.getByTestId('chat-reasoning-effort-high')).toHaveCount(0);
      await page.getByTestId('chat-reasoning-effort-on').click();
      await expect(page.getByTestId('toolbar-model-picker')).toContainText('D');

      await page.getByTestId('toolbar-model-picker').click();
      await expect(page.getByTestId('model-picker-search')).toBeVisible();
      await page.getByTestId('model-picker-search').fill('DeepSeek V3.2');
      await expect(deepSeekOption).toHaveAttribute('aria-selected', 'true');
    } finally {
      await closeExtension(h);
    }
  });

  test('多模型对比：选择 2 个模型 → 生成分组消息', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await expect(page.getByText('Olyq')).toBeVisible();

      // 先发一条用户消息，作为 MultiModelSelector 的“最近一次用户输入”
      await sendChatMessage(page, 'compare seed');
      await expect(page.getByText('（来自 E2E Mock）')).toBeVisible();

      // 打开多模型对比
      await page.getByTestId('toolbar-compare').click();
      await expect(page.getByRole('heading', { name: '多模型对比' })).toBeVisible();

      // 多模型对比现在复用“选择模型”同款弹窗列表
      const list = page.getByTestId('model-picker-list');
      const start = page.getByTestId('compare-start');

      // 选择列表里的若干个模型，直到“开始对比”可点击
      for (let i = 0; i < 6 && await start.isDisabled(); i += 1) {
        await list.locator('[data-model-id]').nth(i).click();
      }
      await expect(page.getByTestId('compare-start')).toBeEnabled();

      await page.getByTestId('compare-start').click();

      // 应出现分组消息容器
      await expect(page.locator('[data-testid="message-group"]')).toBeVisible();
    } finally {
      await closeExtension(h);
    }
  });

  test('聊天消息：切窄宽度后头像、header 与正文不会互相挤压重叠', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await expect(page.getByText('Olyq')).toBeVisible();

      await sendChatMessage(page, 'width regression seed');
      await expect(page.getByText('（来自 E2E Mock）')).toBeVisible();

      await page.setViewportSize({ width: 720, height: 900 });

      const userRow = page.locator('[data-msg-id]').filter({ hasText: 'width regression seed' }).first();
      const assistantRow = page.locator('[data-msg-id]').filter({ hasText: '（来自 E2E Mock）' }).last();
      await expect(userRow).toBeVisible();
      await expect(assistantRow).toBeVisible();

      const userMetrics = await collectMessageBubbleLayoutMetrics(userRow);
      const assistantMetrics = await collectMessageBubbleLayoutMetrics(assistantRow);

      expect(userMetrics).not.toBeNull();
      expect(assistantMetrics).not.toBeNull();
      expect(userMetrics!.avatarOverlapsHeader).toBe(false);
      expect(userMetrics!.avatarOverlapsSurface).toBe(false);
      expect(userMetrics!.headerBottom).toBeLessThanOrEqual(userMetrics!.surfaceTop + 1);
      expect(userMetrics!.surfaceBottom).toBeLessThanOrEqual(userMetrics!.rowBottom + 1);
      expect(assistantMetrics!.avatarOverlapsHeader).toBe(false);
      expect(assistantMetrics!.avatarOverlapsSurface).toBe(false);
      expect(assistantMetrics!.headerBottom).toBeLessThanOrEqual(assistantMetrics!.surfaceTop + 1);
      expect(assistantMetrics!.surfaceBottom).toBeLessThanOrEqual(assistantMetrics!.rowBottom + 1);
    } finally {
      await closeExtension(h);
    }
  });

  test('从 sidepanel 打开到新标签页后继续发送，长 markdown assistant 不会压住后续消息', async () => {
    const h = await launchExtension();
    try {
      const { context, page } = h;
      await expect(page.getByText('Olyq')).toBeVisible();

      await page.setViewportSize({ width: 1278, height: 1632 });
      await sendChatMessage(page, '@layout-markdown 首轮布局回归');
      await expect(page.getByText('页面主旨')).toBeVisible();
      await expect(page.getByText('（来自 E2E Mock）')).toBeVisible();
      await expect(page.getByTestId('chat-send')).toBeVisible();

      const newTabPromise = context.waitForEvent('page');
      await page.getByRole('button', { name: '在新标签页打开' }).click();
      const newTab = await newTabPromise;
      await newTab.waitForLoadState('domcontentloaded');
      await newTab.setViewportSize({ width: 1278, height: 1632 });
      await expect(newTab.getByText('页面主旨')).toBeVisible();
      await expect(newTab.getByTestId('chat-send')).toBeVisible();

      await sendChatMessage(newTab, '当前页面的设计规范');
      await expect(newTab.getByText('当前页面的设计规范')).toHaveCount(2);
      await expect(newTab.getByTestId('chat-send')).toBeVisible();

      const rows = await collectChatTopLevelRows(newTab);
      expectChatTopLevelRowsStrictlyIncreasing(rows);
    } finally {
      await closeExtension(h);
    }
  });

  test('多模型对比：窄宽度下 horizontal 列保持独立并通过横向滚动承载', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await expect(page.getByText('Olyq')).toBeVisible();

      await sendChatMessage(page, 'compare width seed');
      await expect(page.getByText('（来自 E2E Mock）')).toBeVisible();

      await page.getByTestId('toolbar-compare').click();
      await expect(page.getByRole('heading', { name: '多模型对比' })).toBeVisible();

      const list = page.getByTestId('model-picker-list');
      await list.locator('[data-model-id]').nth(0).click();
      await list.locator('[data-model-id]').nth(1).click();
      await list.locator('[data-model-id]').nth(2).click();
      await expect(page.getByTestId('compare-start')).toBeEnabled();
      await page.getByTestId('compare-start').click();

      const group = page.locator('[data-testid="message-group"]').last();
      await expect(group).toBeVisible();
      await group.getByRole('radio', { name: '横向' }).click();
      await page.setViewportSize({ width: 760, height: 900 });

      const rail = group.getByTestId('message-group-horizontal-rail');
      await expect(rail).toBeVisible();
      const metrics = await rail.evaluate((node) => {
        if (!(node instanceof HTMLElement)) return null;
        const viewport = node.parentElement;
        const columnRects = Array.from(node.querySelectorAll<HTMLElement>('[data-testid="message-group-horizontal-column"]'))
          .map((element) => element.getBoundingClientRect());
        const minColumnWidth = columnRects.length > 0
          ? Math.min(...columnRects.map((rect) => rect.width))
          : 0;
        const columnsAreSeparated = columnRects.every((rect, index, array) => (
          index === 0 || rect.left >= array[index - 1]!.right - 1
        ));

        return {
          clientWidth: viewport instanceof HTMLElement ? viewport.clientWidth : 0,
          scrollWidth: node.scrollWidth,
          minColumnWidth,
          columnsAreSeparated,
        };
      });

      expect(metrics).not.toBeNull();
      expect(metrics!.scrollWidth).toBeGreaterThan(metrics!.clientWidth);
      expect(metrics!.minColumnWidth).toBeGreaterThanOrEqual(288);
      expect(metrics!.columnsAreSeparated).toBe(true);
    } finally {
      await closeExtension(h);
    }
  });

  test('@mention：多选模型 → 发送 → 生成分组回复', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await expect(page.getByText('Olyq')).toBeVisible();

      // 1) 在输入框键入 '@'，应弹出输入区内联 quick panel
      await page.getByTestId('chat-input').click();
      await page.keyboard.type('@');
      await expect(page.getByText('选择模型').first()).toBeVisible();

      // 2) 选择两个模型：Claude + Moonshot
      await page.getByText('Claude Sonnet 4').click();
      await page.getByText('Moonshot v1 8K').click();
      await page.keyboard.press('Escape');

      // 3) 发送一条消息
      await page.getByTestId('chat-input').fill('mention e2e');
      await page.getByTestId('chat-send').click();

      // 4) 应出现分组消息，并能看到两条不同模型的 Mock 前缀
      const group = page.locator('[data-testid="message-group"]').last();
      await expect(group).toBeVisible();

      // 默认分组布局是 fold：一次只展示一个模型的内容，需要切换 tab 才能看到另一个模型的回复
      await expect(group.getByText('Mock(anthropic/')).toBeVisible();
      await group.locator('[data-testid="message-group-tab"][data-model-id^="moonshot/"]').click();
      await expect(group.getByText('Mock(moonshot/')).toBeVisible();
    } finally {
      await closeExtension(h);
    }
  });

  test('输入区 MCP：按钮锚点打开 → manual 子菜单 → 展示 Server 列表', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await seedMcpServersInExtension(page, [
        {
          id: 'e2e-mcp-fetch',
          name: 'E2E MCP Fetch',
          type: 'streamable-http',
          enabled: true,
          url: 'https://example.com/mcp',
          headers: {},
          oauth: {
            enabled: false,
            registrationStrategy: 'dynamic',
            scopes: [],
            tokenEndpointAuthMethod: 'none',
          },
        },
      ]);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByText('Olyq')).toBeVisible();

      const mcpTrigger = page.getByLabel('MCP 服务');
      await mcpTrigger.click();

      const popover = page.getByTestId('mcp-quick-panel-popover');
      await expect(popover).toBeVisible();

      const triggerBox = await mcpTrigger.boundingBox();
      const popoverBox = await popover.boundingBox();
      expect(triggerBox).not.toBeNull();
      expect(popoverBox).not.toBeNull();
      expect(popoverBox!.y).toBeLessThan(triggerBox!.y);
      expect(Math.abs(popoverBox!.x - triggerBox!.x)).toBeLessThan(20);

      await popover.getByText('手动（选择 Server）').click();
      await expect(popover.getByText('E2E MCP Fetch')).toBeVisible();

      await popover.getByText('E2E MCP Fetch').click();
      await expect(popover).toBeVisible();
    } finally {
      await closeExtension(h);
    }
  });

  test('消息菜单：提及模型（assistant）→ 选择模型 → 追加为分组回复', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await expect(page.getByText('Olyq')).toBeVisible();

      // 先发一条“单模型”消息（不带 mentions），用于验证“提及模型”会把同 askId 变成分组
      await sendChatMessage(page, 'menu mention seed');
      await expect(page.getByText('（来自 E2E Mock）')).toBeVisible();

      const assistantBubble = page.locator('[data-msg-id]').filter({ hasText: '（来自 E2E Mock）' }).last();
      await assistantBubble.getByLabel('提及模型').click();
      await expect(page.getByTestId('model-picker-search')).toBeVisible();

      // 选择一个不同 provider 的模型（moonshot）
      await page.getByTestId('model-picker-search').fill('moonshot');
      await page.locator('[data-testid="model-picker-list"] [data-model-id^="moonshot/"]').first().click();

      // 追加后应出现分组消息（同 askId 下 >=2 条 assistant）
      const group = page.locator('[data-testid="message-group"]').last();
      await expect(group).toBeVisible();
      await group.locator('[data-testid="message-group-tab"][data-model-id^="moonshot/"]').click();
      await expect(group.getByText('Mock(moonshot/')).toBeVisible();
    } finally {
      await closeExtension(h);
    }
  });

  test('消息菜单：重新发送（user）不会追加新回复（避免误变成分组）', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await expect(page.getByText('Olyq')).toBeVisible();

      await sendChatMessage(page, 'regen seed');
      await expect(page.getByText('（来自 E2E Mock）')).toBeVisible();
      await expect(page.locator('[data-testid="message-group"]')).toHaveCount(0);

      const userBubble = page.locator('[data-msg-id]').filter({ hasText: 'regen seed' }).first();
      await userBubble.hover();

      // confirmRegenerateMessage 默认为 true：自动接受 confirm 弹窗
      page.once('dialog', (d) => d.accept());
      await userBubble.getByLabel('重新发送').click();

      // 等待重新生成完成（输入区回到“发送”状态）
      await expect(page.getByTestId('chat-send')).toBeVisible();

      // 关键断言：重发应替换原回复，而不是追加新回复（否则会出现分组）
      await expect(page.locator('[data-testid="message-group"]')).toHaveCount(0);
    } finally {
      await closeExtension(h);
    }
  });

  test('翻译面板：打开 → 翻译 → 关闭', async () => {
    const h = await launchExtension();
    try {
      const { page } = h;
      await expect(page.getByText('Olyq')).toBeVisible();

      await page.getByTestId('toolbar-translation').click();
      await expect(page.getByText('翻译面板')).toBeVisible();
      const translationPanel = page.getByTestId('translation-panel');
      await expect(translationPanel).toBeVisible();
      const panelBox = await translationPanel.boundingBox();
      expect(panelBox).not.toBeNull();
      expect(panelBox!.x).toBeLessThan(500);
      expect(panelBox!.width).toBeGreaterThan(600);

      await page.getByPlaceholder('输入要翻译的文本…').fill('Hello world');
      await translationPanel.getByRole('button', { name: '翻译' }).click();

      await expect(page.getByText('（来自 E2E Mock）')).toBeVisible();

      // 关闭翻译面板（回到聊天）
      await translationPanel.getByRole('button', { name: '关闭' }).click();
      await expect(page.getByTestId('chat-input')).toBeVisible();
    } finally {
      await closeExtension(h);
    }
  });
});
