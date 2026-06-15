/**
 * 说明：技术栈本地指纹规则资产的 Node 侧读取器。
 *
 * 职责：
 * - 供测试、报告、benchmark 和来源校验脚本读取随包发布的本地 JSON 资产；
 * - 复用浏览器运行时的规则包归一化逻辑，避免脚本与 Service Worker 形成双真源；
 * - 保持 Node-only 读取不进入扩展运行时 chunk。
 *
 * 边界：
 * - 只读取 `public/` 下的本地生成资产；
 * - 不访问远程规则库，不读取根目录快照；
 * - 不承担浏览器运行时加载，浏览器内仍由 `rule-loader.ts` fetch 扩展本地资产。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FINGERPRINT_RULE_BUNDLE_ASSET_PATH,
  type FingerprintRuleBundle,
} from '../src/lib/technology-stack/fingerprint-rules.generated';
import {
  buildTechnologyRulePackageFromBundle,
  type TechnologyRulePackage,
} from '../src/lib/technology-stack/rule-loader';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(SCRIPT_DIR, '..');
const FINGERPRINT_RULE_BUNDLE_FILE = path.join(PACKAGE_ROOT, 'public', FINGERPRINT_RULE_BUNDLE_ASSET_PATH);

/**
 * 读取本地技术指纹 JSON 资产。
 *
 * @returns 解析后的本地指纹规则 bundle。
 */
export function loadLocalFingerprintRuleBundle(): FingerprintRuleBundle {
  return JSON.parse(readFileSync(FINGERPRINT_RULE_BUNDLE_FILE, 'utf8')) as FingerprintRuleBundle;
}

/**
 * 构造当前完整技术栈规则包。
 *
 * @returns 只包含 active 本地指纹规则的规则包。
 */
export function buildTechnologyRulePackageFromLocalData(): TechnologyRulePackage {
  return buildTechnologyRulePackageFromBundle(loadLocalFingerprintRuleBundle());
}

/** 本地技术指纹 JSON 资产文件路径。 */
export const LOCAL_FINGERPRINT_RULE_BUNDLE_FILE = FINGERPRINT_RULE_BUNDLE_FILE;
