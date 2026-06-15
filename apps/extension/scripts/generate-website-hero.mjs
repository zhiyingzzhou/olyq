import { chromium } from '@playwright/test';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(extensionRoot, '..', '..');
const outputDir = path.join(repoRoot, 'assets/product');
const outputStagingDir = path.join(outputDir, '.website-hero-next');
const screenshotViewport = { width: 1656, height: 930 };
const screenshotScale = 2;
const configuredHeroPageUrl = String(process.env.OLYQ_WEBSITE_HERO_URL || '').trim();

const messagesDb = {
  name: 'olyq.chat.v1',
  version: 1,
  store: 'topics',
};

const storageKeys = {
  assistants: 'olyq.assistants.v1',
  runtime: 'olyq.chat.runtime.v1',
  language: 'olyq.language.v1',
  theme: 'olyq.theme.v1',
  display: 'olyq.display-settings.v1',
  providers: 'olyq.providers.v1',
  chatSettings: 'olyq.chat.settings.v1',
  legalPresetRemediation: 'olyq.legal.preset-remediation.v1',
};

const heroSpecs = [
  { lang: 'zh', language: 'zh-CN', theme: 'light', fileName: 'olyq-hero-page-context-zh-light.png' },
  { lang: 'zh', language: 'zh-CN', theme: 'dark', fileName: 'olyq-hero-page-context-zh-dark.png' },
  { lang: 'en', language: 'en-US', theme: 'light', fileName: 'olyq-hero-page-context-en-light.png' },
  { lang: 'en', language: 'en-US', theme: 'dark', fileName: 'olyq-hero-page-context-en-dark.png' },
];

const now = 1_780_000_000_000;

const copy = {
  zh: {
    assistantName: '网页研究助手',
    assistantDescription: '围绕当前页面整理上下文、截图、搜索和模型对比。',
    activeTopic: 'Olyq 官网内容整理',
    topics: [
      'Olyq 官网内容整理',
      '页面上下文工作流',
      '模型服务与 MCP',
      '截图、OCR 与 Paint',
      '本地备份与隐私',
      'GitHub Releases 安装',
    ],
    userPrompt: '帮我把当前 Olyq 官网整理成一段给朋友看的产品介绍，重点说它能在浏览器里做什么。',
    referenceTitle: 'Olyq 官网',
    referenceText: 'Olyq 是开源、本地优先的浏览器侧边栏。它把网页正文、选区、截图、OCR、技术栈摘要、搜索、MCP 和多模型对比放在同一个话题里。当前版本通过 GitHub Releases 获取，可以在 Chrome 或 Chromium 里本地加载。',
    reasoning: '读取当前官网内容，提取页面上下文、模型服务、本地状态和安装方式这几条主线。',
    assistantReply: [
      'Olyq 是一个放在浏览器侧边栏里的开源助手。它可以把当前网页的正文、选区、元素引用、截图/OCR 和技术栈摘要整理成上下文，再交给你自己配置的模型继续追问。',
      '',
      '- 阅读网页：长文、文档、产品页和技术页可以直接在当前话题里拆解。',
      '- 处理素材：截图标注、OCR、Paint 和页面元素引用都围绕当前标签页展开。',
      '- 切换模型：可以配置 OpenAI、Anthropic、Gemini、OpenRouter、Ollama 或兼容服务。',
      '- 保留工作区：话题、消息、附件和备份默认先留在浏览器本地。',
      '',
      '如果只是想试用，先从 GitHub Releases 下载构建，再按文档在浏览器里加载扩展就可以开始。',
    ].join('\n'),
    input: '把这些内容再整理成三条适合发给朋友的要点...',
  },
  en: {
    assistantName: 'Web research assistant',
    assistantDescription: 'Organizes page context, screenshots, search, and model comparison around the current tab.',
    activeTopic: 'Olyq website overview',
    topics: [
      'Olyq website overview',
      'Page context workflow',
      'Model providers and MCP',
      'Screenshots, OCR, and Paint',
      'Local backup and privacy',
      'GitHub Releases install',
    ],
    userPrompt: 'Summarize this Olyq page for a friend who wants to know what the browser extension actually does.',
    referenceTitle: 'Olyq website',
    referenceText: 'Olyq is an open-source, local-first browser sidebar. It brings page text, selections, screenshots, OCR, technology summaries, search, MCP, and multi-model comparison into one topic. Current builds are available through GitHub Releases for local loading in Chrome or Chromium.',
    reasoning: 'Read the current website copy and extract the browser context, provider setup, local state, and install path.',
    assistantReply: [
      'Olyq is an open-source assistant that lives in the browser sidebar. It can collect the current page, selected text, element references, screenshots/OCR, and technology summaries, then send that context to the model providers you configure.',
      '',
      '- Read pages: long articles, docs, product pages, and technical pages can stay in the same topic.',
      '- Work with page material: screenshot markup, OCR, Paint, and element references stay close to the tab.',
      '- Choose providers: use OpenAI, Anthropic, Gemini, OpenRouter, Ollama, or compatible services.',
      '- Keep local state: topics, messages, attachments, and backups start in browser storage.',
      '',
      'To try it, download a build from GitHub Releases and load it locally in Chrome or Chromium.',
    ].join('\n'),
    input: 'Turn this into three short notes I can send to a friend...',
  },
};

