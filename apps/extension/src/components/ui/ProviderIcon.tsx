/**
 * 说明：`ProviderIcon` 组件模块。
 *
 * 职责：
 * - 承载 `ProviderIcon` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ProviderIcon` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 说明：ProviderIcon——渲染 AI Provider 的品牌图标
 *
 * 三级降级：
 * 1. 自定义 logo（Provider.logo data URL / 用户上传）
 * 2. \@lobehub/icons CDN 图标（确定性 URL，按主题切换明/暗）
 * 3. 字母占位符（彩色圆圈 + 首字母）
 */

import { useState, useMemo, useCallback, useEffect } from 'react'
import { getProviderIconUrl, parseLobeIconRef, buildLobeIconUrl } from '@/lib/ai/provider-icons'
import { useTheme } from '@/hooks/useTheme'

const SIZE_MAP = {
  xs: 16,
  sm: 20,
  md: 28,
  lg: 36,
  xl: 64,
} as const

interface ProviderIconProps {
  /** Provider ID（如 "openai" / "deepseek"） */
  providerId: string
  /** 自定义 logo（lobe-icon: 引用 或 data URL，优先级高于字母占位符） */
  customLogo?: string
  /** 字母占位符文本（最终降级） */
  fallbackIcon?: string
  /** 字母占位符背景色 className（如 "bg-emerald-600"） */
  fallbackColor?: string
  /** 尺寸 */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  /** 额外 className */
  className?: string
}

/** 带 loading skeleton + 淡入动效的图片渲染 */
function IconImg({
  src,
  alt,
  providerId,
  px,
  className,
  onError,
}: {
  src: string
  alt: string
  providerId: string
  px: number
  className: string
  onError: () => void
}) {
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')

  const handleLoad = useCallback(() => setStatus('ok'), [])
  const handleError = useCallback(() => {
    setStatus('error')
    onError()
  }, [onError])

  if (status === 'error') return null

  return (
    <span
      className={`shrink-0 rounded relative inline-block ${className}`}
      data-provider-icon-id={providerId}
      data-provider-icon-state={status}
      style={{ width: px, height: px }}
    >
      {/* skeleton pulse（加载中显示） */}
      {status === 'loading' && (
        <span
          className="absolute inset-0 rounded bg-muted animate-pulse"
          style={{ width: px, height: px }}
        />
      )}
      <img
        src={src}
        alt={alt}
        width={px}
        height={px}
        className={`rounded transition-opacity duration-200 ${status === 'ok' ? 'opacity-100' : 'opacity-0'}`}
        style={{ width: px, height: px }}
        onLoad={handleLoad}
        onError={handleError}
        loading="lazy"
      />
    </span>
  )
}

/**
 * 导出组件：`ProviderIcon`。
 *
 * @remarks
 * 负责承载当前文件对应的界面渲染、交互编排和视图层边界。
 */
export function ProviderIcon({
  providerId,
  customLogo,
  fallbackIcon,
  fallbackColor = 'bg-zinc-600',
  size = 'md',
  className = '',
}: ProviderIconProps) {
  const theme = useTheme()
  const px = SIZE_MAP[size]

  // 解析 customLogo：可能是 lobe-icon: 引用 或普通 data URL
  const customLogoUrl = useMemo(() => {
    if (!customLogo) return null
    const ref = parseLobeIconRef(customLogo)
    if (ref) return buildLobeIconUrl(ref.id, theme === 'dark', ref.hasColor)
    return customLogo
  }, [customLogo, theme])

  // 说明：lobe-icons CDN URL（确定性，无需异步加载）
  const builtinIconUrl = getProviderIconUrl(providerId, theme)

  // 跟踪图片加载失败，按优先级依次尝试
  const [builtinFailed, setBuiltinFailed] = useState(false)
  const [customFailed, setCustomFailed] = useState(false)

  useEffect(() => {
    setCustomFailed(false)
  }, [customLogoUrl])

  useEffect(() => {
    setBuiltinFailed(false)
  }, [builtinIconUrl])

  // 1. 自定义 logo（data URL 或 lobe-icon 引用）
  if (customLogoUrl && !customFailed) {
    return (
      <IconImg
        key={`custom:${customLogoUrl}`}
        src={customLogoUrl}
        alt={providerId}
        providerId={providerId}
        px={px}
        className={className}
        onError={() => setCustomFailed(true)}
      />
    )
  }

  // 2. 内建品牌图标
  if (builtinIconUrl && !builtinFailed) {
    return (
      <IconImg
        key={`builtin:${builtinIconUrl}`}
        src={builtinIconUrl}
        alt={providerId}
        providerId={providerId}
        px={px}
        className={className}
        onError={() => setBuiltinFailed(true)}
      />
    )
  }

  // 3. 字母占位符
  const letter = fallbackIcon || providerId.charAt(0).toUpperCase() || '?'
  const fontSize = size === 'xs' ? 9 : size === 'sm' ? 11 : size === 'md' ? 13 : size === 'lg' ? 16 : 24
  return (
    <span
      className={`shrink-0 rounded flex items-center justify-center text-white font-semibold select-none ${fallbackColor} ${className}`}
      data-provider-icon-id={providerId}
      data-provider-icon-state="fallback"
      style={{ width: px, height: px, fontSize }}
    >
      {letter}
    </span>
  )
}
