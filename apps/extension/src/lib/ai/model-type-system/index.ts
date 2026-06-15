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
 * `model-type-system` 总入口。
 *
 * 为什么存在：
 * - 扩展端所有“模型类型”相关能力都必须从这里走，不能再分别依赖旧 `model-semantics`、历史 tag 投影或局部工具函数；
 * - 这里统一导出系统引擎、用户覆盖层、展示层与规则来源矩阵，便于 registry、runtime、UI、测试共用；
 * - 后续如果需要补新的 provider 规则，只改本目录即可，不会再把判断逻辑散到 UI 和存储层。
 */

export * from './types'
export * from './utils'
export * from './embedding'
export * from './vision'
export * from './reasoning'
export * from './tooluse'
export * from './websearch'
export * from './openai'
export * from './official-baseline'
export * from './protocol'
export * from './engine'
export * from './presentation'
export * from './user-override'
export * from './provider-rule-sources'
