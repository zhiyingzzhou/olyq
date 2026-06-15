/**
 * 说明：`native-web-search-params` AI 能力模块。
 *
 * 职责：
 * - 定义模型内置联网搜索参数在 `topic.modelParams.nativeWebSearch` 下的唯一结构；
 * - 按 provider / transport 能力矩阵解析当前可配置参数；
 * - 为 UI 与 runtime adapter 提供同一套归一化和出站参数构造逻辑。
 *
 * 边界：
 * - 本模块不 import provider SDK，不读取 storage，不触发网络请求；
 * - 未在能力矩阵中确认的 provider 参数不会被展示或下发；
 * - 这里的参数只描述 provider-hosted / raw server tool 配置，不代表工具调用 input args。
 */
import { isPlainRecord } from '@/lib/utils/type-guards';

import type { NativeWebSearchCapability } from './native-web-search-capability';

/** `topic.modelParams` 下保存模型内置联网搜索参数的稳定键。 */
export const NATIVE_WEB_SEARCH_MODEL_PARAMS_KEY = 'nativeWebSearch';

/** 可写入 `nativeWebSearch` 的 provider namespace。 */
export type NativeWebSearchParameterProvider =
  | 'openai'
  | 'anthropic'
  | 'xai'
  | 'openrouter';

/** 可选的搜索上下文尺寸。 */
export type NativeWebSearchContextSize = 'low' | 'medium' | 'high';

/** OpenRouter server tool 可选搜索引擎。 */
export type OpenRouterNativeWebSearchEngine =
  | 'auto'
  | 'native'
  | 'exa'
  | 'firecrawl'
  | 'parallel';

/** 近似地理位置，字段名保持 provider 官方语义。 */
export interface NativeWebSearchUserLocation {
  /** 位置类型，当前官方入口均只接受 approximate。 */
  readonly type: 'approximate';
  /** ISO 3166-1 alpha-2 国家码，例如 US。 */
  readonly country?: string;
  /** 城市名。 */
  readonly city?: string;
  /** 地区、省或州。 */
  readonly region?: string;
  /** IANA 时区，例如 America/Los_Angeles。 */
  readonly timezone?: string;
}

/** OpenAI Responses web_search 当前 AI SDK 稳定承接的参数。 */
export interface OpenAiNativeWebSearchConfig {
  readonly searchContextSize?: NativeWebSearchContextSize;
  readonly allowedDomains?: string[];
  readonly userLocation?: NativeWebSearchUserLocation;
  readonly externalWebAccess?: boolean;
}

/** Anthropic Messages web_search_20260209 参数。 */
export interface AnthropicNativeWebSearchConfig {
  readonly maxUses?: number;
  readonly allowedDomains?: string[];
  readonly blockedDomains?: string[];
  readonly userLocation?: NativeWebSearchUserLocation;
}

/** xAI Responses web_search 参数。 */
export interface XaiNativeWebSearchConfig {
  readonly allowedDomains?: string[];
  readonly excludedDomains?: string[];
  readonly enableImageUnderstanding?: boolean;
}

/** OpenRouter openrouter:web_search server tool 参数。 */
export interface OpenRouterNativeWebSearchConfig {
  readonly engine?: OpenRouterNativeWebSearchEngine;
  readonly maxResults?: number;
  readonly maxTotalResults?: number;
  readonly searchContextSize?: NativeWebSearchContextSize;
  readonly allowedDomains?: string[];
  readonly excludedDomains?: string[];
  readonly userLocation?: NativeWebSearchUserLocation;
}

/** provider namespace 到配置结构的映射。 */
export interface NativeWebSearchConfigMap {
  readonly openai?: OpenAiNativeWebSearchConfig;
  readonly anthropic?: AnthropicNativeWebSearchConfig;
  readonly xai?: XaiNativeWebSearchConfig;
  readonly openrouter?: OpenRouterNativeWebSearchConfig;
}

