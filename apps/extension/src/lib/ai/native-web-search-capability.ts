/**
 * 说明：`native-web-search-capability` AI 能力模块。
 *
 * 职责：
 * - 保存模型内置联网搜索的 provider / transport / model-family 三态能力矩阵；
 * - 作为 UI 与运行时共同依赖的零副作用真源；
 * - 避免 UI 因能力判定而 import provider SDK 或后台 adapter。
 *
 * 边界：
 * - 本模块不创建工具、不读取 storage、不触发网络请求；
 * - 未核验 provider / transport / model-family 只能返回 `unsupported` 或 `unverified`。
 */
import type { ProviderType, TransportProtocol } from './types';

/** 内置联网搜索的官方核对状态。 */
export type NativeWebSearchSupportState = 'supported' | 'unsupported' | 'unverified';

/** 内置联网搜索的实际落地方式。 */
export type NativeWebSearchInjectionKind =
  | 'provider-hosted-tool'
  | 'raw-server-tool'
  | 'search-native-model'
  | 'unsupported';

/** 内置联网搜索能力矩阵的最小输入视图，供 runtime 与 UI 共用。 */
export interface NativeWebSearchCapabilityInput {
  /** Provider ID，例如 `openai` / `openrouter` / `qwen`。 */
  readonly providerId?: string;
  /** Provider 类型，例如 `openai` / `anthropic` / `dashscope`。 */
  readonly providerType?: ProviderType | string;
  /** 结合模型 registry 后的实际 Provider 类型。 */
  readonly effectiveProviderType?: ProviderType | string;
  /** 当前模型使用的底层传输协议。 */
  readonly transportProtocol?: TransportProtocol | string;
  /** 去掉 provider 前缀后的模型 ID。 */
  readonly modelId?: string;
  /** 模型语义特性集合。 */
  readonly featureKeys?: ReadonlySet<string> | ReadonlyArray<string>;
  /** 当前模型显式支持的 provider 原生请求参数。 */
  readonly supportedParameters?: ReadonlyArray<string>;
}

/** 内置联网搜索能力解析结果。 */
export interface NativeWebSearchCapability {
  /** 三态能力结论。 */
  readonly state: NativeWebSearchSupportState;
  /** 运行时注入方式；不支持时固定为 `unsupported`。 */
  readonly injectionKind: NativeWebSearchInjectionKind;
  /** 稳定工具名；仅 provider-hosted tool 有值。 */
  readonly toolName?: string;
  /** 对应官方入口的短标签。 */
  readonly officialEntry: string;
  /** 官方证据核对日期。 */
  readonly evidenceDate: '2026-05-20';
  /** 面向维护者的判定原因。 */
  readonly reason: string;
}

const EVIDENCE_DATE = '2026-05-20' as const;
const OPENAI_SEARCH_PREVIEW_MODEL_REGEX = /\bgpt-4o(?:-mini)?-search-preview(?:-[\w.]+)?\b/i;
const OPENAI_RESPONSES_SEARCH_MODEL_REGEX = /\b(?:gpt-5(?:\.\d+)?(?:-(?:mini|nano|pro))?|o[134](?:-mini)?|gpt-4\.1(?!-nano))(?:-[\w.]+)?\b/i;
const ANTHROPIC_WEB_SEARCH_MODEL_REGEX = /\b(?:claude-(?:haiku|sonnet|opus)-4|claude-3(?:\.|-)7-sonnet)(?:-[\w.]+)?\b/i;
const GEMINI_WEB_SEARCH_MODEL_REGEX = /gemini-(?:2(?!.*-image-preview).*(?:-latest)?|3(?:\.\d+)?-(?:flash|pro)(?:-(?:image-)?preview)?|flash-latest|pro-latest|flash-lite-latest)(?:-[\w-]+)*$/i;
const XAI_WEB_SEARCH_MODEL_REGEX = /\bgrok-(?:4|4\.\d+|4-\d+|4\.1|4-1|3)(?:-[\w.]+)?\b/i;
const PERPLEXITY_SEARCH_NATIVE_MODELS = new Set([
  'sonar',
  'sonar-pro',
  'sonar-reasoning',
  'sonar-reasoning-pro',
  'sonar-deep-research',
]);
const GROQ_COMPOUND_SEARCH_NATIVE_MODEL_REGEX = /\bcompound(?:-[\w.]+)?\b/i;
const DASHSCOPE_RESPONSES_SEARCH_MODEL_REGEX = /\b(?:qwen-(?:turbo|max|plus|flash)|qwen3(?:\.\d+)?-(?:max|plus|flash|turbo)|qwen-deep-research|qwq)(?:-[\w.]+)?\b/i;

