/**
 * 说明：`embedding` 基础能力模块。
 *
 * 职责：
 * - 承载 `embedding` 相关的当前文件实现与模块边界；
 * - 对外暴露 `EmbeddingInputItem`、`EmbeddingGenerateOptions`、`generateEmbedding` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { getUiPort, onUiPortMessage, postUiPortMessage } from '@/extension/bridge/ui-port';
import { createId } from '@/lib/utils/id';
import { I18nError } from '@/lib/i18n/error';
import { isI18nText } from '@/lib/i18n/text';

/** 导出类型：`EmbeddingInputItem`。 */
export type EmbeddingInputItem =
  | { type: 'text'; text: string }
  | { type: 'image'; dataUrl: string }

/** 生成 embedding 的配置（由 Service Worker 侧通过在线 /embeddings 执行） */
export type EmbeddingGenerateOptions = {
  /**
   * 说明：embedding 模型标识（格式：providerId/modelId）
   * - providerId 来自「模型管理」（olyq.providers.v1）
   * - modelId 为该服务的 embeddings 模型 ID（例如 text-embedding-3-small）
   */
  model: string;
  /** 可选：是否做 L2 归一化（常用于余弦相似度检索） */
  normalize?: boolean;
};

/** generateEmbedding 的入参 */
type GenerateEmbeddingParams = {
  /** 单条逻辑输入，由文本段/图片组成。 */
  items: EmbeddingInputItem[];
  /** 向量化配置（模型/后端/归一化） */
  options: EmbeddingGenerateOptions;
  /** 超时时间（毫秒）；避免 Offscreen/模型卡死导致 UI 永久等待 */
  timeoutMs?: number;
};

/**
 * 通过 Service Worker 调用在线 Embeddings 生成向量
 * - 真实计算发生在你配置的 Provider（OpenAI/OpenAI-compatible /embeddings）
 * - 这里负责做一次 request/response 的消息封装（避免在 UI 侧直接 fetch 以统一鉴权与错误处理）
 */
export async function generateEmbedding({
  items,
  options,
  timeoutMs = 120_000,
}: GenerateEmbeddingParams): Promise<number[]> {
  const port = getUiPort();
  if (!port) throw new I18nError('errors.extensionPortUnavailable');

  const requestId = createId();

  return await new Promise<number[]>((resolve, reject) => {
    /** 标记当前请求是否已经进入终态，避免重复 resolve/reject。 */
    let done = false;
    /** 清理监听器与超时定时器；可选顺带把错误抛给调用方。 */
    const cleanup = (err?: unknown) => {
      if (done) return;
      done = true;
      off();
      window.clearTimeout(t);
      if (err) reject(err);
    };

    // UI 侧也保留一层超时，防止后台异常时 Promise 永远不结束。
    const t = window.setTimeout(() => cleanup(new I18nError('errors.embeddingTimeout')), timeoutMs);

    const off = onUiPortMessage((msg) => {
      const m = msg as { type?: unknown; requestId?: unknown; vector?: unknown; error?: unknown } | null;
      if (!m || m.requestId !== requestId) return;
      if (m.type === 'embedding/result') {
        if (!Array.isArray(m.vector)) return cleanup(new I18nError('errors.embeddingInvalidResponse'));
        cleanup();
        resolve(m.vector.map((x) => Number(x)));
      } else if (m.type === 'embedding/error') {
        if (isI18nText(m.error)) cleanup(new I18nError(m.error.key, m.error.params, { cause: m.error }));
        else cleanup(new I18nError('errors.embeddingFailed', undefined, { cause: m.error }));
      }
    });

    const ok = postUiPortMessage({
      type: 'embedding/generate',
      requestId,
      payload: { items, options },
    });
    if (!ok) cleanup(new I18nError('errors.embeddingRequestSendFailed'));
  });
}

/** generateEmbeddingsMany 的入参 */
type GenerateEmbeddingsManyParams = {
  /** 多条逻辑输入列表，每条输入由文本段/图片组成。 */
  itemsList: EmbeddingInputItem[][];
  /** 向量化配置 */
  options: EmbeddingGenerateOptions;
  /** 超时时间（毫秒） */
  timeoutMs?: number;
};

/**
 * 批量生成 embeddings（推荐用于知识库索引等高吞吐场景）。
 *
 * 说明：
 * - 与单条接口共用同一套 Port 协议，但返回 `number[][]`；
 * - 空输入数组直接快速返回空数组，不向后台发请求。
 */
export async function generateEmbeddingsMany({
  itemsList,
  options,
  timeoutMs = 120_000,
}: GenerateEmbeddingsManyParams): Promise<number[][]> {
  const port = getUiPort();
  if (!port) throw new I18nError('errors.extensionPortUnavailable');

  const requestId = createId();
  const values = Array.isArray(itemsList) ? itemsList : [];
  if (values.length === 0) return [];

  return await new Promise<number[][]>((resolve, reject) => {
    /** 标记当前请求是否已经进入终态，避免重复 resolve/reject。 */
    let done = false;
    /** 清理监听器与超时定时器；可选顺带把错误抛给调用方。 */
    const cleanup = (err?: unknown) => {
      if (done) return;
      done = true;
      off();
      window.clearTimeout(t);
      if (err) reject(err);
    };

    // UI 侧也保留一层超时，防止后台异常时 Promise 永远不结束。
    const t = window.setTimeout(() => cleanup(new I18nError('errors.embeddingTimeout')), timeoutMs);

    const off = onUiPortMessage((msg) => {
      const m = msg as { type?: unknown; requestId?: unknown; vectors?: unknown; error?: unknown } | null;
      if (!m || m.requestId !== requestId) return;
      if (m.type === 'embedding/resultMany') {
        if (!Array.isArray(m.vectors)) return cleanup(new I18nError('errors.embeddingInvalidResponse'));
        cleanup();
        resolve(
          m.vectors.map((v) => (Array.isArray(v) ? v.map((x) => Number(x)) : [])),
        );
      } else if (m.type === 'embedding/error') {
        if (isI18nText(m.error)) cleanup(new I18nError(m.error.key, m.error.params, { cause: m.error }));
        else cleanup(new I18nError('errors.embeddingFailed', undefined, { cause: m.error }));
      }
    });

    const ok = postUiPortMessage({
      type: 'embedding/generateMany',
      requestId,
      payload: { itemsList: values, options },
    });
    if (!ok) cleanup(new I18nError('errors.embeddingRequestSendFailed'));
  });
}
