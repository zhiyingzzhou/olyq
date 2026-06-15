/**
 * 说明：`provider-ui-meta` AI 能力模块。
 *
 * 职责：
 * - 承载 `provider-ui-meta` 相关的当前文件实现与模块边界；
 * - 对外暴露 `pickProviderUiMeta` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * Provider UI 元信息（图标/颜色）选择器。
 *
 * 说明：
 * - 仅用于 UI 展示（侧边栏/弹窗等），不参与请求路由；
 * - 通过集中映射避免把视觉配置写进存储结构，减少配置迁移成本。
 */

/**
 * 根据 providerId 返回用于 UI 渲染的 icon 与颜色 class。
 *
 * @param providerId - Provider 标识（大小写不敏感）
 * @returns icon 为 1~2 字符，color 为 Tailwind 背景色 class。
 */
export function pickProviderUiMeta(providerId: string) {
  // 仅用于 UI 展示：避免把视觉配置硬编码到存储结构里。
  const id = String(providerId || '').toLowerCase();
  if (id === 'openai') return { icon: 'O', color: 'bg-emerald-600' };
  if (id === 'google' || id === 'gemini') return { icon: 'G', color: 'bg-blue-600' };
  // 说明：Claude 即 Anthropic（同一生态/模型系列）
  if (id === 'anthropic' || id === 'claude') return { icon: 'C', color: 'bg-orange-600' };
  if (id === 'deepseek') return { icon: 'D', color: 'bg-indigo-600' };
  if (id === 'moonshot') return { icon: 'K', color: 'bg-gray-700' };
  if (id === 'qwen') return { icon: 'Q', color: 'bg-purple-600' };
  if (id === 'siliconflow') return { icon: '硅', color: 'bg-violet-600' };
  if (id === 'aihubmix') return { icon: 'A', color: 'bg-teal-600' };
  if (id === 'openrouter') return { icon: 'R', color: 'bg-slate-700' };
  if (id === 'together') return { icon: 'T', color: 'bg-slate-700' };
  if (id === 'groq') return { icon: 'G', color: 'bg-orange-500' };
  if (id === 'mistral') return { icon: 'M', color: 'bg-amber-600' };
  if (id === 'xai') return { icon: 'X', color: 'bg-slate-800' };
  if (id === 'cohere') return { icon: 'C', color: 'bg-green-600' };
  if (id === 'ollama') return { icon: 'OL', color: 'bg-slate-700' };
  if (id === 'lmstudio') return { icon: 'LM', color: 'bg-slate-700' };
  return { icon: id.slice(0, 1).toUpperCase() || '?', color: 'bg-zinc-600' };
}
