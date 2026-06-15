/**
 * 说明：`collectors.spec` 浏览器上下文采集模块测试。
 *
 * 职责：
 * - 验证 prompt 真截断与预览片段截断的语义已经分离；
 * - 验证全文网页模式只放大 prompt 预算，不再走旧的分块总结链路；
 * - 验证全文模式会在需要时临时补上 `readable-dom`，但不污染 profile 真源。
 *
 * 边界：
 * - 本文件只覆盖 `buildBrowserContextPrompt()` 的公开行为；
 * - 不验证真实 SW/content script 通信，只用最小 mock 驱动浏览器上下文门面。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserContextProfile } from './types';
import type {
  BrowserContextReadableDomPayload,
  PageStyleCapturesPayload,
  PageStyleSignalsPayload,
} from '@/types/sw-messages';

/**
 * 创建一份空的 source manifest fixture。
 *
 * @returns 默认缺失态的 source manifest。
 */
function createSourceManifestFixture() {
  return {
    'tab-meta': {
      sourceId: 'tab-meta' as const,
      identity: null,
      freshness: 'missing' as const,
      collectedAt: null,
      issueCode: null,
      payloadRef: null,
    },
    'technology-stack': {
      sourceId: 'technology-stack' as const,
      identity: null,
      freshness: 'missing' as const,
      collectedAt: null,
      issueCode: null,
      payloadRef: null,
    },
    'readable-dom': {
      sourceId: 'readable-dom' as const,
      identity: null,
      freshness: 'missing' as const,
      collectedAt: null,
      issueCode: null,
      payloadRef: null,
    },
    'page-style-signals': {
      sourceId: 'page-style-signals' as const,
      identity: null,
      freshness: 'missing' as const,
      collectedAt: null,
      issueCode: null,
      payloadRef: null,
    },
    'selection-snapshot': {
      sourceId: 'selection-snapshot' as const,
      identity: null,
      freshness: 'missing' as const,
      collectedAt: null,
      issueCode: null,
      payloadRef: null,
    },
    'element-snapshot': {
      sourceId: 'element-snapshot' as const,
      identity: null,
      freshness: 'missing' as const,
      collectedAt: null,
      issueCode: null,
      payloadRef: null,
    },
  };
}

/**
 * 构建 `readable-dom` payload fixture。
 *
 * @param overrides - 局部覆盖字段。
 * @returns 完整的 `readable-dom` payload。
 */
function buildReadableDomPayload(
  overrides: Partial<BrowserContextReadableDomPayload> = {},
): BrowserContextReadableDomPayload {
  const payload = {
    title: 'Docs',
    url: 'https://example.com/docs',
    pageFingerprint: 'fingerprint-docs-v1',
    routeKey: 'https://example.com/docs',
    stableWindowVersion: 1,
    extractedAt: 1,
    intent: 'normal' as const,
    mode: 'article' as const,
    text: '正文摘要',
    headings: [{ level: 1 as const, text: '概览' }],
    contentChars: 4,
    visibleTextChars: 4,
    ...overrides,
  };
  return {
    ...payload,
    pageFingerprint: payload.pageFingerprint ?? 'fingerprint-docs-v1',
    routeKey: payload.routeKey ?? 'https://example.com/docs',
    stableWindowVersion: payload.stableWindowVersion ?? 1,
  };
}

/**
 * 构建 `page-style-signals` payload fixture。
 *
 * @param overrides - 局部覆盖字段。
 * @returns 完整的 `page-style-signals` payload。
 */
function buildPageStyleSignalsPayload(
  overrides: Partial<PageStyleSignalsPayload> = {},
): PageStyleSignalsPayload {
  const payload = {
    title: 'Docs',
    url: 'https://example.com/docs',
    pageFingerprint: 'fingerprint-docs-v1',
    routeKey: 'https://example.com/docs',
    stableWindowVersion: 1,
    extractedAt: 6,
    page: {
      backgroundColor: 'rgb(250, 248, 240)',
      textColor: 'rgb(32, 32, 32)',
      linkColor: 'rgb(60, 90, 220)',
      primaryButtonColor: 'rgb(20, 120, 230)',
      borderColors: ['rgb(220, 220, 220)'],
      shadowSamples: ['0 8px 24px rgba(0,0,0,0.12)'],
      radiusSamples: ['24px'],
      maxContentWidth: 1200,
      centeredLayout: true,
      airyWhitespace: true,
    },
    typography: {
      bodyFontFamilies: ['Inter, sans-serif'],
      headingFontFamilies: ['"Playfair Display", serif'],
      buttonFontFamilies: ['Inter, sans-serif'],
      bodyFontSize: '16px',
      bodyLineHeight: '24px',
      headingFontSizes: ['48px'],
      buttonFontSizes: ['14px'],
      fontWeights: ['400', '600'],
    },
    layout: {
      hasHero: true,
      navStyle: 'sticky-top',
      sectionCount: 4,
      sectionGapSamples: [96, 128],
      cardGridHint: 'multi-column-grid',
      imageDensity: 'medium' as const,
    },
    components: {
      buttonStyles: ['bg:rgb(20, 120, 230)'],
      cardStyles: ['bg:rgba(255,255,255,0.85)'],
      inputStyles: ['border:rgb(220, 220, 220)'],
      tagStyles: ['radius:999px'],
      navStyles: ['shadow:0 8px 24px rgba(0,0,0,0.12)'],
    },
    decoration: {
      hasLargeImages: true,
      usesGradients: true,
      usesIllustrations: false,
      usesBorders: true,
      usesGlass: true,
      usesShadows: true,
      hasStickyHeader: true,
    },
    samples: {
      headings: ['Hero headline'],
      sectionSelectors: ['header', 'main'],
      cardSelectors: ['article'],
    },
    ...overrides,
  };
  return {
    ...payload,
    pageFingerprint: payload.pageFingerprint ?? 'fingerprint-docs-v1',
    routeKey: payload.routeKey ?? 'https://example.com/docs',
    stableWindowVersion: payload.stableWindowVersion ?? 1,
  };
}

/**
 * 构建 `page-style-captures` payload fixture。
 *
 * @param overrides - 局部覆盖字段。
 * @returns 完整的 `page-style-captures` payload。
 */
