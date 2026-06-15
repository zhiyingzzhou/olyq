/**
 * 说明：`port-task-handlers` 后台运行时模块。
 *
 * 职责：
 * - 承载 `port-task-handlers` 相关的当前文件实现与模块边界；
 * - 对外暴露 `createPortTaskHandlerMap` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { ensureOffscreenDocument } from "../offscreen-manager";
import { safePostMessage } from "../port-manager";
import { toI18nTextFromError } from "../../../lib/i18n/error";
import type { HandlerContext, PortMessageHandlerMap } from "./types";
import { loadEmbeddingRuntime } from "./runtime-loaders";
import { normalizeSwKeepAliveConfig } from "@/lib/extension/sw-keepalive-config";

/**
 * 导出函数：`createPortTaskHandlerMap`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function createPortTaskHandlerMap(ctx: HandlerContext): PortMessageHandlerMap {
  const { getActiveTabId, pushBrowserContextMetadataForTab, getSwStatus, applyKeepAliveConfig } = ctx;

    /**
   * 内部函数：`handleOffscreenEnsure`。
   *
   * @remarks
   * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
   */
  function handleOffscreenEnsure(): void {
    void ensureOffscreenDocument();
  }

    /**
   * 内部函数：`handleBrowserContextMetadataRequest`。
   *
   * @remarks
   * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
   */
  function handleBrowserContextMetadataRequest(_port: chrome.runtime.Port, msg: Record<string, unknown>): void {
    const payload = msg.payload && typeof msg.payload === 'object' ? msg.payload as Record<string, unknown> : null;
    const requestedTabId = typeof payload?.tabId === 'number' && Number.isFinite(payload.tabId)
      ? Math.trunc(payload.tabId)
      : null;
    const tabIdPromise = requestedTabId && requestedTabId > 0 ? Promise.resolve(requestedTabId) : getActiveTabId();
    void tabIdPromise.then((tabId) => {
      if (tabId) void pushBrowserContextMetadataForTab(tabId);
    });
  }

    /**
   * 内部函数：`handleSwStatusGet`。
   *
   * @remarks
   * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
   */
  function handleSwStatusGet(port: chrome.runtime.Port, msg: Record<string, unknown>): void {
    const requestId = String(msg.requestId || "");
    if (!requestId) return;
    void getSwStatus()
      .then((payload) => {
        safePostMessage(port, { type: "sw/status", requestId, payload });
      })
      .catch((e: unknown) => {
        safePostMessage(port, {
          type: "sw/status",
          requestId,
          payload: { error: e instanceof Error ? e.message : String(e) },
        });
      });
  }

    /**
   * 内部函数：`handleSwKeepaliveSet`。
   *
   * @remarks
   * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
   */
  function handleSwKeepaliveSet(port: chrome.runtime.Port, msg: Record<string, unknown>): void {
    const payload = normalizeSwKeepAliveConfig(msg.payload);
    void applyKeepAliveConfig(payload)
      .then(() => {
        safePostMessage(port, {
          type: "sw/keepalive/ack",
          requestId: String(msg.requestId || ""),
          payload: { ok: true },
        });
      })
      .catch((e: unknown) => {
        safePostMessage(port, {
          type: "sw/keepalive/ack",
          requestId: String(msg.requestId || ""),
          payload: { ok: false, error: toI18nTextFromError(e) },
        });
      });
  }

  return {
    "offscreen/ensure": handleOffscreenEnsure,
    "browser-context/metadata/request": handleBrowserContextMetadataRequest,
    "embedding/generate": (port, msg) => {
      void loadEmbeddingRuntime()
        .then(({ handleEmbeddingGenerate }) => handleEmbeddingGenerate(port, msg))
        .catch((e: unknown) => {
          safePostMessage(port, {
            type: "embedding/error",
            requestId: String(msg.requestId || ""),
            error: toI18nTextFromError(e),
          });
        });
    },
    "embedding/generateMany": (port, msg) => {
      void loadEmbeddingRuntime()
        .then(({ handleEmbeddingGenerateMany }) => handleEmbeddingGenerateMany(port, msg))
        .catch((e: unknown) => {
          safePostMessage(port, {
            type: "embedding/error",
            requestId: String(msg.requestId || ""),
            error: toI18nTextFromError(e),
          });
        });
    },
    "sw/status/get": handleSwStatusGet,
    "sw/keepalive/set": handleSwKeepaliveSet,
  };
}
