/**
 * 说明：`dashscope-image.test` AI 能力模块。
 *
 * 职责：
 * - 承载 `dashscope-image.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 单元测试：DashScope 多模态输出中图片 URL 的提取与去重。
 */

import { describe, expect, it } from 'vitest'
import { DashScopeImageModel, extractDashScopeMultimodalOutputImageUrls } from './dashscope-image'

describe('extractDashScopeMultimodalOutputImageUrls', () => {
  it('should extract image urls from multimodal choices content', () => {
    const json = {
      output: {
        choices: [
          {
            message: {
              content: [
                { text: 'ok' },
                { image: 'https://a.example/1.png' },
                { image: { url: 'https://a.example/2.png' } },
                { url: 'https://a.example/3.png' },
                { image_url: 'https://a.example/4.png' },
              ],
            },
          },
          {
            message: {
              content: [
                { image: 'https://a.example/2.png' }, // duplicate
              ],
            },
          },
        ],
      },
    }

    expect(extractDashScopeMultimodalOutputImageUrls(json)).toEqual([
      'https://a.example/1.png',
      'https://a.example/2.png',
      'https://a.example/3.png',
      'https://a.example/4.png',
    ])
  })

  it('should return empty array for invalid shapes', () => {
    expect(extractDashScopeMultimodalOutputImageUrls(null)).toEqual([])
    expect(extractDashScopeMultimodalOutputImageUrls({})).toEqual([])
    expect(extractDashScopeMultimodalOutputImageUrls({ output: { choices: [] } })).toEqual([])
  })

  it('should expose Qwen model-family maxImagesPerCall from the adapter source', () => {
    const model = new DashScopeImageModel('qwen-image', { Authorization: 'Bearer sk-test' })

    expect(model.maxImagesPerCall({ modelId: 'qwen-image' })).toBe(1)
    expect(model.maxImagesPerCall({ modelId: 'qwen-image-2.0' })).toBe(6)
    expect(model.maxImagesPerCall({ modelId: 'qwen-image-edit-plus' })).toBe(6)
    expect(model.maxImagesPerCall({ modelId: 'qwen-image-edit-max' })).toBe(6)
    expect(model.maxImagesPerCall({ modelId: 'wanx2.1-t2i-turbo' })).toBe(4)
  })
})
