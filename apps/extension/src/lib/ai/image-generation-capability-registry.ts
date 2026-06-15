/**
 * 说明：Paint 图片生成 provider/model-family 能力矩阵。
 *
 * 职责：
 * - 承载 provider / model-family 到图片生成参数能力的稳定映射；
 * - 把官方证据不足的能力保持为 `unverified`，避免 UI/runtime 扩大普通参数入口；
 * - 为 `image-generation-params.ts` 暴露单一 registry resolver。
 *
 * 边界：
 * - 本文件只描述能力矩阵与模型族判型；
 * - 高级 JSON 校验、普通参数过滤和 AI SDK 入参构建仍由 `image-generation-params.ts` 承担。
 */
import type {
  ImageGenerationAdvancedProviderOptionsCapability,
  ImageGenerationCapability,
  ImageGenerationCountCapability,
  ImageGenerationParamCapability,
  ImageGenerationParamMapping,
  ImageGenerationParamOption,
  ImageGenerationSupportStatus,
  ResolveImageGenerationCapabilityInput,
} from './image-generation-params'

const EMPTY_OPTION_LIST: readonly ImageGenerationParamOption[] = []

const COMMON_SIZE_VALUES = [
  '1024x1024',
  '1536x1024',
  '1024x1536',
  '1792x1024',
  '1024x1792',
  '512x512',
  '256x256',
] as const

const OPENAI_GPT_IMAGE_SIZE_VALUES = ['1024x1024', '1536x1024', '1024x1536'] as const
const OPENAI_DALL_E_3_SIZE_VALUES = ['1024x1024', '1792x1024', '1024x1792'] as const
const OPENAI_DALL_E_2_SIZE_VALUES = ['256x256', '512x512', '1024x1024'] as const
const OPENAI_GPT_IMAGE_QUALITY_VALUES = ['auto', 'low', 'medium', 'high'] as const
const OPENAI_DALL_E_3_QUALITY_VALUES = ['standard', 'hd'] as const
const OPENAI_DALL_E_2_QUALITY_VALUES = ['standard'] as const
const GOOGLE_IMAGEN_RATIO_VALUES = ['1:1', '3:4', '4:3', '9:16', '16:9'] as const
const GEMINI_IMAGE_RATIO_VALUES = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'] as const
const XAI_IMAGE_RATIO_VALUES = [
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '3:2',
  '2:3',
  '2:1',
  '1:2',
  '19.5:9',
  '9:19.5',
  '20:9',
  '9:20',
] as const
const XAI_IMAGE_QUALITY_VALUES = ['low', 'medium', 'high'] as const
const DASHSCOPE_QWEN_2_SIZE_VALUES = ['2688x1536', '1536x2688', '2048x2048', '2368x1728', '1728x2368'] as const
const DASHSCOPE_QWEN_FIXED_SIZE_VALUES = ['1664x928', '928x1664', '1328x1328', '1472x1104', '1104x1472'] as const
const DASHSCOPE_QWEN_RATIO_VALUES = ['1:1', '16:9', '9:16', '4:3', '3:4'] as const
const SILICONFLOW_KOLORS_SIZE_VALUES = ['1024x1024', '960x1280', '768x1024', '720x1440', '720x1280'] as const
const SILICONFLOW_QWEN_IMAGE_SIZE_VALUES = ['1328x1328', '1664x928', '928x1664', '1472x1140', '1140x1472', '1584x1056', '1056x1584'] as const
const BEDROCK_QUALITY_VALUES = ['standard', 'premium'] as const

const STANDARD_RESERVED_KEYS = [
  'n',
  'size',
  'image_size',
  'aspectRatio',
  'aspect_ratio',
  'quality',
  'seed',
  'sampleCount',
  'numberOfImages',
  'batch_size',
] as const

const UNSUPPORTED_PARAM: ImageGenerationParamCapability = Object.freeze({
  status: 'unsupported',
  control: 'hidden',
  options: EMPTY_OPTION_LIST,
})

const UNVERIFIED_PARAM: ImageGenerationParamCapability = Object.freeze({
  status: 'unverified',
  control: 'hidden',
  options: EMPTY_OPTION_LIST,
})

const DEFAULT_COUNT: ImageGenerationCountCapability = {
  productMax: 10,
  maxImagesPerCall: 1,
  maxImagesPerCallStatus: 'unverified',
  nativeCountField: 'unverified',
}

