/**
 * 说明：`maintenance` 持久化模块。
 *
 * 职责：
 * - 承载 `maintenance` 相关的当前文件实现与模块边界；
 * - 对外暴露 `PersistenceMaintenanceSummary`、`summarizeRegisteredPersistenceDomains`、`clearRegisteredPersistenceDomains` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { ensurePersistenceDomainsRegistered } from './domains';
import { persistenceDomainRegistry } from './registry';

/** 导出类型：`PersistenceMaintenanceSummary`。 */
export type PersistenceMaintenanceSummary = {
  generatedAt: string;
  domains: Array<{
    id: string;
    backend: string;
    backupProfiles: string[];
    itemCount: number;
    bytes: number;
    detail?: Record<string, unknown>;
  }>;
};

/**
 * 导出函数：`summarizeRegisteredPersistenceDomains`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function summarizeRegisteredPersistenceDomains(): Promise<PersistenceMaintenanceSummary> {
  ensurePersistenceDomainsRegistered();
  const domains = persistenceDomainRegistry.list();
  const summaries = await Promise.all(domains.map(async (domain) => {
    const summary = typeof domain.summarize === 'function'
      ? await domain.summarize()
      : { itemCount: 0, bytes: 0 };
    return {
      id: domain.id,
      backend: domain.backend,
      backupProfiles: [...domain.backupProfiles],
      itemCount: summary.itemCount,
      bytes: summary.bytes,
      ...(summary.detail ? { detail: summary.detail } : {}),
    };
  }));

  return {
    generatedAt: new Date().toISOString(),
    domains: summaries.sort((left, right) => left.id.localeCompare(right.id)),
  };
}

/**
 * 导出函数：`clearRegisteredPersistenceDomains`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function clearRegisteredPersistenceDomains(): Promise<void> {
  ensurePersistenceDomainsRegistered();
  for (const domain of persistenceDomainRegistry.list()) {
    if (typeof domain.clear === 'function') {
      await domain.clear();
    }
  }
}
