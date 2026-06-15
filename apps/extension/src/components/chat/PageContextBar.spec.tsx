/**
 * 说明：`PageContextBar.spec` 组件模块。
 *
 * 职责：
 * - 覆盖自动页面上下文状态条的关键展示行为；
 * - 验证“待采集”提示与最近一次采集预览的可视语义；
 * - 避免后续把状态条又退回成只显示 metadata 的弱表达。
 *
 * 边界：
 * - 本文件只验证组件装配和文案，不覆盖真实 SW/content script 通信；
 * - browser-context 门面、聊天运行时和助手 store 均以轻量 mock 驱动。
 */
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageContextBar } from './PageContextBar';
import type { BrowserContextViewState } from '@/lib/browser-context';

/**
 * 创建一份空的 source manifest fixture。
 *
 * @returns 默认缺失态的 source manifest。
 */
function createSourceManifestFixture(): BrowserContextViewState['sourceManifest'] {
  return {
    'tab-meta': {
      sourceId: 'tab-meta',
      identity: null,
      freshness: 'missing',
      collectedAt: null,
      issueCode: null,
      payloadRef: null,
    },
    'technology-stack': {
      sourceId: 'technology-stack',
      identity: null,
      freshness: 'missing',
      collectedAt: null,
      issueCode: null,
      payloadRef: null,
    },
    'readable-dom': {
      sourceId: 'readable-dom',
      identity: null,
      freshness: 'missing',
      collectedAt: null,
      issueCode: null,
      payloadRef: null,
    },
    'page-style-signals': {
      sourceId: 'page-style-signals',
      identity: null,
      freshness: 'missing',
      collectedAt: null,
      issueCode: null,
      payloadRef: null,
    },
    'selection-snapshot': {
      sourceId: 'selection-snapshot',
      identity: null,
      freshness: 'missing',
      collectedAt: null,
      issueCode: null,
      payloadRef: null,
    },
    'element-snapshot': {
      sourceId: 'element-snapshot',
      identity: null,
      freshness: 'missing',
      collectedAt: null,
      issueCode: null,
      payloadRef: null,
    },
  };
}

const {
  browserContextState,
  chatStoreState,
  scheduleBrowserContextWorkMock,
  requestBrowserContextMetadataMock,
  resolvedPolicyState,
  setBrowserContextActiveConversationKeyMock,
  updateTopicMetaMock,
} = vi.hoisted(() => ({
  browserContextState: {
    enabled: true as boolean,
    masterEnabled: true as boolean,
    metadata: {
      title: '深度页面标题',
      url: 'https://example.com/article',
      favicon: 'https://example.com/favicon.ico',
      tabId: 9,
      extractedAt: 100,
    },
    status: 'ready' as BrowserContextViewState['status'],
    profile: {
      id: 'minimal-page',
      title: 'Minimal Page',
      description: '内容优先',
      sources: ['tab-meta', 'readable-dom'],
      outputFormat: 'markdown',
      maxPromptChars: 6000,
      cacheTtlMs: 60_000,
    },
    loaded: true,
    collecting: false as boolean,
    conversationMode: {
      enabled: true as boolean,
      fullPageEnabled: false as boolean,
      styleSignalsEnabled: false as boolean,
    },
    sourceManifest: createSourceManifestFixture(),
    lastCollection: null as BrowserContextViewState['lastCollection'],
  } satisfies BrowserContextViewState,
  chatStoreState: {
    activeConversationKey: 'topic-1',
    runtime: { activeAssistantId: 'assistant-1', activeTopicId: 'topic-1' },
  },
  scheduleBrowserContextWorkMock: vi.fn(),
  requestBrowserContextMetadataMock: vi.fn(),
  resolvedPolicyState: {
    source: 'default' as 'default' | 'assistant-disabled',
  },
  setBrowserContextActiveConversationKeyMock: vi.fn(),
  updateTopicMetaMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: forwardRef<HTMLSpanElement, HTMLAttributes<HTMLSpanElement> & { asChild?: boolean; children: ReactNode }>(
    ({ asChild: _asChild, children, ...props }, ref) => (
      <span ref={ref} {...props}>{children}</span>
    ),
  ),
  PopoverContent: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) => {
    void props.sideOffset;
    void props.collisionPadding;
    void props.onOpenAutoFocus;
    return (
      <div data-testid="page-context-preview-popover">{children}</div>
    );
  },
}));