function mustExist(targetPath) {
  if (!fs.existsSync(targetPath)) throw new Error(`Missing path: ${targetPath}`);
}

function resolveExtensionDistDir() {
  const candidates = [
    process.env.OLYQ_EXTENSION_DIST,
    path.join(extensionRoot, 'dist'),
    path.join(extensionRoot, 'dist-e2e'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const abs = path.resolve(candidate);
    if (fs.existsSync(path.join(abs, 'manifest.json'))) return abs;
  }

  throw new Error(`Cannot find Chromium extension build. Tried: ${candidates.join(', ')}`);
}

function parseExtensionIdFromUrl(url) {
  const match = /^chrome-extension:\/\/([^/]+)\//.exec(url);
  return match?.[1] ?? '';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildLocalHeroPageHtml(strings, lang) {
  const title = strings.referenceTitle;
  const langAttr = lang === 'zh' ? 'zh-CN' : 'en';
  const heading = lang === 'zh' ? 'Olyq 官网' : 'Olyq website';
  const subheading = lang === 'zh'
    ? '开源、本地优先的浏览器 AI 工作台'
    : 'An open-source, local-first browser AI workspace';
  const bullets = lang === 'zh'
    ? ['阅读当前网页', '整理截图、OCR 与元素引用', '接入自己的模型服务', '保留本地话题与附件']
    : ['Read the current page', 'Organize screenshots, OCR, and element references', 'Connect your own model providers', 'Keep topics and attachments local-first'];
  return `<!doctype html>
<html lang="${langAttr}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(strings.referenceText)}" />
    <style>
      :root { color-scheme: light dark; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { margin: 0; background: #f7fafc; color: #111827; }
      main { max-width: 880px; margin: 0 auto; padding: 72px 32px; }
      h1 { font-size: 48px; line-height: 1.08; margin: 0 0 16px; letter-spacing: -0.02em; }
      p { font-size: 19px; line-height: 1.75; margin: 0 0 20px; }
      ul { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; padding: 0; margin: 32px 0 0; list-style: none; }
      li { border: 1px solid #dbe4ea; border-radius: 14px; background: white; padding: 16px 18px; font-size: 15px; }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(heading)}</h1>
      <p>${escapeHtml(subheading)}</p>
      <p>${escapeHtml(strings.referenceText)}</p>
      <ul>${bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    </main>
  </body>
</html>`;
}

async function startLocalHeroPageServer(lang) {
  const strings = copy[lang];
  const html = buildLocalHeroPageHtml(strings, lang);
  const server = http.createServer((req, res) => {
    const url = req.url || '/';
    if (url === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(html);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Cannot resolve local website hero server port');
  }
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function resolveHeroWebsiteTabId(page, targetUrl) {
  const tabId = await page.evaluate(async (url) => {
    const chromeApi = globalThis.chrome;
    if (!chromeApi?.tabs?.query) throw new Error('chrome.tabs.query is unavailable');
    const tabs = await chromeApi.tabs.query({});
    const candidates = tabs
      .filter((tab) => typeof tab.id === 'number' && typeof tab.url === 'string')
      .filter((tab) => tab.url === url || tab.url.startsWith(`${url}?`) || tab.url.startsWith(`${url}#`));
    candidates.sort((left, right) => (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0));
    return candidates[0]?.id ?? null;
  }, targetUrl);
  if (typeof tabId !== 'number') throw new Error(`Cannot resolve website tab for ${targetUrl}`);
  return tabId;
}

async function requestBrowserContextMetadataForTab(page, tabId, targetUrl) {
  await page.evaluate(async ({ targetTabId, url }) => {
    const chromeApi = globalThis.chrome;
    if (!chromeApi?.runtime?.connect) throw new Error('chrome.runtime.connect is unavailable');
    const port = chromeApi.runtime.connect({ name: 'olyq:ui' });
    await new Promise((resolve, reject) => {
      const timeout = globalThis.setTimeout(() => {
        try {
          port.disconnect();
        } catch {
          // Port may already be closed by the extension runtime.
        }
        reject(new Error('Timed out waiting for browser context metadata update'));
      }, 10_000);
      const onMessage = (message) => {
        if (!message || typeof message !== 'object' || message.type !== 'browser-context/metadata/update') return;
        const payload = message.payload;
        if (payload && payload.tabId === targetTabId && typeof payload.url === 'string' && payload.url.startsWith(url)) {
          globalThis.clearTimeout(timeout);
          port.onMessage.removeListener(onMessage);
          try {
            port.disconnect();
          } catch {
            // The disconnect is only cleanup for this one-shot generation port.
          }
          resolve();
        }
      };
      port.onMessage.addListener(onMessage);
      port.postMessage({
        type: 'browser-context/metadata/request',
        payload: { tabId: targetTabId },
      });
    });
  }, { targetTabId: tabId, url: targetUrl });
}

function prepareWebsiteHeroStagingDir() {
  fs.rmSync(outputStagingDir, { recursive: true, force: true });
  fs.mkdirSync(outputStagingDir, { recursive: true });
}

function publishWebsiteHeroImages() {
  for (const spec of heroSpecs) {
    const stagedPath = path.join(outputStagingDir, spec.fileName);
    mustExist(stagedPath);
  }
  fs.mkdirSync(outputDir, { recursive: true });
  for (const spec of heroSpecs) {
    fs.copyFileSync(path.join(outputStagingDir, spec.fileName), path.join(outputDir, spec.fileName));
  }
  fs.rmSync(outputStagingDir, { recursive: true, force: true });
}

function buildProviders() {
  return [
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
        { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', group: 'Chat' },
      ],
    },
    {
      id: 'ollama',
      name: 'Ollama',
      type: 'ollama',
      apiKey: '',
      apiHost: 'http://localhost:11434',
      enabled: true,
      models: [
        { id: 'llama3.2', name: 'Llama 3.2', group: 'Local', isDefault: true },
      ],
    },
  ];
}

function buildMessages(strings, lang, referenceUrl) {
  const isZh = lang === 'zh';
  return [
    {
      id: `${lang}-user-hero`,
      askId: `${lang}-ask-hero`,
      role: 'user',
      content: strings.userPrompt,
      contextReferences: [{
        id: `${lang}-context-olyq-website`,
        kind: 'element',
        element: {
          kind: 'text',
          tagName: 'MAIN',
          selector: 'main',
          text: strings.referenceText,
          charCount: strings.referenceText.replace(/\s+/g, '').length,
        },
        source: {
          title: strings.referenceTitle,
          url: referenceUrl,
        },
        attachmentIds: [],
      }],
      modelContext: [
        isZh ? '当前网页上下文：' : 'Current page context:',
        strings.referenceText,
      ].join('\n'),
      createdAt: now + 1,
    },
    {
      id: `${lang}-assistant-hero`,
      askId: `${lang}-ask-hero`,
      role: 'assistant',
      modelId: 'openai/gpt-5.4',
      content: strings.assistantReply,
      status: 'success',
      trace: [
        { kind: 'reasoning', text: strings.reasoning },
        {
          kind: 'tool-call',
          toolCallId: `${lang}-tool-read-page`,
          toolName: 'browser_context.read_page',
          args: { source: referenceUrl },
          result: { title: strings.referenceTitle },
          status: 'done',
        },
        {
          kind: 'tool-call',
          toolCallId: `${lang}-tool-technology`,
          toolName: 'browser_context.technology_summary',
          args: { include: ['framework', 'assets', 'routing'] },
          result: { framework: 'React + Vite' },
          status: 'done',
        },
      ],
      createdAt: now + 2,
    },
  ];
}

function buildAssistant(strings, lang) {
  const activeTopicId = `${lang}-topic-website-overview`;
  const topics = strings.topics.map((name, index) => ({
    id: index === 0 ? activeTopicId : `${lang}-topic-${index}`,
    assistantId: '__builtin_default__',
    name,
    createdAt: now - index * 1000,
    updatedAt: now - index * 1000,
    pinned: index === 0 || index === 1,
    order: now - index,
    isNameManuallyEdited: true,
    model: 'openai/gpt-5.4',
    browserContextMode: {
      enabled: true,
      fullPageEnabled: true,
      styleSignalsEnabled: true,
    },
    modelParams: {
      nativeWebSearch: {
        enabled: index === 0,
        contextSize: 'medium',
        maxUses: 2,
      },
    },
  }));

  return {
    assistant: {
      id: '__builtin_default__',
      scenario: 'browser',
      name: strings.assistantName,
      description: strings.assistantDescription,
      iconId: 'globe',
      prompt: lang === 'zh'
        ? '你是 Olyq 的网页研究助手，擅长把当前页面整理成清晰、可继续追问的浏览器工作区内容。'
        : 'You are Olyq’s web research assistant, focused on turning the current page into clear browser-workspace notes that can be followed up.',
      topics,
      order: now,
      createdAt: now,
      updatedAt: now,
      enableWebSearch: true,
      webSearchProviderId: 'local-google',
      mcpSelection: { mode: 'auto', serverIds: [] },
      tags: lang === 'zh' ? ['网页上下文', '官网'] : ['page context', 'website'],
    },
    activeTopicId,
  };
}

function buildStorageSeed(spec, referenceUrl) {
  const strings = copy[spec.lang];
  const { assistant, activeTopicId } = buildAssistant(strings, spec.lang);
  return {
    storage: {
      [storageKeys.assistants]: [assistant],
      [storageKeys.runtime]: {
        activeAssistantId: assistant.id,
        activeTopicId,
      },
      [storageKeys.language]: spec.language,
      [storageKeys.theme]: spec.theme,
      [storageKeys.display]: {
        sidebarPosition: 'left',
        sidebarCollapsed: false,
        sidebarTab: 'topics',
        clickAssistantToShowTopic: true,
        assistantsTabSortType: 'list',
        pinTopicsToTop: true,
        extensionSettingsOpenMode: 'dialog',
      },
      [storageKeys.providers]: buildProviders(),
      [storageKeys.chatSettings]: {
        defaultModel: 'openai/gpt-5.4',
        defaultImageModel: 'openai/gpt-5.4',
        defaultTranscriptionModel: 'openai/gpt-5.4',
        defaultSpeechModel: 'openai/gpt-5.4',
        translateModel: 'openai/gpt-5.4',
        topicNamingModel: 'openai/gpt-5.4',
      },
      [storageKeys.legalPresetRemediation]: {
        presetSet: 'olyq-browser-v1',
        appliedAt: now,
      },
    },
    activeTopicId,
    messages: buildMessages(strings, spec.lang, referenceUrl),
    input: strings.input,
  };
}

async function waitForServiceWorker(context) {
  const existing = context.serviceWorkers()[0];
  if (existing) return existing;
  return await context.waitForEvent('serviceworker', { timeout: 15_000 });
}

async function seedExtensionPage(page, seed) {
  await page.evaluate(async ({ storageSeed, activeTopicId, startupMessages, dbConfig }) => {
    const chromeApi = globalThis.chrome;
    if (!chromeApi?.storage?.local) throw new Error('chrome.storage.local is unavailable');

    const deleteDb = (name) => new Promise((resolve) => {
      try {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
      } catch {
        resolve();
      }
    });

    const putTopicRow = (topicId, messages) => new Promise((resolve, reject) => {
      try {
        const request = indexedDB.open(dbConfig.name, dbConfig.version);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(dbConfig.store)) {
            db.createObjectStore(dbConfig.store, { keyPath: 'id' });
          }
        };
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction([dbConfig.store], 'readwrite');
          tx.objectStore(dbConfig.store).put({ id: topicId, messages });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      } catch (error) {
        reject(error);
      }
    });

    const writeBootstrapMirror = (key, value) => {
      localStorage.setItem(`__olyq.bootstrap__.${key}`, JSON.stringify({
        schemaVersion: 1,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        value,
      }));
    };

    localStorage.clear();
    await deleteDb(dbConfig.name);

    await new Promise((resolve, reject) => {
      chromeApi.storage.local.clear(() => {
        const message = chromeApi.runtime.lastError?.message;
        if (message) reject(new Error(message));
        else resolve();
      });
    });

    await new Promise((resolve, reject) => {
      chromeApi.storage.local.set(storageSeed, () => {
        const message = chromeApi.runtime.lastError?.message;
        if (message) reject(new Error(message));
        else resolve();
      });
    });

    for (const [key, value] of Object.entries(storageSeed)) {
      writeBootstrapMirror(key, value);
    }

    document.documentElement.classList.toggle('dark', storageSeed['olyq.theme.v1'] === 'dark');
    await putTopicRow(activeTopicId, startupMessages);
  }, {
    storageSeed: seed.storage,
    activeTopicId: seed.activeTopicId,
    startupMessages: seed.messages,
    dbConfig: messagesDb,
  });
}

async function launchExtension() {
  const extPath = resolveExtensionDistDir();
  mustExist(path.join(extPath, 'manifest.json'));
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'olyq-website-hero-'));

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: process.env.PW_HEADLESS === '1',
    viewport: screenshotViewport,
    deviceScaleFactor: screenshotScale,
    args: [
      `--disable-extensions-except=${extPath}`,
      `--load-extension=${extPath}`,
      `--window-size=${screenshotViewport.width},${screenshotViewport.height}`,
      '--hide-scrollbars',
    ],
  });

  try {
    const serviceWorker = await waitForServiceWorker(context);
    const extensionId = parseExtensionIdFromUrl(serviceWorker.url());
    if (!extensionId) throw new Error(`Cannot parse extension id from ${serviceWorker.url()}`);
    return { context, extensionId, userDataDir };
  } catch (error) {
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
    throw error;
  }
}

