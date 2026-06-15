/**
 * 说明：`types` 浏览器上下文类型模块。
 *
 * 职责：
 * - 承载 `browser-context` 子系统的核心类型、常量和 profile 真源；
 * - 对外暴露设置、策略、采集插件、快照和 prompt 片段等共享契约；
 * - 统一定义运行时可插拔采集器的输入输出边界，避免 UI / SW / content script 各自扩协议。
 *
 * 边界：
 * - 本文件只声明结构与纯函数常量，不承载持久化、副作用或浏览器 API 调用；
 * - profile 与 preset/tag 的映射也只在这里声明真源，不负责解析优先级。
 */
import type { PromptLanguage } from '@/lib/prompt-language';
import type { AssistantScenario } from '@/types/assistant';

/** 浏览器上下文总开关设置。 */
export interface BrowserContextSettings {
  /** 是否启用自动页面上下文采集。 */
  enabled: boolean;
  /** 全文网页模式下允许注入 prompt 的最大字符数。 */
  fullPagePromptChars: number;
}

/** 当前会话的浏览器上下文模式。 */
export interface BrowserContextConversationMode {
  /** 是否为当前会话启用自动上下文。 */
  enabled: boolean;
  /** 是否为当前会话启用全文网页模式。 */
  fullPageEnabled: boolean;
  /** 是否为当前会话启用页面设计信号模式。 */
  styleSignalsEnabled: boolean;
}

/** 内置 profile 的稳定 ID。 */
export type BrowserContextProfileId =
  | 'minimal-page'
  | 'deep-page'
  | 'focused-snippet'
  | 'structured-extraction'
  | 'workflow-aware';

/** 采集源类型。 */
export type BrowserContextSourceId =
  | 'tab-meta'
  | 'technology-stack'
  | 'readable-dom'
  | 'page-style-signals'
  | 'selection-snapshot'
  | 'element-snapshot';

/** 浏览器上下文视图状态。 */
export type BrowserContextViewStatus =
  | 'ready'
  | 'warming'
  | 'stale'
  | 'degraded'
  | 'unavailable';

/** 浏览器上下文统一调度原因。 */
export type BrowserContextWorkReason =
  | 'metadata-follow'
  | 'panel-visible'
  | 'input-intent'
  | 'manual-refresh'
  | 'send-preflight';

/** source manifest 的新鲜度标记。 */
export type BrowserContextSourceFreshness = 'fresh' | 'stale' | 'missing';

/** 可插拔 profile 定义。 */
export interface BrowserContextProfile {
  /** profile 稳定 ID。 */
  id: BrowserContextProfileId | string;
  /** 展示标题。 */
  title: string;
  /** 描述。 */
  description: string;
  /** 当前 profile 需要启用的采集源。 */
  sources: BrowserContextSourceId[];
  /** prompt 输出格式。 */
  outputFormat: 'text' | 'markdown' | 'json';
  /** 单次生成 prompt 时允许输出的最大字符数。 */
  maxPromptChars: number;
  /** 运行时正文缓存 TTL。 */
  cacheTtlMs: number;
}

/** 标签级规则。 */
export interface BrowserContextTagRule {
  /** 规则 ID。 */
  id: string;
  /** 命中的助手标签。 */
  tag: string;
  /** 命中后使用的 profile。 */
  profileId: BrowserContextProfileId | string;
  /** 优先级，数值越大越优先。 */
  priority: number;
  /** 是否启用该规则。 */
  enabled: boolean;
}

/** 助手级 override 模式。 */
export type BrowserContextAssistantOverrideMode = 'inherit' | 'disabled' | 'profile' | 'custom';

/** 助手级策略覆盖。 */
export interface BrowserContextAssistantOverride {
  /** 目标助手 ID。 */
  assistantId: string;
  /** 覆盖模式。 */
  mode: BrowserContextAssistantOverrideMode;
  /** mode=profile 时使用的 profile ID。 */
  profileId?: BrowserContextProfileId | string;
  /** mode=custom 时使用的自定义 profile。 */
  customProfile?: BrowserContextProfile;
}

