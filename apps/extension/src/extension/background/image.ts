/**
 * 说明：`image` 后台运行时模块。
 *
 * 职责：
 * - 承载 `image` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ImageGenerateRequest`、`ImageGenerateEvent`、`generateImagesToPort` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { APICallError, RetryError, generateImage } from 'ai';
import type { ProviderOptions } from '@ai-sdk/provider-utils';
import { isRecord, isPlainRecord } from '../../lib/utils/type-guards';
import { resolveProviderRuntimeContext } from '../../lib/ai/provider-runtime';
import { createImageModel } from '../../lib/ai/provider-factory';
import { buildImageGenerationRequestParams, resolveImageGenerationCapability } from '../../lib/ai/image-generation-params';
import { formatApiCallErrorCompact, toApiCallErrorText } from '../../lib/ai/utils/api-errors';
import { extractOpenAiLikeImageUrls } from '../../lib/ai/openai-compatible/image-urls';
import type { I18nText } from '../../types/i18n';
import { I18nError, toI18nTextFromError } from '../../lib/i18n/error';
import { i18nText } from '../../lib/i18n/text';

/**
 * 后台图片生成（文生图）
 *
 * 设计目标：
 * - 统一在 Service Worker 内发起图片模型请求（避免页面侧直连第三方 API 的 CORS/密钥暴露问题）
 * - 以事件流的形式回传结果（image/result → image/done / image/error），便于 UI 复用同一套处理
 *
 * 说明：
 * - 彻底切换到 AI SDK 的 `generateImage()` + 各 Provider 的 `imageModel()` 实现
 * - 覆盖：OpenAI / Google Imagen / xAI / OpenAI-Compatible（含本地兼容端点）
 */

/** UI → Service Worker：图片生成请求 */
export type ImageGenerateRequest = {
  /** 请求 ID：用于在同一 Port 上多路复用与取消 */
  requestId: string;
  /** 模型标识："providerId/modelId" */
  model: string;
  /** 文生图提示词 */
  prompt: string;
  /** 可选：输入图片（图生图/编辑；data URL 或 http(s) URL 列表） */
  inputImages?: string[];
  /** 可选：生成张数 */
  n?: number;
  /** 可选：单次调用最多生成张数（用于批量拆分） */
  maxImagesPerCall?: number;
  /** 可选：最大重试次数 */
  maxRetries?: number;
  /** 可选：尺寸（例如 `1024x1024`） */
  size?: string;
  /** 可选：宽高比（例如 `16:9`） */
  aspectRatio?: string;
  /** 可选：seed */
  seed?: number;
  /** 可选：质量（通常为 OpenAI/OpenAI-Compatible 的 providerOptions 参数） */
  quality?: string;
  /** 可选：Provider 直通参数（AI SDK providerOptions） */
  providerOptions?: unknown;
  /** 可选：额外请求头（AI SDK headers） */
  headers?: unknown;
};

/** 图片生成结果中的单张图片 */
type ImageGeneratedImage =
  | {
      /** 结果类型：dataUrl（已具备 base64，UI 可直接展示/落库） */
      kind: 'dataUrl';
      /** 图片 data URL（base64） */
      dataUrl: string;
      /** MIME 类型（例如 "image/png"） */
      mime: string;
      /** 文件名/展示名 */
      name: string;
    }
  | {
      /**
       * 结果类型：url（仅返回远端 URL）。
       *
       * 说明：
       * - 部分平台会忽略 response_format=b64_json，只返回 url；
       * - UI 侧可以选择“直接展示”或“下载转成 dataUrl/Blob 后再落库”。
       */
      kind: 'url';
      /** 远端图片 URL */
      url: string;
      /** 可选：MIME 类型（若无法判断可不填） */
      mime?: string;
      /** 文件名/展示名 */
      name: string;
    };

/** Service Worker → UI：图片生成成功事件 */
type ImageResultEvent = {
  /** 事件类型 */
  type: "image/result";
  /** 请求 ID */
  requestId: string;
  /** 生成的图片列表 */
  images: ImageGeneratedImage[];
  /** 可选：模型改写后的提示词（部分模型会返回） */
  revisedPrompt?: string;
};

/** Service Worker → UI：图片生成完成事件（终态） */
type ImageDoneEvent = {
  /** 事件类型 */
  type: "image/done";
  /** 请求 ID */
  requestId: string;
};

/** Service Worker → UI：图片生成失败事件（终态） */
type ImageErrorEvent = {
  /** 事件类型 */
  type: "image/error";
  /** 请求 ID */
  requestId: string;
  /** 错误信息（I18nText；由 UI 侧负责渲染为最终字符串） */
  error: I18nText;
};

/** Service Worker → UI：图片生成事件流 */
export type ImageGenerateEvent = ImageResultEvent | ImageDoneEvent | ImageErrorEvent;

