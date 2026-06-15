/**
 * 说明：`text.test` 基础能力模块。
 *
 * 职责：
 * - 覆盖 `normalizeI18nText` 对 plain object 错误结构的归一化行为；
 * - 防止后端返回 `{ error }` / `{ error: { message } }` 时再次回退成模糊未知错误。
 *
 * 边界：
 * - 本文件只验证国际化错误文本归一逻辑，不触碰 UI 渲染或后台消息编排。
 */
import { describe, expect, it } from 'vitest'

import { normalizeI18nText } from './text'

describe('normalizeI18nText', () => {
  it('会从 plain object 的 message / error / error.message 中提取 detail', () => {
    expect(normalizeI18nText({
      message: '模型不可用',
    })).toEqual({
      key: 'errors.unknownWithDetail',
      params: { detail: '模型不可用' },
    })

    expect(normalizeI18nText({
      error: '端点/codex未配置模型gpt-5.4',
    })).toEqual({
      key: 'errors.unknownWithDetail',
      params: { detail: '端点/codex未配置模型gpt-5.4' },
    })

    expect(normalizeI18nText({
      error: {
        message: 'embedding endpoint unavailable',
      },
    })).toEqual({
      key: 'errors.unknownWithDetail',
      params: { detail: 'embedding endpoint unavailable' },
    })
  })
})
