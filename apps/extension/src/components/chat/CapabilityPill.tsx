/**
 * 说明：`CapabilityPill` 组件模块。
 *
 * 职责：
 * - 承载 `CapabilityPill` 相关的当前文件实现与模块边界；
 * - 对外暴露 `CapabilityPillProps`、`CapabilityPill` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Eye,
  Globe,
  Sparkles,
  Wrench,
  ArrowDownWideNarrow,
  FileCode,
  ImageIcon,
  Layers,
  AudioLines,
  Captions,
  MessageSquareText,
  CircleHelp,
  Video,
  ShieldAlert,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toPresentationToken } from '@/lib/ai/model-type-system';

/** 能力徽标在激活态下的色彩风格。 */
type CapabilityTone = {
  /** 激活态：容器样式 */
  active: string;
  /** 激活态：icon 背景 */
  activeIcon: string;
};

/**
 * 根据能力键返回对应的激活态色板。
 *
 * 说明：
 * - 输入会先做 presentation token 归一化，兼容历史别名；
 * - 未知能力返回 `null`，由调用方回退到默认中性色样式。
 */
function getCapabilityTone(keyRaw: string): CapabilityTone | null {
  const key = toPresentationToken(keyRaw);
  switch (key) {
    case 'all':
      return {
        active:
          'bg-muted/30 border-border/70 text-foreground dark:bg-muted/20 dark:border-border/50',
        activeIcon:
          'bg-background/70 ring-border/50 dark:bg-background/10 dark:ring-border/50',
      };
    case 'vision':
    case 'vision-input':
      return {
        active:
          'bg-emerald-50 border-emerald-200/80 text-emerald-700 dark:bg-emerald-950/35 dark:border-emerald-800/50 dark:text-emerald-200',
        activeIcon:
          'bg-emerald-100/80 ring-emerald-200/70 dark:bg-emerald-900/40 dark:ring-emerald-800/55',
      };
    case 'web':
    case 'native-web-search':
      return {
        active:
          'bg-sky-50 border-sky-200/80 text-sky-700 dark:bg-sky-950/35 dark:border-sky-800/50 dark:text-sky-200',
        activeIcon:
          'bg-sky-100/80 ring-sky-200/70 dark:bg-sky-900/40 dark:ring-sky-800/55',
      };
    case 'reasoning':
      return {
        active:
          'bg-violet-50 border-violet-200/80 text-violet-700 dark:bg-violet-950/35 dark:border-violet-800/50 dark:text-violet-200',
        activeIcon:
          'bg-violet-100/80 ring-violet-200/70 dark:bg-violet-900/40 dark:ring-violet-800/55',
      };
    case 'tool':
    case 'tool-call':
      return {
        active:
          'bg-orange-50 border-orange-200/80 text-orange-700 dark:bg-orange-950/35 dark:border-orange-800/50 dark:text-orange-200',
        activeIcon:
          'bg-orange-100/80 ring-orange-200/70 dark:bg-orange-900/40 dark:ring-orange-800/55',
      };
    case 'image-inline':
    case 'image-output':
      return {
        active:
          'bg-fuchsia-50 border-fuchsia-200/80 text-fuchsia-700 dark:bg-fuchsia-950/35 dark:border-fuchsia-800/50 dark:text-fuchsia-200',
        activeIcon:
          'bg-fuchsia-100/80 ring-fuchsia-200/70 dark:bg-fuchsia-900/40 dark:ring-fuchsia-800/55',
      };
    case 'image':
    case 'image-generation':
      return {
        active:
          'bg-rose-50 border-rose-200/80 text-rose-700 dark:bg-rose-950/35 dark:border-rose-800/50 dark:text-rose-200',
        activeIcon:
          'bg-rose-100/80 ring-rose-200/70 dark:bg-rose-900/40 dark:ring-rose-800/55',
      };
    case 'embedding':
      return {
        active:
          'bg-indigo-50 border-indigo-200/80 text-indigo-700 dark:bg-indigo-950/35 dark:border-indigo-800/50 dark:text-indigo-200',
        activeIcon:
          'bg-indigo-100/80 ring-indigo-200/70 dark:bg-indigo-900/40 dark:ring-indigo-800/55',
      };
    case 'rerank':
      return {
        active:
          'bg-slate-50 border-slate-200/80 text-slate-700 dark:bg-slate-950/35 dark:border-slate-800/50 dark:text-slate-200',
        activeIcon:
          'bg-slate-100/80 ring-slate-200/70 dark:bg-slate-900/40 dark:ring-slate-800/55',
      };
    case 'chat':
      return {
        active:
          'bg-blue-50 border-blue-200/80 text-blue-700 dark:bg-blue-950/35 dark:border-blue-800/50 dark:text-blue-200',
        activeIcon:
          'bg-blue-100/80 ring-blue-200/70 dark:bg-blue-900/40 dark:ring-blue-800/55',
      };
    case 'multimodal-chat':
      return {
        active:
          'bg-teal-50 border-teal-200/80 text-teal-700 dark:bg-teal-950/35 dark:border-teal-800/50 dark:text-teal-200',
        activeIcon:
          'bg-teal-100/80 ring-teal-200/70 dark:bg-teal-900/40 dark:ring-teal-800/55',
      };
    case 'audio-chat':
    case 'audio-input':
    case 'audio-output':
    case 'audio-model':
    case 'speech-generation':
      return {
        active:
          'bg-amber-50 border-amber-200/80 text-amber-700 dark:bg-amber-950/35 dark:border-amber-800/50 dark:text-amber-200',
        activeIcon:
          'bg-amber-100/80 ring-amber-200/70 dark:bg-amber-900/40 dark:ring-amber-800/55',
      };
    case 'transcription':
      return {
        active:
          'bg-cyan-50 border-cyan-200/80 text-cyan-700 dark:bg-cyan-950/35 dark:border-cyan-800/50 dark:text-cyan-200',
        activeIcon:
          'bg-cyan-100/80 ring-cyan-200/70 dark:bg-cyan-900/40 dark:ring-cyan-800/55',
      };
    case 'moderation':
      return {
        active:
          'bg-lime-50 border-lime-200/80 text-lime-700 dark:bg-lime-950/35 dark:border-lime-800/50 dark:text-lime-200',
        activeIcon:
          'bg-lime-100/80 ring-lime-200/70 dark:bg-lime-900/40 dark:ring-lime-800/55',
      };
    case 'file-input':
    case 'structured-output':
      return {
        active:
          'bg-indigo-50 border-indigo-200/80 text-indigo-700 dark:bg-indigo-950/35 dark:border-indigo-800/50 dark:text-indigo-200',
        activeIcon:
          'bg-indigo-100/80 ring-indigo-200/70 dark:bg-indigo-900/40 dark:ring-indigo-800/55',
      };
    case 'video-generation':
      return {
        active:
          'bg-purple-50 border-purple-200/80 text-purple-700 dark:bg-purple-950/35 dark:border-purple-800/50 dark:text-purple-200',
        activeIcon:
          'bg-purple-100/80 ring-purple-200/70 dark:bg-purple-900/40 dark:ring-purple-800/55',
      };
    case 'unknown':
      return {
        active:
          'bg-slate-50 border-slate-200/80 text-slate-700 dark:bg-slate-950/35 dark:border-slate-800/50 dark:text-slate-200',
        activeIcon:
          'bg-slate-100/80 ring-slate-200/70 dark:bg-slate-900/40 dark:ring-slate-800/55',
      };
    default:
      return null;
  }
}

