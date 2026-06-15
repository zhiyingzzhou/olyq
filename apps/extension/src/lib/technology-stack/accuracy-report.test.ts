/**
 * 说明：技术栈真实站点准确率报告单元测试。
 *
 * 职责：
 * - 验证金标 schema guard；
 * - 验证 recall、blocked false positive、空结果和覆盖样本指标；
 * - 验证报告安全 guard 不允许原始页面内容或外部技术标签来源落盘。
 */
import { describe, expect, it } from 'vitest';
import {
  buildTechnologyStackAccuracyReport,
  evaluateTechnologyStackGoldCase,
  renderTechnologyStackAccuracyMarkdown,
  sanitizeAccuracyTechnologies,
  validateTechnologyStackAccuracyGoldCases,
  validateTechnologyStackAccuracyReportSafety,
  type TechnologyStackAccuracyGoldCase,
  type TechnologyStackAccuracySiteResult,
} from './accuracy-report';
import type { DetectedTechnology, TechnologyRule } from './types';

const forbiddenLabelHost = ['www', ['w', 'appalyzer'].join(''), 'com'].join('.');

const baseRule: TechnologyRule = {
  name: 'React',
  slug: 'react',
  categories: ['ui-framework'],
  website: 'https://react.dev/',
  scriptSrc: ['react.production.min.js'],
  status: 'active',
  verifiedSignals: ['script-src', 'js'],
  versionPolicy: {
    reliability: 'unknown',
    sources: [],
  },
  rankMeta: {
    source: 'local-fingerprint-snapshot',
    batch: 'accuracy-test',
    evidenceUrl: 'https://react.dev/',
  },
  sourceUrls: ['https://react.dev/'],
  licenseStatus: 'vendor-public-doc',
  lastVerifiedAt: '2026-05-07',
};

const vueRule: TechnologyRule = {
  ...baseRule,
  name: 'Vue.js',
  slug: 'vuejs',
  website: 'https://vuejs.org/',
  sourceUrls: ['https://vuejs.org/'],
  rankMeta: {
    source: 'local-fingerprint-snapshot',
    batch: 'accuracy-test',
    evidenceUrl: 'https://vuejs.org/',
  },
};

/** 构造测试用金标样本。 */
function createGoldCase(patch: Partial<TechnologyStackAccuracyGoldCase> = {}): TechnologyStackAccuracyGoldCase {
  return {
    id: 'gold-react',
    url: 'https://react.dev/',
    category: 'ui-framework',
    expectedSlugs: ['react'],
    blockedSlugs: ['vuejs'],
    labelSourceUrls: ['https://react.dev/'],
    lastVerifiedAt: '2026-05-07',
    ...patch,
  };
}

/** 构造测试用站点检测结果。 */
function createSiteResult(technologies: DetectedTechnology[]): TechnologyStackAccuracySiteResult {
  return {
    id: 'gold-react',
    url: 'https://react.dev/',
    finalUrl: 'https://react.dev/',
    status: 'ok',
    durationMs: 12,
    scanCoverage: 'complete',
    technologies: sanitizeAccuracyTechnologies(technologies),
  };
}

describe('technology-stack accuracy report', () => {
  it('validates gold case schema and source boundaries', () => {
    const errors = validateTechnologyStackAccuracyGoldCases([
      createGoldCase({
        id: '',
        expectedSlugs: ['react', 'react'],
        labelSourceUrls: [`https://${forbiddenLabelHost}/technologies/react/`],
      }),
    ], [baseRule, vueRule], { expectedCount: 1, now: new Date('2026-05-07T00:00:00.000Z') });

    expect(errors).toContain('gold case id is empty');
    expect(errors).toContain('gold case  expectedSlugs has duplicates');
    expect(errors.some((error) => error.includes('forbidden label source'))).toBe(true);
  });

  it('computes gold recall, blocked hits, high confidence review queue and coverage metrics', () => {
    const goldCase = createGoldCase();
    const goldResult = evaluateTechnologyStackGoldCase(goldCase, createSiteResult([
      {
        name: 'React',
        slug: 'react',
        categories: ['ui-framework'],
        confidence: 99,
        sources: ['script-src'],
        evidence: [],
        iconCandidates: [],
        iconFallback: 'R',
      },
      {
        name: 'Vue.js',
        slug: 'vuejs',
        categories: ['ui-framework'],
        confidence: 92,
        sources: ['js'],
        evidence: [],
        iconCandidates: [],
        iconFallback: 'V',
      },
    ]));

    const report = buildTechnologyStackAccuracyReport({
      generatedAt: '2026-05-07T00:00:00.000Z',
      rulePackage: {
        total: 2,
        technologyCount: 2,
        categoryCount: 2,
        snapshotVersion: 'test',
        source: 'local-fingerprint-snapshot',
        unsupportedSignals: [],
        updateChannel: 'extension-release',
      },
      goldResults: [goldResult],
      coverageResults: [{
        ...createSiteResult([]),
        id: 'tranco-1-example.com',
        url: 'https://example.com/',
        finalUrl: 'https://example.com/',
        rank: 1,
        domain: 'example.com',
      }],
      tranco: {
        listId: 'test-list',
        downloadedAt: '2026-05-07T00:00:00.000Z',
        sourceUrl: 'https://tranco-list.eu/top-1m.csv.zip',
        requestedSites: 1,
      },
    });

    expect(report.passed).toBe(true);
    expect(report.goldSummary.expectedRecall).toBe(1);
    expect(report.goldSummary.blockedFalsePositiveRate).toBe(1);
    expect(report.goldSummary.unexpectedHighConfidenceCount).toBe(0);
    expect(report.coverageSummary.nonEmptyDetectionRate).toBe(0);
    expect(report.coverageSummary.ruleGapCandidates).toEqual(['https://example.com/']);
    expect(renderTechnologyStackAccuracyMarkdown(report)).toContain('Technology Stack Accuracy');
  });

  it('blocks raw page content from persisted reports', () => {
    const report = buildTechnologyStackAccuracyReport({
      generatedAt: '2026-05-07T00:00:00.000Z',
      rulePackage: {
        total: 1,
        technologyCount: 1,
        categoryCount: 1,
        snapshotVersion: 'test',
        source: 'local-fingerprint-snapshot',
        unsupportedSignals: [],
        updateChannel: 'extension-release',
      },
      goldResults: [{
        ...evaluateTechnologyStackGoldCase(createGoldCase({ blockedSlugs: [] }), createSiteResult([])),
        error: '<html><script>document.cookie</script></html>',
      }],
      coverageResults: [],
      tranco: null,
    });

    expect(report.passed).toBe(false);
    expect(validateTechnologyStackAccuracyReportSafety(report).length).toBeGreaterThan(0);
  });
});
