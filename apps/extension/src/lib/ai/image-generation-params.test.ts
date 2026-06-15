/**
 * 说明：图片生成参数能力真源测试。
 *
 * 职责：
 * - 覆盖 provider/model 到 count、size、aspectRatio、quality、seed 的三态能力映射；
 * - 确保普通参数只按 supported 能力出站，高级 providerOptions 不得覆盖标准字段。
 */
import { describe, expect, it } from 'vitest'

import {
  buildImageGenerationRequestParams,
  filterSupportedImageGenerationStandardParams,
  parseImageGenerationProviderOptionsJson,
  resolveImageGenerationCapability,
} from './image-generation-params'

/** 取出参数候选值列表，方便断言顺序和值域。 */
function values(options: readonly { value: string }[]): string[] {
  return options.map((option) => option.value)
}

describe('resolveImageGenerationCapability', () => {
  it('为官方 OpenAI GPT Image 推荐固定尺寸和质量档位，并声明单次 10 张', () => {
    const capability = resolveImageGenerationCapability({
      providerType: 'openai',
      providerId: 'openai',
      modelId: 'gpt-image-1.5',
    })

    expect(capability.count).toMatchObject({ productMax: 10, maxImagesPerCall: 10, maxImagesPerCallStatus: 'supported' })
    expect(values(capability.params.size.options)).toEqual(['1024x1024', '1536x1024', '1024x1536'])
    expect(capability.params.aspectRatio.status).toBe('unsupported')
    expect(values(capability.params.quality.options)).toEqual(['auto', 'low', 'medium', 'high'])
    expect(capability.params.seed.status).toBe('unsupported')
  })

  it('DALL-E 3 的产品总张数仍为 10，但单次调用固定 1 张', () => {
    const capability = resolveImageGenerationCapability({
      providerType: 'openai',
      providerId: 'openai',
      modelId: 'dall-e-3',
    })

    expect(capability.count.productMax).toBe(10)
    expect(capability.count.maxImagesPerCall).toBe(1)
    expect(values(capability.params.size.options)).toEqual(['1024x1024', '1792x1024', '1024x1792'])
    expect(values(capability.params.quality.options)).toEqual(['standard', 'hd'])
  })

  it('OpenAI-compatible provider 不扩普通参数能力，只开放高级命名空间', () => {
    const capability = resolveImageGenerationCapability({
      providerType: 'openai',
      providerId: 'openrouter',
      modelId: 'openai/gpt-image-1',
    })

    expect(capability.count).toMatchObject({ maxImagesPerCall: 1, maxImagesPerCallStatus: 'unverified' })
    expect(capability.params.size.status).toBe('unverified')
    expect(capability.params.quality.status).toBe('unverified')
    expect(capability.advancedProviderOptions.allowedProviderKeys).toEqual(['openrouter'])
  })

  it('Gemini image 模型总张数通过单图多次调用达成，并只暴露宽高比', () => {
    const capability = resolveImageGenerationCapability({
      providerType: 'gemini',
      providerId: 'google',
      modelId: 'gemini-2.5-flash-image',
    })

    expect(capability.count).toMatchObject({ productMax: 10, maxImagesPerCall: 1, maxImagesPerCallStatus: 'supported' })
    expect(capability.params.size.status).toBe('unsupported')
    expect(values(capability.params.aspectRatio.options)).toContain('21:9')
    expect(capability.params.seed.status).toBe('unsupported')
  })

  it('Imagen 模型暴露宽高比，单次按 sampleCount 最多 4 张，不暴露 seed', () => {
    const capability = resolveImageGenerationCapability({
      providerType: 'vertexai',
      providerId: 'vertex',
      modelId: 'imagen-4.0-generate-preview-06-06',
    })

    expect(capability.count).toMatchObject({ maxImagesPerCall: 4, nativeCountField: 'provider:sampleCount' })
    expect(values(capability.params.aspectRatio.options)).toEqual(['1:1', '3:4', '4:3', '9:16', '16:9'])
    expect(capability.params.seed.status).toBe('unsupported')
    expect(capability.advancedProviderOptions.allowedProviderKeys).toEqual(['vertex'])
  })

  it('xAI 使用宽高比和 quality providerOptions，不暴露 size/seed', () => {
    const capability = resolveImageGenerationCapability({
      providerType: 'xai',
      providerId: 'xai',
      modelId: 'grok-imagine-image-pro',
    })

    expect(capability.count.maxImagesPerCall).toBe(3)
    expect(capability.params.size.status).toBe('unsupported')
    expect(values(capability.params.aspectRatio.options)).toContain('20:9')
    expect(capability.params.quality.mapping).toEqual({ kind: 'providerOptions', providerKey: 'xai', field: 'quality' })
    expect(capability.params.seed.status).toBe('unsupported')
  })

  it('DashScope Qwen Image 使用固定尺寸/比例/seed，单次 1 张', () => {
    const capability = resolveImageGenerationCapability({
      providerType: 'dashscope',
      providerId: 'dashscope',
      modelId: 'qwen-image',
    })

    expect(capability.count.maxImagesPerCall).toBe(1)
    expect(values(capability.params.size.options)).toEqual(['1664x928', '928x1664', '1328x1328', '1472x1104', '1104x1472'])
    expect(values(capability.params.aspectRatio.options)).toEqual(['1:1', '16:9', '9:16', '4:3', '3:4'])
    expect(capability.params.seed.status).toBe('supported')
  })

  it('DashScope Qwen 2.0 与 edit max/plus 按模型族声明单次最多 6 张', () => {
    const qwen2 = resolveImageGenerationCapability({
      providerType: 'dashscope',
      providerId: 'dashscope',
      modelId: 'qwen-image-2.0',
    })
    const editMax = resolveImageGenerationCapability({
      providerType: 'dashscope',
      providerId: 'dashscope',
      modelId: 'qwen-image-edit-max',
    })

    expect(qwen2.count).toMatchObject({ maxImagesPerCall: 6, nativeCountField: 'provider:n' })
    expect(values(qwen2.params.size.options)).toEqual(['2688x1536', '1536x2688', '2048x2048', '2368x1728', '1728x2368'])
    expect(editMax.count).toMatchObject({ maxImagesPerCall: 6, nativeCountField: 'provider:n' })
    expect(editMax.params.seed.status).toBe('supported')
  })

  it('SiliconFlow 只给 Kolors 声明批量字段，Qwen Edit 不暴露 size', () => {
    const edit = resolveImageGenerationCapability({
      providerType: 'siliconflow',
      providerId: 'siliconflow',
      modelId: 'Qwen/Qwen-Image-Edit',
    })
    const kolors = resolveImageGenerationCapability({
      providerType: 'siliconflow',
      providerId: 'siliconflow',
      modelId: 'Kwai-Kolors/Kolors',
    })

    expect(edit.count.maxImagesPerCall).toBe(1)
    expect(edit.params.size.status).toBe('unsupported')
    expect(kolors.count.maxImagesPerCall).toBe(4)
    expect(kolors.count.nativeCountField).toBe('provider:batch_size')
    expect(values(kolors.params.size.options)).toEqual(['1024x1024', '960x1280', '768x1024', '720x1440', '720x1280'])
  })

  it('Bedrock Nova Canvas 使用 size/quality/seed 和 numberOfImages', () => {
    const capability = resolveImageGenerationCapability({
      providerType: 'aws-bedrock',
      providerId: 'bedrock',
      modelId: 'amazon.nova-canvas-v1:0',
    })

    expect(capability.count).toMatchObject({ maxImagesPerCall: 5, nativeCountField: 'provider:numberOfImages' })
    expect(values(capability.params.size.options)).toContain('1024x1024')
    expect(values(capability.params.quality.options)).toEqual(['standard', 'premium'])
    expect(capability.params.seed.status).toBe('supported')
  })
})

