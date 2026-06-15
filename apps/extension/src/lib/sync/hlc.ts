/**
 * 说明：`hlc` 同步模块。
 *
 * 职责：
 * - 承载 `hlc` 相关的当前文件实现与模块边界；
 * - 对外暴露 `HLCTimestamp`、`compareHLC`、`serializeHLC` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 用于多端同步冲突解决的混合逻辑时钟（HLC, Hybrid Logical Clock）。
 *
 * 每个浏览器实例会生成唯一的 nodeId。时间戳按字典序比较：
 * 比较规则：wallTime \> logical \> nodeId。
 *
 * 参考：
 * - Kulkarni 等, "Logical Physical Clocks and Consistent Snapshots in Globally Distributed Databases" (2014)
 */

import { I18nError } from '@/lib/i18n/error';
import { logger } from '@/lib/logger';
import { readBootstrapStoredJsonSeed, writeStoredJson } from '@/lib/storage/json-storage';

/**
 * HLC 时间戳结构。
 *
 * 说明：
 * - 同时携带物理时间、逻辑计数器和节点 ID，用于多端合并时的稳定排序；
 * - 该结构可序列化到本地存储与同步元数据中。
 */
export interface HLCTimestamp {
  /** 物理时间（毫秒） */
  wallTime: number;
  /** 逻辑计数器（用于区分同一 wallTime 下的多个事件） */
  logical: number;
  /** 节点唯一标识 */
  nodeId: string;
}

const HLC_STORAGE_KEY = 'olyq.sync.hlc.v1';

/** 本地持久化的 HLC 状态（用于在 SW 重启后维持时间戳单调递增） */
interface StoredHlcState {
  /** 节点唯一标识（每个浏览器实例生成一次） */
  nodeId?: string;
  /** 最近一次签发的时间戳 */
  last?: HLCTimestamp;
}

/** 内存中的 HLC 状态（loadState 的返回值） */
interface HlcState {
  /** 节点唯一标识 */
  nodeId: string;
  /** 最近一次签发的时间戳 */
  last: HLCTimestamp;
}

/** 生成当前浏览器实例的随机 nodeId。 */
function generateNodeId(): string {
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 从 localStorage 读取 HLC 状态。
 *
 * 说明：
 * - 读取失败或状态损坏时会自动重建 nodeId 与初始时间戳；
 * - 这样可以保证 HLC 在任意环境下都至少能提供单调递增语义。
 */
function loadState(): HlcState {
  const parsed = readBootstrapStoredJsonSeed<StoredHlcState | null>(HLC_STORAGE_KEY, null, (raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const record = raw as Record<string, unknown>;
    return {
      nodeId: typeof record.nodeId === 'string' ? record.nodeId : undefined,
      last: record.last as HLCTimestamp | undefined,
    };
  });

  if (parsed?.nodeId && parsed.last) {
    return { nodeId: parsed.nodeId, last: parsed.last };
  }

  const nodeId = generateNodeId();
  const last: HLCTimestamp = { wallTime: 0, logical: 0, nodeId };
  return { nodeId, last };
}

// 修复 L-5：节流 saveState，避免每次 logical++ 都同步写 localStorage
let _saveTimer: ReturnType<typeof setTimeout> | null = null;
let _lastSavedWallTime = 0;

/**
 * 持久化当前 HLC 状态。
 *
 * 说明：
 * - 当 wallTime 变化时立即写入，确保关键时间推进及时落盘；
 * - 仅 logical 连续递增时做 500ms 合并写，减少高频 localStorage 抖动。
 */
function saveState(nodeId: string, last: HLCTimestamp) {
  // 当 wallTime 变化时立即持久化（频率 ≤ 1次/ms，实际远低于此）
  if (last.wallTime !== _lastSavedWallTime) {
    _lastSavedWallTime = last.wallTime;
    if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
    void writeStoredJson(HLC_STORAGE_KEY, { nodeId, last }).catch(() => undefined);
    return;
  }
  // 仅 logical 递增：延迟 500ms 合并写入
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    void writeStoredJson(HLC_STORAGE_KEY, { nodeId, last }).catch(() => undefined);
  }, 500);
}

/**
 * 比较两个 HLC 时间戳：
 * - a \< b 返回负数
 * - a \> b 返回正数
 * - 相等返回 0
 */
