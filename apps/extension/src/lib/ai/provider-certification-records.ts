/**
 * 说明：`provider-certification-records` AI 能力模块。
 *
 * 职责：
 * - 维护 Provider 可用性认证矩阵的静态记录；
 * - 为每个 live-supported provider 显式记录官方文档、测试触点、transport 和发布 live 要求；
 * - 保持认证数据与认证校验逻辑分离，降低单文件膨胀风险。
 *
 * 边界：
 * - 本文件只保存不含密钥的认证元数据；
 * - 不执行 live smoke，不读取环境变量，也不直接参与运行时 provider 调用。
 */

import type {
  ProviderCertificationRecord,
  ProviderContractCertificationEvidence,
} from './provider-certification'

const CONTRACT_VERIFIED_ON = '2026-05-11'
const DOCS_CHECKED_ON = '2026-05-10'

const OPENAI_COMPAT_TESTS = [
  'src/lib/ai/provider-auth.test.ts',
  'src/lib/ai/fetch-models.test.ts',
  'src/lib/ai/providers/openai-compatibility-adapters.test.ts',
  'src/extension/background/health-check.test.ts',
] as const

const GENERIC_MODEL_MANAGER_TESTS = [
  'src/components/chat/settings/model-manager/provider-form.spec.ts',
  'src/components/chat/settings/model-manager/panel/ModelManagerProviderDetail.spec.tsx',
] as const

/**
 * 构造契约证据，确保每个 provider 都显式记录官方入口与测试触点。
 *
 * @param officialDocs - 官方文档入口。
 * @param testFiles - 该 provider 依赖的契约测试。
 * @returns 标准化契约证据。
 */
function contractEvidence(
  officialDocs: readonly string[],
  testFiles: readonly string[],
): ProviderContractCertificationEvidence {
  return {
    verifiedOn: CONTRACT_VERIFIED_ON,
    officialDocsCheckedOn: DOCS_CHECKED_ON,
    officialDocs,
    testFiles,
  }
}

/**
 * 构造认证记录。
 *
 * @param record - 单 provider 认证记录。
 * @returns 原样返回并保留字面量类型。
 */
function providerCertificationRecord(record: ProviderCertificationRecord): ProviderCertificationRecord {
  return record
}

