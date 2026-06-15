/**
 * technology-stack 真实站点金标样本。
 *
 * 说明：
 * - 这里只维护首版 200 个 gold seed slug；
 * - URL、label source、分类与核验日期从当前本地指纹规则元数据解析，避免金标引用不存在的规则；
 * - 这些样本只作为 Olyq 自建人工金标起点，不使用外部技术标签数据。
 */
import type { TechnologyStackAccuracyGoldCase } from '../src/lib/technology-stack/accuracy-report';
import type { TechnologyRule } from '../src/lib/technology-stack/types';

/** 首版真实站点金标目标数量。 */
export const TECHNOLOGY_STACK_ACCURACY_GOLD_CASE_COUNT = 200;

/** 首版 200 个金标 seed slug，按规则包高价值基础顺序维护。 */
export const TECHNOLOGY_STACK_ACCURACY_GOLD_SLUGS = [
  'react',
  'next-js',
  'vue-js',
  'nuxt-js',
  'angular',
  'svelte',
  'sveltekit',
  'jquery',
  'wordpress',
  'woocommerce',
  'shopify',
  'webflow',
  'wix',
  'squarespace',
  'tailwind-css',
  'bootstrap',
  'google-analytics',
  'google-tag-manager',
  'facebook-pixel',
  'segment',
  'hubspot',
  'astro',
  'remix',
  'gatsby',
  'alpine-js',
  'preact',
  'ember-js',
  'htmx',
  'backbone-js',
  'lodash',
  'underscore-js',
  'modernizr',
  'docusaurus',
  'hugo',
  'sinuous',
  'qwik-framework',
  'lit-element',
  'htm-js',
  'millionjs',
  'infernojs',
  'mithril-js',
  'hyperapp',
  'reefjs',
  'redom',
  'marko',
  'aurelia',
  'cyclejs',
  'stimulus',
  'petite-vue',
  'redux-toolkit',
  'mobx',
  'zustand',
  'jotai',
  'recoil',
  'valtio',
  'xstate',
  'effector',
  'nanostores',
  'redux-saga',
  'tanstack',
  'react-router',
  'reach-router',
  'wouter',
  'react-hook-form',
  'formik',
  'final-form',
  'vee-validate',
  'vuelidate',
  'effect-schema',
  'vest',
  'arktype',
  'djv',
  'runtypes',
  'class-validator',
  'class-transformer',
  'react-querybuilder',
  'react-select',
  'downshift',
  'headless-ui',
  'ariakit',
  'floating-vue',
  'floating-portal',
  'hopscotchjs',
  'motion-canvas',
  'mojs',
  'react-spring',
  'vivusjs',
  'popmotion',
  'express',
  'hono',
  'koa',
  'hapi-bell',
  'routing-controllers',
  'elysiajs',
  'feathersjs',
  'loopbackjs',
  'sails-js',
  'moleculer',
  'meteor',
  'sockjs-client',
  'ts-rest',
  'graphql',
  'apollo',
  'wonka',
  'relay-runtime',
  'graphql-yoga',
  'mercurius',
  'gqty',
  'subscriptions-transport-ws',
  'prism',
  'typeorm',
  'sequelize',
  'knexjs',
  'drizzle-orm',
  'mongoose',
  'mongodb-node-driver',
  'ioredis',
  'node-redis',
  'mysql2',
  'pg-node',
  'better-sqlite3',
  'firebase',
  'supabase',
  'appwrite',
  'pocketbase-realtime',
  'parse-js-sdk',
  'hasura',
  'nhost',
  'faunadb-js',
  'realm-web',
  'pglite',
  'gun-db',
  'store2',
  'taffydb',
  'lokijs',
  'objectionjs',
  'mikro-orm',
  'slonik',
  'kysely',
  'pg-promise',
  'massivejs',
  'passport-js',
  'nextauth-js',
  'auth0',
  'auth0-lock',
  'clerk',
  'keycloak-connect-js',
  'okta',
  'react-oidc-context',
  'firebase-auth-js',
  'supabase-auth-js',
  'magic-sdk',
  'stytch-js',
  'workos-js',
  'descope-js',
  'frontegg-js',
  'fusionauth-js',
  'loginradius',
  'casdoor-sdk-js',
  'axios',
  'ofetch',
  'got',
  'wretch',
  'undici',
  'orval',
  'openapi-typescript',
  'swagger-ui',
  'redoc',
  'msw',
  'faker-js',
  'nock',
  'pino',
  'winston',
  'loglevel',
  'debug-js',
  'uuid',
  'nanoid',
  'date-fns-tz',
  'rrule',
  'cron-parser',
  'bvalidator',
  'dompurify',
  'sanitize-html',
  'marked',
  'markdown-it',
  'showdown',
  'unified',
  'micromark',
  'rehypejs',
  'mdxjs',
  'hast',
  'unist',
  'yamljs',
  'js-yaml',
  'rollupjs',
  'esbuild',
  'swc',
  'parcel',
  'rspack',
] as const;

