/**
 * 说明：`embedding-handler` 后台运行时模块。
 *
 * 职责：
 * - 承载 `embedding-handler` 相关的当前文件实现与模块边界；
 * - 对外暴露 `l2NormalizeVector`、`parseEmbeddingOptions`、`handleEmbeddingGenerate` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 向量嵌入处理器— 向量嵌入生成
 *
 * 负责：
 * - 通过在线 embedding 执行器生成单条/批量向量嵌入
 * - L2 归一化
 * - 请求参数解析与校验
 */

import { resolveEmbeddingExecutor } from "../../lib/ai/embedding-executor";
import { toUserFacingAiErrorText } from "../../lib/ai/utils/api-errors";
import type { I18nText } from "../../types/i18n";
import type { EmbeddingInputItem } from "../../lib/embedding";
import { i18nText } from "../../lib/i18n/text";
import { isRecord } from "../../lib/utils/type-guards";
import { safePostMessage } from "./port-manager";

/**
 * 对向量做 L2 归一化。
 *
 * 说明：
 * - 归一化后更适合做余弦相似度检索；
 * - 空向量会原样返回，避免产生除零问题。
 */
export function l2NormalizeVector(vec: number[]): number[] {
  if (vec.length === 0) return vec;
  let s = 0;
  for (let i = 0; i < vec.length; i += 1) {
    const x = Number(vec[i]);
    s += x * x;
  }
  const n = Math.sqrt(s) || 1;
  return vec.map((x) => Number(x) / n);
}

/** 解析 embedding 请求的 options。 */
export function parseEmbeddingOptions(options: unknown): { model: string; normalize: boolean } {
  const raw = typeof options === "object" && options ? (options as Record<string, unknown>) : {};
  const model = typeof raw.model === "string" ? raw.model.trim() : "";
  const normalize = typeof raw.normalize === "boolean" ? raw.normalize : true;
  return { model, normalize };
}

/**
 * 内部函数：`parseEmbeddingItems`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function parseEmbeddingItems(raw: unknown): EmbeddingInputItem[] {
  return Array.isArray(raw) ? raw as EmbeddingInputItem[] : [];
}

/**
 * 将未知异常归一为可序列化的 I18nText（用于跨上下文：SW → UI）。
 *
 * 说明：
 * - embedding 属于明确场景；若遇到未知错误，优先落到 embeddingFailed，而不是 errors.unknown。
 * - AbortError 统一映射为 cancelled，避免把 "Aborted" 之类的英文细节直接展示给用户。
 */
function toEmbeddingErrorText(e: unknown): I18nText {
  const name = isRecord(e) ? e["name"] : null;
  if (name === "AbortError") return i18nText("errors.cancelled");

  const t = toUserFacingAiErrorText(e);
  if (t.key === "errors.unknown") return i18nText("errors.embeddingFailed");
  if (t.key === "errors.unknownWithDetail") {
    const detail = typeof t.params?.detail === "string" ? t.params.detail.trim() : "";
    return detail
      ? i18nText("errors.embeddingFailedWithDetail", { detail })
      : i18nText("errors.embeddingFailed");
  }
  return t;
}

/**
 * 处理单条 `embedding/generate` 消息。
 *
 * 说明：
 * - 输入为空或 requestId 缺失时直接忽略；
 * - 返回事件统一走 `embedding/result` / `embedding/error`。
 */
export function handleEmbeddingGenerate(port: chrome.runtime.Port, msg: Record<string, unknown>): void {
  const requestId = String(msg.requestId || "");
  const payload = (msg.payload ?? {}) as Record<string, unknown>;
  const items = parseEmbeddingItems(payload.items);
  if (!requestId || items.length === 0) return;

  const { model, normalize } = parseEmbeddingOptions(payload.options);
  if (!model) {
    safePostMessage(port, {
      type: "embedding/error",
      requestId,
      error: i18nText("errors.embeddingModelRequired"),
    });
    return;
  }

  void (async () => {
    try {
      const executor = await resolveEmbeddingExecutor({ model });
      const vector = await executor.execute(items);
      safePostMessage(port, {
        type: "embedding/result",
        requestId,
        vector: normalize ? l2NormalizeVector(vector) : vector,
      });
    } catch (e: unknown) {
      safePostMessage(port, { type: "embedding/error", requestId, error: toEmbeddingErrorText(e) });
    }
  })();
}

/**
 * 处理批量 `embedding/generateMany` 消息。
 *
 * 说明：
 * - 批量路径优先复用 provider 原生批处理能力；
 * - 返回事件统一走 `embedding/resultMany` / `embedding/error`。
 */
export function handleEmbeddingGenerateMany(port: chrome.runtime.Port, msg: Record<string, unknown>): void {
  const requestId = String(msg.requestId || "");
  const payload = (msg.payload ?? {}) as Record<string, unknown>;
  const itemsList = Array.isArray(payload.itemsList) ? payload.itemsList as EmbeddingInputItem[][] : [];
  if (!requestId || itemsList.length === 0) return;

  const { model, normalize } = parseEmbeddingOptions(payload.options);
  if (!model) {
    safePostMessage(port, {
      type: "embedding/error",
      requestId,
      error: i18nText("errors.embeddingModelRequired"),
    });
    return;
  }

  void (async () => {
    try {
      const executor = await resolveEmbeddingExecutor({ model });
      const vectors = await executor.executeMany(itemsList);
      safePostMessage(port, {
        type: "embedding/resultMany",
        requestId,
        vectors: normalize ? vectors.map(l2NormalizeVector) : vectors,
      });
    } catch (e: unknown) {
      safePostMessage(port, { type: "embedding/error", requestId, error: toEmbeddingErrorText(e) });
    }
  })();
}
