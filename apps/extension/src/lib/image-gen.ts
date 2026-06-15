/**
 * 说明：`image-gen` 基础能力模块。
 *
 * 职责：
 * - 承载 `image-gen` 相关的当前文件实现与模块边界；
 * - 对外暴露 `generateImages` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { getUiPort, onUiPortMessage, postUiPortMessage } from '@/extension/bridge/ui-port';
import { createId } from '@/lib/utils/id';
import { I18nError } from '@/lib/i18n/error';
import { isI18nText } from '@/lib/i18n/text';
import { downloadUrlToFile } from '@/lib/ai/image-download';

/** 从 URL 路径中推断图片文件扩展名。 */
function pickFileExtensionFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\.([a-z0-9]+)$/i);
    const ext = m?.[1]?.toLowerCase() ?? '';
    if (ext) return ext;
  } catch {
    // ignore
  }
  return 'png';
}

/** 根据文件扩展名推断 MIME。 */
function mimeFromExtension(ext: string): string {
  const e = String(ext || '').toLowerCase();
  if (e === 'png') return 'image/png';
  if (e === 'jpg' || e === 'jpeg') return 'image/jpeg';
  if (e === 'webp') return 'image/webp';
  if (e === 'gif') return 'image/gif';
  return 'image/png';
}

/** 图片生成结果中的单张图片 */
type ImageGenItem = {
  /** 图片 data URL（base64） */
  dataUrl: string;
  /** MIME 类型（例如 "image/png"） */
  mime: string;
  /** 文件名/展示名 */
  name: string;
};

/** 图片生成结果 */
type ImageGenResult = {
  /** 生成的图片列表 */
  images: ImageGenItem[];
  /** 可选：模型改写后的提示词（部分模型会返回） */
  revisedPrompt?: string;
};

/** generateImages 的入参 */
type GenerateImagesParams = {
  /** 模型 ID */
  model: string;
  /** 文生图提示词 */
  prompt: string;
  /** 可选：输入图片（图生图；data URL 列表） */
  inputImages?: string[];
  /** 可选：生成张数 */
  n?: number;
  /** 可选：单次调用最多生成张数（用于批量拆分） */
  maxImagesPerCall?: number;
  /** 可选：最大重试次数 */
  maxRetries?: number;
  /** 可选：尺寸（由具体模型决定） */
  size?: string;
  /** 可选：宽高比（由具体模型决定） */
  aspectRatio?: string;
  /** 可选：seed */
  seed?: number;
  /** 可选：质量（由具体模型决定） */
  quality?: string;
  /** 可选：Provider 直通参数（AI SDK providerOptions） */
  providerOptions?: unknown;
  /** 可选：额外请求头（AI SDK headers） */
  headers?: unknown;
  /** 可选：取消信号（用于"停止生成"） */
  signal?: AbortSignal;
};

/**
 * 发起一次图片生成请求，并把结果统一转换为 data URL 列表。
 *
 * 说明：
 * - 真正的生成在 Service Worker 侧执行，这里负责通过共享 UI Port 发消息并等待结果；
 * - 若后台返回的是临时图片 URL，UI 直接下载转成 base64，保证上层附件落库逻辑不变。
 *   普通 http/https 出站下载由安装期 host access 覆盖；非连通、鉴权或 CORS 问题按真实下载错误返回。
 */