/** 策略中心持久化结构。 */
export interface BrowserContextPolicyState {
  /** 标签规则列表。 */
  tagRules: BrowserContextTagRule[];
  /** 助手级 override 列表。 */
  assistantOverrides: BrowserContextAssistantOverride[];
}

/** 活动标签页的轻量快照。 */
export interface BrowserContextMetadataSnapshot {
  /** 页面标题。 */
  title: string;
  /** 页面 URL。 */
  url: string;
  /** favicon URL。 */
  favicon: string;
  /** tabId。 */
  tabId: number;
  /** 快照时间戳。 */
  extractedAt: number;
  /** 技术栈页面生命周期身份；只用于 UI 绑定 runtime update，不进入 prompt 或持久化。 */
  technologyStackPageKey?: string;
}

/** 选择内容快照。 */
export interface BrowserContextSelectionSnapshot {
  /** 选中文本。 */
  text: string;
  /** 来源 URL。 */
  url?: string;
  /** 来源标题。 */
  title?: string;
  /** 采集时间。 */
  capturedAt: number;
}

/** 元素提取快照。 */
export interface BrowserContextElementSnapshot {
  /** 元素类型。 */
  kind: string;
  /** 元素文本内容。 */
  text: string;
  /** 代码语言。 */
  codeLanguage?: string;
  /** 来源 URL。 */
  url?: string;
  /** 来源标题。 */
  title?: string;
  /** 采集时间。 */
  capturedAt: number;
}

/** 自动页面上下文的正文提取模式。 */
export type BrowserContextCaptureMode =
  | 'article'
  | 'embedded-frame'
  | 'visible-page'
  | 'structured-page'
  | 'metadata-only';

/** 自动页面上下文提取出的结构标题。 */
export interface BrowserContextHeading {
  /** 标题层级，仅允许 h1-h3。 */
  level: 1 | 2 | 3;
  /** 标题文本。 */
  text: string;
}

/** 自动页面上下文采集问题编码。 */
export type BrowserContextCollectionIssueCode =
  | 'page-uncollectable'
  | 'content-script-unreachable'
  | 'content-script-injection-failed'
  | 'empty-body'
  | 'login-wall'
  | 'challenge-page'
  | 'image-or-canvas-only'
  | 'low-quality-extraction'
  | 'collector-unavailable'
  | 'tab-unavailable'
  | 'metadata-unavailable'
  | 'selection-unavailable'
  | 'element-unavailable'
  | 'timeout'
  | 'capture-quota-limited'
  | 'stale';

/** 自动页面上下文采集问题。 */
export interface BrowserContextCollectionIssue {
  /** 问题来源。 */
  sourceId: BrowserContextSourceId;
  /** 统一问题编码。 */
  code: BrowserContextCollectionIssueCode;
  /** 原始问题摘要，便于调试与日志定位。 */
  message: string;
}

/** 单个 collector 的输出结构。 */
export interface BrowserContextCollectedSource {
  /** 来源 ID。 */
  sourceId: BrowserContextSourceId;
  /** 是否成功。 */
  ok: boolean;
  /** collector 产出的结构化数据。 */
  data?: Record<string, unknown>;
  /** 失败摘要。 */
  error?: string;
  /** 仅供 source cache 使用的运行时元信息，不参与 prompt 渲染。 */
  cacheMeta?: BrowserContextSourceCacheMeta;
}

/** source cache 内部元信息。 */
export interface BrowserContextSourceCacheMeta {
  /** technology-stack 的 SW 页面生命周期身份。 */
  technologyStackPageKey?: string;
  /** technology-stack 是否已经完成后台 enhanced pass。 */
  technologyStackEnhanced?: boolean;
}

