/**
 * 说明：`index` AI 能力模块。
 *
 * 职责：
 * - 承载 `index` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 模型注册表公共出口。
 *
 * 说明：
 * - 统一聚合 model-registry 子模块，供外部按单一入口导入；
 * - 本文件只做导出组织，不承载运行时逻辑。
 */
export {
  MODEL_REGISTRY_UPDATED_EVENT,
  createEmptyModelRegistry,
  hasModelRegistryEntries,
} from './state'
export { loadModelRegistryFast } from './storage-lite'

export * from './types'
export * from './state'
export * from './trace'
export * from './identity'
export * from './lookup'
export * from './evidence'
export * from './merge'
export * from './storage-lite'
export * from './resolver'
export * from './validation'
export * from './connectors'
