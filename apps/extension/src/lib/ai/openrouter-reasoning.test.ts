/**
 * 说明：`openrouter-reasoning.test` AI 能力模块。
 *
 * 职责：
 * - 承载 `openrouter-reasoning.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理 OpenRouter reasoning helper 的局部验证，不扩散到运行时编排测试。
 */
import { describe, expect, it } from 'vitest'

import {
  buildModelParamsWithOpenRouterReasoning,
  isOpenRouterModel,
  resolveOpenRouterReasoningProviderOption,
  resolveOpenRouterReasoningState,
} from './openrouter-reasoning'

describe('openrouter-reasoning', () => {
  it('能把 enabled:true/false 回填为 OpenRouter 表单状态', () => {
    expect(resolveOpenRouterReasoningState({
      modelParams: { reasoning: { enabled: true } },
    })).toEqual({
      effort: 'medium',
      exclude: false,
    })

    expect(resolveOpenRouterReasoningState({
      modelParams: { reasoning: { enabled: false, max_tokens: 128 } },
    })).toEqual({
      effort: 'off',
      exclude: false,
      maxTokens: 128,
    })
  })

  it('写回 OpenRouter reasoning 时会保留同级 modelParams 与 reasoning 未知字段', () => {
    expect(buildModelParamsWithOpenRouterReasoning({
      modelParams: {
        seed: 7,
        reasoning: {
          foo: 'bar',
          effort: 'medium',
        },
      },
      effort: 'xhigh',
      exclude: true,
      maxTokens: 256,
    })).toEqual({
      seed: 7,
      reasoning: {
        foo: 'bar',
        effort: 'xhigh',
        exclude: true,
        max_tokens: 256,
      },
    })
  })

  it('关闭 OpenRouter reasoning 时只移除 reasoning 分支', () => {
    expect(buildModelParamsWithOpenRouterReasoning({
      modelParams: {
        seed: 9,
        reasoning: { effort: 'high', exclude: true },
      },
      effort: 'off',
    })).toEqual({
      seed: 9,
    })
  })

  it('构建 provider option 时优先使用 modelParams.reasoning，其次回退通用 reasoningEffort', () => {
    expect(resolveOpenRouterReasoningProviderOption({
      modelParams: {
        reasoning: {
          effort: 'none',
          exclude: true,
        },
      },
      reasoningEffort: 'high',
    })).toEqual({
      effort: 'none',
      exclude: true,
    })

    expect(resolveOpenRouterReasoningProviderOption({
      modelParams: { seed: 7 },
      reasoningEffort: 'medium',
    })).toEqual({
      effort: 'medium',
    })
  })

  it('能正确识别 OpenRouter provider 前缀', () => {
    expect(isOpenRouterModel('openrouter/openai/gpt-5')).toBe(true)
    expect(isOpenRouterModel('openai/gpt-5')).toBe(false)
  })
})
