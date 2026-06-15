/**
 * 说明：`siliconflow-image.test` AI 能力模块。
 *
 * 职责：
 * - 承载 `siliconflow-image.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 单元测试：SiliconFlow 生图模型的参数映射与请求路径。
 *
 * 覆盖：
 * - Qwen Image Edit 的 files/image_size 映射与限制；
 * - 非编辑模型的 size -\> image_size 映射；
 * - 输入缺失时的友好错误。
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { SiliconFlowImageModel } from './siliconflow-image'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('SiliconFlowImageModel', () => {
  it('应使用 /images/generations，并把 files 映射为 image/image2/image3（Qwen-Edit-2509）', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.siliconflow.cn/v1/images/generations')
      const body = JSON.parse(String(init?.body || '')) as Record<string, unknown>

      // Qwen Edit 不支持 image_size；即便传了 size，也必须忽略
      expect(body.image_size).toBeUndefined()

      expect(body).toMatchObject({
        model: 'Qwen/Qwen-Image-Edit-2509',
        prompt: '把图片改成黑色主题',
        // base64([1,2,3]) === "AQID"
        image: 'data:image/png;base64,AQID',
        image2: 'https://a.example/2.png',
        image3: 'data:image/jpeg;base64,BAUG',
        num_inference_steps: 25,
      })
      expect(body.n).toBeUndefined()
      expect(body.batch_size).toBeUndefined()

      return new Response(JSON.stringify({ data: [{ b64_json: 'AAAA' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const model = new SiliconFlowImageModel(
      'Qwen/Qwen-Image-Edit-2509',
      { Authorization: 'Bearer sk-test' },
      'https://api.siliconflow.cn/v1',
      {},
      'siliconflow',
    )

    const res = await model.doGenerate({
      prompt: '把图片改成黑色主题',
      n: 1,
      size: '1024x1024',
      aspectRatio: undefined,
      seed: undefined,
      files: [
        { type: 'file', data: new Uint8Array([1, 2, 3]), mediaType: 'image/png' },
        { type: 'url', url: 'https://a.example/2.png' },
        { type: 'file', data: new Uint8Array([4, 5, 6]), mediaType: 'image/jpeg' }, // base64 === BAUG
        { type: 'url', url: 'https://a.example/4.png' }, // 超出 3 张：应被忽略
      ],
      mask: undefined,
      providerOptions: { siliconflow: { num_inference_steps: 25 } },
      headers: undefined,
      abortSignal: undefined,
    })

    expect(res.images).toEqual(['AAAA'])
    expect(res.warnings.some((w) => w.type === 'unsupported' && w.feature === 'size')).toBe(true)
    expect(res.warnings.some((w) => w.type === 'unsupported' && w.feature === 'files')).toBe(true)
  })

  it('应把 size 映射为 image_size（非 Qwen-Edit 模型）', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '')) as Record<string, unknown>
      expect(body.image_size).toBe('1024x1024')
      return new Response(JSON.stringify({ data: [{ b64_json: 'BBBB' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const model = new SiliconFlowImageModel(
      'Qwen/Qwen-Image',
      { Authorization: 'Bearer sk-test' },
      'https://api.siliconflow.cn/v1',
      {},
      'siliconflow',
    )

    const res = await model.doGenerate({
      prompt: '生成山水画',
      n: 1,
      size: '1024x1024',
      aspectRatio: undefined,
      seed: undefined,
      files: undefined,
      mask: undefined,
      providerOptions: {},
      headers: undefined,
      abortSignal: undefined,
    })

    expect(res.images).toEqual(['BBBB'])
  })

  it('未声明稳定单次多图的模型应由 AI SDK 按 1 张拆批', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '')) as Record<string, unknown>
      expect(body).toMatchObject({
        model: 'Qwen/Qwen-Image',
        prompt: '生成游戏封面',
        response_format: 'b64_json',
        image_size: '1024x1024',
      })
      expect(body.n).toBeUndefined()
      expect(body.batch_size).toBeUndefined()
      return new Response(JSON.stringify({ data: [{ b64_json: 'QWEN' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const model = new SiliconFlowImageModel(
      'Qwen/Qwen-Image',
      { Authorization: 'Bearer sk-test' },
      'https://api.siliconflow.cn/v1',
      {},
      'siliconflow',
    )

    expect(model.maxImagesPerCall({ modelId: 'Qwen/Qwen-Image' })).toBe(1)

    const res = await model.doGenerate({
      prompt: '生成游戏封面',
      n: 1,
      size: '1024x1024',
      aspectRatio: undefined,
      seed: undefined,
      files: undefined,
      mask: undefined,
      providerOptions: {},
      headers: undefined,
      abortSignal: undefined,
    })

    expect(res.images).toEqual(['QWEN'])
  })

  it('官方声明 batch_size 的模型仍允许单次批量生成', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '')) as Record<string, unknown>
      expect(body).toMatchObject({
        model: 'Kwai-Kolors/Kolors',
        prompt: '生成游戏封面',
        n: 3,
        batch_size: 3,
      })
      return new Response(JSON.stringify({ data: [{ b64_json: 'A' }, { b64_json: 'B' }, { b64_json: 'C' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const model = new SiliconFlowImageModel(
      'Kwai-Kolors/Kolors',
      { Authorization: 'Bearer sk-test' },
      'https://api.siliconflow.cn/v1',
      {},
      'siliconflow',
    )

    expect(model.maxImagesPerCall({ modelId: 'Kwai-Kolors/Kolors' })).toBe(4)

    const res = await model.doGenerate({
      prompt: '生成游戏封面',
      n: 3,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      files: undefined,
      mask: undefined,
      providerOptions: {},
      headers: undefined,
      abortSignal: undefined,
    })

    expect(res.images).toEqual(['A', 'B', 'C'])
  })

  it('调用方额外 headers 不能覆盖专用图片模型的自定义鉴权头', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      expect(headers.get('xi-api-key')).toBe('sk-custom')
      expect(headers.get('x-trace-id')).toBe('trace-1')
      return new Response(JSON.stringify({ data: [{ b64_json: 'CCCC' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const model = new SiliconFlowImageModel(
      'Qwen/Qwen-Image',
      { 'xi-api-key': 'sk-custom' },
      'https://api.siliconflow.cn/v1',
      {},
      'siliconflow',
    )

    const res = await model.doGenerate({
      prompt: '生成山水画',
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      files: undefined,
      mask: undefined,
      providerOptions: {},
      headers: {
        'xi-api-key': 'wrong',
        'X-Trace-Id': 'trace-1',
      },
      abortSignal: undefined,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(res.images).toEqual(['CCCC'])
  })

  it('Qwen Image Edit 缺少输入图片时应直接报错（更友好）', async () => {
    const model = new SiliconFlowImageModel(
      'Qwen/Qwen-Image-Edit',
      { Authorization: 'Bearer sk-test' },
      'https://api.siliconflow.cn/v1',
      {},
      'siliconflow',
    )

    await expect(model.doGenerate({
      prompt: '把图片改成黑色主题',
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      files: undefined,
      mask: undefined,
      providerOptions: {},
      headers: undefined,
      abortSignal: undefined,
    })).rejects.toMatchObject({ name: 'I18nError', message: 'errors.inputImageRequiredForEditModel' })
  })
})
