/**
 * 说明：`api-errors.test` AI 能力模块。
 *
 * 职责：
 * - 承载 `api-errors.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { APICallError, RetryError } from 'ai'
import { describe, expect, it } from 'vitest'

import {
  buildApiCallErrorDetail,
  extractMessageFromResponseBody,
  formatApiUrlHint,
  formatApiCallErrorCompact,
  toApiCallErrorSummaryText,
  toApiCallErrorText,
  toUserFacingAiErrorText,
} from './api-errors'

/**
 * 测试辅助函数：`makeApiCallError`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function makeApiCallError(overrides?: Partial<ConstructorParameters<typeof APICallError>[0]>) {
  return new APICallError({
    message: 'API call failed',
    url: 'https://api.example.com/v1/chat/completions',
    requestBodyValues: {},
    ...overrides,
  })
}

describe('api-errors', () => {
  it('buildApiCallErrorDetail 会返回稳定的技术详情而不是内部 token', () => {
    const error = makeApiCallError({
      statusCode: 401,
      responseHeaders: { 'x-request-id': 'req_123' },
      responseBody: JSON.stringify({ error: { message: 'invalid_api_key' } }),
    })

    expect(buildApiCallErrorDetail(error)).toBe('HTTP 401 · https://api.example.com/v1/chat/completions · request_id=req_123 · invalid_api_key')
    expect(formatApiCallErrorCompact(error)).not.toContain('API_CALL_FAILED')
  })

  it('toApiCallErrorText 会把限流错误映射到稳定的 i18n key', () => {
    const error = makeApiCallError({
      statusCode: 429,
      responseBody: JSON.stringify({ error: { message: 'insufficient_quota' } }),
    })

    expect(toApiCallErrorText(error)).toEqual({
      key: 'errors.apiCallRateLimitOrQuotaWithDetail',
      params: {
        detail: 'HTTP 429 · https://api.example.com/v1/chat/completions · insufficient_quota',
      },
    })
  })

  it('toApiCallErrorText 会识别缺少 /v1 的 chat completions base URL', () => {
    const error = makeApiCallError({
      statusCode: 404,
      url: 'https://api.example.com/chat/completions',
      responseBody: JSON.stringify({ message: 'Not Found' }),
    })

    expect(toApiCallErrorText(error)).toEqual({
      key: 'errors.apiCallMissingV1PathWithDetail',
      params: {
        detail: 'HTTP 404 · https://api.example.com/chat/completions · Not Found',
      },
    })
  })

  it('toApiCallErrorSummaryText 会返回不内联 detail 的稳定摘要 key', () => {
    const error = makeApiCallError({
      statusCode: 400,
      responseBody: JSON.stringify({ error: '端点/codex未开启模型gpt-5.1' }),
    })

    expect(toApiCallErrorSummaryText(error)).toEqual({
      key: 'errors.apiCallHttpError',
      params: {
        status: 400,
      },
    })
  })

  it('toApiCallErrorText 会把无状态码的请求失败归到网络或 API Base URL 问题', () => {
    const error = makeApiCallError({
      message: 'fetch failed',
      url: 'https://api.example.com/v1/responses',
    })

    expect(toApiCallErrorText(error)).toEqual({
      key: 'errors.apiCallNetworkOrApiBaseWithDetail',
      params: {
        detail: 'https://api.example.com/v1/responses · fetch failed',
      },
    })
  })

  it('formatApiUrlHint 对非标准 URL 也会移除 query 和 hash', () => {
    expect(formatApiUrlHint('/v1/chat/completions?api_key=secret#debug')).toBe('/v1/chat/completions')
  })

  it('extractMessageFromResponseBody 会优先提取 { error: string } 的纯文本错误', () => {
    expect(extractMessageFromResponseBody(JSON.stringify({
      error: '端点/codex未配置模型gpt-5.4',
    }))).toBe('端点/codex未配置模型gpt-5.4')
  })

  it('extractMessageFromResponseBody 会保留仅含 code/type 的通用 JSON 诊断', () => {
    expect(extractMessageFromResponseBody(JSON.stringify({
      error: {
        code: 'upstream_model_unavailable',
        type: 'transient',
      },
    }))).toBe('{"code":"upstream_model_unavailable","type":"transient"}')
    expect(extractMessageFromResponseBody({})).toBe('')
  })

  it('toUserFacingAiErrorText 会读取 RetryError.lastError 中的 APICallError 详情', () => {
    const lastError = makeApiCallError({
      statusCode: 400,
      responseBody: JSON.stringify({ error: '端点/codex未配置模型gpt-5.4' }),
    })
    const retryError = new RetryError({
      message: 'retry failed',
      reason: 'maxRetriesExceeded',
      errors: [lastError],
    })

    expect(toUserFacingAiErrorText(retryError)).toEqual({
      key: 'errors.apiCallHttpErrorWithDetail',
      params: {
        status: 400,
        detail: 'HTTP 400 · https://api.example.com/v1/chat/completions · 端点/codex未配置模型gpt-5.4',
      },
    })
  })

  it('toUserFacingAiErrorText 会从 RetryError.errors 中选择早于 Failed to fetch 的真实 HTTP 响应', () => {
    const apiError = makeApiCallError({
      statusCode: 503,
      responseHeaders: { 'x-request-id': 'req_gateway_503' },
      responseBody: JSON.stringify({
        error: {
          code: 'upstream_model_unavailable',
          message: '模型渠道暂不可用',
        },
      }),
    })
    const retryError = new RetryError({
      message: 'Failed after 2 attempts. Last error: Failed to fetch',
      reason: 'errorNotRetryable',
      errors: [apiError, new TypeError('Failed to fetch')],
    })

    expect(toUserFacingAiErrorText(retryError)).toEqual({
      key: 'errors.apiCallHttpErrorWithDetail',
      params: {
        status: 503,
        detail: 'HTTP 503 · https://api.example.com/v1/chat/completions · request_id=req_gateway_503 · 模型渠道暂不可用',
      },
    })
  })

  it('toUserFacingAiErrorText 会保留任意 HTTP 文本响应体而不是回退到 retry 包装文案', () => {
    const apiError = makeApiCallError({
      statusCode: 502,
      responseBody: 'temporary upstream failure from gateway',
    })
    const retryError = new RetryError({
      message: 'Failed after 2 attempts. Last error: Failed to fetch',
      reason: 'errorNotRetryable',
      errors: [apiError, new TypeError('Failed to fetch')],
    })

    expect(toUserFacingAiErrorText(retryError)).toEqual({
      key: 'errors.apiCallHttpErrorWithDetail',
      params: {
        status: 502,
        detail: 'HTTP 502 · https://api.example.com/v1/chat/completions · temporary upstream failure from gateway',
      },
    })
  })

  it('toUserFacingAiErrorText 会在没有 HTTP 线索时保留网络或 API Base URL 类提示', () => {
    const retryError = new RetryError({
      message: 'Failed after 1 attempts. Last error: Failed to fetch',
      reason: 'errorNotRetryable',
      errors: [new TypeError('Failed to fetch')],
    })

    expect(toUserFacingAiErrorText(retryError)).toEqual({
      key: 'errors.apiCallNetworkOrApiBaseWithDetail',
      params: {
        detail: 'Failed to fetch',
      },
    })
  })
})
