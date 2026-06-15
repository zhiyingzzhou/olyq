/**
 * 说明：技术栈探测插件类型真源。
 *
 * 职责：
 * - 定义 content script、Service Worker、UI 和 browser-context 共享的数据结构；
 * - 明确哪些信号可进入检测，哪些结果可展示或喂给 AI；
 * - 让探测插件保持可插拔，不把第三方快照格式散落进 UI 或后台路由。
 *
 * 边界：
 * - 这里不包含任何具体规则或浏览器 API；
 * - cookie 只允许保存名称与匹配命中摘要，禁止原始值进入这些类型；
 * - 原始 HTML、脚本片段和 CSS 只用于本地检测预算，不进入 prompt formatter。
 */

import type { TechnologyStackErrorCode } from './errors';

/** 技术栈分类 slug；使用本地指纹快照的分类语义。 */
export type TechnologyCategory = string;

/** 本地指纹快照分类元数据。 */
export interface TechnologyCategoryInfo {
  /** 快照分类 ID。 */
  id: number;
  /** 分类展示名。 */
  name: string;
  /** 稳定分类 slug。 */
  slug: TechnologyCategory;
  /** 快照分类优先级。 */
  priority: number;
}

/** 探测信号来源。 */
export type TechnologyEvidenceSource =
  | 'url'
  | 'headers'
  | 'cookies'
  | 'meta'
  | 'html'
  | 'text'
  | 'css'
  | 'script-src'
  | 'inline-script'
  | 'dom'
  | 'js'
  | 'xhr-url'
  | 'language';

/** 单条技术命中证据。 */
export interface TechnologyEvidence {
  /** 来源类型。 */
  source: TechnologyEvidenceSource;
  /** 命中的字段名或选择器。 */
  key: string;
  /** 安全摘要；不得包含 cookie 值、长 HTML、长脚本或长 CSS。 */
  value?: string;
  /** 本条证据贡献的置信度。 */
  confidence: number;
}

/** 版本识别可靠等级。 */
export type TechnologyVersionReliability = 'exact' | 'probable' | 'unknown';

/** 探测扫描覆盖状态；当前生产链路只允许完整扫描当前规则包可支持信号。 */
export type TechnologyScanCoverage = 'complete';

/** 技术项图标在 UI 运行时的来源类型。 */
export type TechnologyIconProvider = 'catalog' | 'generic';

/** 可直接用于 UI 展示的技术项 logo 候选。 */
export interface TechnologyIconCandidate {
  /** 图标来源。 */
  provider: TechnologyIconProvider;
  /** 默认图片 URL。 */
  url: string;
  /** 浅色主题图片 URL。 */
  lightUrl?: string;
  /** 深色主题图片 URL。 */
  darkUrl?: string;
}

/** 可展示与可注入 AI 摘要的技术条目。 */
export interface DetectedTechnology {
  /** 技术名称。 */
  name: string;
  /** 稳定 slug。 */
  slug: string;
  /** 分类。 */
  categories: TechnologyCategory[];
  /** 本地快照分类元数据。 */
  categoryInfos?: TechnologyCategoryInfo[];
  /** 版本号；无法确认时为空。 */
  version?: string;
  /** 当前展示版本的可靠等级。 */
  versionReliability?: Exclude<TechnologyVersionReliability, 'unknown'>;
  /** 多来源版本冲突摘要；只用于 UI 提示，不进入 AI prompt。 */
  versionConflicts?: string[];
  /** 0-100 置信度。 */
  confidence: number;
  /** 命中来源。 */
  sources: TechnologyEvidenceSource[];
  /** 安全证据摘要。 */
  evidence: TechnologyEvidence[];
  /** 官网。 */
  website?: string;
  /** 简短描述。 */
  description?: string;
  /** 技术项 logo 候选；按数组顺序尝试加载，失败后回到本地文字占位。 */
  iconCandidates: TechnologyIconCandidate[];
  /** 图标失败时的首字母或分类占位。 */
  iconFallback: string;
}