export async function generateImages({
  model,
  prompt,
  inputImages,
  n = 1,
  maxImagesPerCall,
  maxRetries,
  size,
  aspectRatio,
  seed,
  quality,
  providerOptions,
  headers,
  signal,
}: GenerateImagesParams): Promise<ImageGenResult> {
  const port = getUiPort();
  if (!port) throw new I18nError('errors.extensionPortUnavailable');

  /**
   * 以指定 requestId 执行一次真实图片生成。
   *
   * 说明：
   * - requestId 用于把当前 Promise 与 Port 上的异步回包精确关联；
   * - 取消时会主动向后台发送 `image/abort`，避免 Service Worker 继续消耗资源。
   */
  const runOnce = async (requestId: string): Promise<ImageGenResult> => {
    return await new Promise<ImageGenResult>((resolve, reject) => {
      let done = false;

      /**
       * 收尾当前 requestId 对应的一次图片生成等待流程。
       *
       * 说明：
       * - 负责统一移除 Port 监听与 abort 监听，避免重复回包或取消后留下悬挂订阅；
       * - 传入错误时仅做 reject，不传错误则表示等待链路正常结束。
       */
      const cleanup = (err?: unknown) => {
        if (done) return;
        done = true;
        off();
        if (signal) signal.removeEventListener('abort', onAbort);
        if (err) reject(err);
      };

      /**
       * 处理中途取消生成。
       *
       * 说明：
       * - 除了本地 Promise 立即结束，还会主动通知后台发送 `image/abort`，减少无意义的模型消耗；
       * - 返回标准 `AbortError`，让上层可以按统一取消分支处理。
       */
      const onAbort = () => {
        postUiPortMessage({ type: 'image/abort', requestId });
        cleanup(new DOMException('Aborted', 'AbortError'));
      };

      const off = onUiPortMessage((msg) => {
        const m = msg as { type?: unknown; requestId?: unknown; images?: unknown; revisedPrompt?: unknown; error?: unknown } | null;
        if (!m || m.requestId !== requestId || typeof m.type !== 'string') return;

        if (m.type === 'image/result') {
              const images = Array.isArray(m.images) ? m.images : [];
              if (images.length === 0) return;
              void (async () => {
                try {
                  const out: ImageGenItem[] = [];

              for (const raw of images) {
                if (done) return;
                if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
                if (!raw || typeof raw !== 'object') continue;

                const r = raw as Record<string, unknown>;
                const kind = typeof r.kind === 'string' ? r.kind : '';
                const name = String(r.name || 'image.png');

                // 1) SW 已提供 dataUrl（base64）
                if (kind === 'dataUrl') {
                  const dataUrl = String(r.dataUrl || '');
                  if (!dataUrl.startsWith('data:')) continue;
                  out.push({
                    dataUrl,
                    mime: String(r.mime || 'image/png'),
                    name,
                  });
                  continue;
                }

                // 2) SW 仅提供 url：UI 侧下载转成 dataUrl，保证上层逻辑（落库/附件）不变
                if (kind === 'url') {
                  const url = String(r.url || '').trim();
                  if (!url.startsWith('http')) continue;
                  const file = await downloadUrlToFile(url);
                  if (!file?.base64) throw new I18nError('errors.imageDownloadFailed', { status: 0 }, { cause: { url } });
                  const ext = pickFileExtensionFromUrl(url);
                  const mime =
                    typeof r.mime === 'string' && r.mime.trim() ? r.mime.trim()
                      : typeof file.mediaType === 'string' && file.mediaType.trim() ? file.mediaType.trim()
                        : mimeFromExtension(ext);
                  out.push({
                    dataUrl: `data:${mime};base64,${file.base64}`,
                    mime,
                    name: name || `image.${ext}`,
                  });
                  continue;
                }
              }

              if (out.length === 0) return;
              const revisedPrompt = typeof m.revisedPrompt === 'string' ? m.revisedPrompt : undefined;
              cleanup();
              resolve({ images: out, ...(revisedPrompt ? { revisedPrompt } : {}) });
            } catch (e: unknown) {
              cleanup(e);
            }
          })();
          return;
        }

        if (m.type === 'image/error') {
          if (isI18nText(m.error)) {
            cleanup(new I18nError(m.error.key, m.error.params, { cause: m.error }));
            return;
          }
          // 说明：严格要求后台透传 I18nText；若收到非预期格式，降级为通用失败提示。
          cleanup(new I18nError('errors.imageGenerationFailed', undefined, { cause: m.error }));
        }
      });

      if (signal) signal.addEventListener('abort', onAbort, { once: true });

      const ok = postUiPortMessage({
        type: 'image/generate',
        requestId,
        payload: { model, prompt, inputImages, n, maxImagesPerCall, maxRetries, size, aspectRatio, seed, quality, providerOptions, headers },
      });
      if (!ok) cleanup(new I18nError('errors.imageRequestSendFailed'));
    });
  };

  return await runOnce(createId());
}
