/**
 * 说明：技术栈 Service Worker 探测结果构造。
 *
 * 职责：
 * - 将页面信号、网络信号与瞬时 cookie value 信号合并为 detector 输入；
 * - 调用 Olyq 本地规则引擎生成结构化 `TechnologyStackResult`；
 * - 构造错误、空结果和不可采集结果。
 *
 * 边界：
 * - cookie value 只作为函数入参参与本轮匹配，不写入返回结果；
 * - 本模块不读取页面、网络、cookie 或规则资产，只消费调用方已经拿到的结构化输入；
 * - 不负责 pageKey / epoch / enhanced 状态。
 */
import { detectTechnologyStackWithRules } from '@/lib/technology-stack/detector';
import type { TechnologyStackErrorCode } from '@/lib/technology-stack/errors';
import type { TechnologyRulePackage } from '@/lib/technology-stack/rule-loader';
import type {
  TechnologyCookieValueSignal,
  TechnologyDetectionSignals,
  TechnologyNetworkSignals,
  TechnologyPageSignals,
  TechnologyRulePackageSummary,
  TechnologyScanCoverage,
  TechnologyStackResult,
} from '@/lib/technology-stack/types';

/** 构造标准技术栈结果。 */
export function buildTechnologyStackResult(args: {
  status: TechnologyStackResult['status'];
  tabId: number | null;
  url?: string;
  title?: string;
  pageFingerprint?: string;
  technologies?: TechnologyStackResult['technologies'];
  error?: TechnologyStackErrorCode;
  scanCoverage?: TechnologyScanCoverage;
  rulePackage?: TechnologyRulePackageSummary;
}): TechnologyStackResult {
  return {
    status: args.status,
    tabId: args.tabId,
    url: args.url ?? '',
    title: args.title ?? '',
    pageFingerprint: args.pageFingerprint ?? '',
    detectedAt: Date.now(),
    technologies: args.technologies ?? [],
    ...(args.rulePackage ? { rulePackage: args.rulePackage } : {}),
    ...(args.error ? { error: args.error } : {}),
    ...(args.scanCoverage ? { scanCoverage: args.scanCoverage } : {}),
  };
}

/** 合并页面和网络公开信号，cookie value 只在本轮本地检测内瞬时使用。 */
function buildTechnologyDetectionSignals(args: {
  pageSignals: TechnologyPageSignals;
  network: TechnologyNetworkSignals;
  cookieSignals: { names: string[]; values: TechnologyCookieValueSignal[] };
}): TechnologyDetectionSignals {
  return {
    page: args.pageSignals,
    network: {
      headers: { ...args.network.headers },
      cookieNames: args.cookieSignals.names,
      cookieValues: args.cookieSignals.values,
      requestUrls: [...args.network.requestUrls],
      updatedAt: Math.max(args.network.updatedAt, Date.now()),
    },
  };
}

/**
 * 基于已采集信号执行 detector 并构造对外结果。
 *
 * @param args - 页面、网络、cookie、规则包与 tab 身份。
 * @returns 标准技术栈结果。
 */
export function detectTechnologyStackResult(args: {
  tabId: number;
  url: string;
  title: string;
  pageSignals: TechnologyPageSignals;
  network: TechnologyNetworkSignals;
  cookieSignals: { names: string[]; values: TechnologyCookieValueSignal[] };
  rulePackage: TechnologyRulePackage;
}): TechnologyStackResult {
  const detectionSignals = buildTechnologyDetectionSignals({
    pageSignals: args.pageSignals,
    network: args.network,
    cookieSignals: args.cookieSignals,
  });
  const detection = detectTechnologyStackWithRules(detectionSignals, args.rulePackage.rules);
  const technologies = detection.technologies;
  return buildTechnologyStackResult({
    status: technologies.length > 0 ? 'ready' : 'empty',
    tabId: args.tabId,
    url: args.pageSignals.url || args.url,
    title: args.pageSignals.title || args.title,
    pageFingerprint: args.pageSignals.pageFingerprint,
    technologies,
    scanCoverage: detection.scanCoverage,
    rulePackage: args.rulePackage.summary,
  });
}
