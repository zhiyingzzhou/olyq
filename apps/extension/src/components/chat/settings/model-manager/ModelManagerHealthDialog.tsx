/**
 * 说明：`ModelManagerHealthDialog` 组件模块。
 *
 * 职责：
 * - 承载 `ModelManagerHealthDialog` 相关的当前文件实现与模块边界；
 * - 对外暴露 `HealthCheckResult`、`ModelManagerHealthDialogProps`、`ModelManagerHealthDialog` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Copy,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InlineNotice } from '@/components/ui/inline-notice';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { TooltipAction } from '@/components/ui/tooltip-action';
import { toast } from '@/hooks/useToast';
import { InlineErrorDetails } from '@/components/chat/settings/model-manager/shared';
import { formatI18nText } from '@/lib/i18n/format';
import type { I18nText } from '@/types/i18n';

/** 多 key 健康检查下的汇总统计。 */
interface HealthCheckKeySummary {
  /** 本轮参与检查的 key 总数。 */
  readonly total: number;
  /** 检查通过的 key 数量。 */
  readonly success: number;
  /** 检查失败的 key 数量。 */
  readonly failed: number;
}

/** 健康检查结果项。 */
export interface HealthCheckResult {
  /** 被检查的模型 ID。 */
  readonly modelId: string;
  /** 模型展示名。 */
  readonly modelName: string;
  /** 该模型本轮健康检查的最终状态。 */
  readonly status: 'pending' | 'ok' | 'partial' | 'error';
  /** 请求耗时（毫秒）。 */
  readonly latency?: number;
  /** 失败或部分失败时的国际化错误信息。 */
  readonly error?: I18nText;
  /** 与摘要配套的技术详情。 */
  readonly errorDetail?: string;
  /** 多 key 模式下的 key 级通过/失败摘要。 */
  readonly keySummary?: HealthCheckKeySummary;
}

/** 健康检查弹窗 props。 */
export interface ModelManagerHealthDialogProps {
  /** 对话框是否打开。 */
  readonly open: boolean;
  /** 当前是否正在执行健康检查。 */
  readonly running: boolean;
  /** key 检查模式：单 key 或全 key。 */
  readonly keyMode: 'single' | 'all';
  /** 单 key 模式下被选中的 key 下标。 */
  readonly keyIndex: number;
  /** 当前 Provider 的 key 列表。 */
  readonly keys: ReadonlyArray<string>;
  /** 是否并发检查多个 key / 模型。 */
  readonly concurrent: boolean;
  /** 单次检查超时时间（秒）。 */
  readonly timeout: number;
  /** 当前累积的检查结果。 */
  readonly results: ReadonlyArray<HealthCheckResult>;
  /** 更新对话框开关。 */
  readonly onSetOpen: (open: boolean) => void;
  /** 切换 key 检查模式。 */
  readonly onSetKeyMode: (mode: 'single' | 'all') => void;
  /** 更新单 key 模式下的 key 下标。 */
  readonly onSetKeyIndex: (index: number) => void;
  /** 更新并发检查开关。 */
  readonly onSetConcurrent: (value: boolean) => void;
  /** 更新超时时间。 */
  readonly onSetTimeout: (value: number) => void;
  /** 开始执行健康检查。 */
  readonly onRunHealthCheck: () => void;
  /** 终止正在执行的健康检查。 */
  readonly onAbortHealthCheck: () => void;
}

/**
 * 对 API key 做脱敏展示，供健康检查单选列表使用。
 *
 * @param key - 原始 API key。
 * @returns 截断后的展示文本。
 */
