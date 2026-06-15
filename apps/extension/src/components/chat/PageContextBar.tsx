/**
 * 说明：`PageContextBar` 组件模块。
 *
 * 职责：
 * - 承载聊天区顶部的自动页面上下文状态条；
 * - 展示总开关、当前页面 metadata、有效 profile、采集摘要和手动刷新入口；
 * - 只消费独立的 browser-context 策略中心与运行时视图，不改写 assistant 主对象。
 *
 * 边界：
 * - 本组件不直接操作 content script 或 SW，只调用 browser-context 门面；
 * - selection / element 仍然属于 page tools 显式输入，不由本组件接管；
 * - 详细正文预览通过 Popover 呈现，避免状态条本体膨胀成第二个消息面板。
 */
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, FileText, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAssistantStore } from '@/hooks/useAssistantStore';
import { useChatStore } from '@/hooks/useChatStore';
import {
  getBrowserContextSettings,
  scheduleBrowserContextWork,
  getBrowserContextViewState,
  onBrowserContextChange,
  requestBrowserContextMetadata,
  resolveBrowserContextEffectiveState,
  setBrowserContextActiveConversationKey,
  setBrowserContextProfile,
  subscribeBrowserContextPolicyChange,
  subscribeBrowserContextSettingsChange,
  type BrowserContextCollectionIssue,
  type BrowserContextConversationMode,
  type BrowserContextSourceId,
} from '@/lib/browser-context';
import { getBrowserContextProfilePresentation } from '@/lib/browser-context/profile-presentation';
import { cn } from '@/lib/utils';
import { PageContextBarControls } from './PageContextBarControls';
import { PageContextBarStyleCaptureBadge, PageContextBarStyleCaptureSection } from './PageContextBarStyleCapture';
import { TechnologyStackPopover } from './TechnologyStackPopover';

/**
 * 浏览器上下文状态条。
 *
 * 说明：
 * - 这里保留历史组件名，避免无关调用方继续改 import；
 * - 实际语义已经彻底切换到新的 `browser-context` 子系统。
 */
