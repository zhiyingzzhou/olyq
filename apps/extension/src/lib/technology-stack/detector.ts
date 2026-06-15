/**
 * 说明：技术栈检测引擎入口。
 *
 * 职责：
 * - 加载本地规则包并编译 source-first 索引；
 * - 在预算内选择候选规则、执行单规则匹配、解析关系并输出稳定结果；
 * - 对外保持 `detectTechnologyStack*` API，不把规则包、UI 或 AI prompt 耦合到检测细节。
 *
 * 边界：
 * - 不依赖第三方扩展源码或运行时代码；
 * - 不把原始 HTML、cookie 值、脚本片段或长 CSS 放入结果；
 * - 单条规则异常只影响该规则，不拖垮整页探测。
 */
import { selectCandidateRules } from './detector-candidates';
import { createTechnologyRuleMatchContext, matchTechnologyRule } from './detector-patterns';
import { resolveTechnologyRuleRelations } from './detector-relations';
import {
  finalizeDetectedTechnologies,
  upsertDetectedTechnology,
  type TechnologyDetectionMap,
} from './detector-results';
import { loadTechnologyRulePackage } from './rule-loader';
import { collectTechnologyRuleEvidenceSources } from './rule-schema';
import type {
  DetectedTechnology,
  TechnologyDetectionSignals,
  TechnologyEvidenceSource,
  TechnologyRule,
  TechnologyScanCoverage,
} from './types';

export {
  MAX_DETECTED_TECHNOLOGIES,
} from './detector-constants';

/** 编译后的规则索引。 */
export interface CompiledTechnologyRuleSet {
  /** 全量规则。 */
  rules: readonly TechnologyRule[];
  /** slug 到 rule。 */
  rulesBySlug: Map<string, TechnologyRule>;
  /** source 到 rules。 */
  rulesBySource: Map<TechnologyEvidenceSource, TechnologyRule[]>;
  /** 规则 slug 签名；测试可变规则数组变化时用于刷新缓存。 */
  signature: string;
}

/** 探测运行结果。 */
export interface TechnologyDetectionResult {
  /** 技术列表。 */
  technologies: DetectedTechnology[];
  /** 扫描覆盖状态。 */
  scanCoverage: TechnologyScanCoverage;
  /** 检测耗时。 */
  durationMs: number;
}

const compiledRuleSetCache = new WeakMap<readonly TechnologyRule[], CompiledTechnologyRuleSet>();

/** 获取高精度时间。 */
function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

/**
 * 编译技术规则索引。
 *
 * @param rules - 原始规则列表。
 * @returns source-first 索引。
 */
export function compileTechnologyRuleSet(rules: readonly TechnologyRule[]): CompiledTechnologyRuleSet {
  const rulesBySlug = new Map<string, TechnologyRule>();
  const rulesBySource = new Map<TechnologyEvidenceSource, TechnologyRule[]>();
  const signature = rules.map((rule) => rule.slug).join('|');

  for (const rule of rules) {
    rulesBySlug.set(rule.slug, rule);
    for (const source of collectTechnologyRuleEvidenceSources(rule)) {
      const bucket = rulesBySource.get(source) ?? [];
      bucket.push(rule);
      rulesBySource.set(source, bucket);
    }
  }

  return { rules, rulesBySlug, rulesBySource, signature };
}

/**
 * 获取指定规则包的编译索引。
 *
 * @param rules - active 技术规则。
 * @returns source-first 编译索引。
 */
function getCompiledTechnologyRuleSet(rules: readonly TechnologyRule[]): CompiledTechnologyRuleSet {
  const signature = rules.map((rule) => rule.slug).join('|');
  const cached = compiledRuleSetCache.get(rules);
  if (cached?.signature === signature) return cached;
  const compiled = compileTechnologyRuleSet(rules);
  compiledRuleSetCache.set(rules, compiled);
  return compiled;
}

/**
 * 检测页面技术栈并返回预算信息。
 *
 * @param signals - 页面与网络公开信号。
 * @param rules - active 技术规则。
 * @returns 技术列表与降级标记。
 */
export function detectTechnologyStackWithRules(
  signals: TechnologyDetectionSignals,
  rules: readonly TechnologyRule[],
): TechnologyDetectionResult {
  const detected: TechnologyDetectionMap = new Map();
  const startedAt = nowMs();
  const scanCoverage: TechnologyScanCoverage = signals.page.scanCoverage ?? 'complete';
  const ruleSet = getCompiledTechnologyRuleSet(rules);
  const candidateRules = selectCandidateRules(signals, ruleSet);
  const matchContext = createTechnologyRuleMatchContext();

  for (const rule of candidateRules) {
    try {
      const hit = matchTechnologyRule(rule, signals, matchContext);
      if (!hit) continue;
      upsertDetectedTechnology(detected, rule, hit);
    } catch {
      // 单条规则失败不影响整页检测。
    }
  }

  resolveTechnologyRuleRelations(detected, ruleSet.rulesBySlug);
  const finalized = finalizeDetectedTechnologies(detected);
  return {
    technologies: finalized,
    scanCoverage,
    durationMs: Math.max(0, Math.round(nowMs() - startedAt)),
  };
}

/**
 * 检测页面技术栈。
 *
 * @param signals - 页面与网络公开信号。
 * @returns 技术列表与降级标记。
 */
export async function detectTechnologyStack(signals: TechnologyDetectionSignals): Promise<TechnologyDetectionResult> {
  const rulePackage = await loadTechnologyRulePackage();
  return detectTechnologyStackWithRules(signals, rulePackage.rules);
}

/**
 * 用显式规则包检测页面技术栈。
 *
 * @param signals - 页面与网络公开信号。
 * @param rules - active 技术规则。
 * @returns 去重、排序后的技术列表。
 */
export function detectTechnologiesWithRules(
  signals: TechnologyDetectionSignals,
  rules: readonly TechnologyRule[],
): DetectedTechnology[] {
  return detectTechnologyStackWithRules(signals, rules).technologies;
}

/**
 * 检测页面技术栈。
 *
 * @param signals - 页面与网络公开信号。
 * @returns 去重、排序后的技术列表。
 */
export async function detectTechnologies(signals: TechnologyDetectionSignals): Promise<DetectedTechnology[]> {
  return (await detectTechnologyStack(signals)).technologies;
}
