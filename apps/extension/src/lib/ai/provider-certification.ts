/**
 * 说明：`provider-certification` AI 能力模块。
 *
 * 职责：
 * - 定义 Provider 可用性认证状态、证据结构与校验规则；
 * - 区分 contract-verified、live-verified 与 blocked，避免把单测通过误宣传成真实账号可用；
 * - 为 live E2E 和发布 guard 提供同一份认证口径。
 *
 * 边界：
 * - 本文件只维护认证 schema 和校验逻辑，不保存密钥、不联网、不直接读取文件系统；
 * - 具体 provider 记录拆在 `provider-certification-records.ts`，避免认证逻辑文件继续膨胀。
 */

import type { ProviderType, TransportProtocol } from './types'
import { PROVIDER_CERTIFICATION_RECORDS } from './provider-certification-records'

export { PROVIDER_CERTIFICATION_RECORDS } from './provider-certification-records'

/** Provider 可用性认证状态。 */
export type ProviderCertificationStatus = 'contract-verified' | 'live-verified' | 'blocked'

/** Provider 在发布认证里的分组。 */
export type ProviderCertificationScope =
  | 'critical-cloud'
  | 'gateway'
  | 'extended-cloud'
  | 'local-smoke'
  | 'custom'

/** Live smoke 需要覆盖的模型用途。 */
export type ProviderCertificationModelKind = 'chat' | 'embedding' | 'image' | 'rerank'

/** Provider 契约验证证据。 */
export interface ProviderContractCertificationEvidence {
  /** 契约验证完成日期，格式为 YYYY-MM-DD。 */
  readonly verifiedOn: string
  /** 官方文档最后核对日期，格式为 YYYY-MM-DD。 */
  readonly officialDocsCheckedOn: string
  /** 官方文档入口。 */
  readonly officialDocs: readonly string[]
  /** 对应的无账号自动化测试文件。 */
  readonly testFiles: readonly string[]
}

/** 单个 live smoke 模型证据。 */
export interface ProviderLiveCertificationModelEvidence {
  /** 本次验证的模型用途。 */
  readonly kind: ProviderCertificationModelKind
  /** 真实 live smoke 使用的模型 ID。 */
  readonly modelId: string
  /** 命中的底层 transport。 */
  readonly transportProtocol?: TransportProtocol
  /** 真实请求使用的区域、endpoint 或 host 摘要；不得包含密钥。 */
  readonly endpointOrRegion?: string
}

/** Provider live smoke 证据。 */
export interface ProviderLiveCertificationEvidence {
  /** live smoke 真实执行日期，格式为 YYYY-MM-DD。 */
  readonly verifiedOn: string
  /** live 证据有效天数；超过后必须降级回 contract-verified。 */
  readonly expiresAfterDays: number
  /** live smoke 使用的模型证据。 */
  readonly models: readonly ProviderLiveCertificationModelEvidence[]
  /** 执行结果。 */
  readonly result: 'passed'
}

/** Provider 可用性认证记录。 */
export interface ProviderCertificationRecord {
  /** Provider ID，与模型管理存储中的 provider.id 对齐。 */
  readonly providerId: string
  /** Provider 类型，与 ProviderConfig.type 对齐。 */
  readonly providerType: ProviderType
  /** UI 展示名。 */
  readonly displayName: string
  /** 发布认证分组。 */
  readonly scope: ProviderCertificationScope
  /** 当前认证状态。 */
  readonly status: ProviderCertificationStatus
  /** 本 provider 当前需要覆盖的底层 transport。 */
  readonly transports: readonly TransportProtocol[]
  /** 发布前是否要求团队真实账号 live smoke。 */
  readonly liveSmokeRequiredBeforeRelease: boolean
  /** 契约验证证据。 */
  readonly contractEvidence: ProviderContractCertificationEvidence
  /** 真实账号 live smoke 证据；只有 live-verified 才允许存在。 */
  readonly liveEvidence?: ProviderLiveCertificationEvidence
  /** blocked 状态的明确原因。 */
  readonly blockedReason?: string
}