function buildPageStyleCapturesPayload(
  overrides: Partial<PageStyleCapturesPayload> = {},
): PageStyleCapturesPayload {
  const payload = {
    title: 'Docs',
    url: 'https://example.com/docs',
    pageFingerprint: 'fingerprint-docs-v1',
    routeKey: 'https://example.com/docs',
    stableWindowVersion: 1,
    extractedAt: 8,
    frames: [{
      name: 'page-style-01.png',
      mime: 'image/png',
      dataUrl: 'data:image/png;base64,Y2FwdHVyZWQtaW1hZ2U=',
      scrollY: 0,
    }],
    ...overrides,
  };
  return {
    ...payload,
    pageFingerprint: payload.pageFingerprint ?? 'fingerprint-docs-v1',
    routeKey: payload.routeKey ?? 'https://example.com/docs',
    stableWindowVersion: payload.stableWindowVersion ?? 1,
  };
}

const mocks = vi.hoisted(() => ({
  runtimeState: {
    metadata: null as null | {
      title: string;
      url: string;
      favicon: string;
      tabId: number;
      extractedAt: number;
      technologyStackPageKey?: string;
    },
    lastCollection: null as unknown,
    collecting: false,
    status: 'unavailable' as const,
    profile: null as unknown,
    sourceManifest: createSourceManifestFixture(),
  },
  readableDomPayload: null as BrowserContextReadableDomPayload | null,
  pageStyleSignalsPayload: null as PageStyleSignalsPayload | null,
  pageStyleCapturesPayload: null as PageStyleCapturesPayload | null,
  conversationEnabled: true,
  fullPageEnabled: false,
  styleSignalsEnabled: false,
  fullPagePromptChars: 18_000,
  requestReadableDomMock: vi.fn(),
  requestPageStyleSignalsMock: vi.fn(),
  requestPageStyleLayoutMock: vi.fn(),
  requestPageStyleCapturesMock: vi.fn(),
  requestTechnologyStackMock: vi.fn(),
  deleteAttachmentsMock: vi.fn(async () => undefined),
  getAttachmentBlobMock: vi.fn(async () => new Blob(['stored-image'], { type: 'image/png' })),
  blobToDataUrlMock: vi.fn(async () => 'data:image/png;base64,c3RvcmVkLWltYWdl'),
  dataUrlToBlobMock: vi.fn(() => ({
    blob: new Blob(['captured-image'], { type: 'image/png' }),
    mime: 'image/png',
  })),
  putImageAttachmentMock: vi.fn(async ({ name, mime }: { name: string; mime: string }) => ({
    id: 'capture-1',
    type: 'image' as const,
    name,
    mime,
    size: 128,
  })),
  policyProfile: {
    id: 'minimal-page',
    title: 'Minimal Page',
    description: '内容优先',
    sources: ['tab-meta', 'readable-dom'],
    outputFormat: 'markdown',
    maxPromptChars: 6000,
    cacheTtlMs: 60_000,
  } as BrowserContextProfile,
  sendMessageMock: vi.fn<(
    message: unknown,
    callback: (response: { ok: boolean; payload: unknown | null }) => void,
  ) => void>(
    (_message, callback) => {
      callback({ ok: true, payload: null });
    },
  ),
  tabsQueryMock: vi.fn<(queryInfo: chrome.tabs.QueryInfo, callback: (tabs: chrome.tabs.Tab[]) => void) => void>(
    (_queryInfo, callback) => {
      callback([{
        id: 7,
        title: 'Docs',
        url: 'https://example.com/docs',
        favIconUrl: 'https://example.com/favicon.ico',
      } as chrome.tabs.Tab]);
    },
  ),
}));

vi.mock('@/hooks/useAssistantStore', () => ({
  useAssistantStore: {
    getState: () => ({
      assistants: [{
        id: 'assistant-1',
        name: 'Browser Assistant',
        scenario: 'browser',
        topics: [{
          id: 'topic-1',
          assistantId: 'assistant-1',
          name: 'Docs',
          pinned: false,
          createdAt: 1,
          updatedAt: 1,
          order: 1,
          isNameManuallyEdited: false,
        }],
      }],
    }),
  },
}));

vi.mock('./settings', () => ({
  getBrowserContextSettings: () => ({
    enabled: true,
    fullPagePromptChars: mocks.fullPagePromptChars,
  }),
  isBrowserContextEnabled: () => true,
}));

vi.mock('./policy', () => ({
  resolveBrowserContextPolicyForAssistant: () => ({
    source: 'default',
    profile: { ...mocks.policyProfile, sources: [...mocks.policyProfile.sources] },
  }),
}));

vi.mock('./conversation-mode', () => ({
  getBrowserContextConversationMode: () => ({
    enabled: mocks.conversationEnabled,
    fullPageEnabled: mocks.fullPageEnabled,
    styleSignalsEnabled: mocks.styleSignalsEnabled,
  }),
}));

vi.mock('@/lib/extension/browser-context-api', () => ({
  requestBrowserContextReadableDom: mocks.requestReadableDomMock,
  requestBrowserContextPageStyleSignals: mocks.requestPageStyleSignalsMock,
  requestBrowserContextPageStyleLayout: mocks.requestPageStyleLayoutMock,
  requestBrowserContextPageStyleCaptures: mocks.requestPageStyleCapturesMock,
}));

vi.mock('@/lib/extension/technology-stack-api', () => ({
  requestTechnologyStack: mocks.requestTechnologyStackMock,
}));

vi.mock('@/lib/attachments', () => ({
  deleteAttachments: mocks.deleteAttachmentsMock,
  getAttachmentBlob: mocks.getAttachmentBlobMock,
  blobToDataUrl: mocks.blobToDataUrlMock,
  dataUrlToBlob: mocks.dataUrlToBlobMock,
  putImageAttachment: mocks.putImageAttachmentMock,
}));

vi.mock('./runtime', () => ({
  getBrowserContextMetadata: () => mocks.runtimeState.metadata,
  getBrowserContextSelectionSnapshot: () => null,
  getBrowserContextElementSnapshot: () => null,
  getBrowserContextSourceManifest: () => createSourceManifestFixture(),
  setBrowserContextCollecting: (value: boolean) => {
    mocks.runtimeState.collecting = value;
  },
  setBrowserContextElementSnapshot: vi.fn(),
  setBrowserContextLastCollection: (value: unknown) => {
    mocks.runtimeState.lastCollection = value;
  },
  setBrowserContextMetadata: (value: typeof mocks.runtimeState.metadata) => {
    mocks.runtimeState.metadata = value;
  },
  setBrowserContextProfile: (value: unknown) => {
    mocks.runtimeState.profile = value;
  },
  setBrowserContextSourceManifest: (value: typeof mocks.runtimeState.sourceManifest) => {
    mocks.runtimeState.sourceManifest = value;
  },
  setBrowserContextStatus: (value: typeof mocks.runtimeState.status) => {
    mocks.runtimeState.status = value;
  },
  setBrowserContextSelectionSnapshot: vi.fn(),
}));

