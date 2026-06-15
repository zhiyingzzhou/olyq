/**
 * 说明：`AssistantBuiltinPresetCard` 组件模块。
 *
 * 职责：
 * - 承载内置助手卡片的共享壳体；
 * - 统一浏览器场景与通用助手在助手商店 / 轻量选择弹窗里的视觉结构；
 * - 收口图标、标题、说明、chip 与动作提示的样式契约。
 *
 * 边界：
 * - 本组件不推导浏览器 profile badge，也不决定默认助手 featured 逻辑；
 * - 只负责共享展示壳体，不拥有弹窗级交互状态。
 */
import { ArrowRight } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AssistantPreset } from '@/types/assistant';

import { AssistantIcon } from './AssistantIcon';

/** 内置助手共享卡片入参。 */
export interface AssistantBuiltinPresetCardProps {
  /** 当前内置助手预设。 */
  preset: AssistantPreset;
  /** 卡片底部动作文案。 */
  actionLabel: string;
  /** 点击卡片后的上层回调。 */
  onClick: (presetId: string) => void;
  /** 当前是否作为 featured 卡使用。 */
  featured?: boolean;
  /** 是否需要把卡片拉满当前虚拟行高度。 */
  stretchToRow?: boolean;
  /** 标题上方的强调徽章。 */
  featuredBadge?: string;
  /** 标题下方展示的辅助 badges。 */
  metaBadges?: string[];
}

/**
 * 内置助手共享卡片壳体。
 *
 * @remarks
 * 这里采用设置页同款半径、边框和紧凑密度，
 * 避免完整商店与轻量选择弹窗再次漂成两套视觉体系。
 */
export function AssistantBuiltinPresetCard({
  preset,
  actionLabel,
  onClick,
  featured = false,
  stretchToRow = false,
  featuredBadge,
  metaBadges = [],
}: AssistantBuiltinPresetCardProps) {
  const visibleMetaBadges = metaBadges.slice(0, featured ? 3 : 2);
  const visibleFeaturedBadge = featuredBadge && featuredBadge !== preset.name ? featuredBadge : null;

  return (
    <button
      type="button"
      className={cn(
        'group flex w-full rounded-lg border border-border/70 bg-card px-3 py-2.5 text-left transition-[border-color,background-color,box-shadow] hover:border-border hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        stretchToRow ? 'h-full' : '',
        featured ? 'min-h-[84px]' : 'min-h-[76px]',
      )}
      onClick={() => onClick(preset.id)}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <AssistantIcon
          iconId={preset.iconId}
          className={cn(
            'mt-0.5 flex-shrink-0 rounded-md border border-border/60 bg-muted/20',
            featured ? 'h-9 w-9' : 'h-8 w-8',
          )}
          size={featured ? 20 : 18}
          iconClassName="h-4 w-4"
        />

        <div className="min-w-0 flex flex-1 items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <div
                className="min-w-0 line-clamp-1 text-sm font-semibold tracking-tight text-foreground"
              >
                {preset.name}
              </div>

              {visibleFeaturedBadge || visibleMetaBadges.length > 0 ? (
                <div className="flex min-w-0 flex-wrap gap-1">
                  {visibleFeaturedBadge ? (
                    <Badge
                      variant="secondary"
                      className="h-5 max-w-[9rem] truncate border border-primary/15 bg-primary/10 px-1.5 py-0 text-[10px] font-medium text-foreground"
                    >
                      {visibleFeaturedBadge}
                    </Badge>
                  ) : null}
                  {visibleMetaBadges.map((badge) => (
                    <Badge
                      key={`${preset.id}-${badge}`}
                      variant="secondary"
                      className="h-5 max-w-[9rem] truncate border border-border/50 bg-muted/40 px-1.5 py-0 text-[10px] font-medium text-foreground/80"
                    >
                      {badge}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>

            {preset.description ? (
              <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                {preset.description}
              </div>
            ) : null}
          </div>

          <ArrowRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground transition-[color,transform] duration-200 group-hover:translate-x-0.5 group-hover:text-foreground" />
        </div>
      </div>
      <span className="sr-only">{actionLabel}</span>
    </button>
  );
}
