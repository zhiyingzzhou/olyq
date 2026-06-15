import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'

export function useThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [systemTheme, setSystemTheme] = useState(() => {
    if (typeof window === 'undefined') {
      return 'light'
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  const currentTheme = resolvedTheme ?? theme ?? systemTheme

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const syncTheme = (event) => {
      setSystemTheme(event.matches ? 'dark' : 'light')
    }

    mediaQuery.addEventListener('change', syncTheme)

    return () => mediaQuery.removeEventListener('change', syncTheme)
  }, [])

  const handleThemeToggle = () => {
    switch (theme) {
      case 'light':
        setTheme('dark')
        return
      case 'dark':
        setTheme('light')
        return
      default:
        setTheme(systemTheme === 'light' ? 'dark' : 'light')
    }
  }

  return {
    theme: currentTheme,
    onThemeToggle: handleThemeToggle,
  }
}
