/**
 * 说明：`PageContextBarControls` 组件模块。
 *
 * 职责：
 * - 承载页面上下文状态条右侧的模式、操作和自动上下文控制区；
 * - 只消费父组件已经解析好的生效态、禁用态和文案，不再重复读取 browser-context 真源；
 * - 帮助 `PageContextBar` 保持状态汇总与交互控制解耦，避免热点文件继续膨胀。
 *
 * 边界：
 * - 本组件不直接访问 store、runtime API 或 browser-context 门面；
 * - 所有交互回调都由父组件注入，本组件只负责 UI 呈现。
 */
import type { TFunction } from 'i18next';
import { FileText, MoreHorizontal, Palette, RefreshCw } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { HelpTip } from '@/components/ui/help-tip';
import { Switch } from '@/components/ui/switch';
import { Toggle } from '@/components/ui/toggle';
import { TooltipAction } from '@/components/ui/tooltip-action';
import { cn } from '@/lib/utils';

/** `PageContextBarControls` 的 props。 */
interface PageContextBarControlsProps {
  actionChipClassName: string;
  collecting: boolean;
  conversationEnabled: boolean;
  fullPageModeEnabled: boolean;
  fullPagePromptChars: number;
  groupLabelClassName: string;
  masterEnabled: boolean;
  modeChipClassName: string;
  modeDisabled: boolean;
  onRefresh: () => void;
  onToggle: (enabled: boolean) => void;
  onToggleFullPageMode: (enabled: boolean) => void;
  onToggleStyleSignalsMode: (enabled: boolean) => void;
  refreshDisabled: boolean;
  selectedModeChipClassName: string;
  styleSignalsModeEnabled: boolean;
  switchDisabled: boolean;
  t: TFunction;
}

/**
 * 页面上下文状态条右侧控制区。
 *
 * @param props - 由父组件解析完成的显示态与交互回调。
 * @returns 模式、刷新和自动上下文控制按钮组。
 */
export function PageContextBarControls({
  actionChipClassName,
  collecting,
  conversationEnabled,
  fullPageModeEnabled,
  fullPagePromptChars,
  groupLabelClassName,
  masterEnabled,
  modeChipClassName,
  modeDisabled,
  onRefresh,
  onToggle,
  onToggleFullPageMode,
  onToggleStyleSignalsMode,
  refreshDisabled,
  selectedModeChipClassName,
  styleSignalsModeEnabled,
  switchDisabled,
  t,
}: PageContextBarControlsProps) {
  return (
    <div className="page-context-controls-wrap ml-1 flex min-w-max shrink-0 items-center overflow-hidden">
      <div
        className="flex items-center gap-1.5"
        aria-label={t('pageContext.preview')}
        role="group"
        data-testid="page-context-controls"
      >
        <div
          className="page-context-inline-control-group flex items-center gap-1"
          data-testid="page-context-mode-group"
        >
          <span className={groupLabelClassName}>{t('pageContext.group.mode')}</span>
          <TooltipAction tooltip={t('pageContext.fullModeHint', { count: fullPagePromptChars })}>
            <Toggle
              pressed={fullPageModeEnabled}
              onPressedChange={onToggleFullPageMode}
              disabled={modeDisabled}
              variant="default"
              size="sm"
              aria-label={t('pageContext.fullMode')}
              data-testid="page-context-full-mode-toggle"
              className={cn(modeChipClassName, fullPageModeEnabled && selectedModeChipClassName, 'whitespace-nowrap')}
            >
              <FileText className="h-3.5 w-3.5" />
              <span>{t('pageContext.fullModeShort')}</span>
            </Toggle>
          </TooltipAction>

          <TooltipAction tooltip={t('pageContext.styleModeHint')}>
            <Toggle
              pressed={styleSignalsModeEnabled}
              onPressedChange={onToggleStyleSignalsMode}
              disabled={modeDisabled}
              variant="default"
              size="sm"
              aria-label={t('pageContext.styleMode')}
              data-testid="page-context-style-mode-toggle"
              className={cn(modeChipClassName, styleSignalsModeEnabled && selectedModeChipClassName, 'whitespace-nowrap')}
            >
              <Palette className="h-3.5 w-3.5" />
              <span>{t('pageContext.styleModeShort')}</span>
            </Toggle>
          </TooltipAction>
        </div>

        <div
          className="page-context-inline-control-group flex items-center gap-1 border-l border-border/50 pl-2"
          data-testid="page-context-action-group"
        >
          <span className={groupLabelClassName}>{t('pageContext.group.action')}</span>
          <TooltipAction tooltip={t('pageContext.refresh')}>
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshDisabled}
              className={actionChipClassName}
              aria-label={t('pageContext.refresh')}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${collecting ? 'animate-spin' : ''}`} />
              <span>{t('pageContext.refreshShort')}</span>
            </button>
          </TooltipAction>
        </div>

        <DropdownMenu>
          <TooltipAction tooltip={t('pageContext.moreControls')}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn('page-context-compact-controls', actionChipClassName)}
                aria-label={t('pageContext.moreControls')}
                data-testid="page-context-compact-controls-trigger"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
          </TooltipAction>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuCheckboxItem
              checked={fullPageModeEnabled}
              disabled={modeDisabled}
              onCheckedChange={(checked) => onToggleFullPageMode(checked === true)}
              data-testid="page-context-compact-full-mode-toggle"
            >
              <span>{t('pageContext.fullModeShort')}</span>
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={styleSignalsModeEnabled}
              disabled={modeDisabled}
              onCheckedChange={(checked) => onToggleStyleSignalsMode(checked === true)}
              data-testid="page-context-compact-style-mode-toggle"
            >
              <span>{t('pageContext.styleModeShort')}</span>
            </DropdownMenuCheckboxItem>
            <DropdownMenuItem
              disabled={refreshDisabled}
              onSelect={onRefresh}
              data-testid="page-context-compact-refresh"
            >
              <RefreshCw className={`mr-2 h-3.5 w-3.5 ${collecting ? 'animate-spin' : ''}`} />
              <span>{t('pageContext.refreshShort')}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div
          className="flex h-8 items-center gap-2 border-l border-border/50 pl-2 text-[11px] font-medium text-muted-foreground"
          data-testid="page-context-auto-group"
        >
          <span
            className="page-context-auto-label whitespace-nowrap text-[11px] text-muted-foreground/80"
            data-testid="page-context-auto-label"
          >
            {t('pageContext.autoCollection')}
          </span>
          {!masterEnabled ? <HelpTip content={t('pageContext.masterDisabledHint')} side="top" /> : null}
          <Switch
            checked={conversationEnabled}
            onCheckedChange={onToggle}
            disabled={switchDisabled}
            aria-label={t('pageContext.enable')}
            data-testid="page-context-enable-switch"
          />
        </div>
      </div>
    </div>
  );
}
