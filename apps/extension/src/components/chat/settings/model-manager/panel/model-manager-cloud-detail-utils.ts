/**
 * 说明：`model-manager-cloud-detail-utils` 组件辅助模块。
 *
 * 职责：
 * - 为模型管理详情页的 Bedrock / Vertex 专用配置区提供纯函数；
 * - 收口默认官方 endpoint 占位、API 地址 optional override 展示值和 auth type 切换构造；
 * - 避免在 React 组件文件里导出非组件 helper，保持 Fast Refresh 边界干净。
 *
 * 边界：
 * - 本文件不渲染 UI、不触发 toast、不写 storage；
 * - 只处理当前 Bedrock / Vertex 配置结构，不恢复旧 `vertex.credentialsJson`。
 */
import type { AwsBedrockConfig, VertexAiConfig } from '@/lib/ai/types';

import type { Provider } from '@/components/chat/settings/model-manager/shared';

const DEFAULT_BEDROCK_API_HOST = 'https://bedrock-runtime.{region}.amazonaws.com';
const DEFAULT_VERTEX_API_HOST = 'https://{region}-aiplatform.googleapis.com';

/** 判断 Provider 是否使用详情页专用云厂商鉴权区。 */
export function isDedicatedCloudAuthProvider(provider: Pick<Provider, 'type'>): boolean {
  return provider.type === 'aws-bedrock' || provider.type === 'vertexai' || provider.type === 'vertex-anthropic';
}

/** 返回详情页 API 地址输入框的可见值；默认官方占位地址会折叠为空的 optional override。 */
export function resolveCloudApiHostInputValue(provider: Pick<Provider, 'type' | 'apiHost'>): string {
  const apiHost = String(provider.apiHost || '').trim();
  if (provider.type === 'aws-bedrock' && apiHost === DEFAULT_BEDROCK_API_HOST) return '';
  if ((provider.type === 'vertexai' || provider.type === 'vertex-anthropic') && apiHost === DEFAULT_VERTEX_API_HOST) return '';
  return apiHost;
}

/** 根据专用鉴权配置推导详情页 endpoint 预览使用的 base；自定义 override 始终优先。 */
export function resolveCloudApiHostPreviewBase(provider: Provider): string {
  const override = resolveCloudApiHostInputValue(provider);
  if (override) return override;

  if (provider.type === 'aws-bedrock') {
    const region = String(provider.bedrock?.region || '').trim();
    return region ? `https://bedrock-runtime.${region}.amazonaws.com` : '';
  }

  if (provider.type === 'vertexai' && provider.vertex?.authType === 'apiKey') {
    return 'https://aiplatform.googleapis.com';
  }

  if (provider.type === 'vertexai' || provider.type === 'vertex-anthropic') {
    const location = String(provider.vertex?.location || '').trim();
    return location ? `https://${location}-aiplatform.googleapis.com` : '';
  }

  return '';
}

/** 构造 Bedrock IAM 配置，显式丢弃 API Key 模式字段。 */
export function buildBedrockIamConfig(current: AwsBedrockConfig | undefined, region?: string): AwsBedrockConfig {
  return {
    authType: 'iam',
    region: region ?? current?.region ?? '',
  };
}

/** 构造 Bedrock API Key 配置，显式丢弃 IAM 模式字段。 */
export function buildBedrockApiKeyConfig(
  current: AwsBedrockConfig | undefined,
  apiKey?: string,
  region?: string,
): AwsBedrockConfig {
  return {
    authType: 'apiKey',
    region: region ?? current?.region ?? '',
    ...(apiKey ? { apiKey } : {}),
  };
}

/** 构造 Vertex Service Account 配置，显式丢弃 express API Key。 */
export function buildVertexServiceAccountConfig(current: VertexAiConfig | undefined): VertexAiConfig {
  return {
    authType: 'serviceAccount',
    projectId: current?.projectId ?? '',
    location: current?.location ?? '',
    serviceAccount: current?.serviceAccount ?? { clientEmail: '', privateKey: '' },
  };
}

/** 构造 Vertex express API Key 配置，显式丢弃 Service Account 字段。 */
export function buildVertexApiKeyConfig(apiKey?: string): VertexAiConfig {
  return {
    authType: 'apiKey',
    ...(apiKey ? { apiKey } : {}),
  };
}
