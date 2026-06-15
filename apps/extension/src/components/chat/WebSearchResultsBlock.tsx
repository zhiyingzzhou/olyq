/**
 * 说明：`WebSearchResultsBlock` 组件模块。
 *
 * 职责：
 * - 承载 `WebSearchResultsBlock` 相关的当前文件实现与模块边界；
 * - 对外暴露 `WebSearchResultsBlock` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useState } from 'react';
import { ChevronDown, Globe, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { WebSearchProviderIcon } from '@/components/icons/webSearchProviders';
import { InlineNotice } from '@/components/ui/inline-notice';
import { cn } from '@/lib/utils';
import { formatI18nText } from '@/lib/i18n/format';
import type { I18nText } from '@/types/i18n';

/** 单条联网搜索结果。 */
interface WebSearchResult {
  /** 结果标题。 */
  title: string;
  /** 结果目标地址。 */
  url: string;
  /** 结果摘要片段。 */
  snippet: string;
}

/** 联网搜索结果块入参。 */
interface Props {
  /** 当前返回的搜索结果列表。 */
  results: WebSearchResult[];
  /** 当前是否仍在搜索中。 */
  isSearching: boolean;
  /** 本次使用的联网搜索 Provider ID。 */
  providerId?: string;
  /** 本次查询词。 */
  query?: string;
  /** 搜索失败时的错误文案。 */
  error?: I18nText;
}

/**
 * 联网搜索状态 + 结果展示块（仿 ThinkingBlock 折叠风格）。
 * - isSearching=true：脉冲动画 + "正在搜索..."
 * - isSearching=false + 有结果：折叠/展开搜索结果列表
 * - isSearching=false + 无结果：不渲染（搜索未启用或未返回结果）
 */
export function WebSearchResultsBlock({ results, isSearching, providerId, query, error }: Props) {
  const { t } = useTranslation();
  /** 搜索结果详情区是否展开。 */
  const [expanded, setExpanded] = useState(false);

  if (isSearching) {
    return (
      <div className="mb-2 rounded-xl border border-border/50 bg-muted/20 px-3 py-2 shadow-none">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Globe className="h-3.5 w-3.5 animate-pulse text-primary" />
          <span className="animate-pulse">{t('webSearch.results.searching')}</span>
          <div className="flex-1" />
          {providerId ? <WebSearchProviderIcon pid={providerId} className="h-3.5 w-3.5 opacity-70" /> : null}
        </div>
        {query ? (
          <div className="mt-1 text-[11px] text-muted-foreground/80 truncate">
            {query}
          </div>
        ) : null}
      </div>
    );
  }

  const err = error ? formatI18nText(t, error).trim() : '';
  const hasError = Boolean(err);
  const hasResults = Array.isArray(results) && results.length > 0;
  const hasMeta = Boolean((providerId && providerId.trim()) || (query && query.trim()));
  if (!hasResults && !hasError && !hasMeta) return null;

  return (
    <div className="mb-2 overflow-hidden rounded-xl border border-border/50 bg-muted/20 shadow-none">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-xs text-muted-foreground hover:bg-accent/30 hover:text-foreground transition-colors"
      >
        {providerId ? (
          <WebSearchProviderIcon pid={providerId} className="h-3.5 w-3.5 text-primary" />
        ) : (
          <Globe className="h-3.5 w-3.5 text-primary" />
        )}
        <span className="font-medium">
          {hasError ? t('webSearch.results.failed') : t('webSearch.results.summary', { count: results.length })}
        </span>
        <ChevronDown
          className={cn(
            'ml-auto h-3.5 w-3.5 transition-transform duration-200',
            expanded ? 'rotate-180' : '',
          )}
        />
      </button>

      {expanded && (
        <div className="border-t border-border/40">
          {query ? (
            <div className="px-3 py-2 text-[11px] text-muted-foreground/80 truncate">
              {query}
            </div>
          ) : null}

          {hasError && (
            <InlineNotice
              icon={AlertTriangle}
              iconSize="xs"
              tone="destructive"
              align="start"
              surface="bare"
              className="px-3 py-2 text-xs"
              bodyClassName="break-words leading-relaxed"
            >
              {err}
            </InlineNotice>
          )}

          {hasResults && (
            <div className="divide-y divide-border/40">
              {results.map((r, i) => (
                <div key={i} className="px-3 py-2">
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-primary hover:underline line-clamp-1 block"
                  >
                    {r.title || r.url}
                  </a>
                  {r.snippet && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{r.snippet}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {!hasError && !hasResults && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              {t('webSearch.results.noResults')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