async function renderHeroSpec(spec) {
  const localHeroPage = configuredHeroPageUrl ? null : await startLocalHeroPageServer(spec.lang);
  const heroPageUrl = configuredHeroPageUrl || localHeroPage.url;
  const { context, extensionId, userDataDir } = await launchExtension();
  const websitePage = await context.newPage();
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(`[${spec.fileName}] ${message.text()}`);
  });
  page.on('pageerror', (error) => {
    console.error(`[${spec.fileName}] ${error.message}`);
  });

  try {
    await websitePage.goto(heroPageUrl, { waitUntil: 'domcontentloaded' });
    await websitePage.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    const sidepanelUrl = `chrome-extension://${extensionId}/src/extension/sidepanel/index.html`;
    await page.goto(sidepanelUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Olyq', { timeout: 15_000 });

    const seed = buildStorageSeed(spec, heroPageUrl);
    await seedExtensionPage(page, seed);
    await page.reload({ waitUntil: 'domcontentloaded' });

    const strings = copy[spec.lang];
    const websiteTabId = await resolveHeroWebsiteTabId(page, heroPageUrl);
    await page.waitForSelector('[data-olyq-workspace-shell]', { timeout: 15_000 });
    await page.getByText(strings.activeTopic, { exact: true }).first().waitFor({ state: 'visible', timeout: 15_000 });
    await requestBrowserContextMetadataForTab(page, websiteTabId, heroPageUrl);
    await page.waitForFunction(
      ({ lang, url }) => {
        const bar = document.querySelector('[data-testid="page-context-bar"]');
        const text = bar?.textContent ?? '';
        const missingText = lang === 'zh' ? '未检测到浏览器上下文' : 'No browser context';
        const hostname = new URL(url).hostname;
        return text && !text.includes(missingText) && (text.includes(hostname) || /Olyq/i.test(text));
      },
      { lang: spec.lang, url: heroPageUrl },
      { timeout: 15_000 },
    );
    await page.getByTestId('chat-input').waitFor({ state: 'visible', timeout: 15_000 });
    await page.getByText(spec.lang === 'zh' ? '放在浏览器侧边栏里的开源助手' : 'lives in the browser sidebar').first().waitFor({ state: 'visible', timeout: 15_000 });

    await page.getByTestId('chat-input').fill(seed.input);
    await page.waitForTimeout(800);
    await page.screenshot({
      path: path.join(outputStagingDir, spec.fileName),
      fullPage: false,
      animations: 'disabled',
    });
  } finally {
    await context.close();
    await localHeroPage?.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

async function main() {
  prepareWebsiteHeroStagingDir();
  for (const spec of heroSpecs) {
    console.log(`Generating ${spec.fileName} from real extension UI`);
    await renderHeroSpec(spec);
  }
  publishWebsiteHeroImages();
  console.log(`Website hero images written to ${outputDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