/**
 * 根据能力键选择对应图标。
 *
 * 说明：
 * - 这里的映射服务于统一的能力展示层，而不是底层模型协议判断；
 * - 未知能力返回 `null`，允许上层仅展示文本标签。
 */
function getCapabilityIcon(keyRaw: string): LucideIcon | null {
  const key = toPresentationToken(keyRaw);
  switch (key) {
    case 'all':
      return Layers;
    case 'vision':
    case 'vision-input':
      return Eye;
    case 'web':
    case 'native-web-search':
      return Globe;
    case 'reasoning':
      return Sparkles;
    case 'tool':
    case 'tool-call':
      return Wrench;
    case 'rerank':
      return ArrowDownWideNarrow;
    case 'embedding':
    case 'structured-output':
    case 'file-input':
      return FileCode;
    case 'image-inline':
    case 'image':
    case 'image-generation':
    case 'image-output':
      return ImageIcon;
    case 'chat':
      return MessageSquareText;
    case 'multimodal-chat':
      return Layers;
    case 'audio-chat':
    case 'audio-input':
    case 'audio-output':
    case 'audio-model':
    case 'speech-generation':
      return AudioLines;
    case 'transcription':
      return Captions;
    case 'moderation':
      return ShieldAlert;
    case 'video-generation':
      return Video;
    case 'unknown':
      return CircleHelp;
    default:
      return null;
  }
}

/** Capability pill 支持的尺寸枚举。 */
type PillSize = 'xs' | 'sm' | 'md';

/** 根据 pill 尺寸返回容器与图标的样式类。 */
function sizeClasses(size: PillSize) {
  switch (size) {
    case 'xs':
      return { container: 'h-6 px-2 text-[11px]', iconWrap: 'h-4 w-4', icon: 'h-3 w-3' };
    case 'md':
      return { container: 'h-8 px-3 text-xs', iconWrap: 'h-6 w-6', icon: 'h-3.5 w-3.5' };
    case 'sm':
    default:
      return { container: 'h-7 px-2.5 text-[11px]', iconWrap: 'h-5 w-5', icon: 'h-3.5 w-3.5' };
  }
}

