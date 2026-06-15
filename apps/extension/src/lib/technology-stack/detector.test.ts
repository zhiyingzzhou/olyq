/**
 * 说明：`technology-stack/detector` 单元测试。
 *
 * 职责：
 * - 用可控规则库覆盖检测引擎的关系解析、置信度、版本和隐私边界；
 * - 确保新增真实规则时不会破坏公开信号合并模型；
 * - 避免把 cookie 原始值、长页面片段或测试专用规则写进生产规则库。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { compileTechnologyRuleSet, detectTechnologiesWithRules, detectTechnologyStackWithRules } from './detector';
import { selectCandidateRules } from './detector-candidates';
import type { TechnologyDetectionSignals, TechnologyRule } from './types';
import type { TechnologyRuleLicenseStatus } from './types';

const mockedTechnologyRules: TechnologyRule[] = [];

/** 最小页面信号 fixture。 */
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

type TestTechnologyRule = Omit<TechnologyRule, 'sourceUrls' | 'licenseStatus' | 'lastVerifiedAt' | 'status' | 'verifiedSignals' | 'versionPolicy' | 'rankMeta'>
  & Partial<Pick<TechnologyRule, 'sourceUrls' | 'licenseStatus' | 'lastVerifiedAt' | 'status' | 'verifiedSignals' | 'versionPolicy' | 'rankMeta'>>;

const TEST_LICENSE_STATUS = 'public-web-observation' satisfies TechnologyRuleLicenseStatus;

/** 替换当前测试用规则库，保持 detector import 的数组引用不变。 */
function useRules(rules: TestTechnologyRule[]): void {
  mockedTechnologyRules.splice(0, mockedTechnologyRules.length, ...rules.map((rule) => ({
    ...rule,
    sourceUrls: rule.sourceUrls ?? ['https://example.com/test-rule'],
    licenseStatus: rule.licenseStatus ?? TEST_LICENSE_STATUS,
    lastVerifiedAt: rule.lastVerifiedAt ?? '2026-05-06',
    status: rule.status ?? 'active',
    verifiedSignals: rule.verifiedSignals ?? ['html'],
    versionPolicy: rule.versionPolicy ?? {
      reliability: 'probable',
      sources: ['html', 'headers', 'script-src', 'meta', 'cookies'],
      notes: 'test rule',
    },
    rankMeta: rule.rankMeta ?? {
      source: 'detector-test',
      batch: 'unit',
      evidenceUrl: 'https://example.com/test-rule',
    },
  })));
}

/** 使用当前测试规则执行同步检测。 */
function detectTechnologies(signals: TechnologyDetectionSignals) {
  return detectTechnologiesWithRules(signals, mockedTechnologyRules);
}

