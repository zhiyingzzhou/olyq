/**
 * 说明：`identity` AI 能力模块。
 *
 * 职责：
 * - 承载 `identity` 相关的当前文件实现与模块边界；
 * - 对外暴露 `normalizePathText`、`normalizeVendorSlug`、`normalizeModelSlug` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 模型身份归一化工具。
 *
 * 说明：
 * - 本文件只处理字符串层面的 identity / key / canonicalId 归一化；
 * - 不再承载历史手工规则、协议匹配等旧链路逻辑；
 * - 所有公共身份、provider scoped 身份、alias 索引键都统一从这里生成。
 */

import type { ModelScope, ParsedCanonicalId } from './types'

/**
 * 需要从“基础模型身份”里剥离掉的 SKU / 营销后缀。
 *
 * 说明：
 * - 这些后缀通常只代表套餐、免费层、云托管层，不代表真正的基础模型血缘；
 * - `normalizeModelKey()` 仍然会保留它们，因为 raw 索引必须保真；
 * - `extractBaseModelKey()` / `normalizeModelSlug()` 才会去掉它们，用于跨平台归并。
 */
const GLOBAL_SUFFIX_PATTERNS = [/:free$/i, /\(free\)$/i, /:cloud$/i, /@[\w.-]+$/i]

/**
 * Fireworks 风格模型 ID 会把版本号中的 `.` 写成 `p`。
 *
 * 当前内部基础模型身份规则约定：
 * - `accounts/fireworks/models/deepseek-v3p2` 应视作 `deepseek-v3.2`
 * - `accounts/fireworks/models/kimi-k2p5` 应视作 `kimi-k2.5`
 *
 * 这里把版本归一前移到“基础模型身份”提取阶段，避免不同入口再次分叉。
 */
function normalizeFireworksVersionSyntax(raw: string): string {
  const text = String(raw || '')
  if (!text.toLowerCase().startsWith('accounts/fireworks/models/')) return text
  return text.replace(/(\d)p(?=\d)/gi, '$1.')
}

/**
 * 去掉已知的 SKU / 套餐 / 包装后缀。
 *
 * 说明：
 * - 这里只做“明确知道不会改变基础模型血缘”的裁剪；
 * - 不做模糊推断，不根据任意营销词猜测基础模型；
 * - 返回值仍保留路径结构，由调用方决定是否只取 leaf。
 */
function stripKnownBaseModelSuffixes(raw: string): string {
  let next = String(raw || '')
  for (const pattern of GLOBAL_SUFFIX_PATTERNS) {
    next = next.replace(pattern, '')
  }
  return next
}

/** 将任意文本归一成更稳定的路径片段。 */
export function normalizePathText(raw: string): string {
  return String(raw || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/\s+/g, '-')
    .replace(/\/{2,}/g, '/')
}

/** 归一化厂商标识。 */
export function normalizeVendorSlug(raw: string): string {
  const base = normalizePathText(raw)
    .replace(/(?:\.org|-org)$/g, '')
    .replace(/(?:\.ai|-ai)$/g, 'ai')
    .replace(/[^a-z0-9]+/g, '')
  return base || 'unknown'
}

/** 归一化模型主标识。 */
export function normalizeModelSlug(raw: string): string {
  const next = normalizePathText(stripKnownBaseModelSuffixes(raw))
    .replace(/[^a-z0-9:/@.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-./]+|[-./]+$/g, '')

  return next || 'unknown'
}

/**
 * 归一化模型索引键。
 *
 * 说明：
 * - 与 `normalizeModelSlug()` 的区别在于：这里不会剥离 `:free`、`\@128k` 等后缀；
 * - 这样 alias/providerMap 索引能精确保留 rawId 差异，避免不同商品 SKU 被压成同一个键。
 */
export function normalizeModelKey(raw: string): string {
  return (
    normalizePathText(raw)
      .replace(/[^a-z0-9:/@.-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-./]+|[-./]+$/g, '')
    || 'unknown'
  )
}

