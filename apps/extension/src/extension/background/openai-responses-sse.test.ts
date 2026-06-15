/**
 * 说明：`openai-responses-sse.test` 后台运行时模块。
 *
 * 职责：
 * - 守住 OpenAI Responses JSON / SSE 成功体的可见输出恢复语义；
 * - 覆盖中转站缺少 AI SDK strict schema 辅助字段时，仍能从同一次响应里提取最终文本。
 *
 * 边界：
 * - 本测试只验证纯解析 helper，不触发 provider runtime 或第二次模型请求。
 */
import { describe, expect, it } from 'vitest'

import {
  parseOpenAiResponsesBodyVisibleOutput,
  parseOpenAiResponsesSseVisibleOutput,
} from './openai-responses-sse'

describe('openai-responses visible output parser', () => {
  it('能从缺少 SDK strict schema 辅助字段的 Responses JSON body 中提取最终文本', () => {
    const output = parseOpenAiResponsesBodyVisibleOutput({
      id: 'resp_02e8336d6368e0c6016a13f1b15bbc8198819987284a93bdb4',
      object: 'response',
      status: 'completed',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: '生成复刻YouTube提示词',
            },
          ],
        },
      ],
    })

    expect(output).toEqual({
      matched: true,
      finalText: '生成复刻YouTube提示词',
      hasToolOutput: false,
      hasFileOutput: false,
      hasVisibleOutput: true,
    })
  })

  it('能从 Responses SSE body 中提取最终文本', () => {
    const output = parseOpenAiResponsesSseVisibleOutput([
      'event: response.created',
      'data: {"type":"response.created","response":{"id":"resp_123"}}',
      '',
      'event: response.output_text.delta',
      'data: {"type":"response.output_text.delta","delta":"健康"}',
      '',
      'event: response.output_text.done',
      'data: {"type":"response.output_text.done","text":"健康检查通过"}',
      '',
    ].join('\n'))

    expect(output).toEqual({
      matched: true,
      finalText: '健康检查通过',
      hasToolOutput: false,
      hasFileOutput: false,
      hasVisibleOutput: true,
    })
  })

  it('Responses JSON body 没有可见输出时保持 matched 但不伪造成成功', () => {
    const output = parseOpenAiResponsesBodyVisibleOutput({
      id: 'resp_empty',
      object: 'response',
      status: 'completed',
      output: [],
    })

    expect(output).toEqual({
      matched: true,
      finalText: '',
      hasToolOutput: false,
      hasFileOutput: false,
      hasVisibleOutput: false,
    })
  })

  it('非 Responses body 不会被误判为匹配', () => {
    const output = parseOpenAiResponsesBodyVisibleOutput({
      choices: [
        {
          message: {
            role: 'assistant',
            content: '普通 Chat 输出',
          },
        },
      ],
    })

    expect(output).toEqual({
      matched: false,
      finalText: '',
      hasToolOutput: false,
      hasFileOutput: false,
      hasVisibleOutput: false,
    })
  })
})