/** 规范化 provider / transport token。 */
function normalizeToken(value: unknown): string {
  return String(value || '').trim().toLowerCase().replace(/[_\s-]+/g, '');
}

/** 规范化模型 ID，避免 UI 判定引入 stream runtime 依赖。 */
function normalizeModelId(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

/** 读取模型特性集合。 */
function normalizeFeatureSet(features: NativeWebSearchCapabilityInput['featureKeys']): ReadonlySet<string> {
  if (!features) return new Set();
  const rawItems = Array.isArray(features) ? features : Array.from(features);
  return new Set(rawItems.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean));
}

/** 判断显式 supportedParameters 是否允许下发工具数组。 */
function supportsToolsParameter(supportedParameters: ReadonlyArray<string> | undefined): boolean {
  if (!supportedParameters) return true;
  const supported = new Set(supportedParameters.map((item) => String(item || '').trim().toLowerCase()));
  return supported.has('tools');
}

/** 构造支持态结论。 */
function supported(args: Omit<NativeWebSearchCapability, 'state' | 'evidenceDate'>): NativeWebSearchCapability {
  return { state: 'supported', evidenceDate: EVIDENCE_DATE, ...args };
}

/** 构造不支持态结论。 */
function unsupported(officialEntry: string, reason: string): NativeWebSearchCapability {
  return {
    state: 'unsupported',
    injectionKind: 'unsupported',
    officialEntry,
    evidenceDate: EVIDENCE_DATE,
    reason,
  };
}

/** 构造未核验态结论。 */
function unverified(officialEntry: string, reason: string): NativeWebSearchCapability {
  return {
    state: 'unverified',
    injectionKind: 'unsupported',
    officialEntry,
    evidenceDate: EVIDENCE_DATE,
    reason,
  };
}

/**
 * 解析内置联网搜索能力。
 *
 * @param input - 当前 provider/model 的最小运行时或 UI 视图。
 * @returns 三态能力结论与具体注入方式。
 */
