/**
 * 说明：`model-request-parameters.test` AI 能力模块。
 *
 * 职责：
 * - 固化 provider/model scoped 请求参数真源的规范化、通用参数过滤与工具参数判定；
 * - 确保没有显式真源时不会按模型名或 provider 猜测能力。
 */
import { describe, expect, it } from 'vitest'

import {
  filterCallSettingSupportBySupportedParameters,
  filterProviderOptionsBySupportedParameters,
  normalizeSupportedParameters,
  resolveToolParameterSupport,
} from './model-request-parameters'
import type { CallSettingSupport } from './providers/adapter-types'

const ALL_CALL_SETTINGS: CallSettingSupport = {
  temperature: true,
  topP: true,
  maxTokens: true,
  topK: true,
  presencePenalty: true,
  frequencyPenalty: true,
  seed: true,
  stop: true,
}

describe('model-request-parameters', () => {
  it('normalizeSupportedParameters 会去重、过滤空值并保留原生字段名', () => {
    expect(normalizeSupportedParameters([' temperature ', 'top_p', '', 'Temperature', 'max_completion_tokens'])).toEqual([
      'temperature',
      'top_p',
      'max_completion_tokens',
    ])
  })

  it('显式列表存在时 call settings 只取交集', () => {
    expect(filterCallSettingSupportBySupportedParameters(ALL_CALL_SETTINGS, [
      'max_completion_tokens',
      'seed',
      'tools',
      'tool_choice',
    ])).toEqual({
      temperature: false,
      topP: false,
      maxTokens: true,
      topK: false,
      presencePenalty: false,
      frequencyPenalty: false,
      seed: true,
      stop: false,
    })
  })

  it('没有显式列表时保持 adapter/policy 原有支持矩阵', () => {
    expect(filterCallSettingSupportBySupportedParameters(ALL_CALL_SETTINGS, undefined)).toBe(ALL_CALL_SETTINGS)
  })

  it('providerOptions 会按原生字段映射过滤', () => {
    expect(filterProviderOptionsBySupportedParameters({
      openrouter: {
        reasoning: { effort: 'high' },
        plugins: [{ id: 'web' }],
        service_tier: 'auto',
      },
    }, ['reasoning'])).toEqual({
      openrouter: {
        reasoning: { effort: 'high' },
      },
    })
  })

  it('tools 与 tool_choice 分别判定', () => {
    expect(resolveToolParameterSupport(['tools'])).toEqual({ tools: true, toolChoice: false })
    expect(resolveToolParameterSupport(['tool_choice'])).toEqual({ tools: false, toolChoice: true })
    expect(resolveToolParameterSupport(undefined)).toEqual({ tools: true, toolChoice: true })
  })
})
