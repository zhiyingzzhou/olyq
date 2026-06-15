/**
 * 说明：`TechnologyStackPopover` 页面技术栈入口组件。
 *
 * 职责：
 * - 在自动页面上下文状态条附近提供紧凑的技术栈展示入口；
 * - 通过 technology-stack 插件 runtime API 读取当前 tab 的探测结果；
 * - 按分类高密度展示技术、版本可靠度、置信度、来源和官网入口。
 *
 * 边界：
 * - 本组件不直接访问 `chrome.*`，所有跨运行时通信走 `technology-stack-api`；
 * - 不展示原始 HTML、cookie 值、脚本片段或 CSS；
 * - 技术项图标只从本地 compact catalog 展开固定版本 jsDelivr 静态 SVG，失败时回退到 Olyq 本地文字占位。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { ExternalLink, RefreshCw, ScanSearch } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TooltipAction } from '@/components/ui/tooltip-action';
import type { BrowserContextMetadataSnapshot } from '@/lib/browser-context/types';
import { onTechnologyStackResultUpdated, refreshTechnologyStack, requestTechnologyStack } from '@/lib/extension/technology-stack-api';
import {
  getTechnologyStackErrorReasonI18nKey,
  normalizeTechnologyStackErrorCode,
  type TechnologyStackErrorCode,
} from '@/lib/technology-stack/errors';
import {
  resolveTechnologyIcon,
} from '@/lib/technology-stack/icons';
import {
  loadTechnologyIconCatalog,
  peekTechnologyIconCatalog,
  type TechnologyIconCatalog,
} from '@/lib/technology-stack/icon-catalog-client';
import { groupTechnologiesForDisplay } from '@/lib/technology-stack/prompt';
import type { DetectedTechnology, TechnologyEvidenceSource, TechnologyIconCandidate, TechnologyStackResult } from '@/lib/technology-stack/types';
import { cn } from '@/lib/utils';

/** 技术栈弹窗组件入参。 */
interface TechnologyStackPopoverProps {
  /** 当前页面 metadata；用于指定 tab 并决定不可采集态。 */
  metadata: BrowserContextMetadataSnapshot | null;
  /** 是否允许探测当前页面。 */
  enabled: boolean;
  /** 状态条右侧 action chip 样式。 */
  actionChipClassName: string;
  /** i18n 翻译函数。 */
  t: TFunction;
}

/** 本地请求状态。 */
type TechnologyStackRequestStatus = 'idle' | 'loading' | 'ready' | 'error';

/** 读取扩展根节点当前是否处于深色主题。 */
function readDocumentDarkTheme(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
}

/** 监听扩展根节点暗色主题 class，用于选择 skill-icons 的 light/dark 变体。 */
function useDarkThemeState(): boolean {
  const [isDarkTheme, setIsDarkTheme] = useState(readDocumentDarkTheme);

  useEffect(() => {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
    const root = document.documentElement;
    const observer = new MutationObserver(() => setIsDarkTheme(readDocumentDarkTheme()));
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isDarkTheme;
}

/** 按当前主题选出候选图标 URL。 */
function selectTechnologyIconUrl(candidate: TechnologyIconCandidate, isDarkTheme: boolean): string {
  return isDarkTheme
    ? candidate.darkUrl ?? candidate.url
    : candidate.lightUrl ?? candidate.url;
}

/** 技术项图标，候选来自本地 compact catalog 展开的固定版本静态 SVG。 */
function TechnologyIcon({ tech }: { tech: DetectedTechnology }) {
  const [candidateIndex, setCandidateIndex] = useState(0);
  const isDarkTheme = useDarkThemeState();
  const candidates = tech.iconCandidates;
  const candidate = candidateIndex < candidates.length ? candidates[candidateIndex] : undefined;
  const src = candidate ? selectTechnologyIconUrl(candidate, isDarkTheme) : undefined;
  const fallbackText = tech.iconFallback || tech.name.charAt(0).toUpperCase();

  useEffect(() => {
    setCandidateIndex(0);
  }, [candidates, tech.slug]);

  const handleImageError = useCallback(() => {
    setCandidateIndex((current) => Math.min(current + 1, candidates.length));
  }, [candidates.length]);

  if (src) {
    return (
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-zinc-200/80 bg-white text-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.72),0_1px_2px_rgba(15,23,42,0.08)] dark:border-white/15 dark:bg-zinc-50"
        aria-hidden="true"
      >
        <img
          src={src}
          alt=""
          width={16}
          height={16}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="h-4 w-4 object-contain opacity-95"
          onError={handleImageError}
          data-testid="technology-stack-tech-icon-img"
        />
      </span>
    );
  }

  return (
    <span
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/60 text-[10px] font-semibold text-foreground/80 shadow-sm"
      aria-hidden="true"
      data-testid="technology-stack-tech-icon-fallback"
    >
      {fallbackText}
    </span>
  );
}

