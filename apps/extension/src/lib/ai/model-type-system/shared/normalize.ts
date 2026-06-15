/**
 * 说明：`normalize` AI 能力模块。
 *
 * 职责：
 * - 承载 `normalize` 相关的当前文件实现与模块边界；
 * - 对外暴露 `uniqStrings`、`normalizeModelText`、`normalizeModelId` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 模型类型系统的基础归一化工具。
 *
 * 为什么单独拆出来：
 * - provider 规则、用户覆盖、展示层都会反复用到同一套字符串归一化逻辑；
 * - 把它们放到 shared 目录后，后续维护者不用在多个规则文件里复制粘贴。
 */

import type { ModelTypeDescriptor } from '../types'

/** 通用去重。 */
export function uniqStrings<T extends string>(items: ReadonlyArray<T> | undefined): T[] {
  return Array.from(new Set((items ?? []).filter(Boolean))) as T[]
}

/**
 * 统一归一化模型相关文本。
 *
 * @param raw - 原始文本，允许为空。
 * @returns 经过 Unicode 标准化、去首尾空白和小写化后的结果。
 */
export function normalizeModelText(raw: string | undefined | null): string {
  return String(raw || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
}

/**
 * 归一化用于规则匹配的模型 ID。
 *
 * 说明：
 * - 不主动去掉 `/`，因为跨聚合平台的 `vendor/model` 结构在规则匹配里很有用；
 * - 会统一下划线、空白与重复分隔符，降低规则表的噪音。
 */
export function normalizeModelId(raw: string | undefined | null): string {
  return normalizeModelText(raw)
    .replace(/_/g, '-')
    .replace(/\s+/g, '-')
    .replace(/\/{2,}/g, '/')
    .replace(/-+/g, '-')
}

/**
 * 归一化 Provider token。
 *
 * @param raw - Provider 标识原文。
 * @returns 仅保留字母、数字和连字符的 Provider token。
 */
export function normalizeProviderToken(raw: string | undefined | null): string {
  return normalizeModelId(raw).replace(/[^a-z0-9-]+/g, '')
}

/**
 * 获取更适合规则匹配的模型身份文本。
 *
 * @param descriptor - 模型描述符，只要求提供原始 ID 与名称。
 * @returns 优先使用模型 ID，其次回退模型名称的标准化结果。
 */
export function getNormalizedModelIdentity(descriptor: Pick<ModelTypeDescriptor, 'rawModelId' | 'rawModelName'>): string {
  return normalizeModelId(descriptor.rawModelId || descriptor.rawModelName || '')
}

/**
 * 获取标准化后的模型名称。
 *
 * @param descriptor - 模型描述符，只要求提供原始模型名称。
 * @returns 仅基于模型名称归一化后的结果。
 */
export function getNormalizedModelName(descriptor: Pick<ModelTypeDescriptor, 'rawModelName'>): string {
  return normalizeModelId(descriptor.rawModelName || '')
}
