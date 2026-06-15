/**
 * 说明：`image-urls.test` AI 能力模块。
 *
 * 职责：
 * - 承载 `image-urls.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 单元测试：OpenAI-like 生图响应中图片 URL 的提取与去重。
 */

import { describe, expect, it } from 'vitest'
import { extractOpenAiLikeImageUrls } from './image-urls'

describe('extractOpenAiLikeImageUrls', () => {
  it('should collect urls from data/images and dedupe', () => {
    const json = {
      data: [{ url: 'https://a.example/1.png' }, { url: 'https://a.example/2.png' }],
      images: [{ url: 'https://a.example/2.png' }, { url: 'https://a.example/3.png' }],
    }
    expect(extractOpenAiLikeImageUrls(json)).toEqual([
      'https://a.example/1.png',
      'https://a.example/2.png',
      'https://a.example/3.png',
    ])
  })

  it('should accept string url arrays', () => {
    const json = { data: ['https://a.example/1.png', 'https://a.example/2.png'] }
    expect(extractOpenAiLikeImageUrls(json)).toEqual(['https://a.example/1.png', 'https://a.example/2.png'])
  })

  it('should return empty array when urls are missing', () => {
    expect(extractOpenAiLikeImageUrls({})).toEqual([])
    expect(extractOpenAiLikeImageUrls({ data: [{ b64_json: 'xxx' }] })).toEqual([])
    expect(extractOpenAiLikeImageUrls(null)).toEqual([])
  })
})
