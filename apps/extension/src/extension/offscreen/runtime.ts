/**
 * 说明：`runtime` Offscreen 模块。
 *
 * 职责：
 * - 承载 `runtime` 相关的当前文件实现与模块边界；
 * - 对外暴露 `startOffscreenRuntime` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { I18nText } from '@/types/i18n';
import { toI18nTextFromError } from '@/lib/i18n/error';
import { createBackupAutoFailureDetail } from '@/lib/backup-auto-error-detail';
import {
  normalizeBackupProfile,
} from '@/lib/backup-config';
import { runExclusiveBackupJob } from '@/lib/backup-jobs';
import type { LocalBackupScheduleFailureDetailPayload } from '@/types/sw-messages';

/** ping 请求：用于检测 offscreen runtime 是否在线 */
type PingRequest = {
  /** 消息类型 */
  type: "ping";
};

/** 自动本地备份请求（由 SW alarms 触发） */
type LocalBackupAutoRequest = {
  /** 消息类型 */
  type: "local-backup/auto";
  /** 请求 ID（用于 SW 侧 RPC 对应） */
  requestId: string;
};

/** WebDAV 自动备份请求。 */
type WebDavAutoRequest = {
  /** 消息类型。 */
  type: "webdav/auto";
  /** 请求 ID（用于 SW 侧 RPC 对应）。 */
  requestId: string;
};

/** S3 自动备份请求。 */
type S3AutoRequest = {
  /** 消息类型。 */
  type: "s3/auto";
  /** 请求 ID（用于 SW 侧 RPC 对应）。 */
  requestId: string;
};

/** pong 响应：用于回应 ping */
type PongResponse = {
  /** 消息类型 */
  type: "pong";
};

/** 自动本地备份响应 */
type LocalBackupAutoResponse = {
  /** 响应类型。 */
  type: "local-backup/auto/result";
  /** 对应请求 ID。 */
  requestId: string;
  /** 是否执行成功。 */
  ok: boolean;
  /** 失败时的国际化错误。 */
  error?: I18nText;
  /** 失败详情；用于 SW 持久化后供设置页展示。 */
  errorDetail?: LocalBackupScheduleFailureDetailPayload;
};

/** 远端自动备份的通用响应结构。 */
type GenericAutoResponse = {
  /** 响应类型。 */
  type: "webdav/auto/result" | "s3/auto/result";
  /** 对应请求 ID。 */
  requestId: string;
  /** 是否执行成功。 */
  ok: boolean;
  /** 失败时的国际化错误。 */
  error?: I18nText;
  /** 失败详情；用于 SW 持久化后供设置页展示。 */
  errorDetail?: LocalBackupScheduleFailureDetailPayload;
};

/** Offscreen ↔ Service Worker：请求消息 */
type OffscreenRequest = PingRequest | LocalBackupAutoRequest | WebDavAutoRequest | S3AutoRequest;

/** Offscreen ↔ Service Worker：响应消息 */
type OffscreenResponse = PongResponse | LocalBackupAutoResponse | GenericAutoResponse;

/**
 * 说明：Offscreen 运行时入口（精简版）
 * - 保留与 Service Worker 的连接能力（用于未来 DOMParser/WebGPU 等 SW 不具备的能力）
 * - 本地 OCR / 本地 embedding 已移除：不再在 offscreen 中加载 tesseract.js / Transformers.js
 */
