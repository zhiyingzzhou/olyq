/**
 * 说明：Side Panel 渲染崩溃后的局部降级界面。
 *
 * 该组件只负责展示可恢复的工作区错误提示，不接触聊天、设置或页面工具状态，
 * 避免错误边界在 fallback 渲染阶段继续改写业务真源。
 */
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** Side Panel 工作区错误降级 UI。 */
export function SidePanelErrorFallback() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-md bg-destructive/10 p-2 text-destructive">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold leading-6">{t('app.workspaceCrashedTitle')}</h1>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{t('app.workspaceCrashedDescription')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