/** content script 页面扫描计划模式。 */
export type TechnologyPageScanPlanMode = 'full';

/** content script 页面扫描计划。 */
export interface TechnologyPageScanPlan {
  /** 计划模式：full 表示扫描当前规则包声明的全部可支持页面信号。 */
  mode: TechnologyPageScanPlanMode;
  /** 规则包扫描计划版本，随本地规则发布变化。 */
  version: string;
  /** 需要检查存在性的 DOM selector。 */
  domSelectors: string[];
  /** 需要从 page-world bridge 读取的 window chain。 */
  jsChains: string[];
  /** 页面侧 quick-token 候选扫描规则；只回传候选 slug，不回传原文。 */
  quickPatterns: TechnologyPageQuickScanRule[];
  /** 需要在 content script 本地完整扫描的页面文本规则。 */
  pagePatterns: TechnologyPagePatternScanRule[];
}

/** content script 页面侧 quick-token 候选扫描规则。 */
export interface TechnologyPageQuickScanRule {
  /** 所属技术 slug。 */
  ruleSlug: string;
  /** 页面信号来源。 */
  source: Extract<TechnologyEvidenceSource, 'html' | 'text' | 'css' | 'inline-script'>;
  /** 已规整的小写候选 token。 */
  token: string;
}

/** content script 本地页面扫描规则。 */
export interface TechnologyPagePatternScanRule {
  /** 所属技术 slug。 */
  ruleSlug: string;
  /** 页面信号来源。 */
  source: Extract<TechnologyEvidenceSource, 'html' | 'text' | 'css' | 'inline-script'>;
  /** 证据键名。 */
  key: string;
  /** 匹配类型。 */
  kind: 'text' | 'regex';
  /** 文本片段或正则源码。 */
  pattern: string;
  /** 正则 flags；文本匹配时为空。 */
  flags?: string;
  /** 本规则贡献的置信度。 */
  confidence: number;
  /** 版本提取正则源码；第一捕获组作为版本候选。 */
  versionPattern?: string;
  /** 版本提取正则 flags。 */
  versionFlags?: string;
  /** 版本捕获组模板，例如 `\1`。 */
  versionTemplate?: string;
  /** 本条版本提取规则的可靠等级。 */
  versionReliability?: TechnologyVersionReliability;
}

/** content script 本地页面扫描命中摘要。 */
export interface TechnologyPagePatternMatch {
  /** 所属技术 slug。 */
  ruleSlug: string;
  /** 页面信号来源。 */
  source: Extract<TechnologyEvidenceSource, 'html' | 'text' | 'css' | 'inline-script'>;
  /** 证据键名。 */
  key: string;
  /** 本条证据贡献的置信度。 */
  confidence: number;
  /** 安全短摘要；不得包含长 HTML、脚本或 CSS 原文。 */
  value?: string;
  /** 可靠版本候选；无法确认时为空。 */
  version?: string;
  /** 版本候选可靠等级。 */
  versionReliability?: TechnologyVersionReliability;
}

