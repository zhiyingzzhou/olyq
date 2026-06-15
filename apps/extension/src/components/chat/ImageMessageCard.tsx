/**
 * 说明：`ImageMessageCard` 组件模块。
 *
 * 职责：
 * - 承载 `ImageMessageCard` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ImageMessageCardItem`、`ImageMessageCardProps`、`ImageMessageCard` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { TooltipAction } from '@/components/ui/tooltip-action';
import { MediaPreviewOverlay } from './MediaPreviewOverlay';

/** 单张图片消息项的展示数据。 */
export type ImageMessageCardItem = {
  /** 图片唯一标识（通常为附件 id） */
  id: string;
  /** ObjectURL 或远端 URL */
  url: string;
  /** 展示名（用于 alt / 预览标题） */
  name: string;
};

/** 图片消息卡片的组件入参。 */
export type ImageMessageCardProps = {
  /** 图片列表（按生成顺序排列） */
  images: ImageMessageCardItem[];
  /** 是否仍在生成/加载图片（用于骨架屏占位） */
  isGenerating: boolean;
  /** 当前选中索引（用于多图切换） */
  index: number;
  /** 切换当前索引 */
  onIndexChange: (next: number) => void;
};

/**
 * 图片消息卡片（聊天页专用）
 *
 * 设计目标：
 * - “图片回复”与“文本回复”使用不同的视觉层级与布局（按当前实现体验）
 * - 多图：支持左右切换 + 底部圆点指示
 * - 生成中：显示统一的骨架占位（避免出现空白气泡）
 *
 * 注意：
 * - 本组件只负责展示与交互；图片的下载/落库由上层负责。
 */
export function ImageMessageCard({ images, isGenerating, index, onIndexChange }: ImageMessageCardProps) {
  const { t } = useTranslation();
  const [previewOpen, setPreviewOpen] = useState(false);

  // 约束：图片消息在聊天里应“左对齐”展示，但宽度不应撑满整列；
  // 这里把宽度限制为一个可读、稳定的范围，避免出现“外层大盒子”带来的视觉偏移。
  const containerClassName = 'inline-block max-w-[min(360px,62vw)]';

  const total = images.length;
  const hasImages = total > 0;

  const safeIndex = useMemo(() => {
    if (total <= 0) return 0;
    const i = Math.floor(index);
    return i >= 0 && i < total ? i : 0;
  }, [index, total]);

  const current = hasImages ? images[safeIndex]! : null;
  const canNav = total > 1;

  /** 在多图场景下按增量切换当前预览索引，并自动做循环回绕。 */
  const go = (delta: number) => {
    if (!canNav) return;
    const next = (safeIndex + delta + total) % total;
    onIndexChange(next);
  };

  // 骨架屏：既用于“生成中”，也用于“附件已写入但 ObjectURL 尚未加载完成”的短暂窗口。
  if (!hasImages) {
    return (
      <div className={containerClassName}>
        <div className="h-[min(260px,36vh)] w-[min(360px,62vw)] max-w-full flex items-center justify-center rounded-2xl bg-muted/10 ring-1 ring-border/50 shadow-sm shadow-black/10 dark:shadow-black/30">
          <div className="flex flex-col items-center gap-3 text-muted-foreground/70">
            <div className="h-12 w-12 rounded-2xl bg-muted/40 border border-border/60 flex items-center justify-center">
              <ImageIcon className="h-6 w-6" />
            </div>
            <div className="text-xs">{isGenerating ? t('chat.imageGenerating') : t('chat.image')}</div>
            {isGenerating && (
              <div className="flex items-center gap-2" aria-label={t('chat.thinking')}>
                <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:-0.2s]" />
                <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:-0.1s]" />
                <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={containerClassName}>
      <div className="relative inline-block max-w-full">
        {/* 图片主体：点击打开预览 */}
        <TooltipAction tooltip={t('chat.imagePreviewTitle')}>
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="inline-block max-w-full cursor-zoom-in"
          >
            <img
              src={current!.url}
              alt={current!.name || t('chat.image')}
              className="block w-auto h-auto max-w-full max-h-[36vh] object-contain object-left rounded-2xl ring-1 ring-border/50 shadow-sm shadow-black/10 dark:shadow-black/30"
              loading="lazy"
            />
          </button>
        </TooltipAction>

        {/* 左右切换：仅多图时显示 */}
        {canNav && (
          <>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background/70 hover:bg-background/90 backdrop-blur border border-border/60"
              onClick={(e) => { e.stopPropagation(); go(-1); }}
              aria-label={t('common.prev')}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background/70 hover:bg-background/90 backdrop-blur border border-border/60"
              onClick={(e) => { e.stopPropagation(); go(1); }}
              aria-label={t('common.next')}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>

      {/* 圆点指示：按当前实现的多图体验 */}
      {canNav && (
        <div className="mt-2 flex items-center gap-1.5">
          {images.map((it, i) => (
            <TooltipAction key={it.id} tooltip={`${i + 1} / ${total}`}>
              <button
                type="button"
                onClick={() => onIndexChange(i)}
                className={[
                  'h-2 w-2 rounded-full transition-colors',
                  i === safeIndex ? 'bg-foreground/70' : 'bg-muted-foreground/30 hover:bg-muted-foreground/50',
                ].join(' ')}
                aria-label={`${i + 1} / ${total}`}
              />
            </TooltipAction>
          ))}
        </div>
      )}

      <MediaPreviewOverlay
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        ariaLabel={current?.name || t('chat.imagePreviewTitle')}
        pagination={total > 1 ? { index: safeIndex + 1, total } : undefined}
      >
        <img
          src={current!.url}
          alt={current!.name || ''}
          className="max-w-[92vw] max-h-[92vh] object-contain rounded-lg shadow-2xl"
        />
      </MediaPreviewOverlay>
    </div>
  );
}