/**
 * 提取“基础模型身份键”。
 *
 * 规则固定如下：
 * 1. 先做 NFKC / trim / lower-case 归一；
 * 2. 对 Fireworks 风格路径先做 `v3p2 -\> v3.2` 版本归一；
 * 3. 取最后一个 `/` 片段，彻底去掉 provider / vendor 包装前缀；
 * 4. 去掉已知 SKU / 套餐后缀，如 `:free`、`(free)`、`:cloud`、`\@128k`；
 * 5. 最终走 `normalizeModelSlug()`，得到可稳定落盘和跨平台比对的基础模型键。
 *
 * 设计目的：
 * - 统一当前扩展内部的基础模型身份语义；
 * - 名称更明确：这里得到的不是展示名，而是“基础模型身份键”；
 * - 后续 alias 生成、跨 provider 自动归并、UI 展示都应优先围绕这个键工作。
 */
export function extractBaseModelKey(rawId: string): string {
  const normalizedPath = normalizePathText(normalizeFireworksVersionSyntax(rawId))
  const leaf = normalizedPath.split('/').filter(Boolean).pop() || normalizedPath
  return normalizeModelSlug(stripKnownBaseModelSuffixes(leaf))
}

/** 从路径中提取 vendor/model 片段。 */
export function splitVendorAndModelFromPath(normalizedModelId: string): {
  vendorPart?: string
  modelPart: string
} {
  const parts = normalizePathText(normalizedModelId).split('/').filter(Boolean)
  if (parts.length === 0) return { modelPart: 'unknown' }
  if (parts.length === 1) return { modelPart: parts[0] }
  return { vendorPart: parts[parts.length - 2], modelPart: parts[parts.length - 1] }
}

/** 从展示名称中提取 vendor:model 结构。 */
export function splitVendorAndModelFromDisplayName(rawDisplayName: string): {
  vendorPart?: string
  modelPart?: string
} {
  const text = String(rawDisplayName || '').trim()
  if (!text) return {}
  const idx = text.indexOf(':')
  if (idx < 0) return { modelPart: text }
  return {
    vendorPart: text.slice(0, idx).trim(),
    modelPart: text.slice(idx + 1).trim(),
  }
}

/** 构造公共 canonicalId。 */
export function buildPublicCanonicalId(vendorSlug: string, modelSlug: string): string {
  return `public::${normalizeVendorSlug(vendorSlug)}::${normalizeModelSlug(modelSlug)}`
}

/** 构造 provider/local scoped canonicalId。 */
export function buildScopedCanonicalId(
  scope: Exclude<ModelScope, 'public'>,
  providerType: string,
  providerId: string,
  rawModelId: string,
): string {
  const prefix = scope === 'local' ? 'local' : 'provider'
  return `${prefix}::${normalizeModelKey(providerType)}::${normalizeModelKey(providerId)}::${normalizeModelKey(rawModelId)}`
}

/** 构造 providerModelMap 的索引键。 */
export function buildProviderModelMapKey(providerType: string, providerId: string, rawModelId: string): string {
  return `${normalizeModelKey(providerType)}::${normalizeModelKey(providerId)}::${normalizeModelKey(rawModelId)}`
}

/** 构造 alias 索引键。 */
export function buildAliasKey(rawId: string, providerType?: string, providerId?: string): string {
  const type = providerType ? normalizeModelKey(providerType) : '*'
  const id = providerId ? normalizeModelKey(providerId) : '*'
  return `${type}::${id}::${normalizeModelKey(rawId)}`
}

/** 解析 canonicalId。 */
export function parseCanonicalId(canonicalId: string): ParsedCanonicalId | null {
  const raw = String(canonicalId || '').trim()
  if (!raw) return null

  const parts = raw.split('::').map((item) => item.trim()).filter(Boolean)
  if (parts.length === 0) return null

  if (parts[0] === 'public' && parts.length === 3) {
    return {
      canonicalId: raw,
      scope: 'public',
      vendorSlug: normalizeVendorSlug(parts[1]),
      modelSlug: normalizeModelSlug(parts[2]),
    }
  }

  if ((parts[0] === 'provider' || parts[0] === 'local') && parts.length === 4) {
    return {
      canonicalId: raw,
      scope: parts[0],
      providerTypeSlug: normalizeModelKey(parts[1]),
      providerIdSlug: normalizeModelKey(parts[2]),
      scopedModelSlug: normalizeModelKey(parts[3]),
    }
  }

  return null
}