const DEFAULT_ADVANCED_OPTIONS: ImageGenerationAdvancedProviderOptionsCapability = {
  enabled: false,
  allowedProviderKeys: [],
  reservedKeys: STANDARD_RESERVED_KEYS,
}

const EMPTY_CAPABILITY: ImageGenerationCapability = {
  providerType: '',
  providerId: '',
  modelIdentity: '',
  count: DEFAULT_COUNT,
  params: {
    size: UNVERIFIED_PARAM,
    aspectRatio: UNVERIFIED_PARAM,
    quality: UNVERIFIED_PARAM,
    seed: UNVERIFIED_PARAM,
  },
  advancedProviderOptions: DEFAULT_ADVANCED_OPTIONS,
}

/**
 * 从 registry 解析 Paint 图片生成能力。
 *
 * @param input - 当前模型的 provider/model 上下文。
 * @returns UI 与 SW 共用的能力真源。
 */
export function resolveImageGenerationCapabilityFromRegistry(
  input: ResolveImageGenerationCapabilityInput | null | undefined,
): ImageGenerationCapability {
  if (!input) return EMPTY_CAPABILITY

  const providerType = normalize(input.providerType)
  const providerId = normalize(input.providerId)
  const modelIdentity = normalize([
    input.modelId,
    input.baseModelKey,
    input.canonicalId,
  ].filter(Boolean).join(' '))

  if (isOfficialOpenAiProvider(providerType, providerId)) {
    return resolveOfficialOpenAiCapability(providerType, providerId, modelIdentity)
  }

  if (providerType === 'gemini' || providerType === 'vertexai') {
    return resolveGoogleCapability(providerType, providerId, modelIdentity)
  }

  if (providerType === 'xai') {
    return withContext(providerType, providerId, modelIdentity, {
      count: countCapability(10, 3, 'supported', 'provider:n'),
      params: {
        size: UNSUPPORTED_PARAM,
        aspectRatio: enumParam(XAI_IMAGE_RATIO_VALUES, { mapping: { kind: 'sdk', field: 'aspectRatio' }, placeholder: '16:9' }),
        quality: enumParam(XAI_IMAGE_QUALITY_VALUES, { mapping: { kind: 'providerOptions', providerKey: 'xai', field: 'quality' }, placeholder: 'medium' }),
        seed: UNSUPPORTED_PARAM,
      },
      advancedProviderOptions: advancedOptions(['xai']),
    })
  }

  if (providerType === 'dashscope') {
    return resolveDashScopeCapability(providerType, providerId, modelIdentity)
  }

  if (providerType === 'siliconflow') {
    return resolveSiliconFlowCapability(providerType, providerId, modelIdentity)
  }

  if (providerType === 'aws-bedrock') {
    const isNovaCanvas = isBedrockNovaCanvasModel(modelIdentity)
    return withContext(providerType, providerId, modelIdentity, {
      count: countCapability(10, isNovaCanvas ? 5 : 1, isNovaCanvas ? 'supported' : 'unverified', 'provider:numberOfImages'),
      params: {
        size: enumParam(COMMON_SIZE_VALUES, { mapping: { kind: 'sdk', field: 'size' }, placeholder: '1024x1024' }),
        aspectRatio: UNSUPPORTED_PARAM,
        quality: enumParam(BEDROCK_QUALITY_VALUES, { mapping: { kind: 'providerOptions', providerKey: 'bedrock', field: 'quality' }, placeholder: 'standard' }),
        seed: integerParam({ mapping: { kind: 'sdk', field: 'seed' }, placeholder: '123' }),
      },
      advancedProviderOptions: advancedOptions(['bedrock']),
    })
  }

  if (isOpenAiCompatibleImageProvider(providerType)) {
    const key = providerId || providerType
    return withContext(providerType, providerId, modelIdentity, {
      count: countCapability(10, 1, 'unverified', 'unverified'),
      params: {
        size: UNVERIFIED_PARAM,
        aspectRatio: UNSUPPORTED_PARAM,
        quality: UNVERIFIED_PARAM,
        seed: UNSUPPORTED_PARAM,
      },
      advancedProviderOptions: advancedOptions(key ? [key] : []),
    })
  }

  return withContext(providerType, providerId, modelIdentity, {
    count: DEFAULT_COUNT,
    params: EMPTY_CAPABILITY.params,
    advancedProviderOptions: DEFAULT_ADVANCED_OPTIONS,
  })
}

