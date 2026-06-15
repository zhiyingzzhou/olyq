/**
 * 说明：`host-match-patterns` 单元测试。
 *
 * 职责：
 * - 覆盖 URL 到 match pattern 的纯字符串转换；
 * - 验证 apiHost 占位符拒绝和展示 origin 归一化；
 * - 确认安装期普通网页访问只认严格的 http/https 声明。
 *
 * 边界：
 * - 本测试不调用 `chrome.permissions.*`；
 * - 不恢复运行时网页授权、撤销或提示流程。
 */

import { describe, expect, it } from 'vitest'

import {
  INSTALL_TIME_WEB_HOST_PATTERN_LABEL,
  hasAnyInstallTimeWebHostPattern,
  hasInstallTimeWebHostPatterns,
  toDisplayOriginFromMatchPattern,
  toHostMatchPatternFromApiHost,
  toHostMatchPatternFromUrl,
} from './host-match-patterns'

describe('host-match-patterns', () => {
  it('toHostMatchPatternFromUrl: supports http/https', () => {
    expect(toHostMatchPatternFromUrl('https://api.openai.com/v1')).toBe('https://api.openai.com/*')
    expect(toHostMatchPatternFromUrl('http://localhost:11434/v1')).toBe('http://localhost:11434/*')
  })

  it('toHostMatchPatternFromUrl: rejects non-web urls', () => {
    expect(toHostMatchPatternFromUrl('chrome://extensions')).toBeNull()
    expect(toHostMatchPatternFromUrl('file:///tmp/a.txt')).toBeNull()
    expect(toHostMatchPatternFromUrl('about:config')).toBeNull()
  })

  it('toHostMatchPatternFromApiHost: rejects placeholders', () => {
    expect(toHostMatchPatternFromApiHost('https://{region}-aiplatform.googleapis.com')).toBeNull()
    expect(toHostMatchPatternFromApiHost('https://bedrock-runtime.{region}.amazonaws.com')).toBeNull()
  })

  it('toDisplayOriginFromMatchPattern: strips path', () => {
    expect(toDisplayOriginFromMatchPattern('https://api.openai.com/*')).toBe('https://api.openai.com')
    expect(toDisplayOriginFromMatchPattern('http://localhost:11434/*')).toBe('http://localhost:11434')
  })

  it('hasInstallTimeWebHostPatterns: only treats full http+https declaration as satisfied', () => {
    expect(hasInstallTimeWebHostPatterns(['<all_urls>'])).toBe(true)
    expect(hasInstallTimeWebHostPatterns(['https://*/*'])).toBe(false)
    expect(hasInstallTimeWebHostPatterns(['https://api.openai.com/*', 'http://*/*'])).toBe(false)
  })

  it('hasAnyInstallTimeWebHostPattern: detects partial install-time web patterns', () => {
    expect(hasAnyInstallTimeWebHostPattern(['<all_urls>'])).toBe(true)
    expect(hasAnyInstallTimeWebHostPattern(['https://api.openai.com/*'])).toBe(false)
  })

  it('INSTALL_TIME_WEB_HOST_PATTERN_LABEL: exposes the strict web host label for diagnostics', () => {
    expect(INSTALL_TIME_WEB_HOST_PATTERN_LABEL).toBe('http://*/*, https://*/*')
  })
})
