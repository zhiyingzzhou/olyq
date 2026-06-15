/**
 * 说明：`provider-registry` 基础能力模块。
 *
 * 职责：
 * - 承载 Web Search provider 的唯一事实源，包括展示元数据、排序、可用性判断与 providerId 解析；
 * - 对外暴露 `WEB_SEARCH_PROVIDER_REGISTRY`、`resolveWebSearchProviderId`、`isWebSearchProviderUsable` 等公开能力，供 UI 与后台编排复用；
 *
 * 边界：
 * - 本文件只负责 provider 元数据与派生判断，不在这里执行真实搜索请求或 网络目标推导。
 */
import type { WebSearchProviderId, WebSearchSettings } from './types';

/** 网页搜索 provider 的可用性类型。 */
export type WebSearchProviderAvailabilityKind = 'free' | 'apiKey' | 'url';

type WebSearchApiKeyField = 'tavilyApiKey' | 'exaApiKey' | 'bochaApiKey' | 'zhipuApiKey';
type WebSearchUrlField = 'searxngUrl';

/** Web Search provider registry 条目。 */
export interface WebSearchProviderRegistryItem {
  readonly id: WebSearchProviderId;
  readonly labelKey: string;
  readonly descKey: string;
  readonly kind: WebSearchProviderAvailabilityKind;
  readonly sortOrder: number;
  readonly apiKeyField?: WebSearchApiKeyField;
  readonly apiKeyPlaceholder?: string;
  readonly apiKeyLink?: string;
  readonly urlField?: WebSearchUrlField;
  readonly urlPlaceholder?: string;
  readonly urlDocsLink?: string;
}

const WEB_SEARCH_PROVIDER_REGISTRY_INTERNAL: readonly WebSearchProviderRegistryItem[] = [
  {
    id: 'exa-mcp',
    labelKey: 'webSearch.providers.exaMcp.name',
    descKey: 'webSearch.providers.exaMcp.desc',
    kind: 'free',
    sortOrder: 10,
  },
  {
    id: 'local-google',
    labelKey: 'webSearch.providers.localGoogle.name',
    descKey: 'webSearch.providers.localGoogle.desc',
    kind: 'free',
    sortOrder: 20,
  },
  {
    id: 'local-bing',
    labelKey: 'webSearch.providers.localBing.name',
    descKey: 'webSearch.providers.localBing.desc',
    kind: 'free',
    sortOrder: 30,
  },
  {
    id: 'local-baidu',
    labelKey: 'webSearch.providers.localBaidu.name',
    descKey: 'webSearch.providers.localBaidu.desc',
    kind: 'free',
    sortOrder: 40,
  },
  {
    id: 'exa',
    labelKey: 'webSearch.providers.exa.name',
    descKey: 'webSearch.providers.exa.desc',
    kind: 'apiKey',
    sortOrder: 50,
    apiKeyField: 'exaApiKey',
    apiKeyPlaceholder: 'exa-...',
    apiKeyLink: 'https://exa.ai',
  },
  {
    id: 'tavily',
    labelKey: 'webSearch.providers.tavily.name',
    descKey: 'webSearch.providers.tavily.desc',
    kind: 'apiKey',
    sortOrder: 60,
    apiKeyField: 'tavilyApiKey',
    apiKeyPlaceholder: 'tvly-...',
    apiKeyLink: 'https://tavily.com',
  },
  {
    id: 'bocha',
    labelKey: 'webSearch.providers.bocha.name',
    descKey: 'webSearch.providers.bocha.desc',
    kind: 'apiKey',
    sortOrder: 70,
    apiKeyField: 'bochaApiKey',
    apiKeyPlaceholder: 'bocha-...',
    apiKeyLink: 'https://bochaai.com',
  },
  {
    id: 'zhipu',
    labelKey: 'webSearch.providers.zhipu.name',
    descKey: 'webSearch.providers.zhipu.desc',
    kind: 'apiKey',
    sortOrder: 80,
    apiKeyField: 'zhipuApiKey',
    apiKeyPlaceholder: 'your-zhipu-key',
    apiKeyLink: 'https://bigmodel.cn',
  },
  {
    id: 'searxng',
    labelKey: 'webSearch.providers.searxng.name',
    descKey: 'webSearch.providers.searxng.desc',
    kind: 'url',
    sortOrder: 90,
    urlField: 'searxngUrl',
    urlPlaceholder: 'http://your-searxng-instance:8080',
    urlDocsLink: 'https://docs.searxng.org',
  },
];

/** Web Search provider registry 的唯一事实源。 */
export const WEB_SEARCH_PROVIDER_REGISTRY = [...WEB_SEARCH_PROVIDER_REGISTRY_INTERNAL]
  .sort((left, right) => left.sortOrder - right.sortOrder);

const WEB_SEARCH_PROVIDER_MAP = new Map(
  WEB_SEARCH_PROVIDER_REGISTRY.map((provider) => [provider.id, provider] as const),
);

/** 所有受支持的网页搜索 provider ID。 */
export const WEB_SEARCH_PROVIDER_IDS: readonly WebSearchProviderId[] = WEB_SEARCH_PROVIDER_REGISTRY
  .map((provider) => provider.id);

/** 判断任意输入值是否为受支持的网页搜索 provider ID。 */
export function isWebSearchProviderId(value: unknown): value is WebSearchProviderId {
  if (typeof value !== 'string') return false;
  return WEB_SEARCH_PROVIDER_MAP.has(value.trim() as WebSearchProviderId);
}

/** 把任意输入解析为受支持的网页搜索 provider ID。 */
export function resolveWebSearchProviderId(value: unknown): WebSearchProviderId | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return WEB_SEARCH_PROVIDER_MAP.has(normalized as WebSearchProviderId)
    ? (normalized as WebSearchProviderId)
    : undefined;
}

/** 读取指定 provider 的 registry 元数据。 */
export function getWebSearchProviderMeta(value: unknown): WebSearchProviderRegistryItem | undefined {
  const providerId = resolveWebSearchProviderId(value);
  return providerId ? WEB_SEARCH_PROVIDER_MAP.get(providerId) : undefined;
}

/** 判断 provider 在当前设置下是否可用。 */
export function isWebSearchProviderUsable(
  providerId: WebSearchProviderId,
  settings: WebSearchSettings,
): boolean {
  const provider = WEB_SEARCH_PROVIDER_MAP.get(providerId);
  if (!provider) return false;
  if (provider.kind === 'free') return true;
  if (provider.kind === 'apiKey' && provider.apiKeyField) {
    return typeof settings[provider.apiKeyField] === 'string'
      && settings[provider.apiKeyField]!.trim().length > 0;
  }
  if (provider.kind === 'url' && provider.urlField) {
    return typeof settings[provider.urlField] === 'string'
      && settings[provider.urlField]!.trim().length > 0;
  }
  return false;
}
