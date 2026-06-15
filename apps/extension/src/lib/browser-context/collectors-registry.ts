/**
 * 说明：`collectors-registry` 浏览器上下文 collector 注册表模块。
 *
 * 职责：
 * - 维护 sourceId 到 collector plugin 的唯一注册表；
 * - 为采集执行层和内置 collector 装配层提供稳定的查找入口；
 * - 避免各模块直接共享可变 Map，收口 registry owner。
 *
 * 边界：
 * - 本模块只管理 registry 生命周期，不负责 prompt 构建或 source cache；
 * - 不直接触发采集、副作用或 UI 状态更新；
 * - 内置 collector 的注册动作由 `collectors-builtins` 负责。
 */
import type { BrowserContextCollectorPlugin, BrowserContextSourceId } from './types';

const collectorRegistry = new Map<BrowserContextSourceId, BrowserContextCollectorPlugin>();

/**
 * 注册一个 browser-context collector。
 *
 * @param plugin - collector 插件定义。
 */
export function registerBrowserContextCollector(plugin: BrowserContextCollectorPlugin): void {
  collectorRegistry.set(plugin.id, plugin);
}

/**
 * 读取当前所有 collector。
 *
 * @returns registry 的快照数组。
 */
export function getBrowserContextCollectors(): BrowserContextCollectorPlugin[] {
  return Array.from(collectorRegistry.values());
}

/**
 * 按 sourceId 获取单个 collector。
 *
 * @param sourceId - source 标识。
 * @returns 命中的 collector；未注册时返回 `null`。
 */
export function getBrowserContextCollector(sourceId: BrowserContextSourceId): BrowserContextCollectorPlugin | null {
  return collectorRegistry.get(sourceId) ?? null;
}