export function resolveNativeWebSearchCapability(
  input: NativeWebSearchCapabilityInput,
): NativeWebSearchCapability {
  const providerId = normalizeToken(input.providerId);
  const providerType = normalizeToken(input.providerType);
  const effectiveProviderType = normalizeToken(input.effectiveProviderType) || providerType;
  const transportProtocol = String(input.transportProtocol || '').trim();
  const modelId = normalizeModelId(input.modelId || '');
  const features = normalizeFeatureSet(input.featureKeys);
  const hasNativeFeature = features.has('native-web-search');

  const isOfficialOpenAiProvider = providerId === 'openai' && providerType === 'openai';
  const isExplicitOpenAiResponsesProvider = providerType === 'openairesponse';
  if (isOfficialOpenAiProvider || isExplicitOpenAiResponsesProvider) {
    if (transportProtocol === 'openai-responses' && OPENAI_RESPONSES_SEARCH_MODEL_REGEX.test(modelId)) {
      if (!supportsToolsParameter(input.supportedParameters)) {
        return unsupported('model supportedParameters', '当前模型显式 supportedParameters 不包含 tools，不能注入 provider-hosted/server tool。');
      }
      return supported({
        injectionKind: 'provider-hosted-tool',
        toolName: 'native__openai_web_search',
        officialEntry: 'OpenAI Responses web_search tool',
        reason: '官方 OpenAI Responses 模型族通过 provider-hosted `web_search` tool 接入。',
      });
    }
    if (isOfficialOpenAiProvider && transportProtocol === 'openai-chat' && OPENAI_SEARCH_PREVIEW_MODEL_REGEX.test(modelId)) {
      return supported({
        injectionKind: 'search-native-model',
        officialEntry: 'OpenAI Chat search-preview model',
        reason: 'OpenAI Chat search-preview 模型自身返回 annotations/source，不需要工具注入。',
      });
    }
    return unsupported('OpenAI web search', '当前 OpenAI transport/model-family 不属于已核验的 Responses web_search 或 search-preview 路径。');
  }

  if (providerId === 'anthropic' && effectiveProviderType === 'anthropic') {
    if (transportProtocol === 'anthropic-messages' && ANTHROPIC_WEB_SEARCH_MODEL_REGEX.test(modelId)) {
      if (!supportsToolsParameter(input.supportedParameters)) {
        return unsupported('model supportedParameters', '当前模型显式 supportedParameters 不包含 tools，不能注入 provider-hosted/server tool。');
      }
      return supported({
        injectionKind: 'provider-hosted-tool',
        toolName: 'native__anthropic_web_search',
        officialEntry: 'Anthropic Messages web_search_20260209 tool',
        reason: 'Anthropic Messages API 通过 direct-only `web_search_20260209` provider-hosted tool 接入，避免非 programmatic 模型触发动态过滤错误。',
      });
    }
    return unsupported('Anthropic web search', '当前 Claude 模型族不在已核验 web_search_20260209 支持范围。');
  }

  if (providerType === 'gemini' && effectiveProviderType === 'gemini') {
    if (transportProtocol === 'gemini-generate-content' && (GEMINI_WEB_SEARCH_MODEL_REGEX.test(modelId) || hasNativeFeature)) {
      if (!supportsToolsParameter(input.supportedParameters)) {
        return unsupported('model supportedParameters', '当前模型显式 supportedParameters 不包含 tools，不能注入 provider-hosted/server tool。');
      }
      return supported({
        injectionKind: 'provider-hosted-tool',
        toolName: 'native__google_search',
        officialEntry: 'Gemini Google Search grounding tool',
        reason: 'Gemini Generate Content API 通过 Google Search grounding provider tool 接入。',
      });
    }
    return unsupported('Gemini Google Search grounding', '当前 Gemini transport/model-family 不属于已核验 Google Search grounding 路径。');
  }

  if (providerType === 'vertexai' && effectiveProviderType === 'vertexai') {
    if (transportProtocol === 'gemini-generate-content' && (GEMINI_WEB_SEARCH_MODEL_REGEX.test(modelId) || hasNativeFeature)) {
      if (!supportsToolsParameter(input.supportedParameters)) {
        return unsupported('model supportedParameters', '当前模型显式 supportedParameters 不包含 tools，不能注入 provider-hosted/server tool。');
      }
      return supported({
        injectionKind: 'provider-hosted-tool',
        toolName: 'native__vertex_google_search',
        officialEntry: 'Vertex AI Google Search grounding tool',
        reason: 'Vertex Gemini 通过 Google Search grounding provider tool 接入。',
      });
    }
    return unsupported('Vertex AI Google Search grounding', '当前 Vertex transport/model-family 不属于已核验 Google Search grounding 路径。');
  }

  if (providerType === 'xai' && effectiveProviderType === 'xai') {
    if (transportProtocol === 'openai-responses' && XAI_WEB_SEARCH_MODEL_REGEX.test(modelId)) {
      if (!supportsToolsParameter(input.supportedParameters)) {
        return unsupported('model supportedParameters', '当前模型显式 supportedParameters 不包含 tools，不能注入 provider-hosted/server tool。');
      }
      return supported({
        injectionKind: 'provider-hosted-tool',
        toolName: 'native__xai_web_search',
        officialEntry: 'xAI Responses web_search tool',
        reason: 'xAI Responses API 通过 `xai.tools.webSearch()` provider-hosted tool 接入。',
      });
    }
    return unsupported('xAI web search', 'xAI Chat Live Search searchParameters 已移除；只有 Responses provider-hosted tool 路径启用。');
  }

  if (providerId === 'openrouter') {
    if (!supportsToolsParameter(input.supportedParameters)) {
      return unsupported('model supportedParameters', '当前模型显式 supportedParameters 不包含 tools，不能注入 provider-hosted/server tool。');
    }
    return supported({
      injectionKind: 'raw-server-tool',
      officialEntry: 'OpenRouter openrouter:web_search server tool',
      reason: 'OpenRouter 官方 server tool 需要直接进入请求体，不能走 openai-compatible provider-defined tool。',
    });
  }

  if (providerId === 'perplexity') {
    if (PERPLEXITY_SEARCH_NATIVE_MODELS.has(modelId)) {
      return supported({
        injectionKind: 'search-native-model',
        officialEntry: 'Perplexity Sonar search-native models',
        reason: 'Perplexity Sonar 家族自身执行搜索并返回 citations，不注入工具。',
      });
    }
    return unsupported('Perplexity Sonar', 'Perplexity 只有 Sonar search-native 模型族启用内置搜索。');
  }

  if (providerId === 'groq' || effectiveProviderType === 'groq') {
    if (GROQ_COMPOUND_SEARCH_NATIVE_MODEL_REGEX.test(modelId)) {
      return supported({
        injectionKind: 'search-native-model',
        officialEntry: 'Groq Compound built-in web search',
        reason: 'Groq Compound 模型内置工具搜索，不通过 Olyq 注入 tools。',
      });
    }
    return unsupported('Groq Compound web search', 'Groq 普通 OpenAI-compatible 模型不按模型名猜测内置搜索。');
  }

  if (providerId === 'qwen' || providerId === 'dashscope' || effectiveProviderType === 'dashscope') {
    if (transportProtocol === 'openai-responses' && DASHSCOPE_RESPONSES_SEARCH_MODEL_REGEX.test(modelId)) {
      if (!supportsToolsParameter(input.supportedParameters)) {
        return unsupported('model supportedParameters', '当前模型显式 supportedParameters 不包含 tools，不能注入 provider-hosted/server tool。');
      }
      return supported({
        injectionKind: 'provider-hosted-tool',
        toolName: 'native__dashscope_web_search',
        officialEntry: 'DashScope OpenAI-compatible Responses web_search tool',
        reason: 'DashScope 仅在 OpenAI-compatible Responses 路径下通过 `web_search` server tool 接入。',
      });
    }
    return unsupported('DashScope Responses web_search', 'DashScope Chat compatible 不再猜测 `enable_search` 或其它非当前 transport 字段。');
  }

  if (providerId === 'azure-openai' || effectiveProviderType === 'azureopenai') {
    return unverified('Azure OpenAI Responses web search', '当前 Olyq 没有 Azure Responses transport，禁止塞进 openai-compatible Chat。');
  }

  if (
    providerId === 'deepseek'
    || providerId === 'mistral'
    || providerId === 'cohere'
    || providerId === 'awsbedrock'
    || providerId === 'ollama'
    || providerId === 'siliconflow'
    || providerId === 'together'
    || providerId === 'fireworks'
    || providerType === 'openai'
    || providerType === 'newapi'
    || providerType === 'gateway'
  ) {
    return unsupported('provider native web search', '该 provider / transport 组合没有当前官方主文档可对应的内置搜索入口。');
  }

  return unverified('provider native web search', '未找到当前 provider / transport / model-family 的官方主文档直证。');
}

/**
 * 判断 UI 是否应该展示“模型内置联网搜索”入口。
 *
 * @param input - 当前模型选项或运行时上下文的最小视图。
 * @returns 只有三态矩阵为 supported 时返回 true。
 */
export function supportsNativeWebSearch(input: NativeWebSearchCapabilityInput): boolean {
  return resolveNativeWebSearchCapability(input).state === 'supported';
}
