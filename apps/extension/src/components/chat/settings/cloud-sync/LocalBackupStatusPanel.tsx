/**
 * 说明：`LocalBackupStatusPanel` 组件模块。
 *
 * 职责：
 * - 展示本地自动快照的保存、计划、最近执行和目录导出降级状态；
 * - 把后台 alarm / 状态真源翻译成设置页可解释的短提示；
 * - 保持 `LocalBackupContent` 只负责动作编排和快照管理列表。
 */
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InlineNotice } from '@/components/ui/inline-notice';
import type { LocalBackupScheduleSnapshotPayload } from '@/lib/extension/ui-actions';
import { formatI18nText } from '@/lib/i18n/format';
import type { LocalBackupScheduleFailureDetailPayload } from '@/types/sw-messages';
import { AlertTriangle, CheckCircle2, ClipboardCopy, Clock3, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * 本地自动快照状态面板属性。
 */
export interface LocalBackupStatusPanelProps {
  /** 当前自动快照间隔，单位分钟。 */
  syncInterval: number;
  /** 当前是否开启精简备份。 */
  liteBackupEnabled: boolean;
  /** 后台聚合的计划与最近执行状态。 */
  schedule: LocalBackupScheduleSnapshotPayload | null;
  /** 是否正在读取后台计划状态。 */
  scheduleLoading: boolean;
  /** 最近一次计划状态读取失败文案。 */
  scheduleError: string;
  /** 当前是否正在确定性保存配置。 */
  configSaving: boolean;
  /** 最近一次配置成功保存时间。 */
  configSavedAt: number | null;
  /** 当前浏览器是否支持目录选择。 */
  canPickExportDir: boolean;
  /** 用户点击重新授权目录时触发。 */
  onAuthorizeDir: () => void;
  /** 时间格式化函数。 */
  formatDate: (timestamp: number) => string;
  /** 错误格式化函数。 */
  formatErrorMessage: (error: unknown) => string;
}

type Translate = (key: string, options?: Record<string, unknown>) => string;
type FailureRow = { label: string; value: string };

const LEGACY_REASON_CODE_MISSING_NOTE = 'backup format failure detail did not include a reason code; this record was written before reason-code enforcement';
const STATUS_MISSING_DETAIL_NOTE = 'status payload did not include errorDetail; it was produced by a writer that only persisted the summary error';

/** 把运行时诊断 code 转成 locale 下可安全维护的 key 片段。 */
function toLocaleCodeSegment(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/** 只在 key 真有翻译时返回本地化文案，避免把缺失 key 当成译文。 */
function translateIfAvailable(t: Translate, key: string): string | null {
  const translated = t(key);
  return translated && translated !== key ? translated : null;
}

/** 本地化可枚举诊断 code，未知值只在复制诊断信息里保留原始值。 */
function formatKnownCodeValue(t: Translate, group: 'runtime' | 'phase' | 'taskType' | 'backupProfile', code: string): string {
  const translationKey = `cloudSyncPanel.localBackup.status.detail.valueLabels.${group}.${toLocaleCodeSegment(code)}`;
  const label = translateIfAvailable(t, translationKey);
  return label ?? t('cloudSyncPanel.localBackup.status.detail.unknownValue');
}

/** 本地化备份格式原因码，未知原因只在复制诊断信息里保留原始值。 */
function getReasonCodeLabel(t: Translate, code: string): string {
  const translationKey = `cloudSyncPanel.localBackup.status.detail.reasonCodes.${toLocaleCodeSegment(code)}`;
  return translateIfAvailable(t, translationKey) ?? t('cloudSyncPanel.localBackup.status.detail.unknownReason');
}

/** 本地化错误 key 或错误 message，避免把 `errors.xxx` 直接当正文展示。 */
function formatErrorKeyValue(t: Translate, key: string): string {
  return formatI18nText(t, { key });
}

/** 把备份域 ID 转成用户可读数据范围；内部 ID 仍只保留在复制诊断信息里。 */
function formatDomainIdValue(t: Translate, domainId: string): string {
  const translationKey = `cloudSyncPanel.localBackup.status.detail.domainLabels.${toLocaleCodeSegment(domainId)}`;
  return translateIfAvailable(t, translationKey) ?? t('cloudSyncPanel.localBackup.status.detail.unknownDomain');
}

/** 本地化自动快照详情中的说明字段。 */
function formatNoteText(t: Translate, note: string): string {
  const direct = translateIfAvailable(t, note);
  if (direct) return direct;
  if (note === LEGACY_REASON_CODE_MISSING_NOTE) {
    return t('cloudSyncPanel.localBackup.status.detail.notes.reasonCodeMissingLegacy');
  }
  if (note === STATUS_MISSING_DETAIL_NOTE) {
    return t('cloudSyncPanel.localBackup.status.detail.notes.statusMissingDetail');
  }
  return note;
}

/** 前台兜底规整旧失败详情，避免已落库状态继续缺少备份格式原因码。 */
function normalizeFailureDetailForDisplay(
  detail: LocalBackupScheduleFailureDetailPayload,
  summaryErrorKey?: string,
): LocalBackupScheduleFailureDetailPayload {
  const isBackupFormatError = detail.errorKey === 'errors.backupFormatUnsupported'
    || summaryErrorKey === 'errors.backupFormatUnsupported';
  if (
    !isBackupFormatError
    || (typeof detail.errorParams?.detail === 'string' && detail.errorParams.detail.trim().length > 0)
  ) {
    return detail;
  }
  return {
    ...detail,
    errorParams: {
      ...(detail.errorParams ?? {}),
      detail: 'backup.format.detail_missing',
    },
    note: detail.note ?? LEGACY_REASON_CODE_MISSING_NOTE,
  };
}

/**
 * 本地自动快照状态面板。
 *
 * @param props - 状态数据与用户动作。
 * @returns 设置页内的可观测自动快照状态提示组。
 */
export function LocalBackupStatusPanel({
  canPickExportDir,
  configSavedAt,
  configSaving,
  formatDate,
  formatErrorMessage,
  liteBackupEnabled,
  onAuthorizeDir,
  schedule,
  scheduleError,
  scheduleLoading,
  syncInterval,
}: LocalBackupStatusPanelProps) {
  const { t } = useTranslation();
  const [failureDetailOpen, setFailureDetailOpen] = useState(false);
  const [failureDetailCopied, setFailureDetailCopied] = useState(false);
  const nextRunAt = schedule?.alarm?.scheduledTime ?? null;
  const status = schedule?.status ?? null;
  const statusErrorText = status?.error ? formatErrorMessage(status.error) : t('common.error');
  const failureDetail = useMemo<LocalBackupScheduleFailureDetailPayload | null>(() => {
    if (!status || status.ok) return null;
    if (status.errorDetail) return normalizeFailureDetailForDisplay(status.errorDetail, status.error?.key);
    return {
      at: status.lastRunAt,
      taskType: 'local-backup/auto',
      runtime: 'offscreen',
      phase: 'status-missing-detail',
      ...(status.error?.key ? { errorKey: status.error.key } : {}),
      ...(status.error?.params ? { errorParams: status.error.params as Record<string, string | number | boolean | null> } : {}),
      note: STATUS_MISSING_DETAIL_NOTE,
    };
  }, [status]);
  const scheduleSummary = configSaving
    ? t('cloudSyncPanel.localBackup.status.saving')
    : configSavedAt
      ? t('cloudSyncPanel.localBackup.status.savedAt', { time: formatDate(configSavedAt) })
      : syncInterval > 0
        ? t('cloudSyncPanel.localBackup.status.scheduleActive')
        : t('cloudSyncPanel.localBackup.status.autoDisabled');
  const nextRunSummary = syncInterval > 0
    ? nextRunAt
      ? t('cloudSyncPanel.localBackup.status.nextRunAt', { time: formatDate(nextRunAt) })
      : t('cloudSyncPanel.localBackup.status.nextRunPending')
    : t('cloudSyncPanel.localBackup.status.autoDisabledDesc');
  const hasFileExportDegraded = status?.mode === 'snapshot_ok/file_export_degraded';
  const showFastFullBackupWarning = syncInterval > 0 && syncInterval <= 5 && !liteBackupEnabled;
  const failureRows = useMemo(() => {
    if (!status || status.ok) return [];
    const detail = failureDetail;
    const rows: FailureRow[] = [
      { label: t('cloudSyncPanel.localBackup.status.detail.summary'), value: statusErrorText },
      { label: t('cloudSyncPanel.localBackup.status.detail.time'), value: formatDate(status.lastRunAt) },
      {
        label: t('cloudSyncPanel.localBackup.status.detail.backupProfile'),
        value: formatKnownCodeValue(t, 'backupProfile', schedule?.config.backupProfile ?? (liteBackupEnabled ? 'lite' : 'full')),
      },
      { label: t('cloudSyncPanel.localBackup.status.detail.syncInterval'), value: String(schedule?.config.syncInterval ?? syncInterval) },
      { label: t('cloudSyncPanel.localBackup.status.detail.maxBackups'), value: String(schedule?.config.maxBackups ?? 0) },
    ];
    if (detail) {
      rows.push(
        { label: t('cloudSyncPanel.localBackup.status.detail.runtime'), value: formatKnownCodeValue(t, 'runtime', detail.runtime) },
        { label: t('cloudSyncPanel.localBackup.status.detail.phase'), value: formatKnownCodeValue(t, 'phase', detail.phase) },
        { label: t('cloudSyncPanel.localBackup.status.detail.taskType'), value: formatKnownCodeValue(t, 'taskType', detail.taskType) },
      );
      if (detail.requestId) rows.push({ label: t('cloudSyncPanel.localBackup.status.detail.requestId'), value: detail.requestId });
      if (detail.errorParams?.detail) rows.push({ label: t('cloudSyncPanel.localBackup.status.detail.reason'), value: getReasonCodeLabel(t, String(detail.errorParams.detail)) });
      if (detail.errorParams?.causeDetail) rows.push({ label: t('cloudSyncPanel.localBackup.status.detail.causeReason'), value: getReasonCodeLabel(t, String(detail.errorParams.causeDetail)) });
      if (detail.errorParams?.domainId) rows.push({ label: t('cloudSyncPanel.localBackup.status.detail.domainId'), value: formatDomainIdValue(t, String(detail.errorParams.domainId)) });
      if (detail.errorParams?.stage) rows.push({ label: t('cloudSyncPanel.localBackup.status.detail.stage'), value: formatKnownCodeValue(t, 'phase', String(detail.errorParams.stage)) });
      if (detail.note) rows.push({ label: t('cloudSyncPanel.localBackup.status.detail.note'), value: formatNoteText(t, detail.note) });
      if (!detail.errorParams?.detail && detail.errorKey) rows.push({ label: t('cloudSyncPanel.localBackup.status.detail.reason'), value: formatErrorKeyValue(t, detail.errorKey) });
    }
    if (nextRunAt) rows.push({ label: t('cloudSyncPanel.localBackup.status.detail.nextRun'), value: formatDate(nextRunAt) });
    return rows;
  }, [failureDetail, formatDate, liteBackupEnabled, nextRunAt, schedule?.config.backupProfile, schedule?.config.maxBackups, schedule?.config.syncInterval, status, statusErrorText, syncInterval, t]);
  const failureDetailJson = useMemo(() => {
    if (!status || status.ok) return '';
    const displayDetail = failureDetail
      ? {
        ...failureDetail,
        ...(failureDetail.errorKey ? { errorText: formatI18nText(t, { key: failureDetail.errorKey }) } : {}),
        ...(failureDetail.errorParams?.detail ? { reasonText: getReasonCodeLabel(t, String(failureDetail.errorParams.detail)) } : {}),
        ...(failureDetail.errorParams?.causeDetail ? { causeReasonText: getReasonCodeLabel(t, String(failureDetail.errorParams.causeDetail)) } : {}),
        ...(failureDetail.note ? { note: formatNoteText(t, failureDetail.note) } : {}),
      }
      : null;
    return JSON.stringify({
      error: status.error ?? null,
      errorDetail: displayDetail,
      config: schedule?.config ?? {
        syncInterval,
        backupProfile: liteBackupEnabled ? 'lite' : 'full',
      },
      alarm: schedule?.alarm ?? null,
    }, null, 2);
  }, [failureDetail, liteBackupEnabled, schedule?.alarm, schedule?.config, status, syncInterval, t]);
  /** 复制当前失败详情 JSON，方便用户直接粘贴到 issue 或诊断对话里。 */
  const copyFailureDetail = async () => {
    if (!failureDetailJson) return;
    await navigator.clipboard?.writeText?.(failureDetailJson);
    setFailureDetailCopied(true);
    window.setTimeout(() => setFailureDetailCopied(false), 1200);
  };

  return (
    <div className="space-y-2 pt-3">
      <InlineNotice
        align="start"
        icon={scheduleError ? AlertTriangle : Clock3}
        tone={scheduleError ? 'destructive' : syncInterval > 0 ? 'info' : 'muted'}
      >
        <div className="space-y-1">
          <div className="text-sm font-medium text-foreground/90">
            {scheduleError || scheduleSummary}
          </div>
          <div className="text-xs text-muted-foreground">
            {scheduleLoading ? t('common.loading') : nextRunSummary}
          </div>
        </div>
      </InlineNotice>

      <InlineNotice
        align="start"
        icon={status?.ok ? CheckCircle2 : status ? AlertTriangle : Info}
        tone={status?.ok ? hasFileExportDegraded ? 'warning' : 'success' : status ? 'destructive' : 'muted'}
      >
        <div className="space-y-1">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 text-sm font-medium text-foreground/90">
              {!status
                ? t('cloudSyncPanel.localBackup.status.never')
                : status.ok
                  ? t('cloudSyncPanel.localBackup.status.lastSuccess', { time: formatDate(status.lastRunAt) })
                  : t('cloudSyncPanel.localBackup.status.lastFailure', {
                    time: formatDate(status.lastRunAt),
                    error: statusErrorText,
                  })}
            </div>
            {status && !status.ok ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 shrink-0 whitespace-nowrap px-2.5 text-xs"
                onClick={() => setFailureDetailOpen(true)}
              >
                {t('cloudSyncPanel.localBackup.status.detail.action')}
              </Button>
            ) : null}
          </div>
          {status?.ok && typeof status.trimmedCount === 'number' && status.trimmedCount > 0 ? (
            <div className="text-xs text-muted-foreground">
              {t('cloudSyncPanel.localBackup.status.cleaned', { count: status.trimmedCount })}
            </div>
          ) : null}
        </div>
      </InlineNotice>

      {hasFileExportDegraded ? (
        <InlineNotice align="start" icon={AlertTriangle} tone="warning">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm">{t('cloudSyncPanel.localBackup.status.fileExportDegraded')}</span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 shrink-0 whitespace-nowrap"
              onClick={onAuthorizeDir}
              disabled={!canPickExportDir}
            >
              {t('cloudSyncPanel.localBackup.status.reauthorizeDir')}
            </Button>
          </div>
        </InlineNotice>
      ) : null}

      {showFastFullBackupWarning ? (
        <InlineNotice align="start" icon={AlertTriangle} tone="warning">
          {t('cloudSyncPanel.localBackup.status.fastFullBackupWarning')}
        </InlineNotice>
      ) : null}

      <Dialog open={failureDetailOpen} onOpenChange={setFailureDetailOpen}>
        <DialogContent
          className="flex h-[min(calc(100vh-2rem),42rem)] max-h-[calc(100vh-2rem)] min-h-0 max-w-2xl flex-col gap-0 overflow-hidden rounded-lg p-0"
          data-testid="local-backup-failure-detail-dialog"
        >
          <DialogHeader className="shrink-0 gap-0 border-b border-border px-5 py-4 pr-14">
            <DialogTitle>{t('cloudSyncPanel.localBackup.status.detail.title')}</DialogTitle>
            <DialogDescription className="mt-2 text-xs leading-5">
              {t('cloudSyncPanel.localBackup.status.detail.desc')}
            </DialogDescription>
          </DialogHeader>

          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
            data-testid="local-backup-failure-detail-scroll-body"
          >
            <div className="space-y-4 px-5 py-4">
              <div className="space-y-2">
                {failureRows.length > 0 ? failureRows.map((row, index) => (
                  <div
                    key={`${row.label}:${index}`}
                    className="grid gap-1 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]"
                  >
                    <div className="text-xs font-medium text-muted-foreground">{row.label}</div>
                    <div className="min-w-0 break-words text-xs leading-5 text-foreground/90">{row.value}</div>
                  </div>
                )) : (
                  <div className="text-sm text-muted-foreground">
                    {t('cloudSyncPanel.localBackup.status.detail.empty')}
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t border-border px-5 py-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => void copyFailureDetail().catch(() => undefined)}
            >
              <ClipboardCopy className="h-3.5 w-3.5" />
              {failureDetailCopied
                ? t('common.copied')
                : t('cloudSyncPanel.localBackup.status.detail.copyDiagnostics')}
            </Button>
            <Button type="button" size="sm" className="h-8" onClick={() => setFailureDetailOpen(false)}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
