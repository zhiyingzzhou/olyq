/**
 * 说明：`type-guards` 基础能力模块。
 *
 * 职责：
 * - 承载 `type-guards` 相关的当前文件实现与模块边界；
 * - 对外暴露 `UnknownRecord`、`isRecord`、`isPlainRecord` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/** 未知键值对象的统一别名。 */
export type UnknownRecord = Record<string, unknown>;

/**
 * 宽松的"对象"判定，用于解析外部输入/存储数据时做最低限度的保护。
 *
 * 约束：此判断不排除数组（`typeof [] === 'object'`）；若业务需要排除数组，请在调用方额外判断。
 */
export function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null;
}

/**
 * 更严格的对象判定：排除数组。
 * - JSON.parse 的"对象"预期通常是 plain object（而不是 array），用它能避免把数组误当成配置对象读取字段。
 */
export function isPlainRecord(v: unknown): v is UnknownRecord {
  return isRecord(v) && !Array.isArray(v);
}
