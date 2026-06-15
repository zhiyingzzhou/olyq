/**
 * 说明：`PaintingArtboard` 页面模块。
 *
 * 职责：
 * - 承载 `PaintingArtboard` 相关的当前文件实现与模块边界；
 * - 对外暴露 `PaintingArtboard` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ImageIcon, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { TooltipAction } from '@/components/ui/tooltip-action';
import { useAttachmentObjectUrl } from '@/hooks/useAttachmentObjectUrl';
import type { PaintingImageRef } from '@/hooks/usePaintStore';
import { downloadBlob } from '@/lib/export/download';
import { getAttachmentBlob } from '@/lib/attachments';

/** 底部缩略条单项属性。 */
interface PaintingStripThumbProps {
  /** 图片附件引用。 */
  readonly image: PaintingImageRef;
  /** 当前是否为选中项。 */
  readonly selected: boolean;
  /** 选中该缩略图。 */
  readonly onSelect: () => void;
}

/** 结果画板属性。 */
interface PaintingArtboardProps {
  /** 当前输出图片列表。 */
  readonly images: PaintingImageRef[];
  /** 当前预览索引。 */
  readonly index: number;
  /** 切换预览索引。 */
  readonly onIndexChange: (next: number) => void;
  /** 当前是否正在生成。 */
  readonly isGenerating: boolean;
  /** 当前生成使用的原始提示词，仅用于画板生成态摘要展示。 */
  readonly prompt: string;
  /** 当前生成使用的模型显示名，仅用于画板生成态摘要展示。 */
  readonly modelLabel: string;
  /** 当前生成任务开始时间戳；为空时生成态从当前时刻开始计时。 */
  readonly generationStartedAt: number | null;
}

/** 生成态覆盖层属性。 */
interface PaintGenerationOverlayProps {
  /** 当前是否展示生成态文案。 */
  readonly active: boolean;
  /** 展示在生成态中的提示词摘要。 */
  readonly prompt: string;
  /** 展示在生成态中的模型名称。 */
  readonly modelLabel: string;
  /** 生成开始时间戳，用于稳定计算已用时。 */
  readonly startedAt: number | null;
}

/** 已有结果图再次生成时使用的顶部浮条属性。 */
interface PaintGenerationStatusPillProps {
  /** 展示在浮条中的提示词摘要。 */
  readonly prompt: string;
  /** 展示在浮条中的模型名称。 */
  readonly modelLabel: string;
  /** 生成开始时间戳，用于稳定计算已用时。 */
  readonly startedAt: number | null;
}

/** 把秒数格式化为参考绘画页使用的 `mm:ss` 计时。 */
function formatGenerationElapsed(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

/** 生成态摘要文案过长时按参考页裁切，避免覆盖层挤压主视觉。 */
function truncateGenerationPrompt(prompt: string) {
  const text = prompt.trim();
  if (!text) return '';
  return text.length > 30 ? `${text.slice(0, 30)}...` : text;
}

/**
 * 图片生成覆盖层。
 *
 * 只负责把真实生成状态渲染成参考项目的 shimmer 骨架、动态省略号与已用时，
 * 不发起或取消任何生成请求，避免表现层影响图片生成业务链路。
 */
function PaintGenerationOverlay({
  active,
  prompt,
  modelLabel,
  startedAt,
}: PaintGenerationOverlayProps) {
  const { t } = useTranslation();
  /** 已用秒数，按开始时间派生，不参与持久化。 */
  const [elapsed, setElapsed] = useState(0);
  /** 动态省略号数量，复刻参考页的生成中节奏。 */
  const [dotCount, setDotCount] = useState(1);

  useEffect(() => {
    if (!active) {
      setElapsed(0);
      setDotCount(1);
      return;
    }

    const base = startedAt ?? Date.now();
    /** 根据稳定开始时间刷新生成覆盖层的已用时显示。 */
    const updateElapsed = () => setElapsed(Math.max(0, Math.floor((Date.now() - base) / 1000)));
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [active, startedAt]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      setDotCount((current) => (current % 3) + 1);
    }, 600);
    return () => window.clearInterval(timer);
  }, [active]);

  const promptSummary = truncateGenerationPrompt(prompt);
  const details = [modelLabel, promptSummary].filter(Boolean).join(' · ');

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden rounded-2xl bg-muted/30 text-center">
      <div className="relative mb-5 h-40 w-40 overflow-hidden rounded-xl bg-muted/50">
        <div className="absolute inset-0 animate-[paint-shimmer_1.8s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-foreground/[0.04] to-transparent" />
        <div className="absolute inset-0 flex items-center justify-center">
          <ImageIcon className="h-7 w-7 text-muted-foreground/30" />
        </div>
      </div>

      <div className="mb-4 flex max-w-[min(28rem,calc(100%-4rem))] flex-col items-center gap-1.5 px-8">
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-foreground/40 animate-pulse" />
          <span className="text-sm font-medium text-foreground/70">
            {active ? `${t('paint.generatingStatus')}${'.'.repeat(dotCount)}` : t('paint.preview')}
          </span>
        </div>
        {details ? <span className="max-w-full truncate text-xs text-muted-foreground">{details}</span> : null}
      </div>

      {active ? (
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {formatGenerationElapsed(elapsed)}
        </span>
      ) : null}
    </div>
  );
}

