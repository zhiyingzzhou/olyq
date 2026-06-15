/**
 * 说明：技术栈本地指纹规则包 schema 测试。
 *
 * 职责：
 * - 守住本地指纹包的数量、分类、关键样本和来源边界；
 * - 验证生成产物已经清理营销 referral 与第三方品牌词；
 * - 保证 full 页面扫描计划只回传安全命中摘要所需规则。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { detectTechnologyStackWithRules } from './detector';
import {
  buildTechnologyRulePackageFromLocalData,
  LOCAL_FINGERPRINT_RULE_BUNDLE_FILE,
} from '../../../scripts/technology-stack-local-bundle';
import { validateTechnologyRules } from './rule-schema';
import { buildTechnologyPageScanPlan } from './scan-plan';
import type { TechnologyDetectionSignals, TechnologyRule } from './types';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/**
 * 构造最小技术栈探测信号。
 *
 * @param overrides - 页面或网络信号覆盖。
 * @returns 探测信号 fixture。
 */
function createSignals(overrides: Partial<TechnologyDetectionSignals> = {}): TechnologyDetectionSignals {
  const page: TechnologyDetectionSignals['page'] = {
    title: 'Example',
    url: 'https://example.com/',
    extractedAt: 1,
    pageFingerprint: 'fingerprint-1',
    language: '',
    meta: {},
    scriptSrc: [],
    inlineScript: [],
    stylesheetHrefs: [],
    cssText: [],
    dom: {},
    text: '',
    html: '',
    js: {},
    scanCoverage: 'complete',
    ...(overrides.page ?? {}),
  };
  const network: TechnologyDetectionSignals['network'] = {
    headers: {},
    cookieNames: [],
    requestUrls: [],
    updatedAt: 1,
    ...(overrides.network ?? {}),
  };
  return { page, network };
}

/**
 * 从本地指纹包里挑选指定名称的规则。
 *
 * @param names - 技术名称。
 * @returns 匹配到的规则列表。
 */
function pickRules(names: readonly string[]): TechnologyRule[] {
  const packageData = buildTechnologyRulePackageFromLocalData();
  const wanted = new Set(names);
  return packageData.rules.filter((rule) => wanted.has(rule.name));
}

/**
 * 读取技术栈分类 locale。
 *
 * @param language - locale 目录名。
 * @returns 技术栈分类 slug 到展示文案的映射。
 */
function loadTechnologyCategoryLocale(language: 'zh-CN' | 'en-US'): Record<string, string> {
  const pageContext = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, 'src/i18n/locales', language, 'pageContext.json'), 'utf8')) as {
    pageContext?: { technologyStack?: { category?: Record<string, string> } };
  };
  return pageContext.pageContext?.technologyStack?.category ?? {};
}

