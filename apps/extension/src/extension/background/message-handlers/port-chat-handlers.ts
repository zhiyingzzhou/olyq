/**
 * 说明：`port-chat-handlers` 后台运行时模块。
 *
 * 职责：
 * - 承载 `port-chat-handlers` 相关的当前文件实现与模块边界；
 * - 对外暴露 `createPortChatHandlerMap` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { ImageGenerateRequest } from "../image";
import type { ObjectGenerateRequest } from "../object-gen";
import type { SpeechRequest } from "../speech";
import type { TranscriptionRequest } from "../transcription";
import type { StreamChatEvent } from "../../../lib/ai/stream-chat";
import type { StreamChatProgressEvent } from "../../../lib/ai/stream-chat-types";
import type { ChatStreamParams } from "../../../lib/ai/types";
import type { HealthCheckRequestPayload } from "../health-check";
import { logger } from "../../../lib/logger";
import { formatErrorDetails } from "../../../lib/ai/stream-chat-errors";
import { I18nError, toI18nTextFromError } from "../../../lib/i18n/error";
import { hasInjectedMcpTools as hasInjectedMcpToolsInToolSet } from "../../../lib/mcp/toolname";
import { sanitizeMcpServerSelection } from "../../../lib/mcp/selection";
import { safePostMessage } from "../port-manager";
import { parseChatStreamMessagesPayload } from "../chat-stream-v1-payload";
import { runWithChatPipelineHeartbeat } from "../chat-pipeline-activity";
import type { ActiveRequestEntry, HandlerContext, PortMessageHandlerMap } from "./types";
import { abortTrackedPortTask, startTrackedPortTask, type PortLifecycleEntry } from "./port-lifecycle";
import {
  IS_E2E,
  buildWebSearchDebugPayload,
  loadChatRuntime,
  loadHealthRuntime,
  loadImageRuntime,
  loadMockChatRuntime,
  loadObjectRuntime,
  loadSpeechRuntime,
  loadTranscriptionRuntime,
} from "./runtime-loaders";

// 说明：这里处理所有需要“长连接、事件流和 Abort”的后台任务。
// 请求一旦进入这里，就必须能回答三个问题：
// 1. 如何找到对应的 in-flight 任务；
// 2. 什么时候向 UI 发 accepted / done / error；
// 3. 任务结束后如何清理 requestId 与 toolCallId 的映射。

/**
 * 创建 Port 消息处理器映射。
 *
 * @remarks
 * chat、image、speech、transcription、object 等长任务都通过这里统一接入，
 * 以保证 Abort、错误回传和生命周期清理遵循同一套约束。
 */
