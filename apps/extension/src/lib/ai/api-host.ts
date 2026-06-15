/**
 * 说明：`api-host` AI 能力模块。
 *
 * 职责：
 * - 承载 `api-host` 相关的当前文件实现与模块边界；
 * - 对外暴露 `hasAPIVersion`、`withoutTrailingSlash`、`withoutTrailingSharp` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 说明：API Host/Base URL 规范化工具（Browser Studio）
 *
 * 目标：统一并收敛 API Base URL 的规范化行为，避免：
 * - 已包含版本段（如 /v2、/api/paas/v4、/openai/v1、/v3alpha）时被错误追加 /v1
 * - 用户误把完整端点（/chat/completions、/responses、/models 等）当作 API Base
 *
 * 说明：
 * - 这是"彻底切换"的新规范化入口：调用方不要再自行拼接 `/v1`。
 * - 支持 `#` 语义：当末尾带 `#` 时，视为"显式禁用自动追加版本段"。
 */
import type { ProviderType, TransportProtocol } from './types';
import type { ProviderTransportFamily } from './providers/provider-contracts';
import { resolveProviderContract } from './providers/provider-contracts';
import { resolveEffectiveProviderType } from './stream-chat-utils';

/**
 * 匹配路径中的版本段：
 * - 以 `/v\<number\>` 开头
 * - 可选后缀 `alpha` / `beta`
 * - 版本段后面可以跟 `/` 或字符串结束（例如：`/v3alpha/resources`）
 */
const VERSION_REGEX_PATTERN = '\\/v\\d+(?:alpha|beta)?(?=\\/|$)';

/** 判断 host/path 中是否已经包含显式 API 版本段。 */
export function hasAPIVersion(host?: string): boolean {
  if (!host) return false;
  const regex = new RegExp(VERSION_REGEX_PATTERN, 'i');

  try {
    const url = new URL(host);
    return regex.test(url.pathname);
  } catch {
    // 若无法作为完整 URL 解析，则当作路径直接检测
    return regex.test(host);
  }
}

/** 去掉末尾单个 `/`。 */
export function withoutTrailingSlash<T extends string>(url: T): T {
  return url.replace(/\/$/, '') as T;
}