/**
 * 将未知异常归一为可序列化的 I18nText（用于跨上下文：SW → UI）。
 *
 * 设计约束：
 * - Service Worker 不直接渲染文案（不调用 i18next 的 t），只透传 key+params。
 * - 对 RetryError/APICallError 做更精确的映射，避免 UI 只能显示“未知错误”。
 */
function toImageGenErrorText(e: unknown): I18nText {
  // 说明：图片生成属于明确场景；若遇到未知错误，优先落到 imageGenerationFailed，而不是 errors.unknown。
  const name = isRecord(e) ? e['name'] : null;
  if (name === 'AbortError') return i18nText('errors.cancelled');

  if (e instanceof Error && RetryError.isInstance(e)) {
    const last = e.lastError;
    const detail = last instanceof Error && APICallError.isInstance(last) ? formatApiCallErrorCompact(last) : (e.message || '');
    return detail.trim()
      ? i18nText('errors.retryStillFailedWithDetail', { detail: detail.trim() })
      : i18nText('errors.retryStillFailed');
  }
  if (e instanceof Error && APICallError.isInstance(e)) {
    return toApiCallErrorText(e);
  }

  const t = toI18nTextFromError(e);
  if (t.key === 'errors.unknown') return i18nText('errors.imageGenerationFailed');
  if (t.key === 'errors.unknownWithDetail') {
    const detail = typeof t.params?.detail === 'string' ? t.params.detail.trim() : '';
    return detail
      ? i18nText('errors.imageGenerationFailedWithDetail', { detail })
      : i18nText('errors.imageGenerationFailed');
  }
  return t;
}

