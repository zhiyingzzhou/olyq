/**
 * 说明：`image-download.test` AI 能力模块。
 *
 * 职责：
 * - 承载 `image-download.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('image-download network targets', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('downloadUrlToFile 在安装期网页权限模型下直接下载，不再触发运行时授权检查', async () => {
    const fetchMock = vi.fn(async () => new Response('ok', { status: 200, headers: { 'content-type': 'image/png' } }))
    vi.stubGlobal('fetch', fetchMock)

    const { downloadUrlToFile } = await import('./image-download')
    const file = await downloadUrlToFile('https://cdn.example.com/assets/image.png')

    expect(fetchMock).toHaveBeenCalledWith('https://cdn.example.com/assets/image.png', { cache: 'no-store' })
    expect(file).toEqual({ base64: 'b2s=', mediaType: 'image/png' })
  })

  it('resolveDownloadHostMatchPatterns 只返回精确诊断 patterns，不触发网页授权流程', async () => {
    const { resolveDownloadHostMatchPatterns } = await import('./image-download')

    await expect(resolveDownloadHostMatchPatterns([
      'https://cdn.example.com/assets/image.png',
      'https://oss.example.net/files/1.png',
      'file:///tmp/not-web.png',
    ])).resolves.toEqual(['https://cdn.example.com/*', 'https://oss.example.net/*'])
  })
})