/**
 * 解析官方 OpenAI 图片模型族能力。
 *
 * @param providerType - 归一化后的 provider type。
 * @param providerId - 归一化后的 provider id。
 * @param modelIdentity - 归一化后的模型身份串。
 * @returns OpenAI 官方图片能力。
 */
function resolveOfficialOpenAiCapability(providerType: string, providerId: string, modelIdentity: string): ImageGenerationCapability {
  if (isDallE3Model(modelIdentity)) {
    return withContext(providerType, providerId, modelIdentity, {
      count: countCapability(10, 1, 'supported', 'provider:n'),
      params: {
        size: enumParam(OPENAI_DALL_E_3_SIZE_VALUES, { mapping: { kind: 'sdk', field: 'size' }, placeholder: '1024x1024' }),
        aspectRatio: UNSUPPORTED_PARAM,
        quality: enumParam(OPENAI_DALL_E_3_QUALITY_VALUES, { mapping: { kind: 'providerOptions', providerKey: 'openai', field: 'quality' }, placeholder: 'standard' }),
        seed: UNSUPPORTED_PARAM,
      },
      advancedProviderOptions: advancedOptions(['openai']),
    })
  }

  if (isDallE2Model(modelIdentity)) {
    return withContext(providerType, providerId, modelIdentity, {
      count: countCapability(10, 10, 'supported', 'provider:n'),
      params: {
        size: enumParam(OPENAI_DALL_E_2_SIZE_VALUES, { mapping: { kind: 'sdk', field: 'size' }, placeholder: '1024x1024' }),
        aspectRatio: UNSUPPORTED_PARAM,
        quality: enumParam(OPENAI_DALL_E_2_QUALITY_VALUES, { mapping: { kind: 'providerOptions', providerKey: 'openai', field: 'quality' }, placeholder: 'standard' }),
        seed: UNSUPPORTED_PARAM,
      },
      advancedProviderOptions: advancedOptions(['openai']),
    })
  }

  if (isGptImageModel(modelIdentity) || isChatGptImageModel(modelIdentity)) {
    return withContext(providerType, providerId, modelIdentity, {
      count: countCapability(10, 10, 'supported', 'provider:n'),
      params: {
        size: enumParam(OPENAI_GPT_IMAGE_SIZE_VALUES, { mapping: { kind: 'sdk', field: 'size' }, placeholder: '1024x1024' }),
        aspectRatio: UNSUPPORTED_PARAM,
        quality: enumParam(OPENAI_GPT_IMAGE_QUALITY_VALUES, { mapping: { kind: 'providerOptions', providerKey: 'openai', field: 'quality' }, placeholder: 'auto' }),
        seed: UNSUPPORTED_PARAM,
      },
      advancedProviderOptions: advancedOptions(['openai']),
    })
  }

  return withContext(providerType, providerId, modelIdentity, {
    count: countCapability(10, 1, 'unverified', 'unverified'),
    params: {
      size: UNVERIFIED_PARAM,
      aspectRatio: UNSUPPORTED_PARAM,
      quality: UNVERIFIED_PARAM,
      seed: UNSUPPORTED_PARAM,
    },
    advancedProviderOptions: advancedOptions(['openai']),
  })
}

/**
 * 解析 Google Gemini API / Vertex AI 图片能力。
 *
 * @param providerType - 归一化后的 provider type。
 * @param providerId - 归一化后的 provider id。
 * @param modelIdentity - 归一化后的模型身份串。
 * @returns Google 图片能力。
 */
function resolveGoogleCapability(providerType: string, providerId: string, modelIdentity: string): ImageGenerationCapability {
  const key = providerType === 'vertexai' ? 'vertex' : 'google'
  if (isGeminiImageModel(modelIdentity)) {
    return withContext(providerType, providerId, modelIdentity, {
      count: countCapability(10, 1, 'supported', 'sdk:n'),
      params: {
        size: UNSUPPORTED_PARAM,
        aspectRatio: enumParam(GEMINI_IMAGE_RATIO_VALUES, { mapping: { kind: 'sdk', field: 'aspectRatio' }, placeholder: '1:1' }),
        quality: UNSUPPORTED_PARAM,
        seed: UNSUPPORTED_PARAM,
      },
      advancedProviderOptions: advancedOptions([key]),
    })
  }

  return withContext(providerType, providerId, modelIdentity, {
    count: countCapability(10, 4, 'supported', 'provider:sampleCount'),
    params: {
      size: UNSUPPORTED_PARAM,
      aspectRatio: enumParam(GOOGLE_IMAGEN_RATIO_VALUES, { mapping: { kind: 'sdk', field: 'aspectRatio' }, placeholder: '1:1' }),
      quality: UNSUPPORTED_PARAM,
      seed: UNSUPPORTED_PARAM,
    },
    advancedProviderOptions: advancedOptions([key]),
  })
}