export function PageContextBar() {
  const { t } = useTranslation();
  const [viewState, setViewState] = useState(getBrowserContextViewState);
  const [previewOpen, setPreviewOpen] = useState(false);
  const runtimeProfileSignatureRef = useRef('');
  const activeAssistantId = useChatStore((state) => state.runtime.activeAssistantId);
  const activeTopicId = useChatStore((state) => state.activeConversationKey ?? state.runtime.activeTopicId);
  const activeAssistant = useAssistantStore((state) => state.assistants.find((assistant) => assistant.id === activeAssistantId) ?? null);
  const activeTopic = useAssistantStore((state) => {
    for (const assistant of state.assistants) {
      const topic = assistant.topics.find((item) => item.id === activeTopicId);
      if (topic) return topic;
    }
    return null;
  });
  const updateTopicMeta = useAssistantStore((state) => state.updateTopicMeta);

  const effectiveState = resolveBrowserContextEffectiveState({
    assistant: activeAssistant,
    conversationKey: activeTopicId,
  });
  const resolvedPolicy = effectiveState.resolvedPolicy;
  const runtimeProfileSignature = JSON.stringify({
    disabledByAssistant: effectiveState.disabledByAssistant,
    profile: effectiveState.profile,
  });

  useEffect(() => onBrowserContextChange((next) => setViewState(next)), []);

  useEffect(() => {
    return subscribeBrowserContextSettingsChange(() => {
      const enabled = getBrowserContextSettings().enabled;
      if (enabled) requestBrowserContextMetadata();
      setViewState(getBrowserContextViewState());
    });
  }, []);

  useEffect(() => subscribeBrowserContextPolicyChange(() => setViewState(getBrowserContextViewState())), []);

  useEffect(() => {
    if (runtimeProfileSignatureRef.current === runtimeProfileSignature) return;
    runtimeProfileSignatureRef.current = runtimeProfileSignature;
    setBrowserContextProfile(effectiveState.disabledByAssistant ? null : effectiveState.profile);
  }, [effectiveState.disabledByAssistant, effectiveState.profile, runtimeProfileSignature]);

  useEffect(() => {
    setBrowserContextActiveConversationKey(activeTopicId);
    if (activeTopicId) requestBrowserContextMetadata();
  }, [activeTopicId]);

  useEffect(() => {
    if (!activeTopicId || !effectiveState.effective) return;
    scheduleBrowserContextWork({
      reason: 'panel-visible',
      conversationKey: activeTopicId,
    });
  }, [activeTopicId, effectiveState.effective]);

  useEffect(() => {
    setViewState(getBrowserContextViewState());
  }, [activeAssistant?.scenario, activeTopic?.browserContextMode, activeTopicId]);

  useEffect(() => {
    if (!activeTopicId || !viewState.lastCollection || !viewState.enabled || !viewState.masterEnabled) {
      setPreviewOpen(false);
    }
  }, [activeTopicId, viewState.enabled, viewState.lastCollection, viewState.masterEnabled]);

  const hostname = viewState.metadata?.url
    ? (() => {
        try {
          return new URL(viewState.metadata.url).hostname;
        } catch {
          return viewState.metadata?.url || '';
        }
      })()
    : '';

  const preview = viewState.lastCollection;
  const {
    conversationEnabled,
    masterEnabled,
    settings,
    disabledByAssistant: browserContextDisabledByAssistant,
    effective: browserContextEffective,
  } = effectiveState;
  const { fullPageEnabled: fullPageModeEnabled, styleSignalsEnabled: styleSignalsModeEnabled } = effectiveState.conversationMode;
  const modeDisabled = !effectiveState.hasConversation || !masterEnabled || browserContextDisabledByAssistant;
  const switchDisabled = !effectiveState.hasConversation || !masterEnabled || browserContextDisabledByAssistant;
  const refreshDisabled = !browserContextEffective || !activeTopicId;
  const previewAvailable = Boolean(browserContextEffective && preview);
  const profilePresentation = viewState.profile ? getBrowserContextProfilePresentation(viewState.profile, t) : null;
  const sourceLabels: Record<BrowserContextSourceId, string> = {
    'tab-meta': t('pageContext.source.tabMeta'),
    'technology-stack': t('pageContext.source.technologyStack'),
    'readable-dom': t('pageContext.source.readableDom'),
    'page-style-signals': t('pageContext.source.pageStyleSignals'),
    'selection-snapshot': t('pageContext.source.selectionSnapshot'),
    'element-snapshot': t('pageContext.source.elementSnapshot'),
  };
  const captureModeLabel = preview ? t(`pageContext.captureMode.${preview.captureMode}`) : '';
  const previewBodyInjected = Boolean(preview?.bodyAvailable && preview.promptChars > 0);
  const collectedAtText = preview
    ? new Date(preview.collectedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';
  /**
   * 把采集失败码映射成用户可读文案。
   *
   * @param issue - 采集链路产生的结构化问题。
   */
  const formatIssueLabel = (issue: BrowserContextCollectionIssue) => {
    switch (issue.code) {
      case 'page-uncollectable':
        return t('pageContext.issue.pageUncollectable');
      case 'content-script-injection-failed':
        return t('pageContext.issue.contentScriptInjectionFailed');
      case 'empty-body':
        return t('pageContext.issue.emptyBody');
      case 'login-wall':
        return t('pageContext.issue.loginWall');
      case 'challenge-page':
        return t('pageContext.issue.challengePage');
      case 'image-or-canvas-only':
        return t('pageContext.issue.imageOrCanvasOnly');
      case 'low-quality-extraction':
        return t('pageContext.issue.lowQualityExtraction');
      case 'tab-unavailable':
        return t('pageContext.issue.tabUnavailable');
      case 'metadata-unavailable':
        return t('pageContext.issue.metadataUnavailable');
      case 'timeout':
        return t('pageContext.issue.timeout');
      case 'capture-quota-limited':
        return t('pageContext.issue.captureQuotaLimited');
      case 'collector-unavailable':
        return t('pageContext.issue.collectorUnavailable');
      case 'content-script-unreachable':
      default:
        return t('pageContext.issue.contentScriptUnreachable');
    }
  };
  const previewIssues = preview?.issues ?? [];
  /**
   * 将 source 级采集问题收敛为弹窗展示文案。
   *
   * 说明：同一用户可见问题可能由多个 source 同时上报；这里仅去重可读文案，
   * 不改变原始结构化 issue，避免影响权限卡片和状态判断。
   *
   * @param issues - 本轮采集问题列表。
   * @param options - 展示过滤选项。
   * @returns 去重后的用户可读文案列表。
   */
  const buildUniqueIssueLabels = (
    issues: BrowserContextCollectionIssue[],
  ) => {
    const labels: string[] = [];
    const seenLabels = new Set<string>();
    for (const issue of issues) {
      const label = formatIssueLabel(issue);
      if (seenLabels.has(label)) continue;
      seenLabels.add(label);
      labels.push(label);
    }
    return labels;
  };
  const previewIssueLabels = previewBodyInjected ? [] : buildUniqueIssueLabels(previewIssues);
  const previewFailureText = previewIssueLabels[0] || t('pageContext.bodyUnavailable');
  const styleCapture = preview?.styleCapture ?? null;
  const previewStatusLabel = previewBodyInjected
    ? t('pageContext.status.success')
    : preview?.status === 'partial'
      ? t('pageContext.status.partial')
      : t('pageContext.status.failed');
  const previewStatusClassName = previewBodyInjected
    ? 'bg-primary/10 text-primary'
    : preview?.status === 'partial'
      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
      : 'bg-destructive/10 text-destructive';
  const groupLabelClassName = 'text-[10px] font-medium text-muted-foreground/70';
  const actionChipClassName = cn(
    'inline-flex h-7 items-center gap-1.5 rounded-md border border-transparent px-2 text-[11px] font-medium text-muted-foreground/85 transition-colors whitespace-nowrap',
    'hover:bg-accent/70 hover:text-foreground disabled:cursor-not-allowed disabled:text-muted-foreground/45',
  );
  const modeChipClassName = cn(
    'relative inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-muted-foreground/80 transition-colors',
    'hover:bg-background/60 hover:text-foreground dark:hover:bg-muted/40 disabled:cursor-not-allowed disabled:text-muted-foreground/45',
  );
  const selectedModeChipClassName = cn(
    "!bg-transparent !text-foreground font-semibold after:absolute after:bottom-0.5 after:left-2 after:right-2 after:h-[2px] after:rounded-full after:bg-primary/70 after:content-[''] [&_svg]:text-primary",
    'hover:!bg-transparent',
  );

  /**
   * 切换当前会话的全文网页模式。
   *
   * @param enabled - 是否启用全文模式。
   */
  const updateConversationMode = (patch: Partial<BrowserContextConversationMode>) => {
    if (!activeTopicId) return;
    updateTopicMeta(activeTopicId, {
      browserContextMode: {
        ...viewState.conversationMode,
        ...patch,
      },
    });
    setViewState(getBrowserContextViewState());
  };

  /**
   * 切换当前会话的自动上下文开关。
   *
   * @param enabled - 目标启用状态。
   */
  const toggle = (enabled: boolean) => {
    updateConversationMode({ enabled });
  };

  /**
   * 切换当前会话的全文网页模式。
   *
   * @param enabled - 是否启用全文模式。
   */
  const toggleFullPageMode = (enabled: boolean) => {
    updateConversationMode({ fullPageEnabled: enabled });
  };

  /**
   * 切换当前会话的页面设计信号模式。
   *
   * @param enabled - 是否启用设计信号模式。
   */
  const toggleStyleSignalsMode = (enabled: boolean) => {
    updateConversationMode({ styleSignalsEnabled: enabled });
  };

  /**
   * 刷新当前助手 + 当前页面的浏览器上下文缓存。
   */
  const refresh = () => {
    if (!browserContextEffective) return;
    requestBrowserContextMetadata();
    if (!activeTopicId || resolvedPolicy.source === 'assistant-disabled') return;
    scheduleBrowserContextWork({
      reason: 'manual-refresh',
      conversationKey: activeTopicId,
    });
  };

  const modeSummary = [
    fullPageModeEnabled ? t('pageContext.mode.fullPageShort') : t('pageContext.mode.normalShort'),
    styleSignalsModeEnabled ? t('pageContext.mode.styleShort') : null,
  ].filter(Boolean).join(' · ');
  const statusText = !masterEnabled
    ? t('pageContext.masterDisabled')
    : !conversationEnabled
      ? t('pageContext.disabled')
      : resolvedPolicy.source === 'assistant-disabled'
        ? t('pageContext.disabledByAssistant')
        : viewState.metadata
          ? viewState.metadata.title || hostname || t('pageContext.none')
          : t('pageContext.none');
  const secondaryText = !masterEnabled
    ? t('pageContext.masterDisabledHint')
    : resolvedPolicy.source === 'assistant-disabled'
      ? t('pageContext.disabledByAssistant')
      : !conversationEnabled
        ? modeSummary
        : viewState.status === 'warming'
          ? t('pageContext.viewStatus.warming')
          : viewState.status === 'stale'
            ? t('pageContext.viewStatus.stale')
            : viewState.status === 'degraded' && !previewAvailable
                ? t('pageContext.viewStatus.degraded')
                : viewState.status === 'unavailable' && !previewAvailable
                  ? t('pageContext.viewStatus.unavailable')
                  : previewAvailable
                    ? preview!.bodyAvailable
                      ? `${modeSummary} · ${t('pageContext.injectedChars', { count: preview!.promptChars })}`
                      : `${modeSummary} · ${previewFailureText}`
                    : fullPageModeEnabled
                      ? t('pageContext.pendingCollectionFullPage', { count: settings.fullPagePromptChars })
                      : styleSignalsModeEnabled
                        ? t('pageContext.pendingCollectionWithStyleSignals')
                        : t('pageContext.pendingCollection');

  const summaryContent = (
    <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden" data-testid="page-context-summary">
      {viewState.metadata?.favicon && browserContextEffective ? (
        <img src={viewState.metadata.favicon} alt="" className="h-3.5 w-3.5 flex-shrink-0 rounded-sm" />
      ) : null}
      <div className="page-context-summary-primary min-w-0 flex-1">
        <div className="truncate text-foreground/90" title={statusText}>
          {statusText}
        </div>
        <div className="truncate text-[11px] text-muted-foreground/80" title={secondaryText}>
          {secondaryText}
        </div>
      </div>
      {browserContextEffective && profilePresentation ? (
        <span
          className="page-context-profile-badge inline-flex min-w-0 max-w-[10rem] shrink rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
          title={`${profilePresentation.title} · ${profilePresentation.description}`}
        >
          <span className="truncate">{profilePresentation.title}</span>
        </span>
      ) : null}
      {previewAvailable ? (
        preview!.bodyAvailable ? (
          <span className="page-context-body-badge inline-flex min-w-0 shrink rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
            <span className="truncate">
              {preview!.promptChars}
              {t('pageContext.bodyCharsSuffix')}
            </span>
          </span>
        ) : (
          <span className="page-context-body-badge inline-flex min-w-0 shrink rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">
            <span className="truncate">
              {previewStatusLabel}
            </span>
          </span>
        )
      ) : null}
      <PageContextBarStyleCaptureBadge styleCapture={styleCapture} t={t} />
      {viewState.metadata?.url && browserContextEffective ? (
        <span className="page-context-hostname min-w-0 max-w-[12rem] shrink truncate text-[10px] text-muted-foreground/70" title={viewState.metadata.url}>
          {hostname}
        </span>
      ) : null}
    </div>
  );

  return (
    <div
      className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 overflow-hidden border-b border-border bg-muted/30 px-3 py-1.5 text-xs"
      data-page-context-bar
      data-testid="page-context-bar"
    >
      <Globe className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />

      {previewAvailable ? (
        <Popover open={previewOpen} onOpenChange={setPreviewOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="page-context-summary-shell flex min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-background/70"
              aria-label={t('pageContext.preview')}
            >
              {summaryContent}
              <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/80" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            side="bottom"
            sideOffset={8}
            collisionPadding={12}
            className="w-[min(34rem,calc(100vw-2rem))] border-none bg-transparent p-0 shadow-none"
            onOpenAutoFocus={(event) => event.preventDefault()}
            data-testid="page-context-preview-popover"
          >
            <Card className="border-border/60 bg-background/95 shadow-lg backdrop-blur-md">
              <CardHeader className="space-y-2 pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="truncate text-sm">{viewState.metadata?.title || t('pageContext.preview')}</CardTitle>
                    <CardDescription className="mt-1 text-xs leading-5">
                      {hostname || viewState.metadata?.url || t('pageContext.none')}
                    </CardDescription>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${previewStatusClassName}`}>
                      {previewStatusLabel}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground/80">
                      {fullPageModeEnabled ? t('pageContext.mode.fullPage') : t('pageContext.mode.normal')}
                    </span>
                    {styleSignalsModeEnabled ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        {t('pageContext.mode.style')}
                      </span>
                    ) : null}
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                      {preview?.bodyAvailable ? captureModeLabel : t('pageContext.captureMode.metadata-only')}
                    </span>
                    {preview?.promptTruncated ? (
                      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                        {t('pageContext.truncated')}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                    <FileText className="h-3 w-3" />
                    {t('pageContext.bodyChars', { count: preview?.bodyChars ?? 0 })}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                    <FileText className="h-3 w-3" />
                    {t('pageContext.promptChars', { count: preview?.promptChars ?? 0 })}
                  </span>
                  {collectedAtText ? (
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5">
                      {t('pageContext.collectedAt', { time: collectedAtText })}
                    </span>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                {previewIssueLabels.length ? (
                  <section className="space-y-1.5">
                    <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      {t('pageContext.issues')}
                    </div>
                    <div className="space-y-2">
                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm leading-6 text-foreground/85">
                        {previewIssueLabels.map((label, index) => (
                          <div key={`${label}-${index}`}>{label}</div>
                        ))}
                      </div>
                    </div>
                  </section>
                ) : null}

                <section className="space-y-1.5">
                  <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    {t('pageContext.sources')}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {preview?.sources.map((sourceId) => (
                      <span
                        key={sourceId}
                        className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] text-foreground/80"
                      >
                        {sourceLabels[sourceId]}
                      </span>
                    ))}
                  </div>
                </section>

                <PageContextBarStyleCaptureSection styleCapture={styleCapture} t={t} />

                {preview?.headings.length ? (
                  <section className="space-y-1.5">
                    <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      {t('pageContext.headings')}
                    </div>
                    <div className="space-y-1 rounded-xl border border-border/50 bg-muted/25 px-3 py-2">
                      {preview.headings.map((item, index) => (
                        <div
                          key={`${item.level}-${item.text}-${index}`}
                          className="truncate text-sm text-foreground/85"
                          style={{ paddingLeft: `${(item.level - 1) * 12}px` }}
                          title={item.text}
                        >
                          {item.text}
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                <section className="space-y-1.5">
                  <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    {t('pageContext.snippet')}
                  </div>
                  <div className="rounded-xl border border-border/50 bg-muted/25 px-3 py-2 text-sm leading-6 text-foreground/85">
                    {preview?.bodyAvailable ? (preview.snippet || t('pageContext.noSnippet')) : previewFailureText}
                  </div>
                </section>
              </CardContent>
            </Card>
          </PopoverContent>
        </Popover>
      ) : (
        <div className="page-context-summary-shell flex min-w-0 max-w-full items-center gap-2 overflow-hidden px-1.5 py-1">
          {summaryContent}
        </div>
      )}

      <PageContextBarControls
        actionChipClassName={actionChipClassName}
        collecting={viewState.collecting}
        conversationEnabled={conversationEnabled}
        fullPageModeEnabled={fullPageModeEnabled}
        fullPagePromptChars={settings.fullPagePromptChars}
        groupLabelClassName={groupLabelClassName}
        masterEnabled={masterEnabled}
        modeChipClassName={modeChipClassName}
        modeDisabled={modeDisabled}
        onRefresh={refresh}
        onToggle={toggle}
        onToggleFullPageMode={toggleFullPageMode}
        onToggleStyleSignalsMode={toggleStyleSignalsMode}
        refreshDisabled={refreshDisabled}
        selectedModeChipClassName={selectedModeChipClassName}
        styleSignalsModeEnabled={styleSignalsModeEnabled}
        switchDisabled={switchDisabled}
        t={t}
      />

      <TechnologyStackPopover
        actionChipClassName={actionChipClassName}
        enabled={Boolean(browserContextEffective || viewState.metadata)}
        metadata={viewState.metadata}
        t={t}
      />
    </div>
  );
}
