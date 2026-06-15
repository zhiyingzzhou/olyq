/**
 * 说明：`presentation.test` AI 能力模块。
 *
 * 职责：
 * - 承载 `presentation.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { describe, expect, it } from 'vitest'

import {
  deriveDisplayModelBadgeKeys,
  derivePrimaryKindBadgeKeys,
  derivePrimaryKindKey,
  deriveSystemModelTypes,
  getSystemCapabilitySummary,
  getSystemSemanticBadgeKeys,
  PRIMARY_KIND_ORDER,
} from './presentation'

describe('model-type-system/presentation', () => {
  it('主类层固定收口为当前正式支持的 11 大主类，并能稳定提取主类键', () => {
    expect(PRIMARY_KIND_ORDER).toEqual([
      'chat',
      'multimodal-chat',
      'audio-chat',
      'transcription',
      'speech-generation',
      'moderation',
      'image-generation',
      'video-generation',
      'embedding',
      'rerank',
      'unknown',
    ])
    expect(derivePrimaryKindKey({ kind: 'image-generation', features: ['image-output'] })).toBe('image-generation')
    expect(derivePrimaryKindBadgeKeys({ kind: 'image-generation', features: ['image-output'] })).toEqual(['image-generation'])
  })

  it('用户可见模型类型会把所有聊天主类和图片生成主类收口到 8 类用户模型类型', () => {
    expect(deriveSystemModelTypes({ kind: 'chat', features: [] })).toEqual(['text_generation'])
    expect(deriveSystemModelTypes({ kind: 'audio-chat', features: [] })).toEqual(['text_generation'])
    expect(deriveSystemModelTypes({ kind: 'image-generation', features: ['image-output'] })).toEqual(['image_generation'])
    expect(
      deriveSystemModelTypes({
        kind: 'multimodal-chat',
        features: ['vision-input', 'reasoning', 'tool-call', 'native-web-search'],
      }),
    ).toEqual(['text_generation', 'vision', 'web_search', 'reasoning', 'function_calling'])
  })

  it('系统语义 badge 仍然保留图片生成这类系统主类', () => {
    expect(
      getSystemSemanticBadgeKeys({
        kind: 'image-generation',
        features: ['image-output'],
      }),
    ).toEqual(['image-generation', 'image_output'])
  })

  it('列表行 badge 会优先显示用户模型类型，其中图片生成直接显示 image_generation', () => {
    expect(
      deriveDisplayModelBadgeKeys({
        kind: 'image-generation',
        features: ['image-output'],
      }),
    ).toEqual(['image_generation'])

    expect(
      deriveDisplayModelBadgeKeys({
        kind: 'chat',
        features: ['reasoning'],
      }),
    ).toEqual(['text_generation', 'reasoning'])
  })

  it('unknown 主类下会从只读系统语义回补 unsupported 官方目录类型 badge', () => {
    expect(
      deriveDisplayModelBadgeKeys({
        kind: 'unknown',
        features: ['audio-model'],
      }),
    ).toEqual(['audio_model'])

    expect(
      deriveDisplayModelBadgeKeys({
        kind: 'unknown',
        features: ['transcription'],
      }),
    ).toEqual(['transcription'])

    expect(
      deriveDisplayModelBadgeKeys({
        kind: 'unknown',
        features: ['moderation'],
      }),
    ).toEqual(['moderation'])

    expect(
      deriveDisplayModelBadgeKeys({
        kind: 'video-generation',
        features: [],
      }),
    ).toEqual(['video-generation'])
  })

  it('系统识别摘要会把主类与能力分开返回', () => {
    expect(
      getSystemCapabilitySummary({
        kind: 'image-generation',
        features: ['image-output'],
      }),
    ).toEqual({
      primaryKind: 'image-generation',
      modelTypes: ['image_generation'],
      systemCapabilities: ['image_output'],
    })
  })
})