function maskHealthKey(key: string) {
  const s = String(key || '').trim();
  if (!s) return '';
  if (s.length <= 10) return s;
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

/** 健康检查对话框组件。 */
export function ModelManagerHealthDialog({
  open,
  running,
  keyMode,
  keyIndex,
  keys,
  concurrent,
  timeout,
  results,
  onSetOpen,
  onSetKeyMode,
  onSetKeyIndex,
  onSetConcurrent,
  onSetTimeout,
  onRunHealthCheck,
  onAbortHealthCheck,
}: ModelManagerHealthDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) {
          // 用户在运行中关闭弹窗时，默认视作主动停止，避免后台继续消耗请求额度。
          if (running) {
            onAbortHealthCheck();
          }
        }
        onSetOpen(value);
      }}
    >
      <DialogContent className="max-w-md max-h-[85vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-border text-left">
          <DialogTitle className="text-lg font-semibold">{t('modelManagerPanel.healthDialog.title')}</DialogTitle>
        </DialogHeader>
        <DialogDescription className="sr-only">{t('modelManagerPanel.healthDialog.description')}</DialogDescription>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <InlineNotice
            icon={AlertTriangle}
            iconSize="md"
            tone="warning"
            className="rounded-lg !border-amber-500/30 !bg-amber-500/10 p-3"
            bodyClassName="text-sm text-amber-700 dark:text-amber-300"
          >
            {t('modelManagerPanel.healthDialog.warning')}
          </InlineNotice>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">{t('modelManagerPanel.healthDialog.keyMode.title')}</Label>
              <div className="flex items-center gap-1 rounded-lg border border-border/70 bg-muted/30 p-1">
                <button
                  type="button"
                  onClick={() => onSetKeyMode('single')}
                  aria-pressed={keyMode === 'single'}
                  className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                    keyMode === 'single'
                      ? 'bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/20'
                      : 'text-muted-foreground hover:bg-background/60 hover:text-foreground dark:hover:bg-muted/40'
                  }`}
                >
                  {t('modelManagerPanel.healthDialog.keyMode.single')}
                </button>
                <button
                  type="button"
                  onClick={() => onSetKeyMode('all')}
                  aria-pressed={keyMode === 'all'}
                  className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                    keyMode === 'all'
                      ? 'bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/20'
                      : 'text-muted-foreground hover:bg-background/60 hover:text-foreground dark:hover:bg-muted/40'
                  }`}
                >
                  {t('modelManagerPanel.healthDialog.keyMode.all')}
                </button>
              </div>
            </div>

            {keyMode === 'single' && keys.length > 1 ? (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <Label className="text-sm font-medium">{t('modelManagerPanel.healthDialog.selectKey')}</Label>
                <RadioGroup
                  value={String(keyIndex)}
                  onValueChange={(value) => onSetKeyIndex(Number(value) || 0)}
                  className="max-h-32 overflow-y-auto pr-1"
                >
                  {keys.map((key, index) => (
                    <div key={`${index}-${maskHealthKey(key)}`} className="flex items-center gap-2">
                      <RadioGroupItem value={String(index)} id={`health-key-${index}`} />
                      <label
                        htmlFor={`health-key-${index}`}
                        className="cursor-pointer flex-1 truncate font-mono text-xs"
                      >
                        <span title={key || t('modelManagerPanel.healthDialog.emptyKey')}>
                          {maskHealthKey(key)}
                        </span>
                      </label>
                      <TooltipAction tooltip={t('common.copy')}>
                        <button
                          type="button"
                          className="rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                          onClick={() => {
                            void (async () => {
                              try {
                                await navigator.clipboard?.writeText?.(key ?? '');
                                toast.success(t('common.copied'));
                              } catch {
                                toast.error(t('common.copyFailed'));
                              }
                            })();
                          }}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </TooltipAction>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            ) : null}

            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">{t('modelManagerPanel.healthDialog.concurrent.title')}</Label>
              <div className="flex items-center gap-1 rounded-lg border border-border/70 bg-muted/30 p-1">
                <button
                  type="button"
                  onClick={() => onSetConcurrent(false)}
                  aria-pressed={!concurrent}
                  className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                    !concurrent
                      ? 'bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/20'
                      : 'text-muted-foreground hover:bg-background/60 hover:text-foreground dark:hover:bg-muted/40'
                  }`}
                >
                  {t('modelManagerPanel.healthDialog.concurrent.off')}
                </button>
                <button
                  type="button"
                  onClick={() => onSetConcurrent(true)}
                  aria-pressed={concurrent}
                  className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                    concurrent
                      ? 'bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/20'
                      : 'text-muted-foreground hover:bg-background/60 hover:text-foreground dark:hover:bg-muted/40'
                  }`}
                >
                  {t('modelManagerPanel.healthDialog.concurrent.on')}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">{t('modelManagerPanel.healthDialog.timeout')}</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={timeout}
                  onChange={(event) => onSetTimeout(Number(event.target.value))}
                  className="h-8 w-20 text-center text-sm"
                />
                <span className="text-sm text-muted-foreground">{t('modelManagerPanel.healthDialog.secondsUnit')}</span>
              </div>
            </div>
          </div>

          {results.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-lg border border-border">
              {results.map((result) => {
                const errorText = result.error ? formatI18nText(t, result.error) : '';
                const errorSummary = errorText || (
                  typeof result.errorDetail === 'string' && result.errorDetail.trim()
                    ? result.errorDetail.trim()
                    : ''
                );
                const errorDetail = typeof result.errorDetail === 'string' && result.errorDetail.trim()
                  ? result.errorDetail.trim()
                  : errorSummary;
                return (
                  <div key={result.modelId} className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm last:border-b-0">
                    <span
                      className={`h-2 w-2 rounded-full flex-shrink-0 ${
                        result.status === 'ok'
                          ? 'bg-emerald-500'
                          : result.status === 'partial'
                            ? 'bg-amber-500'
                            : result.status === 'error'
                              ? 'bg-red-500'
                              : 'bg-muted-foreground animate-pulse'
                      }`}
                    />
                    <span className="flex-1 truncate">{result.modelName}</span>
                    {result.latency != null ? (
                      <span className="text-xs text-muted-foreground">{result.latency}ms</span>
                    ) : null}
                    {result.keySummary && result.keySummary.total > 1 ? (
                      <span className="text-[11px] text-muted-foreground tabular-nums" title={t('modelManagerPanel.healthDialog.keySummary')}>
                        {result.keySummary.success}/{result.keySummary.total}
                      </span>
                    ) : null}
                    {(result.status === 'partial' || result.status === 'error') && errorSummary ? (
                      <InlineErrorDetails
                        summary={errorSummary}
                        detail={errorDetail}
                        summaryClassName="text-xs text-destructive max-w-[160px]"
                        buttonClassName="text-destructive hover:text-destructive"
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border/60 px-6 py-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (running) {
                onAbortHealthCheck();
              }
              onSetOpen(false);
            }}
          >
            {running ? t('modelManagerPanel.healthDialog.stop') : t('common.cancel')}
          </Button>
          <Button
            size="sm"
            onClick={onRunHealthCheck}
            disabled={running}
          >
            {running ? t('modelManagerPanel.healthDialog.running') : t('modelManagerPanel.healthDialog.start')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