/**
 * 解析 DashScope Qwen / Wanx 图片能力。
 *
 * @param providerType - 归一化后的 provider type。
 * @param providerId - 归一化后的 provider id。
 * @param modelIdentity - 归一化后的模型身份串。
 * @returns DashScope 图片能力。
 */
function resolveDashScopeCapability(providerType: string, providerId: string, modelIdentity: string): ImageGenerationCapability {
  const qwen = isDashScopeQwenImageModel(modelIdentity)
  const qwen2 = isDashScopeQwenImage2Model(modelIdentity)
  const qwenEditMulti = isDashScopeQwenImageEditMultiModel(modelIdentity)
  const wan = isDashScopeWanImageModel(modelIdentity)
  const qwenMaxImagesPerCall = qwen2 || qwenEditMulti ? 6 : 1
  return withContext(providerType, providerId, modelIdentity, {
    count: countCapability(10, qwen ? qwenMaxImagesPerCall : wan ? 4 : 1, qwen || wan ? 'supported' : 'unverified', qwen || wan ? 'provider:n' : 'unverified'),
    params: {
      size: qwen
        ? enumParam(qwen2 ? DASHSCOPE_QWEN_2_SIZE_VALUES : DASHSCOPE_QWEN_FIXED_SIZE_VALUES, { mapping: { kind: 'sdk', field: 'size' }, placeholder: qwen2 ? '2048x2048' : '1664x928' })
        : wan
          ? enumParam(COMMON_SIZE_VALUES, { mapping: { kind: 'sdk', field: 'size' }, placeholder: '1024x1024' })
          : UNVERIFIED_PARAM,
      aspectRatio: qwen
        ? enumParam(DASHSCOPE_QWEN_RATIO_VALUES, { mapping: { kind: 'sdk', field: 'aspectRatio' }, placeholder: '1:1' })
        : UNSUPPORTED_PARAM,
      quality: UNSUPPORTED_PARAM,
      seed: qwen ? integerParam({ mapping: { kind: 'sdk', field: 'seed' }, placeholder: '123' }) : UNSUPPORTED_PARAM,
    },
    advancedProviderOptions: advancedOptions(['dashscope']),
  })
}

/**
 * 解析 SiliconFlow 图片能力。
 *
 * @param providerType - 归一化后的 provider type。
 * @param providerId - 归一化后的 provider id。
 * @param modelIdentity - 归一化后的模型身份串。
 * @returns SiliconFlow 图片能力。
 */
function resolveSiliconFlowCapability(providerType: string, providerId: string, modelIdentity: string): ImageGenerationCapability {
  const supportsBatch = isSiliconFlowKolorsModel(modelIdentity)
  const supportsSize = !isSiliconFlowQwenImageEditModel(modelIdentity)
  const sizeValues = supportsBatch ? SILICONFLOW_KOLORS_SIZE_VALUES : SILICONFLOW_QWEN_IMAGE_SIZE_VALUES
  return withContext(providerType, providerId, modelIdentity, {
    count: countCapability(10, supportsBatch ? 4 : 1, supportsBatch ? 'supported' : 'unsupported', supportsBatch ? 'provider:batch_size' : 'sdk:n'),
    params: {
      size: supportsSize ? enumParam(sizeValues, { mapping: { kind: 'sdk', field: 'size' }, placeholder: sizeValues[0] }) : UNSUPPORTED_PARAM,
      aspectRatio: UNSUPPORTED_PARAM,
      quality: UNSUPPORTED_PARAM,
      seed: integerParam({ mapping: { kind: 'sdk', field: 'seed' }, placeholder: '123' }),
    },
    advancedProviderOptions: advancedOptions([providerId || 'siliconflow']),
  })
}