/**
 * 已有生成结果再次生成时的顶部状态浮条。
 *
 * 这条浮层只占用画板顶部工具栏的中间位置，不再覆盖整张结果图；
 * 空白生成态、结果加载和失败仍由居中骨架负责，避免两类状态互相抢视觉职责。
 */
function PaintGenerationStatusPill({
  prompt,
  modelLabel,
  startedAt,
}: PaintGenerationStatusPillProps) {
  const { t } = useTranslation();
  /** 已用秒数仅由本地时间派生，不写入绘画记录或附件元数据。 */
  const [elapsed, setElapsed] = useState(0);
  /** 动态省略号保持和空态生成覆盖层一致的节奏。 */
  const [dotCount, setDotCount] = useState(1);

  useEffect(() => {
    const base = startedAt ?? Date.now();
    /** 根据稳定开始时间刷新顶部浮条的已用时显示。 */
    const updateElapsed = () => setElapsed(Math.max(0, Math.floor((Date.now() - base) / 1000)));
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setDotCount((current) => (current % 3) + 1);
    }, 600);
    return () => window.clearInterval(timer);
  }, []);

  const promptSummary = truncateGenerationPrompt(prompt);
  const details = [modelLabel, promptSummary].filter(Boolean).join(' · ');

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex h-8 max-w-full min-w-0 items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 text-[11px] text-muted-foreground shadow-sm backdrop-blur-sm"
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/40 animate-pulse" />
      <span className="shrink-0 font-medium text-foreground/70">
        {t('paint.generatingStatus')}{'.'.repeat(dotCount)}
      </span>
      {details ? (
        <span className="min-w-0 truncate">
          {details}
        </span>
      ) : null}
      <span className="shrink-0 tabular-nums">
        {formatGenerationElapsed(elapsed)}
      </span>
    </div>
  );
}

/**
 * 结果缩略条中的单张缩略图。
 */
