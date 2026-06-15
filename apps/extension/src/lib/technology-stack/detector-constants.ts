/**
 * 说明：technology-stack detector 的运行时预算常量。
 *
 * 这些值只约束单项证据数量和最终 UI 体积，不再通过全局时间预算提前截断探测。
 */

/** 默认单条模式命中的置信度贡献。 */
export const DEFAULT_TECHNOLOGY_CONFIDENCE = 35;

/** 单项技术最多保留的安全证据摘要数量。 */
export const MAX_TECHNOLOGY_EVIDENCE_PER_RESULT = 8;

/** 单页最多返回的技术数，避免异常页面撑爆 UI 和 prompt。 */
export const MAX_DETECTED_TECHNOLOGIES = 80;
