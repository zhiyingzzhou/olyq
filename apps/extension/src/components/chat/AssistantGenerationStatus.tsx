/**
 * 说明：`AssistantGenerationStatus` 组件模块。
 *
 * 职责：
 * - 承载 assistant 生成中的顶部状态提示；
 * - 统一 preparing 占位与 replacement pending 状态条的视觉表达。
 *
 * 边界：
 * - 本文件只负责状态条渲染，不参与消息内容的实际生成逻辑。
 */
import { cn } from '@/lib/utils';

interface AssistantGenerationStatusProps {
  readonly mode: 'preparing' | 'replacementPending' | 'styleCapture';
  readonly t: (key: string) => string;
  readonly className?: string;
}

/** assistant 生成状态提示。 */
export function AssistantGenerationStatus({ mode, t, className }: AssistantGenerationStatusProps) {
  if (mode === 'styleCapture') {
    return (
      <div
        data-testid="assistant-generation-status-style-capture"
        className={cn('mb-2 flex items-center gap-2 text-xs text-muted-foreground', className)}
      >
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
        <span>{t('chat.collectingPageScreenshots')}</span>
      </div>
    );
  }

  if (mode === 'replacementPending') {
    return (
      <div
        data-testid="assistant-generation-status-replacement-pending"
        className={cn('mb-3 rounded-xl border border-primary/15 bg-primary/5 px-3 py-2', className)}
      >
        <div className="flex items-center gap-2 text-[11px] font-medium text-foreground/85">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          <span>{t('chat.replacementPendingTitle')}</span>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          {t('chat.replacementPendingDesc')}
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="assistant-generation-status-preparing"
      className={cn('mb-2 flex items-center gap-2 text-xs text-muted-foreground', className)}
    >
      <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
      <span>{t('chat.preparingReply')}</span>
    </div>
  );
}