/** Capability pill 组件入参。 */
export type CapabilityPillProps = {
  /** 能力键，例如 `vision`、`reasoning`、`tool-call`。 */
  capability: string;
  /** 展示文案。 */
  label: string;
  /** 仅显示 icon，hover/focus 通过 tooltip 展示 label。 */
  iconOnly?: boolean;
  /** 是否使用激活态样式。 */
  active?: boolean;
  /** 是否处于禁用态。 */
  disabled?: boolean;
  /** 尺寸规格。 */
  size?: PillSize;
  /** tooltip 与 aria-label 的可选覆写文案。 */
  tooltip?: string;
  /** 外层附加样式。 */
  className?: string;
  /**
   * 可选：E2E/自动化测试用的稳定选择器。
   * - 不影响任何业务逻辑
   * - 避免测试去依赖文案/布局导致脆弱
   */
  dataTestId?: string;
  /** 可选点击回调；存在时 pill 会按可交互样式渲染。 */
  onClick?: () => void;
};

/**
 * 模型能力徽标。
 *
 * 说明：
 * - 既可作为纯展示标签，也可作为可点击筛选入口；
 * - iconOnly 模式下会自动退化成紧凑圆形按钮，但仍保留 tooltip 文案。
 */
export function CapabilityPill({
  capability,
  label,
  iconOnly,
  active,
  disabled,
  size = 'sm',
  tooltip,
  className,
  dataTestId,
  onClick,
}: CapabilityPillProps) {
  const isActive = Boolean(active);
  const isDisabled = Boolean(disabled);
  const clickable = typeof onClick === 'function';
  const tone = getCapabilityTone(capability);
  const Icon = getCapabilityIcon(capability);
  const sizes = sizeClasses(size);
  const shouldIconOnly = Boolean(iconOnly) && Boolean(Icon);

  const iconOnlyContainer = size === 'xs' ? 'h-6 w-6' : size === 'md' ? 'h-8 w-8' : 'h-7 w-7';

  const containerClass = cn(
    'inline-flex items-center gap-2 rounded-full border whitespace-nowrap select-none font-medium',
    'transition-[background-color,border-color,color,box-shadow] duration-150',
    shouldIconOnly ? cn(iconOnlyContainer, 'p-0 justify-center') : sizes.container,
    isActive
      ? cn(
          tone?.active ?? 'bg-muted/30 border-border/70 text-foreground dark:bg-muted/20 dark:border-border/50',
        )
      : cn(
          'bg-background border-border/70 text-muted-foreground',
          clickable && !isDisabled ? 'hover:bg-accent/30 hover:text-foreground' : '',
        ),
    clickable ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background' : '',
    clickable && isDisabled ? 'cursor-default' : '',
    className,
  );

  const iconWrapClass = cn(
    'inline-flex items-center justify-center rounded-full ring-1 ring-inset flex-shrink-0',
    sizes.iconWrap,
    isActive
      ? tone?.activeIcon ?? 'bg-background/60 ring-border/50 dark:bg-background/10 dark:ring-border/50'
      : 'bg-muted/30 ring-border/50',
  );

  const tooltipText = (tooltip ?? label) || capability;
  const content = shouldIconOnly ? (
    <>
      {Icon ? <Icon className={sizes.icon} /> : null}
      <span className="sr-only">{label}</span>
    </>
  ) : (
    <>
      {Icon ? (
        <span className={iconWrapClass}>
          <Icon className={sizes.icon} />
        </span>
      ) : null}
      <span className="truncate">{label}</span>
    </>
  );

  if (clickable) {
    const button = (
      <button
        type="button"
        className={containerClass}
        onClick={() => {
          if (isDisabled) return;
          onClick();
        }}
        disabled={isDisabled}
        aria-pressed={isActive}
        aria-disabled={isDisabled}
        aria-label={tooltipText}
        data-testid={dataTestId}
      >
        {content}
      </button>
    );
    if (shouldIconOnly) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p className="text-xs leading-relaxed whitespace-pre-wrap">{tooltipText}</p>
          </TooltipContent>
        </Tooltip>
      );
    }
    return button;
  }

  const pill = (
    <span className={containerClass} aria-label={tooltipText} data-testid={dataTestId}>
      {content}
    </span>
  );
  if (shouldIconOnly) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{pill}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-xs leading-relaxed whitespace-pre-wrap">{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    );
  }
  return pill;
}
