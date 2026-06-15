/**
 * 说明：`provider-secrets` AI 能力模块。
 *
 * 职责：
 * - 把 Provider 配置里的敏感凭据从普通配置字段中拆分出来；
 * - 为 Data Contract Registry、云同步加密 secret 域和测试 guard 提供统一 helper；
 * - 保证 `olyq.providers.v1` 在普通运行时仍保持原结构，云同步远端明文只保存非敏感配置。
 *
 * 边界：
 * - 本模块不读写 storage，不参与模型调用；
 * - 只处理当前 ProviderConfig schema，不兼容旧字段或未知凭据字段；
 * - WebDAV/S3 连接凭据不在这里处理，因为它们不能被放进需要自身凭据才能拉取的远端同步包。
 */
import type { AwsBedrockConfig, ProviderConfig, VertexAiConfig, VertexServiceAccountConfig } from './types';
import { parseProviderConfigs } from './provider-schemas';

/** 单个 provider 的敏感凭据包。 */
export interface ProviderSecretRecord {
  /** 通用 API Key，支持当前多 key 字符串语义。 */
  apiKey?: string;
  /** AWS Bedrock IAM/API Key 模式下的敏感凭据。 */
  bedrock?: Pick<AwsBedrockConfig, 'secretAccessKey' | 'sessionToken' | 'apiKey'>;
  /** Vertex express API Key 或 Service Account 私钥。 */
  vertex?: Pick<VertexAiConfig, 'apiKey'> & {
    serviceAccount?: Pick<VertexServiceAccountConfig, 'privateKey'>;
  };
}

/** provider 明文配置与敏感配置的拆分结果。 */
export interface ProviderSecretSplitResult {
  /** 可明文进入 structured sync 的 provider 配置。 */
  publicProviders: Array<Record<string, unknown>>;
  /** 需要进入加密 secret 域的 provider 凭据。 */
  secretsByProviderId: Record<string, ProviderSecretRecord>;
}

/**
 * 规整 secret 字符串。
 *
 * @param value - 原始 secret 值。
 * @returns 非空字符串原值；非法或空白时返回 `undefined`。
 */
