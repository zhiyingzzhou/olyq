/**
 * 说明：`TopicPanel.settings-layout` 组件模块。
 *
 * 职责：
 * - 承载话题设置弹窗内部的普通设置行布局；
 * - 让 `TopicPanel` 保持业务草稿与保存逻辑聚焦，不继续膨胀视图样式代码。
 *
 * 边界：
 * - 本文件只提供无状态布局组件，不读写 store、不处理保存语义。
 */
import { type ReactNode } from 'react';
import { ChevronsUpDown } from 'lucide-react';

import { Label } from '@/components/ui/label';
import { ProviderIcon } from '@/components/ui/ProviderIcon';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

/** 设置页控件统一使用内收焦点描边，避免 dialog 边缘裁切外扩 ring。 */
export const PANEL_CONTROL_FOCUS_CLASS_NAME =
  'focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring focus-visible:ring-offset-0';

interface SettingSectionProps {
  /** 分组标题。 */
  title: string;
  /** 分组说明。 */
  description?: string;
  /** 分组内容。 */
  children: ReactNode;
  /** 测试标识。 */
  testId?: string;
}

interface SettingLeadProps {
  /** 设置项标题。 */
  title: string;
  /** 设置项说明。 */
  description?: ReactNode;
}

interface SettingRowProps extends SettingLeadProps {
  /** 右侧或下方控件。 */
  children: ReactNode;
  /** 大文本类控件使用单列布局。 */
  stacked?: boolean;
  /** 设置项根节点样式。 */
  className?: string;
  /** 控件容器样式。 */
  contentClassName?: string;
  /** 测试标识。 */
  testId?: string;
}

interface TopicModelPickerButtonProps {
  /** 当前模型显示名称。 */
  modelLabel: string;
  /** 当前完整模型 ID。 */
  modelId: string;
  /** Provider ID。 */
  providerId: string;
  /** Provider logo。 */
  providerLogo?: string;
  /** Provider fallback 图标。 */
  fallbackIcon?: string;
  /** Provider fallback 色值。 */
  fallbackColor?: string;
  /** 打开模型选择器。 */
  onSelect: () => void;
}

interface SliderSettingRowProps {
  /** 设置项标题。 */
  title: string;
  /** 设置项说明。 */
  description: string;
  /** 当前值。 */
  value: number;
  /** 右上角展示值。 */
  displayValue: string;
  /** 最小值。 */
  min: number;
  /** 最大值。 */
  max: number;
  /** 步进。 */
  step: number;
  /** 变化回调。 */
  onChange: (value: number) => void;
}

/** 话题设置分组：不画外层卡片，只用标题和行分隔线承载信息层级。 */
export function SettingSection({ title, description, children, testId }: SettingSectionProps) {
  return (
    <section data-testid={testId} className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        {description ? (
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="divide-y divide-border/70 border-t border-border/70">
        {children}
      </div>
    </section>
  );
}

/** 设置项左侧说明。 */
function SettingLead({ title, description }: SettingLeadProps) {
  return (
    <div className="min-w-0">
      <Label className="text-sm">{title}</Label>
      {description ? (
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

/** 普通设置行。 */
export function SettingRow({
  title,
  description,
  children,
  stacked,
  className,
  contentClassName,
  testId,
}: SettingRowProps) {
  if (stacked) {
    return (
      <div data-testid={testId} className={cn('space-y-2 py-4', className)}>
        <SettingLead title={title} description={description} />
        <div className={contentClassName}>{children}</div>
      </div>
    );
  }

  return (
    <div
      data-testid={testId}
      className={cn(
        'grid grid-cols-1 gap-3 py-4',
        'sm:grid-cols-[minmax(0,1fr)_minmax(220px,320px)] sm:items-center',
        className,
      )}
    >
      <SettingLead title={title} description={description} />
      <div className={cn('min-w-0 sm:justify-self-end sm:w-full', contentClassName)}>
        {children}
      </div>
    </div>
  );
}

/** 小型模型选择控件。 */
export function TopicModelPickerButton({
  modelLabel,
  modelId,
  providerId,
  providerLogo,
  fallbackIcon,
  fallbackColor,
  onSelect,
}: TopicModelPickerButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'flex h-8 min-w-0 w-full items-center justify-between gap-2 rounded-md border border-input',
        'bg-background px-3 text-left text-xs transition-colors',
        'hover:bg-accent hover:text-accent-foreground',
        'focus-visible:outline-none',
        PANEL_CONTROL_FOCUS_CLASS_NAME,
      )}
      onClick={onSelect}
      data-testid="topic-settings-model-trigger"
    >
      <span className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        <ProviderIcon
          providerId={providerId}
          customLogo={providerLogo}
          fallbackIcon={fallbackIcon}
          fallbackColor={fallbackColor}
          size="xs"
        />
        <span className="min-w-0 flex-1 truncate text-foreground">{modelLabel}</span>
        <span className="sr-only">{modelId}</span>
      </span>
      <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
    </button>
  );
}

/** 带数值展示的滑杆设置行。 */
export function SliderSettingRow({
  title,
  description,
  value,
  displayValue,
  min,
  max,
  step,
  onChange,
}: SliderSettingRowProps) {
  return (
    <SettingRow title={title} description={description}>
      <div className="grid gap-2">
        <div className="text-right text-xs tabular-nums text-muted-foreground">{displayValue}</div>
        <Slider
          value={[value]}
          min={min}
          max={max}
          step={step}
          onValueChange={(nextValue) => onChange(nextValue[0] ?? value)}
          aria-label={title}
        />
      </div>
    </SettingRow>
  );
}
