/**
 * 说明：`useModelManagerCatalog.spec` 组件模块。
 *
 * 职责：
 * - 承载 `useModelManagerCatalog.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { describe, expect, it } from 'vitest'

import {
  buildCatalogModelViewMap,
  getFetchedModelImportBlockReason,
  pickImportableCatalogModels,
} from './useModelManagerCatalog'
import type { FetchedModel } from '@/lib/ai/fetch-models'

describe('useModelManagerCatalog helpers', () => {
  const t = ((key: string, params?: Record<string, string>) => {
    if (key === 'modelManagerPanel.manageDialog.importBlockedProviderCatalogTypeUnsupported') {
      return `官方目录返回了该${params?.typeLabel ?? '未知'}，但扩展端当前还没有稳定的导入调用协议。该模型仅展示，不可导入。`
    }
    if (key === 'modelManagerPanel.manageDialog.importBlockedTogetherDedicatedSpeechEndpointRequired') {
      return '官方目录已返回该 Together 语音模型，但它需要 Together Dedicated Endpoint。扩展端当前还不支持按 endpoint name 导入和调用该模型，因此仅展示、不可导入。'
    }
    if (key === 'modelManagerPanel.manageDialog.importBlockedTranscriptionRuntimeUnavailable') {
      return '官方目录已返回该转写模型，但当前 Provider 还没有接入可运行的 transcription-api runtime。该模型仅展示，不可导入。'
    }
    if (key === 'modelManagerPanel.manageDialog.importBlockedSpeechRuntimeUnavailable') {
      return '官方目录已返回该语音模型，但当前 Provider 还没有接入可运行的 speech-api runtime。该模型仅展示，不可导入。'
    }
    if (key === 'modelManagerPanel.manageDialog.importBlockedModerationRuntimeUnavailable') {
      return '官方目录已返回该审核模型，但当前 Provider 还没有接入可运行的 moderation-api runtime。该模型仅展示，不可导入。'
    }
    if (key === 'modelManagerPanel.manageDialog.importBlockedVideoRuntimeUnavailable') {
      return '官方目录已返回该视频模型，但当前 Provider 还没有接入可运行的 video-api runtime。该模型仅展示，不可导入。'
    }
    if (key === 'modelManagerPanel.manageDialog.importBlockedUnknownProtocol') {
      return '当前无法可靠判断该模型的调用协议，请先补全注册表或手动指定协议后再导入。'
    }
    if (key === 'modelRegistry.capabilities.audio-model') return '音频模型'
    if (key === 'modelRegistry.capabilities.transcription') return '语音转写'
    if (key === 'modelRegistry.capabilities.moderation') return '内容审核'
    if (key === 'modelRegistry.capabilities.video-generation') return '视频生成'
    if (key === 'modelRegistry.capabilities.unknown') return '未知'
    return key
  }) as never

  it('会优先返回目录级阻断原因，并在批量导入时跳过被阻断模型', () => {
    const supportedModel: FetchedModel = {
      id: 'zai-org/GLM-5',
      name: 'GLM-5-FP4',
      group: 'zai-org',
      transportProtocol: 'openai-chat',
      kindHint: 'chat',
      inputModalities: ['text'],
      outputModalities: ['text'],
      contextLength: 202752,
    }
    const blockedModel: FetchedModel = {
      id: 'wavespeed-ai/wan-2.2-t2v-fast',
      name: 'Wan 2.2 T2V Fast',
      group: 'wavespeed-ai',
      contextLength: 65536,
      importBlockedReasonKey: 'modelManagerPanel.manageDialog.importBlockedProviderCatalogTypeUnsupported',
      importBlockedReasonParams: { type: 'video' },
    }

    expect(getFetchedModelImportBlockReason({
      catalogModelView: { transportProtocol: 'openai-chat' },
      model: blockedModel,
      provider: { id: 'together', type: 'openai' },
      t,
    })).toBe('官方目录返回了该视频生成，但扩展端当前还没有稳定的导入调用协议。该模型仅展示，不可导入。')

    expect(pickImportableCatalogModels({
      addedModelIds: new Set<string>(),
      catalogFiltered: [supportedModel, blockedModel],
      getCatalogImportBlockReason: (model) => getFetchedModelImportBlockReason({
        catalogModelView: model.id === supportedModel.id ? { transportProtocol: 'openai-chat' } : null,
        model,
        provider: { id: 'together', type: 'openai' },
        t,
      }),
    })).toEqual([supportedModel])
  })

  it('video-api 目录项会被稳定阻断导入', () => {
    const videoModel: FetchedModel = {
      id: 'example/video-model',
      name: 'Example Video',
      group: 'example',
      transportProtocol: 'video-api',
      kindHint: 'video-generation',
      inputModalities: ['text'],
      outputModalities: ['video'],
    }

    expect(getFetchedModelImportBlockReason({
      catalogModelView: { transportProtocol: 'video-api' },
      model: videoModel,
      provider: { id: 'custom-openai', type: 'openai' },
      t,
    })).toBe('官方目录已返回该视频模型，但当前 Provider 还没有接入可运行的 video-api runtime。该模型仅展示，不可导入。')

    expect(getFetchedModelImportBlockReason({
      catalogModelView: { transportProtocol: 'video-api' },
      model: videoModel,
      provider: { id: 'together', type: 'openai' },
      t,
    })).toBe('官方目录已返回该视频模型，但当前 Provider 还没有接入可运行的 video-api runtime。该模型仅展示，不可导入。')
  })

  it.each([
    {
      label: 'unknown audio',
      model: {
        id: 'voice-labs/voice-1',
        name: 'Voice 1',
        group: 'voice-labs',
        importBlockedReasonKey: 'modelManagerPanel.manageDialog.importBlockedProviderCatalogTypeUnsupported',
        importBlockedReasonParams: { type: 'audio' },
      } satisfies FetchedModel,
      expectedReason: '官方目录返回了该音频模型，但扩展端当前还没有稳定的导入调用协议。该模型仅展示，不可导入。',
    },
    {
      label: 'dedicated speech',
      model: {
        id: 'rime-labs/rime-arcana-v2',
        name: 'Rime Labs Arcana v2',
        group: 'rime-labs',
        importBlockedReasonKey: 'modelManagerPanel.manageDialog.importBlockedTogetherDedicatedSpeechEndpointRequired',
      } satisfies FetchedModel,
      expectedReason: '官方目录已返回该 Together 语音模型，但它需要 Together Dedicated Endpoint。扩展端当前还不支持按 endpoint name 导入和调用该模型，因此仅展示、不可导入。',
    },
    {
      label: 'moderation',
      model: {
        id: 'meta-llama/Llama-Guard-4-12B',
        name: 'Llama Guard 4 12B',
        group: 'meta-llama',
        importBlockedReasonKey: 'modelManagerPanel.manageDialog.importBlockedProviderCatalogTypeUnsupported',
        importBlockedReasonParams: { type: 'moderation' },
      } satisfies FetchedModel,
      expectedReason: '官方目录返回了该内容审核，但扩展端当前还没有稳定的导入调用协议。该模型仅展示，不可导入。',
    },
    {
      label: 'video',
      model: {
        id: 'wavespeed-ai/wan-2.2-t2v-fast',
        name: 'Wan 2.2 T2V Fast',
        group: 'wavespeed-ai',
        importBlockedReasonKey: 'modelManagerPanel.manageDialog.importBlockedProviderCatalogTypeUnsupported',
        importBlockedReasonParams: { type: 'video' },
      } satisfies FetchedModel,
      expectedReason: '官方目录返回了该视频生成，但扩展端当前还没有稳定的导入调用协议。该模型仅展示，不可导入。',
    },
  ])('unsupported $label 目录项会显示统一展示语义文案', ({ model, expectedReason }) => {
    expect(getFetchedModelImportBlockReason({
      catalogModelView: null,
      model,
      provider: { id: 'together', type: 'openai' },
      t,
    })).toBe(expectedReason)
  })

  it('transcription-api 目录项会在 provider 已接入 runtime 时允许导入', () => {
    const transcriptionModel: FetchedModel = {
      id: 'openai/whisper-large-v3',
      name: 'Whisper Large V3',
      group: 'openai',
      transportProtocol: 'transcription-api',
      kindHint: 'transcription',
      inputModalities: ['audio', 'file'],
      outputModalities: ['text'],
      features: ['transcription'],
    }

    expect(getFetchedModelImportBlockReason({
      catalogModelView: { transportProtocol: 'transcription-api' },
      model: transcriptionModel,
      provider: { id: 'together', type: 'openai' },
      t,
    })).toBeNull()
  })

  it('speech-api 目录项会在 Together provider 已接入 runtime 时允许导入', () => {
    const speechModel: FetchedModel = {
      id: 'cartesia/sonic-2',
      name: 'Sonic 2',
      group: 'cartesia',
      transportProtocol: 'speech-api',
      kindHint: 'speech-generation',
      inputModalities: ['text'],
      outputModalities: ['audio'],
      features: ['audio-output'],
    }

    expect(getFetchedModelImportBlockReason({
      catalogModelView: { transportProtocol: 'speech-api' },
      model: speechModel,
      provider: { id: 'together', type: 'openai' },
      t,
    })).toBeNull()
  })

  it.each([
    {
      label: 'dedicated audio',
      model: {
        id: 'rime-labs/rime-arcana-v2',
        name: 'Rime Labs Arcana v2',
        group: 'rime-labs',
        providerCatalogTypeHint: 'audio',
        importBlockedReasonKey: 'modelManagerPanel.manageDialog.importBlockedTogetherDedicatedSpeechEndpointRequired',
      } satisfies FetchedModel,
      expectedBadgeKeys: ['audio_model'],
    },
    {
      label: 'transcription',
      model: {
        id: 'openai/whisper-large-v3',
        name: 'Whisper Large V3',
        group: 'openai',
        providerCatalogTypeHint: 'transcribe',
        importBlockedReasonKey: 'modelManagerPanel.manageDialog.importBlockedProviderCatalogTypeUnsupported',
        importBlockedReasonParams: { type: 'transcribe' },
      } satisfies FetchedModel,
      expectedBadgeKeys: ['transcription'],
    },
    {
      label: 'moderation',
      model: {
        id: 'meta-llama/Llama-Guard-4-12B',
        name: 'Llama Guard 4 12B',
        group: 'meta-llama',
        providerCatalogTypeHint: 'moderation',
        importBlockedReasonKey: 'modelManagerPanel.manageDialog.importBlockedProviderCatalogTypeUnsupported',
        importBlockedReasonParams: { type: 'moderation' },
      } satisfies FetchedModel,
      expectedBadgeKeys: ['moderation'],
    },
    {
      label: 'video',
      model: {
        id: 'example/video-model',
        name: 'Example Video',
        group: 'example',
        transportProtocol: 'video-api',
        kindHint: 'video-generation',
        importBlockedReasonKey: 'modelManagerPanel.manageDialog.importBlockedProviderCatalogTypeUnsupported',
        importBlockedReasonParams: { type: 'video' },
      } satisfies FetchedModel,
      expectedBadgeKeys: ['video-generation'],
    },
  ])('被阻断的 $label 目录项仍会进入统一 model view 管线', ({ model, expectedBadgeKeys }) => {
    const viewMap = buildCatalogModelViewMap({
      catalogModels: [model],
      provider: { id: 'together', type: 'openai', apiHost: 'https://api.together.xyz/v1' },
      resolveModelView: () => ({
        transportProtocol: model.transportProtocol ?? 'unknown',
        rowBadgeKeys: expectedBadgeKeys,
      } as never),
    })

    expect(viewMap.get(model.id)?.rowBadgeKeys).toEqual(expectedBadgeKeys)
  })

  it('目录模型视图解析会携带 supportedParameters', () => {
    const model: FetchedModel = {
      id: 'openai/gpt-5.4',
      name: 'GPT-5.4',
      group: 'openai',
      supportedParameters: ['max_tokens', 'seed', 'tools'],
    }
    let receivedSupportedParameters: ReadonlyArray<string> | undefined

    buildCatalogModelViewMap({
      catalogModels: [model],
      provider: { id: 'openrouter', type: 'openai', apiHost: 'https://openrouter.ai/api/v1' },
      resolveModelView: (_provider, item) => {
        receivedSupportedParameters = item.supportedParameters
        return {
          transportProtocol: 'openai-chat',
          rowBadgeKeys: [],
        } as never
      },
    })

    expect(receivedSupportedParameters).toEqual(['max_tokens', 'seed', 'tools'])
  })
})
