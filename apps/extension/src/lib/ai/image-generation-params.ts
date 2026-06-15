/**
 * 说明：Paint 图片生成参数能力真源。
 *
 * 职责：
 * - 按 provider / model-family 解析图片生成的总张数、单次批量、参数支持状态与出站映射；
 * - 统一服务 Paint UI 与 Service Worker 出站构造，避免 UI、SW、provider adapter 各自判断；
 * - 对没有官方主文档或当前 SDK/adapter 稳定承接证据的能力标为 `unverified`，普通 UI 不展示也不下发。
 */
import { resolveImageGenerationCapabilityFromRegistry } from './image-generation-capability-registry'
import type { ProviderType } from './types'

/** 图片生成能力证据状态。 */
export type ImageGenerationSupportStatus = 'supported' | 'unsupported' | 'unverified'

/** 图片生成参数候选项。 */
export interface ImageGenerationParamOption {
  /** 写入请求参数的原始值。 */
  readonly value: string
}

/** 参数在运行时的映射位置。 */
export type ImageGenerationParamMapping =
  | { readonly kind: 'sdk'; readonly field: 'size' | 'aspectRatio' | 'seed' }
  | { readonly kind: 'providerOptions'; readonly providerKey: string; readonly field: string }

/** 单个标准参数能力描述。 */
export interface ImageGenerationParamCapability {
  /** 当前参数支持状态。 */
  readonly status: ImageGenerationSupportStatus
  /** UI 控件形态。 */
  readonly control: 'hidden' | 'enum' | 'integer'
  /** 可选枚举值。 */
  readonly options: readonly ImageGenerationParamOption[]
  /** 可选占位符。 */
  readonly placeholder?: string
  /** 支持时的出站映射。 */
  readonly mapping?: ImageGenerationParamMapping
}

/** 张数能力描述。 */
export interface ImageGenerationCountCapability {
  /** 产品层总张数最大值。 */
  readonly productMax: number
  /** 单次上游调用最多生成张数。 */
  readonly maxImagesPerCall: number
  /** `maxImagesPerCall` 的证据状态。 */
  readonly maxImagesPerCallStatus: ImageGenerationSupportStatus
  /** 当前单次张数最终映射说明。 */
  readonly nativeCountField: 'sdk:n' | 'provider:n' | 'provider:sampleCount' | 'provider:numberOfImages' | 'provider:batch_size' | 'unverified'
}

/** 高级 providerOptions 能力描述。 */
export interface ImageGenerationAdvancedProviderOptionsCapability {
  /** 是否允许高级 JSON 入口。 */
  readonly enabled: boolean
  /** 允许的 providerOptions namespace。 */
  readonly allowedProviderKeys: readonly string[]
  /** 这些字段由标准控件拥有，禁止高级 JSON 覆盖。 */
  readonly reservedKeys: readonly string[]
}

/** Paint 工作台完整图片生成能力描述。 */
export interface ImageGenerationCapability {
  /** 当前模型上下文归一化后的 provider 类型。 */
  readonly providerType: string
  /** 当前模型上下文归一化后的 provider ID。 */
  readonly providerId: string
  /** 当前模型身份字符串。 */
  readonly modelIdentity: string
  /** 张数能力。 */
  readonly count: ImageGenerationCountCapability
  /** 标准参数能力。 */
  readonly params: {
    readonly size: ImageGenerationParamCapability
    readonly aspectRatio: ImageGenerationParamCapability
    readonly quality: ImageGenerationParamCapability
    readonly seed: ImageGenerationParamCapability
  }
  /** 高级 providerOptions 能力。 */
  readonly advancedProviderOptions: ImageGenerationAdvancedProviderOptionsCapability
}

