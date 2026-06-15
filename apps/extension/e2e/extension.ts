/**
 * 说明：`extension` 源码模块。
 *
 * 职责：
 * - 承载 `extension` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ExtensionHandle`、`seedProvidersInExtension`、`seedMcpServersInExtension` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ModelRegistryState } from '../src/lib/ai/model-registry/types';
import type { AwsBedrockConfig, ProviderApiOptions, ProviderType, VertexAiConfig } from '../src/lib/ai/types';
import { MESSAGES_DB_NAME } from '../src/lib/chat/messages-db';
import { MCP_SERVERS_STORAGE_KEY } from '../src/lib/mcp/constants';
import { MODEL_REGISTRY_STORAGE_KEY } from '../src/lib/ai/storage-keys';
import { ASSISTANTS_STORAGE_KEY } from '../src/lib/legal/preset-remediation';
import type { Assistant } from '../src/types/assistant';
import type { McpServerConfig } from '../src/types/mcp';
import {
  captureForegroundApp,
  parseExtensionIdFromUrl,
  resolveExtensionDistDir,
  resolveHeadlessMode,
  restoreForegroundApp,
} from './runtime';

/** 导出类型：`ExtensionHandle`。 */
export type ExtensionHandle = {
  context: BrowserContext;
  page: Page;
  extensionId: string;
  userDataDir: string;
};

/** 扩展启动选项。 */
type LaunchExtensionOptions = {
  /** 是否写入默认 E2E provider 种子。 */
  readonly seedDefaultProviders?: boolean;
  /** 是否优先加载 test/e2e 构建。 */
  readonly preferTestBuild?: boolean;
};

type E2EProviderModel = {
  id: string;
  name: string;
  group?: string;
  isDefault?: boolean;
};

type E2EProviderConfig = {
  id: string;
  name: string;
  type: ProviderType | string;
  apiKey: string;
  apiHost: string;
  anthropicApiHost?: string;
  apiVersion?: string;
  apiOptions?: ProviderApiOptions;
  enabled: boolean;
  models: E2EProviderModel[];
  bedrock?: AwsBedrockConfig;
  vertex?: VertexAiConfig;
};

/**
 * Playwright 持久化上下文中的 service worker 实例类型。
 *
 * @remarks
 * `BrowserContext['serviceWorkers']` 是一个返回数组的方法，不是数组属性；
 * 因此这里要先取 `ReturnType`，再拿其中的单个元素类型。
 */
