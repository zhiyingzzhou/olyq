/**
 * 说明：`PageToolsDisabledSitesList` 组件模块。
 *
 * 职责：
 * - 承载网页工具站点禁用列表的搜索、固定高度内部滚动和虚拟化渲染；
 * - 保持设置页主面板只负责 page-tools 开关与持久化动作编排；
 *
 * 边界：
 * - 本组件不直接读写 `olyq.page-tools.v1`，只消费父层传入的禁用 origin 与恢复回调；
 * - 搜索词只属于当前组件生命周期，不进入共享配置或持久化存储。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { RotateCcw, Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TooltipAction } from '@/components/ui/tooltip-action';

const PAGE_TOOLS_DISABLED_SITE_ROW_HEIGHT_PX = 56;

interface PageToolsDisabledSitesListProps {
  /** 已按 page-tools 真源归一化后的精确 `http/https origin` 列表。 */
  readonly origins: readonly string[];
  /** 恢复按钮忙碌态；为 true 时禁止逐项恢复。 */
  readonly busy: boolean;
  /** 用户点击恢复指定 origin 时触发。 */
  readonly onRestoreSite: (origin: string) => void;
}

/** 网页工具站点级禁用列表，带本地搜索和内部虚拟滚动。 */
export function PageToolsDisabledSitesList({
  origins,
  busy,
  onRestoreSite,
}: PageToolsDisabledSitesListProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const searchTerm = search.trim().toLowerCase();
  const filteredOrigins = useMemo(() => {
    if (!searchTerm) return origins;
    return origins.filter((origin) => origin.toLowerCase().includes(searchTerm));
  }, [origins, searchTerm]);
  const rowVirtualizer = useVirtualizer({
    count: filteredOrigins.length,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => PAGE_TOOLS_DISABLED_SITE_ROW_HEIGHT_PX,
    overscan: 6,
    getItemKey: (index) => filteredOrigins[index] ?? index,
    initialRect: {
      width: 0,
      height: 320,
    },
  });
  const virtualItems = rowVirtualizer.getVirtualItems();
  const summary = searchTerm
    ? t('sitePermissionsPanel.pageTools.disabledSitesMatchCount', {
      count: filteredOrigins.length,
      total: origins.length,
    })
    : t('sitePermissionsPanel.pageTools.disabledSitesCount', { count: origins.length });

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollTop = 0;
    rowVirtualizer.measure();
  }, [filteredOrigins.length, rowVirtualizer, searchTerm]);

  if (origins.length < 1) {
    return <div className="text-xs text-muted-foreground">{t('sitePermissionsPanel.pageTools.noDisabledSites')}</div>;
  }

  return (
    <div className="space-y-2.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && search) {
                event.preventDefault();
                setSearch('');
              }
            }}
            placeholder={t('sitePermissionsPanel.pageTools.disabledSitesSearchPlaceholder')}
            aria-label={t('sitePermissionsPanel.pageTools.disabledSitesSearchLabel')}
            className="h-8 pl-8 pr-8 text-xs"
          />
          {search ? (
            <TooltipAction tooltip={t('common.clear')}>
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </TooltipAction>
          ) : null}
        </div>
        <div aria-live="polite" className="shrink-0 text-xs text-muted-foreground">
          {summary}
        </div>
      </div>
      <div
        ref={viewportRef}
        data-testid="page-tools-disabled-sites-viewport"
        className="h-[min(20rem,42vh)] min-h-[12rem] overflow-y-auto rounded-lg border border-border/60 bg-background/40 p-2 [scrollbar-gutter:stable]"
        role="list"
      >
        {filteredOrigins.length < 1 ? (
          <div className="flex h-full min-h-[10rem] items-center justify-center px-4 text-center text-xs text-muted-foreground">
            {t('sitePermissionsPanel.pageTools.noDisabledSitesMatch')}
          </div>
        ) : (
          <div className="relative" style={{ height: rowVirtualizer.getTotalSize() }}>
            {virtualItems.map((virtualItem) => {
              const origin = filteredOrigins[virtualItem.index];
              if (!origin) return null;
              return (
                <div
                  key={virtualItem.key}
                  role="listitem"
                  aria-setsize={filteredOrigins.length}
                  aria-posinset={virtualItem.index + 1}
                  className="absolute left-0 top-0 box-border w-full pb-2"
                  style={{
                    height: `${PAGE_TOOLS_DISABLED_SITE_ROW_HEIGHT_PX}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <div className="flex h-full items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/80 px-3 py-2 transition-colors hover:border-border hover:bg-accent/30 focus-within:border-ring/30">
                    <span className="min-w-0 truncate font-mono text-xs text-foreground/85">{origin}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 shrink-0"
                      onClick={() => onRestoreSite(origin)}
                      disabled={busy}
                      aria-label={t('sitePermissionsPanel.pageTools.restoreSiteAriaLabel', { origin })}
                    >
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                      {t('sitePermissionsPanel.pageTools.restoreSite')}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
