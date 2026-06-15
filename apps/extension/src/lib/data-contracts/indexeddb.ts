/**
 * 说明：`indexeddb` 数据契约模块。
 *
 * 职责：
 * - 登记当前 v1 IndexedDB / workspace 域的公开数据契约摘要；
 * - 为 registry guard 和根级文档提供 object store 级别的稳定真源；
 * - 明确哪些大对象可备份、可云同步或只保留在本地设备。
 *
 * 边界：
 * - 本文件只声明 IndexedDB 域摘要；
 * - 不读写 IndexedDB，也不替代各仓储模块的 schema 校验；
 * - 当前协议只维护 v1。
 */
import { DATA_CONTRACT_VERSION } from './policies';

/** IndexedDB / workspace 域的当前 `v1` 数据契约摘要，供 guard 和文档对齐。 */
export const INDEXEDDB_DATA_CONTRACTS = [
  {
    key: 'olyq.chat.v1',
    owner: 'chat.messages',
    storage: 'indexeddb',
    schemaVersion: DATA_CONTRACT_VERSION,
    exportPolicy: 'included',
    syncPolicy: 'included',
    sensitive: false,
    conflictPolicy: 'append-merge',
    cleanupPolicy: 'authoritative-replace',
  },
  {
    key: 'olyq.attachments.v1',
    owner: 'attachments',
    storage: 'indexeddb',
    schemaVersion: DATA_CONTRACT_VERSION,
    exportPolicy: 'included',
    syncPolicy: 'device-local',
    sensitive: false,
    conflictPolicy: 'replace',
    cleanupPolicy: 'delete-on-clear',
  },
  {
    key: 'olyq.persistence.workspace.v1',
    owner: 'workspace',
    storage: 'indexeddb',
    schemaVersion: DATA_CONTRACT_VERSION,
    exportPolicy: 'included',
    syncPolicy: 'included',
    sensitive: false,
    conflictPolicy: 'key-lww',
    cleanupPolicy: 'authoritative-replace',
  },
] as const;