/** content script 可采集的页面公开信号。 */
export interface TechnologyPageSignals {
  /** 页面标题。 */
  title: string;
  /** 页面 URL。 */
  url: string;
  /** 采集时间。 */
  extractedAt: number;
  /** 轻量页面指纹。 */
  pageFingerprint: string;
  /** document.documentElement.lang 或 meta language。 */
  language: string;
  /** meta name/property/http-equiv 小写键值。 */
  meta: Record<string, string>;
  /** 外链脚本 URL 样本。 */
  scriptSrc: string[];
  /** inline script 内容样本；生产采集默认为空，SW bounded 外部脚本片段只在本轮瞬时匹配。 */
  inlineScript: string[];
  /** link stylesheet URL 样本。 */
  stylesheetHrefs: string[];
  /** CSS 文本样本；生产采集默认为空，CSS 原文只在页面侧本地匹配。 */
  cssText: string[];
  /** DOM 选择器/属性存在性信号。 */
  dom: Record<string, boolean | string>;
  /** 页面可见文本样本；生产采集默认为空，文本原文只在页面侧本地匹配。 */
  text: string;
  /** HTML 样本；生产采集默认为空，HTML 原文只在页面侧本地匹配。 */
  html: string;
  /** page-world bridge 返回的 allowlisted JS window chain 信号。 */
  js: Record<string, boolean | string | number>;
  /** HTML/text/CSS/inline script 在 content script 本地完整扫描后的命中摘要。 */
  localPatternMatches?: TechnologyPagePatternMatch[];
  /** HTML/text/CSS/inline script 页面侧 quick-token 扫描出的候选技术 slug。 */
  localCandidateSlugs?: string[];
  /** 页面扫描覆盖状态；普通采集体积边界不表达为“部分信号”。 */
  scanCoverage: TechnologyScanCoverage;
}

/** SW 内部瞬时 cookie value 信号；禁止进入结果、缓存、日志、UI 或 AI prompt。 */
export interface TechnologyCookieValueSignal {
  /** cookie 名称。 */
  name: string;
  /** cookie 原始值，仅在本次本地匹配内使用。 */
  value: string;
}

/** Service Worker 从 webRequest/cookies 补充的 tab scoped 网络信号。 */
export interface TechnologyNetworkSignals {
  /** main_frame 响应头，小写键，多值合并。 */
  headers: Record<string, string>;
  /** cookie 名称集合；禁止包含 cookie 原始值。 */
  cookieNames: string[];
  /** cookie 值瞬时匹配输入；结果和缓存不得保留这里的原始值。 */
  cookieValues?: TechnologyCookieValueSignal[];
  /** script/xmlhttprequest/fetch URL 样本。 */
  requestUrls: string[];
  /** 当前 tab 实际加载过的外链脚本 URL 样本。 */
  scriptUrls?: string[];
  /** 最近更新时间。 */
  updatedAt: number;
}

/** 探测输入信号。 */
export interface TechnologyDetectionSignals {
  /** 页面信号。 */
  page: TechnologyPageSignals;
  /** 网络信号。 */
  network: TechnologyNetworkSignals;
}

/** 探测结果状态。 */
export type TechnologyStackStatus = 'detecting' | 'ready' | 'empty' | 'uncollectable' | 'error';

/** Service Worker 暴露给 UI 与 browser-context 的技术栈结果。 */
export interface TechnologyRulePackageSummary {
  /** 当前主指纹包 active 规则数。 */
  total: number;
  /** 当前本地快照内的技术数量。 */
  technologyCount: number;
  /** 当前本地快照内的分类数量。 */
  categoryCount: number;
  /** 本地快照版本。 */
  snapshotVersion: string;
  /** 本地规则来源；只描述 Olyq 打包后的中性数据包。 */
  source: 'local-fingerprint-snapshot';
  /** 当前未实现的低频或高成本信号类型。 */
  unsupportedSignals: string[];
  /** 更新渠道。 */
  updateChannel: 'extension-release';
}

/** 技术栈规则批次摘要。 */
export interface TechnologyStackRuleBatchSummary {
  /** 批次标识。 */
  batch: string;
  /** 批次来源。 */
  source: string;
  /** 批次内 active 规则数量。 */
  total: number;
  /** 最近核验日期。 */
  lastVerifiedAt: string;
  /** 来源证据 URL。 */
  evidenceUrl: string;
}

/** 技术栈 smoke 用例结果。 */
export interface TechnologyStackSmokeCaseResult {
  /** 用例 ID。 */
  id: string;
  /** 用例说明。 */
  title: string;
  /** 样本站点 URL 或代表性公开 URL。 */
  url: string;
  /** 期望命中的技术 slug。 */
  expectedSlugs: string[];
  /** 不应该命中的技术 slug。 */
  blockedSlugs: string[];
  /** 实际命中的技术 slug。 */
  detectedSlugs: string[];
  /** 用例是否通过。 */
  passed: boolean;
  /** 检测覆盖状态。 */
  scanCoverage: TechnologyScanCoverage;
}

