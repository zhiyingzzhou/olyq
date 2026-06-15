/**
 * 说明：`backup-auto-error-detail` 自动备份失败详情模块。
 *
 * 职责：
 * - 把后台自动备份失败规整为可持久化、可展示、可复制的诊断摘要；
 * - 只保存稳定 key、运行时阶段、请求 ID 和短错误文本，不持久化堆栈、大对象或备份内容；
 * - 供 Service Worker 与 offscreen runtime 共用，避免两处写入状态时详情结构漂移。
 */
import { isI18nError } from '@/lib/i18n/error';
import { isI18nText } from '@/lib/i18n/text';
import { isPlainRecord } from '@/lib/utils/type-guards';
import { getBackupFormatErrorDetail } from '@/lib/backup-schema';
import type { I18nText } from '@/types/i18n';
import type { LocalBackupScheduleFailureDetailPayload } from '@/types/sw-messages';

/** 自动备份失败详情构造入参。 */
export interface BackupAutoFailureDetailInput {
  /** 自动任务类型。 */
  taskType: string;
  /** 执行所在运行时。 */
  runtime: LocalBackupScheduleFailureDetailPayload['runtime'];
  /** 失败发生阶段。 */
  phase: string;
  /** 本次后台 RPC 请求 ID。 */
  requestId?: string;
  /** 原始错误对象。 */
  error: unknown;
  /** 已归一化的国际化错误。 */
  i18nError?: I18nText;
  /** 当原始状态缺少详情时，补充一段明确说明。 */
  note?: string;
}

/** 限制详情字段长度，避免把长响应体或异常对象塞进状态存储。 */
function cleanString(value: unknown, max = 500): string | undefined {
  const text = String(value ?? '').trim();
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

/** 把 i18n params 收敛为可安全序列化的小对象。 */
function cleanParams(params: unknown): Record<string, string | number | boolean | null> | undefined {
  if (!isPlainRecord(params)) return undefined;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(params)) {
    if (!key) continue;
    if (typeof value === 'string') out[key] = cleanString(value, 500) ?? '';
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    else if (typeof value === 'boolean' || value === null) out[key] = value;
    else out[key] = cleanString(value, 200) ?? null;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** 从未知错误中提取短错误名。 */
function getErrorName(error: unknown): string | undefined {
  if (error instanceof Error) return cleanString(error.name, 120);
  if (isPlainRecord(error)) return cleanString(error.name, 120);
  return undefined;
}

/** 从未知错误中提取短错误信息。 */
function getErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error) return cleanString(error.message, 500);
  if (isPlainRecord(error)) {
    if (typeof error.message === 'string') return cleanString(error.message, 500);
    if (typeof error.error === 'string') return cleanString(error.error, 500);
    if (isPlainRecord(error.error) && typeof error.error.message === 'string') {
      return cleanString(error.error.message, 500);
    }
  }
  if (typeof error === 'string') return cleanString(error, 500);
  return undefined;
}

/** 从 Error.cause 中提取短信息。 */
function getCauseMessage(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause === undefined || cause === null) return undefined;
  return getErrorMessage(cause) ?? cleanString(cause, 500);
}

/** 判断未知值是否是合法的自动备份失败详情。 */
export function isLocalBackupFailureDetail(value: unknown): value is LocalBackupScheduleFailureDetailPayload {
  if (!isPlainRecord(value)) return false;
  return typeof value.at === 'number'
    && Number.isFinite(value.at)
    && value.at > 0
    && typeof value.taskType === 'string'
    && value.taskType.trim().length > 0
    && (value.runtime === 'offscreen' || value.runtime === 'service-worker')
    && typeof value.phase === 'string'
    && value.phase.trim().length > 0;
}

/**
 * 规整已持久化的失败详情。
 *
 * @remarks
 * `errors.backupFormatUnsupported` 必须有机器可读 `detail`。如果读取到旧写入路径留下的
 * summary-only 详情，这里会补 `backup.format.detail_missing`，让 UI 不再出现“有详情但仍无原因码”的状态。
 */
export function normalizeLocalBackupFailureDetail(
  value: unknown,
  summaryError?: I18nText,
): LocalBackupScheduleFailureDetailPayload | null {
  if (!isLocalBackupFailureDetail(value)) return null;
  const isBackupFormatError = value.errorKey === 'errors.backupFormatUnsupported'
    || summaryError?.key === 'errors.backupFormatUnsupported';
  if (
    !isBackupFormatError
    || (typeof value.errorParams?.detail === 'string' && value.errorParams.detail.trim().length > 0)
  ) {
    return value;
  }
  return {
    ...value,
    errorParams: {
      ...(value.errorParams ?? {}),
      detail: 'backup.format.detail_missing',
    },
    note: value.note
      ?? 'backup format failure detail did not include a reason code; this record was written before reason-code enforcement',
  };
}

/**
 * 构造自动备份失败详情。
 *
 * @param input - 失败上下文和原始错误。
 * @returns 可落入 `chrome.storage.local` 的诊断摘要。
 */
export function createBackupAutoFailureDetail(
  input: BackupAutoFailureDetailInput,
): LocalBackupScheduleFailureDetailPayload {
  const normalizedError = input.i18nError
    ?? (isI18nError(input.error) ? input.error.i18n : isI18nText(input.error) ? input.error : undefined);
  const backupFormatDetail = normalizedError?.key === 'errors.backupFormatUnsupported'
    ? getBackupFormatErrorDetail(input.error) ?? 'backup.format.detail_missing'
    : undefined;
  const errorParams = cleanParams({
    ...(isPlainRecord(normalizedError?.params) ? normalizedError.params : {}),
    ...(backupFormatDetail && typeof normalizedError?.params?.detail !== 'string' ? { detail: backupFormatDetail } : {}),
  });
  const message = getErrorMessage(input.error);
  const errorName = getErrorName(input.error);
  const causeMessage = getCauseMessage(input.error);
  const requestId = cleanString(input.requestId, 160);
  const note = cleanString(input.note, 500);
  return {
    at: Date.now(),
    taskType: cleanString(input.taskType, 160) ?? 'local-backup/auto',
    runtime: input.runtime,
    phase: cleanString(input.phase, 160) ?? 'unknown',
    ...(requestId ? { requestId } : {}),
    ...(normalizedError?.key ? { errorKey: cleanString(normalizedError.key, 200) } : {}),
    ...(errorParams ? { errorParams } : {}),
    ...(errorName ? { errorName } : {}),
    ...(message ? { message } : {}),
    ...(causeMessage ? { causeMessage } : {}),
    ...(note ? { note } : {}),
  };
}