/** Provider 可用性认证记录集合。 */
export const PROVIDER_CERTIFICATION_RECORDS = [
  providerCertificationRecord({
    providerId: 'openai',
    providerType: 'openai-response',
    displayName: 'OpenAI',
    scope: 'critical-cloud',
    status: 'contract-verified',
    transports: ['openai-responses', 'openai-chat', 'embedding-api', 'image-api'],
    liveSmokeRequiredBeforeRelease: true,
    contractEvidence: contractEvidence(
      ['https://platform.openai.com/docs/api-reference/authentication', 'https://platform.openai.com/docs/api-reference/responses'],
      [
        'src/lib/ai/providers/openai-compatibility-adapters.test.ts',
        'src/lib/ai/api-host.test.ts',
        'src/extension/background/health-check.test.ts',
        ...GENERIC_MODEL_MANAGER_TESTS,
      ],
    ),
  }),
  providerCertificationRecord({
    providerId: 'anthropic',
    providerType: 'anthropic',
    displayName: 'Anthropic',
    scope: 'critical-cloud',
    status: 'contract-verified',
    transports: ['anthropic-messages'],
    liveSmokeRequiredBeforeRelease: true,
    contractEvidence: contractEvidence(
      ['https://docs.anthropic.com/en/api/getting-started', 'https://docs.anthropic.com/en/api/messages'],
      ['src/lib/ai/provider-auth.test.ts', 'src/lib/ai/fetch-models.test.ts', 'src/extension/background/health-check.test.ts', ...GENERIC_MODEL_MANAGER_TESTS],
    ),
  }),
  providerCertificationRecord({
    providerId: 'google',
    providerType: 'gemini',
    displayName: 'Gemini API',
    scope: 'critical-cloud',
    status: 'contract-verified',
    transports: ['gemini-generate-content', 'image-api'],
    liveSmokeRequiredBeforeRelease: true,
    contractEvidence: contractEvidence(
      ['https://ai.google.dev/gemini-api/docs/api-key', 'https://ai.google.dev/gemini-api/docs/models'],
      ['src/lib/ai/provider-auth.test.ts', 'src/lib/ai/providers/openai-compatibility-adapters.test.ts', 'src/extension/background/health-check.test.ts', ...GENERIC_MODEL_MANAGER_TESTS],
    ),
  }),
  providerCertificationRecord({
    providerId: 'deepseek',
    providerType: 'deepseek',
    displayName: 'DeepSeek',
    scope: 'critical-cloud',
    status: 'contract-verified',
    transports: ['openai-chat'],
    liveSmokeRequiredBeforeRelease: true,
    contractEvidence: contractEvidence(
      ['https://api-docs.deepseek.com/api/create-chat-completion'],
      ['src/lib/ai/providers/openai-compatibility-adapters.test.ts', 'src/lib/ai/provider-auth.test.ts', 'src/extension/background/health-check.test.ts', ...GENERIC_MODEL_MANAGER_TESTS],
    ),
  }),
  providerCertificationRecord({
    providerId: 'mistral',
    providerType: 'mistral',
    displayName: 'Mistral',
    scope: 'critical-cloud',
    status: 'contract-verified',
    transports: ['openai-chat'],
    liveSmokeRequiredBeforeRelease: true,
    contractEvidence: contractEvidence(
      ['https://docs.mistral.ai/'],
      ['src/lib/ai/provider-auth.test.ts', 'src/extension/background/health-check.test.ts', ...GENERIC_MODEL_MANAGER_TESTS],
    ),
  }),
  providerCertificationRecord({
    providerId: 'groq',
    providerType: 'groq',
    displayName: 'Groq',
    scope: 'critical-cloud',
    status: 'contract-verified',
    transports: ['openai-chat'],
    liveSmokeRequiredBeforeRelease: true,
    contractEvidence: contractEvidence(
      ['https://console.groq.com/docs/api-reference', 'https://console.groq.com/docs/models'],
      ['src/lib/ai/provider-auth.test.ts', 'src/lib/ai/providers/openai-compatibility-adapters.test.ts', 'src/extension/background/health-check.test.ts', ...GENERIC_MODEL_MANAGER_TESTS],
    ),
  }),
  providerCertificationRecord({
    providerId: 'xai',
    providerType: 'xai',
    displayName: 'xAI',
    scope: 'critical-cloud',
    status: 'contract-verified',
    transports: ['openai-chat', 'image-api'],
    liveSmokeRequiredBeforeRelease: true,
    contractEvidence: contractEvidence(
      ['https://docs.x.ai/docs', 'https://docs.x.ai/developers/models'],
      ['src/lib/ai/provider-auth.test.ts', 'src/lib/ai/image-generation-params.test.ts', 'src/extension/background/health-check.test.ts', ...GENERIC_MODEL_MANAGER_TESTS],
    ),
  }),
  providerCertificationRecord({
    providerId: 'cohere',
    providerType: 'cohere',
    displayName: 'Cohere',
    scope: 'critical-cloud',
    status: 'contract-verified',
    transports: ['cohere-chat', 'embedding-api', 'rerank-api'],
    liveSmokeRequiredBeforeRelease: true,
    contractEvidence: contractEvidence(
      ['https://docs.cohere.com/v2/reference/chat', 'https://docs.cohere.com/v2/reference/embed', 'https://docs.cohere.com/v2/reference/rerank'],
      ['src/lib/ai/provider-auth.test.ts', 'src/extension/background/health-check.test.ts', ...GENERIC_MODEL_MANAGER_TESTS],
    ),
  }),
  providerCertificationRecord({
    providerId: 'moonshot',
    providerType: 'openai',
    displayName: 'Moonshot',
    scope: 'extended-cloud',
    status: 'contract-verified',
    transports: ['openai-chat'],
    liveSmokeRequiredBeforeRelease: false,
    contractEvidence: contractEvidence(['https://platform.moonshot.cn/docs'], [...OPENAI_COMPAT_TESTS, ...GENERIC_MODEL_MANAGER_TESTS]),
  }),
  providerCertificationRecord({
    providerId: 'qwen',
    providerType: 'dashscope',
    displayName: 'DashScope / Qwen',
    scope: 'critical-cloud',
    status: 'contract-verified',
    transports: ['openai-chat', 'embedding-api', 'image-api'],
    liveSmokeRequiredBeforeRelease: true,
    contractEvidence: contractEvidence(
      ['https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope', 'https://help.aliyun.com/zh/model-studio/model'],
      ['src/lib/ai/provider-auth.test.ts', 'src/lib/ai/dashscope-image.test.ts', 'src/extension/background/health-check.test.ts', ...GENERIC_MODEL_MANAGER_TESTS],
    ),
  }),
  providerCertificationRecord({
    providerId: 'siliconflow',
    providerType: 'siliconflow',
    displayName: 'SiliconFlow',
    scope: 'critical-cloud',
    status: 'contract-verified',
    transports: ['openai-chat', 'embedding-api', 'image-api'],
    liveSmokeRequiredBeforeRelease: true,
    contractEvidence: contractEvidence(
      ['https://docs.siliconflow.com/en/api-reference/chat-completions/chat-completions', 'https://docs.siliconflow.cn/api-reference/images/images-generations'],
      ['src/lib/ai/provider-auth.test.ts', 'src/lib/ai/siliconflow-image.test.ts', 'src/extension/background/health-check.test.ts', ...GENERIC_MODEL_MANAGER_TESTS],
    ),
  }),
  providerCertificationRecord({
    providerId: 'zhipu',
    providerType: 'openai',
    displayName: 'Zhipu / BigModel',
    scope: 'extended-cloud',
    status: 'contract-verified',
    transports: ['openai-chat'],
    liveSmokeRequiredBeforeRelease: false,
    contractEvidence: contractEvidence(['https://docs.bigmodel.cn/'], [...OPENAI_COMPAT_TESTS, ...GENERIC_MODEL_MANAGER_TESTS]),
  }),
  providerCertificationRecord({
    providerId: 'together',
    providerType: 'openai',
    displayName: 'Together',
    scope: 'extended-cloud',
    status: 'contract-verified',
    transports: ['openai-chat', 'embedding-api', 'image-api'],
    liveSmokeRequiredBeforeRelease: false,
    contractEvidence: contractEvidence(['https://docs.together.ai/docs/introduction'], [...OPENAI_COMPAT_TESTS, ...GENERIC_MODEL_MANAGER_TESTS]),
  }),
  providerCertificationRecord({
    providerId: 'perplexity',
    providerType: 'openai',
    displayName: 'Perplexity',
    scope: 'extended-cloud',
    status: 'contract-verified',
    transports: ['openai-chat'],
    liveSmokeRequiredBeforeRelease: false,
    contractEvidence: contractEvidence(['https://docs.perplexity.ai/'], [...OPENAI_COMPAT_TESTS, ...GENERIC_MODEL_MANAGER_TESTS]),
  }),
  providerCertificationRecord({
    providerId: 'fireworks',
    providerType: 'openai',
    displayName: 'Fireworks',
    scope: 'extended-cloud',
    status: 'contract-verified',
    transports: ['openai-chat'],
    liveSmokeRequiredBeforeRelease: false,
    contractEvidence: contractEvidence(['https://docs.fireworks.ai/'], [...OPENAI_COMPAT_TESTS, ...GENERIC_MODEL_MANAGER_TESTS]),
  }),
  providerCertificationRecord({
    providerId: 'minimax',
    providerType: 'openai',
    displayName: 'MiniMax',
    scope: 'extended-cloud',
    status: 'contract-verified',
    transports: ['openai-chat'],
    liveSmokeRequiredBeforeRelease: false,
    contractEvidence: contractEvidence(['https://platform.minimaxi.com/document/'], [...OPENAI_COMPAT_TESTS, ...GENERIC_MODEL_MANAGER_TESTS]),
  }),
  providerCertificationRecord({
    providerId: 'baichuan',
    providerType: 'openai',
    displayName: 'Baichuan',
    scope: 'extended-cloud',
    status: 'contract-verified',
    transports: ['openai-chat'],
    liveSmokeRequiredBeforeRelease: false,
    contractEvidence: contractEvidence(['https://platform.baichuan-ai.com/docs'], [...OPENAI_COMPAT_TESTS, ...GENERIC_MODEL_MANAGER_TESTS]),
  }),
  providerCertificationRecord({
    providerId: 'openrouter',
    providerType: 'openai',
    displayName: 'OpenRouter',
    scope: 'critical-cloud',
    status: 'contract-verified',
    transports: ['openai-chat'],
    liveSmokeRequiredBeforeRelease: true,
    contractEvidence: contractEvidence(
      ['https://openrouter.ai/docs', 'https://openrouter.ai/docs/api-reference/overview'],
      ['src/lib/ai/model-registry/connectors/openrouter-seed.test.ts', 'src/lib/ai/openrouter-reasoning.test.ts', 'src/extension/background/health-check.test.ts', ...GENERIC_MODEL_MANAGER_TESTS],
    ),
  }),
  providerCertificationRecord({
    providerId: 'vercel-ai-gateway',
    providerType: 'gateway',
    displayName: 'Vercel AI Gateway',
    scope: 'critical-cloud',
    status: 'contract-verified',
    transports: ['openai-chat', 'openai-responses', 'embedding-api', 'image-api'],
    liveSmokeRequiredBeforeRelease: true,
    contractEvidence: contractEvidence(['https://vercel.com/docs/ai-gateway'], ['src/lib/ai/providers/openai-compatibility-adapters.test.ts', 'src/extension/background/health-check.test.ts', ...GENERIC_MODEL_MANAGER_TESTS]),
  }),
  providerCertificationRecord({
    providerId: 'azure-openai',
    providerType: 'azure-openai',
    displayName: 'Azure OpenAI',
    scope: 'critical-cloud',
    status: 'contract-verified',
    transports: ['openai-chat', 'embedding-api', 'image-api'],
    liveSmokeRequiredBeforeRelease: true,
    contractEvidence: contractEvidence(
      ['https://learn.microsoft.com/en-us/azure/ai-foundry/openai/latest', 'https://learn.microsoft.com/en-us/azure/ai-services/openai/'],
      ['src/lib/ai/api-host.test.ts', 'src/lib/ai/providers/openai-compatibility-adapters.test.ts', 'src/extension/background/health-check.test.ts', ...GENERIC_MODEL_MANAGER_TESTS],
    ),
  }),
  providerCertificationRecord({
    providerId: 'aws-bedrock',
    providerType: 'aws-bedrock',
    displayName: 'AWS Bedrock',
    scope: 'critical-cloud',
    status: 'contract-verified',
    transports: ['bedrock-converse', 'image-api'],
    liveSmokeRequiredBeforeRelease: true,
    contractEvidence: contractEvidence(
      ['https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys-use.html', 'https://ai-sdk.dev/providers/ai-sdk-providers/amazon-bedrock'],
      ['src/lib/ai/providers/vertex-bedrock-adapters.test.ts', 'src/lib/ai/provider-network-targets.test.ts', 'src/lib/ai/provider-schemas.test.ts', 'src/extension/background/health-check.test.ts', ...GENERIC_MODEL_MANAGER_TESTS],
    ),
  }),
  providerCertificationRecord({
    providerId: 'vertexai',
    providerType: 'vertexai',
    displayName: 'Vertex AI',
    scope: 'critical-cloud',
    status: 'contract-verified',
    transports: ['gemini-generate-content', 'image-api'],
    liveSmokeRequiredBeforeRelease: true,
    contractEvidence: contractEvidence(
      ['https://cloud.google.com/vertex-ai/generative-ai/docs/start/express-mode/overview', 'https://ai-sdk.dev/providers/ai-sdk-providers/google-vertex'],
      ['src/lib/ai/providers/vertex-bedrock-adapters.test.ts', 'src/lib/ai/provider-network-targets.test.ts', 'src/lib/ai/provider-schemas.test.ts', 'src/extension/background/health-check.test.ts', ...GENERIC_MODEL_MANAGER_TESTS],
    ),
  }),
  providerCertificationRecord({
    providerId: 'vertex-anthropic',
    providerType: 'vertex-anthropic',
    displayName: 'Vertex Anthropic',
    scope: 'critical-cloud',
    status: 'contract-verified',
    transports: ['anthropic-messages'],
    liveSmokeRequiredBeforeRelease: true,
    contractEvidence: contractEvidence(
      ['https://cloud.google.com/vertex-ai/generative-ai/docs/partner-models/use-claude', 'https://ai-sdk.dev/providers/ai-sdk-providers/google-vertex'],
      ['src/lib/ai/providers/vertex-bedrock-adapters.test.ts', 'src/lib/ai/provider-network-targets.test.ts', 'src/lib/ai/provider-schemas.test.ts', 'src/extension/background/health-check.test.ts', ...GENERIC_MODEL_MANAGER_TESTS],
    ),
  }),
  providerCertificationRecord({
    providerId: 'new-api',
    providerType: 'new-api',
    displayName: 'NewAPI',
    scope: 'gateway',
    status: 'contract-verified',
    transports: ['openai-chat', 'openai-responses', 'anthropic-messages', 'gemini-generate-content', 'embedding-api', 'image-api'],
    liveSmokeRequiredBeforeRelease: true,
    contractEvidence: contractEvidence(
      ['https://docs.anthropic.com/en/api/messages', 'https://platform.openai.com/docs/api-reference/chat', 'https://ai.google.dev/gemini-api/docs'],
      ['src/lib/ai/providers/openai-compatibility-adapters.test.ts', 'src/lib/ai/api-host.test.ts', 'src/extension/background/health-check.test.ts', ...GENERIC_MODEL_MANAGER_TESTS],
    ),
  }),
  providerCertificationRecord({
    providerId: 'openai-compatible-custom',
    providerType: 'openai',
    displayName: 'OpenAI Compatible Custom',
    scope: 'custom',
    status: 'contract-verified',
    transports: ['openai-chat'],
    liveSmokeRequiredBeforeRelease: false,
    contractEvidence: contractEvidence(['https://platform.openai.com/docs/api-reference/chat'], [...OPENAI_COMPAT_TESTS, ...GENERIC_MODEL_MANAGER_TESTS]),
  }),
  providerCertificationRecord({
    providerId: 'ollama',
    providerType: 'ollama',
    displayName: 'Ollama',
    scope: 'local-smoke',
    status: 'contract-verified',
    transports: ['openai-chat'],
    liveSmokeRequiredBeforeRelease: false,
    contractEvidence: contractEvidence(
      ['https://docs.ollama.com/openai', 'https://docs.ollama.com/api'],
      ['src/lib/ai/provider-network-targets.test.ts', 'src/lib/ai/providers/openai-compatibility-adapters.test.ts', 'src/extension/background/health-check.test.ts', ...GENERIC_MODEL_MANAGER_TESTS],
    ),
  }),
  providerCertificationRecord({
    providerId: 'lmstudio',
    providerType: 'openai',
    displayName: 'LM Studio',
    scope: 'local-smoke',
    status: 'contract-verified',
    transports: ['openai-chat'],
    liveSmokeRequiredBeforeRelease: false,
    contractEvidence: contractEvidence(['https://lmstudio.ai/docs/app/api/endpoints/openai'], [...OPENAI_COMPAT_TESTS, ...GENERIC_MODEL_MANAGER_TESTS]),
  }),
] as const satisfies readonly ProviderCertificationRecord[]
