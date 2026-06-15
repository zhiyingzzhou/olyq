/**
 * 说明：`memory-settings` 记忆模块。
 *
 * 职责：
 * - 承载 `memory-settings` 相关的当前文件实现与模块边界；
 * - 对外暴露 `loadMemoryConfig`、`saveMemoryConfig`、`getMemoryConfig` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 全局记忆配置持久化（v1）
 *
 * 约束：
 * - 使用共享存储作为真源，localStorage 只保留 bootstrap mirror 派生缓存
 * - Service Worker 侧无法直接读 localStorage，因此每次对话会把配置随请求参数传给 SW
 */

import {
  createSharedJsonConfigChannel,
} from '@/lib/storage/shared-json-config-channel';
import { DEFAULT_MEMORY_CONFIG, type GlobalMemoryConfig } from './types';
import {
  MEMORY_CONFIG_STORAGE_KEY,
  normalizeMemoryConfig,
} from './memory-settings-schema';

export {
  MEMORY_CONFIG_STORAGE_KEY,
  normalizeMemoryConfig,
} from './memory-settings-schema';

/** 当前全局记忆配置在 localStorage 中使用的固定存储 key。 */
const STORAGE_KEY = MEMORY_CONFIG_STORAGE_KEY;
const MEMORY_CONFIG_EVENT = 'olyq:memory-config-changed';

/**
 * 内部函数：`cloneConfig`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function cloneConfig(config: GlobalMemoryConfig): GlobalMemoryConfig {
  return { ...config };
}

/**
 * 内部函数：`isSameConfig`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function isSameConfig(left: GlobalMemoryConfig, right: GlobalMemoryConfig): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

const memoryConfigChannel = createSharedJsonConfigChannel<GlobalMemoryConfig>({
  storageKey: STORAGE_KEY,
  fallback: DEFAULT_MEMORY_CONFIG,
  normalize: normalizeMemoryConfig,
  clone: cloneConfig,
  isEqual: isSameConfig,
  bootstrap: {
    bootstrapSource: 'bootstrap-mirror',
  },
  sameWindowSignal: {
    type: 'custom-event',
    eventName: MEMORY_CONFIG_EVENT,
  },
});

/**
 * 从缓存读取全局记忆配置。
 *
 * 失败策略：
 * - key 不存在：返回默认配置副本；
 * - bootstrap mirror 过期或损坏：返回默认配置副本；
 * - 数据结构不完整或字段非法：通过 `normalizeMemoryConfig` 修正后返回。
 */
export function loadMemoryConfig(): GlobalMemoryConfig {
  return memoryConfigChannel.getSnapshot();
}

/**
 * 持久化全局记忆配置，并向 UI 广播配置已更新事件。
 *
 * 说明：
 * - 写入前会再次调用 `normalizeMemoryConfig`，确保最终落盘的数据一定是规范结构；
 * - 事件名 `olyq:memory-config-changed` 由设置页、按钮状态等 UI 模块监听，用于即时刷新。
 */
export function saveMemoryConfig(next: GlobalMemoryConfig) {
  memoryConfigChannel.save(next);
}

/**
 * 同步读取当前全局记忆配置。
 *
 * 该函数本质上是 `loadMemoryConfig` 的语义别名：
 * - 用在 UI 侧时，调用方可以更明确地表达“我要拿当前配置值”；
 * - 保持同步返回，方便初始化 `useState` / 即时按钮态判断。
 */
export function getMemoryConfig(): GlobalMemoryConfig {
  return loadMemoryConfig();
}

/**
 * 判断“记忆功能是否已具备最基本的可运行配置”。
 *
 * 当前规则：
 * - 必须配置 `embeddingModel`
 * - 必须配置 `llmModel`
 *
 * 说明：
 * - `rerankModel` 只是增强项，不是启用记忆的硬前置条件；
 * - `enabled` 开关不在这里判断，这个函数只回答“配置是否完整”。
 */
export function isMemoryConfigured(cfg: GlobalMemoryConfig): boolean {
  const embeddingModel = typeof cfg.embeddingModel === 'string' ? cfg.embeddingModel.trim() : '';
  const llmModel = typeof cfg.llmModel === 'string' ? cfg.llmModel.trim() : '';
  return Boolean(embeddingModel && llmModel);
}

/**
 * 订阅记忆配置变化。
 *
 * 说明：
 * - 共享存储负责跨视图同步；
 * - 当前窗口事件只用于本页即时回流和兼容旧监听方。
 */
export function subscribeMemoryConfigChange(callback: () => void): () => void {
  return memoryConfigChannel.subscribe(callback);
}

void memoryConfigChannel.refreshFromStorage();
