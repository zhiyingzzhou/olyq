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
const outputStagingDir = path.join(outputDir, '.website-product-screenshots-next');
const screenshotViewport = { width: 1280, height: 800 };
const screenshotScale = 2;

const messagesDb = {
  name: 'olyq.chat.v1',
  version: 1,
  store: 'topics',
};

const attachmentsDb = {
  name: 'olyq.attachments.v1',
  version: 1,
  store: 'items',
};

const workspaceDb = {
  name: 'olyq.persistence.workspace.v1',
  version: 1,
  store: 'snapshots',
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
  paintWorkspace: 'olyq.paint.workspace.v1',
};

const paintWorkspaceStorageKey = 'paint.workspace.v1';
const now = 1_780_000_000_000;

const workflows = ['page-context', 'compare', 'paint', 'web-tools'];
const docsCaptureSpecs = [
  {
    docId: 'docs-quick-start-sidebar',
    workflow: 'page-context',
  },
  {
    docId: 'docs-model-platforms-settings',
    settingsTab: 'models',
    workflow: 'page-context',
  },
  {
    docId: 'docs-model-compare',
    workflow: 'compare',
  },
  {
    docId: 'docs-browser-context-bar',
    workflow: 'page-context',
  },
  {
    docId: 'docs-page-tools-trace',
    workflow: 'web-tools',
  },
  {
    docId: 'docs-paint-workspace',
    workflow: 'paint',
  },
  {
    docId: 'docs-web-search-settings',
    settingsTab: 'web-search',
    workflow: 'web-tools',
  },
  {
    docId: 'docs-mcp-settings',
    settingsTab: 'mcp',
    workflow: 'web-tools',
  },
  {
    docId: 'docs-local-backup-settings',
    settingsTab: 'cloud-sync',
    workflow: 'page-context',
  },
];
const langs = [
  { lang: 'zh', language: 'zh-CN' },
  { lang: 'en', language: 'en-US' },
];
const themes = ['light', 'dark'];

const productSpecs = workflows.flatMap((workflow) => (
  langs.flatMap(({ lang, language }) => (
    themes.map((theme) => ({
      workflow,
      lang,
      language,
      theme,
      kind: workflow === 'paint' ? 'paint' : 'chat',
      fileName: `olyq-${workflow}-${lang}-${theme}.png`,
    }))
  ))
));

const docsSpecs = docsCaptureSpecs.flatMap((docSpec) => (
  langs.flatMap(({ lang, language }) => (
    themes.map((theme) => ({
      ...docSpec,
      lang,
      language,
      theme,
      kind: docSpec.settingsTab ? 'settings' : docSpec.workflow === 'paint' ? 'paint' : 'chat',
      fileName: `olyq-${docSpec.docId}-${lang}-${theme}.png`,
    }))
  ))
));

const allSpecs = [...productSpecs, ...docsSpecs];
const onlyFilter = String(process.env.OLYQ_WEBSITE_PRODUCT_ONLY || '').trim();
const specs = onlyFilter
  ? allSpecs.filter((spec) => (
    spec.fileName.includes(onlyFilter)
    || spec.workflow === onlyFilter
    || `${spec.workflow}-${spec.lang}-${spec.theme}` === onlyFilter
  ))
  : allSpecs;
if (onlyFilter && specs.length < 1) {
  throw new Error(`No website product screenshot specs matched OLYQ_WEBSITE_PRODUCT_ONLY=${onlyFilter}`);
}

