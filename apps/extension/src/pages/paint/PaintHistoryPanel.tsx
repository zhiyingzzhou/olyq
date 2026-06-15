/**
 * 说明：`PaintHistoryPanel` 页面模块。
 *
 * 职责：
 * - 承载 `PaintHistoryPanel` 相关的当前文件实现与模块边界；
 * - 对外暴露 `PaintHistoryPanel` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { History, ImageIcon, Layers, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TooltipAction } from '@/components/ui/tooltip-action';
import type { Painting } from '@/hooks/usePaintStore';
import { cn } from '@/lib/utils';

/** 绘图历史侧栏属性。 */
interface PaintHistoryPanelProps {
  /** 当前激活的绘图任务 ID。 */
  readonly activeId: string | null;
  /** 全部绘图记录。 */
  readonly paintings: Painting[];
  /** 将模型 ID 转成展示名称。 */
  readonly getModelLabel: (modelId: string) => string;
  /** 删除单个绘图记录。 */
  readonly onDelete: (id: string) => void;
  /** 切换当前激活绘图记录。 */
  readonly onSelect: (id: string) => void;
}

/** 把绘画提示词裁剪成历史行摘要。 */
function summarizePrompt(prompt: string): string {
  const text = prompt.trim().replace(/\s+/g, ' ');
  if (!text) return '';
  return text.length > 42 ? `${text.slice(0, 42)}...` : text;
}

/**
 * 绘图历史侧栏。
 *
 * 展示已有绘图记录，并提供快速切换和删除入口。
 */
export function PaintHistoryPanel({
  activeId,
  paintings,
  getModelLabel,
  onDelete,
  onSelect,
}: PaintHistoryPanelProps) {
  const { t } = useTranslation();

  return (
    <ScrollArea className="h-full" data-testid="paint-history-panel">
      <div className="space-y-3 p-3">
        <div className="flex items-center justify-between px-1">
          <div>
            <div className="text-sm font-semibold">{t('paint.history')}</div>
            <div className="text-[11px] text-muted-foreground">{t('paint.historyCount', { count: paintings.length })}</div>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-border/60 bg-card text-muted-foreground">
            <History className="h-4 w-4" />
          </div>
        </div>

        <div className="space-y-2">
          {paintings.length === 0 && (
            <div className="rounded-lg border border-border/70 bg-card/70 px-4 py-8 text-center">
              <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
                <ImageIcon className="h-4 w-4" />
              </div>
              <div className="text-sm font-medium text-foreground">{t('paint.noResults')}</div>
              <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('paint.empty')}</div>
            </div>
          )}
          {paintings.map((painting) => (
            <div
              key={painting.id}
              className={cn(
                'group relative overflow-hidden rounded-lg border bg-card/70 transition-colors hover:bg-muted/30',
                painting.id === activeId ? 'border-primary/50 shadow-sm' : 'border-border/70',
              )}
            >
              {painting.id === activeId ? <div className="absolute inset-y-0 left-0 w-0.5 bg-primary" /> : null}
              <button
                type="button"
                onClick={() => onSelect(painting.id)}
                aria-current={painting.id === activeId ? 'true' : undefined}
                className="block w-full min-w-0 px-3 py-2.5 pr-10 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <div className="min-w-0 space-y-1.5">
                  <div className="flex min-w-0 items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">{painting.title}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {getModelLabel(painting.model) || t('paint.noModel')}
                      </div>
                    </div>
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {summarizePrompt(painting.prompt) || t('paint.noPromptSummary')}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground">
                      <ImageIcon className="h-3 w-3" />
                      {t('paint.resultCount', { count: painting.outputImages.length })}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground">
                      <Layers className="h-3 w-3" />
                      {t('paint.inputCount', { count: painting.inputImages.length })}
                    </span>
                  </div>
                </div>
              </button>
              <div className="absolute right-2 top-2 opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <TooltipAction tooltip={t('paint.delete')}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onDelete(painting.id);
                    }}
                    aria-label={t('paint.delete')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipAction>
              </div>
            </div>
          ))}
        </div>
      </div>
    </ScrollArea>
  );
}
