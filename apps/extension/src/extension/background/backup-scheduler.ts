/**
 * 说明：`backup-scheduler` 后台运行时模块。
 *
 * 职责：
 * - 承载 `backup-scheduler` 相关的当前文件实现与模块边界；
 * - 对外暴露 `applyLocalBackupSchedule`、`applyCloudBackupSchedules`、`runLocalBackupAuto` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 备份调度器— 备份调度管理
 *
 * 负责：
 * - 加载各备份方式（本地/WebDAV/S3）的同步间隔配置
 * - 管理 chrome.alarms 定时器
 * - 通过 Offscreen Document 执行自动备份任务
 */

import { normalizeSyncIntervalMinutes, normalizeMaxBackups } from "../../lib/sync/normalize";
import { createId } from "../../lib/utils/id";
import { ensureOffscreenDocument, waitForOffscreenPort, callOffscreen } from "./offscreen-manager";
import { getStorageAdapter } from "../../lib/storage/storage-adapter";
import { I18nError, toI18nTextFromError } from "../../lib/i18n/error";
import {
  LOCAL_BACKUP_ALARM,
  LOCAL_BACKUP_KEY,
  LOCAL_BACKUP_STATUS_KEY,
  S3_ALARM,
  S3_KEY,
  S3_STATUS_KEY,
  WEBDAV_ALARM,
  WEBDAV_KEY,
  WEBDAV_STATUS_KEY,
} from "./backup-scheduler-contract";
import {
  DEFAULT_BACKUP_PROFILE,
  normalizeBackupProfile,
} from "../../lib/backup-config";
import { runExclusiveBackupJob } from "../../lib/backup-jobs";
import { createLocalBackupSnapshot } from "../../lib/local-backup";
import {
  createBackupAutoFailureDetail,
  isLocalBackupFailureDetail,
  normalizeLocalBackupFailureDetail,
} from "../../lib/backup-auto-error-detail";
import type { BackupProfile } from "../../lib/persistence/types";
import type {
  LocalBackupScheduleFailureDetailPayload,
  LocalBackupScheduleAlarmPayload,
  LocalBackupSchedulePayload,
  LocalBackupScheduleStatusPayload,
} from "../../types/sw-messages";
import {
  runS3StructuredSync,
  runWebDavStructuredSync,
} from "../../lib/sync/cloud-sync";

// ─── 配置加载 ─────────────────────────────────────────────

/** 本地自动备份调度配置的最小结构。 */
type LocalBackupConfig = {
  /** 自动备份周期，单位分钟；`\<=0` 表示关闭定时任务。 */
  syncInterval?: number;
  /** 最多保留的历史备份数；`0` 表示不主动裁剪。 */
  maxBackups?: number;
  /** 当前自动备份档位；`lite` 会跳过文件二进制并剥离附件引用。 */
  backupProfile?: BackupProfile;
};

/** 应用本地自动快照计划时的重排策略。 */
type LocalBackupScheduleApplyMode = "preserve-existing" | "reschedule";

/** 读取并归一化本地自动备份配置。 */
async function loadLocalBackupConfig(): Promise<LocalBackupConfig> {
  const res = await getStorageAdapter().get([LOCAL_BACKUP_KEY]);
  const raw = res[LOCAL_BACKUP_KEY];
  if (!raw || typeof raw !== "object") return { syncInterval: 0, maxBackups: 0, backupProfile: DEFAULT_BACKUP_PROFILE };
  const r = raw as Record<string, unknown>;
  const syncInterval = normalizeSyncIntervalMinutes(r.syncInterval);
  const maxBackups = normalizeMaxBackups(r.maxBackups);
  const backupProfile = normalizeBackupProfile(r.backupProfile);
  return { syncInterval, maxBackups, backupProfile };
}

