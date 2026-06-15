/**
 * 说明：`trace` AI 能力模块。
 *
 * 职责：
 * - 承载 `trace` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ResolverTraceStepType`、`ResolverTraceStep`、`ResolverTrace` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 模型解析跟踪信息。
 *
 * 设计目的：
 * - 帮助开发者理解某个模型为什么被解析成当前 canonicalId；
 * - 为后续调试面板、测试快照和问题排查提供统一结构化依据；
 * - 避免未来继续在业务代码里加零散控制台日志。
 */

/** 单步解析操作类型。 */
export type ResolverTraceStepType =
  /** 记录原始输入。 */
  | 'input'
  /** 记录基础标准化结果。 */
  | 'normalize'
  /** 记录平台规则应用结果。 */
  | 'provider-rule'
  /** 记录别名命中。 */
  | 'alias-hit'
  /** 记录基础模型键别名命中。 */
  | 'base-model-alias-hit'
  /** 记录 provider map 命中。 */
  | 'provider-map-hit'
  /** 记录 canonical model 命中。 */
  | 'canonical-hit'
  /** 记录生成 provider/local scoped 结果。 */
  | 'scoped-fallback'
  /** 记录最终结果。 */
  | 'result'

/** 单步解析跟踪。 */
export interface ResolverTraceStep {
  /** 步骤类型。 */
  readonly type: ResolverTraceStepType
  /** 简要说明。 */
  readonly message: string
  /** 可选：附带的结构化数据。 */
  readonly detail?: unknown
}

/** 单次模型解析跟踪结果。 */
export interface ResolverTrace {
  /** 跟踪步骤列表。 */
  readonly steps: ReadonlyArray<ResolverTraceStep>
}