/** 去掉末尾单个 `#`。 */
export function withoutTrailingSharp<T extends string>(url: T): T {
  return url.replace(/#$/, '') as T;
}

/**
 * 规范化规则：
 * - trim + 去掉末尾 /
 * - 若 host 末尾是 # 或 host 已包含版本段，则不追加版本段
 * - 否则追加 `/${apiVersion}`
 */
export function formatApiHost(host?: string, supportApiVersion: boolean = true, apiVersion: string = 'v1'): string {
  const normalizedHost = withoutTrailingSlash(String(host ?? '').trim());
  if (!normalizedHost) return '';

  const shouldAppendApiVersion = !(normalizedHost.endsWith('#') || !supportApiVersion || hasAPIVersion(normalizedHost));
  return shouldAppendApiVersion ? `${normalizedHost}/${apiVersion}` : withoutTrailingSharp(normalizedHost);
}

const OPENAI_ENDPOINT_SUFFIXES = [
  '/chat/completions',
  '/responses',
  '/models',
  '/embeddings',
  '/images/generations',
  '/images/edits',
  '/audio/transcriptions',
  '/audio/speech',
] as const;

const ANTHROPIC_ENDPOINT_SUFFIXES = [
  '/messages',
  '/models',
] as const;

/**
 * 从 API 地址中剥离常见具体端点后缀。
 *
 * 说明：
 * - 用户经常误把 `/chat/completions`、`/messages`、`/models` 等完整端点填进 API Host；
 * - 这里统一回退到可继续拼接版本段和资源路径的 base URL。
 */
function stripKnownEndpointSuffixes(raw: string, suffixes: readonly string[]): string {
  const input = withoutTrailingSlash(String(raw ?? '').trim());
  if (!input) return '';

  try {
    const u = new URL(input);
    const p0 = withoutTrailingSlash(u.pathname);
    const lower = p0.toLowerCase();
    for (const suf of suffixes) {
      if (lower.endsWith(suf)) {
        const nextPath = p0.slice(0, -suf.length) || '/';
        u.pathname = nextPath;
        u.search = '';
        u.hash = '';
        return withoutTrailingSlash(u.toString());
      }
    }
    u.pathname = p0 || '/';
    u.search = '';
    u.hash = '';
    return withoutTrailingSlash(u.toString());
  } catch {
    const lower = input.toLowerCase();
    for (const suf of suffixes) {
      if (lower.endsWith(suf)) {
        return input.slice(0, -suf.length) || '';
      }
    }
    return input;
  }
}

/**
 * 规范化"类 OpenAI"API Base：
 * - 移除末尾 `#`（同时把它视作"禁用自动追加版本段"的信号）
 * - 移除常见端点后缀（/chat/completions、/responses、/models…）
 * - 若路径中不包含任何版本段，则自动追加 `/v1`
 */
export function normalizeOpenAiLikeApiBase(apiBase: string, apiVersion: string = 'v1'): string {
  const raw = String(apiBase ?? '').trim();
  if (!raw) return '';

  const noAutoAppend = raw.endsWith('#');
  const withoutSharp = noAutoAppend ? raw.slice(0, -1) : raw;
  const stripped = stripKnownEndpointSuffixes(withoutSharp, OPENAI_ENDPOINT_SUFFIXES);

  // 当用户显式用 # 禁止追加版本段时，强制关闭 auto-append
  return formatApiHost(stripped, !noAutoAppend, apiVersion);
}

/**
 * 规范化 Anthropic Messages API Base：
 * - 支持末尾 `#`：禁用自动追加版本段
 * - 移除误填的 `/messages`、`/models`
 * - 若路径中不包含任何版本段，则默认追加 `/v1`
 */
export function normalizeAnthropicApiBase(apiBase: string, apiVersion: string = 'v1'): string {
  const raw = String(apiBase ?? '').trim();
  if (!raw) return '';

  const noAutoAppend = raw.endsWith('#');
  const withoutSharp = noAutoAppend ? raw.slice(0, -1) : raw;
  const stripped = stripKnownEndpointSuffixes(withoutSharp, ANTHROPIC_ENDPOINT_SUFFIXES);

  return formatApiHost(stripped, !noAutoAppend, apiVersion);
}

const GOOGLE_MODELS_SEGMENT = '/models';

/** 从 Gemini/Google API 地址中剥离 `/models/...` 路径段。 */
function stripGoogleModelsPath(raw: string): string {
  const input = withoutTrailingSlash(String(raw ?? '').trim());
  if (!input) return '';

  try {
    const u = new URL(input);
    const p0 = withoutTrailingSlash(u.pathname);
    const lower = p0.toLowerCase();
    const idx = lower.indexOf(GOOGLE_MODELS_SEGMENT);
    if (idx >= 0) {
      const nextPath = p0.slice(0, idx) || '/';
      u.pathname = nextPath;
    } else {
      u.pathname = p0 || '/';
    }
    u.search = '';
    u.hash = '';
    return withoutTrailingSlash(u.toString());
  } catch {
    const lower = input.toLowerCase();
    const idx = lower.indexOf(GOOGLE_MODELS_SEGMENT);
    if (idx >= 0) return input.slice(0, idx) || '';
    return input;
  }
}

/**
 * 规范化 Google Gemini API Base（Generative Language API）：
 * - 支持末尾 `#`：禁用自动追加版本段
 * - 移除 query/hash（避免把 key、路由参数写进 base）
 * - 若用户误填了 `/models/...`（甚至整条 generateContent URL），会剥离到 `/models` 之前
 * - 若路径中不包含任何版本段，则默认追加 `/v1beta`
 *
 * 注意：
 * - 这是“协议层”规范化：只与 Provider 类型相关，不依赖模型 ID，也不猜测网关类型。
 * - 若你的私有网关不使用版本段（如 `/v1beta` / `/v1`），请在 Base URL 末尾加 `#` 禁用自动追加。
 */
export function normalizeGoogleGenerativeAiApiBase(apiBase: string, apiVersion: string = 'v1beta'): string {
  const raw = String(apiBase ?? '').trim();
  if (!raw) return '';

  const noAutoAppend = raw.endsWith('#');
  const withoutSharp = noAutoAppend ? raw.slice(0, -1) : raw;
  const stripped = stripGoogleModelsPath(withoutSharp);

  // 彻底切换：Google Provider 的 apiBase 只视为“网关根地址”（不应包含版本段与 /models）。
  // - 若用户填了 /v1 或 /v1beta（甚至整条 /models/... URL），这里都会剥离回 root；
  // - 然后再统一追加当前默认版本段（v1beta）。
  // - 若用户希望“锁定”自定义版本段/路径，可在末尾加 `#` 禁用自动追加（同时保留现有路径）。
  if (noAutoAppend) return withoutTrailingSlash(stripped);

  const baseNoSlash = withoutTrailingSlash(stripped);
  const versionStripped = baseNoSlash.replace(new RegExp(`${VERSION_REGEX_PATTERN}$`, 'i'), '');
  return formatApiHost(versionStripped, true, apiVersion);
}

/** Provider-aware API 端点解析结果。 */
export interface ProviderApiEndpoints {
  /** 归一化后的 API base。 */
  baseUrl: string;
  /** 当前 provider 真正的聊天端点；无聊天端点时为 `null`。 */
  chatUrl: string | null;
  /** 当前 provider 真正的 `/models` 端点；无模型目录时为 `null`。 */
  modelsUrl: string | null;
  /** 模型管理页默认展示的预览 URL。 */
  previewUrl: string;
  /** 预览模式：精确端点 / base / transport 依赖。 */
  previewMode: 'chat' | 'models' | 'base' | 'transport-dependent';
  /** 当前预览命中的 transport family。 */
  transportFamily: ProviderTransportFamily | null;
}

/** endpoint 解析输入。 */
export interface ResolveProviderApiEndpointsArgs {
  /** Provider 实例 ID。 */
  providerId: string;
  /** Provider 类型。 */
  providerType: string;
  /** 默认 API Base。 */
  apiBase: string;
  /** 可选：Azure OpenAI legacy endpoint 使用的 api-version。 */
  apiVersion?: string;
  /** 可选：Azure OpenAI v1 endpoint / 网关不使用 api-version。 */
  skipApiVersion?: boolean;
  /** 可选：当前模型 transport。 */
  transportProtocol?: TransportProtocol;
  /** 可选：Anthropic 原生地址。 */
  anthropicApiHost?: string;
}

/**
 * 按 provider 类型归一化 API base。
 *
 * 说明：
 * - Anthropic 明确走 native Messages API；
 * - DeepSeek 保持“不自动补 `/v1`”的既有 SDK 语义；
 * - 其它 OpenAI-compatible provider 继续走 `/chat/completions` 基线。
 */
export function resolveProviderApiBase(providerType: string, apiBase: string): string {
  const normalizedProviderType = String(providerType || '').trim().toLowerCase();
  switch (normalizedProviderType) {
    case 'anthropic':
      return normalizeAnthropicApiBase(apiBase, 'v1');
    case 'gemini':
      return normalizeGoogleGenerativeAiApiBase(apiBase, 'v1beta');
    case 'aws-bedrock':
      return withoutTrailingSharp(withoutTrailingSlash(String(apiBase ?? '').trim()));
    case 'deepseek':
      return normalizeOpenAiLikeApiBase(`${apiBase}#`, 'v1');
    default:
      return normalizeOpenAiLikeApiBase(apiBase, 'v1');
  }
}

/** 判断 API Base 是否指向本地回环地址，从而允许本地 provider 无 API Key 调用。 */
export function isLocalApiBase(apiHost: string): boolean {
  if (!apiHost) return false;
  try {
    const url = new URL(apiHost);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  } catch {
    return false;
  }
}

/**
 * 把 transport / contract 真源压成 endpoint preview family。
 */
function resolveEndpointPreviewTransportFamily(args: ResolveProviderApiEndpointsArgs): ProviderTransportFamily | null {
  const normalizedProviderType = String(args.providerType || '').trim().toLowerCase() as ProviderType | '';
  const normalizedTransportProtocol = args.transportProtocol && args.transportProtocol !== 'unknown'
    ? args.transportProtocol
    : undefined;

  if (normalizedTransportProtocol === 'anthropic-messages') return 'anthropic-messages';
  if (normalizedTransportProtocol === 'gemini-generate-content') return 'gemini-generate-content';
  if (normalizedTransportProtocol === 'openai-responses') return 'openai-responses';
  if (normalizedTransportProtocol === 'openai-chat') return 'openai-chat';

  if (normalizedProviderType === 'openai-response') return 'openai-responses';
  if (normalizedProviderType === 'openai') return 'openai-chat';
  if (normalizedProviderType === 'anthropic' || normalizedProviderType === 'vertex-anthropic') return 'anthropic-messages';
  if (normalizedProviderType === 'gemini' || normalizedProviderType === 'vertexai') return 'gemini-generate-content';
  if (normalizedProviderType === 'azure-openai') return 'azure-openai';
  if (normalizedProviderType === 'new-api') return 'proxy';
  if (normalizedProviderType === 'gateway') return 'gateway';

  const effectiveProviderType = resolveEffectiveProviderType({
    providerId: String(args.providerId || '').trim(),
    providerType: normalizedProviderType || undefined,
    transportProtocol: normalizedTransportProtocol,
  });
  const contract = resolveProviderContract({
    providerId: String(args.providerId || '').trim(),
    providerType: normalizedProviderType || undefined,
    effectiveProviderType,
    transportProtocol: normalizedTransportProtocol,
  });
  return contract.transportFamily ?? null;
}

/** 根据 transport family 选择对应的 base 规范化 provider type。 */
function resolveApiBaseProviderType(
  providerType: string,
  transportFamily: ProviderTransportFamily | null,
): string {
  if (transportFamily === 'anthropic-messages') return 'anthropic';
  if (transportFamily === 'gemini-generate-content') return 'gemini';
  return providerType;
}

/**
 * 给预览 URL 补 Azure legacy `api-version` 查询参数。
 *
 * 说明：
 * - 只用于模型管理详情页 endpoint preview，不改变运行时 adapter；
 * - `apiVersion` 为空时不伪造 query，让用户能看到当前配置仍缺版本号；
 * - URL 无法解析时按字符串安全追加，避免预览因半成品输入直接崩溃。
 */
function appendAzureApiVersion(url: string, apiVersion?: string): string {
  const version = String(apiVersion || '').trim();
  if (!version) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('api-version', version);
    return parsed.toString();
  } catch {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}api-version=${encodeURIComponent(version)}`;
  }
}

/**
 * 解析 Azure OpenAI 的详情页预览端点。
 *
 * 说明：
 * - Legacy deployment 形态使用用户填写的 deployment base，追加 `/chat/completions`
 *   与可见的 `api-version` query，不再自动补 OpenAI-compatible `/v1`；
 * - Azure OpenAI v1 endpoint 由 `skipApiVersion` 表达，直接预览 `${base}/chat/completions`；
 * - 这里只处理 UI preview；真实请求仍由 `azure-openai-adapter.ts` 消费
 *   `apiHost + apiVersion + apiOptions.isNotSupportAPIVersion`。
 */
function resolveAzureOpenAiApiEndpoints(
  apiBase: string,
  apiVersion: string | undefined,
  skipApiVersion: boolean | undefined,
): ProviderApiEndpoints {
  const raw = String(apiBase ?? '').trim();
  const withoutSharp = raw.endsWith('#') ? raw.slice(0, -1) : raw;
  const baseUrl = withoutTrailingSlash(stripKnownEndpointSuffixes(withoutSharp, OPENAI_ENDPOINT_SUFFIXES));
  const chatBase = `${baseUrl}/chat/completions`;
  const modelsBase = `${baseUrl}/models`;
  const chatUrl = skipApiVersion ? chatBase : appendAzureApiVersion(chatBase, apiVersion);
  const modelsUrl = skipApiVersion ? modelsBase : appendAzureApiVersion(modelsBase, apiVersion);
  return {
    baseUrl,
    chatUrl,
    modelsUrl,
    previewUrl: chatUrl,
    previewMode: 'chat',
    transportFamily: 'azure-openai',
  };
}

/**
 * 按 provider 上下文统一解析“聊天端点 / models 端点 / 预览 URL”。
 */
export function resolveProviderApiEndpoints({
  providerId,
  providerType,
  apiBase,
  apiVersion,
  skipApiVersion,
  transportProtocol,
  anthropicApiHost,
}: ResolveProviderApiEndpointsArgs): ProviderApiEndpoints {
  const normalizedProviderType = String(providerType || '').trim().toLowerCase();
  const transportFamily = resolveEndpointPreviewTransportFamily({
    providerId,
    providerType: normalizedProviderType,
    apiBase,
    transportProtocol,
    anthropicApiHost,
  });
  const baseSource = transportFamily === 'anthropic-messages' ? (anthropicApiHost || apiBase) : apiBase;

  if (transportFamily === 'azure-openai') {
    const azure = resolveAzureOpenAiApiEndpoints(baseSource, apiVersion, skipApiVersion);
    if (!azure.baseUrl) {
      return {
        baseUrl: '',
        chatUrl: null,
        modelsUrl: null,
        previewUrl: '',
        previewMode: 'base',
        transportFamily,
      };
    }
    return azure;
  }

  const baseUrl = resolveProviderApiBase(resolveApiBaseProviderType(normalizedProviderType, transportFamily), baseSource);

  if (!baseUrl) {
    return {
      baseUrl: '',
      chatUrl: null,
      modelsUrl: null,
      previewUrl: '',
      previewMode: 'base',
      transportFamily,
    };
  }

  if (transportFamily === 'gemini-generate-content') {
    const modelsUrl = `${baseUrl}/models`;
    return {
      baseUrl,
      chatUrl: null,
      modelsUrl,
      previewUrl: modelsUrl,
      previewMode: 'models',
      transportFamily,
    };
  }

  if (transportFamily === 'anthropic-messages') {
    const chatUrl = `${baseUrl}/messages`;
    const modelsUrl = `${baseUrl}/models`;
    return {
      baseUrl,
      chatUrl,
      modelsUrl,
      previewUrl: chatUrl,
      previewMode: 'chat',
      transportFamily,
    };
  }

  if (transportFamily === 'openai-responses') {
    const chatUrl = `${baseUrl}/responses`;
    const modelsUrl = `${baseUrl}/models`;
    return {
      baseUrl,
      chatUrl,
      modelsUrl,
      previewUrl: chatUrl,
      previewMode: 'chat',
      transportFamily,
    };
  }

  if (transportFamily === 'openai-chat' || transportFamily === 'openai-compatible') {
    const chatUrl = `${baseUrl}/chat/completions`;
    const modelsUrl = `${baseUrl}/models`;
    return {
      baseUrl,
      chatUrl,
      modelsUrl,
      previewUrl: chatUrl,
      previewMode: 'chat',
      transportFamily,
    };
  }

  if (transportFamily === 'proxy' || transportFamily === 'gateway') {
    return {
      baseUrl,
      chatUrl: null,
      modelsUrl: null,
      previewUrl: baseUrl,
      previewMode: 'transport-dependent',
      transportFamily,
    };
  }

  return {
    baseUrl,
    chatUrl: null,
    modelsUrl: null,
    previewUrl: baseUrl,
    previewMode: 'base',
    transportFamily,
  };
}