function PaintingStripThumb({
  image,
  selected,
  onSelect,
}: PaintingStripThumbProps) {
  const { t } = useTranslation();
  const { url, loading, error } = useAttachmentObjectUrl(image.id);
  /** 当前缩略图是否已成功解码。 */
  const [imgReady, setImgReady] = useState(false);
  /** 当前缩略图是否解码失败。 */
  const [decodeError, setDecodeError] = useState(false);

  useEffect(() => {
    setImgReady(false);
    setDecodeError(false);
  }, [url]);

  return (
    <TooltipAction tooltip={image.name}>
      <button
        type="button"
        onClick={onSelect}
        className={`relative h-14 w-14 rounded-lg overflow-hidden border transition-colors ${
          selected ? 'border-primary ring-1 ring-primary/40' : 'border-border hover:border-primary/40'
        }`}
        aria-pressed={selected}
      >
        {(loading || (url && !imgReady && !decodeError)) && <Skeleton className="absolute inset-0 rounded-none" />}

        {error || decodeError ? (
          <div className="h-full w-full flex items-center justify-center bg-muted/30 text-[10px] text-muted-foreground">
            {t('paint.imageLoadFailed')}
          </div>
        ) : url ? (
          <img
            src={url}
            alt={image.name}
            className={`h-full w-full object-cover transition-opacity duration-200 ${imgReady ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setImgReady(true)}
            onError={() => setDecodeError(true)}
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center bg-muted/30 text-[10px] text-muted-foreground">
            {t('paint.loadingImage')}
          </div>
        )}
      </button>
    </TooltipAction>
  );
}

/**
 * 绘图结果画板。
 *
 * 提供大图预览、左右切换、下载和底部缩略条导航。
 */
export function PaintingArtboard({
  images,
  index,
  onIndexChange,
  isGenerating,
  prompt,
  modelLabel,
  generationStartedAt,
}: PaintingArtboardProps) {
  const { t } = useTranslation();
  /** 当前正在预览的图片。 */
  const current = images[index] ?? null;
  const currentId = current?.id ?? null;
  const { url: src, loading, error, reload } = useAttachmentObjectUrl(currentId);
  /** 主预览图是否已完成解码。 */
  const [imgReady, setImgReady] = useState(false);
  /** 主预览图是否解码失败。 */
  const [decodeError, setDecodeError] = useState(false);

  useEffect(() => {
    setImgReady(false);
    setDecodeError(false);
  }, [src]);

  /** 图片加载失败时复用参考生成态骨架，只把文案替换为可恢复错误提示。 */
  const failureDetails = useMemo(
    () => [modelLabel, truncateGenerationPrompt(prompt)].filter(Boolean).join(' · '),
    [modelLabel, prompt],
  );

  /** 是否还能切到上一张。 */
  const canPrev = images.length > 0 && index > 0;
  /** 是否还能切到下一张。 */
  const canNext = images.length > 0 && index < images.length - 1;

  /** 切到上一张可预览图片。 */
  const onPrev = () => {
    if (canPrev) onIndexChange(index - 1);
  };

  /** 切到下一张可预览图片。 */
  const onNext = () => {
    if (canNext) onIndexChange(index + 1);
  };

  /** 下载当前正在预览的图片附件到本地。 */
  const onDownload = async () => {
    if (!current) return;
    const blob = await getAttachmentBlob(current.id);
    if (!blob) return;
    await downloadBlob(blob, current.name || 'image.png');
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      <div
        className="relative flex-1 min-h-0 overflow-hidden rounded-lg border border-border/70 bg-card/70 shadow-sm"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            onPrev();
          }
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            onNext();
          }
        }}
      >
        {current ? (
          <div className="absolute inset-0 bg-muted/15">
            {(loading || (src && !imgReady && !decodeError)) && (
              <div className="absolute inset-0">
                <PaintGenerationOverlay
                  active={false}
                  prompt={prompt}
                  modelLabel={modelLabel}
                  startedAt={generationStartedAt}
                />
              </div>
            )}

            {error || decodeError ? (
              <div className="h-full w-full flex items-center justify-center bg-muted/30">
                <div className="flex max-w-sm flex-col items-center gap-3 text-center">
                  <div className="relative h-40 w-40 overflow-hidden rounded-xl bg-muted/50">
                    <div className="absolute inset-0 animate-[paint-shimmer_1.8s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-foreground/[0.04] to-transparent" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <ImageIcon className="h-7 w-7 text-muted-foreground/30" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-foreground/70">{t('paint.imageLoadFailed')}</div>
                    {failureDetails ? <div className="max-w-72 truncate text-xs text-muted-foreground">{failureDetails}</div> : null}
                  </div>
                  <Button size="sm" variant="secondary" className="h-8 px-3 rounded-full" onClick={reload}>
                    {t('common.refresh')}
                  </Button>
                </div>
              </div>
            ) : src ? (
              <img
                src={src}
                alt={current.name}
                className={`h-full w-full object-contain transition-opacity duration-200 ${imgReady ? 'opacity-100' : 'opacity-0'}`}
                onLoad={() => setImgReady(true)}
                onError={() => setDecodeError(true)}
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('paint.loadingImage')}
                </div>
              </div>
            )}
          </div>
        ) : (
          <PaintGenerationOverlay
            active={isGenerating}
            prompt={isGenerating ? prompt : t('paint.previewHint')}
            modelLabel={isGenerating ? modelLabel : t('paint.preview')}
            startedAt={generationStartedAt}
          />
        )}

        <div className="absolute top-3 left-3 right-3 grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 pointer-events-none">
          <div className="pointer-events-auto min-w-0">
            {images.length > 0 && (
              <span className="rounded-full border border-border/60 bg-background/80 px-2 py-1 text-[11px] text-muted-foreground shadow-sm">
                {index + 1}/{images.length}
              </span>
            )}
          </div>
          <div className="min-w-0 justify-self-center">
            {isGenerating && current ? (
              <PaintGenerationStatusPill
                prompt={prompt}
                modelLabel={modelLabel}
                startedAt={generationStartedAt}
              />
            ) : null}
          </div>
          <div className="pointer-events-auto flex items-center gap-2">
            <Button variant="secondary" size="sm" className="h-8 px-2 shadow-sm" onClick={onDownload} disabled={!current}>
              {t('paint.download')}
            </Button>
          </div>
        </div>

        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={onPrev}
              disabled={!canPrev}
              className={`absolute left-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full border border-border/60 bg-background/70 backdrop-blur-sm flex items-center justify-center transition-colors ${
                canPrev ? 'hover:bg-accent' : 'opacity-40 cursor-not-allowed'
              }`}
              aria-label={t('common.prev')}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!canNext}
              className={`absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full border border-border/60 bg-background/70 backdrop-blur-sm flex items-center justify-center transition-colors ${
                canNext ? 'hover:bg-accent' : 'opacity-40 cursor-not-allowed'
              }`}
              aria-label={t('common.next')}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}

      </div>

      {images.length > 1 && (
        <ScrollArea
          scrollbars="horizontal"
          scrollbarVisibility="hover"
          wheelBehavior="horizontal"
          className="mt-3"
          viewportClassName="touch-pan-x overscroll-x-contain"
        >
          <div className="flex w-max min-w-full items-center gap-2 pb-2 pr-4">
            {images.map((img, i) => (
              <PaintingStripThumb
                key={img.id}
                image={img}
                selected={i === index}
                onSelect={() => onIndexChange(i)}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
