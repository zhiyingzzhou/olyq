/**
 * 说明：`PreviewableImage` 组件模块。
 *
 * 职责：
 * - 承载 `PreviewableImage` 相关的当前文件实现与模块边界；
 * - 对外暴露 `PreviewableImageProps`、`PreviewableImage` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { ZoomIn } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MediaPreviewOverlay } from './MediaPreviewOverlay';

/**
 * 可预览图片组件的入参。
 *
 * 说明：
 * - 该组件专门服务于聊天消息里的图片缩略图与全屏预览；
 * - props 保持极简，避免把预览层内部状态暴露给调用方。
 */
export type PreviewableImageProps = {
  /** 图片资源地址。既用于缩略图，也用于全屏预览。 */
  readonly src: string;
  /** 图片替代文本，同时会作为预览对话框标题语义来源。 */
  readonly alt?: string;
  /** 缩略图样式类名；未传时使用默认圆角卡片样式。 */
  readonly className?: string;
};

/**
 * 可点击放大的聊天图片组件。
 *
 * 职责：
 * - 渲染消息中的缩略图；
 * - 处理图片加载失败兜底；
 * - 点击后复用 `MediaPreviewOverlay` 提供统一的缩放/旋转预览体验。
 */
export const PreviewableImage = memo(function PreviewableImage({ src, alt, className }: PreviewableImageProps) {
  const { t } = useTranslation();
  /** 当前是否展示全屏预览层。 */
  const [open, setOpen] = useState(false);
  /** 原图或缩略图加载失败后切换到文本兜底态。 */
  const [loadError, setLoadError] = useState(false);

  if (loadError) {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground italic">
        [{t('chat.imageLoadFailed', { name: alt || src })}]
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        className="relative group/img cursor-pointer inline-block"
        onClick={() => setOpen(true)}
      >
        <img
          src={src}
          alt={alt || t('chat.image')}
          onError={() => setLoadError(true)}
          className={className || 'h-20 w-20 rounded-lg object-cover border border-border/60'}
          loading="lazy"
        />
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover/img:bg-black/20 rounded-lg transition-colors">
          <ZoomIn className="h-4 w-4 text-white opacity-0 group-hover/img:opacity-80 transition-opacity" />
        </span>
      </button>

      <MediaPreviewOverlay
        open={open}
        onClose={() => setOpen(false)}
        ariaLabel={alt || t('chat.imagePreviewTitle')}
      >
        <img
          src={src}
          alt={alt || ''}
          className="max-w-[92vw] max-h-[92vh] object-contain rounded-lg shadow-2xl"
        />
      </MediaPreviewOverlay>
    </>
  );
});
