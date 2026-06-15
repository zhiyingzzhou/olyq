/**
 * 说明：`model-filters.test` AI 能力模块。
 *
 * 职责：
 * - 承载 `model-filters.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { describe, expect, it } from 'vitest'

import { defaultChatModelFilter, defaultConversationModelFilter, type ModelLike } from './model-filters'

/**
 * 说明：
 * - 这组测试专门锁住“普通对话入口”和“严格语言模型入口”的分层；
 * - 普通对话允许 `image-generation`，但自动命名、翻译、Memory 这类严格 LLM-only 场景仍然不能放宽。
 */
function makeModel(kind: ModelLike['kind']): ModelLike {
  return {
    id: `provider/${kind}`,
    providerId: 'provider',
    kind,
    features: [],
  }
}

describe('model-filters', () => {
  it('普通对话过滤器会放行专用图片生成模型', () => {
    expect(defaultConversationModelFilter(makeModel('chat'))).toBe(true)
    expect(defaultConversationModelFilter(makeModel('multimodal-chat'))).toBe(true)
    expect(defaultConversationModelFilter(makeModel('audio-chat'))).toBe(true)
    expect(defaultConversationModelFilter(makeModel('image-generation'))).toBe(true)
  })

  it('严格语言模型过滤器仍然只放行聊天类模型', () => {
    expect(defaultChatModelFilter(makeModel('chat'))).toBe(true)
    expect(defaultChatModelFilter(makeModel('multimodal-chat'))).toBe(true)
    expect(defaultChatModelFilter(makeModel('audio-chat'))).toBe(true)
    expect(defaultChatModelFilter(makeModel('image-generation'))).toBe(false)
  })

  it('两类过滤器都会继续拦截非对话模型', () => {
    for (const kind of ['embedding', 'rerank', 'unknown', 'video-generation', 'transcription', 'speech-generation', 'moderation'] as const) {
      expect(defaultConversationModelFilter(makeModel(kind))).toBe(false)
      expect(defaultChatModelFilter(makeModel(kind))).toBe(false)
    }
  })
})
