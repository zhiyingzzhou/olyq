/**
 * 说明：`user-override.test` AI 能力模块。
 *
 * 职责：
 * - 承载 `user-override.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { describe, expect, it } from 'vitest'

import type { ResolvedModelMeta } from '../model-registry/types'
import {
  applyUserModelTypes,
  isUserModelTypeDisabled,
  toggleUserModelType,
} from './user-override'

/**
 * 测试辅助函数：`makeResolvedModelMeta`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function makeResolvedModelMeta(overrides?: Partial<ResolvedModelMeta>): ResolvedModelMeta {
  return {
    canonicalId: 'public::test::model',
    baseModelKey: 'test-model',
    scope: 'public',
    kind: 'chat',
    inputModalities: ['text'],
    outputModalities: ['text'],
    features: [],
    transportProtocol: 'openai-chat',
    displayName: 'Test Model',
    confidence: 'high',
    ...overrides,
  }
}

describe('model-type-system/user-override', () => {
  it('text_generation 可以把 unknown 提升为 chat，但不会把生图模型伪造成聊天模型', () => {
    expect(
      applyUserModelTypes(
        makeResolvedModelMeta({
          kind: 'unknown',
          inputModalities: [],
          outputModalities: [],
        }),
        ['text_generation'],
      ),
    ).toMatchObject({
      kind: 'chat',
      inputModalities: ['text'],
      outputModalities: ['text'],
    })

    expect(
      applyUserModelTypes(
        makeResolvedModelMeta({
          kind: 'image-generation',
          inputModalities: ['text'],
          outputModalities: ['image'],
          features: ['image-output'],
          transportProtocol: 'image-api',
        }),
        ['text_generation'],
      ),
    ).toMatchObject({
      kind: 'image-generation',
      inputModalities: ['text'],
      outputModalities: ['image'],
      features: ['image-output'],
    })
  })

  it('text_generation 可与 vision/reasoning/function_calling/web_search 共存', () => {
    expect(
      applyUserModelTypes(
        makeResolvedModelMeta({
          kind: 'chat',
          inputModalities: ['text'],
          outputModalities: ['text'],
        }),
        ['text_generation', 'vision', 'reasoning', 'function_calling', 'web_search'],
      ),
    ).toMatchObject({
      kind: 'multimodal-chat',
      inputModalities: ['text', 'image'],
      outputModalities: ['text'],
      features: ['vision-input', 'reasoning', 'tool-call', 'native-web-search'],
    })
  })

  it('image_generation 是独占类型，并会强制收口到图片生成语义', () => {
    expect(
      applyUserModelTypes(
        makeResolvedModelMeta({
          kind: 'chat',
          inputModalities: ['text'],
          outputModalities: ['text'],
        }),
        ['image_generation'],
      ),
    ).toMatchObject({
      kind: 'image-generation',
      inputModalities: ['text'],
      outputModalities: ['image'],
      features: ['image-output'],
    })
    expect(toggleUserModelType(['text_generation', 'vision'], 'image_generation')).toEqual(['image_generation'])
    expect(toggleUserModelType(['image_generation'], 'vision')).toEqual(['vision'])
  })

  it('embedding/rerank 仍保持互斥，并会禁用 text_generation 与 image_generation', () => {
    expect(isUserModelTypeDisabled('text_generation', ['embedding'])).toBe(true)
    expect(isUserModelTypeDisabled('text_generation', ['rerank'])).toBe(true)
    expect(isUserModelTypeDisabled('image_generation', ['embedding'])).toBe(true)
    expect(isUserModelTypeDisabled('vision', ['image_generation'])).toBe(true)
    expect(toggleUserModelType([], 'embedding')).toEqual(['embedding'])
    expect(toggleUserModelType(['embedding'], 'text_generation')).toEqual(['text_generation'])
  })
})