export function compareHLC(a: HLCTimestamp, b: HLCTimestamp): number {
  if (a.wallTime !== b.wallTime) return a.wallTime - b.wallTime;
  if (a.logical !== b.logical) return a.logical - b.logical;
  if (a.nodeId < b.nodeId) return -1;
  if (a.nodeId > b.nodeId) return 1;
  return 0;
}

/**
 * 将 HLC 时间戳序列化为紧凑且可按字典序排序的字符串。
 * 格式：`\<wallTime(hex13)\>-\<logical(hex4)\>-\<nodeId\>`
 */
export function serializeHLC(ts: HLCTimestamp): string {
  const w = ts.wallTime.toString(16).padStart(13, '0');
  const l = ts.logical.toString(16).padStart(4, '0');
  return `${w}-${l}-${ts.nodeId}`;
}

/**
 * 从 serializeHLC 生成的字符串反序列化出 HLC 时间戳。
 */
export function deserializeHLC(s: string): HLCTimestamp {
  const parts = s.split('-');
  if (parts.length < 3) throw new I18nError('errors.hlcInvalidString');
  return {
    wallTime: Number.parseInt(parts[0], 16),
    logical: Number.parseInt(parts[1], 16),
    nodeId: parts.slice(2).join('-'),
  };
}

/**
 * 当前浏览器实例的 HLC 时钟单例。
 */
export class HybridLogicalClock {
  private nodeId: string;
  private last: HLCTimestamp;

  constructor() {
    const state = loadState();
    this.nodeId = state.nodeId;
    this.last = state.last;
  }

  /** 获取该时钟实例的 nodeId */
  getNodeId(): string {
    return this.nodeId;
  }

  /** 获取最近一次签发的时间戳 */
  getLast(): HLCTimestamp {
    return { ...this.last };
  }

  /**
   * 为本地事件签发新时间戳，并保证单调递增。
   */
  now(): HLCTimestamp {
    const physicalNow = Date.now();
    let ts: HLCTimestamp;

    if (physicalNow > this.last.wallTime) {
      ts = { wallTime: physicalNow, logical: 0, nodeId: this.nodeId };
    } else {
      ts = { wallTime: this.last.wallTime, logical: this.last.logical + 1, nodeId: this.nodeId };
    }

    this.last = ts;
    saveState(this.nodeId, this.last);
    return ts;
  }

  /**
   * 接收远端时间戳并与本地时钟合并。
   * 用于从其他节点接收同步数据时更新本地时钟。
   */
  receive(remote: HLCTimestamp): HLCTimestamp {
    const physicalNow = Date.now();

    // 修复 H-2：拒绝远端时钟漂移超过 60 秒的时间戳，防止永久污染本地 HLC
    const MAX_DRIFT_MS = 60_000;
    let safeRemote = remote;
    if (remote.wallTime > physicalNow + MAX_DRIFT_MS) {
      logger.backup.warn('hlc remote clock drift clamped', { remoteWallTime: remote.wallTime, localWallTime: physicalNow });
      safeRemote = { ...remote, wallTime: physicalNow + MAX_DRIFT_MS };
    }

    const maxWall = Math.max(physicalNow, this.last.wallTime, safeRemote.wallTime);

    let logical: number;

    if (maxWall === this.last.wallTime && maxWall === safeRemote.wallTime) {
      // 三者相等：logical 取两者最大值再 +1
      logical = Math.max(this.last.logical, safeRemote.logical) + 1;
    } else if (maxWall === this.last.wallTime) {
      logical = this.last.logical + 1;
    } else if (maxWall === safeRemote.wallTime) {
      logical = safeRemote.logical + 1;
    } else {
      // 当前物理时间最大（physicalNow）
      logical = 0;
    }

    const ts: HLCTimestamp = { wallTime: maxWall, logical, nodeId: this.nodeId };
    this.last = ts;
    saveState(this.nodeId, this.last);
    return ts;
  }
}

// 单例实例
let _clock: HybridLogicalClock | null = null;

/** 获取当前浏览器实例共享的 HLC 单例。 */
export function getHLC(): HybridLogicalClock {
  if (!_clock) _clock = new HybridLogicalClock();
  return _clock;
}
