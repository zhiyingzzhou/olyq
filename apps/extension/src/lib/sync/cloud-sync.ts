/**
 * 说明：`cloud-sync` 同步模块。
 *
 * 职责：
 * - 承载 `cloud-sync` 相关的当前文件实现与模块边界；
 * - 对外暴露 `WEBDAV_SYNC_KEY`、`S3_SYNC_KEY` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { BACKUP_MIME_TYPE } from '@/lib/backup-config';
import { I18nError, toI18nTextFromError } from '@/lib/i18n/error';
import { formatI18nText } from '@/lib/i18n/format';
import { deleteObject, getObject, listObjects, putObject, type S3Config } from '@/lib/s3-client';
import { flushRegisteredPendingWrites } from '@/lib/storage/pending-write-flushers';
import { broadcastStoreReloadSignal } from '@/lib/storage/reload-signal';
import { getStorageAdapter } from '@/lib/storage/storage-adapter';
import type { I18nText } from '@/types/i18n';
import type { TFunction } from 'i18next';
import { flushSyncMetaPendingWrites, runSync, type SyncBackend, type SyncResult } from './sync-engine';
import { createRuntimeLocalStore } from './runtime-local-store';
import type { SyncState } from './diff-merge';
import { withPersistenceOperationLock } from '@/lib/persistence/operation-coordinator';
import {
  decryptSyncSecretVault,
  encryptSyncSecretVault,
  type SyncSecretKeyMaterial,
} from './secret-vault';

/**
 * 导出常量：`WEBDAV_SYNC_KEY`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const WEBDAV_SYNC_KEY = 'olyq.sync.webdav.v1';
/**
 * 导出常量：`WEBDAV_SYNC_STATUS_KEY`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const WEBDAV_SYNC_STATUS_KEY = 'olyq.sync.webdav.status.v1';
/**
 * 导出常量：`S3_SYNC_KEY`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const S3_SYNC_KEY = 'olyq.sync.s3.v1';
/**
 * 导出常量：`S3_SYNC_STATUS_KEY`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const S3_SYNC_STATUS_KEY = 'olyq.sync.s3.status.v1';
/**
 * 导出常量：`SYNC_STATE_FILE_NAME`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const SYNC_STATE_FILE_NAME = 'olyq-sync-state.v1.json';

/** 导出类型：`SyncRunStatus`。 */
export interface SyncRunStatus {
  lastRunAt: number;
  ok: boolean;
  mode: 'sync';
  status?: SyncResult['status'];
  merged?: number;
  lastSyncedAt?: number;
  error?: I18nText;
}

/** 导出类型：`SyncRunStatusRecord`。 */
export type SyncRunStatusRecord = SyncRunStatus & Record<string, unknown>;

type WebDavSyncConfig = {
  url?: string;
  username?: string;
  password?: string;
  path?: string;
};

type S3SyncConfig = {
  endpoint?: string;
  region?: string;
  bucket?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  root?: string;
};

/**
 * 从 WebDAV 配置派生 secret vault 加密材料。
 *
 * @remarks
 * 这里只在本地内存中使用连接凭据；它们不会进入远端 `olyq-sync-state.v1.json`。
 */
function buildWebDavSecretKeyMaterial(config: WebDavSyncConfig): SyncSecretKeyMaterial {
  return {
    kind: 'webdav',
    url: typeof config.url === 'string' ? normalizeWebDavBase(config.url) : '',
    path: typeof config.path === 'string' ? normalizeWebDavPath(config.path) || '/olyq' : '/olyq',
    username: typeof config.username === 'string' ? config.username : '',
    password: typeof config.password === 'string' ? config.password : '',
  };
}

/** 从 S3 配置派生 secret vault 加密材料。 */
function buildS3SecretKeyMaterial(config: S3Config): SyncSecretKeyMaterial {
  return {
    kind: 's3',
    endpoint: config.endpoint,
    region: config.region,
    bucket: config.bucket,
    root: typeof config.root === 'string' ? config.root : 'olyq',
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  };
}

/**
 * 给普通远端后端包一层 secret vault 加密/解密。
 *
 * @remarks
 * 同步引擎只看到已解密的 secretConfig；
 * 远端只保存 `secretVault` 密文，且不会出现内部临时字段。
 */