vi.mock('./TechnologyStackPopover', () => ({
  TechnologyStackPopover: () => null,
}));

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: forwardRef<HTMLSpanElement, HTMLAttributes<HTMLSpanElement> & { asChild?: boolean; children: ReactNode }>(
    ({ asChild: _asChild, children, ...props }, ref) => (
      <span ref={ref} {...props}>{children}</span>
    ),
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuCheckboxItem: ({
    checked,
    children,
    disabled,
    onCheckedChange,
    ...props
  }: {
    checked?: boolean;
    children: ReactNode;
    disabled?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    [key: string]: unknown;
  }) => (
    <button
      type="button"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      {...props}
    >
      {children}
    </button>
  ),
  DropdownMenuItem: ({
    children,
    disabled,
    onSelect,
    ...props
  }: {
    children: ReactNode;
    disabled?: boolean;
    onSelect?: () => void;
    [key: string]: unknown;
  }) => (
    <button type="button" disabled={disabled} onClick={onSelect} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/hooks/useChatStore', () => ({
  useChatStore: (selector: (state: {
    activeConversationKey: string;
    runtime: { activeAssistantId: string; activeTopicId: string };
  }) => unknown) => selector(chatStoreState),
}));

vi.mock('@/hooks/useAssistantStore', () => ({
  useAssistantStore: (selector: (state: {
    assistants: Array<{
      id: string;
      name: string;
      scenario: 'browser' | 'general';
      model?: string;
      topics: Array<{ id: string }>;
    }>;
    updateTopicMeta: typeof updateTopicMetaMock;
  }) => unknown) => selector({
    assistants: [{
      id: 'assistant-1',
      name: 'Browser Assistant',
      scenario: 'browser',
      topics: [{ id: 'topic-1' }],
    }],
    updateTopicMeta: updateTopicMetaMock,
  }),
}));

vi.mock('@/lib/browser-context', () => ({
  getBrowserContextSettings: () => ({ enabled: browserContextState.masterEnabled, fullPagePromptChars: 18_000 }),
  getBrowserContextViewState: () => ({ ...browserContextState }),
  onBrowserContextChange: () => () => undefined,
  scheduleBrowserContextWork: scheduleBrowserContextWorkMock,
  requestBrowserContextMetadata: requestBrowserContextMetadataMock,
  resolveBrowserContextEffectiveState: () => {
    const conversationKey = chatStoreState.activeConversationKey || chatStoreState.runtime.activeTopicId || null;
    const disabledByAssistant = resolvedPolicyState.source === 'assistant-disabled';
    const profile = browserContextState.profile!;
    return {
      conversationKey,
      hasConversation: Boolean(conversationKey),
      settings: {
        enabled: browserContextState.masterEnabled,
        fullPagePromptChars: 18_000,
      },
      conversationMode: { ...browserContextState.conversationMode },
      conversationEnabled: browserContextState.conversationMode.enabled,
      masterEnabled: browserContextState.masterEnabled,
      resolvedPolicy: {
        profile,
        source: resolvedPolicyState.source,
      },
      disabledByAssistant,
      effective: browserContextState.masterEnabled && browserContextState.conversationMode.enabled && !disabledByAssistant,
      profile,
    };
  },
  setBrowserContextActiveConversationKey: setBrowserContextActiveConversationKeyMock,
  setBrowserContextProfile: vi.fn(),
  subscribeBrowserContextPolicyChange: () => () => undefined,
  subscribeBrowserContextSettingsChange: () => () => undefined,
}));

