/**
 * 说明：`provider-icons` AI 能力模块。
 *
 * 职责：
 * - 承载 `provider-icons` 相关的当前文件实现与模块边界；
 * - 对外暴露 `buildLobeIconUrl`、`encodeLobeIconRef`、`parseLobeIconRef` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 说明：Provider 图标服务（基于 \@lobehub/icons 静态 CDN）
 *
 * 策略：
 * - 使用 lobe-icons 的静态 CDN 图标（确定性 URL，无需 API 调用或缓存）
 * - 维护 provider ID → lobe-icons icon ID 的映射
 * - 部分 icon 有 color 变体（彩色），部分只有 mono（单色）
 * - 根据主题（light/dark）返回对应图标 URL
 */

/* ─── Provider ID → lobe-icons icon ID + 变体类型 ─── */

interface IconEntry {
  /** lobe-icons 中的 icon ID */
  id: string
  /** 是否有 -color 变体；false 表示仅有 mono 版本 */
  hasColor: boolean
}

/**
 * 将项目内使用的 provider ID 映射到 lobe-icons 包的 icon ID。
 *
 * 说明：hasColor 来自 CDN 实际文件：
 * - true:  存在 `{id}-color.webp`（彩色图标）
 * - false: 仅有 `{id}.webp`（单色/mono 图标）
 */
const PROVIDER_ICON_MAP: Record<string, IconEntry> = {
  openai:           { id: 'openai',       hasColor: false },
  'openai-compatible-custom': { id: 'openai', hasColor: false },
  anthropic:        { id: 'anthropic',    hasColor: false },
  // 说明：olyq 侧的 ProviderId 兼容别名：Claude = Anthropic
  claude:           { id: 'anthropic',    hasColor: false },
  google:           { id: 'google',       hasColor: true  },
  deepseek:         { id: 'deepseek',     hasColor: true  },
  mistral:          { id: 'mistral',      hasColor: true  },
  groq:             { id: 'groq',         hasColor: false },
  xai:              { id: 'xai',          hasColor: false },
  cohere:           { id: 'cohere',       hasColor: true  },
  moonshot:         { id: 'moonshot',     hasColor: false },
  qwen:             { id: 'qwen',         hasColor: true  },
  siliconflow:      { id: 'siliconcloud', hasColor: true  },
  together:         { id: 'together',     hasColor: true  },
  perplexity:       { id: 'perplexity',   hasColor: true  },
  zhipu:            { id: 'zhipu',        hasColor: true  },
  'azure-openai':   { id: 'azure',        hasColor: true  },
  ollama:           { id: 'ollama',       hasColor: false },
  lmstudio:         { id: 'lmstudio',     hasColor: false },
  openrouter:       { id: 'openrouter',   hasColor: false },
  fireworks:        { id: 'fireworks',    hasColor: true  },
  minimax:          { id: 'minimax',      hasColor: true  },
  baichuan:         { id: 'baichuan',     hasColor: true  },
  aihubmix:         { id: 'aihubmix',     hasColor: true  },
  github:           { id: 'github',       hasColor: false },
  huggingface:      { id: 'huggingface',  hasColor: true  },
  cerebras:         { id: 'cerebras',     hasColor: true  },
  'vercel-ai-gateway': { id: 'vercel',    hasColor: false },
  'aws-bedrock':    { id: 'bedrock',      hasColor: true  },
  vertexai:         { id: 'vertexai',     hasColor: true  },
  'vertex-anthropic': { id: 'vertexai',   hasColor: true  },
  'new-api': { id: 'newapi',   hasColor: true  },
}

/* ─── CDN URL 生成（内联自 @lobehub/icons getLobeIconCDN） ─── */

const CDN_BASE = 'https://unpkg.com/@lobehub/icons-static-webp@latest'

/**
 * 生成 lobe-icons 静态 CDN 图标 URL（webp 格式）。
 *
 * - color 变体：`{base}/{light|dark}/{id}-color.webp`
 * - mono 变体： `{base}/{light|dark}/{id}.webp`
 */
export function buildLobeIconUrl(id: string, isDarkMode: boolean, hasColor: boolean): string {
  const mode = isDarkMode ? 'dark' : 'light'
  const suffix = hasColor ? '-color' : ''
  return `${CDN_BASE}/${mode}/${id.toLowerCase()}${suffix}.webp`
}

/* ─── lobe-icon: 引用格式 ─── */

/** lobe-icon 引用前缀，用于 Provider.logo 字段 */
const LOBE_ICON_PREFIX = 'lobe-icon:'

/** 编码 lobe-icon 引用：`lobe-icon:{id}:{0|1}` */
export function encodeLobeIconRef(id: string, hasColor: boolean): string {
  return `${LOBE_ICON_PREFIX}${id}:${hasColor ? '1' : '0'}`
}

/** 解析 lobe-icon 引用；非 lobe-icon 字符串返回 null */
export function parseLobeIconRef(logo: string): { id: string; hasColor: boolean } | null {
  if (!logo.startsWith(LOBE_ICON_PREFIX)) return null
  const rest = logo.slice(LOBE_ICON_PREFIX.length)
  const sep = rest.lastIndexOf(':')
  if (sep < 1) return null
  return { id: rest.slice(0, sep), hasColor: rest.slice(sep + 1) === '1' }
}

/* ─── 主要 API ─── */

/**
 * 获取 Provider 图标 CDN URL。
 *
 * 确定性生成——无需预加载或缓存。
 *
 * @returns 图标 URL 或 null（未匹配的 provider ID）
 */
export function getProviderIconUrl(providerId: string, theme: 'light' | 'dark'): string | null {
  const entry = PROVIDER_ICON_MAP[providerId.toLowerCase()]
  if (!entry) return null
  return buildLobeIconUrl(entry.id, theme === 'dark', entry.hasColor)
}