/** 参数 UI 需要渲染的字段集合。 */
export interface NativeWebSearchParameterDescriptor {
  /** 当前 provider 的参数 namespace。无可配置参数时为 undefined。 */
  readonly providerKey?: NativeWebSearchParameterProvider;
  /** 是否提供 search context size 控件。 */
  readonly supportsSearchContextSize: boolean;
  /** 是否提供 OpenRouter engine 选择。 */
  readonly supportsEngine: boolean;
  /** 是否提供单次搜索结果数。 */
  readonly supportsMaxResults: boolean;
  /** 是否提供单请求总结果数。 */
  readonly supportsMaxTotalResults: boolean;
  /** 是否提供最大搜索次数。 */
  readonly supportsMaxUses: boolean;
  /** 是否提供 allowed domains。 */
  readonly supportsAllowedDomains: boolean;
  /** 是否提供 blocked domains。 */
  readonly supportsBlockedDomains: boolean;
  /** 是否提供 excluded domains。 */
  readonly supportsExcludedDomains: boolean;
  /** 是否提供近似位置字段。 */
  readonly supportsUserLocation: boolean;
  /** 是否提供 external web access 开关。 */
  readonly supportsExternalWebAccess: boolean;
  /** 是否提供 image understanding 开关。 */
  readonly supportsImageUnderstanding: boolean;
  /** 当前 provider 是否有任何用户可配置字段。 */
  readonly hasConfigurableFields: boolean;
  /** 面向 UI 的说明 key。 */
  readonly descriptionKey: string;
}

/** OpenAI Responses `web_search` tool factory 可直接消费的参数。 */
export interface OpenAiNativeWebSearchToolArgs {
  readonly searchContextSize?: NativeWebSearchContextSize;
  readonly filters?: {
    readonly allowedDomains?: string[];
  };
  readonly userLocation?: NativeWebSearchUserLocation;
  readonly externalWebAccess?: boolean;
}

/** provider-hosted tool factory 可直接消费的参数集合。 */
export type NativeWebSearchToolArgs =
  | OpenAiNativeWebSearchToolArgs
  | AnthropicNativeWebSearchConfig
  | XaiNativeWebSearchConfig
  | undefined;

/** OpenRouter raw server tool 出站参数，字段名保持官方 snake_case。 */
export type OpenRouterNativeWebSearchToolParameters = Partial<{
  engine: OpenRouterNativeWebSearchEngine;
  max_results: number;
  max_total_results: number;
  search_context_size: NativeWebSearchContextSize;
  allowed_domains: string[];
  excluded_domains: string[];
  user_location: NativeWebSearchUserLocation;
}>;

const SEARCH_CONTEXT_SIZES = new Set(['low', 'medium', 'high']);
const OPENROUTER_ENGINES = new Set(['auto', 'native', 'exa', 'firecrawl', 'parallel']);

/** 空参数 descriptor，用于 search-native 或无可配置参数的 provider。 */
const NO_CONFIG_DESCRIPTOR: NativeWebSearchParameterDescriptor = Object.freeze({
  supportsSearchContextSize: false,
  supportsEngine: false,
  supportsMaxResults: false,
  supportsMaxTotalResults: false,
  supportsMaxUses: false,
  supportsAllowedDomains: false,
  supportsBlockedDomains: false,
  supportsExcludedDomains: false,
  supportsUserLocation: false,
  supportsExternalWebAccess: false,
  supportsImageUnderstanding: false,
  hasConfigurableFields: false,
  descriptionKey: 'topicSettings.nativeWebSearchNoConfigDescription',
});

/** 判断字符串是否是受支持的搜索上下文尺寸。 */
function isSearchContextSize(value: unknown): value is NativeWebSearchContextSize {
  return SEARCH_CONTEXT_SIZES.has(String(value || '').trim());
}

/** 判断字符串是否是 OpenRouter 官方 server tool engine。 */
function isOpenRouterEngine(value: unknown): value is OpenRouterNativeWebSearchEngine {
  return OPENROUTER_ENGINES.has(String(value || '').trim());
}

/** 读取正整数。 */
function readPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) return undefined;
  return value;
}

/** 读取最多 25 的正整数，用于 OpenRouter 单次搜索结果数。 */
function readOpenRouterMaxResults(value: unknown): number | undefined {
  const parsed = readPositiveInteger(value);
  if (parsed === undefined) return undefined;
  return Math.min(parsed, 25);
}

