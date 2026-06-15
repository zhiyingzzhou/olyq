/**
 * 说明：技术栈本地指纹快照生成数据。
 *
 * 职责：
 * - 暴露发布时固化的中性技术指纹规则包资产路径和摘要；
 * - 避免运行时读取第三方目录、远程规则库或执行第三方代码；
 * - 只导出 Olyq 自有 loader 可消费的轻量元数据。
 *
 * 注意：请通过 scripts/generate-technology-fingerprint-bundle.mjs 生成，不要手写。
 */
import type { TechnologyCategoryInfo, TechnologyRule } from './types';

/** 本地技术指纹规则包。 */
export interface FingerprintRuleBundle {
  /** 本地快照版本。 */
  snapshotVersion: string;
  /** 生成时间。 */
  generatedAt: string;
  /** 分类数量。 */
  categoryCount: number;
  /** 分类元数据。 */
  categories: TechnologyCategoryInfo[];
  /** 分组数量。 */
  groupCount: number;
  /** 技术数量。 */
  technologyCount: number;
  /** 当前未实现的信号类型。 */
  unsupportedSignals: string[];
  /** active 指纹规则。 */
  rules: TechnologyRule[];
}

/** 随扩展发布的本地规则资产路径。 */
export const FINGERPRINT_RULE_BUNDLE_ASSET_PATH = 'data/technology-fingerprints/fingerprint-rules.json';

/** 本地技术指纹规则包摘要。 */
export const FINGERPRINT_RULE_BUNDLE_METADATA = {
  snapshotVersion: "6.12.2",
  generatedAt: "2026-05-08T04:48:38.908Z",
  categoryCount: 108,
  groupCount: 17,
  technologyCount: 7193,
  unsupportedSignals: ["dns","probe","certIssuer","robots"],
} as const;
