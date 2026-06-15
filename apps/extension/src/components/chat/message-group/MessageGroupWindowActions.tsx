/**
 * 说明：`MessageGroupWindowActions` 组件模块。
 *
 * 职责：
 * - 承载多模型 compare 的窗口级动作按钮组；
 * - 统一 inline / fullscreen 两种承载壳体里的 fullscreen 入口。
 *
 * 边界：
 * - 本文件只负责 compare 展示壳体动作，不处理布局切换、删除、提及模型或内容渲染。
 */
import { Expand, Shrink } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { TooltipAction } from '@/components/ui/tooltip-action';

/** `MessageGroupWindowActions` 入参。 */
interface MessageGroupWindowActionsProps {
  /** 当前是否处于 fullscreen compare 工作区。 */
  readonly isFullscreen: boolean;
  /** 进入 fullscreen compare。 */
  readonly onOpenFullscreen?: () => void;
  /** 退出 fullscreen compare。 */
  readonly onCloseFullscreen?: () => void;
}

/**
 * 导出组件：`MessageGroupWindowActions`。
 *
 * @remarks
 * 把 compare 工作区相关按钮从 `MessageGroupLayout` 主体里拆出来，
 * 既收敛行数，也确保 inline / fullscreen 使用完全一致的视觉契约。
 */
export function MessageGroupWindowActions({
  isFullscreen,
  onOpenFullscreen,
  onCloseFullscreen,
}: MessageGroupWindowActionsProps) {
  const { t } = useTranslation();
  const windowActionButtonClassName = 'h-7 w-7 rounded-xl border-0 bg-transparent p-0 shadow-none hover:bg-accent/70';
  const fullscreenAction = isFullscreen ? onCloseFullscreen : onOpenFullscreen;

  if (!fullscreenAction) return null;

  return (
    <div className="flex items-center gap-1">
      {fullscreenAction ? (
        <TooltipAction tooltip={isFullscreen ? t('group.closeFullscreen') : t('group.openFullscreen')}>
          <Button
            size="sm"
            variant="ghost"
            className={windowActionButtonClassName}
            onClick={fullscreenAction}
          >
            {isFullscreen ? <Shrink className="h-3.5 w-3.5" /> : <Expand className="h-3.5 w-3.5" />}
          </Button>
        </TooltipAction>
      ) : null}
    </div>
  );
}