/**
 * 给能力对象补回当前解析上下文。
 *
 * @param providerType - 归一化后的 provider type。
 * @param providerId - 归一化后的 provider id。
 * @param modelIdentity - 归一化后的模型身份串。
 * @param capability - 不含上下文的能力描述。
 * @returns 完整图片生成能力描述。
 */
function withContext(
  providerType: string,
  providerId: string,
  modelIdentity: string,
  capability: Omit<ImageGenerationCapability, 'providerType' | 'providerId' | 'modelIdentity'>,
): ImageGenerationCapability {
  return {
    providerType,
    providerId,
    modelIdentity,
    ...capability,
  }
}

/**
 * 构造张数能力对象。
 *
 * @param productMax - 产品层允许的最大总张数。
 * @param maxImagesPerCall - 单次上游调用最大张数。
 * @param maxImagesPerCallStatus - 单次批量能力证据状态。
 * @param nativeCountField - 当前张数字段映射说明。
 * @returns 张数能力描述。
 */
function countCapability(
  productMax: number,
  maxImagesPerCall: number,
  maxImagesPerCallStatus: ImageGenerationSupportStatus,
  nativeCountField: ImageGenerationCountCapability['nativeCountField'],
): ImageGenerationCountCapability {
  return {
    productMax,
    maxImagesPerCall,
    maxImagesPerCallStatus,
    nativeCountField,
  }
}

/**
 * 构造枚举型标准参数能力。
 *
 * @param values - 允许的枚举值。
 * @param args - 出站映射与占位符。
 * @returns 标准参数能力描述。
 */
function enumParam(
  values: readonly string[],
  args: {
    mapping: ImageGenerationParamMapping
    placeholder?: string
  },
): ImageGenerationParamCapability {
  return {
    status: 'supported',
    control: 'enum',
    options: toOptions(values),
    placeholder: args.placeholder,
    mapping: args.mapping,
  }
}

/**
 * 构造整数型标准参数能力。
 *
 * @param args - 出站映射与占位符。
 * @returns 标准参数能力描述。
 */
function integerParam(args: {
  mapping: ImageGenerationParamMapping
  placeholder?: string
}): ImageGenerationParamCapability {
  return {
    status: 'supported',
    control: 'integer',
    options: EMPTY_OPTION_LIST,
    placeholder: args.placeholder,
    mapping: args.mapping,
  }
}

/**
 * 构造高级 providerOptions 能力对象。
 *
 * @param allowedProviderKeys - 允许的 providerOptions namespace。
 * @returns 高级 providerOptions 能力描述。
 */
function advancedOptions(allowedProviderKeys: readonly string[]): ImageGenerationAdvancedProviderOptionsCapability {
  const keys = Array.from(new Set(allowedProviderKeys.map((key) => key.trim()).filter(Boolean)))
  return {
    enabled: keys.length > 0,
    allowedProviderKeys: keys,
    reservedKeys: STANDARD_RESERVED_KEYS,
  }
}

/**
 * 把字符串候选值转换为去重后的参数选项。
 *
 * @param values - 原始候选值。
 * @returns 可供 UI 渲染的参数选项。
 */
function toOptions(values: readonly string[]): readonly ImageGenerationParamOption[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
    .map((value) => ({ value }))
}

/**
 * 归一化 provider/model 身份串。
 *
 * @param value - 原始值。
 * @returns 小写裁剪后的字符串。
 */