/** 解析图片生成能力所需的最小模型上下文。 */
export interface ResolveImageGenerationCapabilityInput {
  /** Provider 类型。 */
  readonly providerType?: ProviderType | string
  /** Provider 本地 ID。 */
  readonly providerId?: string
  /** Provider 原始模型 ID。 */
  readonly modelId?: string
  /** 模型目录解析出的基础模型身份键。 */
  readonly baseModelKey?: string
  /** 模型目录解析出的统一公共模型 ID。 */
  readonly canonicalId?: string
}

/** 旧调用面兼容类型：现在返回的是能力真源里的标准参数切片。 */
export interface ImageGenerationParamOptions {
  /** `size` 参数能力。 */
  readonly size: ImageGenerationParamCapability
  /** `aspectRatio` 参数能力。 */
  readonly aspectRatio: ImageGenerationParamCapability
  /** `quality` 参数能力。 */
  readonly quality: ImageGenerationParamCapability
  /** `seed` 参数能力。 */
  readonly seed: ImageGenerationParamCapability
}

/** Paint / UI 侧标准参数草稿。 */
export interface ImageGenerationStandardParamsInput {
  readonly size?: unknown
  readonly aspectRatio?: unknown
  readonly quality?: unknown
  readonly seed?: unknown
}

/** Service Worker 出站参数输入。 */
export interface BuildImageGenerationRequestInput extends ImageGenerationStandardParamsInput {
  readonly capability: ImageGenerationCapability
  readonly providerOptions?: unknown
}

/** Service Worker 可直接传给 AI SDK `generateImage()` 的受控参数。 */
export interface BuiltImageGenerationRequestParams {
  readonly maxImagesPerCall: number
  readonly size?: `${number}x${number}`
  readonly aspectRatio?: `${number}:${number}`
  readonly seed?: number
  readonly providerOptions?: Record<string, Record<string, unknown>>
}

/** 高级 providerOptions 校验结果。 */
export type ImageGenerationProviderOptionsValidationResult =
  | { readonly ok: true; readonly value: Record<string, Record<string, unknown>> }
  | { readonly ok: false; readonly messageKey: string; readonly params?: Record<string, string> }

/**
 * 解析 Paint 工作台的图片生成能力。
 *
 * @param input - 当前模型的 provider/model 上下文。
 * @returns UI 与 SW 共用的能力真源。
 */
export function resolveImageGenerationCapability(
  input: ResolveImageGenerationCapabilityInput | null | undefined,
): ImageGenerationCapability {
  return resolveImageGenerationCapabilityFromRegistry(input)
}

/**
 * 兼容旧调用名：返回当前能力真源的标准参数切片。
 *
 * @param input - 当前模型上下文。
 * @returns 标准参数能力。
 */
export function resolveImageGenerationParamOptions(
  input: ResolveImageGenerationCapabilityInput | null | undefined,
): ImageGenerationParamOptions {
  return resolveImageGenerationCapability(input).params
}

/**
 * 按能力真源过滤 Paint 普通参数，旧状态里的 unsupported / unverified 参数不会继续出站。
 *
 * @param capability - 当前模型能力。
 * @param params - Paint 标准参数草稿。
 * @returns 可安全作为普通 UI 值继续保存/发送的参数。
 */
export function filterSupportedImageGenerationStandardParams(
  capability: ImageGenerationCapability,
  params: ImageGenerationStandardParamsInput,
): {
  readonly size?: string
  readonly aspectRatio?: string
  readonly quality?: string
  readonly seed?: number
} {
  const out: { size?: string; aspectRatio?: string; quality?: string; seed?: number } = {}
  const size = sanitizeEnumParamValue(capability.params.size, params.size)
  if (size) out.size = size
  const aspectRatio = sanitizeEnumParamValue(capability.params.aspectRatio, params.aspectRatio)
  if (aspectRatio) out.aspectRatio = aspectRatio
  const quality = sanitizeEnumParamValue(capability.params.quality, params.quality)
  if (quality) out.quality = quality
  const seed = sanitizeSeed(capability.params.seed, params.seed)
  if (seed !== undefined) out.seed = seed
  return out
}

