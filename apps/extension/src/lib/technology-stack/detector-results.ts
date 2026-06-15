/**
 * 说明：technology-stack detector 的结果归一化逻辑。
 *
 * 职责：
 * - 把单规则命中合并成稳定 DetectedTechnology；
 * - 计算技术级置信度、版本展示与本地图标占位；
 * - 对最终列表做证据裁剪、来源去重和稳定排序。
 */
import { MAX_TECHNOLOGY_EVIDENCE_PER_RESULT } from './detector-constants';
import type { TechnologyRuleHit } from './detector-patterns';
import { selectTechnologyDisplayVersion } from './detector-versions';
import type { TechnologyVersionHit } from './detector-versions';
import { resolveTechnologyIconFallback } from './icon-fallback';
import type { DetectedTechnology, TechnologyEvidence, TechnologyRule } from './types';

/** 运行时检测结果 map。 */
export type TechnologyDetectionMap = Map<string, DetectedTechnology>;

/**
 * 计算技术整体置信度。
 *
 * @param evidence - 证据列表。
 * @returns 0-100 分。
 */
function scoreEvidence(evidence: TechnologyEvidence[]): number {
  let score = 0;
  for (const item of evidence) {
    const contribution = Math.max(1, Math.min(100, item.confidence));
    if (score >= 100) return 100;
    score += contribution;
  }
  return Math.max(1, Math.min(100, score));
}

/**
 * 把规则命中加入检测结果。
 *
 * @param detected - 结果 map。
 * @param rule - 规则。
 * @param hit - 命中。
 * @param implied - 是否为 implies 推断。
 */
export function upsertDetectedTechnology(
  detected: TechnologyDetectionMap,
  rule: TechnologyRule,
  hit: TechnologyRuleHit,
  implied = false,
): void {
  const existing = detected.get(rule.slug);
  const evidence = implied
    ? [{ source: 'html' as const, key: 'implies', value: rule.name, confidence: 20 }]
    : hit.evidence;
  const combinedEvidence = [...(existing?.evidence ?? []), ...evidence].slice(0, MAX_TECHNOLOGY_EVIDENCE_PER_RESULT);
  const iconFallback = resolveTechnologyIconFallback(rule);
  const selectedVersion = selectTechnologyDisplayVersion([
    ...(existing?.version ? [{
      value: existing.version,
      reliability: existing.versionReliability ?? 'probable',
      source: existing.sources[0] ?? 'html',
      key: 'existing',
    } satisfies TechnologyVersionHit] : []),
    ...hit.versions,
  ]);
  detected.set(rule.slug, {
    name: rule.name,
    slug: rule.slug,
    categories: Array.from(new Set([...(existing?.categories ?? []), ...rule.categories])),
    categoryInfos: [
      ...(existing?.categoryInfos ?? []),
      ...(rule.categoryInfos ?? []),
    ].filter((category, index, categories) => categories.findIndex((item) => item.id === category.id) === index),
    ...(selectedVersion.version ? { version: selectedVersion.version } : {}),
    ...(selectedVersion.reliability ? { versionReliability: selectedVersion.reliability } : {}),
    ...(selectedVersion.conflicts ? { versionConflicts: selectedVersion.conflicts } : {}),
    confidence: Math.max(existing?.confidence ?? 0, implied ? Math.min(70, scoreEvidence(combinedEvidence)) : scoreEvidence(combinedEvidence)),
    sources: Array.from(new Set(combinedEvidence.map((item) => item.source))),
    evidence: combinedEvidence,
    ...(rule.website ? { website: rule.website } : {}),
    ...(rule.description ? { description: rule.description } : {}),
    // 静态 logo 候选由 UI 从本地 compact catalog 补齐，避免 Service Worker 探测热路径携带图标 URL 目录。
    iconCandidates: existing?.iconCandidates ?? [],
    iconFallback,
  });
}

/**
 * 为 implies 推断构造空命中。
 *
 * @returns 不携带直接证据和版本的内部命中。
 */
export function createImpliedTechnologyHit(): TechnologyRuleHit {
  return { evidence: [], versions: [] };
}

/**
 * 把 detection map 转成稳定排序列表。
 *
 * @param detected - 结果 map。
 * @returns 去重、裁剪和排序后的技术列表。
 */
export function finalizeDetectedTechnologies(detected: TechnologyDetectionMap): DetectedTechnology[] {
  return Array.from(detected.values())
    .map((item) => ({
      ...item,
      confidence: Math.max(1, Math.min(100, Math.round(item.confidence))),
      evidence: item.evidence.slice(0, MAX_TECHNOLOGY_EVIDENCE_PER_RESULT),
      sources: Array.from(new Set(item.evidence.map((evidence) => evidence.source))),
    }))
    .sort((left, right) => right.confidence - left.confidence || left.name.localeCompare(right.name));
}
