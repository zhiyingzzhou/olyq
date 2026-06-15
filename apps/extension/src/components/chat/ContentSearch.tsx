/**
 * 说明：`ContentSearch` 组件模块。
 *
 * 职责：
 * - 承载 `ContentSearch` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ContentSearch` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Search, User, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { TooltipAction } from '@/components/ui/tooltip-action';

/** 聊天内容搜索面板属性。 */
interface ContentSearchProps {
  /** 是否打开搜索面板。 */
  readonly open: boolean;
  /** 当前搜索词。 */
  readonly query: string;
  /** 是否把用户消息也纳入搜索范围。 */
  readonly includeUser: boolean;
  /** 当前是否启用大小写敏感。 */
  readonly caseSensitive: boolean;
  /** 当前运行环境是否支持大小写敏感搜索。 */
  readonly canCaseSensitive: boolean;
  /** 当前是否启用全词匹配。 */
  readonly wholeWord: boolean;
  /** 当前运行环境是否支持全词匹配。 */
  readonly canWholeWord: boolean;
  /** 当前命中的总结果数。 */
  readonly total: number;
  /** 当前高亮结果索引。 */
  readonly activeIndex: number;
  /** 更新搜索词。 */
  readonly onChangeQuery: (v: string) => void;
  /** 切换是否包含用户消息。 */
  readonly onToggleIncludeUser: (v: boolean) => void;
  /** 切换大小写敏感。 */
  readonly onToggleCaseSensitive: (v: boolean) => void;
  /** 切换全词匹配。 */
  readonly onToggleWholeWord: (v: boolean) => void;
  /** 跳转到上一个匹配项。 */
  readonly onPrev: () => void;
  /** 跳转到下一个匹配项。 */
  readonly onNext: () => void;
  /** 关闭搜索面板。 */
  readonly onClose: () => void;
}

/**
 * 聊天内容搜索浮层。
 *
 * 提供输入、结果导航和匹配范围切换三类交互。
 * 搜索计算本身由外层控制器完成，这里只负责 UI 和快捷键承接。
 */
export function ContentSearch({
  open,
  query,
  includeUser,
  caseSensitive,
  canCaseSensitive,
  wholeWord,
  canWholeWord,
  total,
  activeIndex,
  onChangeQuery,
  onToggleIncludeUser,
  onToggleCaseSensitive,
  onToggleWholeWord,
  onPrev,
  onNext,
  onClose,
}: ContentSearchProps) {
  const { t } = useTranslation();
  /** 搜索输入框引用，用于打开面板后自动聚焦。 */
  const inputRef = useRef<HTMLInputElement | null>(null);
  /** 面板根节点引用，用于点击外部关闭。 */
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    /**
     * 监听面板外部点击并关闭搜索浮层。
     *
     * 说明：
     * - 使用捕获阶段监听，避免点击事件被内部组件阻止后漏掉关闭动作；
     * - 只有真正点到浮层外部时才关闭，不影响面板内的输入与筛选操作。
     */
    const onDown = (e: PointerEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (e.target && el.contains(e.target as Node)) return;
      onClose();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      ref={rootRef}
      className="pointer-events-auto w-[560px] max-w-[92vw] rounded-xl border border-border/60 bg-background/80 backdrop-blur-md shadow-lg"
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => onChangeQuery(e.target.value)}
          placeholder={t('search.inChat')}
          onKeyDown={(e) => {
            // Enter / Shift+Enter 直接复用上下匹配导航，避免再点按钮。
            if (e.key === 'Enter') {
              e.preventDefault();
              if (e.shiftKey) onPrev();
              else onNext();
            }
          }}
          className="h-8 text-sm bg-transparent border-0 focus-visible:ring-0 px-0"
        />
        <div className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
          {total > 0 ? `${Math.min(total, Math.max(1, activeIndex + 1))}/${total}` : `0/0`}
        </div>
        <TooltipAction tooltip={t('search.prev')}>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onPrev} disabled={total <= 0}>
            <ChevronUp className="h-4 w-4" />
          </Button>
        </TooltipAction>
        <TooltipAction tooltip={t('search.next')}>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onNext} disabled={total <= 0}>
            <ChevronDown className="h-4 w-4" />
          </Button>
        </TooltipAction>
        <TooltipAction tooltip={t('common.close')}>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </TooltipAction>
      </div>

      <div className="flex items-center justify-between gap-3 px-3 pb-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <User className="h-3.5 w-3.5" />
          <span>{t('search.includeUser')}</span>
        </div>
        <div className="flex items-center gap-2">
          <TooltipAction tooltip={t('search.caseSensitive')}>
            <Button
              size="sm"
              variant={caseSensitive ? 'secondary' : 'ghost'}
              className="h-7 px-2 text-[11px] font-mono"
              onClick={() => {
                onToggleCaseSensitive(!caseSensitive);
                queueMicrotask(() => inputRef.current?.focus());
              }}
              disabled={!canCaseSensitive}
            >
              Aa
            </Button>
          </TooltipAction>
          <TooltipAction tooltip={t('search.wholeWord')}>
            <Button
              size="sm"
              variant={wholeWord ? 'secondary' : 'ghost'}
              className="h-7 px-2 text-[11px] font-mono"
              onClick={() => {
                onToggleWholeWord(!wholeWord);
                queueMicrotask(() => inputRef.current?.focus());
              }}
              disabled={!canWholeWord}
            >
              W
            </Button>
          </TooltipAction>
          <Switch
            checked={includeUser}
            onCheckedChange={(v) => {
              onToggleIncludeUser(v);
              queueMicrotask(() => inputRef.current?.focus());
            }}
          />
        </div>
      </div>
    </div>
  );
}