/** 技术栈覆盖率报告。 */
export interface TechnologyStackCoverageReport {
  /** 生成时间。 */
  generatedAt: string;
  /** 总体是否通过。 */
  passed: boolean;
  /** 失败信息。 */
  failures: string[];
  /** 规则包摘要。 */
  rulePackage: TechnologyRulePackageSummary;
  /** 严格商用目标 active 规则数。 */
  targetActiveRules: number;
  /** 当前分批推进时必须达到并验证通过的 active 规则里程碑数量。 */
  currentMilestoneActiveRules: number;
  /** 当前主包是否已达到严格目标。 */
  targetReached: boolean;
  /** 当前主包是否已达到本轮里程碑。 */
  currentMilestoneReached: boolean;
  /** 规则批次摘要。 */
  batches: TechnologyStackRuleBatchSummary[];
  /** 分类到规则数量。 */
  categoryCoverage: Record<TechnologyCategory, number>;
  /** 信号来源到规则数量。 */
  signalCoverage: Record<TechnologyEvidenceSource, number>;
  /** 核验过期规则数量。 */
  staleRuleCount: number;
  /** 缺少来源证明的规则数量。 */
  missingSourceRuleCount: number;
  /** smoke 用例结果。 */
  smokeCases: TechnologyStackSmokeCaseResult[];
  /** 报告说明。 */
  notes: string[];
}

/** Service Worker 暴露给 UI 与 browser-context 的技术栈结果。 */
export interface TechnologyStackResult {
  /** 状态。 */
  status: TechnologyStackStatus;
  /** 当前绑定 tabId。 */
  tabId: number | null;
  /** 页面 URL。 */
  url: string;
  /** 页面标题。 */
  title: string;
  /** 页面指纹。 */
  pageFingerprint: string;
  /** 采集/探测时间。 */
  detectedAt: number;
  /** 技术列表。 */
  technologies: DetectedTechnology[];
  /** 当前本地规则包摘要。 */
  rulePackage?: TechnologyRulePackageSummary;
  /** 稳定错误码。 */
  error?: TechnologyStackErrorCode;
  /** 扫描覆盖状态。 */
  scanCoverage?: TechnologyScanCoverage;
}

/** 技术规则的匹配条件。 */
export type TechnologyPatternRule =
  | string
  | RegExp
  | {
      /** 匹配模式语义；本地快照规则默认用 regex，旧测试规则可省略。 */
      kind?: 'text' | 'regex';
      /** 要匹配的字符串或正则。 */
      pattern: string | RegExp;
      /** 字符串正则的 flags，运行时会剥离 `g`。 */
      flags?: string;
      /** 本规则贡献的置信度。 */
      confidence?: number;
      /** 版本模板或提取正则；支持 `\1` 捕获组模板。 */
      version?: string | RegExp;
      /** 本条版本提取规则的可靠等级。 */
      versionReliability?: TechnologyVersionReliability;
    };

/** 技术规则来源许可状态。 */
export type TechnologyRuleLicenseStatus =
  | 'vendor-public-doc'
  | 'public-web-observation'
  | 'oss-compatible';

/** 技术规则生命周期状态。 */
export type TechnologyRuleStatus = 'candidate' | 'active' | 'deprecated' | 'blocked';

/** 技术规则版本识别策略。 */
export interface TechnologyRuleVersionPolicy {
  /** 该技术的默认版本可靠度。 */
  reliability: TechnologyVersionReliability;
  /** 允许用于版本展示的来源。 */
  sources: TechnologyEvidenceSource[];
  /** 维护备注，说明何时不展示版本。 */
  notes?: string;
}

