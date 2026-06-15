/**
 * 说明：`providers-live.spec` 源码模块。
 *
 * 职责：
 * - 承载 `providers-live.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { expect, test } from '@playwright/test'

import { closeExtension, launchExtensionForLive, resetExtensionState } from './extension'
import {
  assertProviderNetworkAccessCovered,
  buildProviderLiveSpec,
  collectProviderLiveSnapshot,
  getProviderLiveSkipReason,
  getRequestedProviderIds,
  readSeededProvider,
  runProviderChatLive,
  runProviderEmbeddingLive,
  runProviderHealthCheck,
  runProviderImageLive,
  seedLiveProvider,
  shouldRequireProviderLive,
} from './providers-live.helpers'
import {
  PROVIDER_LIVE_SUPPORTED_PROVIDER_IDS,
  getProviderCertificationRecord,
  type ProviderCertificationModelKind,
} from '../src/lib/ai/provider-certification'

const SUPPORTED_PROVIDER_IDS = PROVIDER_LIVE_SUPPORTED_PROVIDER_IDS
const supportedProviderIdSet = new Set<string>(SUPPORTED_PROVIDER_IDS)

const requestedProviderIds = getRequestedProviderIds()
const requireProviderLive = shouldRequireProviderLive()

/**
 * 生成安全的 endpoint / region 摘要，避免 live 报告落入任何密钥材料。
 *
 * @param spec - 当前 provider live spec。
 * @returns 可写入报告的目标摘要。
 */
function summarizeProviderTarget(spec: NonNullable<ReturnType<typeof buildProviderLiveSpec>>): string | undefined {
  if (spec.bedrock?.region) return spec.bedrock.region
  if (spec.vertex?.location) return spec.vertex.location
  const apiHost = String(spec.apiHost || '').trim()
  if (!apiHost) return undefined
  try {
    return new URL(apiHost).origin
  } catch {
    return undefined
  }
}

/**
 * 把 Playwright live smoke 成功结果整理成可人工回填 certification 的证据片段。
 *
 * @param args - 本次 live smoke 的运行结果。
 * @returns 不含密钥的认证报告。
 */
function buildProviderLiveCertificationSummary(args: {
  readonly spec: NonNullable<ReturnType<typeof buildProviderLiveSpec>>
  readonly snapshot: Awaited<ReturnType<typeof collectProviderLiveSnapshot>>
  readonly chatRuns: ReadonlyArray<Awaited<ReturnType<typeof runProviderChatLive>>>
  readonly embeddingResult: Awaited<ReturnType<typeof runProviderEmbeddingLive>> | null
  readonly imageResult: Awaited<ReturnType<typeof runProviderImageLive>> | null
}) {
  const { spec, snapshot, chatRuns, embeddingResult, imageResult } = args
  const target = summarizeProviderTarget(spec)
  const models = [
    ...chatRuns.map((run) => {
      const resolved = snapshot.resolvedModels.find((item) => item.rawModelId === run.modelId)
      return {
        kind: 'chat' as ProviderCertificationModelKind,
        modelId: run.modelId,
        ...(resolved?.transportProtocol ? { transportProtocol: resolved.transportProtocol } : {}),
        ...(target ? { endpointOrRegion: target } : {}),
      }
    }),
    ...(embeddingResult
      ? [{
          kind: 'embedding' as ProviderCertificationModelKind,
          modelId: embeddingResult.modelId,
          transportProtocol: 'embedding-api' as const,
          ...(target ? { endpointOrRegion: target } : {}),
        }]
      : []),
    ...(imageResult
      ? [{
          kind: 'image' as ProviderCertificationModelKind,
          modelId: imageResult.modelId,
          transportProtocol: 'image-api' as const,
          ...(target ? { endpointOrRegion: target } : {}),
        }]
      : []),
  ]

  const finishedAt = new Date()
  const currentRecord = getProviderCertificationRecord(spec.providerId)
  return {
    providerId: spec.providerId,
    providerType: spec.providerType,
    validationType: 'live-smoke',
    result: 'passed',
    verifiedAt: finishedAt.toISOString(),
    verifiedOn: finishedAt.toISOString().slice(0, 10),
    currentCertificationStatus: currentRecord?.status ?? 'missing',
    liveExpiresAfterDays: 30,
    updateInstruction: '人工确认本报告来自团队测试账号后，才允许把 provider-certification.ts 中对应 provider 标记为 live-verified。',
    models,
  }
}

test('providers-live: requested provider ids preflight', async () => {
  const unsupported = requestedProviderIds.filter((providerId) => !supportedProviderIdSet.has(providerId))
  expect(unsupported).toEqual([])
})

