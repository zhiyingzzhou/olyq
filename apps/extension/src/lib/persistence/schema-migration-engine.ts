/**
 * 说明：`schema-migration-engine` 持久化模块。
 *
 * 职责：
 * - 承载 `schema-migration-engine` 相关的当前文件实现与模块边界；
 * - 对外暴露 `runStartupPersistenceMigrations`、`upgradeImportedDomainData` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { ensurePersistenceDomainsRegistered } from './domains';
import { persistenceDomainRegistry } from './registry';
import { removeBootstrapStoredJsonMirror } from '@/lib/storage/json-storage';
import { deleteWorkspaceSnapshot } from './workspace-db';

const OBSOLETE_VIDEO_WORKSPACE_STORAGE_KEY = 'video.workspace.v1';
const OBSOLETE_VIDEO_WORKSPACE_BOOTSTRAP_KEY = 'olyq.video.workspace.v1';

/** 清理已经下线的 Video 工作区持久化残留。 */
async function clearObsoleteVideoWorkspaceState(): Promise<void> {
  await deleteWorkspaceSnapshot(OBSOLETE_VIDEO_WORKSPACE_STORAGE_KEY);
  removeBootstrapStoredJsonMirror(OBSOLETE_VIDEO_WORKSPACE_BOOTSTRAP_KEY);
}

/**
 * 导出函数：`runStartupPersistenceMigrations`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function runStartupPersistenceMigrations(): Promise<void> {
  await clearObsoleteVideoWorkspaceState();
  ensurePersistenceDomainsRegistered();
  const domains = persistenceDomainRegistry.list();
  for (const domain of domains) {
    if (typeof domain.startupMigrate === 'function') {
      await domain.startupMigrate();
    }
    if (typeof domain.flush === 'function') {
      await domain.flush();
    }
  }
}

/**
 * 导出函数：`upgradeImportedDomainData`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function upgradeImportedDomainData(
  domainId: string,
  data: unknown,
  options: {
    fromVersion: number;
  },
): Promise<unknown> {
  const domain = persistenceDomainRegistry.get(domainId);
  if (!domain) return data;
  if (typeof domain.migrateImported === 'function') {
    return await domain.migrateImported(data, { fromVersion: options.fromVersion });
  }
  return typeof domain.validate === 'function' ? domain.validate(data) : data;
}
