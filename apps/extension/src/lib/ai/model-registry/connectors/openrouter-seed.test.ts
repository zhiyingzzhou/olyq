/**
 * 说明：`openrouter-seed.test` AI 能力模块。
 *
 * 职责：
 * - 承载 `openrouter-seed.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { describe, expect, it } from 'vitest'

import { openrouterSeedConnector } from './openrouter-seed'

describe('openrouterSeedConnector.normalizeEntry', () => {
  it('会把 context_length 为 0 的上游值清洗为 undefined，而不是写进 seed evidence', () => {
    const [evidence] = openrouterSeedConnector.normalizeEntry({
      raw: {
        id: 'google/veo-3.1',
        name: 'Veo 3.1',
        context_length: 0,
        architecture: {
          input_modalities: ['text', 'image'],
          output_modalities: ['video'],
        },
      },
      rawModelId: 'google/veo-3.1',
      displayName: 'Veo 3.1',
    }, {})

    expect(evidence?.contextLength).toBeUndefined()
  })

  it('会保留大于 0 的合法 context_length', () => {
    const [evidence] = openrouterSeedConnector.normalizeEntry({
      raw: {
        id: 'openai/gpt-4.1',
        name: 'GPT-4.1',
        context_length: 1048576,
        architecture: {
          input_modalities: ['text'],
          output_modalities: ['text'],
        },
      },
      rawModelId: 'openai/gpt-4.1',
      displayName: 'GPT-4.1',
    }, {})

    expect(evidence?.contextLength).toBe(1048576)
  })

  it('会把 supported_parameters 保存为 provider/model scoped evidence', () => {
    const [evidence] = openrouterSeedConnector.normalizeEntry({
      raw: {
        id: 'openai/gpt-5.4',
        name: 'OpenAI: GPT-5.4',
        supported_parameters: ['max_tokens', 'seed', 'tools', 'tool_choice'],
        architecture: {
          input_modalities: ['text'],
          output_modalities: ['text'],
        },
      },
      rawModelId: 'openai/gpt-5.4',
      displayName: 'OpenAI: GPT-5.4',
    }, {})

    expect(evidence?.supportedParameters).toEqual(['max_tokens', 'seed', 'tools', 'tool_choice'])
    expect(evidence?.featureHints).toContain('tool-call')
  })
})