/** 把技术分类 slug 映射为本地化展示名。 */
function formatCategory(category: string, t: TFunction, fallbackName?: string): string {
  return t(`pageContext.technologyStack.category.${category}`, { defaultValue: fallbackName || category });
}

/** 把证据来源映射为本地化展示名。 */
function formatEvidenceSource(source: TechnologyEvidenceSource, t: TFunction): string {
  return t(`pageContext.technologyStack.source.${source}`, { defaultValue: source });
}

/** 当前结果是否仍绑定在状态条的页面上。 */
function isResultForMetadata(result: TechnologyStackResult | null, metadata: BrowserContextMetadataSnapshot | null): boolean {
  if (!result || !metadata) return false;
  return result.tabId === metadata.tabId && result.url === metadata.url;
}

/** 用已加载的本地 compact catalog 补齐技术项图标。 */
function enrichTechnologyIcons(
  technologies: readonly DetectedTechnology[],
  iconCatalog: TechnologyIconCatalog | null,
): DetectedTechnology[] {
  return technologies.map((tech) => {
    const resolved = resolveTechnologyIcon(tech, iconCatalog);
    return {
      ...tech,
      iconCandidates: resolved.iconCandidates,
      iconFallback: resolved.iconFallback,
    };
  });
}

/**
 * 技术栈弹窗入口。
 *
 * @param props - 组件入参。
 * @returns 技术栈按钮与 Popover。
 */
