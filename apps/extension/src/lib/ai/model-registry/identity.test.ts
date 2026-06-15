/**
 * 说明：`identity.test` AI 能力模块。
 *
 * 职责：
 * - 承载 `identity.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { describe, expect, it } from 'vitest'

import {
  buildAliasKey,
  buildProviderModelMapKey,
  extractBaseModelKey,
  normalizeModelKey,
  normalizeModelSlug,
  parseCanonicalId,
} from './identity'

describe('model-registry identity', () => {
  it('索引主键保留营销后缀，但匹配归一会剥离后缀', () => {
    expect(normalizeModelKey('glm-4.5:free')).toBe('glm-4.5:free')
    expect(normalizeModelSlug('glm-4.5:free')).toBe('glm-4.5')
    expect(normalizeModelKey('qwen-max@128k')).toBe('qwen-max@128k')
    expect(normalizeModelSlug('qwen-max@128k')).toBe('qwen-max')
  })

  it('可正确解析 public 与 local canonicalId', () => {
    expect(parseCanonicalId('public::zai::glm-5')).toMatchObject({
      scope: 'public',
      vendorSlug: 'zai',
      modelSlug: 'glm-5',
    })

    expect(parseCanonicalId('local::ollama::default::qwen3:latest')).toMatchObject({
      scope: 'local',
      providerTypeSlug: 'ollama',
      providerIdSlug: 'default',
      scopedModelSlug: 'qwen3:latest',
    })
  })

  it('providerType/providerId 会在当前索引主键生成链路中被统一归一化', () => {
    expect(buildProviderModelMapKey(' SiliconFlow ', 'Prod_A', 'DeepSeek-V3.1')).toBe(
      'siliconflow::prod-a::deepseek-v3.1',
    )
    expect(buildAliasKey('DeepSeek-V3.1', ' SiliconFlow ', 'Prod_A')).toBe(
      'siliconflow::prod-a::deepseek-v3.1',
    )
  })

  it('extractBaseModelKey 会统一基础模型身份语义，并剥离包装前缀与 SKU 后缀', () => {
    expect(extractBaseModelKey('siliconflow/deepseek-v3.2')).toBe('deepseek-v3.2')
    expect(extractBaseModelKey('accounts/fireworks/models/deepseek-v3p2')).toBe('deepseek-v3.2')
    expect(extractBaseModelKey('glm-4.5:free')).toBe('glm-4.5')
    expect(extractBaseModelKey('glm-4.5(free)')).toBe('glm-4.5')
    expect(extractBaseModelKey('qwen3:cloud')).toBe('qwen3')
    expect(extractBaseModelKey('qwen-max@128k')).toBe('qwen-max')
  })
})