/** 归一化域名 token。 */
function normalizeDomainToken(value: unknown): string | undefined {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return undefined;
  const withoutProtocol = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const withoutPath = withoutProtocol.split(/[/?#]/u)[0] || '';
  const withoutAuth = withoutPath.includes('@') ? withoutPath.split('@').pop() || '' : withoutPath;
  const withoutPort = withoutAuth.replace(/:\d+$/u, '');
  const cleaned = withoutPort.replace(/^\.+|\.+$/gu, '');
  if (!cleaned) return undefined;
  if (!/^[a-z0-9.-]+$/u.test(cleaned)) return undefined;
  if (cleaned.includes('..')) return undefined;
  return cleaned;
}

/**
 * 把任意输入归一成 provider 可接受的域名列表。
 *
 * @param value - 字符串或字符串数组；字符串允许逗号、分号和空白分隔。
 * @returns 去重后的域名列表，空列表会返回 undefined。
 */
export function normalizeNativeWebSearchDomains(value: unknown): string[] | undefined {
  const rawItems = Array.isArray(value)
    ? value
    : String(value || '').split(/[,;\s]+/u);
  const seen = new Set<string>();
  const domains: string[] = [];
  for (const item of rawItems) {
    const domain = normalizeDomainToken(item);
    if (!domain || seen.has(domain)) continue;
    seen.add(domain);
    domains.push(domain);
  }
  return domains.length > 0 ? domains : undefined;
}

/** 读取可用的近似位置对象。 */
function normalizeUserLocation(value: unknown): NativeWebSearchUserLocation | undefined {
  if (!isPlainRecord(value)) return undefined;
  const country = typeof value.country === 'string' ? value.country.trim().toUpperCase() : '';
  const city = typeof value.city === 'string' ? value.city.trim() : '';
  const region = typeof value.region === 'string' ? value.region.trim() : '';
  const timezone = typeof value.timezone === 'string' ? value.timezone.trim() : '';
  const next: NativeWebSearchUserLocation = {
    type: 'approximate',
    ...(country ? { country } : {}),
    ...(city ? { city } : {}),
    ...(region ? { region } : {}),
    ...(timezone ? { timezone } : {}),
  };
  return Object.keys(next).length > 1 ? next : undefined;
}

/**
 * 在平台不允许 allowlist 与 blocklist 同时出现时，按 allowlist 优先收敛域名过滤。
 *
 * @remarks
 * 这不是回退策略，而是出站 schema guard：话题 JSON 可被手写编辑，runtime 必须保证
 * 不把官方会拒绝的双过滤组合交给 provider。
 */
function pickMutuallyExclusiveDomainFilters(
  allowedDomains: string[] | undefined,
  blockedOrExcludedDomains: string[] | undefined,
): {
  readonly allowedDomains?: string[];
  readonly blockedOrExcludedDomains?: string[];
} {
  if (allowedDomains?.length) return { allowedDomains };
  return {
    ...(blockedOrExcludedDomains?.length ? { blockedOrExcludedDomains } : {}),
  };
}

/** 从 `modelParams` 读取 nativeWebSearch 根对象。 */
function readNativeWebSearchRecord(modelParams: Record<string, unknown> | undefined): NativeWebSearchConfigMap {
  const raw = modelParams?.[NATIVE_WEB_SEARCH_MODEL_PARAMS_KEY];
  return isPlainRecord(raw) ? raw as NativeWebSearchConfigMap : {};
}

/** 归一化 OpenAI Responses web_search 配置。 */
function normalizeOpenAiConfig(raw: unknown): OpenAiNativeWebSearchConfig | undefined {
  if (!isPlainRecord(raw)) return undefined;
  const searchContextSize = isSearchContextSize(raw.searchContextSize) ? raw.searchContextSize : undefined;
  const allowedDomains = normalizeNativeWebSearchDomains(raw.allowedDomains);
  const userLocation = normalizeUserLocation(raw.userLocation);
  const externalWebAccess = typeof raw.externalWebAccess === 'boolean' ? raw.externalWebAccess : undefined;
  const next: OpenAiNativeWebSearchConfig = {
    ...(searchContextSize ? { searchContextSize } : {}),
    ...(allowedDomains ? { allowedDomains } : {}),
    ...(userLocation ? { userLocation } : {}),
    ...(externalWebAccess !== undefined ? { externalWebAccess } : {}),
  };
  return Object.keys(next).length > 0 ? next : undefined;
}

/** 归一化 Anthropic Messages web_search_20260209 配置。 */
function normalizeAnthropicConfig(raw: unknown): AnthropicNativeWebSearchConfig | undefined {
  if (!isPlainRecord(raw)) return undefined;
  const maxUses = readPositiveInteger(raw.maxUses);
  const domainFilters = pickMutuallyExclusiveDomainFilters(
    normalizeNativeWebSearchDomains(raw.allowedDomains),
    normalizeNativeWebSearchDomains(raw.blockedDomains),
  );
  const userLocation = normalizeUserLocation(raw.userLocation);
  const next: AnthropicNativeWebSearchConfig = {
    ...(maxUses ? { maxUses } : {}),
    ...(domainFilters.allowedDomains ? { allowedDomains: domainFilters.allowedDomains } : {}),
    ...(domainFilters.blockedOrExcludedDomains ? { blockedDomains: domainFilters.blockedOrExcludedDomains } : {}),
    ...(userLocation ? { userLocation } : {}),
  };
  return Object.keys(next).length > 0 ? next : undefined;
}

/** 归一化 xAI Responses web_search 配置。 */
function normalizeXaiConfig(raw: unknown): XaiNativeWebSearchConfig | undefined {
  if (!isPlainRecord(raw)) return undefined;
  const domainFilters = pickMutuallyExclusiveDomainFilters(
    normalizeNativeWebSearchDomains(raw.allowedDomains)?.slice(0, 5),
    normalizeNativeWebSearchDomains(raw.excludedDomains)?.slice(0, 5),
  );
  const enableImageUnderstanding = typeof raw.enableImageUnderstanding === 'boolean'
    ? raw.enableImageUnderstanding
    : undefined;
  const next: XaiNativeWebSearchConfig = {
    ...(domainFilters.allowedDomains ? { allowedDomains: domainFilters.allowedDomains } : {}),
    ...(domainFilters.blockedOrExcludedDomains ? { excludedDomains: domainFilters.blockedOrExcludedDomains } : {}),
    ...(enableImageUnderstanding !== undefined ? { enableImageUnderstanding } : {}),
  };
  return Object.keys(next).length > 0 ? next : undefined;
}

/** 归一化 OpenRouter openrouter:web_search server tool 配置。 */
function normalizeOpenRouterConfig(raw: unknown): OpenRouterNativeWebSearchConfig | undefined {
  if (!isPlainRecord(raw)) return undefined;
  const engine = isOpenRouterEngine(raw.engine) ? raw.engine : undefined;
  const maxResults = readOpenRouterMaxResults(raw.maxResults);
  const maxTotalResults = readPositiveInteger(raw.maxTotalResults);
  const searchContextSize = isSearchContextSize(raw.searchContextSize) ? raw.searchContextSize : undefined;
  const rawAllowedDomains = normalizeNativeWebSearchDomains(raw.allowedDomains);
  const rawExcludedDomains = normalizeNativeWebSearchDomains(raw.excludedDomains);
  const domainFilters = engine === 'exa'
    ? { allowedDomains: rawAllowedDomains, blockedOrExcludedDomains: rawExcludedDomains }
    : pickMutuallyExclusiveDomainFilters(rawAllowedDomains, rawExcludedDomains);
  const userLocation = normalizeUserLocation(raw.userLocation);
  const next: OpenRouterNativeWebSearchConfig = {
    ...(engine ? { engine } : {}),
    ...(maxResults ? { maxResults } : {}),
    ...(maxTotalResults ? { maxTotalResults } : {}),
    ...(searchContextSize ? { searchContextSize } : {}),
    ...(domainFilters.allowedDomains ? { allowedDomains: domainFilters.allowedDomains } : {}),
    ...(domainFilters.blockedOrExcludedDomains ? { excludedDomains: domainFilters.blockedOrExcludedDomains } : {}),
    ...(userLocation ? { userLocation } : {}),
  };
  return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * 按 provider namespace 归一化完整 `nativeWebSearch` 配置。
 *
 * @param value - 任意原始值。
 * @returns 仅包含当前 schema 支持字段的配置对象。
 */
export function normalizeNativeWebSearchConfigMap(value: unknown): NativeWebSearchConfigMap | undefined {
  if (!isPlainRecord(value)) return undefined;
  const openai = normalizeOpenAiConfig(value.openai);
  const anthropic = normalizeAnthropicConfig(value.anthropic);
  const xai = normalizeXaiConfig(value.xai);
  const openrouter = normalizeOpenRouterConfig(value.openrouter);
  const next: NativeWebSearchConfigMap = {
    ...(openai ? { openai } : {}),
    ...(anthropic ? { anthropic } : {}),
    ...(xai ? { xai } : {}),
    ...(openrouter ? { openrouter } : {}),
  };
  return Object.keys(next).length > 0 ? next : undefined;
}

/** 解析当前能力对应的参数 descriptor。 */
export function resolveNativeWebSearchParameterDescriptor(
  capability: NativeWebSearchCapability | undefined,
): NativeWebSearchParameterDescriptor {
  if (!capability || capability.state !== 'supported') return NO_CONFIG_DESCRIPTOR;
  if (capability.toolName === 'native__openai_web_search') {
    return {
      ...NO_CONFIG_DESCRIPTOR,
      providerKey: 'openai',
      supportsSearchContextSize: true,
      supportsAllowedDomains: true,
      supportsUserLocation: true,
      supportsExternalWebAccess: true,
      hasConfigurableFields: true,
      descriptionKey: 'topicSettings.nativeWebSearchOpenAiDescription',
    };
  }
  if (capability.toolName === 'native__anthropic_web_search') {
    return {
      ...NO_CONFIG_DESCRIPTOR,
      providerKey: 'anthropic',
      supportsMaxUses: true,
      supportsAllowedDomains: true,
      supportsBlockedDomains: true,
      supportsUserLocation: true,
      hasConfigurableFields: true,
      descriptionKey: 'topicSettings.nativeWebSearchAnthropicDescription',
    };
  }
  if (capability.toolName === 'native__xai_web_search') {
    return {
      ...NO_CONFIG_DESCRIPTOR,
      providerKey: 'xai',
      supportsAllowedDomains: true,
      supportsExcludedDomains: true,
      supportsImageUnderstanding: true,
      hasConfigurableFields: true,
      descriptionKey: 'topicSettings.nativeWebSearchXaiDescription',
    };
  }
  if (capability.injectionKind === 'raw-server-tool' && capability.officialEntry.includes('OpenRouter')) {
    return {
      ...NO_CONFIG_DESCRIPTOR,
      providerKey: 'openrouter',
      supportsSearchContextSize: true,
      supportsEngine: true,
      supportsMaxResults: true,
      supportsMaxTotalResults: true,
      supportsAllowedDomains: true,
      supportsExcludedDomains: true,
      supportsUserLocation: true,
      hasConfigurableFields: true,
      descriptionKey: 'topicSettings.nativeWebSearchOpenRouterDescription',
    };
  }
  return NO_CONFIG_DESCRIPTOR;
}

/**
 * 读取当前 provider namespace 的已归一化配置。
 *
 * @param providerKey - 当前 provider 参数 namespace。
 * @param modelParams - 当前话题的 `modelParams`。
 * @returns 当前 provider 可消费的配置，空配置返回 undefined。
 */
export function readNativeWebSearchProviderConfig(
  providerKey: NativeWebSearchParameterProvider | undefined,
  modelParams: Record<string, unknown> | undefined,
):
  | OpenAiNativeWebSearchConfig
  | AnthropicNativeWebSearchConfig
  | XaiNativeWebSearchConfig
  | OpenRouterNativeWebSearchConfig
  | undefined {
  if (!providerKey) return undefined;
  const normalized = normalizeNativeWebSearchConfigMap(readNativeWebSearchRecord(modelParams));
  return normalized?.[providerKey];
}

/**
 * 把当前 provider 配置写回 `modelParams.nativeWebSearch`。
 *
 * @remarks
 * 该 helper 保留其它 provider namespace，保证用户切换模型时已填参数不会被误删；
 * 但每次写入都会清洗当前 namespace，避免旧字段长期留在当前协议里。
 */
export function buildModelParamsWithNativeWebSearchConfig(args: {
  readonly modelParams?: Record<string, unknown>;
  readonly providerKey: NativeWebSearchParameterProvider;
  readonly config:
    | OpenAiNativeWebSearchConfig
    | AnthropicNativeWebSearchConfig
    | XaiNativeWebSearchConfig
    | OpenRouterNativeWebSearchConfig
    | undefined;
}): Record<string, unknown> | undefined {
  const nextModelParams = isPlainRecord(args.modelParams) ? { ...args.modelParams } : {};
  const currentNative = isPlainRecord(nextModelParams[NATIVE_WEB_SEARCH_MODEL_PARAMS_KEY])
    ? { ...(nextModelParams[NATIVE_WEB_SEARCH_MODEL_PARAMS_KEY] as Record<string, unknown>) }
    : {};
  currentNative[args.providerKey] = args.config;
  const normalizedNative = normalizeNativeWebSearchConfigMap(currentNative);
  if (normalizedNative) {
    nextModelParams[NATIVE_WEB_SEARCH_MODEL_PARAMS_KEY] = normalizedNative;
  } else {
    delete nextModelParams[NATIVE_WEB_SEARCH_MODEL_PARAMS_KEY];
  }
  const entries = Object.entries(nextModelParams).filter(([, value]) => value !== undefined);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/**
 * 构造 provider-hosted tool factory 参数。
 *
 * @param capability - 本轮已解析的 native web search 能力。
 * @param modelParams - 当前话题模型参数。
 * @returns 当前 provider SDK tool factory 可消费的 camelCase 参数。
 */
export function buildNativeWebSearchToolArgs(
  capability: NativeWebSearchCapability,
  modelParams: Record<string, unknown> | undefined,
): NativeWebSearchToolArgs {
  const descriptor = resolveNativeWebSearchParameterDescriptor(capability);
  const config = readNativeWebSearchProviderConfig(descriptor.providerKey, modelParams);
  if (!config || descriptor.providerKey === 'openrouter') return undefined;
  if (descriptor.providerKey === 'openai') {
    const openai = config as OpenAiNativeWebSearchConfig;
    const toolArgs: OpenAiNativeWebSearchToolArgs = {
      ...(openai.searchContextSize ? { searchContextSize: openai.searchContextSize } : {}),
      ...(openai.allowedDomains ? { filters: { allowedDomains: openai.allowedDomains } } : {}),
      ...(openai.userLocation ? { userLocation: openai.userLocation } : {}),
      ...(openai.externalWebAccess !== undefined ? { externalWebAccess: openai.externalWebAccess } : {}),
    };
    return Object.keys(toolArgs).length > 0 ? toolArgs : undefined;
  }
  return config as NativeWebSearchToolArgs;
}

/**
 * 构造 OpenRouter `openrouter:web_search` server tool 的官方 snake_case 参数。
 *
 * @param modelParams - 当前话题模型参数。
 * @returns 可挂到 `{ type:"openrouter:web_search", parameters }` 的对象，空配置返回 undefined。
 */
export function buildOpenRouterNativeWebSearchParameters(
  modelParams: Record<string, unknown> | undefined,
): OpenRouterNativeWebSearchToolParameters | undefined {
  const config = readNativeWebSearchProviderConfig('openrouter', modelParams);
  if (!config) return undefined;
  const openrouter = config as OpenRouterNativeWebSearchConfig;
  const parameters: OpenRouterNativeWebSearchToolParameters = {
    ...(openrouter.engine ? { engine: openrouter.engine } : {}),
    ...(openrouter.maxResults ? { max_results: openrouter.maxResults } : {}),
    ...(openrouter.maxTotalResults ? { max_total_results: openrouter.maxTotalResults } : {}),
    ...(openrouter.searchContextSize ? { search_context_size: openrouter.searchContextSize } : {}),
    ...(openrouter.allowedDomains ? { allowed_domains: openrouter.allowedDomains } : {}),
    ...(openrouter.excludedDomains ? { excluded_domains: openrouter.excludedDomains } : {}),
    ...(openrouter.userLocation ? { user_location: openrouter.userLocation } : {}),
  };
  return Object.keys(parameters).length > 0 ? parameters : undefined;
}
