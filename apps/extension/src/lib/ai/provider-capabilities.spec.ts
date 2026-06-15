/**
 * 说明：`provider-capabilities.spec` AI 能力模块。
 *
 * 职责：
 * - 承载 `provider-capabilities.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { describe, expect, it } from 'vitest'

import {
  getProviderRuntimeCapabilities,
  supportsEmbeddingProvider,
  supportsImageProvider,
  supportsModerationProvider,
  supportsRerankProvider,
  supportsSpeechProvider,
  supportsTranscriptionProvider,
} from './provider-capabilities'

describe('provider-capabilities', () => {
  it('embedding/image/rerank 也统一走 adapter 能力矩阵', () => {
    expect(getProviderRuntimeCapabilities({ id: 'cohere', type: 'cohere' })).toEqual({
      'embedding-api': true,
      'image-api': false,
      'video-api': false,
      'rerank-api': true,
      'transcription-api': false,
      'speech-api': false,
      'moderation-api': false,
    })
    expect(supportsEmbeddingProvider({ id: 'azure', type: 'azure-openai' })).toBe(true)
    expect(supportsImageProvider({ id: 'xai', type: 'xai' })).toBe(true)
    expect(supportsRerankProvider({ id: 'cohere', type: 'cohere' })).toBe(true)
  })

  it('transcription/speech/moderation 也统一走 adapter 能力矩阵', () => {
    expect(supportsTranscriptionProvider({ id: 'together', type: 'openai' })).toBe(true)
    expect(supportsSpeechProvider({ id: 'together', type: 'openai' })).toBe(true)
    expect(supportsModerationProvider({ id: 'openai', type: 'openai' })).toBe(true)
    expect(supportsModerationProvider({ id: 'together', type: 'openai' })).toBe(false)
  })
})
