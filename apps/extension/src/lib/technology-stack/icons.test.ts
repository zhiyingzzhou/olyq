/**
 * 说明：技术项 compact catalog resolver 测试。
 *
 * 职责：
 * - 固定 Olyq 只消费本地手动生成的 compact catalog；
 * - 验证匹配 key 只来自 exact、JS 后缀和显式父品牌分词；
 * - 防止未来恢复运行时 provider 遍历、Iconify API、上游 catalog fetch 或裸 substring 匹配。
 */
// @vitest-environment node

import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  buildCatalogIconUrl,
  buildTechnologyIconMatchKeys,
  normalizeTechnologyIconKey,
  resolveTechnologyIcon,
} from './icons';
import {
  TECHNOLOGY_ICON_CATALOG_CDN_ROOT,
  type TechnologyIconCatalog,
} from './icon-catalog-schema';
import type { TechnologyRule } from './types';

/** 构造最小技术规则。 */
function createRule(overrides: Partial<TechnologyRule>): TechnologyRule {
  return {
    name: 'Example',
    slug: 'example',
    categories: ['framework'],
    status: 'active',
    verifiedSignals: ['script-src'],
    versionPolicy: {
      reliability: 'unknown',
      sources: ['script-src'],
      notes: 'unit test',
    },
    rankMeta: {
      source: 'unit',
      batch: 'unit',
      evidenceUrl: 'https://example.com/',
    },
    sourceUrls: ['https://example.com/'],
    licenseStatus: 'public-web-observation',
    lastVerifiedAt: '2026-05-06',
    ...overrides,
  };
}

/** 构造已校验本地 compact catalog fixture。 */
function createCatalog(): TechnologyIconCatalog {
  return {
    schemaVersion: 1,
    generatedAt: '2026-05-10T00:00:00.000Z',
    sourceRules: {
      path: 'public/data/technology-fingerprints/fingerprint-rules.json',
      snapshotVersion: '6.12.2',
      generatedAt: '2026-05-10T00:00:00.000Z',
      ruleCount: 7098,
      technologyCount: 7193,
      categoryCount: 106,
    },
    iconCount: 6,
    sources: {
      ts: 'gh/glincker/thesvg@v2.3.0/public/icons/',
      si: 'npm/simple-icons@16.18.1/icons/',
      di: 'npm/devicon@2.17.0/icons/',
      mit: 'npm/material-icon-theme@5.34.0/icons/',
      ski: 'gh/tandpfun/skill-icons@7f7e691e71aec64e8354bf697835e009d1ad80f8/icons/',
      tb: 'npm/@tabler/icons@3.44.0/icons/outline/',
    },
    icons: {
      react: ['di', 'react/react-original.svg'],
      cloudflare: ['ts', 'cloudflare/default.svg'],
      umi: ['mit', 'umi.svg'],
      umami: ['si', 'umami.svg'],
      'next-js': {
        light: ['ski', 'NextJS-Light.svg'],
        dark: ['ski', 'NextJS-Dark.svg'],
      },
      nvidia: ['ts', 'nvidia/default.svg'],
    },
    generic: {
      default: ['tb', 'code.svg'],
      ai: ['tb', 'cpu.svg'],
      framework: ['tb', 'code.svg'],
      analytics: ['tb', 'chart-line.svg'],
      'javascript-frameworks': ['tb', 'code.svg'],
      performance: ['tb', 'chart-line.svg'],
      rum: ['tb', 'device-analytics.svg'],
      'ui-framework': ['tb', 'brush.svg'],
      'web-server': ['tb', 'server.svg'],
    },
  };
}

const catalog = createCatalog();