/** 规整额外请求头，仅保留非空字符串值。 */
function sanitizeHeaders(raw: unknown): Record<string, string> | undefined {
  if (!raw) return undefined;
  if (!isPlainRecord(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!k) continue;
    if (typeof v === 'string' && v.trim()) out[k] = v.trim();
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** 规整 providerOptions，确保顶层为 `providerKey -\> plain object` 结构。 */
function sanitizeProviderOptions(raw: unknown): Record<string, Record<string, unknown>> | undefined {
  if (!raw) return undefined;
  if (!isPlainRecord(raw)) return undefined;
  const out: Record<string, Record<string, unknown>> = {};
  for (const [providerKey, v] of Object.entries(raw)) {
    if (!providerKey) continue;
    if (!isPlainRecord(v)) continue;
    out[providerKey] = { ...v };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** 根据 MIME 类型推导默认文件扩展名。 */
function pickFileExtension(mediaType: string): string {
  const lower = String(mediaType || '').toLowerCase();
  if (lower.includes('png')) return 'png';
  if (lower.includes('jpeg') || lower.includes('jpg')) return 'jpg';
  if (lower.includes('webp')) return 'webp';
  if (lower.includes('gif')) return 'gif';
  return lower.split('/')[1] || 'bin';
}

/** 从远端图片 URL 推导文件扩展名；失败时回退为 png。 */
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

/** 根据文件扩展名反推 MIME 类型。 */
function mimeFromExtension(ext: string): string {
  const e = String(ext || '').toLowerCase();
  if (e === 'png') return 'image/png';
  if (e === 'jpg' || e === 'jpeg') return 'image/jpeg';
  if (e === 'webp') return 'image/webp';
  if (e === 'gif') return 'image/gif';
  return 'image/png';
}

/** 从 providerMetadata 中提取模型修订后的提示词。 */
function extractRevisedPrompt(providerMetadata: unknown): string | undefined {
  if (!isPlainRecord(providerMetadata)) return undefined;
  const openai = providerMetadata.openai;
  if (!isPlainRecord(openai) || !Array.isArray(openai.images)) return undefined;
  for (const it of openai.images) {
    if (!isPlainRecord(it)) continue;
    const rp = it.revisedPrompt;
    if (typeof rp === 'string' && rp.trim()) return rp.trim();
  }
  return undefined;
}

/**
 * SW 入口：把“图片生成请求”转成端口事件流（result/done/error）。
 *
 * 说明：
 * - 统一在 Service Worker 内调用 AI SDK 的 `generateImage()`；
 * - 兼容不同平台返回 dataUrl / url 两种形态；
 * - 所有错误归一为 I18nText，避免把英文 error.message 直接展示给用户。
 */
export async function generateImagesToPort({
  req,
  port,
  signal,
}: {
  req: ImageGenerateRequest;
  port: chrome.runtime.Port;
  signal: AbortSignal;
}) {
  /** 统一向 UI 回传图片事件。 */
  const post = (evt: ImageGenerateEvent) => port.postMessage(evt);

  try {
    const promptText = String(req.prompt || '').trim();
    const inputImages = (Array.isArray(req.inputImages) ? req.inputImages : [])
      .map((x) => String(x || '').trim())
      .filter((x) => x.startsWith('data:') || x.startsWith('http'));

    if (!promptText && inputImages.length === 0) throw new I18nError('errors.promptRequired');

    const runtime = await resolveProviderRuntimeContext({ model: req.model });
    const model = await createImageModel({
      ...runtime.runtimeConfig,
      apiKey: runtime.apiKey,
      apiHost: runtime.apiHost,
    }, runtime.modelId);
    const capability = resolveImageGenerationCapability({
      providerType: runtime.runtimeConfig.type,
      providerId: runtime.runtimeConfig.id,
      modelId: runtime.modelId,
      baseModelKey: runtime.resolvedModelMeta.baseModelKey,
      canonicalId: runtime.resolvedModelMeta.canonicalId,
    });
    const requestParams = buildImageGenerationRequestParams({
      capability,
      size: req.size,
      aspectRatio: req.aspectRatio,
      seed: req.seed,
      quality: req.quality,
      providerOptions: sanitizeProviderOptions(req.providerOptions),
    });

    const n = typeof req.n === "number" && Number.isFinite(req.n) ? Math.max(1, Math.min(10, Math.floor(req.n))) : 1;
    const maxRetries =
      typeof req.maxRetries === 'number' && Number.isFinite(req.maxRetries)
        ? Math.max(0, Math.min(10, Math.floor(req.maxRetries)))
        : undefined;

    const headers = sanitizeHeaders(req.headers);

    /** 本次图片生成返回的原始结果对象。 */
    let res: Awaited<ReturnType<typeof generateImage>> | null = null;
    try {
      res = await generateImage({
        model,
        prompt: inputImages.length > 0
          ? { images: inputImages, ...(promptText ? { text: promptText } : {}) }
          : promptText,
        n,
        maxImagesPerCall: requestParams.maxImagesPerCall,
        ...(requestParams.size ? { size: requestParams.size } : {}),
        ...(requestParams.aspectRatio ? { aspectRatio: requestParams.aspectRatio } : {}),
        ...(typeof requestParams.seed === 'number' ? { seed: requestParams.seed } : {}),
        ...(requestParams.providerOptions ? { providerOptions: requestParams.providerOptions as unknown as ProviderOptions } : {}),
        ...(maxRetries !== undefined ? { maxRetries } : {}),
        ...(headers ? { headers } : {}),
        abortSignal: signal,
      });
    } catch (e: unknown) {
      /**
       * 关键修复：
       * - 部分 OpenAI-compatible 平台忽略 response_format=b64_json；
       * - 200 成功响应只返回图片 URL，导致 AI SDK schema 校验失败并抛 APICallError（HTTP 200）。
       *
       * 这里做一次“兜底解析”：如果能从 error 里提取到 url 列表，则按成功处理并透传给 UI。
       */
      if (e instanceof Error && APICallError.isInstance(e)) {
        const status = typeof e.statusCode === 'number' ? e.statusCode : null;
        if (status === 200) {
          const body = (e as APICallError).responseBody ?? (e as APICallError).data;
          const json = typeof body === 'string'
            ? (() => { try { return JSON.parse(body); } catch { return body; } })()
            : body;
          const urls = extractOpenAiLikeImageUrls(json);
          if (urls.length > 0) {
            const images: ImageGeneratedImage[] = urls.map((u, idx) => {
              const ext = pickFileExtensionFromUrl(u);
              return { kind: 'url', url: u, mime: mimeFromExtension(ext), name: `image-${idx + 1}.${ext}` };
            });
            post({ type: 'image/result', requestId: req.requestId, images });
            post({ type: 'image/done', requestId: req.requestId });
            return;
          }
        }
      }
      throw e;
    }

    // 标准成功路径：AI SDK 已经给出 base64 图片，直接转成 data URL 供 UI 展示/落库。
    const images: ImageGeneratedImage[] = (res?.images ?? []).map((img, idx) => {
      const mime = img.mediaType || 'image/png';
      const ext = pickFileExtension(mime);
      return {
        kind: 'dataUrl',
        dataUrl: `data:${mime};base64,${img.base64}`,
        mime,
        name: `image-${idx + 1}.${ext}`,
      };
    });

    const revisedPrompt = extractRevisedPrompt(res?.providerMetadata);
    post({ type: 'image/result', requestId: req.requestId, images, ...(revisedPrompt ? { revisedPrompt } : {}) });
    post({ type: 'image/done', requestId: req.requestId });
  } catch (e: unknown) {
    // 所有异常统一降为 I18nText，避免把底层英文错误直接泄漏到界面。
    post({ type: 'image/error', requestId: req.requestId, error: toImageGenErrorText(e) });
  }
}
