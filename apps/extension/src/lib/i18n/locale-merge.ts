/**
 * 说明：`locale-merge` 国际化资源合并工具。
 *
 * 职责：
 * - 合并同一语言目录下拆分存放的 locale JSON；
 * - 阻断 `__proto__`、`prototype`、`constructor` 这类原型污染键；
 * - 为运行时 i18n 初始化和 locale audit 测试提供同一套安全策略。
 *
 * 边界：
 * - 本模块只处理 JSON-like locale 资源对象；
 * - 不读取文件系统、不访问 storage，也不调用 i18next。
 */

/** locale 资源对象的最小结构。 */
export type LocaleResourceRecord = Record<string, unknown>;

/** 判断 locale key 是否会触发原型污染。 */
function isBlockedLocaleKey(key: string): boolean {
  return key === '__proto__' || key === 'prototype' || key === 'constructor';
}

/**
 * 判断值是否为可合并的普通对象。
 *
 * @param value - 待判断的值。
 * @returns `true` 表示值可作为 locale 对象继续递归合并。
 */
export function isLocaleResourceRecord(value: unknown): value is LocaleResourceRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * 创建无原型 locale 对象。
 *
 * @returns 不继承 `Object.prototype` 的 locale 资源容器。
 */
export function createLocaleResourceRecord(): LocaleResourceRecord {
  return Object.create(null) as LocaleResourceRecord;
}

/** 安全读取 locale 容器自有字段，避免沿原型链取值参与合并。 */
function getLocaleResourceValue(target: LocaleResourceRecord, key: string): unknown {
  return Object.getOwnPropertyDescriptor(target, key)?.value;
}

/** 安全写入 locale 字段，所有动态 key 写入都必须先经过污染键过滤。 */
function setLocaleResourceValue(target: LocaleResourceRecord, key: string, value: unknown): void {
  if (isBlockedLocaleKey(key)) return;
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

/**
 * 安全合并 locale 资源对象。
 *
 * @param target - 目标对象，会被原地修改。
 * @param source - 来源对象。
 * @returns 合并后的目标对象。
 */
export function safeDeepMergeLocaleResources<T extends LocaleResourceRecord>(
  target: T,
  source: LocaleResourceRecord,
): T {
  for (const [key, value] of Object.entries(source)) {
    if (isBlockedLocaleKey(key)) continue;
    const current = getLocaleResourceValue(target, key);
    if (isLocaleResourceRecord(value) && isLocaleResourceRecord(current)) {
      safeDeepMergeLocaleResources(current, value);
      continue;
    }
    if (isLocaleResourceRecord(value)) {
      setLocaleResourceValue(target, key, safeCloneLocaleResource(value));
      continue;
    }
    setLocaleResourceValue(target, key, value);
  }
  return target;
}

/**
 * 克隆 locale 资源对象，并在克隆过程中丢弃原型污染键。
 *
 * @param source - 来源对象。
 * @returns 无原型的安全 clone。
 */
export function safeCloneLocaleResource(source: LocaleResourceRecord): LocaleResourceRecord {
  return safeDeepMergeLocaleResources(createLocaleResourceRecord(), source);
}