export function createPortChatHandlerMap(ctx: HandlerContext): PortMessageHandlerMap {
  const isE2E = import.meta.env.VITE_OLYQ_E2E === "1";
  const { activeChats, activeHealthChecks, activeImages, activeObjects, activeSpeeches, activeTranscriptions, toolCallToRequestId } = ctx;
  /**
   * 统一抽取请求 ID。
   *
   * @remarks
   * 所有 Port 任务都以 requestId 作为主索引，空 requestId 直接视为无效请求。
   */
  const getRequestId = (msg: Record<string, unknown>) => String(msg.requestId || "");
  /**
   * 从消息中提取对象形态的 payload。
   *
   * @remarks
   * 这里故意把非对象 payload 清空，避免后续 handler 到处写数组/原始值防御代码。
   */
  const getPayload = (msg: Record<string, unknown>): Record<string, unknown> =>
    msg.payload && typeof msg.payload === "object" && !Array.isArray(msg.payload) ? (msg.payload as Record<string, unknown>) : {};
  /**
   * 终止某类 in-flight 任务。
   *
   * @remarks
   * 这里只负责触发 `AbortController`，真正的 map 清理由各任务自己的 finally 完成，
   * 这样不会和异步收尾逻辑互相踩踏。
   */
  const abortActive = <TEntry extends PortLifecycleEntry>(active: Map<string, TEntry>, requestId: string) => {
    abortTrackedPortTask(active, requestId);
  };

    /**
   * 内部函数：`handleHealthAbort`。
   *
   * @remarks
   * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
   */
  function handleHealthAbort(_port: chrome.runtime.Port, msg: Record<string, unknown>): void {
    abortActive(activeHealthChecks, getRequestId(msg));
  }

    /**
   * 内部函数：`handleHealthCheck`。
   *
   * @remarks
   * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
   */
  function handleHealthCheck(port: chrome.runtime.Port, msg: Record<string, unknown>): void {
    const requestId = getRequestId(msg);
    if (!requestId) return;

    const payload = getPayload(msg) as HealthCheckRequestPayload;
    startTrackedPortTask({
      active: activeHealthChecks,
      requestId,
      port,
      run: async ({ controller }) => {
        const { runHealthCheckToPort } = await loadHealthRuntime();
        await runHealthCheckToPort({ requestId, payload, port, signal: controller.signal });
      },
      onError: (e) => {
        safePostMessage(port, {
          type: "health/error",
          requestId,
          error: toI18nTextFromError(e),
        });
      },
    });
  }

    /**
   * 内部函数：`handleChatAbort`。
   *
   * @remarks
   * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
   */
  function handleChatAbort(_port: chrome.runtime.Port, msg: Record<string, unknown>): void {
    abortActive(activeChats, getRequestId(msg));
  }

    /**
   * 内部函数：`handleChatToolAbort`。
   *
   * @remarks
   * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
   */
  function handleChatToolAbort(_port: chrome.runtime.Port, msg: Record<string, unknown>): void {
    const toolCallId = typeof msg.toolCallId === "string" ? msg.toolCallId : "";
    if (!toolCallId) return;
    const requestId = toolCallToRequestId.get(toolCallId);
    if (!requestId) return;
    const cur = activeChats.get(requestId);
    if (cur) cur.controller.abort();
  }

    /**
   * 内部函数：`handleChatStreamV1`。
   *
   * @remarks
   * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
   */
  function handleChatStreamV1(port: chrome.runtime.Port, msg: Record<string, unknown>): void {
    const requestId = getRequestId(msg);
    if (!requestId) return;
    if (isE2E) {
      logger.sw.debug("E2E handleChatStreamV1", { requestId });
    }

    const payload = getPayload(msg);
    let messages: ChatStreamParams["messages"];
    try {
      messages = parseChatStreamMessagesPayload(payload.messages);
    } catch (e: unknown) {
      // 说明：消息载荷一旦无法解析，就不要再进入模型层。
      // 这里直接发 error + done，保证 UI 状态机能完整收尾。
      const errorI18n = toI18nTextFromError(e);
      safePostMessage(port, {
        type: "chat/error",
        requestId,
        error: errorI18n,
        details: formatErrorDetails(e, { messageI18n: errorI18n }),
      });
      safePostMessage(port, { type: "chat/done", requestId });
      return;
    }

    /**
     * 在数字参数非法时回退到默认值。
     *
     * @remarks
     * 这里只处理有限数，`NaN/Infinity/string` 一律视为无效输入。
     */
    const pickFiniteOr = (value: unknown, fallback: number) =>
      typeof value === "number" && Number.isFinite(value) ? value : fallback;

    const params: ChatStreamParams = {
      model: typeof payload.model === "string" ? payload.model : "",
      messages,
      temperature: pickFiniteOr(payload.temperature, 0.7),
      topP: pickFiniteOr(payload.topP, 0.9),
      maxTokens: pickFiniteOr(payload.maxTokens, 2048),
      modelParams:
        payload.modelParams && typeof payload.modelParams === "object" && !Array.isArray(payload.modelParams)
          ? (payload.modelParams as Record<string, unknown>)
          : undefined,
      debug: Boolean(payload.debug),
      mcpSelection: sanitizeMcpServerSelection(payload.mcpSelection, "auto"),
      topicKind: payload.topicKind === "topic" ? "topic" : undefined,
      enableGenerateImage: Boolean(payload.enableGenerateImage),
      enableWebSearch: Boolean(payload.enableWebSearch),
      webSearchProviderId: typeof payload.webSearchProviderId === "string" ? payload.webSearchProviderId : undefined,
      webSearchSettings:
        payload.webSearchSettings && typeof payload.webSearchSettings === "object" && !Array.isArray(payload.webSearchSettings)
          ? (payload.webSearchSettings as ChatStreamParams["webSearchSettings"])
          : undefined,
      memory:
        payload.memory && typeof payload.memory === "object" && !Array.isArray(payload.memory)
          ? (payload.memory as ChatStreamParams["memory"])
          : undefined,
    };

    startTrackedPortTask<ActiveRequestEntry>({
      active: activeChats,
      requestId,
      port,
      createEntry: ({ controller, port: entryPort }) => ({ controller, port: entryPort, toolCallIds: new Set() }),
      onReplace: (entry) => {
        // 说明：同一个 requestId 只能存在一个活动聊天流。
        // 新请求进来时先终止旧流，并清理旧流已经登记的 toolCall 反向索引。
        for (const toolCallId of entry.toolCallIds) toolCallToRequestId.delete(toolCallId);
      },
      run: async ({ controller }) => {
        /**
         * 判断当前异步链路是否仍然对应最新的活动请求。
         *
         * @remarks
         * 聊天流中间会经历工具调用、外部检索和模型输出；一旦请求被用户取消或重发，
         * 后续任何异步回调都必须在发送事件前先过这一层检查。
         */
        const isStillActive = () => activeChats.get(requestId)?.controller === controller;
        const chatRuntime = IS_E2E ? null : await loadChatRuntime();
        let assistantText = "";

        /**
         * 向 UI 转发流式事件，并在本地维护额外的 bookkeeping。
         *
         * @remarks
         * 这里除了转发事件，还负责：
         * - 累积 assistant 文本，供记忆后处理复用；
         * - 登记 toolCallId 到 requestId 的映射，支持单独终止工具调用；
         * - 丢弃已经过期的异步事件。
         */
        const emit = (event: StreamChatEvent) => {
          if (isE2E) {
            logger.sw.debug("E2E emit", {
              type: event?.type,
              requestId,
            });
          }
          if (!isStillActive()) return;

          if (event?.type === "chat/delta" && typeof event.delta === "string" && event.delta) {
            assistantText += event.delta;
          }
          if (event?.type === "chat/tool-call") {
            const toolCallId = String(event.toolCallId || "");
            if (toolCallId) {
              toolCallToRequestId.set(toolCallId, requestId);
              activeChats.get(requestId)?.toolCallIds.add(toolCallId);
            }
          }
          safePostMessage(port, event);
        };
        /**
         * 后台 pipeline 的内部 activity 出口。
         *
         * 说明：这里统一补上 requestId 后仍走既有 `chat/progress` 事件，
         * 只用于 UI watchdog 判断链路仍然活跃，不触发可见输出回调。
         */
        const emitProgress = (event: Omit<StreamChatProgressEvent, 'requestId'>) => {
          emit({ ...event, requestId });
        };

        if (params.debug && (params.webSearchProviderId || params.enableWebSearch)) {
          const webSearch = params.webSearchProviderId ? buildWebSearchDebugPayload(params) : undefined;
          emit({
            type: "chat/debug",
            requestId,
            kind: "websearch/ingress",
            payload: {
              model: params.model,
              enableWebSearch: params.enableWebSearch,
              webSearchProviderId: params.webSearchProviderId,
              webSearch,
            },
          });
        }

        if (IS_E2E) {
          // 说明：E2E 模式显式走 mock runtime，避免测试依赖真实 provider、网络和外部权限。
          const { mockStreamChatV1 } = await loadMockChatRuntime();
          await mockStreamChatV1(requestId, params, emit, controller.signal);
          return;
        }

        const {
          collectChatTools,
          getDefaultModelId,
          maybeOrchestrateExternalWebSearch,
          maybeProcessConversationMemory,
          streamChatV1,
        } = chatRuntime!;

        if (!params.model) params.model = await getDefaultModelId();

        // 说明：外部网页检索会在真正进模型前改写 messages，
        // 因此要在收集工具之前执行，避免工具注入基于旧上下文做判断。
        const externalWebSearch = await maybeOrchestrateExternalWebSearch({
          requestId,
          params,
          emit,
          emitProgress,
          signal: controller.signal,
        }).catch((): { messages?: ChatStreamParams["messages"] } => ({}));
        if (externalWebSearch?.messages && Array.isArray(externalWebSearch.messages)) {
          params.messages = externalWebSearch.messages;
        }

        const tools = await runWithChatPipelineHeartbeat(
          { requestId, signal: controller.signal, emitProgress },
          'tool-collection',
          () => collectChatTools({
            requestId,
            params,
            signal: controller.signal,
            emitProgress,
          }),
        );
        const hasInjectedMcpTools = hasInjectedMcpToolsInToolSet(tools);
        const autoRouterRequiresMcp = Boolean(params.mcpAutoRouterState?.evaluated && params.mcpAutoRouterState.needsMcp);
        if (autoRouterRequiresMcp && (!hasInjectedMcpTools || !params.forcedFirstToolName)) {
          throw new I18nError('errors.mcpForcedToolUnavailable', {
            tool: params.forcedFirstToolName || 'mcp-auto-router',
          });
        }
        if (params.debug) {
          const webSearch = params.webSearchProviderId ? buildWebSearchDebugPayload(params) : undefined;
          emit({
            type: "chat/debug",
            requestId,
            kind: "tool-injection",
            payload: {
              model: params.model,
              enableWebSearch: params.enableWebSearch,
              webSearchProviderId: params.webSearchProviderId,
              webSearch,
              memory: params.memory
                ? {
                    enabled: Boolean(params.memory.enabled),
                    assistantId: params.memory.assistantId,
                    embeddingModel: params.memory.embeddingModel,
                    llmModel: params.memory.llmModel,
                    topK: params.memory.topK,
                  }
                : undefined,
              injectedTools: tools ? Object.keys(tools) : [],
              hasInjectedMcpTools,
              mcpAutoRouter: params.mcpAutoRouterState,
              forcedFirstToolName: params.forcedFirstToolName,
            },
          });
        }

        await streamChatV1({ requestId, params, onEvent: emit, signal: controller.signal, tools });
        if (!isStillActive()) return;

        // 说明：会话记忆后处理不应阻塞主聊天 done 链路，所以这里 fire-and-forget，
        // 但仍保留日志，方便定位 embedding/summary 的延迟失败。
        void maybeProcessConversationMemory({
          requestId,
          params,
          emit,
          signal: controller.signal,
          assistantText,
        }).catch((e) => logger.memory.error("post-stream memory processing failed", e, { requestId }));
      },
      onError: (e, { controller }) => {
        if (activeChats.get(requestId)?.controller !== controller) return;
        const errorI18n = toI18nTextFromError(e);
        safePostMessage(port, {
          type: "chat/error",
          requestId,
          error: errorI18n,
          details: formatErrorDetails(e, { messageI18n: errorI18n }),
        });
        safePostMessage(port, { type: "chat/done", requestId });
      },
      onFinally: (cur) => {
        // 说明：只有持有当前 controller 的实例才有权清理映射，
        // 避免“旧请求 finally 晚到”把新请求的活动状态删掉。
        for (const toolCallId of cur.toolCallIds) toolCallToRequestId.delete(toolCallId);
      },
    });
    // 说明：先登记任务，再发送 accepted，UI 才知道这个 requestId 已经被后台正式接管，
    // 即使后面的动态加载或模型调用失败，也不会卡在“等待是否已发出请求”的中间态。
    safePostMessage(port, { type: 'chat/accepted', requestId });
    if (isE2E) {
      logger.sw.debug("E2E chatAccepted", { requestId });
    }
  }

    /**
   * 内部函数：`handleImageGenerate`。
   *
   * @remarks
   * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
   */
  function handleImageGenerate(port: chrome.runtime.Port, msg: Record<string, unknown>): void {
    const requestId = getRequestId(msg);
    if (!requestId) return;
    const payload = getPayload(msg);
    const rawInputImages = (payload as { inputImages?: unknown }).inputImages;
    const inputImages = Array.isArray(rawInputImages)
      ? rawInputImages.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean)
      : undefined;
    const req: ImageGenerateRequest = {
      requestId,
      model: typeof payload.model === "string" ? payload.model : "",
      prompt: typeof payload.prompt === "string" ? payload.prompt : "",
      inputImages,
      n: typeof payload.n === "number" ? payload.n : undefined,
      maxImagesPerCall: typeof payload.maxImagesPerCall === "number" ? payload.maxImagesPerCall : undefined,
      maxRetries: typeof payload.maxRetries === "number" ? payload.maxRetries : undefined,
      size: typeof payload.size === "string" ? payload.size : undefined,
      aspectRatio: typeof payload.aspectRatio === "string" ? payload.aspectRatio : undefined,
      seed: typeof payload.seed === "number" ? payload.seed : undefined,
      quality: typeof payload.quality === "string" ? payload.quality : undefined,
      providerOptions: (payload as { providerOptions?: unknown }).providerOptions,
      headers: (payload as { headers?: unknown }).headers,
    };

    startTrackedPortTask<ActiveRequestEntry>({
      active: activeImages,
      requestId,
      port,
      createEntry: ({ controller, port: entryPort }) => ({ controller, port: entryPort, toolCallIds: new Set() }),
      run: async ({ controller }) => {
        const { generateImagesToPort } = await loadImageRuntime();
        await generateImagesToPort({ req, port, signal: controller.signal });
      },
      onError: (e) => {
        safePostMessage(port, { type: "image/error", requestId, error: toI18nTextFromError(e) });
      },
    });
  }

    /**
   * 内部函数：`handleImageAbort`。
   *
   * @remarks
   * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
   */
  function handleImageAbort(_port: chrome.runtime.Port, msg: Record<string, unknown>): void {
    abortActive(activeImages, getRequestId(msg));
  }

    /**
   * 内部函数：`handleTranscriptionGenerate`。
   *
   * @remarks
   * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
   */
  function handleTranscriptionGenerate(port: chrome.runtime.Port, msg: Record<string, unknown>): void {
    const requestId = getRequestId(msg);
    if (!requestId) return;
    const payload = getPayload(msg);
    const req: TranscriptionRequest = {
      requestId,
      model: typeof payload.model === "string" ? payload.model : "",
      attachmentId: typeof payload.attachmentId === "string" ? payload.attachmentId : "",
      providerOptions: (payload as { providerOptions?: unknown }).providerOptions,
      headers: (payload as { headers?: unknown }).headers,
      maxRetries: typeof payload.maxRetries === "number" ? payload.maxRetries : undefined,
    };

    startTrackedPortTask<ActiveRequestEntry>({
      active: activeTranscriptions,
      requestId,
      port,
      createEntry: ({ controller, port: entryPort }) => ({ controller, port: entryPort, toolCallIds: new Set() }),
      run: async ({ controller }) => {
        const { transcribeToPort } = await loadTranscriptionRuntime();
        await transcribeToPort({ req, port, signal: controller.signal });
      },
      onError: (e) => {
        safePostMessage(port, { type: "transcription/error", requestId, error: toI18nTextFromError(e) });
      },
    });
  }

    /**
   * 内部函数：`handleTranscriptionAbort`。
   *
   * @remarks
   * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
   */
  function handleTranscriptionAbort(_port: chrome.runtime.Port, msg: Record<string, unknown>): void {
    abortActive(activeTranscriptions, getRequestId(msg));
  }

    /**
   * 内部函数：`handleSpeechGenerate`。
   *
   * @remarks
   * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
   */
  function handleSpeechGenerate(port: chrome.runtime.Port, msg: Record<string, unknown>): void {
    const requestId = getRequestId(msg);
    if (!requestId) return;
    const payload = getPayload(msg);
    const req: SpeechRequest = {
      requestId,
      model: typeof payload.model === "string" ? payload.model : "",
      text: typeof payload.text === "string" ? payload.text : "",
      voice: typeof payload.voice === "string" ? payload.voice : undefined,
      outputFormat: typeof payload.outputFormat === "string" ? payload.outputFormat : undefined,
      instructions: typeof payload.instructions === "string" ? payload.instructions : undefined,
      speed: typeof payload.speed === "number" ? payload.speed : undefined,
      language: typeof payload.language === "string" ? payload.language : undefined,
      providerOptions: (payload as { providerOptions?: unknown }).providerOptions,
      headers: (payload as { headers?: unknown }).headers,
      maxRetries: typeof payload.maxRetries === "number" ? payload.maxRetries : undefined,
    };

    startTrackedPortTask<ActiveRequestEntry>({
      active: activeSpeeches,
      requestId,
      port,
      createEntry: ({ controller, port: entryPort }) => ({ controller, port: entryPort, toolCallIds: new Set() }),
      run: async ({ controller }) => {
        const { speakToPort } = await loadSpeechRuntime();
        await speakToPort({ req, port, signal: controller.signal });
      },
      onError: (e) => {
        safePostMessage(port, { type: "speech/error", requestId, error: toI18nTextFromError(e) });
      },
    });
  }

    /**
   * 内部函数：`handleSpeechAbort`。
   *
   * @remarks
   * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
   */
  function handleSpeechAbort(_port: chrome.runtime.Port, msg: Record<string, unknown>): void {
    abortActive(activeSpeeches, getRequestId(msg));
  }

    /**
   * 内部函数：`handleObjectGenerate`。
   *
   * @remarks
   * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
   */
  function handleObjectGenerate(port: chrome.runtime.Port, msg: Record<string, unknown>): void {
    const requestId = getRequestId(msg);
    if (!requestId) return;
    const payload = getPayload(msg);
    const req: ObjectGenerateRequest = {
      requestId,
      taskId: String(payload.taskId || "") as ObjectGenerateRequest["taskId"],
      model: typeof payload.model === "string" ? payload.model : "",
      input: (payload as { input?: unknown }).input,
      timeoutMs: typeof payload.timeoutMs === "number" ? payload.timeoutMs : undefined,
    };

    startTrackedPortTask<ActiveRequestEntry>({
      active: activeObjects,
      requestId,
      port,
      createEntry: ({ controller, port: entryPort }) => ({ controller, port: entryPort, toolCallIds: new Set() }),
      run: async ({ controller }) => {
        const { generateObjectToPort } = await loadObjectRuntime();
        await generateObjectToPort({ req, port, signal: controller.signal });
      },
      onError: (e) => {
        safePostMessage(port, { type: "object/error", requestId, error: toI18nTextFromError(e) });
      },
    });
  }

    /**
   * 内部函数：`handleObjectStream`。
   *
   * @remarks
   * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
   */
  function handleObjectStream(port: chrome.runtime.Port, msg: Record<string, unknown>): void {
    const requestId = getRequestId(msg);
    if (!requestId) return;
    const payload = getPayload(msg);
    const req: ObjectGenerateRequest = {
      requestId,
      taskId: String(payload.taskId || "") as ObjectGenerateRequest["taskId"],
      model: typeof payload.model === "string" ? payload.model : "",
      input: (payload as { input?: unknown }).input,
      timeoutMs: typeof payload.timeoutMs === "number" ? payload.timeoutMs : undefined,
    };

    startTrackedPortTask<ActiveRequestEntry>({
      active: activeObjects,
      requestId,
      port,
      createEntry: ({ controller, port: entryPort }) => ({ controller, port: entryPort, toolCallIds: new Set() }),
      run: async ({ controller }) => {
        const { streamObjectToPort } = await loadObjectRuntime();
        await streamObjectToPort({ req, port, signal: controller.signal });
      },
      onError: (e) => {
        safePostMessage(port, { type: "object/error", requestId, error: toI18nTextFromError(e) });
      },
    });
  }

    /**
   * 内部函数：`handleObjectAbort`。
   *
   * @remarks
   * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
   */
  function handleObjectAbort(_port: chrome.runtime.Port, msg: Record<string, unknown>): void {
    abortActive(activeObjects, getRequestId(msg));
  }

  // 说明：这里返回静态映射而不是在别处拼装，是为了让 message type 的可见边界保持集中。
  return {
    "health/abort": handleHealthAbort,
    "health/check": handleHealthCheck,
    "chat/abort": handleChatAbort,
    "chat/tool-abort": handleChatToolAbort,
    "chat/stream-v1": handleChatStreamV1,
    "image/generate": handleImageGenerate,
    "image/abort": handleImageAbort,
    "transcription/generate": handleTranscriptionGenerate,
    "transcription/abort": handleTranscriptionAbort,
    "speech/generate": handleSpeechGenerate,
    "speech/abort": handleSpeechAbort,
    "object/generate": handleObjectGenerate,
    "object/stream": handleObjectStream,
    "object/abort": handleObjectAbort,
  };
}