function withEncryptedSecretVaultBackend(
  backend: SyncBackend,
  material: SyncSecretKeyMaterial,
): SyncBackend {
  return {
    pull: async () => {
      const state = await backend.pull();
      if (!state) return null;
      return {
        ...state,
        decryptedSecretConfig: await decryptSyncSecretVault(state.secretVault, material),
      };
    },
    push: async (state) => {
      const {
        decryptedSecretConfig: _decryptedSecretConfig,
        pendingSecretVault,
        ...publicState
      } = state;
      const nextState: SyncState = { ...publicState };
      if (pendingSecretVault) {
        const encrypted = await encryptSyncSecretVault(pendingSecretVault.snapshot, material, {
          nodeId: nextState.nodeId,
          updatedAt: pendingSecretVault.updatedAt,
        });
        if (encrypted) nextState.secretVault = encrypted;
        else delete nextState.secretVault;
      }
      await backend.push(nextState);
    },
  };
}

/**
 * 内部函数：`toHttpError`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function toHttpError(resp: Response, text: string) {
  const detail = String(text || resp.statusText || '').trim().slice(0, 500);
  return detail
    ? new I18nError('errors.httpRequestFailedWithDetail', { status: resp.status, statusText: resp.statusText, detail })
    : new I18nError('errors.httpRequestFailed', { status: resp.status, statusText: resp.statusText });
}

/**
 * 归一化 WebDAV 服务入口地址。
 *
 * @param url - 用户填写的 WebDAV 地址，可以携带服务端固定路径，例如 `/webdav`。
 * @returns 去掉尾部斜杠后的服务入口地址。
 */
export function normalizeWebDavBase(url: string) {
  return String(url || '').trim().replace(/\/+$/, '');
}

/**
 * 归一化 WebDAV 用户路径。
 *
 * @param path - 用户填写的远端目录。
 * @returns 以 `/` 开头的远端路径；空路径保持为空，交给调用方决定默认目录。
 */
