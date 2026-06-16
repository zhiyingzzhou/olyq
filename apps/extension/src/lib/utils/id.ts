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
import { createSecureId } from '@/lib/utils/secure-id';

/**
 * 统一的 ID 生成策略：
 * - 只使用 Web Crypto 随机源；
 * - 缺少安全随机能力时直接抛错，不回退到弱随机。
 */
export function createId() {
  return createSecureId();
}
