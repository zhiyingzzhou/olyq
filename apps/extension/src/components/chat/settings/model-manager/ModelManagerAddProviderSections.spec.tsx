/**
 * 说明：`ModelManagerAddProviderSections.spec` 组件模块。
 *
 * 职责：
 * - 承载 `ModelManagerAddProviderSections.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CompatibilityGrid } from './ModelManagerAddProviderSections'

const { translationMap } = vi.hoisted(() => ({
  translationMap: {
    'modelManagerPanel.apiOptions.title': 'API 兼容性',
    'modelManagerPanel.apiOptions.reset': '重置',
    'modelManagerPanel.apiOptions.isNotSupportImageInput': '不支持图片输入',
    'modelManagerPanel.apiOptions.isNotSupportImageInputHint': '关闭图片输入',
    'modelManagerPanel.apiOptions.isNotSupportFileInput': '不支持文件输入',
    'modelManagerPanel.apiOptions.isNotSupportFileInputHint': '关闭文件输入',
    'modelManagerPanel.apiOptions.isNotSupportStreamOptions': '不支持 stream_options',
    'modelManagerPanel.apiOptions.isNotSupportStreamOptionsHint': '关闭 stream usage',
    'modelManagerPanel.apiOptions.isSupportDeveloperRole': '支持 developer role',
    'modelManagerPanel.apiOptions.isSupportDeveloperRoleHint': '控制 developer role',
    'modelManagerPanel.apiOptions.isSupportServiceTier': '支持 service tier',
    'modelManagerPanel.apiOptions.isSupportServiceTierHint': '控制 service tier',
    'modelManagerPanel.apiOptions.isNotSupportEnableThinking': '不支持 enable_thinking',
    'modelManagerPanel.apiOptions.isNotSupportEnableThinkingHint': '控制 thinking',
    'modelManagerPanel.apiOptions.isNotSupportVerbosity': '不支持 verbosity',
    'modelManagerPanel.apiOptions.isNotSupportVerbosityHint': '控制 verbosity',
    'modelManagerPanel.apiOptions.isNotSupportAPIVersion': '不支持 api-version',
    'modelManagerPanel.apiOptions.isNotSupportAPIVersionHint': '控制 api-version',
  } as Record<string, string>,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => translationMap[key] ?? key,
  }),
}))

describe('CompatibilityGrid', () => {
  it('默认把 service tier 视为支持，并在重置时真正清空所有兼容项', () => {
    const onPatch = vi.fn()

    render(
      <CompatibilityGrid
        apiOptions={{
          isNotSupportImageInput: true,
          isSupportServiceTier: false,
          isNotSupportAPIVersion: true,
        }}
        onPatch={onPatch}
      />,
    )

    const switches = screen.getAllByRole('switch')
    expect(switches[4]?.getAttribute('aria-checked')).toBe('false')

    fireEvent.click(screen.getByRole('button', { name: '重置' }))

    expect(onPatch).toHaveBeenCalledWith({
      isNotSupportImageInput: undefined,
      isNotSupportFileInput: undefined,
      isNotSupportStreamOptions: undefined,
      isSupportDeveloperRole: undefined,
      isSupportServiceTier: undefined,
      isNotSupportEnableThinking: undefined,
      isNotSupportVerbosity: undefined,
      isNotSupportAPIVersion: undefined,
    })
  })

  it('空白状态下会把 service tier 开关显示为开启，保持与运行时默认值一致', () => {
    render(<CompatibilityGrid onPatch={() => undefined} />)

    const switches = screen.getAllByRole('switch')
    expect(switches[4]?.getAttribute('aria-checked')).toBe('true')
    expect(switches[3]?.getAttribute('aria-checked')).toBe('false')
  })
})