/** 读取并归一化本地自动快照最近一次执行状态。 */
async function loadLocalBackupStatus(): Promise<LocalBackupScheduleStatusPayload | null> {
  const res = await getStorageAdapter().get([LOCAL_BACKUP_STATUS_KEY]);
  const raw = res[LOCAL_BACKUP_STATUS_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const record = raw as Record<string, unknown>;
  const lastRunAt = typeof record.lastRunAt === "number" && Number.isFinite(record.lastRunAt)
    ? record.lastRunAt
    : 0;
  if (lastRunAt <= 0) return null;

  const mode = record.mode === "snapshot_ok"
    || record.mode === "snapshot_ok/file_export_degraded"
    || record.mode === "snapshot_error"
    ? record.mode
    : undefined;
  const trimmedCount = typeof record.trimmedCount === "number" && Number.isFinite(record.trimmedCount)
    ? Math.max(0, Math.floor(record.trimmedCount))
    : undefined;
  const ok = record.ok === true;
  const error = record.error && typeof record.error === "object"
    ? record.error as LocalBackupScheduleStatusPayload["error"]
    : undefined;
  const errorDetail = !ok
    ? isLocalBackupFailureDetail(record.errorDetail)
      ? normalizeLocalBackupFailureDetail(record.errorDetail, error) ?? undefined
      : error
        ? createBackupAutoFailureDetail({
          taskType: "local-backup/auto",
          runtime: "offscreen",
          phase: "status-missing-detail",
          error,
          i18nError: error,
          note: "stored failure status did not include errorDetail; this record was written by a path that only persisted the summary error",
        })
        : undefined
    : undefined;

  return {
    lastRunAt,
    ok,
    ...(mode ? { mode } : {}),
    ...(trimmedCount !== undefined ? { trimmedCount } : {}),
    ...(error ? { error } : {}),
    ...(errorDetail ? { errorDetail } : {}),
  };
}

/** 读取某个云端同步 provider 的原始配置。 */
async function loadCloudSyncConfig(key: string): Promise<Record<string, unknown>> {
  const res = await getStorageAdapter().get([key]);
  const raw = res[key];
  return raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
}

/** WebDAV 自动多设备同步的调度配置。 */
interface WebDavAutoSyncSchedule {
  /** 归一化后的自动同步周期。 */
  minutes: number;
  /** 是否具备后台执行需要的最小 WebDAV 配置。 */
  configured: boolean;
}

/** S3 自动多设备同步的调度配置。 */
interface S3AutoSyncSchedule {
  /** 归一化后的自动同步周期。 */
  minutes: number;
  /** 是否具备后台执行需要的最小 S3 配置。 */
  configured: boolean;
}

/** 读取 WebDAV 自动多设备同步调度配置。 */
async function loadWebDavAutoSyncSchedule(): Promise<WebDavAutoSyncSchedule> {
  const raw = await loadCloudSyncConfig(WEBDAV_KEY);
  return {
    minutes: normalizeSyncIntervalMinutes(raw.syncInterval),
    configured: typeof raw.url === "string" && raw.url.trim().length > 0,
  };
}

/** 读取 S3 自动多设备同步调度配置。 */
async function loadS3AutoSyncSchedule(): Promise<S3AutoSyncSchedule> {
  const raw = await loadCloudSyncConfig(S3_KEY);
  return {
    minutes: normalizeSyncIntervalMinutes(raw.syncInterval),
    configured:
      typeof raw.endpoint === "string" && raw.endpoint.trim().length > 0
      && typeof raw.bucket === "string" && raw.bucket.trim().length > 0
      && typeof raw.accessKeyId === "string" && raw.accessKeyId.trim().length > 0
      && typeof raw.secretAccessKey === "string" && raw.secretAccessKey.trim().length > 0,
  };
}

// ─── 能力探测 / 通用工具 ───────────────────────────────────

/** 当前环境是否支持 Offscreen Document。 */
function hasOffscreenSupport(): boolean {
  // 说明：@types/chrome 在编译期会把 offscreen API 视为“始终存在”，
  // 但运行期（不同浏览器/权限/版本）可能不存在，因此这里按运行时形态探测。
  const offscreen = (chrome as unknown as { offscreen?: { createDocument?: unknown; hasDocument?: unknown } }).offscreen;
  return typeof offscreen?.createDocument === "function" && typeof offscreen?.hasDocument === "function";
}

/** 给任意异步任务加统一超时保护。 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  const timeoutMs = Math.max(1000, ms);
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new I18nError("errors.operationTimeout", { label, ms: timeoutMs })), timeoutMs);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/** Promise 化读取当前本地自动快照 alarm。 */
function readLocalBackupAlarm(): Promise<LocalBackupScheduleAlarmPayload | null> {
  if (!chrome.alarms?.get) return Promise.resolve(null);

  return new Promise((resolve) => {
    try {
      chrome.alarms.get(LOCAL_BACKUP_ALARM, (alarm) => {
        if (chrome.runtime.lastError || !alarm) {
          resolve(null);
          return;
        }
        resolve({
          name: alarm.name,
          scheduledTime: typeof alarm.scheduledTime === "number" && Number.isFinite(alarm.scheduledTime)
            ? alarm.scheduledTime
            : null,
          periodInMinutes: typeof alarm.periodInMinutes === "number" && Number.isFinite(alarm.periodInMinutes)
            ? alarm.periodInMinutes
            : null,
        });
      });
    } catch {
      resolve(null);
    }
  });
}

/** 判断当前浏览器 alarm 是否已经满足目标周期。 */
function isCurrentLocalBackupAlarmValid(alarm: LocalBackupScheduleAlarmPayload | null, periodInMinutes: number): boolean {
  if (!alarm) return false;
  const currentPeriod = typeof alarm.periodInMinutes === "number" && Number.isFinite(alarm.periodInMinutes)
    ? alarm.periodInMinutes
    : 0;
  if (Math.abs(currentPeriod - periodInMinutes) > 0.001) return false;
  return typeof alarm.scheduledTime === "number" && Number.isFinite(alarm.scheduledTime) && alarm.scheduledTime > Date.now();
}

// ─── 定时器调度 ───────────────────────────────────────────

/**
 * 应用“本地自动备份”定时计划。
 *
 * 规则：
 * - 从 `chrome.storage.local` 读取 `olyq.sync.local-backup.v1` 配置；
 * - `syncInterval\<=0` 则清除 alarm；
 * - 否则创建/更新 `chrome.alarms` 周期任务，由 SW 触发离屏文档执行实际备份。
 *
 * @remarks
 * Chrome 官方文档说明，同名 `chrome.alarms.create()` 会取消并替换旧 alarm。
 * 因此启动恢复和 UI 查询只能“补缺失”，不能无条件重建；否则每次打开设置页
 * 或唤醒 Service Worker 都会把下一次执行时间推迟一个周期。
 */
export async function applyLocalBackupSchedule(options?: { mode?: LocalBackupScheduleApplyMode }) {
  const cfg = await loadLocalBackupConfig();
  const minutes = normalizeSyncIntervalMinutes(cfg.syncInterval);
  if (minutes <= 0) {
    chrome.alarms.clear(LOCAL_BACKUP_ALARM);
    return;
  }
  const periodInMinutes = Math.max(1, minutes);
  if ((options?.mode ?? "preserve-existing") === "preserve-existing") {
    const currentAlarm = await readLocalBackupAlarm();
    if (isCurrentLocalBackupAlarmValid(currentAlarm, periodInMinutes)) return;
  }
  // Chrome alarms 的首次触发默认是“下一周期”，这里显式写出 delay，避免 UI
  // 或测试误解为保存后立刻运行；睡眠唤醒后的 missed alarm 也只由浏览器补一次。
  const alarmInfo = {
    delayInMinutes: periodInMinutes,
    periodInMinutes,
    persistAcrossSessions: true,
  };
  chrome.alarms.create(LOCAL_BACKUP_ALARM, alarmInfo);
}

/**
 * 读取本地自动快照的完整可观测状态。
 *
 * @remarks
 * 设置页不直接访问 `chrome.alarms`，统一通过 Service Worker 查询：
 * - 配置来自 `chrome.storage.local` 的共享 JSON 真源；
 * - 最近执行状态来自本地快照状态 key，能跨 SW 重启保留；
 * - alarm 仅作为浏览器当前计划快照，不作为产品状态唯一真相。
 */
export async function readLocalBackupScheduleStatus(): Promise<LocalBackupSchedulePayload> {
  const [config, status, alarm] = await Promise.all([
    loadLocalBackupConfig(),
    loadLocalBackupStatus(),
    readLocalBackupAlarm(),
  ]);

  return {
    config: {
      syncInterval: normalizeSyncIntervalMinutes(config.syncInterval),
      maxBackups: normalizeMaxBackups(config.maxBackups),
      backupProfile: normalizeBackupProfile(config.backupProfile),
    },
    status,
    alarm,
  };
}

/**
 * 应用“云端备份”（WebDAV/S3）定时计划。
 *
 * 说明：
 * - 仅负责根据配置创建/清理 alarms；
 * - 实际上传逻辑由离屏文档中的 runtime 执行（便于复用 UI 侧能力、避免 SW 限制）。
 */
export async function applyCloudBackupSchedules() {
  const [webdav, s3] = await Promise.all([
    loadWebDavAutoSyncSchedule(),
    loadS3AutoSyncSchedule(),
  ]);

  const wMinutes = normalizeSyncIntervalMinutes(webdav.minutes);
  if (wMinutes > 0 && webdav.configured) chrome.alarms.create(WEBDAV_ALARM, { periodInMinutes: Math.max(1, wMinutes) });
  else chrome.alarms.clear(WEBDAV_ALARM);

  const sMinutes = normalizeSyncIntervalMinutes(s3.minutes);
  if (sMinutes > 0 && s3.configured) chrome.alarms.create(S3_ALARM, { periodInMinutes: Math.max(1, sMinutes) });
  else chrome.alarms.clear(S3_ALARM);
}

// ─── 自动备份执行 ─────────────────────────────────────────

/**
 * 在不支持 Offscreen 的环境里，直接由 Service Worker 执行本地自动备份。
 *
 * 说明：
 * - 只在 `runAutoBackup` 判定当前运行时无法使用 offscreen 时走到这里；
 * - 会复用本地备份模块的“写入 + 历史清理”能力，保持和 UI 手动备份一致的语义。
 * - Service Worker 可达代码由 guard 禁止动态 import；该 fallback 因此保持静态可达，
 *   但实际只在无 offscreen 能力的运行时执行。
 */
async function runLocalBackupAutoInServiceWorker() {
  const res = await getStorageAdapter().get([LOCAL_BACKUP_KEY]);
  const raw = res[LOCAL_BACKUP_KEY];
  const cfg = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const backupProfile = normalizeBackupProfile(cfg.backupProfile);
  const maxBackups =
    typeof cfg.maxBackups === "number" && Number.isFinite(cfg.maxBackups)
      ? Math.max(0, Math.floor(cfg.maxBackups))
      : 0;

  const result = await createLocalBackupSnapshot({
    profile: backupProfile,
    maxBackups,
    permissionMode: 'query',
  });
  await getStorageAdapter().set({
    [LOCAL_BACKUP_STATUS_KEY]: {
      lastRunAt: Date.now(),
      ok: true,
      mode: result.fileExportStatus === 'degraded' ? 'snapshot_ok/file_export_degraded' : 'snapshot_ok',
      trimmedCount: result.trimmedCount,
    },
  });
}

/**
 * 在不支持 Offscreen 的环境里，直接由 Service Worker 执行 WebDAV 自动备份。
 *
 * 说明：
 * - 这里会完整走一遍“读取配置 -\> 权限检查 -\> 导出 zip -\> PUT 上传 -\> 可选裁剪旧备份”；
 * - 所有 WebDAV 操作都基于用户现有配置执行，不会在后台额外生成新的目录结构。
 */
async function runWebDavAutoInServiceWorker() {
  await runWebDavStructuredSync();
}

/**
 * 在不支持 Offscreen 的环境里，直接由 Service Worker 执行 S3 自动备份。
 *
 * 说明：
 * - 上传前会校验 endpoint / bucket / AK/SK 等最小必要配置；
 * - 历史裁剪遵循“按对象最后修改时间倒序，仅保留 maxBackups 条”的统一规则。
 */
async function runS3AutoInServiceWorker() {
  await runS3StructuredSync();
}

/** 判断当前自动任务是否属于云端多设备同步。 */
function isCloudSyncAutoTask(offscreenType: string): boolean {
  return offscreenType === "webdav/auto" || offscreenType === "s3/auto";
}

/**
 * 写入自动任务失败状态。
 *
 * 说明：
 * - WebDAV/S3 多设备同步的用户可见状态只认 `mode: 'sync'`；
 * - 本地备份仍沿用本地快照状态结构，避免把两类能力重新混成一个语义。
 */
async function persistAutoTaskFailure(
  statusKey: string,
  isCloudSyncTask: boolean,
  error: ReturnType<typeof toI18nTextFromError>,
  errorDetail?: LocalBackupScheduleFailureDetailPayload,
) {
  const failurePatch = { lastRunAt: Date.now(), ok: false, error, ...(errorDetail ? { errorDetail } : {}) };
  await getStorageAdapter().set({
    [statusKey]: isCloudSyncTask
      ? { ...failurePatch, mode: "sync" }
      : { ...failurePatch, mode: "snapshot_error" },
  });
}

/**
 * 执行某一种自动备份任务，并把结果写回对应状态 key。
 *
 * @param offscreenType - Offscreen 侧或 SW fallback 侧使用的任务类型标识
 * @param statusKey - 本次执行状态要落盘到的存储 key
 * @param timeoutMs - 单次执行允许的最长耗时，超时后会记为失败
 *
 * 说明：
 * - 通过 `runExclusiveBackupJob` 串行化同类自动备份，避免并发重复导出/上传；
 * - 优先走 offscreen runtime，只有运行时缺能力时才降级为 Service Worker 直跑；
 * - 无论成功失败，都会把最近一次执行时间和结果写入状态存储，供设置页展示。
 */
async function runAutoBackup(offscreenType: string, statusKey: string, timeoutMs = 180_000) {
  return await runExclusiveBackupJob(`auto-backup:${offscreenType}`, async () => {
    const requestId = createId();
    const isCloudSyncTask = isCloudSyncAutoTask(offscreenType);
    let runtime: LocalBackupScheduleFailureDetailPayload["runtime"] = "service-worker";
    let phase = "service-worker-fallback";
    try {
      if (hasOffscreenSupport()) {
        runtime = "offscreen";
        // Chromium 能力完整时优先走 offscreen，复用 UI/runtime 侧现成上传实现。
        phase = "ensure-offscreen-document";
        await ensureOffscreenDocument();
        phase = "wait-offscreen-port";
        await waitForOffscreenPort(8000);
        phase = "offscreen-rpc";
        const res = await callOffscreen({ type: offscreenType, requestId }, timeoutMs);
        const r = res as { ok?: unknown; error?: unknown; errorDetail?: unknown } | null;
        if (!r || r.ok !== true) {
          const error = toI18nTextFromError(r?.error);
          const errorDetail = isLocalBackupFailureDetail(r?.errorDetail)
            ? normalizeLocalBackupFailureDetail(r.errorDetail, error) ?? r.errorDetail
            : createBackupAutoFailureDetail({
              taskType: offscreenType,
              runtime,
              phase: "offscreen-result",
              requestId,
              error: r?.error ?? new I18nError("errors.toolExecutionFailed"),
              i18nError: error,
            });
          await persistAutoTaskFailure(statusKey, isCloudSyncTask, error, errorDetail);
          return;
        }
        return;
      }

      // Firefox 等不支持 offscreen 的环境：直接在 SW 中执行自动备份。
      const runner = (() => {
        if (offscreenType === "local-backup/auto") return runLocalBackupAutoInServiceWorker;
        if (offscreenType === "webdav/auto") return runWebDavAutoInServiceWorker;
        if (offscreenType === "s3/auto") return runS3AutoInServiceWorker;
        return null;
      })();
      if (!runner) throw new I18nError("errors.toolExecutionFailedWithDetail", { detail: `unknown auto task: ${offscreenType}` });

      phase = "service-worker-task";
      await withTimeout(runner(), timeoutMs, `auto-backup:${offscreenType}`);
    } catch (e) {
      const error = toI18nTextFromError(e);
      const errorDetail = createBackupAutoFailureDetail({
        taskType: offscreenType,
        runtime,
        phase,
        requestId,
        error: e,
        i18nError: error,
      });
      await persistAutoTaskFailure(statusKey, isCloudSyncTask, error, errorDetail);
    }
  });
}

/** 触发一次本地自动备份，并把状态写入本地备份状态 key。 */
export const runLocalBackupAuto = () => runAutoBackup("local-backup/auto", LOCAL_BACKUP_STATUS_KEY, 120_000);
/** 触发一次 WebDAV 自动备份，并把状态写入 WebDAV 状态 key。 */
export const runWebDavAuto = () => runAutoBackup("webdav/auto", WEBDAV_STATUS_KEY);
/** 触发一次 S3 自动备份，并把状态写入 S3 状态 key。 */
export const runS3Auto = () => runAutoBackup("s3/auto", S3_STATUS_KEY);