export function normalizeWebDavPath(path: string) {
  const normalized = String(path || '').trim();
  if (!normalized) return '';
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

/**
 * 构建 WebDAV 状态同步文件 URL。
 *
 * @param url - WebDAV 服务入口地址。
 * @param path - 用户填写的 WebDAV 远端目录。
 * @returns 指向 `olyq-sync-state.v1.json` 的完整远端 URL。
 *
 * 说明：状态同步与 ZIP 快照共享同一个 WebDAV 路径目录，但文件名固定为
 * `olyq-sync-state.v1.json`。这里是状态同步 GET/PUT 与设置页展示的唯一真源，
 * 避免地址自带 `/webdav` 这类服务路径时被错误折叠到远端根目录。
 */
export function buildWebDavSyncUrl(url: string, path: string) {
  const base = normalizeWebDavBase(url);
  const rawPath = normalizeWebDavPath(path) || '/olyq';
  return `${base}${rawPath.replace(/\/+$/, '')}/${SYNC_STATE_FILE_NAME}`;
}

/**
 * 内部函数：`toBasicAuth`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function toBasicAuth(username: string, password: string) {
  const source = `${username}:${password}`;
  const bytes = new TextEncoder().encode(source);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, Math.min(bytes.length, index + chunkSize));
    binary += String.fromCharCode(...Array.from(chunk));
  }
  return `Basic ${btoa(binary)}`;
}

/**
 * 内部函数：`prepareLocalStateForSync`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
async function prepareLocalStateForSync() {
  await flushRegisteredPendingWrites();
  await flushSyncMetaPendingWrites().catch(() => undefined);
}

/**
 * 内部函数：`persistSyncStatus`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
async function persistSyncStatus(storageKey: string, status: SyncRunStatus) {
  await getStorageAdapter().set({ [storageKey]: status });
}

/**
 * 内部函数：`parseStructuredSyncState`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function parseStructuredSyncState(raw: string | null): unknown | null {
  const text = String(raw || '').trim();
  if (!text) return null;
  return JSON.parse(text) as unknown;
}

/**
 * 内部函数：`executeStructuredSync`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
async function executeStructuredSync(
  backend: SyncBackend,
  statusKey: string,
): Promise<SyncResult> {
  return await withPersistenceOperationLock(`sync:${statusKey}`, async () => {
    await prepareLocalStateForSync();
    try {
      const result = await runSync(backend, createRuntimeLocalStore());
      if (result.status !== 'error') {
        await broadcastStoreReloadSignal();
        await persistSyncStatus(statusKey, {
          lastRunAt: Date.now(),
          ok: true,
          mode: 'sync',
          status: result.status,
          merged: result.merged,
          lastSyncedAt: Date.now(),
        });
      } else {
        await persistSyncStatus(statusKey, {
          lastRunAt: Date.now(),
          ok: false,
          mode: 'sync',
          status: result.status,
          merged: result.merged,
          error: { key: 'errors.toolExecutionFailedWithDetail', params: { detail: result.error || 'sync failed' } },
        });
      }
      return result;
    } catch (error) {
      await persistSyncStatus(statusKey, {
        lastRunAt: Date.now(),
        ok: false,
        mode: 'sync',
        error: toI18nTextFromError(error),
      });
      throw error;
    }
  });
}

/**
 * 导出函数：`runWebDavStructuredSync`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function runWebDavStructuredSync(): Promise<SyncResult> {
  const storage = await getStorageAdapter().get([WEBDAV_SYNC_KEY]);
  const raw = storage[WEBDAV_SYNC_KEY];
  const config = (raw && typeof raw === 'object' ? raw : {}) as WebDavSyncConfig;
  const url = typeof config.url === 'string' ? config.url.trim() : '';
  if (!url) throw new I18nError('errors.webdavNotConfigured');
  const syncUrl = buildWebDavSyncUrl(url, typeof config.path === 'string' ? config.path : '/olyq');
  const authHeader = config.username || config.password
    ? toBasicAuth(String(config.username || ''), String(config.password || ''))
    : '';

  const backend: SyncBackend = {
    pull: async (): Promise<SyncState | null> => {
      const response = await fetch(syncUrl, {
        method: 'GET',
        headers: authHeader ? { Authorization: authHeader } : {},
      });
      if (response.status === 404) return null;
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw toHttpError(response, text);
      }
      return parseStructuredSyncState(await response.text().catch(() => '')) as SyncState | null;
    },
    push: async (state) => {
      const response = await fetch(syncUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
        body: JSON.stringify(state),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw toHttpError(response, text);
      }
    },
  };

  return await executeStructuredSync(
    withEncryptedSecretVaultBackend(backend, buildWebDavSecretKeyMaterial(config)),
    WEBDAV_SYNC_STATUS_KEY,
  );
}

/**
 * 内部函数：`toS3SyncConfig`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function toS3SyncConfig(raw: S3SyncConfig): S3Config {
  const endpoint = String(raw.endpoint || '').trim().replace(/\/+$/, '');
  const bucket = String(raw.bucket || '').trim();
  const accessKeyId = String(raw.accessKeyId || '').trim();
  const secretAccessKey = String(raw.secretAccessKey || '').trim();
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new I18nError('errors.s3NotConfigured');
  }
  return {
    endpoint,
    region: String(raw.region || 'us-east-1').trim() || 'us-east-1',
    bucket,
    accessKeyId,
    secretAccessKey,
    root: typeof raw.root === 'string' ? raw.root : 'olyq',
  };
}

/**
 * 内部函数：`buildS3SyncKey`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function buildS3SyncKey(config: S3Config) {
  const prefix = String(config.root || '').replace(/(^\/+)|(\/+$)/g, '');
  return prefix ? `${prefix}/${SYNC_STATE_FILE_NAME}` : SYNC_STATE_FILE_NAME;
}

/**
 * 导出函数：`runS3StructuredSync`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function runS3StructuredSync(): Promise<SyncResult> {
  const storage = await getStorageAdapter().get([S3_SYNC_KEY]);
  const raw = storage[S3_SYNC_KEY];
  const config = toS3SyncConfig((raw && typeof raw === 'object' ? raw : {}) as S3SyncConfig);
  const syncKey = buildS3SyncKey(config);

  const backend: SyncBackend = {
    pull: async (): Promise<SyncState | null> => {
      const files = await listObjects(config, syncKey);
      if (!files.some((item) => item.key === syncKey)) return null;
      return parseStructuredSyncState(await getObject(config, syncKey)) as SyncState | null;
    },
    push: async (state) => {
      await putObject(config, syncKey, JSON.stringify(state), 'application/json');
    },
  };

  return await executeStructuredSync(
    withEncryptedSecretVaultBackend(backend, buildS3SecretKeyMaterial(config)),
    S3_SYNC_STATUS_KEY,
  );
}

/**
 * 导出函数：`formatSyncRunError`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function formatSyncRunError(error: unknown, t: TFunction) {
  return formatI18nText(t, toI18nTextFromError(error));
}

/**
 * 导出函数：`clearRemoteS3SyncState`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function clearRemoteS3SyncState(): Promise<void> {
  const storage = await getStorageAdapter().get([S3_SYNC_KEY]);
  const raw = storage[S3_SYNC_KEY];
  const config = toS3SyncConfig((raw && typeof raw === 'object' ? raw : {}) as S3SyncConfig);
  await deleteObject(config, buildS3SyncKey(config));
}

/**
 * 导出常量：`CLOUD_SYNC_JSON_MIME_TYPE`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const CLOUD_SYNC_JSON_MIME_TYPE = 'application/json';
/**
 * 导出常量：`CLOUD_SYNC_BACKUP_MIME_TYPE`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const CLOUD_SYNC_BACKUP_MIME_TYPE = BACKUP_MIME_TYPE;
