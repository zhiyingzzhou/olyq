/**
 * 说明：`id` 基础能力模块。
 *
 * 职责：
 * - 承载 `id` 相关的当前文件实现与模块边界；
 * - 对外暴露 `createId` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 统一的 ID 生成策略：
 * - 优先使用 `crypto.randomUUID()`：冲突概率更低
 * - 在不支持或异常时回退到"时间戳 + 随机数"：保证流程可用
 */
export function createId() {
  try {
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

