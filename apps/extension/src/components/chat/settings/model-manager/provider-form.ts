/**
 * 说明：`provider-form` 组件模块。
 *
 * 职责：
 * - 承载 `provider-form` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ProviderFormStateLike`、`ProviderAdvancedVisibility`、`getProviderAdvancedVisibility` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { ProviderConfig, ProviderType } from '@/lib/ai/types';
import { sanitizeProviderApiKeyAuthConfig, supportsProviderApiKeyAuthConfig } from '@/lib/ai/provider-auth';

const OPENAI_COMPATIBILITY_PROVIDER_TYPES = new Set<ProviderType>([
  'openai',
  'openai-response',
  'azure-openai',
  'dashscope',
  'siliconflow',
  'groq',
  'ollama',
]);

const ANTHROPIC_CACHE_PROVIDER_TYPES = new Set<ProviderType>([
  'anthropic',
  'vertex-anthropic',
]);

const VERTEX_PROVIDER_TYPES = new Set<ProviderType>([
  'vertexai',
  'vertex-anthropic',
]);

const ANTHROPIC_HOST_PROVIDER_TYPES = new Set<ProviderType>([
  'new-api',
]);

/** 按 Provider 类型收口 Vertex 专用配置，避免 API Key 与 Service Account 双真源并存。 */
function sanitizeVertexConfigByProviderType(
  type: ProviderType,
  vertex: ProviderConfig['vertex'],
): ProviderConfig['vertex'] {
  if (!VERTEX_PROVIDER_TYPES.has(type)) return undefined;

  if (type === 'vertexai' && vertex?.authType === 'apiKey') {
    return {
      authType: 'apiKey',
      apiKey: vertex.apiKey ?? '',
    };
  }

  return {
    authType: 'serviceAccount',
    projectId: vertex?.projectId ?? '',
    location: vertex?.location ?? '',
    serviceAccount: {
      clientEmail: vertex?.serviceAccount?.clientEmail ?? '',
      privateKey: vertex?.serviceAccount?.privateKey ?? '',
      ...(vertex?.serviceAccount?.privateKeyId ? { privateKeyId: vertex.serviceAccount.privateKeyId } : {}),
    },
  };
}

/** 导出类型：`ProviderFormStateLike`。 */
export interface ProviderFormStateLike {
  readonly type: ProviderType;
  readonly authType?: ProviderConfig['authType'];
  readonly anthropicApiHost: string;
  readonly apiVersion: string;
  readonly apiOptions?: ProviderConfig['apiOptions'];
  readonly apiKeyAuth?: ProviderConfig['apiKeyAuth'];
  readonly serviceTier?: ProviderConfig['serviceTier'];
  readonly verbosity?: ProviderConfig['verbosity'];
  readonly anthropicCacheControl?: ProviderConfig['anthropicCacheControl'];
  readonly bedrock?: ProviderConfig['bedrock'];
  readonly vertex?: ProviderConfig['vertex'];
}

/** 导出类型：`ProviderAdvancedVisibility`。 */
export interface ProviderAdvancedVisibility {
  readonly showAnthropicApiHost: boolean;
  readonly showApiKeyAuth: boolean;
  readonly showApiOptions: boolean;
  readonly showServiceTierVerbosity: boolean;
  readonly showAnthropicCache: boolean;
  readonly showBedrock: boolean;
  readonly showVertex: boolean;
}

/**
 * 导出函数：`getProviderAdvancedVisibility`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function getProviderAdvancedVisibility(type: ProviderType, authType?: ProviderConfig['authType']): ProviderAdvancedVisibility {
  return {
    showAnthropicApiHost: ANTHROPIC_HOST_PROVIDER_TYPES.has(type),
    showApiKeyAuth: supportsProviderApiKeyAuthConfig({ type, authType }),
    showApiOptions: OPENAI_COMPATIBILITY_PROVIDER_TYPES.has(type),
    showServiceTierVerbosity: OPENAI_COMPATIBILITY_PROVIDER_TYPES.has(type),
    showAnthropicCache: ANTHROPIC_CACHE_PROVIDER_TYPES.has(type),
    showBedrock: type === 'aws-bedrock',
    showVertex: VERTEX_PROVIDER_TYPES.has(type),
  };
}

/**
 * 导出函数：`sanitizeProviderAdvancedConfigByType`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function sanitizeProviderAdvancedConfigByType<T extends ProviderFormStateLike>(form: T): T {
  const next: T = {
    ...form,
    ...(ANTHROPIC_HOST_PROVIDER_TYPES.has(form.type) ? {} : { anthropicApiHost: '' }),
    ...(form.type === 'azure-openai' ? {} : { apiVersion: '' }),
    ...(supportsProviderApiKeyAuthConfig({ type: form.type, authType: form.authType }) ? {} : { apiKeyAuth: undefined }),
    ...(OPENAI_COMPATIBILITY_PROVIDER_TYPES.has(form.type)
      ? {}
      : {
          apiOptions: undefined,
          serviceTier: undefined,
          verbosity: undefined,
        }),
    ...(ANTHROPIC_CACHE_PROVIDER_TYPES.has(form.type)
      ? {}
      : { anthropicCacheControl: undefined }),
    ...(form.type === 'aws-bedrock'
      ? {}
      : { bedrock: undefined }),
    vertex: sanitizeVertexConfigByProviderType(form.type, form.vertex),
  };
  return next;
}

/**
 * 导出函数：`sanitizeProviderPersistedAdvancedConfigByType`。
 *
 * @remarks
 * 仅用于保存前清洗。编辑态允许用户在输入框里临时输入未完成的 header 名；
 * 真正落库前必须把非法 `apiKeyAuth` 丢弃，避免运行时出现不合法鉴权头。
 */
export function sanitizeProviderPersistedAdvancedConfigByType<T extends ProviderFormStateLike>(form: T): T {
  const next = sanitizeProviderAdvancedConfigByType(form);
  return {
    ...next,
    apiKeyAuth: supportsProviderApiKeyAuthConfig({ type: next.type, authType: next.authType })
      ? sanitizeProviderApiKeyAuthConfig(next.apiKeyAuth)
      : undefined,
  };
}

/**
 * 导出函数：`mergeProviderFormPatchByType`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function mergeProviderFormPatchByType<T extends ProviderFormStateLike>(
  current: T,
  patch: Partial<T>,
): T {
  return sanitizeProviderAdvancedConfigByType({
    ...current,
    ...patch,
  });
}