function trimSecret(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/**
 * 提取单个 provider 的敏感字段。
 *
 * @param provider - 当前 provider 配置。
 * @returns 敏感字段包；若无敏感字段则返回空对象。
 */
export function extractProviderSecret(provider: ProviderConfig): ProviderSecretRecord {
  const secret: ProviderSecretRecord = {};
  const apiKey = trimSecret(provider.apiKey);
  if (apiKey) secret.apiKey = apiKey;

  const bedrockSecretAccessKey = trimSecret(provider.bedrock?.secretAccessKey);
  const bedrockSessionToken = trimSecret(provider.bedrock?.sessionToken);
  const bedrockApiKey = trimSecret(provider.bedrock?.apiKey);
  if (bedrockSecretAccessKey || bedrockSessionToken || bedrockApiKey) {
    secret.bedrock = {
      ...(bedrockSecretAccessKey ? { secretAccessKey: bedrockSecretAccessKey } : {}),
      ...(bedrockSessionToken ? { sessionToken: bedrockSessionToken } : {}),
      ...(bedrockApiKey ? { apiKey: bedrockApiKey } : {}),
    };
  }

  const vertexApiKey = trimSecret(provider.vertex?.apiKey);
  const vertexPrivateKey = trimSecret(provider.vertex?.serviceAccount?.privateKey);
  if (vertexApiKey || vertexPrivateKey) {
    secret.vertex = {
      ...(vertexApiKey ? { apiKey: vertexApiKey } : {}),
      ...(vertexPrivateKey ? { serviceAccount: { privateKey: vertexPrivateKey } } : {}),
    };
  }

  return secret;
}

/**
 * 去掉单个 provider 的敏感字段，保留当前运行时仍需要明文同步的非敏感配置。
 *
 * @param provider - 当前 provider 配置。
 * @returns 去敏后的 provider 配置。
 */
export function stripProviderSecret(provider: ProviderConfig): Record<string, unknown> {
  const { apiKey: _apiKey, ...publicProvider } = provider;
  const out: Record<string, unknown> = { ...publicProvider };

  if (provider.bedrock) {
    const {
      secretAccessKey: _secretAccessKey,
      sessionToken: _sessionToken,
      apiKey: _bedrockApiKey,
      ...publicBedrock
    } = provider.bedrock;
    out.bedrock = publicBedrock;
  }

  if (provider.vertex) {
    const { apiKey: _vertexApiKey, serviceAccount, ...publicVertex } = provider.vertex;
    out.vertex = {
      ...publicVertex,
      ...(serviceAccount
        ? {
            serviceAccount: {
              clientEmail: serviceAccount.clientEmail,
              ...(serviceAccount.privateKeyId ? { privateKeyId: serviceAccount.privateKeyId } : {}),
            },
          }
        : {}),
    };
  }

  return out;
}

/**
 * 将 `olyq.providers.v1` 拆成明文配置与 secret 配置。
 *
 * @param raw - 未信任的 provider storage 值。
 * @returns 可分别进入普通同步包与加密 secret 包的数据。
 */
export function splitProviderSecrets(raw: unknown): ProviderSecretSplitResult {
  const providers = parseProviderConfigs(raw);
  const publicProviders: Array<Record<string, unknown>> = [];
  const secretsByProviderId: Record<string, ProviderSecretRecord> = {};

  for (const provider of providers) {
    publicProviders.push(stripProviderSecret(provider));
    const secret = extractProviderSecret(provider);
    if (Object.keys(secret).length > 0) {
      secretsByProviderId[provider.id] = secret;
    }
  }

  return { publicProviders, secretsByProviderId };
}

/**
 * 把明文 provider 配置与解密后的 secret 配置重新合并。
 *
 * @param rawProviders - 明文 provider 配置。
 * @param secretsByProviderId - 解密后的 secret 包。
 * @returns 可写回 `olyq.providers.v1` 的完整 provider 配置。
 */
export function mergeProviderSecrets(
  rawProviders: unknown,
  secretsByProviderId: unknown,
): ProviderConfig[] {
  const providers = parseProviderConfigs(rawProviders);
  const secretRecord = secretsByProviderId && typeof secretsByProviderId === 'object' && !Array.isArray(secretsByProviderId)
    ? secretsByProviderId as Record<string, ProviderSecretRecord>
    : {};

  return parseProviderConfigs(providers.map((provider) => {
    const secret = secretRecord[provider.id] ?? {};
    return {
      ...provider,
      apiKey: trimSecret(secret.apiKey) ?? provider.apiKey,
      bedrock: provider.bedrock || secret.bedrock
        ? {
            ...(provider.bedrock ?? { authType: 'iam' as const, region: '' }),
            ...(trimSecret(secret.bedrock?.secretAccessKey) ? { secretAccessKey: secret.bedrock?.secretAccessKey } : {}),
            ...(trimSecret(secret.bedrock?.sessionToken) ? { sessionToken: secret.bedrock?.sessionToken } : {}),
            ...(trimSecret(secret.bedrock?.apiKey) ? { apiKey: secret.bedrock?.apiKey } : {}),
          }
        : undefined,
      vertex: provider.vertex || secret.vertex
        ? {
            ...(provider.vertex ?? { authType: trimSecret(secret.vertex?.apiKey) ? 'apiKey' as const : 'serviceAccount' as const }),
            ...(trimSecret(secret.vertex?.apiKey) ? { apiKey: secret.vertex?.apiKey } : {}),
            ...((provider.vertex?.authType === 'serviceAccount' || secret.vertex?.serviceAccount)
              ? {
                  serviceAccount: {
                    ...(provider.vertex?.serviceAccount ?? { clientEmail: '', privateKey: '' }),
                    ...(trimSecret(secret.vertex?.serviceAccount?.privateKey)
                      ? { privateKey: secret.vertex?.serviceAccount?.privateKey }
                      : {}),
                  },
                }
              : {}),
          }
        : undefined,
    };
  }));
}

/**
 * 规整 shared-storage 中的 Provider 配置。
 *
 * @remarks
 * 普通备份仍保留现有完整 provider 行为；云同步会在更高层调用 `splitProviderSecrets`
 * 把敏感字段移入加密 secret 域。
 */
export function normalizeProvidersForSharedConfig(raw: unknown): ProviderConfig[] {
  return parseProviderConfigs(raw);
}