/**
 * 校验并解析高级 providerOptions JSON。
 *
 * @param capability - 当前模型能力。
 * @param raw - 用户输入 JSON 字符串。
 * @returns 通过时返回可下发 providerOptions；失败时返回 i18n key。
 */
export function parseImageGenerationProviderOptionsJson(
  capability: ImageGenerationCapability,
  raw: string,
): ImageGenerationProviderOptionsValidationResult {
  const text = String(raw || '').trim()
  if (!text) return { ok: true, value: {} }
  if (!capability.advancedProviderOptions.enabled) {
    return { ok: false, messageKey: 'paint.advancedProviderOptionsUnavailable' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, messageKey: 'paint.advancedProviderOptionsInvalidJson' }
  }

  if (!isPlainRecord(parsed)) {
    return { ok: false, messageKey: 'paint.advancedProviderOptionsObjectRequired' }
  }

  const allowed = new Set(capability.advancedProviderOptions.allowedProviderKeys.map((key) => key.trim()).filter(Boolean))
  const reserved = new Set(capability.advancedProviderOptions.reservedKeys.map((key) => key.trim()))
  const out: Record<string, Record<string, unknown>> = {}

  for (const [providerKeyRaw, value] of Object.entries(parsed)) {
    const providerKey = String(providerKeyRaw || '').trim()
    if (!providerKey) continue
    if (!allowed.has(providerKey)) {
      return {
        ok: false,
        messageKey: 'paint.advancedProviderOptionsProviderNotAllowed',
        params: { provider: providerKey, allowed: Array.from(allowed).join(', ') || '-' },
      }
    }
    if (!isPlainRecord(value)) {
      return { ok: false, messageKey: 'paint.advancedProviderOptionsNamespaceObjectRequired', params: { provider: providerKey } }
    }
    const namespace: Record<string, unknown> = {}
    for (const [keyRaw, entry] of Object.entries(value)) {
      const key = String(keyRaw || '').trim()
      if (!key) continue
      if (reserved.has(key)) {
        return { ok: false, messageKey: 'paint.advancedProviderOptionsReservedKey', params: { key } }
      }
      namespace[key] = entry
    }
    if (Object.keys(namespace).length > 0) out[providerKey] = namespace
  }

  return { ok: true, value: out }
}

/**
 * 基于能力真源构建 AI SDK 图片生成参数。
 *
 * @param input - 当前能力、标准参数与高级 providerOptions。
 * @returns 已过滤、已映射的出站参数。
 */
export function buildImageGenerationRequestParams(input: BuildImageGenerationRequestInput): BuiltImageGenerationRequestParams {
  const { capability } = input
  const standard = filterSupportedImageGenerationStandardParams(capability, input)
  const providerOptions = sanitizeProviderOptionsObject(capability, input.providerOptions)

  applyMappedParam(capability.params.quality, standard.quality, providerOptions)

  const out: {
    maxImagesPerCall: number
    size?: `${number}x${number}`
    aspectRatio?: `${number}:${number}`
    seed?: number
    providerOptions?: Record<string, Record<string, unknown>>
  } = {
    maxImagesPerCall: Math.max(1, Math.min(10, Math.floor(capability.count.maxImagesPerCall))),
  }

  if (standard.size && capability.params.size.mapping?.kind === 'sdk' && isImageSize(standard.size)) {
    out.size = standard.size
  }
  if (standard.aspectRatio && capability.params.aspectRatio.mapping?.kind === 'sdk' && isImageAspectRatio(standard.aspectRatio)) {
    out.aspectRatio = standard.aspectRatio
  }
  if (standard.seed !== undefined && capability.params.seed.mapping?.kind === 'sdk') {
    out.seed = standard.seed
  }
  if (Object.keys(providerOptions).length > 0) out.providerOptions = providerOptions

  return out
}

/**
 * 判断字符串是否符合 `{width}x{height}` 图片尺寸格式。
 *
 * @param v - 待判断的字符串。
 * @returns 符合 AI SDK 图片尺寸模板时返回 `true`。
 */
