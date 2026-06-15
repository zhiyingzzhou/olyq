/**
 * 说明：`page-style-input.spec` 聊天区模块测试。
 *
 * 职责：
 * - 验证页面风格视觉输入只会在风格模式 + vision 模型下触发；
 * - 覆盖后台截图响应到临时 API 图片附件的转换；
 * - 确保截图失败时返回 warning，而不是把异常直接抛给主聊天流程。
 *
 * 边界：
 * - 这里只验证 UI 侧的风格视觉输入决策，不覆盖真实 SW/content-script 截图编排；
 * - browser-context 会话模式与 runtime.sendMessage 都通过轻量 mock 驱动。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nError } from '@/lib/i18n/error';
import { resolvePageStyleVisionInputs, supportsPageStyleVisionInput } from './page-style-input';

const {
  getBrowserContextMetadataMock,
  loadStoredPageStyleCaptureFramesMock,
  resolveAssistantTopicMock,
  resolveBrowserContextEffectiveStateMock,
  resolvePageStyleContextSnapshotMock,
} = vi.hoisted(() => ({
  getBrowserContextMetadataMock: vi.fn(),
  loadStoredPageStyleCaptureFramesMock: vi.fn(),
  resolveAssistantTopicMock: vi.fn(),
  resolveBrowserContextEffectiveStateMock: vi.fn(),
  resolvePageStyleContextSnapshotMock: vi.fn(),
}));

vi.mock('@/hooks/useAssistantStore', () => ({
  useAssistantStore: {
    getState: () => ({
      assistants: [],
    }),
  },
}));

vi.mock('@/lib/browser-context', () => ({
  getBrowserContextMetadata: getBrowserContextMetadataMock,
  resolveBrowserContextEffectiveState: resolveBrowserContextEffectiveStateMock,
}));

vi.mock('@/lib/browser-context/page-style-context', () => ({
  loadStoredPageStyleCaptureFrames: loadStoredPageStyleCaptureFramesMock,
  resolvePageStyleContextSnapshot: resolvePageStyleContextSnapshotMock,
}));

vi.mock('@/lib/chat/topic-tree', () => ({
  resolveAssistantTopic: resolveAssistantTopicMock,
}));

describe('page-style-input', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveAssistantTopicMock.mockReturnValue({
      assistant: { id: 'assistant-1', tags: [] },
      topic: { id: 'topic-1' },
    });
    resolveBrowserContextEffectiveStateMock.mockReturnValue({
      conversationKey: 'topic-1',
      hasConversation: true,
      settings: {
        enabled: true,
        fullPagePromptChars: 24_000,
      },
      conversationMode: {
        enabled: true,
        fullPageEnabled: false,
        styleSignalsEnabled: true,
      },
      conversationEnabled: true,
      masterEnabled: true,
      resolvedPolicy: {
        source: 'default',
        profile: {
          id: 'minimal-page',
          title: 'Minimal Page',
          description: '内容优先',
          sources: ['tab-meta', 'readable-dom'],
          outputFormat: 'markdown',
          maxPromptChars: 6000,
          cacheTtlMs: 60_000,
        },
      },
      disabledByAssistant: false,
      effective: true,
      profile: {
        id: 'minimal-page',
        title: 'Minimal Page',
        description: '内容优先',
        sources: ['tab-meta', 'readable-dom', 'page-style-signals'],
        outputFormat: 'markdown',
        maxPromptChars: 6000,
        cacheTtlMs: 60_000,
      },
    });
    getBrowserContextMetadataMock.mockReturnValue({
      title: 'Example',
      url: 'https://example.com',
      favicon: 'https://example.com/favicon.ico',
      tabId: 9,
      extractedAt: 1,
    });
    resolvePageStyleContextSnapshotMock.mockResolvedValue({
      snapshot: {
        topicId: 'topic-1',
        title: 'Example',
        url: 'https://example.com',
        pageFingerprint: 'fingerprint-1',
        signals: {
          title: 'Example',
          url: 'https://example.com',
          pageFingerprint: 'fingerprint-1',
          extractedAt: 1,
          page: {
            backgroundColor: 'rgb(255, 255, 255)',
            textColor: 'rgb(17, 17, 17)',
            linkColor: 'rgb(0, 102, 204)',
            primaryButtonColor: 'rgb(20, 120, 230)',
            borderColors: [],
            shadowSamples: [],
            radiusSamples: [],
            maxContentWidth: null,
            centeredLayout: false,
            airyWhitespace: false,
          },
          typography: {
            bodyFontFamilies: ['system-ui'],
            headingFontFamilies: ['system-ui'],
            buttonFontFamilies: ['system-ui'],
            bodyFontSize: '15px',
            bodyLineHeight: '22px',
            headingFontSizes: [],
            buttonFontSizes: [],
            fontWeights: ['400'],
          },
          layout: {
            hasHero: false,
            navStyle: '',
            sectionCount: 1,
            sectionGapSamples: [],
            cardGridHint: 'single-column',
            imageDensity: 'low',
          },
          components: {
            buttonStyles: [],
            cardStyles: [],
            inputStyles: [],
            tagStyles: [],
            navStyles: [],
          },
          decoration: {
            hasLargeImages: false,
            usesGradients: false,
            usesIllustrations: false,
            usesBorders: false,
            usesGlass: false,
            usesShadows: false,
            hasStickyHeader: false,
          },
          samples: {
            headings: [],
            sectionSelectors: ['main'],
            cardSelectors: [],
          },
        },
        captures: [],
        capturedAt: 1,
        updatedAt: 1,
      },
      snapshotSource: 'stored',
      liveError: null,
      captureWarning: null,
    });
    loadStoredPageStyleCaptureFramesMock.mockResolvedValue([{
      name: 'page-style-01.png',
      mime: 'image/png',
      dataUrl: 'data:image/png;base64,abc',
      scrollY: 0,
    }]);
  });

  it('只把真正支持视觉输入的模型识别为风格截图目标', () => {
    expect(supportsPageStyleVisionInput({
      kind: 'multimodal-chat',
      inputModalities: ['text'],
      features: [],
    })).toBe(true);
    expect(supportsPageStyleVisionInput({
      kind: 'chat',
      inputModalities: ['text', 'image'],
      features: [],
    })).toBe(true);
    expect(supportsPageStyleVisionInput({
      kind: 'chat',
      inputModalities: ['text'],
      features: ['vision-input'],
    })).toBe(true);
    expect(supportsPageStyleVisionInput({
      kind: 'chat',
      inputModalities: ['text'],
      features: [],
    })).toBe(false);
  });

  it('风格模式开启且存在视觉模型时，会把后台截图转换为临时图片附件', async () => {
    const result = await resolvePageStyleVisionInputs({
      conversationKey: 'topic-1',
      modelIds: ['provider/vision', 'provider/text'],
      modelMap: new Map([
        ['provider/vision', { kind: 'multimodal-chat', inputModalities: ['text', 'image'], features: ['vision-input'] }],
        ['provider/text', { kind: 'chat', inputModalities: ['text'], features: [] }],
      ]),
      signal: new AbortController().signal,
    });

    expect(resolvePageStyleContextSnapshotMock).toHaveBeenCalledWith({
      conversationKey: 'topic-1',
      metadata: getBrowserContextMetadataMock.mock.results[0]?.value,
      requireCaptures: true,
      maxCaptures: 5,
    });
    expect(result.effectiveState.conversationMode).toEqual({
      enabled: true,
      fullPageEnabled: false,
      styleSignalsEnabled: true,
    });
    expect(result.warning).toBeNull();
    expect(result.attachmentsByModelId.get('provider/vision')).toEqual([{
      type: 'image',
      url: 'data:image/png;base64,abc',
      name: 'page-style-01.png',
      mime: 'image/png',
    }]);
    expect(result.attachmentsByModelId.has('provider/text')).toBe(false);
  });

  it('风格模式关闭或没有视觉模型时，不会触发后台截图', async () => {
    resolveBrowserContextEffectiveStateMock.mockReturnValue({
      conversationKey: 'topic-1',
      hasConversation: true,
      settings: {
        enabled: true,
        fullPagePromptChars: 24_000,
      },
      conversationMode: {
        enabled: false,
        fullPageEnabled: false,
        styleSignalsEnabled: false,
      },
      conversationEnabled: false,
      masterEnabled: true,
      resolvedPolicy: {
        source: 'default',
        profile: {
          id: 'minimal-page',
          title: 'Minimal Page',
          description: '内容优先',
          sources: ['tab-meta', 'readable-dom'],
          outputFormat: 'markdown',
          maxPromptChars: 6000,
          cacheTtlMs: 60_000,
        },
      },
      disabledByAssistant: false,
      effective: false,
      profile: {
        id: 'minimal-page',
        title: 'Minimal Page',
        description: '内容优先',
        sources: ['tab-meta', 'readable-dom'],
        outputFormat: 'markdown',
        maxPromptChars: 6000,
        cacheTtlMs: 60_000,
      },
    });

    const result = await resolvePageStyleVisionInputs({
      conversationKey: 'topic-1',
      modelIds: ['provider/text'],
      modelMap: new Map([
        ['provider/text', { kind: 'chat', inputModalities: ['text'], features: [] }],
      ]),
      signal: new AbortController().signal,
    });

    expect(resolvePageStyleContextSnapshotMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      attachmentsByModelId: new Map(),
      effectiveState: {
        conversationKey: 'topic-1',
        hasConversation: true,
        settings: {
          enabled: true,
          fullPagePromptChars: 24_000,
        },
        conversationMode: {
          enabled: false,
          fullPageEnabled: false,
          styleSignalsEnabled: false,
        },
        conversationEnabled: false,
        masterEnabled: true,
        resolvedPolicy: {
          source: 'default',
          profile: {
            id: 'minimal-page',
            title: 'Minimal Page',
            description: '内容优先',
            sources: ['tab-meta', 'readable-dom'],
            outputFormat: 'markdown',
            maxPromptChars: 6000,
            cacheTtlMs: 60_000,
          },
        },
        disabledByAssistant: false,
        effective: false,
        profile: {
          id: 'minimal-page',
          title: 'Minimal Page',
          description: '内容优先',
          sources: ['tab-meta', 'readable-dom'],
          outputFormat: 'markdown',
          maxPromptChars: 6000,
          cacheTtlMs: 60_000,
        },
      },
      warning: null,
    });
  });

  it('总开关关闭或 assistant 禁用时，会在截图阶段前直接短路', async () => {
    resolveBrowserContextEffectiveStateMock.mockReturnValue({
      conversationKey: 'topic-1',
      hasConversation: true,
      settings: {
        enabled: false,
        fullPagePromptChars: 24_000,
      },
      conversationMode: {
        enabled: true,
        fullPageEnabled: false,
        styleSignalsEnabled: true,
      },
      conversationEnabled: true,
      masterEnabled: false,
      resolvedPolicy: {
        source: 'assistant-disabled',
        profile: {
          id: 'minimal-page',
          title: 'Minimal Page',
          description: '内容优先',
          sources: ['tab-meta', 'readable-dom'],
          outputFormat: 'markdown',
          maxPromptChars: 6000,
          cacheTtlMs: 60_000,
        },
      },
      disabledByAssistant: true,
      effective: false,
      profile: {
        id: 'minimal-page',
        title: 'Minimal Page',
        description: '内容优先',
        sources: ['tab-meta', 'readable-dom', 'page-style-signals'],
        outputFormat: 'markdown',
        maxPromptChars: 6000,
        cacheTtlMs: 60_000,
      },
    });

    const result = await resolvePageStyleVisionInputs({
      conversationKey: 'topic-1',
      modelIds: ['provider/vision'],
      modelMap: new Map([
        ['provider/vision', { kind: 'multimodal-chat', inputModalities: ['text', 'image'], features: ['vision-input'] }],
      ]),
      signal: new AbortController().signal,
    });

    expect(resolvePageStyleContextSnapshotMock).not.toHaveBeenCalled();
    expect(result.effectiveState.masterEnabled).toBe(false);
    expect(result.effectiveState.disabledByAssistant).toBe(true);
    expect(result.attachmentsByModelId.size).toBe(0);
  });

  it('后台截图失败时返回 warning，供主聊天流程降级提示', async () => {
    resolvePageStyleContextSnapshotMock.mockRejectedValue(new I18nError('errors.pageStyleScreenshotsUnavailable'));

    const result = await resolvePageStyleVisionInputs({
      conversationKey: 'topic-1',
      modelIds: ['provider/vision'],
      modelMap: new Map([
        ['provider/vision', { kind: 'multimodal-chat', inputModalities: ['text', 'image'], features: ['vision-input'] }],
      ]),
      signal: new AbortController().signal,
    });

    expect(result.attachmentsByModelId.size).toBe(0);
    expect(result.effectiveState.conversationMode).toEqual({
      enabled: true,
      fullPageEnabled: false,
      styleSignalsEnabled: true,
    });
    expect(result.warning).toEqual({ key: 'errors.pageStyleScreenshotsUnavailable' });
  });
});