/** 当前 live smoke 支持的 provider ID。 */
export const PROVIDER_LIVE_SUPPORTED_PROVIDER_IDS = [
  'openai',
  'anthropic',
  'google',
  'deepseek',
  'mistral',
  'groq',
  'xai',
  'cohere',
  'moonshot',
  'qwen',
  'siliconflow',
  'zhipu',
  'together',
  'perplexity',
  'fireworks',
  'minimax',
  'baichuan',
  'openrouter',
  'vercel-ai-gateway',
  'azure-openai',
  'aws-bedrock',
  'vertexai',
  'vertex-anthropic',
  'new-api',
  'openai-compatible-custom',
  'ollama',
  'lmstudio',
] as const

/** 发布前默认纳入真实账号 live smoke 的关键 provider。 */
export const DEFAULT_PROVIDER_LIVE_SMOKE_PROVIDER_IDS = [
  'openai',
  'anthropic',
  'google',
  'azure-openai',
  'aws-bedrock',
  'vertexai',
  'vertex-anthropic',
  'deepseek',
  'qwen',
  'siliconflow',
  'openrouter',
  'groq',
  'xai',
  'mistral',
  'cohere',
  'vercel-ai-gateway',
  'new-api',
] as const

const LIVE_EXPIRES_AFTER_DAYS = 30
const VALID_CERTIFICATION_STATUSES = new Set<ProviderCertificationStatus>([
  'contract-verified',
  'live-verified',
  'blocked',
])
const VALID_CERTIFICATION_SCOPES = new Set<ProviderCertificationScope>([
  'critical-cloud',
  'gateway',
  'extended-cloud',
  'local-smoke',
  'custom',
])

/**
 * 根据 provider ID 读取认证记录。
 *
 * @param providerId - Provider ID。
 * @returns 对应认证记录，找不到则返回 undefined。
 */
export function getProviderCertificationRecord(providerId: string): ProviderCertificationRecord | undefined {
  return PROVIDER_CERTIFICATION_RECORDS.find((record) => record.providerId === providerId)
}

/**
 * 将日期字符串解析为 UTC 零点毫秒数。
 *
 * @param value - YYYY-MM-DD 日期。
 * @returns 解析后的时间戳；非法日期返回 NaN。
 */