describe('technology-stack fingerprint rule package', () => {
  it('本地指纹包加载到 7000+ active 规则并保留快照统计', () => {
    const rulePackage = buildTechnologyRulePackageFromLocalData();
    expect(rulePackage.summary.source).toBe('local-fingerprint-snapshot');
    expect(rulePackage.summary.total).toBeGreaterThanOrEqual(7_000);
    expect(rulePackage.summary.technologyCount).toBeGreaterThanOrEqual(7_100);
    expect(rulePackage.summary.categoryCount).toBeGreaterThanOrEqual(100);
    expect(rulePackage.summary.unsupportedSignals).toEqual(['dns', 'probe', 'certIssuer', 'robots']);
    expect(rulePackage.rules.every((rule) => rule.status === 'active')).toBe(true);
    expect(validateTechnologyRules(rulePackage.rules)).toEqual([]);
  });

  it('生成产物不包含第三方品牌词或 referral 参数', () => {
    const generated = [
      readFileSync(path.join(PACKAGE_ROOT, 'src/lib/technology-stack/fingerprint-rules.generated.ts'), 'utf8'),
      readFileSync(LOCAL_FINGERPRINT_RULE_BUNDLE_FILE, 'utf8'),
    ].join('\n');
    expect(generated).not.toMatch(new RegExp(['w', 'appalyzer'].join(''), 'i'));
    expect(generated).not.toMatch(/utm_source/i);
    expect(generated).not.toMatch(/utm_medium/i);
  });

  it('关键样本规则可加载', () => {
    const rules = pickRules(['Tailwind CSS', 'Django', 'Mithril.js', 'Fastly', 'Varnish', 'Prism']);
    expect(rules.map((rule) => rule.name).sort()).toEqual(['Django', 'Fastly', 'Mithril.js', 'Prism', 'Tailwind CSS', 'Varnish']);
  });

  it('保留本地快照分类元数据并支持多分类技术', () => {
    const rules = pickRules(['React', 'Next.js', 'Tailwind CSS']);
    const react = rules.find((rule) => rule.name === 'React');
    const next = rules.find((rule) => rule.name === 'Next.js');
    const tailwind = rules.find((rule) => rule.name === 'Tailwind CSS');
    expect(react?.categoryInfos).toEqual([
      expect.objectContaining({ id: 12, name: 'JavaScript frameworks', slug: 'javascript-frameworks', priority: 8 }),
    ]);
    expect(next?.categoryInfos?.map((category) => category.name)).toEqual([
      'JavaScript frameworks',
      'Web frameworks',
      'Web servers',
      'Static site generator',
    ]);
    expect(tailwind?.categoryInfos).toEqual([
      expect.objectContaining({ id: 66, name: 'UI frameworks', slug: 'ui-frameworks', priority: 7 }),
    ]);
  });

  it('本地快照分类 slug 在双语 locale 中都有翻译', () => {
    const rulePackage = buildTechnologyRulePackageFromLocalData();
    const categorySlugs = Array.from(new Set(rulePackage.rules.flatMap((rule) => (rule.categoryInfos ?? []).map((category) => category.slug)))).sort();
    const zhCN = loadTechnologyCategoryLocale('zh-CN');
    const enUS = loadTechnologyCategoryLocale('en-US');
    const missing = categorySlugs.flatMap((slug) => [
      ...(typeof zhCN[slug] === 'string' && zhCN[slug].trim() ? [] : [`zh-CN:${slug}`]),
      ...(typeof enUS[slug] === 'string' && enUS[slug].trim() ? [] : [`en-US:${slug}`]),
    ]);

    expect(missing).toEqual([]);
  });

  it('回归：不再用弱信号误报 Django、Mithril.js 或 Cloudflare Pages', () => {
    const rules = pickRules(['Django', 'Mithril.js', 'Fastly', 'Varnish']);
    const weakResult = detectTechnologyStackWithRules(createSignals({
      network: {
        headers: { 'x-frame-options': 'SAMEORIGIN', server: 'cloudflare', 'cf-ray': 'abc' },
        cookieNames: [],
        requestUrls: [],
        updatedAt: 1,
      },
      page: { ...createSignals().page, js: { m: true } },
    }), rules);
    expect(weakResult.technologies.map((item) => item.name)).toEqual([]);
  });

  it('Fastly 与 Varnish 使用强响应头命中', () => {
    const rules = pickRules(['Fastly', 'Varnish']);
    const result = detectTechnologyStackWithRules(createSignals({
      network: {
        headers: {
          server: 'Fastly',
          via: '1.1 varnish',
          'x-varnish': '123',
        },
        cookieNames: [],
        requestUrls: [],
        updatedAt: 1,
      },
    }), rules);
    expect(result.technologies.map((item) => item.name)).toEqual(['Fastly', 'Varnish']);
  });

  it('full 扫描计划全量下发当前规则包可支持信号', () => {
    const rulePackage = buildTechnologyRulePackageFromLocalData();
    const scanPlan = buildTechnologyPageScanPlan({
      rules: rulePackage.rules,
      summary: rulePackage.summary,
    });
    expect(scanPlan.mode).toBe('full');
    expect(scanPlan.domSelectors.length).toBeGreaterThan(0);
    expect(scanPlan.jsChains.length).toBeGreaterThan(0);
    expect(scanPlan.domSelectors.length).toBeGreaterThan(600);
    expect(scanPlan.jsChains.length).toBeGreaterThan(600);
    expect(scanPlan.jsChains).toEqual(expect.arrayContaining([
      'React.version',
      'moment.version',
      'Hammer.VERSION',
      '__core-js_shared__.versions.0.version',
      '_ethers',
    ]));
    expect(scanPlan.domSelectors).toEqual(expect.arrayContaining([
      'body > div::prop::_reactRootContainer',
      "link[rel='manifest']",
      "meta[property*='og:']",
    ]));
    expect(scanPlan.quickPatterns.length).toBeGreaterThan(0);
    expect(scanPlan.pagePatterns.length).toBeGreaterThan(800);
    expect(scanPlan.pagePatterns).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleSlug: 'tailwind-css', source: 'css' }),
    ]));
    expect(scanPlan.pagePatterns.every((rule) => ['html', 'text', 'css', 'inline-script'].includes(rule.source))).toBe(true);
  });
});
