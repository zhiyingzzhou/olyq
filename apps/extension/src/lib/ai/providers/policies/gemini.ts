/**
 * 说明：`gemini` AI 能力模块。
 *
 * 职责：
 * - 承载 `gemini` 相关的当前文件实现与模块边界；
 * - 对外暴露 `isGemini3ModelId` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * Gemini/Vertex 模型规则（策略层）。
 *
 * 说明：
 * - 该文件只放“按模型 ID 推断”的纯函数；
 * - 与具体 middleware/SDK 形态解耦，便于单测与复用。
 */

export function isGemini3ModelId(modelIdLower: string): boolean {
  // 覆盖：gemini-3-flash / gemini-3-pro / gemini-3.1-pro-preview 等
  return modelIdLower.includes('gemini-3')
}

