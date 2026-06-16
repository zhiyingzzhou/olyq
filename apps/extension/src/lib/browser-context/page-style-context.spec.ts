/**
 * 说明：`page-style-context.spec` 页面风格 topic 级 snapshot 模块测试。
 *
 * 职责：
 * - 验证 `live / stored / force / requireCaptures` 的关键复用合同，不再只靠上层集成间接覆盖；
 * - 守住 topic 级 snapshot 的写回、替换旧截图和 live 不可达 fallback 语义；
 * - 验证返回给调用方的 snapshot 仍是防御性拷贝，不会污染持久化真源。
 *
 * 边界：
 * - 本文件只覆盖 browser-context 层的 snapshot 解析与复用，不验证真实 content script DOM/CSS 抽样；
 * - 存储、附件库与 SW one-shot 请求全部用受控 mock 驱动，避免测试跨到其它运行时实现细节。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonStorageMock } from '@/test/json-storage-mock';

import type { BrowserContextMetadataSnapshot } from './types';
import type {
  PageStyleCapturesPayload,
  PageStyleLayoutMetricsPayload,
  PageStyleSignalsPayload,
} from '@/types/sw-messages';

const mocks = vi.hoisted(() => {
  let attachmentCounter = 0;
  return {
    requestLayoutMock: vi.fn(),
    requestSignalsMock: vi.fn(),
    requestCapturesMock: vi.fn(),
    deleteAttachmentsMock: vi.fn(async () => undefined),
    getAttachmentBlobMock: vi.fn(async () => new Blob(['stored-image'], { type: 'image/png' })),
    blobToDataUrlMock: vi.fn(async () => 'data:image/png;base64,c3RvcmVkLWltYWdl'),
    dataUrlToBlobMock: vi.fn(() => ({
      blob: new Blob(['captured-image'], { type: 'image/png' }),
      mime: 'image/png',
    })),
    putImageAttachmentMock: vi.fn(async ({ name, mime }: { name: string; mime: string }) => {
      attachmentCounter += 1;
      return {
        id: `capture-${attachmentCounter}`,
        type: 'image' as const,
        name,
        mime,
        size: 128,
      };
    }),
    /**
     * 重置当前 spec 里所有受控 mock 与内存态，确保每个用例都从干净 snapshot 起跑。
     */
    reset() {
      attachmentCounter = 0;
      this.requestLayoutMock.mockReset();
      this.requestSignalsMock.mockReset();
      this.requestCapturesMock.mockReset();
      this.deleteAttachmentsMock.mockClear();
      this.getAttachmentBlobMock.mockClear();
      this.blobToDataUrlMock.mockClear();
      this.dataUrlToBlobMock.mockClear();
      this.putImageAttachmentMock.mockClear();
    },
  };
});

vi.mock('@/lib/storage/json-storage', async () => {
  const { createJsonStorageMockModule } = await import('@/test/json-storage-mock');
  return createJsonStorageMockModule();
});

vi.mock('@/lib/extension/browser-context-api', () => ({
  requestBrowserContextPageStyleLayout: mocks.requestLayoutMock,
  requestBrowserContextPageStyleSignals: mocks.requestSignalsMock,
  requestBrowserContextPageStyleCaptures: mocks.requestCapturesMock,
}));

vi.mock('@/lib/attachments', () => ({
  deleteAttachments: mocks.deleteAttachmentsMock,
  getAttachmentBlob: mocks.getAttachmentBlobMock,
  blobToDataUrl: mocks.blobToDataUrlMock,
  dataUrlToBlob: mocks.dataUrlToBlobMock,
  putImageAttachment: mocks.putImageAttachmentMock,
}));

/**
 * 构造 browser-context metadata 快照，供 `page-style-context` 走 live/stored 分支判断。
 *
 * @param overrides - 需要覆盖的 metadata 字段。
 * @returns 带默认页面信息的 metadata snapshot。
 */
function buildMetadata(overrides?: Partial<BrowserContextMetadataSnapshot>): BrowserContextMetadataSnapshot {
  return {
    title: 'Example page',
    url: 'https://example.com/page',
    favicon: 'https://example.com/favicon.ico',
    tabId: 7,
    extractedAt: 1,
    ...overrides,
  };
}

/**
 * 构造页面风格 signals payload，保持测试里的字段形状与真实协议一致。
 *
 * @param overrides - 需要覆盖的 signals 字段。
 * @returns 可直接喂给 snapshot 或 mock 响应的页面风格 signals。
 */