describe('buildBrowserContextPrompt', () => {
  beforeEach(() => {
    mocks.runtimeState.metadata = null;
    mocks.runtimeState.lastCollection = null;
    mocks.runtimeState.collecting = false;
    mocks.runtimeState.status = 'unavailable';
    mocks.runtimeState.profile = null;
    mocks.runtimeState.sourceManifest = createSourceManifestFixture();
    mocks.readableDomPayload = null;
    mocks.conversationEnabled = true;
    mocks.fullPageEnabled = false;
    mocks.pageStyleSignalsPayload = null;
    mocks.pageStyleCapturesPayload = null;
    mocks.styleSignalsEnabled = false;
    mocks.fullPagePromptChars = 18_000;
    mocks.policyProfile = {
      id: 'minimal-page',
      title: 'Minimal Page',
      description: '内容优先',
      sources: ['tab-meta', 'readable-dom'],
      outputFormat: 'markdown',
      maxPromptChars: 6000,
      cacheTtlMs: 60_000,
    };
    mocks.sendMessageMock.mockClear();
    mocks.tabsQueryMock.mockClear();
    mocks.requestReadableDomMock.mockReset();
    mocks.requestPageStyleSignalsMock.mockReset();
    mocks.requestPageStyleLayoutMock.mockReset();
    mocks.requestPageStyleCapturesMock.mockReset();
    mocks.requestTechnologyStackMock.mockReset();
    mocks.deleteAttachmentsMock.mockClear();
    mocks.getAttachmentBlobMock.mockClear();
    mocks.blobToDataUrlMock.mockClear();
    mocks.dataUrlToBlobMock.mockClear();
    mocks.putImageAttachmentMock.mockClear();
    window.localStorage.removeItem('olyq.browser-context.page-style-snapshots.v1');
    window.localStorage.removeItem('__olyq.bootstrap__.olyq.browser-context.page-style-snapshots.v1');
    mocks.sendMessageMock.mockImplementation((message, callback) => {
      const payload = message && typeof message === 'object' ? message as { type?: string } : {};
      if (payload.type === 'browser-context/page-style-signals/get') {
        callback({ ok: true, payload: mocks.pageStyleSignalsPayload });
        return;
      }
      callback({ ok: true, payload: mocks.readableDomPayload });
    });
    vi.stubGlobal('chrome', {
      tabs: {
        query: mocks.tabsQueryMock,
      },
      runtime: {
        sendMessage: mocks.sendMessageMock,
      },
    } as unknown as typeof chrome);
    mocks.requestReadableDomMock.mockImplementation(async () => ({
      ok: true,
      payload: mocks.readableDomPayload,
      error: null,
    }));
    mocks.requestPageStyleSignalsMock.mockImplementation(async () => ({
      ok: true,
      payload: mocks.pageStyleSignalsPayload,
      error: null,
    }));
    mocks.requestPageStyleLayoutMock.mockImplementation(async () => ({
      ok: true,
      payload: {
        title: mocks.runtimeState.metadata?.title ?? 'Docs',
        url: mocks.runtimeState.metadata?.url ?? 'https://example.com/docs',
        pageFingerprint: 'fingerprint-docs-v1',
        routeKey: mocks.runtimeState.metadata?.url ?? 'https://example.com/docs',
        stableWindowVersion: 1,
        extractedAt: mocks.runtimeState.metadata?.extractedAt ?? 1,
        documentHeight: 1600,
        viewportHeight: 900,
        scrollY: 0,
      },
      error: null,
    }));
    mocks.requestPageStyleCapturesMock.mockImplementation(async () => ({
      ok: true,
      payload: mocks.pageStyleCapturesPayload,
      error: null,
    }));
    mocks.requestTechnologyStackMock.mockResolvedValue({
      ok: true,
      payload: {
        status: 'ready',
        tabId: 7,
        url: 'https://example.com/docs',
        title: 'Docs',
        pageFingerprint: 'fingerprint-docs-v1',
        detectedAt: 10,
        scanCoverage: 'complete',
        rulePackage: {
          total: 41,
          technologyCount: 41,
          categoryCount: 12,
          snapshotVersion: 'test',
          source: 'local-fingerprint-snapshot',
          unsupportedSignals: [],
          updateChannel: 'extension-release',
        },
        technologies: [{
          name: 'React',
          slug: 'react',
          categories: ['framework'],
          version: '19.0.0',
          versionReliability: 'exact',
          confidence: 90,
          sources: ['js'],
          evidence: [{ source: 'js', key: 'React', confidence: 90 }],
          website: 'https://react.dev',
          description: 'UI library',
          iconFallback: 'R',
        }],
      },
      meta: {
        pageKey: '7::https://example.com/docs::0',
        enhanced: true,
      },
    });
  });

  it('预览片段被裁剪但 prompt 未超预算时，不应标记为已截断', async () => {
    mocks.readableDomPayload = buildReadableDomPayload({
      text: `第一段：${'A'.repeat(460)}\n\n第二段：${'B'.repeat(420)}`,
      headings: [{ level: 1 as const, text: '概览' }],
      contentChars: 900,
    });

    const { buildBrowserContextPrompt, clearBrowserContextPromptCache } = await import('./collectors');
    clearBrowserContextPromptCache();

    const result = await buildBrowserContextPrompt({
      assistantId: 'assistant-1',
      conversationKey: 'topic-1',
      force: true,
    });

    expect(result.preview?.bodyChars).toBe(900);
    expect(result.preview?.promptChars).toBeGreaterThan(0);
    expect(result.preview?.snippet.length).toBeGreaterThan(0);
    expect(result.preview?.promptTruncated).toBe(false);
    expect(result.prompt?.includes('…（已截断）')).toBe(false);
  });

  it('普通模式下真正 prompt 超出预算时，才标记为已截断', async () => {
    mocks.readableDomPayload = buildReadableDomPayload({
      title: 'Long Docs',
      url: 'https://example.com/long-docs',
      extractedAt: 2,
      pageFingerprint: 'fingerprint-long-docs-v1',
      routeKey: 'https://example.com/long-docs',
      text: `第一段：${'A'.repeat(4200)}\n\n第二段：${'B'.repeat(4200)}`,
      headings: [{ level: 1 as const, text: '超长正文' }],
      contentChars: 8_600,
    });

    const { buildBrowserContextPrompt, clearBrowserContextPromptCache } = await import('./collectors');
    clearBrowserContextPromptCache();

    const result = await buildBrowserContextPrompt({
      assistantId: 'assistant-1',
      conversationKey: 'topic-1',
      force: true,
    });

    expect(result.preview?.bodyChars).toBe(8_600);
    expect(result.preview?.promptTruncated).toBe(true);
    expect(result.prompt?.includes('…（已截断）')).toBe(true);
  });

  it('全文模式只放大预算，不再把 8600 字正文误判成被截断', async () => {
    mocks.fullPageEnabled = true;
    mocks.readableDomPayload = buildReadableDomPayload({
      title: 'Long Docs',
      url: 'https://example.com/long-docs',
      extractedAt: 3,
      pageFingerprint: 'fingerprint-long-docs-v1',
      routeKey: 'https://example.com/long-docs',
      text: `第一段：${'A'.repeat(4200)}\n\n第二段：${'B'.repeat(4200)}`,
      headings: [{ level: 1 as const, text: '超长正文' }],
      contentChars: 8_600,
    });

    const { buildBrowserContextPrompt, clearBrowserContextPromptCache } = await import('./collectors');
    clearBrowserContextPromptCache();

    const result = await buildBrowserContextPrompt({
      assistantId: 'assistant-1',
      conversationKey: 'topic-1',
      force: true,
    });

    expect(result.preview?.bodyChars).toBe(8_600);
    expect(result.preview?.promptChars).toBeGreaterThan(6_000);
    expect(result.preview?.promptTruncated).toBe(false);
    expect(result.prompt?.includes('…（已截断）')).toBe(false);
  });

  it('全文模式在新的 24000 字预算下，不会把约 2 万字正文误伤成截断', async () => {
    mocks.fullPageEnabled = true;
    mocks.fullPagePromptChars = 24_000;
    mocks.readableDomPayload = buildReadableDomPayload({
      title: 'Tailwind Docs',
      url: 'https://tailwindcss.com/docs/styling-with-utility-classes',
      extractedAt: 4,
      pageFingerprint: 'tailwind-docs-fingerprint-v1',
      routeKey: 'https://tailwindcss.com/docs/styling-with-utility-classes',
      text: `第一段：${'A'.repeat(9800)}\n\n第二段：${'B'.repeat(9800)}`,
      headings: [{ level: 1 as const, text: 'Styling with utility classes' }],
      contentChars: 19_816,
    });

    const { buildBrowserContextPrompt, clearBrowserContextPromptCache } = await import('./collectors');
    clearBrowserContextPromptCache();

    const result = await buildBrowserContextPrompt({
      assistantId: 'assistant-1',
      conversationKey: 'topic-1',
      force: true,
    });

    expect(result.preview?.bodyChars).toBe(19_816);
    expect(result.preview?.promptTruncated).toBe(false);
    expect(result.prompt?.includes('…（已截断）')).toBe(false);
  });

  it('当前会话自动上下文关闭时，整条 browser-context 注入会被短路', async () => {
    mocks.conversationEnabled = false;
    mocks.readableDomPayload = buildReadableDomPayload({
      extractedAt: 3,
      text: '正文不会被注入',
      headings: [{ level: 1 as const, text: '概览' }],
      contentChars: 7,
      html: '<h1>概览</h1><p>正文不会被注入</p>',
    });

    const { buildBrowserContextPrompt, clearBrowserContextPromptCache } = await import('./collectors');
    clearBrowserContextPromptCache();

    const result = await buildBrowserContextPrompt({
      assistantId: 'assistant-1',
      conversationKey: 'topic-1',
      force: true,
    });

    expect(result.prompt).toBeNull();
    expect(result.collected).toEqual([]);
    expect(result.preview).toBeNull();
    expect(mocks.sendMessageMock).not.toHaveBeenCalled();
    expect(mocks.tabsQueryMock).not.toHaveBeenCalled();
  });

  it('全文模式会临时补上 readable-dom，即使原 profile 不含正文来源', async () => {
    mocks.fullPageEnabled = true;
    mocks.policyProfile = {
      ...mocks.policyProfile,
      id: 'custom:no-readable',
      sources: ['tab-meta'],
      maxPromptChars: 3_200,
    };
    mocks.readableDomPayload = buildReadableDomPayload({
      extractedAt: 4,
      mode: 'visible-page',
      text: '这是正文',
      headings: [{ level: 1 as const, text: '概览' }],
      contentChars: 4,
    });

    const { buildBrowserContextPrompt, clearBrowserContextPromptCache } = await import('./collectors');
    clearBrowserContextPromptCache();

    const result = await buildBrowserContextPrompt({
      assistantId: 'assistant-1',
      conversationKey: 'topic-1',
      force: true,
    });

    expect(result.profile.sources).toContain('readable-dom');
    expect(result.prompt).toContain('## 当前页面上下文');
    expect(mocks.policyProfile.sources).toEqual(['tab-meta']);
  });

  it('全文模式采集正文时会向内容脚本传入 full-page 意图', async () => {
    mocks.fullPageEnabled = true;
    mocks.readableDomPayload = buildReadableDomPayload({
      extractedAt: 4,
      intent: 'full-page',
      mode: 'visible-page',
      text: '这是全文模式页面正文',
      headings: [{ level: 1 as const, text: '概览' }],
      contentChars: 10,
      visibleTextChars: 10,
    });

    const { buildBrowserContextPrompt, clearBrowserContextPromptCache } = await import('./collectors');
    clearBrowserContextPromptCache();

    await buildBrowserContextPrompt({
      assistantId: 'assistant-1',
      conversationKey: 'topic-1',
      force: true,
    });

    expect(mocks.requestReadableDomMock).toHaveBeenCalledWith(expect.objectContaining({
      tabId: 7,
      intent: 'full-page',
    }));
  });

  it('普通发送链路继续向内容脚本传入 normal 意图', async () => {
    mocks.fullPageEnabled = false;
    mocks.runtimeState.metadata = {
      title: 'Docs',
      url: 'https://example.com/docs',
      favicon: 'https://example.com/favicon.ico',
      tabId: 7,
      extractedAt: 10,
    };
    mocks.readableDomPayload = buildReadableDomPayload({
      extractedAt: 10,
      intent: 'normal',
      mode: 'article',
      text: '这是普通模式文章正文。',
      html: '<p>这是普通模式文章正文。</p>',
      headings: [{ level: 1 as const, text: '概览' }],
      contentChars: 11,
      visibleTextChars: 11,
    });

    const { clearBrowserContextPromptCache, resolveBrowserContextForSend } = await import('./collectors');
    clearBrowserContextPromptCache();

    await resolveBrowserContextForSend({
      assistantId: 'assistant-1',
      conversationKey: 'topic-1',
      requireReadableDom: true,
      requireStyleSignals: false,
      requireCaptures: false,
      budgetMs: 400,
    });

    expect(mocks.requestReadableDomMock).toHaveBeenCalledWith(expect.objectContaining({
      tabId: 7,
      intent: 'normal',
    }));
  });

  it('风格模式会临时补上 page-style-signals，并把设计信号写入 prompt', async () => {
    mocks.styleSignalsEnabled = true;
    mocks.readableDomPayload = buildReadableDomPayload({
      extractedAt: 5,
      text: '正文摘要',
      headings: [{ level: 1 as const, text: '概览' }],
      contentChars: 120,
    });
    mocks.pageStyleSignalsPayload = buildPageStyleSignalsPayload();

    const { buildBrowserContextPrompt, clearBrowserContextPromptCache } = await import('./collectors');
    clearBrowserContextPromptCache();

    const result = await buildBrowserContextPrompt({
      assistantId: 'assistant-1',
      conversationKey: 'topic-1',
      force: true,
    });

    expect(result.profile.sources).toContain('page-style-signals');
    expect(result.prompt).toContain('页面设计信号');
    expect(result.prompt).toContain('主背景色: rgb(250, 248, 240)');
    expect(result.preview?.sources).toContain('page-style-signals');
    expect(mocks.policyProfile.sources).not.toContain('page-style-signals');
  });

  it('英文语言下 markdown 自动页面上下文使用英文模板', async () => {
    const { setLanguage } = await import('@/i18n');
    setLanguage('en-US');
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      mocks.policyProfile = {
        ...mocks.policyProfile,
        sources: ['tab-meta', 'readable-dom', 'technology-stack'],
        outputFormat: 'markdown',
      };
      mocks.readableDomPayload = buildReadableDomPayload({
        title: 'Docs',
        url: 'https://example.com/docs',
        extractedAt: 5,
        text: 'Body paragraph',
        headings: [{ level: 1 as const, text: 'Overview' }],
        contentChars: 14,
      });

      const { buildBrowserContextPrompt, clearBrowserContextPromptCache } = await import('./collectors');
      clearBrowserContextPromptCache();

      const result = await buildBrowserContextPrompt({
        assistantId: 'assistant-1',
        conversationKey: 'topic-1',
        force: true,
      });

      expect(result.prompt).toContain('The following browser context was collected automatically.');
      expect(result.prompt).toContain('## Current Page Context');
      expect(result.prompt).toContain('- Page title:');
      expect(result.prompt).toContain('## Page Technology Stack Summary');
      expect(result.prompt).not.toContain('## 当前页面上下文');
      expect(result.prompt).not.toContain('## 页面技术栈摘要');
    } finally {
      setLanguage('zh-CN');
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });

  it('英文语言下 text 自动页面上下文使用英文模板', async () => {
    const { setLanguage } = await import('@/i18n');
    setLanguage('en-US');
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      mocks.policyProfile = {
        ...mocks.policyProfile,
        sources: ['tab-meta', 'readable-dom'],
        outputFormat: 'text',
      };
      mocks.readableDomPayload = buildReadableDomPayload({
        title: 'Docs',
        url: 'https://example.com/docs',
        extractedAt: 5,
        text: 'Body paragraph',
        headings: [{ level: 1 as const, text: 'Overview' }],
        contentChars: 14,
      });

      const { buildBrowserContextPrompt, clearBrowserContextPromptCache } = await import('./collectors');
      clearBrowserContextPromptCache();

      const result = await buildBrowserContextPrompt({
        assistantId: 'assistant-1',
        conversationKey: 'topic-1',
        force: true,
      });

      expect(result.prompt).toContain('[Current page context]');
      expect(result.prompt).toContain('Page title:');
      expect(result.prompt).toContain('Body excerpt:');
      expect(result.prompt).not.toContain('当前页面上下文');
    } finally {
      setLanguage('zh-CN');
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });

  it('英文语言下 JSON 自动页面上下文使用英文说明', async () => {
    const { setLanguage } = await import('@/i18n');
    setLanguage('en-US');
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      mocks.policyProfile = {
        ...mocks.policyProfile,
        sources: ['tab-meta', 'readable-dom', 'technology-stack'],
        outputFormat: 'json',
      };
      mocks.readableDomPayload = buildReadableDomPayload({
        title: 'Docs',
        url: 'https://example.com/docs',
        extractedAt: 5,
        text: 'Body paragraph',
        headings: [{ level: 1 as const, text: 'Overview' }],
        contentChars: 14,
      });

      const { buildBrowserContextPrompt, clearBrowserContextPromptCache } = await import('./collectors');
      clearBrowserContextPromptCache();

      const result = await buildBrowserContextPrompt({
        assistantId: 'assistant-1',
        conversationKey: 'topic-1',
        force: true,
      });

      expect(result.prompt).toContain('The following browser context was collected automatically.');
      expect(result.prompt).toContain('"safeSummary": "Contains only summarized public page signals');
      expect(result.prompt).not.toContain('以下是自动采集');
      expect(result.prompt).not.toContain('只包含公开页面信号归纳');
    } finally {
      setLanguage('zh-CN');
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });

  it('旧页面采集晚到时，不会把过期预览覆盖到当前 tab', async () => {
    mocks.runtimeState.metadata = {
      title: '旧页面',
      url: 'https://example.com/old',
      favicon: 'https://example.com/old.ico',
      tabId: 7,
      extractedAt: 1,
    };

    const readableDomLatch: { release: (() => void) | null } = { release: null };
    const readableDomGate = new Promise<void>((resolve) => {
      readableDomLatch.release = () => resolve();
    });
    mocks.requestPageStyleLayoutMock.mockResolvedValue({
      ok: true,
      payload: {
        title: '旧页面',
        url: 'https://example.com/old',
        pageFingerprint: 'fingerprint-old-v1',
        routeKey: 'https://example.com/old',
        stableWindowVersion: 1,
        extractedAt: 1,
        documentHeight: 1600,
        viewportHeight: 900,
        scrollY: 0,
      },
      error: null,
    });
    mocks.requestReadableDomMock.mockImplementation(async () => {
      await readableDomGate;
      return {
        ok: true,
        payload: buildReadableDomPayload({
          title: '旧页面',
          url: 'https://example.com/old',
          pageFingerprint: 'fingerprint-old-v1',
          routeKey: 'https://example.com/old',
          extractedAt: 1,
          text: '这是旧页面正文。',
          headings: [{ level: 1 as const, text: '旧页面标题' }],
          contentChars: 8,
        }),
        error: null,
      };
    });

    const { buildBrowserContextPrompt, clearBrowserContextPromptCache } = await import('./collectors');
    clearBrowserContextPromptCache();

    const pending = buildBrowserContextPrompt({
      assistantId: 'assistant-1',
      conversationKey: 'topic-1',
    });
    await Promise.resolve();
    await Promise.resolve();

    mocks.runtimeState.metadata = {
      title: '新页面',
      url: 'https://example.com/new',
      favicon: 'https://example.com/new.ico',
      tabId: 8,
      extractedAt: 2,
    };

    if (readableDomLatch.release) {
      readableDomLatch.release();
    }

    await pending;

    expect(mocks.requestReadableDomMock).toHaveBeenCalledTimes(1);
    expect(mocks.runtimeState.lastCollection).toBeNull();
  });

  it('markdown 输出会优先注入 HTML 转换后的 Markdown 正文', async () => {
    mocks.policyProfile = {
      ...mocks.policyProfile,
      outputFormat: 'markdown',
    };
    mocks.readableDomPayload = buildReadableDomPayload({
      extractedAt: 7,
      text: '概览\n\n这是一段正文。',
      html: '<h1>概览</h1><p>这是一段正文。</p>',
      headings: [{ level: 1 as const, text: '概览' }],
      contentChars: 10,
    });

    const { buildBrowserContextPrompt, clearBrowserContextPromptCache } = await import('./collectors');
    clearBrowserContextPromptCache();
    const result = await buildBrowserContextPrompt({
      assistantId: 'assistant-1',
      conversationKey: 'topic-1',
      force: true,
    });

    expect(result.prompt).toContain('# 概览');
    expect(result.prompt).not.toContain('正文片段：\n概览\n\n这是一段正文。');
  });

  it('text 输出也会优先注入 HTML 转换后的 Markdown 正文', async () => {
    mocks.policyProfile = {
      ...mocks.policyProfile,
      outputFormat: 'text',
    };
    mocks.readableDomPayload = buildReadableDomPayload({
      extractedAt: 8,
      text: '概览\n\n这是一段正文。',
      html: '<h1>概览</h1><p>这是一段正文。</p>',
      headings: [{ level: 1 as const, text: '概览' }],
      contentChars: 10,
    });

    const { buildBrowserContextPrompt, clearBrowserContextPromptCache } = await import('./collectors');
    clearBrowserContextPromptCache();
    const result = await buildBrowserContextPrompt({
      assistantId: 'assistant-1',
      conversationKey: 'topic-1',
      force: true,
    });

    expect(result.prompt).toContain('# 概览');
    expect(result.prompt).toContain('这是一段正文。');
  });

  it('json 输出会把 readable-dom 的正文主体切到 Markdown 版本', async () => {
    mocks.policyProfile = {
      ...mocks.policyProfile,
      outputFormat: 'json',
    };
    mocks.readableDomPayload = buildReadableDomPayload({
      extractedAt: 9,
      text: '概览\n\n这是一段正文。',
      html: '<h1>概览</h1><p>这是一段正文。</p>',
      headings: [{ level: 1 as const, text: '概览' }],
      contentChars: 10,
    });

    const { buildBrowserContextPrompt, clearBrowserContextPromptCache } = await import('./collectors');
    clearBrowserContextPromptCache();
    const result = await buildBrowserContextPrompt({
      assistantId: 'assistant-1',
      conversationKey: 'topic-1',
      force: true,
    });

    expect(result.prompt).toContain('"text": "# 概览\\n\\n这是一段正文。"');
  });

  it('send-preflight 会复用 stable readable-dom source cache，不会在同页稳定版本下重复抓正文', async () => {
    mocks.runtimeState.metadata = {
      title: 'Docs',
      url: 'https://example.com/docs',
      favicon: 'https://example.com/favicon.ico',
      tabId: 7,
      extractedAt: 10,
      technologyStackPageKey: '7::https://example.com/docs::0',
    };
    mocks.readableDomPayload = buildReadableDomPayload({
      extractedAt: 10,
      text: '这是稳定正文。',
      html: '<p>这是稳定正文。</p>',
      headings: [{ level: 1 as const, text: '概览' }],
      contentChars: 6,
    });

    const { clearBrowserContextPromptCache, resolveBrowserContextForSend } = await import('./collectors');
    clearBrowserContextPromptCache();

    const first = await resolveBrowserContextForSend({
      assistantId: 'assistant-1',
      conversationKey: 'topic-1',
      requireReadableDom: true,
      requireStyleSignals: false,
      requireCaptures: false,
      budgetMs: 400,
    });
    const second = await resolveBrowserContextForSend({
      assistantId: 'assistant-1',
      conversationKey: 'topic-1',
      requireReadableDom: true,
      requireStyleSignals: false,
      requireCaptures: false,
      budgetMs: 400,
    });

    expect(first.browserContext.prompt).toContain('这是稳定正文。');
    expect(second.browserContext.prompt).toContain('这是稳定正文。');
    expect(mocks.requestPageStyleLayoutMock).toHaveBeenCalledTimes(2);
    expect(mocks.requestReadableDomMock).toHaveBeenCalledTimes(1);
  });

  it('send-preflight 在安装期网页权限模型下直接采集正文，不调用授权或动态注册刷新', async () => {
    mocks.runtimeState.metadata = {
      title: 'Docs',
      url: 'https://example.com/docs',
      favicon: 'https://example.com/favicon.ico',
      tabId: 7,
      extractedAt: 10,
    };
    mocks.readableDomPayload = buildReadableDomPayload({
      extractedAt: 10,
      text: '授权后当前这一轮应该读到正文。',
      html: '<p>授权后当前这一轮应该读到正文。</p>',
      headings: [{ level: 1 as const, text: '概览' }],
      contentChars: 15,
    });
    const { clearBrowserContextPromptCache, resolveBrowserContextForSend } = await import('./collectors');
    clearBrowserContextPromptCache();

    const result = await resolveBrowserContextForSend({
      assistantId: 'assistant-1',
      conversationKey: 'topic-1',
      requireReadableDom: true,
      requireStyleSignals: false,
      requireCaptures: false,
      budgetMs: 400,
    });

    expect(mocks.requestReadableDomMock).toHaveBeenCalledTimes(1);
    expect(result.browserContext.prompt).toContain('授权后当前这一轮应该读到正文。');
    expect(result.status).toBe('ready');
  });

  it('send-preflight 总预算不会放大 readable-dom 顶层稳定窗口', async () => {
    mocks.runtimeState.metadata = {
      title: 'Preview Shell',
      url: 'https://example.com/preview',
      favicon: 'https://example.com/favicon.ico',
      tabId: 7,
      extractedAt: 10,
    };
    mocks.readableDomPayload = buildReadableDomPayload({
      extractedAt: 10,
      text: 'iframe 补采集后的正文。',
      html: '<p>iframe 补采集后的正文。</p>',
      headings: [{ level: 1 as const, text: '概览' }],
      contentChars: 11,
      sourceKind: 'embedded-frame',
      frameUrl: 'https://embed.example/',
      isTopFrame: false,
    });
    const { clearBrowserContextPromptCache, resolveBrowserContextForSend } = await import('./collectors');
    clearBrowserContextPromptCache();

    const result = await resolveBrowserContextForSend({
      assistantId: 'assistant-1',
      conversationKey: 'topic-1',
      requireReadableDom: true,
      requireStyleSignals: false,
      requireCaptures: false,
      budgetMs: 2_500,
    });

    expect(mocks.requestReadableDomMock).toHaveBeenCalledWith({
      tabId: 7,
      intent: 'normal',
      stableWaitMs: 400,
    });
    expect(result.browserContext.preview?.bodyAvailable).toBe(true);
    expect(result.browserContext.preview?.captureMode).toBe('embedded-frame');
  });

  it('全文模式 send-preflight 仍把长稳定窗口传给 readable-dom', async () => {
    mocks.fullPageEnabled = true;
    mocks.runtimeState.metadata = {
      title: 'Docs',
      url: 'https://example.com/docs',
      favicon: 'https://example.com/favicon.ico',
      tabId: 7,
      extractedAt: 10,
    };
    mocks.readableDomPayload = buildReadableDomPayload({
      extractedAt: 10,
      intent: 'full-page',
      mode: 'visible-page',
      text: '全文模式下的可见页面正文。',
      html: '<p>全文模式下的可见页面正文。</p>',
      headings: [{ level: 1 as const, text: '概览' }],
      contentChars: 14,
    });
    const { clearBrowserContextPromptCache, resolveBrowserContextForSend } = await import('./collectors');
    clearBrowserContextPromptCache();

    const result = await resolveBrowserContextForSend({
      assistantId: 'assistant-1',
      conversationKey: 'topic-1',
      requireReadableDom: true,
      requireStyleSignals: false,
      requireCaptures: false,
      budgetMs: 4_000,
    });

    expect(mocks.requestReadableDomMock).toHaveBeenCalledWith({
      tabId: 7,
      intent: 'full-page',
      stableWaitMs: 2_000,
    });
    expect(result.browserContext.prompt).toContain('全文模式下的可见页面正文。');
  });

  it('send-preflight 内容脚本不可达时返回降级预览，不回退到运行时授权流程', async () => {
    mocks.runtimeState.metadata = {
      title: 'Docs',
      url: 'https://example.com/docs',
      favicon: 'https://example.com/favicon.ico',
      tabId: 7,
      extractedAt: 10,
    };
    mocks.requestReadableDomMock.mockResolvedValue({
      ok: false,
      payload: null,
      error: 'content-script-unreachable',
    });

    const { clearBrowserContextPromptCache, resolveBrowserContextForSend } = await import('./collectors');
    clearBrowserContextPromptCache();

    const result = await resolveBrowserContextForSend({
      assistantId: 'assistant-1',
      conversationKey: 'topic-1',
      requireReadableDom: true,
      requireStyleSignals: false,
      requireCaptures: false,
      budgetMs: 400,
    });

    expect(mocks.requestReadableDomMock).toHaveBeenCalledTimes(1);
    expect(result.browserContext.prompt ?? '').not.toContain('不应该被读取的正文。');
    expect(result.browserContext.preview?.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceId: 'readable-dom',
        code: 'content-script-unreachable',
      }),
    ]));
    expect(result.captureWarning).toBeNull();
    expect(result.status).toBe('degraded');
  });

  it('technology-stack source 会进入自动上下文 prompt 且不会冲掉正文 source', async () => {
    mocks.runtimeState.metadata = {
      title: 'Docs',
      url: 'https://example.com/docs',
      favicon: 'https://example.com/favicon.ico',
      tabId: 7,
      extractedAt: 10,
    };
    mocks.policyProfile = {
      ...mocks.policyProfile,
      sources: ['tab-meta', 'technology-stack', 'readable-dom'],
    };
    mocks.readableDomPayload = buildReadableDomPayload({
      text: '页面正文。',
      html: '<p>页面正文。</p>',
      contentChars: 5,
    });

    const { clearBrowserContextPromptCache, resolveBrowserContextForSend } = await import('./collectors');
    clearBrowserContextPromptCache();

    const result = await resolveBrowserContextForSend({
      assistantId: 'assistant-1',
      conversationKey: 'topic-1',
      requireReadableDom: true,
      requireStyleSignals: false,
      requireCaptures: false,
      budgetMs: 400,
    });

    expect(mocks.requestTechnologyStackMock).toHaveBeenCalledWith({
      tabId: 7,
      minPass: 'enhanced',
      waitMs: 6500,
    });
    expect(result.browserContext.prompt).toContain('## 页面技术栈摘要');
    expect(result.browserContext.prompt).toContain('React 19.0.0');
    expect(result.browserContext.prompt).toContain('页面正文。');
    expect(result.browserContext.prompt).toContain('不包含原始 HTML、cookie 值、脚本片段或 CSS 原文');
    expect(result.browserContext.prompt).not.toContain('<p>页面正文。</p>');
    expect(result.browserContext.sourceManifest['readable-dom'].payloadRef).toBeTruthy();
    expect(result.browserContext.sourceManifest['readable-dom'].issueCode).not.toBe('collector-unavailable');
    expect(result.browserContext.preview?.bodyAvailable).toBe(true);
    expect(result.browserContext.preview?.issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceId: 'readable-dom',
        code: 'collector-unavailable',
      }),
    ]));
  });

  it('普通模式长正文触发截断时仍保留技术栈摘要', async () => {
    mocks.runtimeState.metadata = {
      title: 'Long Docs',
      url: 'https://example.com/long-docs',
      favicon: 'https://example.com/favicon.ico',
      tabId: 7,
      extractedAt: 11,
    };
    mocks.policyProfile = {
      ...mocks.policyProfile,
      sources: ['tab-meta', 'readable-dom', 'technology-stack'],
      outputFormat: 'markdown',
      maxPromptChars: 6_000,
    };
    mocks.readableDomPayload = buildReadableDomPayload({
      title: 'Long Docs',
      url: 'https://example.com/long-docs',
      extractedAt: 11,
      pageFingerprint: 'fingerprint-long-docs-v2',
      routeKey: 'https://example.com/long-docs',
      text: `第一段：${'A'.repeat(5200)}\n\n第二段：${'B'.repeat(5200)}`,
      html: `<h1>超长正文</h1><p>${'A'.repeat(5200)}</p><p>${'B'.repeat(5200)}</p>`,
      headings: [{ level: 1 as const, text: '超长正文' }],
      contentChars: 10_416,
    });

    const { buildBrowserContextPrompt, clearBrowserContextPromptCache } = await import('./collectors');
    clearBrowserContextPromptCache();

    const result = await buildBrowserContextPrompt({
      assistantId: 'assistant-1',
      conversationKey: 'topic-1',
      force: true,
    });

    expect(result.prompt?.length ?? 0).toBeLessThanOrEqual(6_000);
    expect(result.prompt).toContain('## 当前页面上下文');
    expect(result.prompt).toContain('## 页面技术栈摘要');
    expect(result.prompt).toContain('React 19.0.0');
    expect(result.prompt).toContain('…（已截断）');
    expect(result.preview?.promptTruncated).toBe(true);
  });

  it.each(['text', 'json'] as const)('%s 输出长正文截断时仍保留技术栈 source', async (outputFormat) => {
    mocks.runtimeState.metadata = {
      title: 'Long Docs',
      url: 'https://example.com/long-docs',
      favicon: 'https://example.com/favicon.ico',
      tabId: 7,
      extractedAt: 12,
    };
    mocks.policyProfile = {
      ...mocks.policyProfile,
      sources: ['tab-meta', 'readable-dom', 'technology-stack'],
      outputFormat,
      maxPromptChars: 6_000,
    };
    mocks.readableDomPayload = buildReadableDomPayload({
      title: 'Long Docs',
      url: 'https://example.com/long-docs',
      extractedAt: 12,
      pageFingerprint: 'fingerprint-long-docs-v3',
      routeKey: 'https://example.com/long-docs',
      text: `第一段：${'A'.repeat(5200)}\n\n第二段：${'B'.repeat(5200)}`,
      html: `<h1>超长正文</h1><p>${'A'.repeat(5200)}</p><p>${'B'.repeat(5200)}</p>`,
      headings: [{ level: 1 as const, text: '超长正文' }],
      contentChars: 10_416,
    });

    const { buildBrowserContextPrompt, clearBrowserContextPromptCache } = await import('./collectors');
    clearBrowserContextPromptCache();

    const result = await buildBrowserContextPrompt({
      assistantId: 'assistant-1',
      conversationKey: 'topic-1',
      force: true,
    });

    expect(result.prompt?.length ?? 0).toBeLessThanOrEqual(6_000);
    expect(result.prompt).toContain(outputFormat === 'json' ? '"technology-stack"' : '## 页面技术栈摘要');
    expect(result.prompt).toContain('React');
    expect(result.preview?.promptTruncated).toBe(true);
  });

  it('send-preflight 会复用同页已存风格截图，不会每次发送都重新截图', async () => {
    mocks.styleSignalsEnabled = true;
    mocks.runtimeState.metadata = {
      title: 'Docs',
      url: 'https://example.com/docs',
      favicon: 'https://example.com/favicon.ico',
      tabId: 7,
      extractedAt: 10,
    };
    mocks.readableDomPayload = buildReadableDomPayload({
      extractedAt: 10,
      text: '这是稳定正文。',
      html: '<p>这是稳定正文。</p>',
      headings: [{ level: 1 as const, text: '概览' }],
      contentChars: 6,
    });
    mocks.pageStyleSignalsPayload = buildPageStyleSignalsPayload();
    mocks.pageStyleCapturesPayload = buildPageStyleCapturesPayload();

    const { clearBrowserContextPromptCache, resolveBrowserContextForSend } = await import('./collectors');
    clearBrowserContextPromptCache();

    const first = await resolveBrowserContextForSend({
      assistantId: 'assistant-1',
      conversationKey: 'topic-1',
      requireReadableDom: true,
      requireStyleSignals: true,
      requireCaptures: true,
      budgetMs: 400,
    });
    const second = await resolveBrowserContextForSend({
      assistantId: 'assistant-1',
      conversationKey: 'topic-1',
      requireReadableDom: true,
      requireStyleSignals: true,
      requireCaptures: true,
      budgetMs: 400,
    });

    expect(first.browserContext.prompt).toContain('页面设计信号');
    expect(second.browserContext.prompt).toContain('页面设计信号');
    expect(first.captureFrames).toHaveLength(1);
    expect(second.captureFrames).toHaveLength(1);
    expect(mocks.runtimeState.lastCollection).toEqual(expect.objectContaining({
      styleCapture: {
        requested: true,
        frameCount: 1,
        target: 'vision-input',
        warningCode: null,
      },
    }));
    expect(mocks.requestPageStyleSignalsMock).toHaveBeenCalledTimes(1);
    expect(mocks.requestPageStyleCapturesMock).toHaveBeenCalledTimes(1);
    expect(mocks.putImageAttachmentMock).toHaveBeenCalledTimes(1);
    expect(mocks.blobToDataUrlMock).toHaveBeenCalledTimes(2);
  });

  it('send-preflight 在风格模式但不需要视觉截图时，会把仅设计信号状态写入预览', async () => {
    mocks.styleSignalsEnabled = true;
    mocks.runtimeState.metadata = {
      title: 'Docs',
      url: 'https://example.com/docs',
      favicon: 'https://example.com/favicon.ico',
      tabId: 7,
      extractedAt: 10,
    };
    mocks.readableDomPayload = buildReadableDomPayload({
      extractedAt: 10,
      text: '这是稳定正文。',
      html: '<p>这是稳定正文。</p>',
      headings: [{ level: 1 as const, text: '概览' }],
      contentChars: 6,
    });
    mocks.pageStyleSignalsPayload = buildPageStyleSignalsPayload();

    const { clearBrowserContextPromptCache, resolveBrowserContextForSend } = await import('./collectors');
    clearBrowserContextPromptCache();

    const result = await resolveBrowserContextForSend({
      assistantId: 'assistant-1',
      conversationKey: 'topic-1',
      requireReadableDom: true,
      requireStyleSignals: true,
      requireCaptures: false,
      budgetMs: 400,
    });

    expect(result.captureFrames).toHaveLength(0);
    expect(result.styleCapture).toEqual({
      requested: false,
      frameCount: 0,
      target: 'style-signals-only',
      warningCode: null,
    });
    expect(mocks.runtimeState.lastCollection).toEqual(expect.objectContaining({
      styleCapture: {
        requested: false,
        frameCount: 0,
        target: 'style-signals-only',
        warningCode: null,
      },
    }));
    expect(mocks.requestPageStyleCapturesMock).not.toHaveBeenCalled();
  });
});
