/**
 * 说明：`browser-context-send-budget.spec` 组件模块。
 *
 * 职责：
 * - 验证聊天发送前 browser-context 预检预算的模式判定；
 * - 防止正文发送链路再次短于 iframe 补采集预算。
 *
 * 边界：
 * - 本文件只覆盖预算纯函数，不触发真实网页采集或聊天发送。
 */
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_BROWSER_CONTEXT_SEND_PREFLIGHT_BUDGET_MS,
  FULL_PAGE_BROWSER_CONTEXT_SEND_PREFLIGHT_BUDGET_MS,
  STYLE_CAPTURE_BROWSER_CONTEXT_SEND_PREFLIGHT_BUDGET_MS,
  resolveBrowserContextSendPreflightBudgetMs,
} from './browser-context-send-budget'

describe('resolveBrowserContextSendPreflightBudgetMs', () => {
  it('普通自动上下文覆盖 iframe 正文补采集预算', () => {
    expect(resolveBrowserContextSendPreflightBudgetMs({
      effective: true,
      conversationMode: {
        fullPageEnabled: false,
      },
      requireCaptures: false,
    })).toBe(DEFAULT_BROWSER_CONTEXT_SEND_PREFLIGHT_BUDGET_MS)
    expect(DEFAULT_BROWSER_CONTEXT_SEND_PREFLIGHT_BUDGET_MS).toBe(2_500)
  })

  it('显式全文模式使用长预算等待 readable-dom 稳定窗口', () => {
    expect(resolveBrowserContextSendPreflightBudgetMs({
      effective: true,
      conversationMode: {
        fullPageEnabled: true,
      },
      requireCaptures: false,
    })).toBe(FULL_PAGE_BROWSER_CONTEXT_SEND_PREFLIGHT_BUDGET_MS)
    expect(FULL_PAGE_BROWSER_CONTEXT_SEND_PREFLIGHT_BUDGET_MS).toBe(4_000)
    expect(FULL_PAGE_BROWSER_CONTEXT_SEND_PREFLIGHT_BUDGET_MS).toBeGreaterThan(DEFAULT_BROWSER_CONTEXT_SEND_PREFLIGHT_BUDGET_MS)
  })

  it('页面风格截图轮次优先使用截图预算', () => {
    expect(resolveBrowserContextSendPreflightBudgetMs({
      effective: true,
      conversationMode: {
        fullPageEnabled: false,
      },
      requireCaptures: true,
    })).toBe(STYLE_CAPTURE_BROWSER_CONTEXT_SEND_PREFLIGHT_BUDGET_MS)
    expect(STYLE_CAPTURE_BROWSER_CONTEXT_SEND_PREFLIGHT_BUDGET_MS).toBe(5_000)
  })

  it('全文加风格截图时截图预算优先于全文预算', () => {
    expect(resolveBrowserContextSendPreflightBudgetMs({
      effective: true,
      conversationMode: {
        fullPageEnabled: true,
      },
      requireCaptures: true,
    })).toBe(STYLE_CAPTURE_BROWSER_CONTEXT_SEND_PREFLIGHT_BUDGET_MS)
  })

  it('总开关未生效时不会因为旧全文状态放宽预算', () => {
    expect(resolveBrowserContextSendPreflightBudgetMs({
      effective: false,
      conversationMode: {
        fullPageEnabled: true,
      },
      requireCaptures: true,
    })).toBe(DEFAULT_BROWSER_CONTEXT_SEND_PREFLIGHT_BUDGET_MS)
  })
})