/** 取规则可访问的代表性 URL。 */
function resolveRuleUrl(rule: TechnologyRule): string {
  return rule.website || rule.sourceUrls[0] || rule.rankMeta.evidenceUrl;
}

/** 去重 URL 并保留顺序。 */
function uniqueUrls(urls: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const url of urls) {
    const normalized = String(url || '').trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

/** 金标 fallback 分类排序，优先覆盖用户最常遇到的页面基础技术。 */
const GOLD_CATEGORY_WEIGHT = new Map<string, number>([
  ['framework', 0],
  ['ui-framework', 1],
  ['cms', 2],
  ['ecommerce', 3],
  ['analytics', 4],
  ['tag-manager', 5],
  ['cdn', 6],
  ['web-server', 7],
  ['backend-framework', 8],
  ['programming-language', 9],
  ['security', 10],
  ['hosting', 11],
  ['build-tool', 12],
  ['payment', 13],
  ['font-script', 14],
  ['database', 15],
  ['marketing', 16],
  ['other', 17],
]);

/**
 * 为金标 fallback 计算稳定排序分。
 *
 * @param rule - 当前 active 规则。
 * @returns 分数越高越适合作为人工金标 seed。
 */
function scoreGoldFallbackRule(rule: TechnologyRule): number {
  const signalCount = new Set(rule.verifiedSignals).size;
  const strongSignalCount = rule.verifiedSignals.filter((source) => (
    source === 'headers'
    || source === 'meta'
    || source === 'dom'
    || source === 'js'
    || source === 'css'
    || source === 'inline-script'
  )).length;
  return (rule.website ? 100 : 0)
    + signalCount * 12
    + strongSignalCount * 8
    + (rule.description ? 4 : 0)
    - (GOLD_CATEGORY_WEIGHT.get(rule.categories[0] ?? 'other') ?? 99);
}

/**
 * 选择当前规则包真实存在的 200 条金标规则。
 *
 * 说明：首选列表用于保持高价值技术的人工顺序；当本地快照没有某个旧 seed
 * 时，不伪造 slug，也不引入外部标签，而是从当前 active 规则里按稳定启发式补齐。
 */
function selectGoldRules(rules: readonly TechnologyRule[]): TechnologyRule[] {
  const rulesBySlug = new Map(rules.map((rule) => [rule.slug, rule] as const));
  const selected: TechnologyRule[] = [];
  const seenSlugs = new Set<string>();
  const seenUrls = new Set<string>();
  const tryAdd = (rule: TechnologyRule | undefined): void => {
    if (!rule || seenSlugs.has(rule.slug)) return;
    const url = resolveRuleUrl(rule);
    if (!/^https?:\/\//i.test(url) || seenUrls.has(url)) return;
    seenSlugs.add(rule.slug);
    seenUrls.add(url);
    selected.push(rule);
  };

  for (const slug of TECHNOLOGY_STACK_ACCURACY_GOLD_SLUGS) {
    tryAdd(rulesBySlug.get(slug));
    if (selected.length >= TECHNOLOGY_STACK_ACCURACY_GOLD_CASE_COUNT) return selected;
  }
  for (const rule of [...rules].sort((left, right) => {
    const scoreDelta = scoreGoldFallbackRule(right) - scoreGoldFallbackRule(left);
    return scoreDelta || left.slug.localeCompare(right.slug);
  })) {
    tryAdd(rule);
    if (selected.length >= TECHNOLOGY_STACK_ACCURACY_GOLD_CASE_COUNT) return selected;
  }
  return selected;
}

/**
 * 从当前规则包解析 200 条真实站点金标样本。
 *
 * @param rules - 当前 active 技术规则。
 * @returns 金标样本。
 */
export function buildTechnologyStackAccuracyGoldCases(
  rules: readonly TechnologyRule[],
): TechnologyStackAccuracyGoldCase[] {
  return selectGoldRules(rules).map((rule, index) => {
    return {
      id: `gold-${String(index + 1).padStart(3, '0')}-${rule.slug}`,
      url: resolveRuleUrl(rule),
      category: rule.categories[0] ?? 'other',
      expectedSlugs: [rule.slug],
      blockedSlugs: [],
      labelSourceUrls: uniqueUrls([
        rule.website,
        rule.rankMeta.evidenceUrl,
        ...rule.sourceUrls,
      ].filter(Boolean) as string[]).slice(0, 5),
      lastVerifiedAt: rule.lastVerifiedAt,
      notes: 'Olyq 自建金标 seed：真实公开页面检测结果用于建立 baseline，未命中会进入漏报队列而不是被静默忽略。',
    };
  });
}
