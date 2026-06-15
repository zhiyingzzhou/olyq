/**
 * 说明：technology-stack detector 的版本候选选择逻辑。
 *
 * 职责：
 * - 只从 exact / probable 版本候选里选择用户可见版本；
 * - 保留冲突摘要供 UI 调试，但不把 unknown 或伪版本升级成展示版本；
 * - 让版本选择从 pattern 匹配和结果归一化中拆出来，便于后续维护版本策略。
 */
import type { TechnologyEvidenceSource, TechnologyVersionReliability } from './types';

/** 单条版本候选命中。 */
export interface TechnologyVersionHit {
  /** 版本值。 */
  value: string;
  /** 可靠等级。 */
  reliability: TechnologyVersionReliability;
  /** 来源。 */
  source: TechnologyEvidenceSource;
  /** 来源键。 */
  key: string;
}

/** 可展示版本的可靠等级权重。 */
const VERSION_RELIABILITY_WEIGHT: Record<TechnologyVersionReliability, number> = {
  exact: 3,
  probable: 2,
  unknown: 1,
};

/**
 * 从多个版本候选中选择用户可见版本。
 *
 * @param versions - 版本候选。
 * @returns 展示版本、可靠等级和最多四条冲突摘要。
 */
export function selectTechnologyDisplayVersion(versions: TechnologyVersionHit[]): {
  version?: string;
  reliability?: Exclude<TechnologyVersionReliability, 'unknown'>;
  conflicts?: string[];
} {
  const candidates = versions
    .filter((item) => item.reliability === 'exact' || item.reliability === 'probable')
    .sort((left, right) => VERSION_RELIABILITY_WEIGHT[right.reliability] - VERSION_RELIABILITY_WEIGHT[left.reliability]);
  const selected = candidates[0];
  if (!selected) return {};
  const conflicts = Array.from(new Set(
    candidates
      .filter((item) => item.value !== selected.value)
      .map((item) => `${item.source}:${item.value}`),
  )).slice(0, 4);
  return {
    version: selected.value,
    reliability: selected.reliability as Exclude<TechnologyVersionReliability, 'unknown'>,
    ...(conflicts.length ? { conflicts } : {}),
  };
}