/** 单个 source 在当前运行时 manifest 里的状态。 */
export interface BrowserContextSourceManifestEntry {
  /** 来源 ID。 */
  sourceId: BrowserContextSourceId;
  /** 当前 source 绑定的身份 key。 */
  identity: string | null;
  /** 当前 source 新鲜度。 */
  freshness: BrowserContextSourceFreshness;
  /** 最近一次成功或失败采集时间。 */
  collectedAt: number | null;
  /** 最近一次问题编码。 */
  issueCode: BrowserContextCollectionIssueCode | null;
  /** payload store 引用。 */
  payloadRef: string | null;
}

/** 浏览器上下文 source manifest 真源。 */
export type BrowserContextSourceManifest = Record<BrowserContextSourceId, BrowserContextSourceManifestEntry>;

/** 插件上下文。 */
export interface BrowserContextCollectorContext {
  /** 当前助手 ID。 */
  assistantId: string;
  /** 当前会话 ID。 */
  conversationKey: string;
  /** 当前 profile。 */
  profile: BrowserContextProfile;
  /** 最近一次 metadata 快照。 */
  metadata: BrowserContextMetadataSnapshot | null;
  /** 最近一次选择快照。 */
  selection: BrowserContextSelectionSnapshot | null;
  /** 最近一次元素快照。 */
  element: BrowserContextElementSnapshot | null;
  /** 是否强制重新采集。 */
  force?: boolean;
  /** 取消信号。 */
  signal?: AbortSignal;
  /** 当前 collector 所属调度原因。 */
  reason?: BrowserContextWorkReason;
  /** 页面稳定窗口最长等待毫秒数。 */
  stableWaitMs?: number;
  /** 正文采集意图，决定优先文章主体还是可见页面结构。 */
  readableDomIntent: 'normal' | 'full-page';
  /** technology-stack collector 的最小探测阶段；默认 fast。 */
  technologyStackMinPass?: 'fast' | 'enhanced';
  /** technology-stack collector 等待 enhanced 的最大毫秒数。 */
  technologyStackWaitMs?: number;
}

/** 单个 collector 构建出的 prompt 片段。 */
export interface BrowserContextPromptFragment {
  /** 实际写入 prompt 的文本。 */
  text: string;
  /** 当前片段在构建阶段是否已经因为预算被裁剪。 */
  truncated?: boolean;
}

/** 可插拔 collector。 */
export interface BrowserContextCollectorPlugin {
  /** collector 稳定 ID。 */
  id: BrowserContextSourceId;
  /** 执行采集。 */
  collect: (ctx: BrowserContextCollectorContext) => Promise<BrowserContextCollectedSource | null>;
  /**
   * 将 collector 产物格式化为 prompt 片段。
   *
   * 说明：
   * - collector 可以只返回字符串，让统一的最终 prompt reducer 接管预算；
   * - 若某个 collector 需要在片段级先做裁剪，必须显式返回 `truncated`，避免 UI 误判成“没有截断”。
   */
  buildPrompt: (args: {
    profile: BrowserContextProfile;
    metadata: BrowserContextMetadataSnapshot | null;
    source: BrowserContextCollectedSource;
    /** 当前 UI 语言归一化后的 prompt 语言。 */
    language: PromptLanguage;
  }) => string | BrowserContextPromptFragment | null;
}

/** 有效策略解析结果。 */
export interface ResolvedBrowserContextPolicy {
  /** 命中的 profile。 */
  profile: BrowserContextProfile;
  /** 命中来源。 */
  source: 'assistant-custom' | 'assistant-disabled' | 'assistant-profile' | 'tag-rule' | 'default';
  /** 命中的标签规则 ID。 */
  tagRuleId?: string;
}

/** 浏览器上下文 prompt 生成结果。 */
export interface BrowserContextPromptResult {
  /** 用于拼接到 system prompt 的片段。 */
  prompt: string | null;
  /** 使用的 profile。 */
  profile: BrowserContextProfile;
  /** 当前 metadata。 */
  metadata: BrowserContextMetadataSnapshot | null;
  /** 命中的采集源结果。 */
  collected: BrowserContextCollectedSource[];
  /** 本轮 source manifest。 */
  sourceManifest: BrowserContextSourceManifest;
  /** 供状态条直接消费的采集预览。 */
  preview: BrowserContextCollectionPreview | null;
}