export function isImageSize(v: string): v is `${number}x${number}` {
  return /^\d+x\d+$/.test(v)
}

/**
 * 判断字符串是否符合 `{width}:{height}` 宽高比格式。
 *
 * @param v - 待判断的字符串。
 * @returns 符合 AI SDK 宽高比模板时返回 `true`。
 */
export function isImageAspectRatio(v: string): v is `${number}:${number}` {
  return /^\d+:\d+$/.test(v)
}

/**
 * 按能力枚举白名单清洗普通字符串参数。
 *
 * @param capability - 单个标准参数能力。
 * @param raw - UI 或旧状态里的原始值。
 * @returns 参数受支持且命中枚举时返回规范值。
 */
function sanitizeEnumParamValue(capability: ImageGenerationParamCapability, raw: unknown): string | undefined {
  if (capability.status !== 'supported' || capability.control !== 'enum') return undefined
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value) return undefined
  const allowed = new Set(capability.options.map((option) => option.value))
  return allowed.has(value) ? value : undefined
}

/**
 * 按整数控件能力清洗 seed。
 *
 * @param capability - seed 参数能力。
 * @param raw - UI 或旧状态里的原始值。
 * @returns 参数受支持且为有限数字时返回向下取整后的 seed。
 */
function sanitizeSeed(capability: ImageGenerationParamCapability, raw: unknown): number | undefined {
  if (capability.status !== 'supported' || capability.control !== 'integer') return undefined
  const value = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : undefined
  return value
}

/**
 * 把 providerOptions 映射型标准参数写入受控 namespace。
 *
 * @param capability - 单个标准参数能力。
 * @param value - 已清洗的标准参数值。
 * @param providerOptions - 正在构建的 providerOptions 对象。
 */
function applyMappedParam(
  capability: ImageGenerationParamCapability,
  value: string | number | undefined,
  providerOptions: Record<string, Record<string, unknown>>,
): void {
  if (value === undefined || capability.status !== 'supported') return
  const mapping = capability.mapping
  if (!mapping || mapping.kind !== 'providerOptions') return
  const key = mapping.providerKey
  const cur = isPlainRecord(providerOptions[key]) ? providerOptions[key] : {}
  providerOptions[key] = { ...cur, [mapping.field]: value }
}

/**
 * 过滤高级 providerOptions 对象，避免未知 namespace 和标准字段覆盖出站。
 *
 * @param capability - 当前模型能力。
 * @param raw - UI JSON 解析后的原始对象。
 * @returns 可以合并进 AI SDK 入参的 providerOptions。
 */
function sanitizeProviderOptionsObject(
  capability: ImageGenerationCapability,
  raw: unknown,
): Record<string, Record<string, unknown>> {
  if (!capability.advancedProviderOptions.enabled || !isPlainRecord(raw)) return {}
  const allowed = new Set(capability.advancedProviderOptions.allowedProviderKeys.map((key) => key.trim()).filter(Boolean))
  const reserved = new Set(capability.advancedProviderOptions.reservedKeys.map((key) => key.trim()).filter(Boolean))
  const out: Record<string, Record<string, unknown>> = {}
  for (const [key, value] of Object.entries(raw)) {
    const providerKey = String(key || '').trim()
    if (!providerKey || !allowed.has(providerKey) || !isPlainRecord(value)) continue
    const namespace: Record<string, unknown> = {}
    for (const [fieldRaw, entry] of Object.entries(value)) {
      const field = String(fieldRaw || '').trim()
      if (!field || reserved.has(field)) continue
      namespace[field] = entry
    }
    if (Object.keys(namespace).length > 0) out[providerKey] = namespace
  }
  return out
}

/**
 * 判断值是否为普通对象，避免数组、类实例和 null 被当成 providerOptions namespace。
 *
 * @param value - 待判断的未知值。
 * @returns 仅普通对象返回 `true`。
 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
}
