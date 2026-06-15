/**
 * 说明：`PaintImageThumb` 页面模块。
 *
 * 职责：
 * - 承载 `PaintImageThumb` 相关的当前文件实现与模块边界；
 * - 对外暴露 `PaintImageThumb` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAttachmentObjectUrl } from '@/hooks/useAttachmentObjectUrl';
import type { PaintingImageRef } from '@/hooks/usePaintStore';
import { downloadBlob } from '@/lib/export/download';
import { getAttachmentBlob } from '@/lib/attachments';

/** 绘图图片缩略卡片属性。 */
interface PaintImageThumbProps {
  /** 图片附件引用。 */
  readonly image: PaintingImageRef;
}

/**
 * 绘图输入/输出图片缩略卡片。
 *
 * 负责把附件引用解析为可展示 URL，并提供下载入口。
 */
export function PaintImageThumb({ image }: PaintImageThumbProps) {
  const { t } = useTranslation();
  const { url, loading, error, reload } = useAttachmentObjectUrl(image.id);
  /** 浏览器图片元素是否已经成功解码并可见。 */
  const [imgReady, setImgReady] = useState(false);
  /** 当前 URL 是否在 `\<img\>` 解码阶段失败。 */
  const [decodeError, setDecodeError] = useState(false);

  useEffect(() => {
    setImgReady(false);
    setDecodeError(false);
  }, [url]);

  /** 下载当前图片原始附件。 */
  const onDownload = async () => {
    const blob = await getAttachmentBlob(image.id);
    if (!blob) return;
    await downloadBlob(blob, image.name || 'image.png');
  };

  /** 只要附件还在取流，或图片尚未完成解码，就继续显示骨架。 */
  const showSkeleton = loading || (Boolean(url) && !imgReady && !decodeError);

  return (
    <div className="group relative rounded-xl overflow-hidden border border-border bg-card">
      <div className="aspect-square bg-muted/30 flex items-center justify-center relative overflow-hidden">
        {showSkeleton && <Skeleton className="absolute inset-0 rounded-none" />}

        {error || decodeError ? (
          <div className="relative z-10 flex items-center gap-2 text-xs text-muted-foreground">
            <span>{t('paint.imageLoadFailed')}</span>
            <Button size="sm" variant="secondary" className="h-7 px-2" onClick={reload}>
              {t('common.refresh')}
            </Button>
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
          <div className="relative z-10 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t('paint.loadingImage')}
          </div>
        )}
      </div>
      <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] text-white/90 truncate">{image.name}</div>
          <Button size="sm" variant="secondary" className="h-7 px-2" onClick={onDownload}>
            {t('paint.download')}
          </Button>
        </div>
      </div>
    </div>
  );
}