/** 自动页面上下文最近一次采集预览。 */
export interface BrowserContextStyleCapturePreview {
  /** 本轮是否真正请求页面截图。 */
  requested: boolean;
  /** 本轮可作为临时视觉输入的隐藏截图数量。 */
  frameCount: number;
  /** 本轮页面截图的消费目标。 */
  target: 'vision-input' | 'style-signals-only';
  /** 截图失败或降级时的稳定原因码。 */
  warningCode: string | null;
}

/** 自动页面上下文最近一次采集预览。 */
export interface BrowserContextCollectionPreview {
  /** 本轮采集整体状态。 */
  status: 'success' | 'partial' | 'failed';
  /** 本轮正文提取模式。 */
  captureMode: BrowserContextCaptureMode;
  /** 成功命中的采集源。 */
  sources: BrowserContextSourceId[];
  /** 本轮失败或降级原因。 */
  issues: BrowserContextCollectionIssue[];
  /** 本轮是否真正拿到正文。 */
  bodyAvailable: boolean;
  /** 正文预览片段。 */
  snippet: string;
  /** 页面结构标题提纲。 */
  headings: BrowserContextHeading[];
  /** 当前正文字符数。 */
  bodyChars: number;
  /** 实际注入 prompt 的字符数。 */
  promptChars: number;
  /** 本轮采集时间。 */
  collectedAt: number;
  /** 实际注入给模型的 prompt 是否发生预算裁剪。 */
  promptTruncated: boolean;
  /** 页面风格截图的隐藏输入状态。 */
  styleCapture?: BrowserContextStyleCapturePreview | null;
}

/** 浏览器上下文状态条可消费的视图快照。 */
export interface BrowserContextViewState {
  /** 当前会话是否启用自动上下文。 */
  enabled: boolean;
  /** 站点级 master gate 是否开启。 */
  masterEnabled: boolean;
  /** 最近一次 metadata。 */
  metadata: BrowserContextMetadataSnapshot | null;
  /** 当前 browser-context 视图状态。 */
  status: BrowserContextViewStatus;
  /** 当前生效 profile。 */
  profile: BrowserContextProfile | null;
  /** 是否已加载设置。 */
  loaded: boolean;
  /** 当前是否正在按需采集正文。 */
  collecting: boolean;
  /** 当前会话的自动页面上下文模式。 */
  conversationMode: BrowserContextConversationMode;
  /** 当前 source manifest 真源。 */
  sourceManifest: BrowserContextSourceManifest;
  /** 最近一次正文采集预览。 */
  lastCollection: BrowserContextCollectionPreview | null;
}

/**
 * 创建空白 source manifest。
 *
 * @returns 所有 source 都标记为 missing 的新 manifest。
 */
export function createEmptyBrowserContextSourceManifest(): BrowserContextSourceManifest {
  return {
    'tab-meta': {
      sourceId: 'tab-meta',
      identity: null,
      freshness: 'missing',
      collectedAt: null,
      issueCode: null,
      payloadRef: null,
    },
    'readable-dom': {
      sourceId: 'readable-dom',
      identity: null,
      freshness: 'missing',
      collectedAt: null,
      issueCode: null,
      payloadRef: null,
    },
    'technology-stack': {
      sourceId: 'technology-stack',
      identity: null,
      freshness: 'missing',
      collectedAt: null,
      issueCode: null,
      payloadRef: null,
    },
    'page-style-signals': {
      sourceId: 'page-style-signals',
      identity: null,
      freshness: 'missing',
      collectedAt: null,
      issueCode: null,
      payloadRef: null,
    },
    'selection-snapshot': {
      sourceId: 'selection-snapshot',
      identity: null,
      freshness: 'missing',
      collectedAt: null,
      issueCode: null,
      payloadRef: null,
    },
    'element-snapshot': {
      sourceId: 'element-snapshot',
      identity: null,
      freshness: 'missing',
      collectedAt: null,
      issueCode: null,
      payloadRef: null,
    },
  };
}

