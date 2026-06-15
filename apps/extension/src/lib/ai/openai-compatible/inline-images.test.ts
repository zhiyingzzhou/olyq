/**
 * 说明：`inline-images.test` AI 能力模块。
 *
 * 职责：
 * - 承载 `inline-images.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 单元测试：openai-compatible provider metadata 的内联图片提取。
 *
 * 覆盖：
 * - message.images 多种形态的 data URL 提取；
 * - streaming delta.images 的增量提取与去重。
 */

import { describe, it, expect } from 'vitest'

import {
  createOpenAiCompatibleInlineImageMetadataExtractor,
  extractInlineImageFilesFromProviderMetadata,
} from './inline-images'

describe('openai-compatible inline images', () => {
  it('能从 OpenRouter message.images（image_url/url/string）提取 data URL', async () => {
    const extractor = createOpenAiCompatibleInlineImageMetadataExtractor('rightcode')
    const body = {
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'ok',
            images: [
              { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } },
              { image_url: { url: 'data:image/jpeg;base64,BBB' } },
              { imageUrl: { url: 'data:image/webp;base64,CCC' } },
              { url: 'data:image/png;base64,DDD' },
              'data:image/png;base64,EEE',
            ],
          },
        },
      ],
    }

    const meta = await extractor.extractMetadata({ parsedBody: body })
    expect(meta).toBeTruthy()

    const files = extractInlineImageFilesFromProviderMetadata(meta, 'rightcode')
    expect(files.map((f) => `${f.mediaType}:${f.base64}`)).toEqual([
      'image/png:AAA',
      'image/jpeg:BBB',
      'image/webp:CCC',
      'image/png:DDD',
      'image/png:EEE',
    ])
  })

  it('能从 OpenRouter streaming delta.images 提取并去重', () => {
    const extractor = createOpenAiCompatibleInlineImageMetadataExtractor('rightcode')
    const stream = extractor.createStreamExtractor()

    stream.processChunk({
      choices: [{ delta: { images: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } }] } }],
    })
    // 重复（不同形态），应被去重
    stream.processChunk({
      choices: [{ delta: { images: [{ url: 'data:image/png;base64,AAA' }] } }],
    })
    // 新图片
    stream.processChunk({
      choices: [{ delta: { images: ['data:image/png;base64,BBB'] } }],
    })

    const meta = stream.buildMetadata()
    const files = extractInlineImageFilesFromProviderMetadata(meta, 'rightcode')
    expect(files.map((f) => `${f.mediaType}:${f.base64}`)).toEqual(['image/png:AAA', 'image/png:BBB'])
  })
})