describe('PageContextBar', () => {
  beforeEach(() => {
    browserContextState.enabled = true;
    browserContextState.masterEnabled = true;
    browserContextState.collecting = false;
    browserContextState.status = 'ready';
    browserContextState.conversationMode.enabled = true;
    browserContextState.conversationMode.fullPageEnabled = false;
    browserContextState.conversationMode.styleSignalsEnabled = false;
    browserContextState.lastCollection = null;
    chatStoreState.activeConversationKey = 'topic-1';
    chatStoreState.runtime.activeAssistantId = 'assistant-1';
    chatStoreState.runtime.activeTopicId = 'topic-1';
    scheduleBrowserContextWorkMock.mockReset();
    requestBrowserContextMetadataMock.mockReset();
    resolvedPolicyState.source = 'default';
    setBrowserContextActiveConversationKeyMock.mockReset();
    updateTopicMetaMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('未采集正文时明确提示将在发送或刷新时按需采集', () => {
    render(<PageContextBar />);

    expect(screen.getByText('深度页面标题')).toBeInTheDocument();
    expect(screen.getByText('pageContext.pendingCollection')).toBeInTheDocument();
    expect(screen.queryByTestId('page-context-preview-popover')).not.toBeInTheDocument();
  });

  it('存在最近一次采集结果时展示结构提纲和正文预览', () => {
    browserContextState.lastCollection = {
      status: 'success',
      captureMode: 'article',
      sources: ['tab-meta', 'readable-dom'],
      issues: [],
      bodyAvailable: true,
      snippet: '这里是正文预览摘要。',
      headings: [
        { level: 1 as const, text: '一级标题' },
        { level: 2 as const, text: '二级标题' },
      ],
      bodyChars: 3200,
      promptChars: 2400,
      collectedAt: 200,
      promptTruncated: true,
    };
    browserContextState.conversationMode.fullPageEnabled = true;

    render(<PageContextBar />);

    expect(screen.getByTestId('page-context-preview-popover')).toBeInTheDocument();
    expect(screen.getByText('一级标题')).toBeInTheDocument();
    expect(screen.getByText('二级标题')).toBeInTheDocument();
    expect(screen.getByText('这里是正文预览摘要。')).toBeInTheDocument();
    expect(screen.getAllByText('pageContext.captureMode.article').length).toBeGreaterThan(0);
    expect(screen.getAllByText('pageContext.mode.fullPage').length).toBeGreaterThan(0);
    expect(screen.getByText('pageContext.truncated')).toBeInTheDocument();
  });

  it('风格模式发送后会展示隐藏截图是否附加到视觉输入', () => {
    browserContextState.conversationMode.styleSignalsEnabled = true;
    browserContextState.lastCollection = {
      status: 'success',
      captureMode: 'article',
      sources: ['tab-meta', 'readable-dom', 'page-style-signals'],
      issues: [],
      bodyAvailable: true,
      snippet: '这里是正文预览摘要。',
      headings: [],
      bodyChars: 3200,
      promptChars: 2400,
      collectedAt: 200,
      promptTruncated: false,
      styleCapture: {
        requested: true,
        frameCount: 2,
        target: 'vision-input',
        warningCode: null,
      },
    };

    render(<PageContextBar />);

    expect(screen.getByText('pageContext.styleCapture.title')).toBeInTheDocument();
    expect(screen.getAllByText('pageContext.styleCapture.attached').length).toBeGreaterThan(0);
    expect(screen.getByText('pageContext.styleCapture.hiddenInput')).toBeInTheDocument();
  });

  it('风格模式命中纯文本模型时会说明本轮只使用设计信号', () => {
    browserContextState.conversationMode.styleSignalsEnabled = true;
    browserContextState.lastCollection = {
      status: 'success',
      captureMode: 'article',
      sources: ['tab-meta', 'readable-dom', 'page-style-signals'],
      issues: [],
      bodyAvailable: true,
      snippet: '这里是正文预览摘要。',
      headings: [],
      bodyChars: 3200,
      promptChars: 2400,
      collectedAt: 200,
      promptTruncated: false,
      styleCapture: {
        requested: false,
        frameCount: 0,
        target: 'style-signals-only',
        warningCode: null,
      },
    };

    render(<PageContextBar />);

    expect(screen.getAllByText('pageContext.styleCapture.signalsOnly').length).toBeGreaterThan(0);
    expect(screen.getByText('pageContext.styleCapture.modelNotVision')).toBeInTheDocument();
  });

  it('正文采集失败时展示明确失败原因，而不是伪装成有正文', () => {
    browserContextState.lastCollection = {
      status: 'partial',
      captureMode: 'metadata-only',
      sources: ['tab-meta'],
      issues: [
        {
          sourceId: 'readable-dom',
          code: 'content-script-unreachable',
          message: 'content-script-unreachable',
        },
      ],
      bodyAvailable: false,
      snippet: '',
      headings: [],
      bodyChars: 0,
      promptChars: 0,
      collectedAt: 300,
      promptTruncated: false,
    };

    render(<PageContextBar />);

    expect(screen.getAllByText('pageContext.issue.contentScriptUnreachable').length).toBeGreaterThan(0);
    expect(screen.getAllByText('pageContext.status.partial').length).toBeGreaterThan(0);
    expect(screen.getByText('pageContext.source.tabMeta')).toBeInTheDocument();
    expect(screen.queryByText('pageContext.noSnippet')).not.toBeInTheDocument();
  });

  it('正文可用时隐藏技术栈超时这类内部来源问题', () => {
    browserContextState.lastCollection = {
      status: 'partial',
      captureMode: 'visible-page',
      sources: ['tab-meta', 'readable-dom', 'technology-stack'],
      issues: [
        {
          sourceId: 'technology-stack',
          code: 'timeout',
          message: 'timeout',
        },
      ],
      bodyAvailable: true,
      snippet: '页面正文可用，本轮只有技术栈没更新。',
      headings: [{ level: 1, text: '页面正文' }],
      bodyChars: 1220,
      promptChars: 2266,
      collectedAt: 325,
      promptTruncated: false,
    };

    render(<PageContextBar />);

    expect(screen.getAllByText('pageContext.status.success').length).toBeGreaterThan(0);
    expect(screen.queryByText('pageContext.status.partial')).not.toBeInTheDocument();
    expect(screen.queryByText('pageContext.issues')).not.toBeInTheDocument();
    expect(screen.queryByText('pageContext.issue.timeoutWithInjectedBody')).not.toBeInTheDocument();
    expect(screen.queryByText('pageContext.issue.timeout')).not.toBeInTheDocument();
    expect(screen.queryByText('发送前部分实时采集超出预算')).not.toBeInTheDocument();
    expect(screen.queryByText('已命中来源')).not.toBeInTheDocument();
    expect(screen.queryByText('部分来源降级')).not.toBeInTheDocument();
    expect(screen.getByText('页面正文可用，本轮只有技术栈没更新。')).toBeInTheDocument();
  });

  it('正文不可用且 readable-dom 超时时展示可操作的正文不可用提示', () => {
    browserContextState.lastCollection = {
      status: 'partial',
      captureMode: 'metadata-only',
      sources: ['tab-meta'],
      issues: [
        {
          sourceId: 'readable-dom',
          code: 'timeout',
          message: 'timeout',
        },
      ],
      bodyAvailable: false,
      snippet: '',
      headings: [],
      bodyChars: 0,
      promptChars: 0,
      collectedAt: 326,
      promptTruncated: false,
    };

    render(<PageContextBar />);

    expect(screen.getAllByText('pageContext.status.partial').length).toBeGreaterThan(0);
    expect(screen.queryByText('pageContext.status.success')).not.toBeInTheDocument();
    expect(screen.getByText('pageContext.issues')).toBeInTheDocument();
    expect(screen.getAllByText('pageContext.issue.timeout').length).toBeGreaterThan(0);
    expect(screen.queryByText('pageContext.issue.timeoutWithInjectedBody')).not.toBeInTheDocument();
  });

  it('正文可用时隐藏风格信号超时这类内部来源问题', () => {
    browserContextState.conversationMode.styleSignalsEnabled = true;
    browserContextState.lastCollection = {
      status: 'partial',
      captureMode: 'visible-page',
      sources: ['tab-meta', 'readable-dom'],
      issues: [
        {
          sourceId: 'page-style-signals',
          code: 'timeout',
          message: 'timeout',
        },
      ],
      bodyAvailable: true,
      snippet: '页面正文可用，本轮只有风格信号没更新。',
      headings: [{ level: 1, text: '页面正文' }],
      bodyChars: 2200,
      promptChars: 3960,
      collectedAt: 327,
      promptTruncated: false,
    };

    render(<PageContextBar />);

    expect(screen.getAllByText('pageContext.status.success').length).toBeGreaterThan(0);
    expect(screen.queryByText('pageContext.issues')).not.toBeInTheDocument();
    expect(screen.queryByText('pageContext.issue.timeoutWithInjectedBody')).not.toBeInTheDocument();
    expect(screen.queryByText('pageContext.issue.timeout')).not.toBeInTheDocument();
  });

  it('多个 source 命中同一采集问题时只展示一条可读失败文案', () => {
    browserContextState.lastCollection = {
      status: 'failed',
      captureMode: 'metadata-only',
      sources: [],
      issues: [
        {
          sourceId: 'readable-dom',
          code: 'page-uncollectable',
          message: 'page-uncollectable',
        },
        {
          sourceId: 'page-style-signals',
          code: 'page-uncollectable',
          message: 'page-uncollectable',
        },
        {
          sourceId: 'tab-meta',
          code: 'metadata-unavailable',
          message: 'metadata-unavailable',
        },
      ],
      bodyAvailable: false,
      snippet: '',
      headings: [],
      bodyChars: 0,
      promptChars: 0,
      collectedAt: 350,
      promptTruncated: false,
    };

    render(<PageContextBar />);

    const issuesSection = screen.getByText('pageContext.issues').closest('section');
    expect(issuesSection).not.toBeNull();
    const issueList = within(issuesSection as HTMLElement);
    expect(issueList.getAllByText('pageContext.issue.pageUncollectable')).toHaveLength(1);
    expect(issueList.getAllByText('pageContext.issue.metadataUnavailable')).toHaveLength(1);
  });

  it('内容脚本不可达时只展示降级原因，不再提供运行时网页授权入口', () => {
    browserContextState.lastCollection = {
      status: 'partial',
      captureMode: 'metadata-only',
      sources: ['tab-meta'],
      issues: [
        {
          sourceId: 'readable-dom',
          code: 'content-script-unreachable',
          message: 'content-script-unreachable',
        },
      ],
      bodyAvailable: false,
      snippet: '',
      headings: [],
      bodyChars: 0,
      promptChars: 0,
      collectedAt: 400,
      promptTruncated: false,
    };

    render(<PageContextBar />);

    expect(screen.getAllByText('pageContext.issue.contentScriptUnreachable').length).toBeGreaterThan(0);
  });

  it('内容脚本降级但尚无预览时，点击顶部刷新会直接重建上下文', async () => {
    browserContextState.status = 'degraded';
    browserContextState.lastCollection = null;

    render(<PageContextBar />);
    requestBrowserContextMetadataMock.mockClear();
    scheduleBrowserContextWorkMock.mockClear();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'pageContext.refresh' }));
    });

    expect(requestBrowserContextMetadataMock).toHaveBeenCalledTimes(1);
    expect(scheduleBrowserContextWorkMock).toHaveBeenCalledWith({
      reason: 'manual-refresh',
      conversationKey: 'topic-1',
    });
  });

  it('页面不可采集时刷新按钮仍受统一有效态约束，不会弹出授权流程', async () => {
    browserContextState.status = 'unavailable';
    browserContextState.conversationMode.enabled = false;
    browserContextState.lastCollection = null;

    render(<PageContextBar />);
    requestBrowserContextMetadataMock.mockClear();
    scheduleBrowserContextWorkMock.mockClear();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'pageContext.refresh' }));
    });

    expect(requestBrowserContextMetadataMock).not.toHaveBeenCalled();
    expect(scheduleBrowserContextWorkMock).not.toHaveBeenCalled();
  });

  it('切换全文网页模式时写入当前会话的 topic 持久化模式', async () => {
    render(<PageContextBar />);

    expect(screen.getByTestId('page-context-full-mode-toggle')).toHaveAttribute('aria-pressed', 'false');

    await act(async () => {
      fireEvent.click(screen.getByTestId('page-context-full-mode-toggle'));
    });

    expect(updateTopicMetaMock).toHaveBeenCalledWith('topic-1', {
      browserContextMode: {
        enabled: true,
        fullPageEnabled: true,
        styleSignalsEnabled: false,
      },
    });
  });

  it('切换风格模式时写入当前会话的 topic 持久化模式，而不是直接发消息', async () => {
    render(<PageContextBar />);

    expect(screen.getByTestId('page-context-style-mode-toggle')).toHaveAttribute('aria-pressed', 'false');

    await act(async () => {
      fireEvent.click(screen.getByTestId('page-context-style-mode-toggle'));
    });

    expect(updateTopicMetaMock).toHaveBeenCalledWith('topic-1', {
      browserContextMode: {
        enabled: true,
        fullPageEnabled: false,
        styleSignalsEnabled: true,
      },
    });
  });

  it('模式按钮选中时带有符合扩展风格的清晰选中态样式', () => {
    browserContextState.conversationMode.fullPageEnabled = true;
    browserContextState.conversationMode.styleSignalsEnabled = true;

    render(<PageContextBar />);

    const fullModeToggle = screen.getByTestId('page-context-full-mode-toggle');
    const styleModeToggle = screen.getByTestId('page-context-style-mode-toggle');
    const modeGroup = screen.getByTestId('page-context-mode-group');
    const fullModeClasses = fullModeToggle.className.split(/\s+/);
    const styleModeClasses = styleModeToggle.className.split(/\s+/);

    expect(fullModeToggle).toHaveAttribute('aria-pressed', 'true');
    expect(styleModeToggle).toHaveAttribute('aria-pressed', 'true');
    expect(modeGroup.className.split(/\s+/)).toEqual(expect.arrayContaining([
      'flex',
      'items-center',
      'gap-1',
    ]));
    expect(fullModeClasses).toEqual(expect.arrayContaining([
      'relative',
      'h-6',
      '!bg-transparent',
      '!text-foreground',
      'font-semibold',
      'after:h-[2px]',
      'after:bg-primary/70',
      '[&_svg]:text-primary',
    ]));
    expect(styleModeClasses).toEqual(expect.arrayContaining([
      'relative',
      'h-6',
      '!bg-transparent',
      '!text-foreground',
      'font-semibold',
      'after:h-[2px]',
      'after:bg-primary/70',
      '[&_svg]:text-primary',
    ]));
    for (const forbiddenGroupClassName of [
      'border',
      'border-border/50',
      'bg-muted/50',
      'p-0.5',
      'shadow-[inset_0_1px_0_hsl(var(--background)/0.45)]',
    ]) {
      expect(modeGroup.className.split(/\s+/)).not.toContain(forbiddenGroupClassName);
    }
    for (const forbiddenClassName of [
      '!bg-background',
      '!bg-card',
      '!bg-primary',
      '!text-primary-foreground',
      'ring-border/60',
      'shadow-sm',
      'shadow-[0_1px_2px_hsl(var(--foreground)/0.10)]',
    ]) {
      expect(fullModeClasses).not.toContain(forbiddenClassName);
      expect(styleModeClasses).not.toContain(forbiddenClassName);
    }
  });

  it('全文和风格未选中时不额外插入普通模式入口', () => {
    render(<PageContextBar />);

    expect(screen.queryByTestId('page-context-normal-mode-toggle')).not.toBeInTheDocument();
    expect(screen.getByTestId('page-context-full-mode-toggle')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('page-context-style-mode-toggle')).toHaveAttribute('aria-pressed', 'false');
  });

  it('顶部控件改成清晰分组，并让自动开关保留可见标签', async () => {
    render(<PageContextBar />);

    expect(screen.getByTestId('page-context-bar')).toHaveAttribute('data-page-context-bar', 'true');
    expect(screen.getByTestId('page-context-mode-group')).toHaveTextContent('pageContext.group.mode');
    expect(screen.getByTestId('page-context-action-group')).toHaveTextContent('pageContext.group.action');
    expect(screen.getByTestId('page-context-auto-group')).toHaveTextContent('pageContext.autoCollection');
    expect(screen.getByLabelText('pageContext.enable')).toBeInTheDocument();
    expect(screen.getByTestId('page-context-compact-controls-trigger').className.split(/\s+/)).toContain('page-context-compact-controls');
    expect(within(screen.getByTestId('page-context-mode-group')).getByText('pageContext.group.mode').className.split(/\s+/)).not.toContain('hidden');
    expect(within(screen.getByTestId('page-context-mode-group')).getByText('pageContext.group.mode').className.split(/\s+/)).not.toContain('sm:inline');
    expect(within(screen.getByTestId('page-context-action-group')).getByText('pageContext.group.action').className.split(/\s+/)).not.toContain('hidden');
    expect(within(screen.getByTestId('page-context-action-group')).getByText('pageContext.group.action').className.split(/\s+/)).not.toContain('sm:inline');

    await act(async () => {
      fireEvent.click(screen.getByTestId('page-context-enable-switch'));
    });

    expect(updateTopicMetaMock).toHaveBeenCalledWith('topic-1', {
      browserContextMode: {
        enabled: false,
        fullPageEnabled: false,
        styleSignalsEnabled: false,
      },
    });
  });

  it('提供紧凑更多菜单，并复用全文、风格和刷新同一套回调', async () => {
    render(<PageContextBar />);
    scheduleBrowserContextWorkMock.mockClear();
    requestBrowserContextMetadataMock.mockClear();

    expect(screen.getByTestId('page-context-compact-controls-trigger')).toHaveAttribute('aria-label', 'pageContext.moreControls');

    await act(async () => {
      fireEvent.click(screen.getByTestId('page-context-compact-full-mode-toggle'));
    });

    expect(updateTopicMetaMock).toHaveBeenLastCalledWith('topic-1', {
      browserContextMode: {
        enabled: true,
        fullPageEnabled: true,
        styleSignalsEnabled: false,
      },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('page-context-compact-style-mode-toggle'));
    });

    expect(updateTopicMetaMock).toHaveBeenLastCalledWith('topic-1', {
      browserContextMode: {
        enabled: true,
        fullPageEnabled: false,
        styleSignalsEnabled: true,
      },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('page-context-compact-refresh'));
    });

    expect(requestBrowserContextMetadataMock).toHaveBeenCalledTimes(1);
    expect(scheduleBrowserContextWorkMock).toHaveBeenCalledWith({
      reason: 'manual-refresh',
      conversationKey: 'topic-1',
    });
  });

  it('全文和风格模式在全局 master gate 关闭、助手禁用或无会话时进入禁用态', () => {
    let view = render(<PageContextBar />);

    expect(screen.getByTestId('page-context-full-mode-toggle')).not.toBeDisabled();
    expect(screen.getByTestId('page-context-style-mode-toggle')).not.toBeDisabled();

    browserContextState.masterEnabled = false;
    view.unmount();
    view = render(<PageContextBar />);
    expect(screen.getByTestId('page-context-full-mode-toggle')).toBeDisabled();
    expect(screen.getByTestId('page-context-style-mode-toggle')).toBeDisabled();

    browserContextState.enabled = true;
    resolvedPolicyState.source = 'assistant-disabled';
    view.unmount();
    view = render(<PageContextBar />);
    expect(screen.getByTestId('page-context-full-mode-toggle')).toBeDisabled();
    expect(screen.getByTestId('page-context-style-mode-toggle')).toBeDisabled();

    resolvedPolicyState.source = 'default';
    chatStoreState.activeConversationKey = '';
    chatStoreState.runtime.activeTopicId = '';
    view.unmount();
    render(<PageContextBar />);
    expect(screen.getByTestId('page-context-full-mode-toggle')).toBeDisabled();
    expect(screen.getByTestId('page-context-style-mode-toggle')).toBeDisabled();
  });

  it('自动上下文关闭时保留模式预配置，但刷新不会再触发采集', async () => {
    browserContextState.enabled = false;
    browserContextState.conversationMode.enabled = false;
    browserContextState.conversationMode.fullPageEnabled = true;
    browserContextState.conversationMode.styleSignalsEnabled = true;

    render(<PageContextBar />);

    expect(screen.getByTestId('page-context-full-mode-toggle')).not.toBeDisabled();
    expect(screen.getByTestId('page-context-style-mode-toggle')).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'pageContext.refresh' }));
    });

    expect(scheduleBrowserContextWorkMock).not.toHaveBeenCalled();
    expect(screen.getByText('pageContext.mode.fullPageShort · pageContext.mode.styleShort')).toBeInTheDocument();
  });

  it('手动刷新时会带上当前 conversationKey 重建浏览器上下文', async () => {
    render(<PageContextBar />);
    scheduleBrowserContextWorkMock.mockClear();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'pageContext.refresh' }));
    });

    expect(scheduleBrowserContextWorkMock).toHaveBeenCalledWith({
      reason: 'manual-refresh',
      conversationKey: 'topic-1',
    });
  });
});