/**
 * 深拷贝 source manifest。
 *
 * @param manifest - 原始 manifest。
 * @returns 克隆结果。
 */
export function cloneBrowserContextSourceManifest(
  manifest: BrowserContextSourceManifest,
): BrowserContextSourceManifest {
  return {
    'tab-meta': { ...manifest['tab-meta'] },
    'technology-stack': { ...manifest['technology-stack'] },
    'readable-dom': { ...manifest['readable-dom'] },
    'page-style-signals': { ...manifest['page-style-signals'] },
    'selection-snapshot': { ...manifest['selection-snapshot'] },
    'element-snapshot': { ...manifest['element-snapshot'] },
  };
}

/** 总开关默认值。 */
export const DEFAULT_BROWSER_CONTEXT_SETTINGS: BrowserContextSettings = {
  enabled: true,
  fullPagePromptChars: 24_000,
};

/** 当前会话浏览器上下文模式默认值。 */
export const DEFAULT_BROWSER_CONTEXT_CONVERSATION_MODE: BrowserContextConversationMode = {
  enabled: false,
  fullPageEnabled: false,
  styleSignalsEnabled: false,
};

/** 不同助手场景对应的浏览器上下文模式默认值。 */
export const BROWSER_CONTEXT_CONVERSATION_MODE_DEFAULTS: Record<AssistantScenario, BrowserContextConversationMode> = {
  browser: {
    enabled: true,
    fullPageEnabled: false,
    styleSignalsEnabled: false,
  },
  general: {
    enabled: false,
    fullPageEnabled: false,
    styleSignalsEnabled: false,
  },
};

/**
 * 克隆浏览器上下文模式，避免暴露可变引用。
 *
 * @param value - 原始模式。
 * @returns 克隆后的模式对象。
 */
export function cloneBrowserContextConversationMode(value: BrowserContextConversationMode): BrowserContextConversationMode {
  return {
    enabled: Boolean(value.enabled),
    fullPageEnabled: Boolean(value.fullPageEnabled),
    styleSignalsEnabled: Boolean(value.styleSignalsEnabled),
  };
}

/**
 * 归一化浏览器上下文模式。
 *
 * @param value - 任意原始值。
 * @param fallback - 缺失字段时使用的回退模式。
 * @returns 规整后的模式。
 */
export function normalizeBrowserContextConversationMode(
  value: unknown,
  fallback: BrowserContextConversationMode = DEFAULT_BROWSER_CONTEXT_CONVERSATION_MODE,
): BrowserContextConversationMode {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    enabled: typeof record.enabled === 'boolean'
      ? record.enabled
      : Boolean(fallback.enabled),
    fullPageEnabled: typeof record.fullPageEnabled === 'boolean'
      ? record.fullPageEnabled
      : Boolean(fallback.fullPageEnabled),
    styleSignalsEnabled: typeof record.styleSignalsEnabled === 'boolean'
      ? record.styleSignalsEnabled
      : Boolean(fallback.styleSignalsEnabled),
  };
}

/**
 * 返回指定助手场景的浏览器上下文默认模式。
 *
 * @param scenario - 助手场景。
 * @returns 对应的默认模式克隆。
 */
export function getDefaultBrowserContextConversationModeForScenario(scenario: AssistantScenario): BrowserContextConversationMode {
  return cloneBrowserContextConversationMode(
    BROWSER_CONTEXT_CONVERSATION_MODE_DEFAULTS[scenario] ?? DEFAULT_BROWSER_CONTEXT_CONVERSATION_MODE,
  );
}

/** 默认策略中心状态。 */
export const DEFAULT_BROWSER_CONTEXT_POLICY_STATE: BrowserContextPolicyState = {
  tagRules: [],
  assistantOverrides: [],
};

/** 默认 profile ID。 */
export const DEFAULT_BROWSER_CONTEXT_PROFILE_ID: BrowserContextProfileId = 'minimal-page';

