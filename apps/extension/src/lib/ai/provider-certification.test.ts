/**
 * 说明：`provider-certification.test` AI 能力模块。
 *
 * 职责：
 * - 防止新增 provider 后遗漏认证矩阵；
 * - 防止把过期 live smoke 或缺少模型证据的平台继续标成 live-verified；
 * - 防止发布口径把 contract-verified 误说成真实账号已验证。
 *
 * 边界：
 * - 本文件只校验静态 certification 元数据与 guard 语义；
 * - 不执行真实 provider 请求，也不读取任何密钥环境变量。
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_PROVIDER_LIVE_SMOKE_PROVIDER_IDS,
  PROVIDER_CERTIFICATION_RECORDS,
  PROVIDER_LIVE_SUPPORTED_PROVIDER_IDS,
  collectProviderCertificationIssues,
  type ProviderCertificationRecord,
} from './provider-certification'

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const FIXED_NOW = new Date(Date.UTC(2026, 4, 11))

/**
 * 检查相对仓库根目录的测试文件是否存在。
 *
 * @param relativePath - 相对 `olyq/` 的路径。
 * @returns 文件是否存在。
 */
function fileExists(relativePath: string): boolean {
  return fs.existsSync(path.join(PACKAGE_ROOT, relativePath))
}

/**
 * 构造 provider certification 测试记录。
 *
 * @param patch - 需要覆盖的字段。
 * @returns 测试用认证记录。
 */
function buildRecord(patch: Partial<ProviderCertificationRecord> = {}): ProviderCertificationRecord {
  return {
    ...PROVIDER_CERTIFICATION_RECORDS[0],
    providerId: 'fixture-provider',
    liveSmokeRequiredBeforeRelease: false,
    ...patch,
    contractEvidence: {
      ...PROVIDER_CERTIFICATION_RECORDS[0].contractEvidence,
      ...(patch.contractEvidence ?? {}),
    },
  }
}

describe('provider certification matrix', () => {
  it('keeps every live-supported provider covered by a valid certification record', () => {
    expect(collectProviderCertificationIssues(PROVIDER_CERTIFICATION_RECORDS, {
      now: FIXED_NOW,
      supportedProviderIds: PROVIDER_LIVE_SUPPORTED_PROVIDER_IDS,
      defaultLiveSmokeProviderIds: DEFAULT_PROVIDER_LIVE_SMOKE_PROVIDER_IDS,
      fileExists,
    })).toEqual([])
  })

  it('keeps the default live smoke set inside the supported provider set', () => {
    const supported = new Set(PROVIDER_LIVE_SUPPORTED_PROVIDER_IDS)
    expect(DEFAULT_PROVIDER_LIVE_SMOKE_PROVIDER_IDS.filter((providerId) => !supported.has(providerId))).toEqual([])
  })

  it('rejects stale live-verified evidence instead of silently overclaiming live availability', () => {
    const issues = collectProviderCertificationIssues([
      buildRecord({
        status: 'live-verified',
        liveEvidence: {
          verifiedOn: '2026-03-01',
          expiresAfterDays: 30,
          result: 'passed',
          models: [{ kind: 'chat', modelId: 'fixture-chat-model', transportProtocol: 'openai-chat' }],
        },
      }),
    ], {
      now: FIXED_NOW,
      supportedProviderIds: ['fixture-provider'],
      defaultLiveSmokeProviderIds: [],
      fileExists,
    })

    expect(issues).toContain('fixture-provider: liveEvidence 已超过 30 天，必须降级为 contract-verified')
  })

  it('rejects live-verified records without concrete model evidence', () => {
    const issues = collectProviderCertificationIssues([
      buildRecord({
        status: 'live-verified',
        liveEvidence: {
          verifiedOn: '2026-05-11',
          expiresAfterDays: 30,
          result: 'passed',
          models: [],
        },
      }),
    ], {
      now: FIXED_NOW,
      supportedProviderIds: ['fixture-provider'],
      defaultLiveSmokeProviderIds: [],
      fileExists,
    })

    expect(issues).toContain('fixture-provider: liveEvidence.models 不能为空')
  })

  it('requires blocked records to explain the blocker', () => {
    const issues = collectProviderCertificationIssues([
      buildRecord({ status: 'blocked' }),
    ], {
      now: FIXED_NOW,
      supportedProviderIds: ['fixture-provider'],
      defaultLiveSmokeProviderIds: [],
      fileExists,
    })

    expect(issues).toContain('fixture-provider: blocked 状态必须写明 blockedReason')
  })

  it('rejects unknown provider ids and status values', () => {
    const issues = collectProviderCertificationIssues([
      buildRecord({
        providerId: 'not-supported',
        status: 'maybe-live' as ProviderCertificationRecord['status'],
      }),
    ], {
      now: FIXED_NOW,
      supportedProviderIds: ['fixture-provider'],
      defaultLiveSmokeProviderIds: [],
      fileExists,
    })

    expect(issues).toContain('not-supported: certification status 非法: maybe-live')
    expect(issues).toContain('not-supported: 不在 live e2e 支持列表中')
    expect(issues).toContain('fixture-provider: certification 记录缺失')
  })
})
