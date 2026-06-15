/**
 * 说明：`MarkdownLinkPreview` 组件模块。
 *
 * 职责：
 * - 为聊天 Markdown 中的 http/https 链接提供悬浮 / 聚焦预览；
 * - 复用 Olyq 现有 Popover、Skeleton 与运行时 one-shot contract；
 *
 * 边界：
 * - 本文件只处理聊天 UI 展示与触发时序；
 * - 不直接调用浏览器 API、不直接跨域 fetch、不新增持久状态。
 */
import { ExternalLink, Globe2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { requestLinkPreviewMetadata } from '@/lib/extension/link-preview-api';
import type { LinkPreviewErrorCode, LinkPreviewMetadata } from '@/lib/link-preview/types';

const HOVER_CLOSE_DELAY_MS = 120;
const LINK_PREVIEW_UI_TIMEOUT_MS = 6_500;
const LINK_CLASS_NAME = 'text-primary hover:text-primary/80 underline underline-offset-2 transition-colors';

/** 链接预览加载状态。 */
type LinkPreviewLoadState =
  | { readonly status: 'idle'; readonly metadata: null; readonly error: null }
  | { readonly status: 'loading'; readonly metadata: null; readonly error: null }
  | { readonly status: 'ready'; readonly metadata: LinkPreviewMetadata; readonly error: LinkPreviewErrorCode | null }
  | { readonly status: 'error'; readonly metadata: null; readonly error: LinkPreviewErrorCode | null };

/** Markdown 链接预览组件入参。 */
interface MarkdownLinkPreviewProps {
  /** Markdown 解析得到的链接地址。 */
  readonly href?: string;
  /** 链接显示内容。 */
  readonly children: ReactNode;
}

/**
 * Markdown 链接预览组件。
 *
 * @param props - 链接地址与子节点。
 * @returns 普通链接或带预览浮层的链接。
 */
export function MarkdownLinkPreview({ href, children }: MarkdownLinkPreviewProps) {
  const { t } = useTranslation();
  const rawUrl = String(href || '').trim();
  const [open, setOpen] = useState(false);
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LinkPreviewLoadState>({
    status: 'idle',
    metadata: null,
    error: null,
  });
  const closeTimerRef = useRef<number | null>(null);
  const triggerHoveringRef = useRef(false);
  const contentHoveringRef = useRef(false);
  const requestSequenceRef = useRef(0);
  const activeRequestIdRef = useRef<number | null>(null);
  const external = isHttpUrl(rawUrl);
  const activeImageUrl = loadState.metadata?.imageUrl ?? null;
  const imageFailed = Boolean(activeImageUrl && failedImageUrl === activeImageUrl);

  useEffect(() => {
    if (!open || !external) return;
    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;
    activeRequestIdRef.current = requestId;
    setFailedImageUrl(null);
    setLoadState({ status: 'loading', metadata: null, error: null });
    const timeoutId = window.setTimeout(() => {
      if (activeRequestIdRef.current !== requestId) return;
      activeRequestIdRef.current = null;
      setLoadState({ status: 'error', metadata: null, error: 'timeout' });
    }, LINK_PREVIEW_UI_TIMEOUT_MS);

    // 每次打开浮层都是一个独立请求生命周期。后台或 runtime 若迟迟不返回，UI deadline
    // 会先给出 fallback；迟到响应只能被当前 requestId 接受，不能覆盖新一轮 hover。
    void requestLinkPreviewMetadata(rawUrl)
      .then((response) => {
        if (activeRequestIdRef.current !== requestId) return;
        activeRequestIdRef.current = null;
        window.clearTimeout(timeoutId);
        if (response.ok && response.payload) {
          setLoadState({
            status: 'ready',
            metadata: response.payload,
            error: response.error ?? null,
          });
          return;
        }
        setLoadState({
          status: 'error',
          metadata: null,
          error: response.ok ? response.error ?? 'empty-metadata' : null,
        });
      })
      .catch(() => {
        if (activeRequestIdRef.current !== requestId) return;
        activeRequestIdRef.current = null;
        window.clearTimeout(timeoutId);
        setLoadState({ status: 'error', metadata: null, error: 'fetch-failed' });
      });
    return () => {
      if (activeRequestIdRef.current === requestId) activeRequestIdRef.current = null;
      window.clearTimeout(timeoutId);
    };
  }, [external, open, rawUrl]);

  /**
   * 内部函数变量：`clearCloseTimer`。
   *
   * @remarks
   * 清理延迟关闭定时器，保证 trigger 与内容区之间移动时不会积累陈旧任务。
   */
  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  /**
   * 内部函数变量：`closeIfIdle`。
   *
   * @remarks
   * 遵守 hover/focus 预览的可悬浮契约：trigger 或内容区仍活跃时不关闭。
   */
  const closeIfIdle = useCallback((delay = HOVER_CLOSE_DELAY_MS) => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      if (triggerHoveringRef.current || contentHoveringRef.current) return;
      setOpen(false);
    }, delay);
  }, [clearCloseTimer]);

  useEffect(() => () => {
    clearCloseTimer();
  }, [clearCloseTimer]);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (nextOpen) {
      clearCloseTimer();
      setOpen(true);
      return;
    }
    if (triggerHoveringRef.current || contentHoveringRef.current) return;
    clearCloseTimer();
    setOpen(false);
  }, [clearCloseTimer]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLAnchorElement>) => {
    if (event.key !== 'Escape') return;
    triggerHoveringRef.current = false;
    contentHoveringRef.current = false;
    clearCloseTimer();
    setOpen(false);
  }, [clearCloseTimer]);

  if (!rawUrl || !external) {
    return (
      <a href={rawUrl || undefined} className={LINK_CLASS_NAME}>
        {children}
      </a>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <a
          href={rawUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={LINK_CLASS_NAME}
          onPointerEnter={() => {
            triggerHoveringRef.current = true;
            clearCloseTimer();
            setOpen(true);
          }}
          onPointerLeave={() => {
            triggerHoveringRef.current = false;
            closeIfIdle();
          }}
          onFocus={() => {
            triggerHoveringRef.current = true;
            clearCloseTimer();
            setOpen(true);
          }}
          onBlur={() => {
            triggerHoveringRef.current = false;
            closeIfIdle(0);
          }}
          onKeyDown={handleKeyDown}
        >
          {children}
        </a>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        side="top"
        sideOffset={8}
        collisionPadding={12}
        className="w-[min(24rem,calc(100vw-1.25rem))] overflow-hidden rounded-lg border-border/60 bg-popover/95 p-0 text-popover-foreground shadow-xl shadow-black/5 backdrop-blur"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onPointerEnter={() => {
          contentHoveringRef.current = true;
          clearCloseTimer();
        }}
        onPointerLeave={() => {
          contentHoveringRef.current = false;
          closeIfIdle();
        }}
      >
	        <LinkPreviewCard
	          displayUrl={rawUrl}
	          imageFailed={imageFailed}
	          loadState={loadState}
	          onImageError={() => {
	            if (activeImageUrl) setFailedImageUrl(activeImageUrl);
	          }}
	          t={t}
	        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * 链接预览卡片。
 *
 * @param props - 预览状态、展示 URL 与图片失败回调。
 * @returns 预览卡片内容。
 */
function LinkPreviewCard({
  displayUrl,
  imageFailed,
  loadState,
  onImageError,
  t,
}: {
  readonly displayUrl: string;
  readonly imageFailed: boolean;
  readonly loadState: LinkPreviewLoadState;
  readonly onImageError: () => void;
  readonly t: (key: string, options?: Record<string, unknown>) => string;
}) {
  if (loadState.status === 'idle' || loadState.status === 'loading') {
    return <LinkPreviewSkeleton label={t('markdown.linkPreview.loading')} />;
  }

  if (loadState.status === 'error' || !loadState.metadata) {
    return <LinkPreviewFallback displayUrl={displayUrl} label={t('markdown.linkPreview.unavailable')} />;
  }

  const metadata = loadState.metadata;
  const title = metadata.title || metadata.siteName || metadata.hostname || t('markdown.linkPreview.untitled');
  const description = metadata.description || metadata.finalUrl;
  const siteLabel = metadata.siteName || metadata.hostname;
  const showImage = Boolean(metadata.imageUrl && !imageFailed);

  return (
    <div className="min-w-0 overflow-hidden" data-testid="markdown-link-preview-card">
      {showImage ? (
        <div className="flex h-32 max-h-32 items-center justify-center border-b border-border/60 bg-muted/30">
          <img
            src={metadata.imageUrl ?? undefined}
            alt={metadata.imageAlt || t('markdown.linkPreview.imageAlt', { title })}
            className="h-full max-h-full w-full object-contain"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={onImageError}
          />
        </div>
      ) : null}
      <div className="space-y-2 px-3 py-3">
        <div className="flex min-w-0 items-center gap-2 text-[11px] leading-4 text-muted-foreground">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/70 text-primary">
            <Globe2 aria-hidden="true" focusable="false" className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 truncate">{siteLabel}</span>
          <ExternalLink aria-hidden="true" focusable="false" className="h-3 w-3 shrink-0 opacity-70" />
        </div>
        <div className="min-w-0 space-y-1">
          <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">{title}</h3>
          <p className="line-clamp-3 break-words text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * 链接预览加载骨架。
 *
 * @param props - 加载状态文案。
 * @returns 预览加载态。
 */
function LinkPreviewSkeleton({ label }: { readonly label: string }) {
  return (
    <div className="space-y-3 px-3 py-3" data-testid="markdown-link-preview-loading">
      <div className="flex items-center gap-2">
        <Skeleton className="h-6 w-6 rounded-md" />
        <Skeleton className="h-3.5 w-32" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

/**
 * 链接预览失败降级卡片。
 *
 * @param props - 展示 URL 与失败文案。
 * @returns 预览失败态。
 */
function LinkPreviewFallback({ displayUrl, label }: { readonly displayUrl: string; readonly label: string }) {
  const hostname = resolveHostname(displayUrl);
  return (
    <div className="space-y-2 px-3 py-3" data-testid="markdown-link-preview-fallback">
      <div className="flex min-w-0 items-center gap-2 text-[11px] leading-4 text-muted-foreground">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/70 text-muted-foreground">
          <Globe2 aria-hidden="true" focusable="false" className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 truncate">{hostname}</span>
      </div>
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium leading-5 text-foreground">{label}</p>
        <p className="line-clamp-2 break-all text-xs leading-5 text-muted-foreground">{displayUrl}</p>
      </div>
    </div>
  );
}

/**
 * 判断链接是否为 http/https 外链。
 *
 * @param raw - 原始链接。
 * @returns 是 http/https 时返回 `true`。
 */
function isHttpUrl(raw: string): boolean {
  return /^https?:\/\//i.test(raw.trim());
}

/**
 * 从 URL 中提取 hostname。
 *
 * @param raw - 原始 URL。
 * @returns hostname；无法解析时返回原始 URL。
 */
function resolveHostname(raw: string): string {
  try {
    return new URL(raw).hostname;
  } catch {
    return raw;
  }
}