/** 内置 profile 真源。 */
export const BUILTIN_BROWSER_CONTEXT_PROFILES: BrowserContextProfile[] = [
  {
    id: 'minimal-page',
    title: 'Minimal Page',
    description: '优先保留页面主体正文与结构提纲，适合通用助手。',
    sources: ['tab-meta', 'technology-stack', 'readable-dom'],
    outputFormat: 'markdown',
    maxPromptChars: 6000,
    cacheTtlMs: 60_000,
  },
  {
    id: 'deep-page',
    title: 'Deep Page',
    description: '保留页面结构和较长正文，适合深度阅读分析。',
    sources: ['tab-meta', 'technology-stack', 'readable-dom'],
    outputFormat: 'markdown',
    maxPromptChars: 10_000,
    cacheTtlMs: 90_000,
  },
  {
    id: 'focused-snippet',
    title: 'Focused Snippet',
    description: '优先使用用户最近一次选区快照，再辅以页面元信息。',
    sources: ['tab-meta', 'technology-stack', 'selection-snapshot', 'readable-dom'],
    outputFormat: 'text',
    maxPromptChars: 3200,
    cacheTtlMs: 45_000,
  },
  {
    id: 'structured-extraction',
    title: 'Structured Extraction',
    description: '强调结构化提取与元素上下文，适合表格/字段整理。',
    sources: ['tab-meta', 'technology-stack', 'element-snapshot', 'readable-dom'],
    outputFormat: 'json',
    maxPromptChars: 4200,
    cacheTtlMs: 60_000,
  },
  {
    id: 'workflow-aware',
    title: 'Workflow Aware',
    description: '同时结合页面、选区和元素快照，适合工作流和工具编排。',
    sources: ['tab-meta', 'technology-stack', 'selection-snapshot', 'element-snapshot', 'readable-dom'],
    outputFormat: 'markdown',
    maxPromptChars: 5200,
    cacheTtlMs: 60_000,
  },
];

/** 浏览器场景 preset 到 profile 的稳定映射。 */
export const BROWSER_CONTEXT_PRESET_PROFILE_MAP: Record<string, BrowserContextProfileId> = {
  'browser-briefing': 'minimal-page',
  'browser-research': 'deep-page',
  'browser-extractor': 'structured-extraction',
  'browser-operator': 'workflow-aware',
};

/** 标签到 profile 的默认映射。 */
export const BROWSER_CONTEXT_TAG_PROFILE_MAP: Record<string, BrowserContextProfileId> = {
  '解读': 'minimal-page',
  'Briefing': 'minimal-page',
  '研究': 'deep-page',
  'Research': 'deep-page',
  '提取': 'structured-extraction',
  'Extraction': 'structured-extraction',
  '执行': 'workflow-aware',
  'Execution': 'workflow-aware',
};

/**
 * 根据 profile ID 查找内置 profile。
 *
 * @param profileId - 目标 profile ID。
 * @returns 匹配结果；为空时返回 `null`。
 */
export function findBuiltinBrowserContextProfile(profileId: string | null | undefined): BrowserContextProfile | null {
  const normalizedId = String(profileId || '').trim();
  if (!normalizedId) return null;
  return BUILTIN_BROWSER_CONTEXT_PROFILES.find((profile) => profile.id === normalizedId) ?? null;
}

/**
 * 克隆 profile，避免调用方直接修改真源对象。
 *
 * @param profile - 输入 profile。
 * @returns 浅克隆后的 profile。
 */
export function cloneBrowserContextProfile(profile: BrowserContextProfile): BrowserContextProfile {
  return {
    ...profile,
    sources: [...profile.sources],
  };
}

/**
 * 返回默认 profile。
 *
 * @returns 默认 profile 的浅克隆。
 */
export function getDefaultBrowserContextProfile(): BrowserContextProfile {
  return cloneBrowserContextProfile(
    findBuiltinBrowserContextProfile(DEFAULT_BROWSER_CONTEXT_PROFILE_ID) ?? BUILTIN_BROWSER_CONTEXT_PROFILES[0],
  );
}
