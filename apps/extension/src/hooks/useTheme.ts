/**
 * 说明：`useTheme` Hook 模块。
 *
 * 职责：
 * - 承载 `useTheme` 相关的当前文件实现与模块边界；
 * - 对外暴露 `useTheme` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useState, useEffect } from 'react'
import { subscribeThemeChange } from '@/lib/theme'

/**
 * 从 DOM 获取真实主题状态，并在主题切换时自动响应。
 *
 * 注意：不要把主题重新接回 `ChatSettings`；主题只认 `olyq.theme.v1` 与 DOM class。
 */
export function useTheme(): 'light' | 'dark' {
  /** 当前 DOM 上真实生效的主题值。 */
  const [theme, setTheme] = useState<'light' | 'dark'>(
    () => document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  )

  useEffect(() => {
    // 主题切换的单一真源是 DOM class，因此订阅时始终回读 document，而不是依赖旧闭包值。
    return subscribeThemeChange(() => {
      setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light')
    })
  }, [])

  return theme
}
