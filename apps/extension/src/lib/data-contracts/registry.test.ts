/**
 * 说明：Data Contract Registry v1 guard。
 *
 * 职责：
 * - 守住 shared-storage 持久 key 必须全部登记 schema / sync / export / secret policy；
 * - 拒绝未登记 key 进入备份或 structured sync；
 * - 防止开源后再出现隐式数据契约漂移。
 */
import { describe, expect, it } from 'vitest';

import {
  CLOUD_SYNC_PLAIN_CONFIG_KEYS,
  CLOUD_SYNC_SECRET_CONFIG_KEYS,
  DATA_CONTRACT_VERSION,
  INDEXEDDB_DATA_CONTRACTS,
  SHARED_STORAGE_BACKUP_KEYS,
  SHARED_STORAGE_CONTRACTS,
  SHARED_STORAGE_CONTRACT_BY_KEY,
  normalizeSharedStorageSnapshot,
} from './registry';
import { PROVIDER_API_KEY_ROTATION_STATE_STORAGE_KEY } from '@/lib/ai/storage-keys';

describe('data contract registry v1', () => {
  it('每个 shared-storage key 都必须声明当前 v1 schema 和策略', () => {
    expect(SHARED_STORAGE_CONTRACTS.length).toBeGreaterThan(0);

    for (const contract of SHARED_STORAGE_CONTRACTS) {
      if (contract.syncPolicy !== 'cache') expect(contract.key).toMatch(/\.v1$/);
      expect(contract.schemaVersion).toBe(DATA_CONTRACT_VERSION);
      expect(contract.owner).toBeTruthy();
      expect(contract.exportPolicy).toMatch(/^(included|excluded)$/);
      expect(contract.syncPolicy).toMatch(/^(included|encrypted-secret|device-local|cache)$/);
      expect(contract.conflictPolicy).toMatch(/^(field-lww|key-lww|replace|append-merge|cache)$/);
      expect(contract.cleanupPolicy).toMatch(/^(authoritative-replace|delete-on-clear|rebuildable-cache)$/);
      expect(typeof contract.normalize).toBe('function');
    }
  });

  it('备份、云同步明文和 secret key 集合都必须能回查到契约', () => {
    for (const key of [
      ...SHARED_STORAGE_BACKUP_KEYS,
      ...CLOUD_SYNC_PLAIN_CONFIG_KEYS,
      ...CLOUD_SYNC_SECRET_CONFIG_KEYS,
    ]) {
      expect(SHARED_STORAGE_CONTRACT_BY_KEY.get(key), key).toBeTruthy();
    }
  });

  it('shared-storage snapshot 会拒绝未登记 key', () => {
    expect(() => normalizeSharedStorageSnapshot({
      'olyq.quick-phrases.v1': [],
      'olyq.unknown.v1': {},
    })).toThrow(/unexpected shared storage key/);
  });

  it('Provider API Key 轮询状态只作为可重建 cache 保存下标', () => {
    const contract = SHARED_STORAGE_CONTRACT_BY_KEY.get(PROVIDER_API_KEY_ROTATION_STATE_STORAGE_KEY);
    expect(contract).toMatchObject({
      owner: 'providers',
      exportPolicy: 'excluded',
      syncPolicy: 'cache',
      sensitive: false,
      conflictPolicy: 'cache',
      cleanupPolicy: 'rebuildable-cache',
    });
    expect(contract?.normalize({
      openai: 1.9,
      bad: 'sk-should-not-survive',
      empty: -1,
      '': 2,
    })).toEqual({ openai: 1 });
  });

  it('IndexedDB 契约也固定在 v1 且声明同步/备份策略', () => {
    expect(INDEXEDDB_DATA_CONTRACTS.length).toBeGreaterThan(0);
    for (const contract of INDEXEDDB_DATA_CONTRACTS) {
      expect(contract.key).toMatch(/\.v1$/);
      expect(contract.schemaVersion).toBe(DATA_CONTRACT_VERSION);
      expect(contract.exportPolicy).toBeTruthy();
      expect(contract.syncPolicy).toBeTruthy();
      expect(contract.cleanupPolicy).toBeTruthy();
    }
  });
});
