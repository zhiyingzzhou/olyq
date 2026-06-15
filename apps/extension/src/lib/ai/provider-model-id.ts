/**
 * 说明：`provider-model-id` AI 能力模块。
 *
 * 职责：
 * - 承载 `provider-model-id` 相关的当前文件实现与模块边界；
 * - 对外暴露 `splitModel` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/** 拆分 "providerId/modelId"，支持 modelId 内含多级路径。 */
export function splitModel(model: string): { providerId: string; modelId: string } {
  const [providerId, ...rest] = String(model || '').split('/')
  return { providerId, modelId: rest.join('/') }
}