for (const providerId of SUPPORTED_PROVIDER_IDS) {
  test(`providers-live: ${providerId}`, async ({ browserName: _browserName }, testInfo) => {
    void _browserName
    test.setTimeout(5 * 60 * 1000)

    test.skip(!requestedProviderIds.includes(providerId), `未在 OLYQ_E2E_PROVIDER_IDS 中启用 ${providerId}`)

    const spec = buildProviderLiveSpec(providerId)
    if (!spec) {
      if (requireProviderLive) throw new Error(`未找到 ${providerId} 的 live spec`)
      test.skip(true, `未找到 ${providerId} 的 live spec`)
      return
    }

    const skipReason = getProviderLiveSkipReason(spec)
    if (skipReason) {
      if (requireProviderLive) throw new Error(`${providerId} live 配置不完整: ${skipReason}`)
      test.skip(true, skipReason)
      return
    }

    const handle = await launchExtensionForLive()
    try {
      await resetExtensionState(handle.page)
      await seedLiveProvider(handle.page, spec)
      await handle.page.reload({ waitUntil: 'domcontentloaded' })

      const provider = await readSeededProvider(handle.page, spec.providerId)
      expect(provider).not.toBeNull()
      expect(provider?.id).toBe(spec.providerId)
      expect(Array.isArray(provider?.models)).toBe(true)
      expect((provider?.models as Array<unknown>).length).toBeGreaterThan(0)

      const snapshot = await collectProviderLiveSnapshot(handle.page, spec)
      expect(snapshot.registryGeneratedAt).not.toBe(new Date(0).toISOString())
      expect(snapshot.expectedModels.length).toBeGreaterThan(0)
      expect(snapshot.resolvedModels.length).toBe(snapshot.expectedModels.length)
      expect(snapshot.resolvedModels.every((item) => item.source !== 'missing')).toBe(true)

      const networkAccessResult = await assertProviderNetworkAccessCovered(
        handle.page,
        snapshot.requiredHostPatterns,
      )
      expect(['covered', 'not-required']).toContain(networkAccessResult.status)

      const healthResult = await runProviderHealthCheck(handle.page, spec)
      expect(healthResult.status).toBe('ok')
      expect(healthResult.modelResults.length).toBe(snapshot.expectedModels.length)
      expect(healthResult.modelResults.every((item) => item.status === 'ok')).toBe(true)

      const chatRuns = []
      for (const model of snapshot.expectedModels.filter((item) => item.expectedKind === 'chat')) {
        const chatResult = await runProviderChatLive(handle.page, spec, model.rawModelId)
        chatRuns.push(chatResult)
        expect(chatResult.status).toBe('ok')
        expect(
          chatResult.assistantText.trim().length > 0
          || chatResult.fileCount > 0
          || chatResult.toolCallCount > 0,
        ).toBe(true)
      }

      const embeddingResult = spec.models.embedding
        ? await runProviderEmbeddingLive(handle.page, spec, spec.models.embedding)
        : null
      if (embeddingResult) {
        expect(embeddingResult.status).toBe('ok')
        expect(embeddingResult.vectorLength).toBeGreaterThan(0)
      }

      const imageResult = spec.models.image
        ? await runProviderImageLive(handle.page, spec, spec.models.image)
        : null
      if (imageResult) {
        expect(imageResult.status).toBe('ok')
        expect(imageResult.imageCount).toBeGreaterThan(0)
      }

      const executionSummary = {
        snapshot,
        networkAccess: networkAccessResult,
        healthCheck: healthResult,
        chatRuns,
        ...(embeddingResult ? { embeddingRun: embeddingResult } : {}),
        ...(imageResult ? { imageRun: imageResult } : {}),
      }
      const certificationSummary = buildProviderLiveCertificationSummary({
        spec,
        snapshot,
        chatRuns,
        embeddingResult,
        imageResult,
      })

      await testInfo.attach(`provider-live-${spec.providerId}.json`, {
        body: JSON.stringify(executionSummary, null, 2),
        contentType: 'application/json',
      })
      await testInfo.attach(`provider-certification-${spec.providerId}.json`, {
        body: JSON.stringify(certificationSummary, null, 2),
        contentType: 'application/json',
      })

      console.log(JSON.stringify({
        kind: 'providers-live',
        providerId: spec.providerId,
        providerType: spec.providerType,
        apiHost: spec.apiHost ?? '',
        registryGeneratedAt: snapshot.registryGeneratedAt,
        requiredHostPatterns: snapshot.requiredHostPatterns,
        networkAccess: networkAccessResult,
        healthStatus: healthResult.status,
        healthModels: healthResult.modelResults,
        chatRuns,
        embeddingStatus: embeddingResult?.status ?? null,
        imageStatus: imageResult?.status ?? null,
        resolvedModels: snapshot.resolvedModels,
        certification: certificationSummary,
      }))
    } finally {
      await closeExtension(handle)
    }
  })
}