describe('technology-stack detector', () => {
  beforeEach(() => {
    useRules([]);
  });

  it('合并 headers 命中并按规则提取版本与置信度', () => {
    useRules([{
      name: 'nginx',
      slug: 'nginx',
      categories: ['web-server'],
      headers: {
        server: [{ pattern: /nginx\/([0-9.]+)/i, confidence: 80, version: /nginx\/([0-9.]+)/i }],
      },
    }]);

    const result = detectTechnologies(createSignals({
      network: {
        headers: { server: 'nginx/1.25.3' },
        cookieNames: [],
        requestUrls: [],
        updatedAt: 2,
      },
    }));

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      slug: 'nginx',
      version: '1.25.3',
      versionReliability: 'probable',
      confidence: 80,
      sources: ['headers'],
    });
  });

  it('支持 script/html/js 推断 implied 技术并去重输出', () => {
    useRules([
      {
        name: 'React',
        slug: 'react',
        categories: ['ui-framework'],
        js: { React: true },
      },
      {
        name: 'Next.js',
        slug: 'nextjs',
        categories: ['framework'],
        scriptSrc: [/_next\/static\//i],
        html: [/__NEXT_DATA__/i],
        js: { __NEXT_DATA__: true },
        implies: ['react'],
      },
    ]);

    const result = detectTechnologies(createSignals({
      page: {
        ...createSignals().page,
        scriptSrc: ['https://example.com/_next/static/chunks/app.js'],
        html: '<script id="__NEXT_DATA__">{}</script>',
        js: { __NEXT_DATA__: true },
      },
    }));

    expect(result.map((item) => item.slug)).toEqual(['nextjs', 'react']);
    expect(result.find((item) => item.slug === 'react')?.evidence).toEqual([
      { source: 'html', key: 'implies', value: 'React', confidence: 20 },
    ]);
  });

  it('requires 缺失时移除依赖不完整的技术，依赖满足时保留', () => {
    useRules([
      {
        name: 'WordPress',
        slug: 'wordpress',
        categories: ['cms'],
        html: [/wp-content/i],
      },
      {
        name: 'WooCommerce',
        slug: 'woocommerce',
        categories: ['ecommerce'],
        html: [/woocommerce/i],
        requires: ['wordpress'],
      },
    ]);

    expect(detectTechnologies(createSignals({ page: { ...createSignals().page, html: '<div>woocommerce</div>' } })))
      .toHaveLength(0);

    expect(detectTechnologies(createSignals({ page: { ...createSignals().page, html: '<div>wp-content woocommerce</div>' } }))
      .map((item) => item.slug))
      .toEqual(['woocommerce', 'wordpress']);
  });

  it('excludes 命中时保留置信度更高的一方', () => {
    useRules([
      {
        name: 'Alpha CMS',
        slug: 'alpha',
        categories: ['cms'],
        html: [{ pattern: /shared-marker/i, confidence: 80 }],
        excludes: ['beta'],
      },
      {
        name: 'Beta CMS',
        slug: 'beta',
        categories: ['cms'],
        html: [{ pattern: /shared-marker/i, confidence: 30 }],
      },
    ]);

    expect(detectTechnologies(createSignals({ page: { ...createSignals().page, html: '<main>shared-marker</main>' } }))
      .map((item) => item.slug))
      .toEqual(['alpha']);
  });

  it('同 slug 多规则会合并分类、来源和证据，并按证据综合置信度', () => {
    useRules([
      {
        name: 'Shared Tech',
        slug: 'shared',
        categories: ['framework'],
        meta: { generator: [{ pattern: /Shared/i, confidence: 50 }] },
      },
      {
        name: 'Shared Tech',
        slug: 'shared',
        categories: ['ui-framework'],
        scriptSrc: [{ pattern: /shared\.js/i, confidence: 50 }],
      },
    ]);

    const result = detectTechnologies(createSignals({
      page: {
        ...createSignals().page,
        meta: { generator: 'Shared 2.0' },
        scriptSrc: ['https://cdn.example.com/shared.js'],
      },
    }));

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      slug: 'shared',
      confidence: 100,
    });
    expect(result[0]?.categories.sort()).toEqual(['framework', 'ui-framework']);
    expect(result[0]?.sources.sort()).toEqual(['meta', 'script-src']);
    expect(result[0]?.evidence).toHaveLength(2);
  });

  it('置信度按命中 confidence 累加并在 100 封顶', () => {
    useRules([{
      name: 'Capped Confidence Tech',
      slug: 'capped-confidence-tech',
      categories: ['framework'],
      meta: { generator: [{ pattern: /Capped/i, confidence: 60 }] },
      scriptSrc: [{ pattern: /capped\.js/i, confidence: 60 }],
    }]);

    const result = detectTechnologies(createSignals({
      page: {
        ...createSignals().page,
        meta: { generator: 'Capped' },
        scriptSrc: ['https://cdn.example.com/capped.js'],
      },
    }));

    expect(result[0]?.confidence).toBe(100);
  });

  it('版本候选会丢弃超长值和长时间戳', () => {
    useRules([
      {
        name: 'Long Version Tech',
        slug: 'long-version-tech',
        categories: ['framework'],
        headers: {
          server: [{ pattern: /LongVersion\/([0-9.]{16,})/i, confidence: 80, version: /LongVersion\/([0-9.]{16,})/i }],
        },
      },
      {
        name: 'Timestamp Version Tech',
        slug: 'timestamp-version-tech',
        categories: ['framework'],
        meta: {
          generator: [{ pattern: /TimestampVersion\/(\d{10,})/i, confidence: 80, version: /TimestampVersion\/(\d{10,})/i }],
        },
      },
    ]);

    const result = detectTechnologies(createSignals({
      page: { ...createSignals().page, meta: { generator: 'TimestampVersion/1715155200000' } },
      network: {
        headers: { server: 'LongVersion/1234567890123456' },
        cookieNames: [],
        requestUrls: [],
        updatedAt: 2,
      },
    }));

    expect(result.map((item) => item.version)).toEqual([undefined, undefined]);
  });

  it('cookie 规则只使用 cookie 名称，不会输出原始 cookie 值', () => {
    useRules([{
      name: 'Laravel',
      slug: 'laravel',
      categories: ['backend-framework'],
      cookies: [{ pattern: /laravel_session/i, confidence: 70 }],
    }]);

    const result = detectTechnologies(createSignals({
      network: {
        headers: {},
        cookieNames: ['laravel_session'],
        requestUrls: ['https://example.com/api?token=secret-cookie-value'],
        updatedAt: 2,
      },
    }));

    expect(result).toHaveLength(1);
    expect(result[0]?.evidence).toEqual([
      { source: 'cookies', key: 'cookie-name', value: 'laravel_session', confidence: 70 },
    ]);
    expect(JSON.stringify(result)).not.toContain('secret-cookie-value');
  });

  it('cookie 值规则只保留安全命中摘要，不泄露 cookie 原始值', () => {
    useRules([{
      name: 'Cookie Value Tech',
      slug: 'cookie-value-tech',
      categories: ['analytics'],
      cookieValues: [{ pattern: /secret-platform-marker/i, confidence: 70 }],
    }]);

    const result = detectTechnologies(createSignals({
      network: {
        headers: {},
        cookieNames: ['platform_cookie'],
        cookieValues: [{ name: 'platform_cookie', value: 'secret-platform-marker' }],
        requestUrls: [],
        updatedAt: 2,
      },
    }));

    expect(result).toHaveLength(1);
    expect(result[0]?.evidence).toEqual([
      { source: 'cookies', key: 'cookie-pattern-hit', confidence: 70 },
    ]);
    expect(JSON.stringify(result)).not.toContain('secret-platform-marker');
  });

  it('覆盖每类公开信号来源并隔离单条异常规则', () => {
    const brokenRule: TestTechnologyRule = {
      name: 'Broken Tech',
      slug: 'broken-tech',
      categories: ['other'],
    };
    Object.defineProperty(brokenRule, 'headers', {
      /** 测试专用：模拟单条规则读取阶段抛错。 */
      get() {
        throw new Error('broken rule');
      },
    });

    useRules([
      {
        name: 'Header Tech',
        slug: 'header-tech',
        categories: ['web-server'],
        headers: { server: [/HeaderTech/i] },
      },
      {
        name: 'Cookie Tech',
        slug: 'cookie-tech',
        categories: ['analytics'],
        cookies: [/cookie_tech/i],
      },
      {
        name: 'Meta Tech',
        slug: 'meta-tech',
        categories: ['cms'],
        meta: { generator: [/MetaTech/i] },
      },
      {
        name: 'HTML Tech',
        slug: 'html-tech',
        categories: ['framework'],
        html: [/html-tech/i],
      },
      {
        name: 'Text Tech',
        slug: 'text-tech',
        categories: ['other'],
        text: [/text tech/i],
      },
      {
        name: 'CSS Tech',
        slug: 'css-tech',
        categories: ['ui-framework'],
        css: [/--css-tech/i],
      },
      {
        name: 'Script Tech',
        slug: 'script-tech',
        categories: ['build-tool'],
        scriptSrc: [/script-tech\.js/i],
        inlineScript: [/ScriptTech\.init/i],
      },
      {
        name: 'Inline Tech',
        slug: 'inline-tech',
        categories: ['build-tool'],
        inlineScript: [/inlineTech/i],
      },
      {
        name: 'DOM Tech',
        slug: 'dom-tech',
        categories: ['ui-framework'],
        dom: { '[data-dom-tech]': true },
      },
      {
        name: 'JS Tech',
        slug: 'js-tech',
        categories: ['ui-framework'],
        js: { JsTech: true },
      },
      {
        name: 'XHR Tech',
        slug: 'xhr-tech',
        categories: ['analytics'],
        xhrUrl: [/xhr-tech/i],
      },
      {
        name: 'Language Tech',
        slug: 'language-tech',
        categories: ['programming-language'],
        language: [/zh-CN/i],
      },
      // 这个 getter 会在单条规则检测时抛错，用来验证异常隔离语义。
      brokenRule,
    ]);

    const result = detectTechnologies(createSignals({
      page: {
        ...createSignals().page,
        language: 'zh-CN',
        meta: { generator: 'MetaTech' },
        scriptSrc: ['https://cdn.example.com/script-tech.js'],
        inlineScript: ['ScriptTech.init(); window.inlineTech = true;'],
        stylesheetHrefs: [],
        cssText: [':root { --css-tech: 1; }'],
        dom: { '[data-dom-tech]': true },
        text: 'visible text tech marker',
        html: '<div data-dom-tech>html-tech</div>',
        js: { JsTech: true },
      },
      network: {
        headers: { server: 'HeaderTech' },
        cookieNames: ['cookie_tech'],
        requestUrls: ['https://api.example.com/xhr-tech'],
        updatedAt: 2,
      },
    }));

    expect(result.map((item) => item.slug).sort()).toEqual([
      'cookie-tech',
      'css-tech',
      'dom-tech',
      'header-tech',
      'html-tech',
      'inline-tech',
      'js-tech',
      'language-tech',
      'meta-tech',
      'script-tech',
      'text-tech',
      'xhr-tech',
    ]);
  });

  it('优先使用 content script 本地完整扫描命中，避免大页面样本截断影响识别', () => {
    useRules([{
      name: 'Local Full Scan Tech',
      slug: 'local-full-scan-tech',
      categories: ['framework'],
      html: [{ pattern: /local-full-scan-tech\s+([0-9.]+)/i, confidence: 82, version: /local-full-scan-tech\s+([0-9.]+)/i, versionReliability: 'exact' }],
    }]);

    const result = detectTechnologies(createSignals({
      page: {
        ...createSignals().page,
        html: '<main>short sample without marker</main>',
        localPatternMatches: [{
          ruleSlug: 'local-full-scan-tech',
          source: 'html',
          key: 'html',
          confidence: 82,
          version: '3.4.5',
          versionReliability: 'exact',
        }],
      },
    }));

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      slug: 'local-full-scan-tech',
      confidence: 82,
      version: '3.4.5',
      versionReliability: 'exact',
      sources: ['html'],
    });
  });

  it('候选选择不把 quickMatch 当硬门槛，未派生 token 的活动规则仍进入正式匹配', () => {
    useRules([
      {
        name: 'Untokenizable HTML',
        slug: 'untokenizable-html',
        categories: ['other'],
        html: [/[a-z]{8,}/i],
      },
      {
        name: 'Derived HTML',
        slug: 'derived-html',
        categories: ['other'],
        html: [/derived-html-marker/i],
      },
      {
        name: 'Tokened HTML',
        slug: 'tokened-html',
        categories: ['other'],
        html: [/tokened-html-marker/i],
        quickMatch: { html: ['tokened-html-marker'] },
      },
      {
        name: 'Explicit Quick Miss Still Pattern Matches',
        slug: 'explicit-quick-miss-still-pattern-matches',
        categories: ['other'],
        html: [/explicit-pattern-marker/i],
        quickMatch: { html: ['not-present-quick-token'] },
      },
      {
        name: 'Header Rule',
        slug: 'header-rule',
        categories: ['other'],
        headers: { server: [/header-rule/i] },
      },
    ]);

    const candidates = selectCandidateRules(
      createSignals({
        page: { ...createSignals().page, html: '<div>derived-html-marker tokened-html-marker explicit-pattern-marker</div>' },
        network: { headers: { server: 'header-rule' }, cookieNames: [], requestUrls: [], updatedAt: 2 },
      }),
      compileTechnologyRuleSet(mockedTechnologyRules),
    );

    expect(candidates.map((rule) => rule.slug).sort()).toEqual([
      'derived-html',
      'explicit-quick-miss-still-pattern-matches',
      'header-rule',
      'tokened-html',
      'untokenizable-html',
    ]);
  });

  it('大规则包不会因全局时间预算产生 partial，且候选阶段不会漏掉尾部规则', () => {
    useRules([
      ...Array.from({ length: 1_400 }, (_, index) => ({
        name: `Noise ${index}`,
        slug: `noise-${index}`,
        categories: ['other'],
        html: [new RegExp(`noise-marker-${index}`, 'i')],
      })),
      {
        name: 'Core Tail Rule',
        slug: 'core-tail-rule',
        categories: ['other'],
        html: [/core-tail-marker/i],
      },
    ]);

    const result = detectTechnologyStackWithRules(createSignals({
      page: {
        ...createSignals().page,
        html: '<main>core-tail-marker</main>',
      },
    }), mockedTechnologyRules);

    expect(result.scanCoverage).toBe('complete');
    expect(result.technologies.map((item) => item.slug)).toEqual(['core-tail-rule']);
  });

  it('JS false 与 0 会按已存在 chain 参与匹配', () => {
    useRules([
      {
        name: 'False JS Tech',
        slug: 'false-js-tech',
        categories: ['javascript-libraries'],
        js: { 'Feature.disabled': true },
      },
      {
        name: 'Zero JS Tech',
        slug: 'zero-js-tech',
        categories: ['javascript-libraries'],
        js: { 'Feature.count': [{ pattern: /^0$/, confidence: 70 }] },
      },
    ]);

    const result = detectTechnologies(createSignals({
      page: {
        ...createSignals().page,
        js: {
          'Feature.disabled': false,
          'Feature.count': 0,
        },
      },
    }));

    expect(result.map((item) => item.slug).sort()).toEqual(['false-js-tech', 'zero-js-tech']);
  });

  it('不会只凭 script/xhr URL 弱证据输出技术', () => {
    useRules([
      {
        name: 'SDK URL Only',
        slug: 'sdk-url-only',
        categories: ['analytics'],
        scriptSrc: [/sdk-url-only\.js/i],
        inlineScript: [/SdkUrlOnly\.init/i],
        js: { SdkUrlOnly: true },
        minimumEvidenceSources: 2,
      },
    ]);

    expect(detectTechnologies(createSignals({
      page: {
        ...createSignals().page,
        scriptSrc: ['https://cdn.example.com/sdk-url-only.js'],
      },
    }))).toEqual([]);

    expect(detectTechnologies(createSignals({
      page: {
        ...createSignals().page,
        scriptSrc: ['https://cdn.example.com/sdk-url-only.js'],
        inlineScript: ['SdkUrlOnly.init();'],
      },
    })).map((item) => item.slug)).toEqual(['sdk-url-only']);
  });
});
