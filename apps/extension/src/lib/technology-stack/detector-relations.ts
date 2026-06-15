/**
 * 说明：technology-stack detector 的规则关系解析逻辑。
 *
 * 职责：
 * - 处理 implies/requires/requiresCategory/excludes 四类关系；
 * - 在不重新执行 pattern 匹配的情况下补入 implied 技术；
 * - 按置信度解决互斥规则，保持最终结果稳定。
 */
import {
  createImpliedTechnologyHit,
  upsertDetectedTechnology,
  type TechnologyDetectionMap,
} from './detector-results';
import type { TechnologyRule } from './types';

/**
 * 应用 implies/requires/excludes 规则。
 *
 * @param detected - 初始检测结果。
 * @param rulesBySlug - 编译后的规则索引。
 */
export function resolveTechnologyRuleRelations(
  detected: TechnologyDetectionMap,
  rulesBySlug: Map<string, TechnologyRule>,
): void {
  for (const tech of Array.from(detected.values())) {
    const rule = rulesBySlug.get(tech.slug);
    for (const impliedSlug of rule?.implies ?? []) {
      const impliedRule = rulesBySlug.get(impliedSlug);
      if (!impliedRule) continue;
      upsertDetectedTechnology(detected, impliedRule, createImpliedTechnologyHit(), true);
    }
  }

  for (const tech of Array.from(detected.values())) {
    const rule = rulesBySlug.get(tech.slug);
    if (!rule?.requires?.length) continue;
    const missing = rule.requires.some((slug) => !detected.has(slug));
    if (missing) detected.delete(tech.slug);
  }

  for (const tech of Array.from(detected.values())) {
    const rule = rulesBySlug.get(tech.slug);
    if (!rule?.requiresCategory?.length) continue;
    const missing = rule.requiresCategory.some((categoryId) => !Array.from(detected.values()).some((detectedTech) => {
      const detectedRule = rulesBySlug.get(detectedTech.slug);
      return detectedRule?.fingerprintCategoryIds?.includes(categoryId);
    }));
    if (missing) detected.delete(tech.slug);
  }

  for (const tech of Array.from(detected.values())) {
    const rule = rulesBySlug.get(tech.slug);
    for (const excludedSlug of rule?.excludes ?? []) {
      const excluded = detected.get(excludedSlug);
      if (!excluded) continue;
      if (excluded.confidence <= tech.confidence) detected.delete(excludedSlug);
      else detected.delete(tech.slug);
    }
  }
}
