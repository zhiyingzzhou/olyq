/**
 * 说明：技术栈本地指纹规则包 loader。
 *
 * 职责：
 * - 通过扩展本地资产 URL 加载发布时固化的 Olyq 中性指纹规则包；
 * - 在 Service Worker 生命周期内缓存规则包摘要，避免重复解析大体积快照；
 * - 保持异步 API 形态，让规则数据不进入 Service Worker 主 chunk。
 *
 * 边界：
 * - 规则数据随扩展发布，不远程更新；
 * - 不读取远程规则库、不执行第三方脚本、不加载第三方图标；
 * - 加载失败向上抛出稳定错误，由调用方降级技术栈 source。
 */
import { FINGERPRINT_RULE_BUNDLE_ASSET_PATH } from './fingerprint-rules.generated';
import { warmTechnologyRuleQuickTokenCache } from './rule-quick-tokens';
import type { FingerprintRuleBundle } from './fingerprint-rules.generated';
import type { TechnologyRule, TechnologyRulePackageSummary } from './types';

/** 展开后的本地规则包。 */
export interface TechnologyRulePackage {
  /** active 技术指纹规则。 */
  rules: TechnologyRule[];
  /** 规则包摘要。 */
  summary: TechnologyRulePackageSummary;
}

let rulePackageCache: Promise<TechnologyRulePackage> | null = null;

/**
 * 判断未知 JSON 是否符合本地指纹包的最小结构。
 *
 * @param value - fetch 解析得到的未知 JSON。
 * @returns 结构满足 loader 最小要求时返回 true。
 */
function isFingerprintRuleBundle(value: unknown): value is FingerprintRuleBundle {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const bundle = value as Partial<FingerprintRuleBundle>;
  return typeof bundle.snapshotVersion === 'string'
    && typeof bundle.technologyCount === 'number'
    && typeof bundle.categoryCount === 'number'
    && Array.isArray(bundle.unsupportedSignals)
    && Array.isArray(bundle.rules);
}

/**
 * 解析扩展本地规则资产 URL。
 *
 * @returns 当前运行时可 fetch 的资产 URL。
 */
function resolveFingerprintRuleBundleUrl(): string {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(FINGERPRINT_RULE_BUNDLE_ASSET_PATH);
  }
  if (typeof globalThis.location !== 'undefined') {
    return new URL(`/${FINGERPRINT_RULE_BUNDLE_ASSET_PATH}`, globalThis.location.origin).toString();
  }
  return FINGERPRINT_RULE_BUNDLE_ASSET_PATH;
}

/**
 * 从扩展本地资产读取技术指纹规则包。
 *
 * @returns 解析后的本地指纹规则包。
 */
async function fetchFingerprintRuleBundle(): Promise<FingerprintRuleBundle> {
  const response = await fetch(resolveFingerprintRuleBundleUrl(), {
    cache: 'force-cache',
    credentials: 'omit',
  });
  if (!response.ok) {
    throw new Error(`fingerprint-rule-bundle-fetch-failed:${response.status}`);
  }
  const json = await response.json() as unknown;
  if (!isFingerprintRuleBundle(json)) {
    throw new Error('fingerprint-rule-bundle-invalid');
  }
  return json;
}

/**
 * 从已解析 bundle 构造当前完整技术栈规则包。
 *
 * @param bundle - 本地技术指纹 bundle。
 * @returns 只包含 active 本地指纹规则的规则包。
 */
export function buildTechnologyRulePackageFromBundle(bundle: FingerprintRuleBundle): TechnologyRulePackage {
  const rules = bundle.rules.filter((rule) => rule.status === 'active');
  warmTechnologyRuleQuickTokenCache(rules);
  return {
    rules,
    summary: {
      total: rules.length,
      technologyCount: bundle.technologyCount,
      categoryCount: bundle.categoryCount,
      snapshotVersion: bundle.snapshotVersion,
      source: 'local-fingerprint-snapshot',
      unsupportedSignals: [...bundle.unsupportedSignals],
      updateChannel: 'extension-release',
    },
  };
}

/**
 * 加载完整技术栈规则包。
 *
 * @returns 缓存后的本地规则包。
 */
export async function loadTechnologyRulePackage(): Promise<TechnologyRulePackage> {
  if (!rulePackageCache) {
    rulePackageCache = fetchFingerprintRuleBundle().then((bundle) => buildTechnologyRulePackageFromBundle(bundle));
  }
  return await rulePackageCache;
}

/**
 * 测试专用：清理规则包加载缓存。
 */
export function resetTechnologyRulePackageCacheForTests(): void {
  rulePackageCache = null;
}