describe('image generation request params', () => {
  it('过滤 unsupported / unverified 普通参数', () => {
    const capability = resolveImageGenerationCapability({
      providerType: 'openai',
      providerId: 'openrouter',
      modelId: 'openai/gpt-image-1',
    })

    expect(filterSupportedImageGenerationStandardParams(capability, {
      size: '1024x1024',
      aspectRatio: '16:9',
      quality: 'high',
      seed: 123,
    })).toEqual({})
  })

  it('把 quality 映射到明确 providerOptions namespace，并禁止高级 JSON 覆盖标准字段', () => {
    const capability = resolveImageGenerationCapability({
      providerType: 'xai',
      providerId: 'xai',
      modelId: 'grok-imagine-image-pro',
    })

    expect(parseImageGenerationProviderOptionsJson(capability, '{"xai":{"quality":"high"}}')).toEqual({
      ok: false,
      messageKey: 'paint.advancedProviderOptionsReservedKey',
      params: { key: 'quality' },
    })

    const request = buildImageGenerationRequestParams({
      capability,
      aspectRatio: '16:9',
      quality: 'high',
      providerOptions: { xai: { output_format: 'png' } },
    })

    expect(request).toEqual({
      maxImagesPerCall: 3,
      aspectRatio: '16:9',
      providerOptions: {
        xai: { output_format: 'png', quality: 'high' },
      },
    })
  })

  it('Gemini n=2 场景会通过 maxImagesPerCall=1 交给 AI SDK 拆成两次单图调用，且不下发 seed', () => {
    const capability = resolveImageGenerationCapability({
      providerType: 'gemini',
      providerId: 'google',
      modelId: 'gemini-2.5-flash-image',
    })

    expect(buildImageGenerationRequestParams({
      capability,
      aspectRatio: '1:1',
      seed: 7,
    })).toEqual({
      maxImagesPerCall: 1,
      aspectRatio: '1:1',
    })
  })

  it('高级 providerOptions 只能使用允许 namespace', () => {
    const capability = resolveImageGenerationCapability({
      providerType: 'siliconflow',
      providerId: 'siliconflow',
      modelId: 'Kwai-Kolors/Kolors',
    })

    expect(parseImageGenerationProviderOptionsJson(capability, '{"openai":{"foo":1}}')).toEqual({
      ok: false,
      messageKey: 'paint.advancedProviderOptionsProviderNotAllowed',
      params: { provider: 'openai', allowed: 'siliconflow' },
    })
    expect(parseImageGenerationProviderOptionsJson(capability, '{"siliconflow":{"negative_prompt":"low quality"}}')).toEqual({
      ok: true,
      value: { siliconflow: { negative_prompt: 'low quality' } },
    })
  })

  it('运行时 providerOptions 也按能力真源过滤 namespace 与 reserved key', () => {
    const capability = resolveImageGenerationCapability({
      providerType: 'xai',
      providerId: 'xai',
      modelId: 'grok-imagine-image-pro',
    })

    expect(buildImageGenerationRequestParams({
      capability,
      providerOptions: {
        xai: { output_format: 'png', seed: 1 },
        openai: { negative_prompt: 'low quality' },
      },
    })).toEqual({
      maxImagesPerCall: 3,
      providerOptions: { xai: { output_format: 'png' } },
    })
  })
})