describe('technology-stack icons', () => {
  it('catalog 命中的技术只输出一个固定版本 jsDelivr URL', () => {
    const resolved = resolveTechnologyIcon(
      createRule({ name: 'React', slug: 'react', categories: ['ui-framework'] }),
      catalog,
    );
    expect(resolved.iconCandidates).toEqual([
      {
        provider: 'catalog',
        url: `${TECHNOLOGY_ICON_CATALOG_CDN_ROOT}npm/devicon@2.17.0/icons/react/react-original.svg`,
      },
    ]);
    expect(resolved.iconFallback).toBe('U');
    expect(existsSync('public/data/technology-icons/icon-candidates.json')).toBe(false);
  });

  it('Cloudflare 系列产品会生成显式父品牌 key，且 exact 候选排在父品牌前', () => {
    expect(buildTechnologyIconMatchKeys(createRule({
      name: 'Cloudflare Browser Insights',
      slug: 'cloudflare-browser-insights',
      categories: ['rum'],
    }))).toEqual([
      { key: 'cloudflare-browser-insights', reason: 'exact' },
      { key: 'cloudflare', reason: 'brand-prefix' },
    ]);

    expect(buildTechnologyIconMatchKeys(createRule({
      name: 'Cloudflare Rocket Loader',
      slug: 'cloudflare-rocket-loader',
      categories: ['performance'],
    }))).toEqual([
      { key: 'cloudflare-rocket-loader', reason: 'exact' },
      { key: 'cloudflare', reason: 'brand-prefix' },
    ]);

    const resolved = resolveTechnologyIcon(createRule({
      name: 'Cloudflare Browser Insights',
      slug: 'cloudflare-browser-insights',
      categories: ['rum'],
    }), catalog);
    expect(resolved.iconCandidates).toEqual([
      {
        provider: 'catalog',
        url: `${TECHNOLOGY_ICON_CATALOG_CDN_ROOT}gh/glincker/thesvg@v2.3.0/public/icons/cloudflare/default.svg`,
      },
    ]);
  });

  it('UmiJs 会派生 umi，并命中 material-icon-theme 的 Umi SVG', () => {
    expect(buildTechnologyIconMatchKeys(createRule({
      name: 'UmiJs',
      slug: 'umijs',
      categories: ['javascript-frameworks'],
    }))).toEqual([
      { key: 'umijs', reason: 'exact' },
      { key: 'umi-js', reason: 'exact' },
      { key: 'umi', reason: 'js-suffix' },
    ]);
    expect(resolveTechnologyIcon(createRule({
      name: 'UmiJs',
      slug: 'umijs',
      categories: ['javascript-frameworks'],
    }), catalog).iconCandidates).toEqual([{
      provider: 'catalog',
      url: `${TECHNOLOGY_ICON_CATALOG_CDN_ROOT}npm/material-icon-theme@5.34.0/icons/umi.svg`,
    }]);
  });

  it('Pulumi / Lumit / YouMind 不会裸 substring 命中 umi', () => {
    for (const [name, slug] of [
      ['Pulumi', 'pulumi'],
      ['Lumit', 'lumit'],
      ['YouMind', 'youmind'],
    ]) {
      expect(buildTechnologyIconMatchKeys(createRule({ name, slug })).map((item) => item.key)).not.toContain('umi');
    }
  });

  it('skill-icons light/dark 文件按 catalog 展开为同一个候选', () => {
    expect(resolveTechnologyIcon(createRule({
      name: 'Next.js',
      slug: 'next-js',
      categories: ['javascript-frameworks'],
    }), catalog).iconCandidates).toEqual([
      {
        provider: 'catalog',
        url: `${TECHNOLOGY_ICON_CATALOG_CDN_ROOT}gh/tandpfun/skill-icons@7f7e691e71aec64e8354bf697835e009d1ad80f8/icons/NextJS-Dark.svg`,
        lightUrl: `${TECHNOLOGY_ICON_CATALOG_CDN_ROOT}gh/tandpfun/skill-icons@7f7e691e71aec64e8354bf697835e009d1ad80f8/icons/NextJS-Light.svg`,
        darkUrl: `${TECHNOLOGY_ICON_CATALOG_CDN_ROOT}gh/tandpfun/skill-icons@7f7e691e71aec64e8354bf697835e009d1ad80f8/icons/NextJS-Dark.svg`,
      },
    ]);
  });

  it('品牌未入 catalog 但 catalog 已加载时返回 Tabler generic 分类图标', () => {
    const resolved = resolveTechnologyIcon(createRule({ name: 'Private Tech', slug: 'missing-private-tech', categories: ['web-server'] }), catalog);
    expect(resolved.iconCandidates).toEqual([{
      provider: 'generic',
      url: `${TECHNOLOGY_ICON_CATALOG_CDN_ROOT}npm/@tabler/icons@3.44.0/icons/outline/server.svg`,
    }]);
    expect(resolved.iconFallback).toBe('S');
  });

  it('拒绝非法资源片段，避免生成跨路径图标 URL', () => {
    expect(normalizeTechnologyIconKey('Vue.js')).toBe('vue-js');
    expect(buildCatalogIconUrl(['di', 'react/react-original.svg'], catalog)).toBe(`${TECHNOLOGY_ICON_CATALOG_CDN_ROOT}npm/devicon@2.17.0/icons/react/react-original.svg`);
    expect(buildCatalogIconUrl(['tb', 'code.svg'], catalog)).toBe(`${TECHNOLOGY_ICON_CATALOG_CDN_ROOT}npm/@tabler/icons@3.44.0/icons/outline/code.svg`);
    expect(buildCatalogIconUrl(['di', '../react.svg'], catalog)).toBeUndefined();
    expect(buildCatalogIconUrl(undefined, catalog)).toBeUndefined();
    expect(buildCatalogIconUrl(['di', 'react/react-original.svg'], null)).toBeUndefined();
  });

  it('catalog 未加载时直接返回本地文字占位', () => {
    const resolved = resolveTechnologyIcon(createRule({ name: 'React', slug: 'react', categories: ['ui-framework'] }), null);
    expect(resolved.iconCandidates).toEqual([]);
    expect(resolved.iconFallback).toBe('U');
  });

  it('手动图标生成和校验脚本不会被自动流程引用', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts?: Record<string, string>;
    };
    expect(packageJson.scripts?.['generate:technology-icons']).toBe('node ./scripts/generate-technology-icons.mjs');
    expect(packageJson.scripts?.['verify:technology-icons']).toBe('node ./scripts/verify-technology-icons.mjs');

    const forbiddenPattern = /generate:technology-icons|verify:technology-icons|generate-technology-icon-catalog|verify-technology-icon-catalog|generate-technology-icon-candidates|technology-icon-candidate-verification/;
    for (const [name, command] of Object.entries(packageJson.scripts ?? {})) {
      if (name === 'generate:technology-icons' || name === 'verify:technology-icons') continue;
      expect(command, `${name} must not run technology icon generation or SVG validation`).not.toMatch(forbiddenPattern);
    }
  });
});
