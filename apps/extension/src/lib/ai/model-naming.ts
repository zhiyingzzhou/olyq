/**
 * 说明：`model-naming` AI 能力模块。
 *
 * 职责：
 * - 承载 `model-naming` 相关的当前文件实现与模块边界；
 * - 对外暴露 `getBaseModelName`、`getLowerBaseModelName`、`normalizeModelText` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 模型命名/归一化工具（Browser Studio）
 *
 * 目标：
 * - 跨 provider 统一提取“基础模型名”（用于规则匹配/展示）
 * - 不依赖 OpenRouter 元数据
 */

/**
 * 获取模型 ID 的基础名称：取分隔符最后一段。
 * 例如：
 * - 示例："deepseek/DeepSeek-R1" → "DeepSeek-R1"
 * - 示例："org/team/model" → "model"
 */
export function getBaseModelName(id: string, delimiter: string = '/'): string {
  const raw = String(id || '')
  const parts = raw.split(delimiter)
  return parts[parts.length - 1] ?? ''
}

/**
 * 获取模型 ID 的基础名称并小写化，同时做一些常见后缀清理。
 *
 * 说明：
 * - 不同聚合平台可能会给模型 ID 加后缀（如 ":free"、"(free)"、":cloud"）；
 * - 部分平台会把版本号里的 "." 写成 "p"（例如 fireworks：v3p2 -\> v3.2）。
 */
export function getLowerBaseModelName(id: string, delimiter: string = '/'): string {
  const raw = String(id || '')

  // 兼容 Fireworks 风格版本号归一：将 "v3p2" 转为 "v3.2"
  const normalized =
    raw.toLowerCase().startsWith('accounts/fireworks/models/')
      ? raw.replace(/(\d)p(?=\d)/g, '$1.')
      : raw

  let base = getBaseModelName(normalized, delimiter).toLowerCase()

  // 常见后缀清理
  if (base.endsWith(':free')) base = base.slice(0, -':free'.length)
  if (base.endsWith('(free)')) base = base.slice(0, -'(free)'.length)
  if (base.endsWith(':cloud')) base = base.slice(0, -':cloud'.length)

  // 去掉日期版本后缀：qwen-image-plus-2026-01-09 → qwen-image-plus
  base = base.replace(/-\d{4}-\d{2}-\d{2}$/, '')
  // 去掉紧凑日期后缀：qwen-turbo-20250207 → qwen-turbo
  base = base.replace(/-\d{8}$/, '')

  return base.trim()
}

/**
 * 规则 R3：统一的文本归一化函数（trim + toLowerCase）。
 * 原先在多处模型命名辅助逻辑中各有一份重复实现，现统一导出。
 */
export function normalizeModelText(s: string | undefined | null): string {
  return String(s || '').trim().toLowerCase()
}
