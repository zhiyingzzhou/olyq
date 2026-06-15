/**
 * 说明：`PaintHeader` 页面模块。
 *
 * 职责：
 * - 承载 `PaintHeader` 相关的当前文件实现与模块边界；
 * - 对外暴露 `PaintHeader` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { ArrowLeft, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { TooltipAction } from '@/components/ui/tooltip-action';

/** 绘图页头部属性。 */
interface PaintHeaderProps {
  /** 当前 Paint 工作台布局模式。 */
  readonly layoutMode: 'compact' | 'expanded';
  /** 左侧设置栏当前是否折叠。 */
  readonly leftCollapsed: boolean;
  /** 右侧历史栏当前是否折叠。 */
  readonly rightCollapsed: boolean;
  /** 返回聊天主页。 */
  readonly onBack: () => void;
  /** 新建绘图任务。 */
  readonly onCreate: () => void;
  /** 切换左侧设置栏显隐。 */
  readonly onToggleLeftPanel: () => void;
  /** 切换右侧历史栏显隐。 */
  readonly onToggleRightPanel: () => void;
}

/**
 * 绘图页头部。
 *
 * 负责页面级导航、新建任务以及左右侧栏折叠控制。
 */
export function PaintHeader({
  layoutMode,
  leftCollapsed,
  rightCollapsed,
  onBack,
  onCreate,
  onToggleLeftPanel,
  onToggleRightPanel,
}: PaintHeaderProps) {
  const { t } = useTranslation();

  return (
    <div className="h-12 flex items-center justify-between gap-2 px-3 border-b border-border/60 bg-sidebar">
      <div className="flex items-center gap-2 min-w-0">
        <Button variant="ghost" size="sm" className="gap-2" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          {t('paint.backToChat')}
        </Button>
        <div className="hidden sm:block min-w-0">
          <div className="text-sm font-semibold truncate">{t('paint.title')}</div>
          <div className="text-[11px] text-muted-foreground truncate">{t('paint.subtitle')}</div>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <TooltipAction tooltip={t('paint.toggleSettings')}>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={onToggleLeftPanel}
            aria-label={t('paint.toggleSettings')}
            aria-expanded={layoutMode === 'compact' ? !leftCollapsed : undefined}
            data-testid="paint-toggle-settings"
          >
            {leftCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </TooltipAction>
        <TooltipAction tooltip={t('paint.toggleHistory')}>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={onToggleRightPanel}
            aria-label={t('paint.toggleHistory')}
            aria-expanded={layoutMode === 'compact' ? !rightCollapsed : undefined}
            data-testid="paint-toggle-history"
          >
            {rightCollapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
          </Button>
        </TooltipAction>
        <Button size="sm" onClick={onCreate}>
          {t('paint.new')}
        </Button>
      </div>
    </div>
  );
}
