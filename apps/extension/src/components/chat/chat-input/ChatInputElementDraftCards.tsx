/**
 * 说明：`ChatInputElementDraftCards` 组件模块。
 *
 * 职责：
 * - 渲染聊天输入区上方的页面元素引用卡；
 * - 提供删除入口，把 UI 卡片删除动作交回输入区控制器同步隐藏上下文与附件队列；
 *
 * 边界：
 * - 本组件只负责展示和删除回调，不读取附件内容、不修改输入文本。
 */
import { X } from 'lucide-react';
import type { TFunction } from 'i18next';

import { TooltipAction } from '@/components/ui/tooltip-action';
import { buildElementContextRenderedContent } from '@/lib/element-context-draft';
import type { ChatInputElementDraftCard } from './element-draft-markdown';

type ChatInputElementDraftCardsProps = {
  /** 当前输入区内的页面元素引用卡列表。 */
  readonly cards: ChatInputElementDraftCard[];
  /** 删除按钮提示文案。 */
  readonly deleteLabel: string;
  /** 国际化函数。 */
  readonly t: TFunction;
  /** 删除指定引用卡。 */
  readonly onRemove: (draftId: string) => void;
};

/**
 * 导出组件：`ChatInputElementDraftCards`。
 *
 * @param props - 引用卡列表与删除回调。
 * @returns 输入区引用卡列表。
 */
export function ChatInputElementDraftCards({ cards, deleteLabel, t, onRemove }: ChatInputElementDraftCardsProps) {
  if (cards.length === 0) return null;

  return (
    <div className="mb-2 flex flex-col gap-2 px-1">
      {cards.map((card) => {
        const rendered = buildElementContextRenderedContent(card, t);
        return (
          <div
            key={card.id}
            data-testid="chat-input-element-draft-card"
            className="group/draft flex min-w-0 items-start gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 shadow-sm"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-foreground/90">{rendered.title}</div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">{rendered.summary}</div>
              {rendered.sourceLabel ? (
                <div className="mt-0.5 truncate text-[11px] text-muted-foreground/70">{rendered.sourceLabel}</div>
              ) : null}
            </div>
            <TooltipAction tooltip={deleteLabel}>
              <button
                type="button"
                data-testid="chat-input-element-draft-remove"
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground"
                onClick={() => onRemove(card.id)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </TooltipAction>
          </div>
        );
      })}
    </div>
  );
}