function normalize(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

/**
 * 判断 provider 是否为官方 OpenAI 图片路径。
 *
 * @param providerType - 归一化后的 provider type。
 * @param providerId - 归一化后的 provider id。
 * @returns 官方 OpenAI provider 返回 `true`。
 */
function isOfficialOpenAiProvider(providerType: string, providerId: string): boolean {
  return providerId === 'openai' || providerType === 'openai-response'
}

/**
 * 判断 provider 是否属于默认未验证的 OpenAI-compatible 图片路径。
 *
 * @param providerType - 归一化后的 provider type。
 * @returns 属于未验证兼容 provider 时返回 `true`。
 */
function isOpenAiCompatibleImageProvider(providerType: string): boolean {
  return providerType === 'openai' || providerType === 'azure-openai' || providerType === 'new-api' || providerType === 'gateway' || providerType === 'ollama'
}

/**
 * 判断模型是否属于 GPT Image 系列。
 *
 * @param modelIdentity - 归一化后的模型身份串。
 * @returns 匹配 GPT Image 系列时返回 `true`。
 */
function isGptImageModel(modelIdentity: string): boolean {
  return /\bgpt-image-[\w.-]+/.test(modelIdentity)
}

/**
 * 判断模型是否属于 ChatGPT Image 系列。
 *
 * @param modelIdentity - 归一化后的模型身份串。
 * @returns 匹配 ChatGPT Image 系列时返回 `true`。
 */
function isChatGptImageModel(modelIdentity: string): boolean {
  return /\bchatgpt-image-[\w.-]+/.test(modelIdentity)
}

/**
 * 判断模型是否为 DALL-E 3。
 *
 * @param modelIdentity - 归一化后的模型身份串。
 * @returns 匹配 DALL-E 3 时返回 `true`。
 */
function isDallE3Model(modelIdentity: string): boolean {
  return /\bdall-e-3\b/.test(modelIdentity)
}

/**
 * 判断模型是否为 DALL-E 2。
 *
 * @param modelIdentity - 归一化后的模型身份串。
 * @returns 匹配 DALL-E 2 时返回 `true`。
 */
function isDallE2Model(modelIdentity: string): boolean {
  return /\bdall-e-2\b/.test(modelIdentity)
}

/**
 * 判断模型是否为 Gemini image 模型。
 *
 * @param modelIdentity - 归一化后的模型身份串。
 * @returns 匹配 Gemini image 模型时返回 `true`。
 */
function isGeminiImageModel(modelIdentity: string): boolean {
  return /\bgemini-[\w.-]*image[\w.-]*\b/.test(modelIdentity)
}

/**
 * 判断模型是否属于 DashScope Qwen Image 家族。
 *
 * @param modelIdentity - 归一化后的模型身份串。
 * @returns 匹配 Qwen Image 家族时返回 `true`。
 */
function isDashScopeQwenImageModel(modelIdentity: string): boolean {
  return /\bqwen-image[\w.-]*\b/.test(modelIdentity)
}

/**
 * 判断模型是否属于 DashScope Qwen Image 2.0 家族。
 *
 * @param modelIdentity - 归一化后的模型身份串。
 * @returns 匹配 Qwen Image 2.0 时返回 `true`。
 */
function isDashScopeQwenImage2Model(modelIdentity: string): boolean {
  return /\bqwen-image-2\.0[\w.-]*\b/.test(modelIdentity)
}

/**
 * 判断模型是否属于 DashScope Qwen Image Edit max/plus。
 *
 * @param modelIdentity - 归一化后的模型身份串。
 * @returns 匹配多图编辑模型时返回 `true`。
 */
function isDashScopeQwenImageEditMultiModel(modelIdentity: string): boolean {
  return /\bqwen-image-edit-(?:max|plus)\b/.test(modelIdentity)
}

/**
 * 判断模型是否属于 DashScope Wan/Wanx 文生图家族。
 *
 * @param modelIdentity - 归一化后的模型身份串。
 * @returns 匹配 Wan/Wanx 家族时返回 `true`。
 */
function isDashScopeWanImageModel(modelIdentity: string): boolean {
  return /\bwanx?[\w.-]*\b/.test(modelIdentity)
}

/**
 * 判断模型是否属于 SiliconFlow Qwen Image Edit 家族。
 *
 * @param modelIdentity - 归一化后的模型身份串。
 * @returns 匹配 Qwen Image Edit 时返回 `true`。
 */
function isSiliconFlowQwenImageEditModel(modelIdentity: string): boolean {
  return /\bqwen\/qwen-image-edit[\w.-]*\b/.test(modelIdentity)
}

/**
 * 判断模型是否为 SiliconFlow Kolors。
 *
 * @param modelIdentity - 归一化后的模型身份串。
 * @returns 匹配 `Kwai-Kolors/Kolors` 时返回 `true`。
 */
function isSiliconFlowKolorsModel(modelIdentity: string): boolean {
  return /\bkwai-kolors\/kolors\b/.test(modelIdentity)
}

/**
 * 判断模型是否为 Bedrock Nova Canvas。
 *
 * @param modelIdentity - 归一化后的模型身份串。
 * @returns 匹配 Nova Canvas 时返回 `true`。
 */
function isBedrockNovaCanvasModel(modelIdentity: string): boolean {
  return /\bamazon\.nova-canvas-v1(?::0)?\b/.test(modelIdentity)
}