/** 技术规则优先级来源元数据。 */
export interface TechnologyRuleRankMeta {
  /** 优先级来源，如 local-fingerprint-snapshot。 */
  source: string;
  /** 来源内排名。 */
  rank?: number;
  /** 本批规则标识。 */
  batch: string;
  /** 佐证 URL。 */
  evidenceUrl: string;
}

/** 单项技术规则。 */
export interface TechnologyRule {
  /** 技术名称。 */
  name: string;
  /** 稳定 slug。 */
  slug: string;
  /** 分类。 */
  categories: TechnologyCategory[];
  /** 本地快照分类元数据，用于多分类展示。 */
  categoryInfos?: TechnologyCategoryInfo[];
  /** 官网。 */
  website?: string;
  /** 描述。 */
  description?: string;
  /** 本地快照原始分类 ID，用于分类依赖关系解析。 */
  fingerprintCategoryIds?: number[];
  /** 页面 URL 规则。 */
  url?: TechnologyPatternRule[];
  /** 响应头规则。 */
  headers?: Record<string, TechnologyPatternRule[]>;
  /** cookie 名称规则。 */
  cookies?: TechnologyPatternRule[];
  /** cookie 值规则；只允许 SW 本地瞬时匹配，结果不得暴露原始值。 */
  cookieValues?: TechnologyPatternRule[];
  /** meta 规则。 */
  meta?: Record<string, TechnologyPatternRule[]>;
  /** HTML 小样本规则。 */
  html?: TechnologyPatternRule[];
  /** 文本规则。 */
  text?: TechnologyPatternRule[];
  /** CSS 规则。 */
  css?: TechnologyPatternRule[];
  /** 外链脚本 URL 规则。 */
  scriptSrc?: TechnologyPatternRule[];
  /** inline script 规则。 */
  inlineScript?: TechnologyPatternRule[];
  /** DOM 规则。 */
  dom?: Record<string, TechnologyPatternRule[] | true>;
  /** JS window chain 规则。 */
  js?: Record<string, TechnologyPatternRule[] | true>;
  /** XHR/script/fetch URL 规则。 */
  xhrUrl?: TechnologyPatternRule[];
  /** language 规则。 */
  language?: TechnologyPatternRule[];
  /** 快速预筛 token，用于人工规则在正式 pattern 匹配前做轻量候选过滤。 */
  quickMatch?: Partial<Record<TechnologyEvidenceSource, string[]>>;
  /**
   * 规则命中所需的最少独立信号来源数。
   *
   * 说明：面向脚本型弱证据规则时可设为 2，避免只凭 script/xhr URL
   * 依赖痕迹就把技术展示给用户或注入 AI。
   */
  minimumEvidenceSources?: number;
  /** 命中后推断出的技术；relations.implies 的扁平表达。 */
  implies?: string[];
  /** 需要同时存在的技术；relations.requires 的扁平表达。 */
  requires?: string[];
  /** 需要同时存在某个分类下的技术。 */
  requiresCategory?: number[];
  /** 互斥技术；relations.excludes 的扁平表达。 */
  excludes?: string[];
  /** 规则生命周期状态，只有 active 进入主规则包检测。 */
  status: TechnologyRuleStatus;
  /** 已人工核验的信号来源。 */
  verifiedSignals: TechnologyEvidenceSource[];
  /** 版本识别策略。 */
  versionPolicy: TechnologyRuleVersionPolicy;
  /** 优先级与批次元数据。 */
  rankMeta: TechnologyRuleRankMeta;
  /** 规则来源 URL；必须是厂商公开文档、公开网页事实或许可明确的 OSS 来源。 */
  sourceUrls: string[];
  /** 规则来源许可状态。 */
  licenseStatus: TechnologyRuleLicenseStatus;
  /** 最近人工核验日期（YYYY-MM-DD）。 */
  lastVerifiedAt: string;
}