export function startOffscreenRuntime() {
  let reconnectAttempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const MAX_RECONNECT = 6;
  const BASE_DELAY = 500;
  const MAX_DELAY = 30_000;

  /** 本地备份配置存储键。 */
  const LOCAL_BACKUP_CFG_KEY = "olyq.sync.local-backup.v1";
  /**
   * 读取单个存储键。
   *
   * @param key - 目标存储键。
   * @returns 对应值；读取失败时返回 `undefined`。
   */
  const storageGet = async <T = unknown>(key: string): Promise<T | undefined> => {
    try {
      const { getStorageAdapter } = await import("@/lib/storage/storage-adapter");
      const out = await getStorageAdapter().get([key]);
      return out[key] as T | undefined;
    } catch {
      return undefined;
    }
  };

  /**
   * 写入一批存储补丁。
   *
   * @param patch - 要写入的键值对。
   */
  const storageSet = async (patch: Record<string, unknown>) => {
    const { getStorageAdapter } = await import("@/lib/storage/storage-adapter");
    await getStorageAdapter().set(patch);
  };

  /**
   * 执行一次本地自动备份。
   *
   * 流程：
   * - 导出 zip；
   * - 存入 IndexedDB 本地快照；
   * - 若用户授权了导出目录，则额外写入文件系统；
   * - 最后按 `maxBackups` 清理旧快照。
   */
  /** 在 offscreen 中执行本地自动备份任务，并串行化同类后台作业。 */
  const runLocalBackupAuto = async () => {
    return await runExclusiveBackupJob("auto-backup:local-backup/auto", async () => {
    const localBackup = await import("@/lib/local-backup");

    const cfg = (await storageGet<Record<string, unknown>>(LOCAL_BACKUP_CFG_KEY)) ?? {};
    const backupProfile = normalizeBackupProfile(cfg.backupProfile);
    const maxBackups =
      typeof cfg.maxBackups === "number" && Number.isFinite(cfg.maxBackups)
        ? Math.max(0, Math.floor(cfg.maxBackups))
        : 0;

    const result = await localBackup.createLocalBackupSnapshot({
      profile: backupProfile,
      maxBackups,
      permissionMode: 'query',
    });

    await storageSet({
      "olyq.sync.local-backup.status.v1": {
        lastRunAt: Date.now(),
        ok: true,
        mode: result.fileExportStatus === 'degraded' ? 'snapshot_ok/file_export_degraded' : 'snapshot_ok',
        trimmedCount: result.trimmedCount,
      },
    });
    });
  };


  /**
   * 执行一次 WebDAV 自动备份。
   *
   * 说明：
   * - 当前 WebDAV 自动任务只执行多设备结构化同步；
   * - 用户可恢复的 ZIP 快照只由设置页显式“备份到 WebDAV”创建；
   * - 恢复入口固定通过远端版本列表选择 ZIP，不再记录 `lastBackupUrl`。
   */
  const runWebDavAuto = async () => {
    return await runExclusiveBackupJob("auto-backup:webdav/auto", async () => {
    const { runWebDavStructuredSync } = await import("@/lib/sync/cloud-sync");
    await runWebDavStructuredSync();
    });
  };

  /**
   * 执行一次 S3 自动备份。
   *
   * 说明：
   * - 上传目标 key 由 root + 时间戳文件名拼接得到；
   * - `maxBackups` 生效时会列举对象并删除超额旧备份。
   */
  const runS3Auto = async () => {
    return await runExclusiveBackupJob("auto-backup:s3/auto", async () => {
    const { runS3StructuredSync } = await import("@/lib/sync/cloud-sync");
    await runS3StructuredSync();
    });
  };

  /**
   * 与 Service Worker 建立长连接，并处理自动备份类 RPC。
   *
   * 说明：
   * - offscreen 只承接 SW 无法直接完成、但又不需要可见 UI 的后台任务；
   * - 连接断开后会做指数退避重连，避免 SW/Offscreen 生命周期波动导致长期失联。
   */
  function connect() {
    const port = chrome.runtime.connect({ name: "olyq:offscreen" });

    port.onMessage.addListener((msg: OffscreenRequest) => {
      if (!msg?.type) return;
      if (msg.type === "ping") {
        port.postMessage({ type: "pong" } satisfies OffscreenResponse);
      }
	      if (msg.type === "local-backup/auto") {
	        const requestId = String((msg as LocalBackupAutoRequest).requestId || "");
	        if (!requestId) return;
	        void runLocalBackupAuto()
	          .then(() => {
	            port.postMessage({ type: "local-backup/auto/result", requestId, ok: true } satisfies OffscreenResponse);
	          })
	          .catch(async (e: unknown) => {
	            const error = toI18nTextFromError(e);
              const errorDetail = createBackupAutoFailureDetail({
                taskType: "local-backup/auto",
                runtime: "offscreen",
                phase: "local-backup-snapshot",
                requestId,
                error: e,
                i18nError: error,
              });
	            await storageSet({
	              "olyq.sync.local-backup.status.v1": {
	                lastRunAt: Date.now(),
	                ok: false,
	                mode: "snapshot_error",
	                error,
                  errorDetail,
	              },
	            });
	            port.postMessage({ type: "local-backup/auto/result", requestId, ok: false, error, errorDetail } satisfies OffscreenResponse);
	          });
	      }
	      if (msg.type === "webdav/auto") {
	        const requestId = String((msg as WebDavAutoRequest).requestId || "");
	        if (!requestId) return;
	        void runWebDavAuto()
	          .then(() => port.postMessage({ type: "webdav/auto/result", requestId, ok: true } satisfies OffscreenResponse))
	          .catch((e: unknown) => {
	            const error = toI18nTextFromError(e);
              const errorDetail = createBackupAutoFailureDetail({
                taskType: "webdav/auto",
                runtime: "offscreen",
                phase: "webdav-structured-sync",
                requestId,
                error: e,
                i18nError: error,
              });
	            port.postMessage({ type: "webdav/auto/result", requestId, ok: false, error, errorDetail } satisfies OffscreenResponse);
	          });
	      }
	      if (msg.type === "s3/auto") {
	        const requestId = String((msg as S3AutoRequest).requestId || "");
	        if (!requestId) return;
	        void runS3Auto()
	          .then(() => port.postMessage({ type: "s3/auto/result", requestId, ok: true } satisfies OffscreenResponse))
	          .catch((e: unknown) => {
	            const error = toI18nTextFromError(e);
              const errorDetail = createBackupAutoFailureDetail({
                taskType: "s3/auto",
                runtime: "offscreen",
                phase: "s3-structured-sync",
                requestId,
                error: e,
                i18nError: error,
              });
	            port.postMessage({ type: "s3/auto/result", requestId, ok: false, error, errorDetail } satisfies OffscreenResponse);
	          });
	      }
	    });

    port.onDisconnect.addListener(() => {
      // 断线重连（指数退避）
      if (reconnectTimer) return;
      if (reconnectAttempts >= MAX_RECONNECT) return;
      const delay = Math.min(BASE_DELAY * 2 ** reconnectAttempts, MAX_DELAY);
      reconnectAttempts++;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    });

    // 连接成功：重置计数
    reconnectAttempts = 0;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  }

  connect();
}