export function TechnologyStackPopover({ metadata, enabled, actionChipClassName, t }: TechnologyStackPopoverProps) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<TechnologyStackRequestStatus>('idle');
  const [result, setResult] = useState<TechnologyStackResult | null>(null);
  const [resultBindingKey, setResultBindingKey] = useState<string | null>(null);
  const [error, setError] = useState<TechnologyStackErrorCode | null>(null);
  const [iconCatalog, setIconCatalog] = useState<TechnologyIconCatalog | null>(() => peekTechnologyIconCatalog());
  const canCollect = Boolean(enabled && metadata?.tabId && metadata.url.startsWith('http'));
  const resultIdentityKey = canCollect && metadata?.tabId ? `${metadata.tabId}::${metadata.url}` : null;
  const metadataKey = resultIdentityKey ? metadata?.technologyStackPageKey ?? null : null;
  const activeResultIdentityKeyRef = useRef<string | null>(null);
  const activeRequestKeyRef = useRef<string | null>(null);
  const activeTechnologyStackPageKeyRef = useRef<string | null>(null);
  const activeResultBindingKeyRef = useRef<string | null>(null);
  const requestSequenceRef = useRef(0);
  const inflightNormalRequestRef = useRef<{ key: string; promise: Promise<void> } | null>(null);
  activeResultIdentityKeyRef.current = resultIdentityKey;
  activeRequestKeyRef.current = metadataKey;
  activeTechnologyStackPageKeyRef.current = metadata?.technologyStackPageKey ?? null;
  activeResultBindingKeyRef.current = resultBindingKey;
  const visibleResult = resultBindingKey === metadataKey && isResultForMetadata(result, metadata) ? result : null;
  const isDetecting = status === 'loading' || (open && status === 'idle' && !visibleResult);

  useEffect(() => {
    let cancelled = false;
    const cached = peekTechnologyIconCatalog();
    if (cached) setIconCatalog(cached);
    void loadTechnologyIconCatalog().then((catalog) => {
      if (!cancelled) setIconCatalog(catalog);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void loadTechnologyIconCatalog().then((catalog) => {
      if (!cancelled) setIconCatalog(catalog);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const load = useCallback(async (force = false) => {
    if (!metadata?.tabId || !canCollect) {
      setResult({
        status: 'uncollectable',
        tabId: metadata?.tabId ?? null,
        url: metadata?.url ?? '',
        title: metadata?.title ?? '',
        pageFingerprint: '',
        detectedAt: Date.now(),
        technologies: [],
        error: 'page-uncollectable',
      });
      setResultBindingKey(metadataKey);
      setStatus('ready');
      setError(null);
      return;
    }

    if (!metadataKey) {
      setStatus('idle');
      setError(null);
      return;
    }

    const requestKey = metadataKey;
    if (!force && inflightNormalRequestRef.current?.key === requestKey) {
      await inflightNormalRequestRef.current.promise;
      return;
    }

    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    setStatus('loading');
    setError(null);

    const promise = (async () => {
      try {
        const response = force
          ? await refreshTechnologyStack({ tabId: metadata.tabId })
          : await requestTechnologyStack({ tabId: metadata.tabId });
        if (activeRequestKeyRef.current !== requestKey || requestSequenceRef.current !== requestSequence) return;
        if (!response?.ok || response.error) {
          setStatus('error');
          setError(normalizeTechnologyStackErrorCode(response?.error));
          return;
        }
        setResult(response.payload ?? null);
        setResultBindingKey(response.payload ? requestKey : null);
        setStatus('ready');
      } catch (requestError: unknown) {
        if (activeRequestKeyRef.current !== requestKey || requestSequenceRef.current !== requestSequence) return;
        setStatus('error');
        setError(normalizeTechnologyStackErrorCode(requestError));
      }
    })();

    if (!force) {
      inflightNormalRequestRef.current = { key: requestKey, promise };
      promise.finally(() => {
        if (inflightNormalRequestRef.current?.key === requestKey && inflightNormalRequestRef.current.promise === promise) {
          inflightNormalRequestRef.current = null;
        }
      });
    }

    await promise;
  }, [canCollect, metadata?.tabId, metadata?.title, metadata?.url, metadataKey]);

  useEffect(() => {
    setStatus('idle');
    setError(null);
    setResult(null);
    setResultBindingKey(null);
  }, [metadataKey]);

  useEffect(() => {
    if (!open) return;
    if (visibleResult) return;
    void load(false);
  }, [load, open, visibleResult]);

  useEffect(() => {
    return onTechnologyStackResultUpdated(({ pageKey, result: updatedResult }) => {
      const updateKey = `${updatedResult.tabId ?? ''}::${updatedResult.url}`;
      if (activeResultIdentityKeyRef.current !== updateKey) return;
      const activePageKey = activeTechnologyStackPageKeyRef.current;
      if (!activePageKey || pageKey !== activePageKey) return;
      const requestKey = activeRequestKeyRef.current;
      if (!requestKey) return;
      const currentBindingKey = activeResultBindingKeyRef.current;
      setResult((current) => {
        if (currentBindingKey === requestKey && current && current.detectedAt > updatedResult.detectedAt) return current;
        return updatedResult;
      });
      setResultBindingKey(requestKey);
      setStatus('ready');
      setError(null);
    });
  }, []);

  const visibleTechnologies = useMemo(
    () => enrichTechnologyIcons(visibleResult?.technologies ?? [], iconCatalog),
    [iconCatalog, visibleResult?.technologies],
  );
  const groups = useMemo(() => groupTechnologiesForDisplay(visibleTechnologies), [visibleTechnologies]);
  const visibleErrorCode = status === 'error' || visibleResult?.status === 'error'
    ? normalizeTechnologyStackErrorCode(error ?? visibleResult?.error)
    : null;
  const visibleErrorReason = visibleErrorCode
    ? t(getTechnologyStackErrorReasonI18nKey(visibleErrorCode))
    : '';
  const detectedAtText = visibleResult?.detectedAt
    ? new Date(visibleResult.detectedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';
  const statusLabel = isDetecting
    ? t('pageContext.technologyStack.status.detecting')
    : visibleResult?.status === 'ready'
      ? t('pageContext.technologyStack.status.ready', { count: visibleTechnologies.length })
      : visibleResult?.status === 'empty'
        ? t('pageContext.technologyStack.status.empty')
        : visibleResult?.status === 'uncollectable'
          ? t('pageContext.technologyStack.status.uncollectable')
          : status === 'error' || visibleResult?.status === 'error'
            ? t('pageContext.technologyStack.status.error')
            : t('pageContext.technologyStack.status.idle');
  const statusBadgeClassName = visibleResult?.status === 'ready'
    ? 'bg-primary/10 text-primary'
    : visibleResult?.status === 'empty'
      ? 'bg-muted text-muted-foreground'
      : visibleResult?.status === 'uncollectable'
        ? 'bg-muted text-muted-foreground'
        : status === 'error' || visibleResult?.status === 'error'
          ? 'bg-destructive/10 text-destructive'
          : 'bg-muted text-muted-foreground';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <TooltipAction tooltip={t('pageContext.technologyStack.open')}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(actionChipClassName, 'page-context-technology-stack-trigger shrink-0')}
            aria-label={t('pageContext.technologyStack.open')}
            data-testid="technology-stack-trigger"
          >
            <ScanSearch
              className={cn('h-3.5 w-3.5', isDetecting && 'animate-pulse')}
              strokeWidth={1.9}
              data-testid="technology-stack-trigger-icon"
            />
            <span>{t('pageContext.technologyStack.short')}</span>
          </button>
        </PopoverTrigger>
      </TooltipAction>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={8}
        collisionPadding={12}
        className="w-[min(34rem,calc(100vw-1.25rem))] overflow-hidden rounded-xl border border-border/60 bg-popover/95 p-0 shadow-xl shadow-black/5 backdrop-blur-xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
        data-testid="technology-stack-popover"
      >
        <div className="flex max-h-[min(31rem,68vh)] min-h-0 flex-col">
          <div className="shrink-0 border-b border-border/60 bg-background/75 px-3 py-2.5 backdrop-blur">
            <div className="flex min-w-0 items-start gap-2.5">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-primary/5 text-primary shadow-sm">
                <ScanSearch className="h-4 w-4" strokeWidth={1.9} data-testid="technology-stack-header-icon" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <h3 className="truncate text-sm font-semibold tracking-tight text-foreground">{t('pageContext.technologyStack.title')}</h3>
                </div>
                <p className="truncate text-[11px] leading-4 text-muted-foreground">
                  {visibleResult?.title || metadata?.title || metadata?.url || t('pageContext.none')}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 shrink-0 rounded-lg border border-border/60 bg-background/80 p-0 text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
                onClick={() => void load(true)}
                disabled={isDetecting}
                aria-label={t('pageContext.technologyStack.refresh')}
              >
                <RefreshCw className={cn('h-3.5 w-3.5', isDetecting && 'animate-spin')} />
              </Button>
            </div>
            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[10px] leading-4 text-muted-foreground">
              <span className="truncate">
                {detectedAtText ? t('pageContext.technologyStack.detectedAt', { time: detectedAtText }) : t('pageContext.technologyStack.privacy')}
              </span>
              <span className={cn('inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 font-medium', statusBadgeClassName)}>
                {statusLabel}
              </span>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            {isDetecting ? (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                {t('pageContext.technologyStack.detecting')}
              </div>
            ) : visibleErrorCode ? (
              <div className="m-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm leading-6 text-foreground/85 shadow-sm">
                {t('pageContext.technologyStack.error', { reason: visibleErrorReason })}
              </div>
            ) : visibleResult?.status === 'uncollectable' ? (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                {t('pageContext.technologyStack.uncollectable')}
              </div>
            ) : visibleResult?.status === 'empty' || groups.length < 1 ? (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                {t('pageContext.technologyStack.empty')}
              </div>
            ) : (
              <ScrollArea className="max-h-[min(27rem,58vh)] min-h-0" viewportClassName="max-h-[min(27rem,58vh)]">
                <div className="px-2.5 pb-1 pt-2" data-testid="technology-stack-list-content">
                  {groups.map((group) => (
                    <section key={group.category} className="mb-2.5 last:mb-0">
                      <div
                        className="-mx-2.5 mb-1 flex items-center justify-between gap-2 border-b border-border/50 bg-popover/95 px-2.5 py-1.5"
                        data-testid="technology-stack-category-header"
                      >
                        <h4 className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          {formatCategory(group.category, t, group.categoryLabel)}
                        </h4>
                        <Badge variant="secondary" className="h-5 rounded-full border border-border/50 bg-muted/70 px-1.5 py-0 text-[10px] font-medium text-foreground/80">
                          {group.technologies.length}
                        </Badge>
                      </div>
                      <div className="space-y-1">
                        {group.technologies.map((tech) => (
                          <article
                            key={tech.slug}
                            className="group relative flex min-w-0 items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-accent/30"
                          >
                            <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-transparent transition-colors group-hover:bg-primary/60" aria-hidden="true" />
                            <TechnologyIcon tech={tech} />
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 items-center gap-1.5">
                                <span className="min-w-0 truncate text-[13px] font-medium leading-5 text-foreground">{tech.name}</span>
                                {tech.version ? (
                                  <span className="shrink-0 rounded-full border border-border/60 bg-background/80 px-1.5 py-0.5 font-mono text-[10px] leading-4 text-foreground/75">
                                    {tech.version}
                                  </span>
                                ) : null}
                                {tech.versionReliability ? (
                                  <span className="shrink-0 text-[10px] text-muted-foreground">
                                    {t(`pageContext.technologyStack.version.${tech.versionReliability}`)}
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] leading-4 text-muted-foreground">
                                <span className="inline-flex shrink-0 items-center rounded-full bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                                  {t('pageContext.technologyStack.confidence', { count: tech.confidence })}
                                </span>
                                <span className="truncate" title={tech.sources.slice(0, 4).map((source) => formatEvidenceSource(source, t)).join(' / ')}>
                                  {tech.sources.slice(0, 4).map((source) => formatEvidenceSource(source, t)).join(' / ')}
                                </span>
                                {(tech.categoryInfos?.slice(1).map((category) => ({
                                  key: category.slug,
                                  label: formatCategory(category.slug, t, category.name),
                                })) ?? tech.categories.slice(1).map((category) => ({
                                  key: category,
                                  label: formatCategory(category, t),
                                }))).map((category) => (
                                  <span
                                    key={`${tech.slug}-${category.key}`}
                                    className="inline-flex shrink-0 items-center rounded-full border border-border/60 bg-background/70 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                                  >
                                    {category.label}
                                  </span>
                                ))}
                              </div>
                            </div>
                            {tech.website ? (
                              <a
                                href={tech.website}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/60 text-muted-foreground transition-colors hover:border-border hover:bg-background hover:text-foreground"
                                aria-label={t('pageContext.technologyStack.openWebsite', { name: tech.name })}
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            ) : null}
                          </article>
                        ))}
                      </div>
                    </section>
                  ))}
                  <div className="h-4" aria-hidden="true" data-testid="technology-stack-list-bottom-spacer" />
                </div>
              </ScrollArea>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