type ExtensionServiceWorker = ReturnType<BrowserContext['serviceWorkers']>[number]

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
 * 导出函数：`seedProvidersInExtension`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function seedProvidersInExtension(page: Page, providers: E2EProviderConfig[]) {
  /**
   * 说明：
   * - 本项目已统一到 v1 storage key，所以 e2e 不能再依赖旧 profile 里的默认启用状态。
   * - 模型选择弹窗只展示 enabled provider；而默认 provider（除 OpenAI 外）均为 enabled:false。
   * - 为避免用例在“搜索 Claude/moonshot”时空列表超时，这里在启动阶段显式写入最小可用 provider 列表。
   *
   * 约束：
   * - 仅写入 v1 key；不做额外版本兼容。
   * - 只覆盖 e2e 需要的 provider（openai/anthropic/moonshot）。
   */
  const PROVIDERS_STORAGE_KEY = 'olyq.providers.v1';

  await page.evaluate(async ({ key, providers }) => {
    const chromeApi = (globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome;
    const storage = chromeApi?.storage?.local;
    if (!storage?.set) return;

    const existing = await new Promise<unknown>((resolve) => {
      if (!storage.get) {
        resolve([]);
        return;
      }
      storage.get([key], (items) => resolve(items[key]));
    });

    const currentList = Array.isArray(existing) ? existing : [];
    const overrideMap = new Map(
      providers
        .map((provider) => [String(provider.id || '').trim(), provider] as const)
        .filter(([id]) => Boolean(id)),
    );

    const nextList = currentList.map((provider) => {
      if (!provider || typeof provider !== 'object') return provider;
      const current = provider as Record<string, unknown>;
      const id = String(current.id || '').trim();
      const override = overrideMap.get(id);
      if (!override) return provider;
      overrideMap.delete(id);
      return {
        ...current,
        ...override,
        enabled: override.enabled,
        models: override.models,
      };
    });

    for (const override of overrideMap.values()) {
      nextList.push(override);
    }

    await new Promise<void>((resolve) => storage.set({ [key]: nextList }, () => resolve()));
  }, { key: PROVIDERS_STORAGE_KEY, providers });
}

/**
 * 导出函数：`seedMcpServersInExtension`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function seedMcpServersInExtension(page: Page, servers: McpServerConfig[]) {
  await page.evaluate(async ({ key, servers }) => {
    const chromeApi = (globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome;
    const storage = chromeApi?.storage?.local;
    if (!storage?.set) return;

    await new Promise<void>((resolve) => storage.set({ [key]: servers }, () => resolve()));
  }, { key: MCP_SERVERS_STORAGE_KEY, servers });
}

/**
 * 导出函数：`seedAssistantsInExtension`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function seedAssistantsInExtension(page: Page, assistants: Assistant[]) {
  await page.evaluate(async ({ key, assistants }) => {
    const chromeApi = (globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome;
    const storage = chromeApi?.storage?.local;
    if (!storage?.set) return;

    await new Promise<void>((resolve) => storage.set({ [key]: assistants }, () => resolve()));
  }, { key: ASSISTANTS_STORAGE_KEY, assistants });
}

/**
 * 导出函数：`seedModelRegistryInExtension`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function seedModelRegistryInExtension(page: Page, registry: ModelRegistryState) {
  await page.evaluate(async ({ key, registry }) => {
    const chromeApi = (globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome;
    const storage = chromeApi?.storage?.local;
    if (!storage?.set) return;

    await new Promise<void>((resolve) => storage.set({ [key]: registry }, () => resolve()));
  }, { key: MODEL_REGISTRY_STORAGE_KEY, registry });
}

/**
 * 测试辅助函数：`seedE2EProviders`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
async function seedE2EProviders(page: Page) {
  const providers: E2EProviderConfig[] = [
    {
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
        { id: 'text-embedding-3-large', name: 'Text Embedding 3 Large', group: 'Embedding' },
      ],
    },
    {
      id: 'anthropic',
      name: 'Anthropic',
      type: 'anthropic',
      apiKey: '',
      apiHost: 'https://api.anthropic.com',
      enabled: true,
      models: [
        { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', group: 'Chat', isDefault: true },
        { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', group: 'Chat' },
        { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', group: 'Chat' },
      ],
    },
    {
      id: 'moonshot',
      name: 'Moonshot AI',
      type: 'openai',
      apiKey: '',
      apiHost: 'https://api.moonshot.cn/v1',
      enabled: true,
      models: [
        { id: 'moonshot-v1-8k', name: 'Moonshot v1 8K', group: 'Chat', isDefault: true },
      ],
    },
  ];

  await seedProvidersInExtension(page, providers);
}

/**
 * 测试辅助函数：`waitForProviderStorageBootstrap`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
async function waitForProviderStorageBootstrap(page: Page) {
  await page.waitForFunction(async () => {
    const chromeApi = (globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome;
    const storage = chromeApi?.storage?.local;
    if (!storage?.get) return false;

    const value = await new Promise<unknown>((resolve) => {
      storage.get(['olyq.providers.v1'], (items) => resolve(items['olyq.providers.v1']));
    });

    return Array.isArray(value) && value.length > 0;
  }, { timeout: 10_000 });
}

/**
 * 测试辅助函数：`waitForSidepanelReady`。
 *
 * @remarks
 * 用于当前测试中的扩展启动稳定化，不作为运行时代码复用。
 */
async function waitForSidepanelReady(page: Page, sidepanelUrl: string) {
  const brand = page.getByText('Olyq');

  try {
    await brand.waitFor({ state: 'visible', timeout: 10_000 });
    return;
  } catch {
    // 说明：
    // - Playwright 顺序跑大量 persistent context 扩展用例时，偶发会拿到一个空白 sidepanel 文档；
    // - 当前仓库的 mock E2E 不需要保留这次空白页状态，因此这里直接重进一次同地址；
    // - 若第二次仍无法看到主品牌文案，就把失败留给后续断言，避免吞掉真实问题。
    await page.goto(sidepanelUrl, { waitUntil: 'domcontentloaded' });
    await brand.waitFor({ state: 'visible', timeout: 10_000 });
  }
}

/**
 * 测试辅助函数：`launchExtensionInternal`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
async function launchExtensionInternal(
  options?: LaunchExtensionOptions,
): Promise<ExtensionHandle> {
  const extPath = resolveExtensionDistDir({
    browser: 'chromium',
    preferTestBuild: options?.preferTestBuild ?? true,
  });
  mustExist(extPath);
  mustExist(path.join(extPath, 'manifest.json'));

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'olyq-e2e-'));
  const foregroundApp = captureForegroundApp();

  // 注意：Chrome 扩展在 Playwright 中通常要求 headed 模式（headless 下扩展不稳定/不可用）。
  const headless = resolveHeadlessMode();

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless,
    args: [
      `--disable-extensions-except=${extPath}`,
      `--load-extension=${extPath}`,
    ],
  });

  if (process.env.PW_EXTENSION_DEBUG === '1') {
        /**
     * 测试辅助函数：`attachWorkerConsole`。
     *
     * @remarks
     * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
     */
    const attachWorkerConsole = (worker: ExtensionServiceWorker) => {
      worker.on('console', (msg) => {
        console.log(`[sw.console.${msg.type()}] ${msg.text()}`);
      });
    };

    for (const worker of context.serviceWorkers()) attachWorkerConsole(worker);
    context.on('serviceworker', attachWorkerConsole);
  }

  // 等待 MV3 Service Worker 启动，以便拿到 extensionId
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
  const sidepanelUrl = `chrome-extension://${extensionId}/src/extension/sidepanel/index.html`;
  if (process.env.PW_EXTENSION_DEBUG === '1') {
    page.on('console', (msg) => {
      console.log(`[page.console.${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', (error) => {
      console.log(`[page.error] ${error.message}`);
    });
  }
  await page.goto(sidepanelUrl, { waitUntil: 'domcontentloaded' });
  restoreForegroundApp(foregroundApp);

  if (options?.seedDefaultProviders !== false) {
    await waitForProviderStorageBootstrap(page);
    await seedE2EProviders(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
  }

  await waitForSidepanelReady(page, sidepanelUrl);

  return { context, page, extensionId, userDataDir };
}

/**
 * 导出函数：`launchExtension`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function launchExtension(): Promise<ExtensionHandle> {
  return await launchExtensionInternal({
    seedDefaultProviders: true,
    preferTestBuild: true,
  });
}

/**
 * 导出函数：`launchExtensionForLive`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function launchExtensionForLive(): Promise<ExtensionHandle> {
  return await launchExtensionInternal({
    seedDefaultProviders: false,
    preferTestBuild: false,
  });
}

/**
 * 导出函数：`closeExtension`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function closeExtension(handle: ExtensionHandle) {
  await handle.context.close();
  try {
    fs.rmSync(handle.userDataDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

/**
 * 导出函数：`resetExtensionState`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function resetExtensionState(page: Page) {
  await page.evaluate(async ({ messagesDbName }) => {
    // localStorage
    try { localStorage.clear(); } catch { /* ignore */ }

    // chrome.storage.local
    const chromeApi = (globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome;
    const storage = chromeApi?.storage?.local;
    if (storage?.clear) {
      await new Promise<void>((resolve) => storage.clear(() => resolve()));
    }

    /**
 * 测试辅助函数：`deleteDb`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
// IndexedDB
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

    await deleteDb(messagesDbName);
    await deleteDb('olyq.attachments.v1');
    await deleteDb('olyq.local-backup.v1');
    await deleteDb('olyq-memory-v1');
    await deleteDb('olyq.persistence.workspace.v1');
    await deleteDb('olyq.persistence.coordinator.v1');
  }, { messagesDbName: MESSAGES_DB_NAME });

  await page.reload({ waitUntil: 'domcontentloaded' });
}
