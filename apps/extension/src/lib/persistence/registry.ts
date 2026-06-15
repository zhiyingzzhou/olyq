/**
 * 说明：`registry` 持久化模块。
 *
 * 职责：
 * - 承载 `registry` 相关的当前文件实现与模块边界；
 * - 对外暴露 `persistenceDomainRegistry` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { PersistenceDomainDescriptor, PersistenceRegisteredDomain } from './types';

/**
 * 注册一个具备具体数据类型的持久化域。
 *
 * 说明：
 * - 每个 domain factory 都保留自己的 `TData/TRollback`，便于调用点获得类型检查；
 * - registry 对外只消费 erased 的 `PersistenceRegisteredDomain`，这里集中完成类型擦除；
 * - 避免注册点继续使用双重断言，也避免每个 domain 各自复制一套包装逻辑。
 *
 * @param domain - 具备具体数据与回滚类型的持久化域描述。
 */
export function registerPersistenceDomain<TData, TRollback>(
  domain: PersistenceDomainDescriptor<TData, TRollback>,
): void {
  persistenceDomainRegistry.register({
    ...domain,
    validate: domain.validate ? (value) => domain.validate!(value) : undefined,
    captureRollback: domain.captureRollback ? () => domain.captureRollback!() : undefined,
    restore: (value, options) => domain.restore(value as TData, options),
    rollback: domain.rollback ? (state) => domain.rollback!(state as TRollback) : undefined,
    migrateImported: domain.migrateImported ? (value, context) => domain.migrateImported!(value, context) : undefined,
  });
}

class PersistenceDomainRegistryImpl {
  private readonly domains = new Map<string, PersistenceRegisteredDomain>();

    /**
   * 内部方法：`register`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  register<T extends PersistenceRegisteredDomain>(domain: T): T {
    const id = String(domain.id || '').trim();
    if (!id) throw new Error('persistence domain id is required');
    if (this.domains.has(id)) throw new Error(`persistence domain already registered: ${id}`);
    this.domains.set(id, domain);
    return domain;
  }

    /**
   * 内部方法：`get`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  get<T extends PersistenceRegisteredDomain = PersistenceRegisteredDomain>(id: string): T | null {
    const key = String(id || '').trim();
    return (this.domains.get(key) as T | undefined) ?? null;
  }

    /**
   * 内部方法：`list`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  list(): PersistenceRegisteredDomain[] {
    return Array.from(this.domains.values());
  }

    /**
   * 内部方法：`listByPolicy`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  listByPolicy(policy: {
    backupProfile?: 'full' | 'lite';
  }): PersistenceRegisteredDomain[] {
    const profile = policy.backupProfile;
    return this.list().filter((domain) => !profile || domain.backupProfiles.includes(profile));
  }
}

/**
 * 导出常量：`persistenceDomainRegistry`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const persistenceDomainRegistry = new PersistenceDomainRegistryImpl();