export function parseProviderCertificationDate(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return Number.NaN
  const [year, month, day] = value.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

/**
 * 计算 live 证据是否仍在有效期内。
 *
 * @param evidence - live smoke 证据。
 * @param now - 当前时间。
 * @returns live 证据是否未超过有效期。
 */
export function isProviderLiveEvidenceFresh(
  evidence: ProviderLiveCertificationEvidence,
  now = new Date(),
): boolean {
  const verifiedAt = parseProviderCertificationDate(evidence.verifiedOn)
  if (!Number.isFinite(verifiedAt)) return false
  const nowAt = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const ageDays = Math.floor((nowAt - verifiedAt) / 86_400_000)
  return ageDays >= 0 && ageDays <= evidence.expiresAfterDays
}

/** Provider certification guard 的校验选项。 */
export interface ProviderCertificationValidationOptions {
  /** 当前时间；用于判断 live 证据是否超过有效期。 */
  readonly now?: Date
  /** live e2e 支持的 provider ID 集合。 */
  readonly supportedProviderIds?: readonly string[]
  /** 默认纳入 live smoke 的 provider ID 集合。 */
  readonly defaultLiveSmokeProviderIds?: readonly string[]
  /** 文件存在性检查；测试环境传入，运行时代码不直接读取文件系统。 */
  readonly fileExists?: (relativePath: string) => boolean
}

/**
 * 收集 provider certification 记录问题。
 *
 * @param records - 待检查的认证记录。
 * @param options - 校验选项。
 * @returns 问题列表；空数组表示通过。
 */
export function collectProviderCertificationIssues(
  records: readonly ProviderCertificationRecord[],
  options: ProviderCertificationValidationOptions = {},
): string[] {
  const issues: string[] = []
  const now = options.now ?? new Date()
  const supportedIds = new Set(options.supportedProviderIds ?? PROVIDER_LIVE_SUPPORTED_PROVIDER_IDS)
  const seenIds = new Set<string>()

  for (const record of records) {
    if (!record.providerId.trim()) issues.push('存在空 providerId')
    if (seenIds.has(record.providerId)) issues.push(`${record.providerId}: providerId 重复`)
    seenIds.add(record.providerId)

    if (!VALID_CERTIFICATION_STATUSES.has(record.status)) {
      issues.push(`${record.providerId}: certification status 非法: ${String(record.status)}`)
    }
    if (!VALID_CERTIFICATION_SCOPES.has(record.scope)) {
      issues.push(`${record.providerId}: certification scope 非法: ${String(record.scope)}`)
    }
    if (!supportedIds.has(record.providerId)) {
      issues.push(`${record.providerId}: 不在 live e2e 支持列表中`)
    }
    if (!record.displayName.trim()) issues.push(`${record.providerId}: displayName 为空`)
    if (record.transports.length === 0) issues.push(`${record.providerId}: transports 不能为空`)

    const contractVerifiedAt = parseProviderCertificationDate(record.contractEvidence.verifiedOn)
    const docsCheckedAt = parseProviderCertificationDate(record.contractEvidence.officialDocsCheckedOn)
    if (!Number.isFinite(contractVerifiedAt)) issues.push(`${record.providerId}: contractEvidence.verifiedOn 日期非法`)
    if (!Number.isFinite(docsCheckedAt)) issues.push(`${record.providerId}: contractEvidence.officialDocsCheckedOn 日期非法`)
    if (record.contractEvidence.officialDocs.length === 0) issues.push(`${record.providerId}: 缺少官方文档入口`)
    for (const url of record.contractEvidence.officialDocs) {
      if (!/^https:\/\/[^ ]+$/.test(url)) issues.push(`${record.providerId}: 官方文档入口必须是 https URL: ${url}`)
    }
    if (record.contractEvidence.testFiles.length === 0) issues.push(`${record.providerId}: 缺少契约测试文件`)
    for (const filePath of record.contractEvidence.testFiles) {
      if (!filePath.trim()) {
        issues.push(`${record.providerId}: 契约测试文件路径为空`)
      } else if (options.fileExists && !options.fileExists(filePath)) {
        issues.push(`${record.providerId}: 契约测试文件不存在: ${filePath}`)
      }
    }

    if (record.status === 'blocked' && !record.blockedReason?.trim()) {
      issues.push(`${record.providerId}: blocked 状态必须写明 blockedReason`)
    }
    if (record.status !== 'blocked' && record.blockedReason?.trim()) {
      issues.push(`${record.providerId}: 非 blocked 状态不得保留 blockedReason`)
    }

    if (record.status === 'live-verified') {
      if (!record.liveEvidence) {
        issues.push(`${record.providerId}: live-verified 必须包含 liveEvidence`)
      } else {
        if (record.liveEvidence.expiresAfterDays !== LIVE_EXPIRES_AFTER_DAYS) {
          issues.push(`${record.providerId}: liveEvidence.expiresAfterDays 必须为 ${LIVE_EXPIRES_AFTER_DAYS}`)
        }
        if (record.liveEvidence.models.length === 0) {
          issues.push(`${record.providerId}: liveEvidence.models 不能为空`)
        }
        for (const model of record.liveEvidence.models) {
          if (!model.modelId.trim()) issues.push(`${record.providerId}: liveEvidence 模型 ID 不能为空`)
        }
        if (!isProviderLiveEvidenceFresh(record.liveEvidence, now)) {
          issues.push(`${record.providerId}: liveEvidence 已超过 ${record.liveEvidence.expiresAfterDays} 天，必须降级为 contract-verified`)
        }
      }
    }

    if (record.status !== 'live-verified' && record.liveEvidence) {
      issues.push(`${record.providerId}: 非 live-verified 状态不得保留 liveEvidence`)
    }
  }

  for (const providerId of supportedIds) {
    if (!seenIds.has(providerId)) issues.push(`${providerId}: certification 记录缺失`)
  }

  for (const providerId of options.defaultLiveSmokeProviderIds ?? DEFAULT_PROVIDER_LIVE_SMOKE_PROVIDER_IDS) {
    const record = records.find((item) => item.providerId === providerId)
    if (!record) {
      issues.push(`${providerId}: 默认 live smoke provider 缺少 certification 记录`)
      continue
    }
    if (!record.liveSmokeRequiredBeforeRelease) {
      issues.push(`${providerId}: 默认 live smoke provider 必须标记 liveSmokeRequiredBeforeRelease=true`)
    }
    if (record.status === 'blocked') {
      issues.push(`${providerId}: 关键 live smoke provider 当前 blocked，发布前必须解决或明确降级发布口径`)
    }
  }

  return issues
}