const copy = {
  zh: {
    websiteTitle: 'Olyq 官网',
    websiteHeading: 'Olyq 官网',
    websiteSubheading: '开源浏览器 AI 工作台，把当前网页、模型和工具放进同一个侧边栏。',
    websiteText: 'Olyq 是开源浏览器扩展，能把当前网页正文、选区、截图、OCR、技术栈摘要、搜索、MCP 工具和多模型对比放进同一个侧边栏话题。官网产品截图脚本会把 sidepanel 绑定到这个本地 Olyq 官网页面，确保状态条、消息引用、附件和工具 trace 都来自同一个真实浏览器上下文。',
    assistantName: '网页研究助手',
    assistantDescription: '围绕当前页面整理上下文、截图、搜索、MCP 和模型对比。',
    topicNames: {
      'page-context': '网页上下文工作流',
      compare: '多模型对比工作流',
      paint: 'Paint 图片工作区',
      'web-tools': '网页工具工作流',
    },
    prompts: {
      'page-context': '读取当前页面，整理 Olyq 浏览器扩展的核心使用场景。',
      compare: '用同一份网页材料对比几个模型的回答，帮我找出共识和差异。',
      'web-tools': '把截图、OCR 和元素引用一起整理成当前话题里的网页工具记录。',
    },
    replies: {
      'page-context': [
        '这个页面说明了 Olyq 的核心工作方式：把当前网页材料放进浏览器侧边栏，让模型回答不再脱离页面。',
        '',
        '- 页面正文、选区和元素引用可以按需进入同一个话题。',
        '- 截图、OCR、技术栈摘要和搜索结果可以继续作为上下文补充。',
        '- 模型服务由用户自己配置，话题和附件默认留在浏览器本地。',
      ].join('\n'),
      compare: [
        '三个模型对这段页面材料的共同结论是：Olyq 更像浏览器里的工作区，而不是单独的聊天页。',
        '',
        '- OpenAI 版本更适合做产品介绍。',
        '- Claude 版本对隐私和本地状态边界说得更清楚。',
        '- Gemini 版本更擅长把页面工具、截图和 Paint 串成流程。',
      ].join('\n'),
      'web-tools': [
        '网页工具结果已经归入当前话题：截图用于保留视觉状态，OCR 负责提取可复制文本，元素引用记录具体来源位置。',
        '',
        '后续追问时可以继续基于这些材料补充说明、改写结论或交给 MCP 工具处理。',
      ].join('\n'),
    },
    paintPrompt: '把浏览器侧边栏画成一个深色科技感产品图，包含网页、模型和工具节点。',
    paintTitle: '浏览器 AI 工作台概念图',
    screenshotName: 'Olyq 官网截图.png',
    outputName: 'olyq-website-workspace.png',
    input: '继续把这段整理成可发布的简短说明...',
  },
  en: {
    websiteTitle: 'Olyq website',
    websiteHeading: 'Olyq website',
    websiteSubheading: 'An open-source browser AI workspace that keeps the page, models, and tools in one sidebar.',
    websiteText: 'Olyq is an open-source browser extension that brings page text, selections, screenshots, OCR, technology summaries, search, MCP tools, and multi-model comparison into one sidebar topic. The website product screenshot generator binds the sidepanel to this local Olyq website page, so the status bar, message references, attachments, and tool traces come from the same real browser context.',
    assistantName: 'Web research assistant',
    assistantDescription: 'Organizes page context, screenshots, search, MCP, and model comparison around the current tab.',
    topicNames: {
      'page-context': 'Page context workflow',
      compare: 'Model compare workflow',
      paint: 'Paint image workspace',
      'web-tools': 'Web tools workflow',
    },
    prompts: {
      'page-context': 'Read the current page and summarize the core Olyq browser-extension workflows.',
      compare: 'Compare several model replies against the same page material and identify consensus and differences.',
      'web-tools': 'Organize screenshot, OCR, and element references into this page-tools topic.',
    },
    replies: {
      'page-context': [
        'This page shows how Olyq works: page material stays beside the browser tab, so model replies are not detached from the source.',
        '',
        '- Page text, selections, and element references can enter one topic when needed.',
        '- Screenshots, OCR, technology summaries, and search results can extend the context.',
        '- Model services are configured by the user, while topics and attachments start in local browser state.',
      ].join('\n'),
      compare: [
        'The shared conclusion across the models is that Olyq behaves like a browser workspace, not a detached chat tab.',
        '',
        '- The OpenAI reply is strongest for a concise product summary.',
        '- The Claude reply explains privacy and local-state boundaries more clearly.',
        '- The Gemini reply connects page tools, screenshots, and Paint into a workflow.',
      ].join('\n'),
      'web-tools': [
        'The web-tool results are now part of this topic: the screenshot preserves visual state, OCR extracts reusable text, and the element reference keeps the source location clear.',
        '',
        'Follow-up prompts can reuse this material for summaries, rewrites, or MCP-assisted work.',
      ].join('\n'),
    },
    paintPrompt: 'Create a dark premium product visual of a browser sidebar with page, model, and tool nodes.',
    paintTitle: 'Browser AI workspace concept',
    screenshotName: 'olyq-website-screenshot.png',
    outputName: 'olyq-website-workspace.png',
    input: 'Turn this into a short publishable note...',
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

function buildLocalFixtureHtml(strings, lang) {
  const bullets = lang === 'zh'
    ? ['网页上下文', '多模型对比', 'Paint 图片工作区', '截图、OCR 与网页工具']
    : ['Page context', 'Model comparison', 'Paint image workspace', 'Screenshots, OCR, and web tools'];

  return `<!doctype html>
<html lang="${lang === 'zh' ? 'zh-CN' : 'en'}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(strings.websiteTitle)}</title>
    <meta name="description" content="${escapeHtml(strings.websiteText)}" />
    <style>
      :root { color-scheme: light dark; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { margin: 0; background: #f8fafc; color: #111827; }
      main { max-width: 920px; margin: 0 auto; padding: 72px 32px; }
      h1 { margin: 0 0 14px; font-size: 48px; line-height: 1.08; letter-spacing: -0.02em; }
      p { margin: 0 0 20px; font-size: 19px; line-height: 1.75; }
      ul { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; padding: 0; margin: 32px 0 0; list-style: none; }
      li { border: 1px solid #dbe4ea; border-radius: 14px; background: white; padding: 16px 18px; font-size: 15px; }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(strings.websiteHeading)}</h1>
      <p>${escapeHtml(strings.websiteSubheading)}</p>
      <p>${escapeHtml(strings.websiteText)}</p>
      <ul>${bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    </main>
  </body>
</html>`;
}

async function startLocalFixtureServer(lang) {
  const html = buildLocalFixtureHtml(copy[lang], lang);
  const server = http.createServer((req, res) => {
    if ((req.url || '/') === '/favicon.ico') {
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
    throw new Error('Cannot resolve local Olyq website screenshot server port');
  }
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function buildProviders() {
  return [
    {
      id: 'openai',
      name: 'OpenAI',
      type: 'openai',
      apiKey: '',
      apiHost: 'https://api.openai.com/v1',
      enabled: true,
      models: [
        { id: 'gpt-5.4', name: 'GPT-5.4', group: 'Chat', isDefault: true },
        { id: 'gpt-5.4-mini', name: 'GPT-5.4 mini', group: 'Chat' },
        { id: 'gpt-image-1', name: 'GPT Image 1', group: 'Image', transportProtocol: 'image-api' },
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
      ],
    },
    {
      id: 'google',
      name: 'Gemini',
      type: 'gemini',
      apiKey: '',
      apiHost: 'https://generativelanguage.googleapis.com/v1beta',
      enabled: true,
      models: [
        { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', group: 'Chat', isDefault: true },
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

function buildTrace(workflow, lang, referenceUrl) {
  const strings = copy[lang];
  if (workflow === 'compare') {
    return [
      { kind: 'reasoning', text: lang === 'zh' ? '使用同一份网页材料，对比不同模型的回答侧重点。' : 'Compare model emphasis using the same page material.' },
      {
        kind: 'tool-call',
        toolCallId: `${lang}-compare-read-page`,
        toolName: 'browser_context.read_page',
        args: { source: referenceUrl },
        result: { title: strings.websiteTitle },
        status: 'done',
      },
      {
        kind: 'tool-call',
        toolCallId: `${lang}-compare-models`,
        toolName: 'model_compare.run',
        args: { models: ['openai/gpt-5.4', 'anthropic/claude-sonnet-4-6', 'google/gemini-3-flash-preview'] },
        result: { responses: 3 },
        status: 'done',
      },
    ];
  }

  if (workflow === 'web-tools') {
    return [
      { kind: 'reasoning', text: lang === 'zh' ? '把截图、OCR 与元素引用汇合为当前话题可继续追问的材料。' : 'Merge screenshot, OCR, and element references into reusable topic material.' },
      {
        kind: 'tool-call',
        toolCallId: `${lang}-tools-screenshot`,
        toolName: 'ui.screenshot',
        args: { source: referenceUrl, mode: 'selection' },
        result: { attachment: strings.screenshotName },
        status: 'done',
      },
      {
        kind: 'tool-call',
        toolCallId: `${lang}-tools-ocr`,
        toolName: 'browser_context.ocr',
        args: { image: strings.screenshotName },
        result: { text: strings.websiteHeading },
        status: 'done',
      },
    ];
  }

  return [
    { kind: 'reasoning', text: lang === 'zh' ? '读取本地 Olyq 官网页面，确认 sidepanel 顶部上下文和消息引用来自同一个 tab。' : 'Read the local Olyq website page and keep the status bar aligned with the message references.' },
    {
      kind: 'tool-call',
      toolCallId: `${lang}-context-read-page`,
      toolName: 'browser_context.read_page',
      args: { source: referenceUrl },
      result: { title: strings.websiteTitle },
      status: 'done',
    },
    {
      kind: 'tool-call',
      toolCallId: `${lang}-context-technology`,
      toolName: 'browser_context.technology_summary',
      args: { include: ['framework', 'assets', 'routing'] },
      result: { framework: 'React + Vite' },
      status: 'done',
    },
  ];
}

function buildMessages(spec, referenceUrl, attachmentMetas) {
  if (spec.workflow === 'paint') return [];
  const strings = copy[spec.lang];
  const content = strings.prompts[spec.workflow];
  const reply = strings.replies[spec.workflow];
  const askId = `${spec.lang}-${spec.workflow}-ask`;
  const contextReference = {
    id: `${spec.lang}-${spec.workflow}-context`,
    kind: 'element',
    element: {
      kind: 'text',
      tagName: 'MAIN',
      selector: 'main',
      text: strings.websiteText,
      charCount: strings.websiteText.replace(/\s+/g, '').length,
    },
    source: {
      title: strings.websiteTitle,
      url: referenceUrl,
    },
    attachmentIds: attachmentMetas.map((attachment) => attachment.id),
  };

  const userMessage = {
    id: `${spec.lang}-${spec.workflow}-user`,
    askId,
    role: 'user',
    content,
    contextReferences: [contextReference],
    ...(spec.workflow === 'compare' ? {
      mentions: ['openai/gpt-5.4', 'anthropic/claude-sonnet-4-6', 'google/gemini-3-flash-preview'],
      groupPrefs: {
        style: 'grid',
        gridColumns: 3,
        gridPopoverTrigger: 'hover',
      },
    } : {}),
    ...(attachmentMetas.length > 0 ? { attachments: attachmentMetas.map((attachment) => ({ type: 'image', ...attachment })) } : {}),
    modelContext: [
      spec.lang === 'zh' ? '当前网页上下文：' : 'Current page context:',
      strings.websiteText,
    ].join('\n'),
    createdAt: now + 1,
  };

  if (spec.workflow === 'compare') {
    const compareReplies = spec.lang === 'zh'
      ? [
        {
          id: `${spec.lang}-${spec.workflow}-assistant-openai`,
          modelId: 'openai/gpt-5.4',
          content: 'OpenAI 版本把 Olyq 概括成浏览器里的开源 AI 工作区，重点突出当前网页材料、侧边栏话题和少复制粘贴。',
        },
        {
          id: `${spec.lang}-${spec.workflow}-assistant-anthropic`,
          modelId: 'anthropic/claude-sonnet-4-6',
          content: 'Claude 版本更强调边界：模型服务由用户配置，消息、附件和备份默认留在浏览器本地，网页材料按需进入当前话题。',
        },
        {
          id: `${spec.lang}-${spec.workflow}-assistant-gemini`,
          modelId: 'google/gemini-3-flash-preview',
          content: 'Gemini 版本把流程串起来：页面正文、截图、OCR、搜索、MCP 和 Paint 可以围绕同一份 Olyq 官网页面继续协作。',
        },
      ]
      : [
        {
          id: `${spec.lang}-${spec.workflow}-assistant-openai`,
          modelId: 'openai/gpt-5.4',
          content: 'The OpenAI reply frames Olyq as an open browser AI workspace, focusing on current-page material, sidebar topics, and less copy-paste.',
        },
        {
          id: `${spec.lang}-${spec.workflow}-assistant-anthropic`,
          modelId: 'anthropic/claude-sonnet-4-6',
          content: 'The Claude reply makes the boundaries clearer: model services are user-configured, while messages, attachments, and backups start in local browser state.',
        },
        {
          id: `${spec.lang}-${spec.workflow}-assistant-gemini`,
          modelId: 'google/gemini-3-flash-preview',
          content: 'The Gemini reply connects the flow: page text, screenshots, OCR, search, MCP, and Paint can keep working around the same Olyq website page.',
        },
      ];

    return [
      userMessage,
      ...compareReplies.map((message, index) => ({
        ...message,
        askId,
        role: 'assistant',
        status: 'success',
        trace: index === 0 ? buildTrace(spec.workflow, spec.lang, referenceUrl) : [],
        createdAt: now + 2 + index,
      })),
    ];
  }

  return [
    userMessage,
    {
      id: `${spec.lang}-${spec.workflow}-assistant`,
      askId,
      role: 'assistant',
      modelId: spec.workflow === 'compare' ? 'anthropic/claude-sonnet-4-6' : 'openai/gpt-5.4',
      content: reply,
      status: 'success',
      trace: buildTrace(spec.workflow, spec.lang, referenceUrl),
      createdAt: now + 2,
    },
  ];
}

function buildAssistant(spec) {
  const strings = copy[spec.lang];
  const activeTopicId = `${spec.lang}-${spec.workflow}-topic`;
  const topicWorkflows = [
    spec.workflow,
    ...workflows.filter((workflow) => workflow !== spec.workflow),
  ];
  const topics = topicWorkflows.map((workflow, index) => ({
    id: workflow === spec.workflow ? activeTopicId : `${spec.lang}-${workflow}-topic`,
    assistantId: '__builtin_default__',
    name: strings.topicNames[workflow],
    createdAt: now - index * 1000,
    updatedAt: now - index * 1000,
    pinned: index < 2,
    order: now - index,
    isNameManuallyEdited: true,
    model: workflow === 'compare' ? 'anthropic/claude-sonnet-4-6' : 'openai/gpt-5.4',
    browserContextMode: {
      enabled: true,
      fullPageEnabled: workflow !== 'compare',
      styleSignalsEnabled: workflow !== 'compare',
    },
    modelParams: {
      nativeWebSearch: {
        enabled: workflow === 'web-tools',
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
      iconId: spec.workflow === 'paint' ? 'palette' : 'globe',
      prompt: spec.lang === 'zh'
        ? '你是 Olyq 的网页研究助手，擅长把当前页面材料、截图、工具和模型结果整理成清晰话题。'
        : 'You are Olyq’s web research assistant, focused on turning page material, screenshots, tools, and model replies into a clear topic.',
      topics,
      order: now,
      createdAt: now,
      updatedAt: now,
      enableWebSearch: true,
      webSearchProviderId: 'local-google',
      mcpSelection: { mode: spec.workflow === 'web-tools' ? 'auto' : 'manual', serverIds: [] },
      tags: spec.lang === 'zh' ? ['网页上下文', '官网截图'] : ['page context', 'website screenshot'],
    },
    activeTopicId,
  };
}

function buildPaintWorkspace(spec, attachmentMetas) {
  const strings = copy[spec.lang];
  const input = attachmentMetas.find((attachment) => attachment.id.endsWith('-paint-input'));
  const output = attachmentMetas.find((attachment) => attachment.id.endsWith('-paint-output'));
  return {
    paintings: [
      {
        id: `${spec.lang}-paint-main`,
        title: strings.paintTitle,
        model: 'openai/gpt-image-1',
        prompt: strings.paintPrompt,
        params: {
          n: 1,
          size: '1024x1024',
          quality: 'high',
          seed: 240619,
        },
        inputImages: input ? [input] : [],
        outputImages: output ? [output] : [],
        createdAt: now + 10,
        updatedAt: now + 20,
      },
    ],
    activePaintingId: `${spec.lang}-paint-main`,
  };
}

function buildStorageSeed(spec, referenceUrl, attachmentMetas) {
  const { assistant, activeTopicId } = buildAssistant(spec);
  const paintWorkspace = spec.workflow === 'paint' ? buildPaintWorkspace(spec, attachmentMetas) : null;
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
        defaultImageModel: 'openai/gpt-image-1',
        defaultTranscriptionModel: 'openai/gpt-5.4',
        defaultSpeechModel: 'openai/gpt-5.4',
        translateModel: 'openai/gpt-5.4',
        topicNamingModel: 'openai/gpt-5.4',
      },
      [storageKeys.legalPresetRemediation]: {
        presetSet: 'olyq-browser-v1',
        appliedAt: now,
      },
      ...(paintWorkspace ? { [storageKeys.paintWorkspace]: paintWorkspace } : {}),
    },
    activeTopicId,
    messages: buildMessages(spec, referenceUrl, attachmentMetas),
    paintWorkspace,
    input: copy[spec.lang].input,
  };
}

function makeSvgDataUrl(svg) {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function buildPaintOutputImageDataUrl(spec) {
  const dark = spec.theme === 'dark';
  const bg = dark ? '#111827' : '#f8fafc';
  const panel = dark ? '#1f2937' : '#ffffff';
  const border = dark ? '#334155' : '#cbd5e1';
  const text = dark ? '#f8fafc' : '#0f172a';
  const muted = dark ? '#94a3b8' : '#64748b';
  const accent = '#00d9a3';
  const title = spec.lang === 'zh' ? 'Olyq 官网工作区' : 'Olyq website workspace';
  const subtitle = spec.lang === 'zh' ? '页面、模型和工具汇合' : 'Page, model, and tools converge';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="640" viewBox="0 0 1024 640">
  <rect width="1024" height="640" rx="36" fill="${bg}"/>
  <rect x="92" y="84" width="840" height="472" rx="30" fill="${panel}" stroke="${border}" stroke-width="3"/>
  <rect x="132" y="128" width="300" height="32" rx="16" fill="${accent}" opacity="0.18"/>
  <rect x="132" y="196" width="760" height="18" rx="9" fill="${muted}" opacity="0.35"/>
  <rect x="132" y="232" width="620" height="18" rx="9" fill="${muted}" opacity="0.24"/>
  <rect x="132" y="292" width="214" height="126" rx="24" fill="${accent}" opacity="0.16" stroke="${accent}" stroke-width="3"/>
  <rect x="405" y="292" width="214" height="126" rx="24" fill="${accent}" opacity="0.10" stroke="${accent}" stroke-width="3"/>
  <rect x="678" y="292" width="214" height="126" rx="24" fill="${accent}" opacity="0.16" stroke="${accent}" stroke-width="3"/>
  <path d="M346 355h59m214 0h59" stroke="${accent}" stroke-width="6" stroke-linecap="round"/>
  <circle cx="239" cy="355" r="34" fill="${accent}"/>
  <circle cx="512" cy="355" r="34" fill="${accent}" opacity="0.72"/>
  <circle cx="785" cy="355" r="34" fill="${accent}"/>
  <text x="132" y="486" fill="${text}" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="44" font-weight="650">${escapeHtml(title)}</text>
  <text x="132" y="530" fill="${muted}" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="24">${escapeHtml(subtitle)}</text>
</svg>`;
  return makeSvgDataUrl(svg);
}

function dataUrlToBytes(dataUrl) {
  const match = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error('Invalid website product screenshot data URL');
  return {
    mime: match[1],
    bytes: Buffer.from(match[2], 'base64'),
  };
}

function buildAttachmentRecords(spec, pageScreenshotBytes) {
  if (spec.workflow !== 'paint' && spec.workflow !== 'web-tools') return [];
  const strings = copy[spec.lang];
  const records = [
    {
      id: `${spec.lang}-${spec.workflow}-screenshot`,
      kind: 'image',
      name: strings.screenshotName,
      mime: 'image/png',
      size: pageScreenshotBytes.length,
      createdAt: now + 3,
      dataBytes: pageScreenshotBytes,
    },
  ];

  if (spec.workflow === 'paint') {
    const output = dataUrlToBytes(buildPaintOutputImageDataUrl(spec));
    records[0].id = `${spec.lang}-paint-input`;
    records.push({
      id: `${spec.lang}-paint-output`,
      kind: 'image',
      name: strings.outputName,
      mime: output.mime,
      size: output.bytes.length,
      createdAt: now + 4,
      dataBytes: output.bytes,
    });
  }

  return records;
}

function toAttachmentMeta(record) {
  return {
    id: record.id,
    name: record.name,
    mime: record.mime,
    size: record.size,
  };
}

async function waitForServiceWorker(context) {
  const existing = context.serviceWorkers()[0];
  if (existing) return existing;
  return await context.waitForEvent('serviceworker', { timeout: 15_000 });
}

async function launchExtension() {
  const extPath = resolveExtensionDistDir();
  mustExist(path.join(extPath, 'manifest.json'));
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'olyq-website-product-'));

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

async function resolveWebsiteTabId(page, targetUrl) {
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
          // The port may already be disconnected during extension teardown.
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
            // Cleanup only.
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

async function seedExtensionPage(page, seed, attachmentRecords) {
  await page.evaluate(async ({ storageSeed, activeTopicId, startupMessages, paintWorkspace, attachmentSeeds, dbConfig, attachmentDbConfig, workspaceDbConfig, paintWorkspaceKey }) => {
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

    const putAttachments = (records) => new Promise((resolve, reject) => {
      try {
        const request = indexedDB.open(attachmentDbConfig.name, attachmentDbConfig.version);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(attachmentDbConfig.store)) {
            const store = db.createObjectStore(attachmentDbConfig.store, { keyPath: 'id' });
            store.createIndex('createdAt', 'createdAt', { unique: false });
          }
        };
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction([attachmentDbConfig.store], 'readwrite');
          const store = tx.objectStore(attachmentDbConfig.store);
          for (const record of records) {
            const bytes = new Uint8Array(record.dataBytes);
            store.put({
              id: record.id,
              kind: record.kind,
              name: record.name,
              mime: record.mime,
              size: record.size,
              createdAt: record.createdAt,
              data: new Blob([bytes], { type: record.mime }),
            });
          }
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

    const putPaintWorkspace = (snapshot) => new Promise((resolve, reject) => {
      if (!snapshot) {
        resolve();
        return;
      }
      try {
        const request = indexedDB.open(workspaceDbConfig.name, workspaceDbConfig.version);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(workspaceDbConfig.store)) {
            db.createObjectStore(workspaceDbConfig.store, { keyPath: 'key' });
          }
        };
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction([workspaceDbConfig.store], 'readwrite');
          tx.objectStore(workspaceDbConfig.store).put({ key: paintWorkspaceKey, value: snapshot });
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
    await deleteDb(attachmentDbConfig.name);
    await deleteDb(workspaceDbConfig.name);

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
    await putAttachments(attachmentSeeds);
    await putPaintWorkspace(paintWorkspace);
  }, {
    storageSeed: seed.storage,
    activeTopicId: seed.activeTopicId,
    startupMessages: seed.messages,
    paintWorkspace: seed.paintWorkspace,
    attachmentSeeds: attachmentRecords.map((record) => ({ ...record, dataBytes: Array.from(record.dataBytes) })),
    dbConfig: messagesDb,
    attachmentDbConfig: attachmentsDb,
    workspaceDbConfig: workspaceDb,
    paintWorkspaceKey: paintWorkspaceStorageKey,
  });
}

async function readChatRenderDiagnostics(page, spec, seed) {
  return await page.evaluate(async ({ expectedTopicId, dbConfig }) => {
    const messageGroups = Array.from(document.querySelectorAll('[data-testid="message-group"]')).map((node) => ({
      askId: node.getAttribute('data-ask-id'),
      text: (node.textContent || '').slice(0, 240),
    }));
    const lanes = Array.from(document.querySelectorAll('[data-testid^="message-lane-"]')).map((node) => ({
      testId: node.getAttribute('data-testid'),
      text: (node.textContent || '').slice(0, 160),
    }));
    const activeText = document.body?.textContent?.slice(0, 1200) ?? '';
    const dbMessages = await new Promise((resolve) => {
      try {
        const request = indexedDB.open(dbConfig.name, dbConfig.version);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction([dbConfig.store], 'readonly');
          const getReq = tx.objectStore(dbConfig.store).get(expectedTopicId);
          getReq.onsuccess = () => {
            const row = getReq.result;
            db.close();
            resolve(Array.isArray(row?.messages) ? row.messages.map((message) => ({
              id: message.id,
              role: message.role,
              askId: message.askId,
              modelId: message.modelId,
              status: message.status,
              content: String(message.content || '').slice(0, 120),
            })) : []);
          };
          getReq.onerror = () => {
            db.close();
            resolve([]);
          };
        };
        request.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
    return {
      expectedTopicId,
      messageGroups,
      lanes,
      dbMessages,
      bodyText: activeText,
    };
  }, {
    expectedTopicId: seed.activeTopicId,
    workflow: spec.workflow,
    dbConfig: messagesDb,
  });
}

async function waitForModelPlatformProviderLogos(page) {
  const providerIds = ['openai', 'anthropic', 'google', 'ollama'];
  try {
    await page.waitForFunction((ids) => {
      return ids.every((id) => {
        const shell = document.querySelector(`[data-testid="model-manager-provider-${id}"]`);
        const icon = shell?.querySelector(`[data-provider-icon-id="${id}"]`);
        const image = icon?.querySelector('img');
        return (
          icon?.getAttribute('data-provider-icon-state') === 'ok'
          && image instanceof HTMLImageElement
          && image.complete
          && image.naturalWidth > 0
          && image.naturalHeight > 0
        );
      });
    }, providerIds, { timeout: 20_000 });
  } catch (error) {
    const diagnostics = await page.evaluate((ids) => (
      ids.map((id) => {
        const shell = document.querySelector(`[data-testid="model-manager-provider-${id}"]`);
        const icon = shell?.querySelector(`[data-provider-icon-id="${id}"]`);
        const image = icon?.querySelector('img');
        return {
          id,
          hasShell: Boolean(shell),
          hasIcon: Boolean(icon),
          state: icon?.getAttribute('data-provider-icon-state') ?? null,
          src: image instanceof HTMLImageElement ? image.currentSrc || image.src : null,
          complete: image instanceof HTMLImageElement ? image.complete : null,
          naturalWidth: image instanceof HTMLImageElement ? image.naturalWidth : null,
          naturalHeight: image instanceof HTMLImageElement ? image.naturalHeight : null,
        };
      })
    ), providerIds);
    throw new Error(`Provider logo images did not finish loading: ${JSON.stringify(diagnostics, null, 2)}`, { cause: error });
  }
}

function prepareStagingDir() {
  fs.rmSync(outputStagingDir, { recursive: true, force: true });
  fs.mkdirSync(outputStagingDir, { recursive: true });
}

function publishScreenshots() {
  for (const spec of specs) {
    mustExist(path.join(outputStagingDir, spec.fileName));
  }
  fs.mkdirSync(outputDir, { recursive: true });
  for (const spec of specs) {
    fs.copyFileSync(path.join(outputStagingDir, spec.fileName), path.join(outputDir, spec.fileName));
  }
  fs.rmSync(outputStagingDir, { recursive: true, force: true });
}

async function renderSpec(spec) {
  const localFixture = await startLocalFixtureServer(spec.lang);
  const fixtureUrl = localFixture.url;
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
    await websitePage.goto(fixtureUrl, { waitUntil: 'domcontentloaded' });
    await websitePage.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    const pageScreenshotBytes = await websitePage.screenshot({
      fullPage: false,
      animations: 'disabled',
    });

    const sidepanelUrl = `chrome-extension://${extensionId}/src/extension/sidepanel/index.html`;
    const route = spec.kind === 'paint'
      ? '#/paint'
      : spec.kind === 'settings'
        ? `#/settings?tab=${encodeURIComponent(spec.settingsTab)}`
        : '';
    await page.goto(`${sidepanelUrl}${route}`, { waitUntil: 'domcontentloaded' });
    if (spec.kind === 'paint') {
      await page.waitForSelector('[data-testid="paint-workspace"]', { timeout: 15_000 });
    } else if (spec.kind === 'settings') {
      await page.waitForSelector('[data-testid="extension-settings-page"]', { timeout: 15_000 });
    } else {
      await page.waitForSelector('text=Olyq', { timeout: 15_000 });
    }

    const attachmentRecords = buildAttachmentRecords(spec, pageScreenshotBytes);
    const attachmentMetas = attachmentRecords.map(toAttachmentMeta);
    const seed = buildStorageSeed(spec, fixtureUrl, attachmentMetas);
    await seedExtensionPage(page, seed, attachmentRecords);
    await page.reload({ waitUntil: 'domcontentloaded' });

    if (spec.kind === 'paint') {
      await page.waitForSelector('[data-testid="paint-workspace"]', { timeout: 15_000 });
      await page.waitForSelector('[data-testid="paint-main-workspace"]', { timeout: 15_000 });
      await page.getByText(copy[spec.lang].paintTitle, { exact: true }).first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
    } else if (spec.kind === 'settings') {
      await page.waitForSelector('[data-testid="extension-settings-page"]', { timeout: 15_000 });
      await page.waitForSelector(`[data-testid="extension-settings-panel-${spec.settingsTab}"]`, { timeout: 15_000 });
      if (spec.settingsTab === 'models') {
        await page.waitForSelector('[data-testid="model-manager-layout"]', { timeout: 15_000 });
        if (spec.docId === 'docs-model-platforms-settings') {
          await waitForModelPlatformProviderLogos(page);
        }
      }
      if (spec.settingsTab === 'cloud-sync') {
        await page.waitForSelector('[data-testid="extension-settings-panel-cloud-sync"]', { timeout: 15_000 });
        if (spec.docId === 'docs-local-backup-settings') {
          const localBackupLabel = spec.lang === 'zh' ? '本地备份' : 'Local backup';
          await page.getByText(localBackupLabel, { exact: true }).first().click();
          await page.waitForTimeout(250);
        }
      }
    } else {
      await page.waitForSelector('[data-olyq-workspace-shell]', { timeout: 15_000 });
      await page.getByText(copy[spec.lang].topicNames[spec.workflow], { exact: true }).first().waitFor({ state: 'visible', timeout: 15_000 });
      const websiteTabId = await resolveWebsiteTabId(page, fixtureUrl);
      await requestBrowserContextMetadataForTab(page, websiteTabId, fixtureUrl);
      await page.waitForFunction(
        ({ lang, url }) => {
          const bar = document.querySelector('[data-testid="page-context-bar"]');
          const text = bar?.textContent ?? '';
          const missingText = lang === 'zh' ? '未检测到浏览器上下文' : 'No browser context';
          const hostname = new URL(url).hostname;
          return text && !text.includes(missingText) && (text.includes(hostname) || /Olyq/i.test(text));
        },
        { lang: spec.lang, url: fixtureUrl },
        { timeout: 15_000 },
      );
      await page.getByTestId('chat-input').waitFor({ state: 'visible', timeout: 15_000 });
      try {
        if (spec.workflow === 'compare') {
          await page.locator(`[data-testid="message-group"][data-ask-id="${spec.lang}-${spec.workflow}-ask"]`).waitFor({ state: 'attached', timeout: 15_000 });
        } else {
          await page.getByTestId(`message-lane-${spec.lang}-${spec.workflow}-assistant`).waitFor({ state: 'attached', timeout: 15_000 });
        }
      } catch (error) {
        const diagnostics = await readChatRenderDiagnostics(page, spec, seed).catch((diagnosticError) => ({
          diagnosticError: diagnosticError instanceof Error ? diagnosticError.message : String(diagnosticError),
        }));
        throw new Error(`Timed out waiting for seeded ${spec.workflow} messages in ${spec.fileName}: ${JSON.stringify(diagnostics, null, 2)}`, { cause: error });
      }
      await page.getByTestId('chat-input').fill(seed.input);
    }

    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(outputStagingDir, spec.fileName),
      fullPage: false,
      animations: 'disabled',
    });
  } finally {
    await context.close();
    await localFixture.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

async function main() {
  prepareStagingDir();
  for (const spec of specs) {
    console.log(`Generating ${spec.fileName} from real extension UI`);
    await renderSpec(spec);
  }
  publishScreenshots();
  console.log(`Website product screenshots written to ${outputDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