function buildSignals(overrides?: Partial<PageStyleSignalsPayload>): PageStyleSignalsPayload {
  const payload = {
    title: 'Example page',
    url: 'https://example.com/page',
    pageFingerprint: 'fingerprint-v1',
    routeKey: 'https://example.com/page',
    stableWindowVersion: 1,
    extractedAt: 10,
    page: {
      backgroundColor: 'rgb(255, 255, 255)',
      textColor: 'rgb(17, 17, 17)',
      linkColor: 'rgb(40, 80, 200)',
      primaryButtonColor: 'rgb(20, 120, 230)',
      borderColors: ['rgb(220, 220, 220)'],
      shadowSamples: ['0 8px 24px rgba(0, 0, 0, 0.12)'],
      radiusSamples: ['24px'],
      maxContentWidth: 1200,
      centeredLayout: true,
      airyWhitespace: false,
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
      sectionCount: 3,
      sectionGapSamples: [96, 128],
      cardGridHint: 'multi-column-grid',
      imageDensity: 'medium' as const,
    },
    components: {
      buttonStyles: ['bg:rgb(20, 120, 230)'],
      cardStyles: ['bg:rgba(255, 255, 255, 0.85)'],
      inputStyles: ['border:rgb(220, 220, 220)'],
      tagStyles: ['radius:999px'],
      navStyles: ['shadow:0 8px 24px rgba(0, 0, 0, 0.12)'],
    },
    decoration: {
      hasLargeImages: true,
      usesGradients: true,
      usesIllustrations: false,
      usesBorders: true,
      usesGlass: false,
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
    routeKey: payload.routeKey ?? 'https://example.com/page',
    stableWindowVersion: payload.stableWindowVersion ?? 1,
  };
}

/**
 * 构造页面布局 metrics payload，专门驱动 fingerprint / live 页面判断。
 *
 * @param overrides - 需要覆盖的布局指标字段。
 * @returns 带默认文档高度与 viewport 信息的布局 payload。
 */
function buildLayout(overrides?: Partial<PageStyleLayoutMetricsPayload>): PageStyleLayoutMetricsPayload {
  const payload = {
    title: 'Example page',
    url: 'https://example.com/page',
    pageFingerprint: 'fingerprint-v1',
    routeKey: 'https://example.com/page',
    stableWindowVersion: 1,
    extractedAt: 12,
    documentHeight: 2400,
    viewportHeight: 900,
    scrollY: 0,
    ...overrides,
  };
  return {
    ...payload,
    routeKey: payload.routeKey ?? 'https://example.com/page',
    stableWindowVersion: payload.stableWindowVersion ?? 1,
  };
}

/**
 * 构造页面截图 payload，模拟 content script 返回的截图编排结果。
 *
 * @param overrides - 需要覆盖的截图 payload 字段。
 * @returns 带单帧截图的 captures payload。
 */
function buildCapturesPayload(overrides?: Partial<PageStyleCapturesPayload>): PageStyleCapturesPayload {
  const payload = {
    title: 'Example page',
    url: 'https://example.com/page',
    pageFingerprint: 'fingerprint-v1',
    routeKey: 'https://example.com/page',
    stableWindowVersion: 1,
    extractedAt: 20,
    frames: [{
      name: 'page-style-01.png',
      mime: 'image/png',
      dataUrl: 'data:image/png;base64,Y2FwdHVyZS0x',
      scrollY: 120,
    }],
    ...overrides,
  };
  return {
    ...payload,
    routeKey: payload.routeKey ?? 'https://example.com/page',
    stableWindowVersion: payload.stableWindowVersion ?? 1,
  };
}

/**
 * 构造已持久化的 topic 级页面风格 snapshot，用于验证 stored 复用与替换逻辑。
 *
 * @param overrides - 允许覆盖 topicId、fingerprint、captures 与 signals 局部字段。
 * @returns 符合存储结构的页面风格 snapshot。
 */
function buildStoredSnapshot(overrides: {
  topicId?: string;
  pageFingerprint?: string;
  captures?: Array<{ id: string; name: string; mime: string; size: number; scrollY: number }>;
  signals?: Partial<PageStyleSignalsPayload>;
} = {}) {
  const topicId = overrides.topicId ?? 'topic-1';
  const pageFingerprint = overrides.pageFingerprint ?? 'fingerprint-v1';
  const captures = overrides.captures ?? [{
    id: 'capture-old-1',
    name: 'page-style-01.png',
    mime: 'image/png',
    size: 64,
    scrollY: 0,
  }];
  return {
    topicId,
    title: 'Example page',
    url: 'https://example.com/page',
    pageFingerprint,
    signals: buildSignals({
      pageFingerprint,
      ...overrides.signals,
    }),
    captures,
    capturedAt: 1,
    updatedAt: 1,
  };
}

describe('page-style-context', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-14T22:30:00.000Z'));
    mocks.reset();
    jsonStorageMock.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('page fingerprint 未变时会直接复用 stored snapshot，不重复请求 signals/captures', async () => {
    const storedSnapshot = buildStoredSnapshot();
    jsonStorageMock.setStoredValue('olyq.browser-context.page-style-snapshots.v1', {
      'topic-1': storedSnapshot,
    });
    mocks.requestLayoutMock.mockResolvedValue({
      ok: true,
      payload: buildLayout({
        pageFingerprint: storedSnapshot.pageFingerprint,
      }),
      error: null,
    });

    const { resolvePageStyleContextSnapshot } = await import('./page-style-context');
    const result = await resolvePageStyleContextSnapshot({
      conversationKey: 'topic-1',
      metadata: buildMetadata(),
    });

    expect(result.snapshotSource).toBe('stored');
    expect(result.snapshot?.pageFingerprint).toBe('fingerprint-v1');
    expect(mocks.requestSignalsMock).not.toHaveBeenCalled();
    expect(mocks.requestCapturesMock).not.toHaveBeenCalled();
  });

  it('仅 viewport height 改变导致 fingerprint 变化时，不再直接复用 stored snapshot/captures', async () => {
    const storedSnapshot = buildStoredSnapshot();
    const resizedFingerprint = 'fingerprint-v1::vh-768';
    jsonStorageMock.setStoredValue('olyq.browser-context.page-style-snapshots.v1', {
      'topic-1': storedSnapshot,
    });
    mocks.requestLayoutMock.mockResolvedValue({
      ok: true,
      payload: buildLayout({
        pageFingerprint: resizedFingerprint,
        viewportHeight: 768,
      }),
      error: null,
    });
    mocks.requestSignalsMock.mockResolvedValue({
      ok: true,
      payload: buildSignals({
        pageFingerprint: resizedFingerprint,
      }),
      error: null,
    });
    mocks.requestCapturesMock.mockResolvedValue({
      ok: true,
      payload: buildCapturesPayload({
        pageFingerprint: resizedFingerprint,
      }),
      error: null,
    });

    const {
      getPageStyleContextSnapshot,
      resolvePageStyleContextSnapshot,
    } = await import('./page-style-context');
    const result = await resolvePageStyleContextSnapshot({
      conversationKey: 'topic-1',
      metadata: buildMetadata(),
      requireCaptures: true,
      maxCaptures: 5,
    });
    const storedAgain = await getPageStyleContextSnapshot('topic-1');

    expect(result.snapshotSource).toBe('live');
    expect(result.snapshot?.pageFingerprint).toBe(resizedFingerprint);
    expect(storedAgain?.pageFingerprint).toBe(resizedFingerprint);
    expect(mocks.requestSignalsMock).toHaveBeenCalledTimes(1);
    expect(mocks.requestCapturesMock).toHaveBeenCalledTimes(1);
  });

  it('当前页面不可达时，会回退到 topic 已有的 stored snapshot', async () => {
    const storedSnapshot = buildStoredSnapshot({
      captures: [],
    });
    jsonStorageMock.setStoredValue('olyq.browser-context.page-style-snapshots.v1', {
      'topic-1': storedSnapshot,
    });
    mocks.requestLayoutMock.mockResolvedValue({
      ok: false,
      payload: null,
      error: 'content-script-unreachable',
    });

    const { resolvePageStyleContextSnapshot } = await import('./page-style-context');
    const result = await resolvePageStyleContextSnapshot({
      conversationKey: 'topic-1',
      metadata: buildMetadata(),
      requireCaptures: true,
    });

    expect(result.snapshotSource).toBe('stored');
    expect(result.liveError).toBe('content-script-unreachable');
    expect(result.captureWarning?.key).toBe('errors.pageStyleScreenshotsUnavailableWithDetail');
    expect(result.snapshot?.signals.title).toBe('Example page');
  });

  it('force 刷新会重新请求 live signals 与 captures，并替换旧的隐藏截图引用', async () => {
    const storedSnapshot = buildStoredSnapshot();
    jsonStorageMock.setStoredValue('olyq.browser-context.page-style-snapshots.v1', {
      'topic-1': storedSnapshot,
    });
    mocks.requestLayoutMock.mockResolvedValue({
      ok: true,
      payload: buildLayout({
        pageFingerprint: storedSnapshot.pageFingerprint,
      }),
      error: null,
    });
    mocks.requestSignalsMock.mockResolvedValue({
      ok: true,
      payload: buildSignals({
        pageFingerprint: storedSnapshot.pageFingerprint,
        page: {
          ...buildSignals().page,
          backgroundColor: 'rgb(250, 248, 240)',
        },
      }),
      error: null,
    });
    mocks.requestCapturesMock.mockResolvedValue({
      ok: true,
      payload: buildCapturesPayload(),
      error: null,
    });

    const {
      getPageStyleContextSnapshot,
      resolvePageStyleContextSnapshot,
    } = await import('./page-style-context');
    const result = await resolvePageStyleContextSnapshot({
      conversationKey: 'topic-1',
      metadata: buildMetadata(),
      forceSignals: true,
      forceCaptures: true,
      requireCaptures: true,
      maxCaptures: 5,
    });
    const storedAgain = await getPageStyleContextSnapshot('topic-1');

    expect(result.snapshotSource).toBe('live');
    expect(result.snapshot?.signals.page.backgroundColor).toBe('rgb(250, 248, 240)');
    expect(result.snapshot?.captures).toEqual([expect.objectContaining({
      id: 'capture-1',
      scrollY: 120,
    })]);
    expect(mocks.requestSignalsMock).toHaveBeenCalledTimes(1);
    expect(mocks.requestCapturesMock).toHaveBeenCalledTimes(1);
    expect(mocks.deleteAttachmentsMock).toHaveBeenCalledWith(['capture-old-1']);
    expect(storedAgain?.captures).toEqual([expect.objectContaining({
      id: 'capture-1',
      scrollY: 120,
    })]);
  });

  it('requireCaptures 命中同页且已有截图时，会直接复用 stored snapshot', async () => {
    const storedSnapshot = buildStoredSnapshot({
      captures: [{
        id: 'capture-existing-1',
        name: 'page-style-01.png',
        mime: 'image/png',
        size: 64,
        scrollY: 80,
      }],
    });
    jsonStorageMock.setStoredValue('olyq.browser-context.page-style-snapshots.v1', {
      'topic-1': storedSnapshot,
    });
    mocks.requestLayoutMock.mockResolvedValue({
      ok: true,
      payload: buildLayout({
        pageFingerprint: storedSnapshot.pageFingerprint,
      }),
      error: null,
    });

    const { resolvePageStyleContextSnapshot } = await import('./page-style-context');
    const result = await resolvePageStyleContextSnapshot({
      conversationKey: 'topic-1',
      metadata: buildMetadata(),
      requireCaptures: true,
    });

    expect(result.snapshotSource).toBe('stored');
    expect(result.captureWarning).toBeNull();
    expect(result.snapshot?.captures).toEqual([expect.objectContaining({
      id: 'capture-existing-1',
      scrollY: 80,
    })]);
    expect(mocks.requestSignalsMock).not.toHaveBeenCalled();
    expect(mocks.requestCapturesMock).not.toHaveBeenCalled();
  });

  it('返回给调用方的 snapshot 是防御性拷贝，不会污染已存真源', async () => {
    const storedSnapshot = buildStoredSnapshot();
    jsonStorageMock.setStoredValue('olyq.browser-context.page-style-snapshots.v1', {
      'topic-1': storedSnapshot,
    });

    const { getPageStyleContextSnapshot } = await import('./page-style-context');
    const first = await getPageStyleContextSnapshot('topic-1');
    first?.signals.page.borderColors.push('rgb(1, 2, 3)');
    first?.signals.samples.headings.push('Mutated heading');
    first?.captures.push({
      id: 'capture-mutated',
      name: 'mutated.png',
      mime: 'image/png',
      size: 1,
      scrollY: 1,
    });

    const second = await getPageStyleContextSnapshot('topic-1');

    expect(second?.signals.page.borderColors).toEqual(['rgb(220, 220, 220)']);
    expect(second?.signals.samples.headings).toEqual(['Hero headline']);
    expect(second?.captures).toEqual([expect.objectContaining({
      id: 'capture-old-1',
    })]);
  });
});
