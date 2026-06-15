/**
 * 说明：`chat-stream` 基础能力模块。
 *
 * 职责：
 * - 承载 `chat-stream` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ApiAttachment`、`ApiImageAttachment`、`ApiFileAttachment`、`Msg`、`ChatUsage` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { ensureUiPortReady, onUiPortMessage, postUiPortMessage } from "@/extension/bridge/ui-port";
import { useChatSettingsStore } from '@/hooks/useChatSettingsStore';
import { createId } from "@/lib/utils/id";
import type { WebSearchSettings } from "@/lib/web-search/types";
import type { ChatMemoryParams } from "@/lib/memory/types";
import type { McpServerSelection } from '@/lib/mcp/selection';
import { isPlainRecord } from '@/lib/utils/type-guards';
import { isI18nText, normalizeI18nText } from '@/lib/i18n/text';
import type {
  ChatStreamWireAttachment,
  ChatStreamWireFileAttachment,
  ChatStreamWireImageAttachment,
  ChatStreamWireMessage,
} from '@/lib/chat-stream-protocol';
import type { I18nText } from '@/types/i18n';
import type { WebSearchResult } from '@/types/chat';
import { emitDeveloperDebugEvent } from '@/lib/developer/debug-events';
import { logger } from '@/lib/logger';

/** 当前是否处于 E2E 模式；开启后会输出更多调试日志。 */
const IS_E2E = import.meta.env.VITE_OLYQ_E2E === "1";
const CHAT_ACCEPT_TIMEOUT_MS = 3_000;
const CHAT_FIRST_EVENT_TIMEOUT_MS = 15_000;
const CHAT_IDLE_TIMEOUT_MS = 45_000;

/** UI → Service Worker：图片附件（统一走 `url` 字段，值可为 data URL）。 */
export type ApiImageAttachment = ChatStreamWireImageAttachment;
/** UI → Service Worker：文件附件（统一走 `dataUrl` 字段，值必须为本地 data URL）。 */
export type ApiFileAttachment = ChatStreamWireFileAttachment;
/** UI → Service Worker：附件联合类型。 */
export type ApiAttachment = ChatStreamWireAttachment;

/** UI → Service Worker：对话消息（轻量协议，用于后台发起模型请求）。 */
export type Msg = ChatStreamWireMessage;

/** AI SDK 返回的用量信息 */
export type ChatUsage = {
  /** 输入 tokens（prompt + 上下文） */
  inputTokens: number;
  /** 输出 tokens（生成内容） */
  outputTokens: number;
};

/** Service Worker → UI：错误详情（用于"详情"弹窗；字段均为可序列化字符串） */
export type ChatErrorDetails = {
  /** 错误类型名。 */
  name?: string;
  /** 面向用户的国际化错误文案。 */
  messageI18n?: I18nText;
  /** 错误主消息。 */
  message?: string;
  /** 栈信息。 */
  stack?: string;
  /** 原始 cause 的字符串化结果。 */
  cause?: string;
};

/** 从 Service Worker 转发的工具调用事件 */
export type ToolCallEvent = {
  /** 工具调用 ID：用于关联后续 tool-result */
  toolCallId: string;
  /** 工具名称（通常为 MCP tool name） */
  toolName: string;
  /** 工具入参（结构取决于 inputSchema） */
  args: unknown;
};
/** 从 Service Worker 转发的工具调用结果事件 */
export type ToolResultEvent = {
  /** 工具调用 ID */
  toolCallId: string;
  /** 工具名称 */
  toolName: string;
  /** 工具输出（原样回传） */
  result: unknown;
};

/** 从 Service Worker 转发的工具调用错误事件 */
export type ToolErrorEvent = {
  /** 工具调用 ID */
  toolCallId: string;
  /** 工具名称 */
  toolName: string;
  /** 工具入参（结构取决于 inputSchema） */
  args: unknown;
  /** 错误信息（可展示给用户）。跨运行时只保存 i18n key，不提前格式化。 */
  error: I18nText;
};

/** 从 Service Worker 转发的模型来源引用事件。 */
export type SourceEvent = {
  /** 可展示的来源引用。 */
  source: WebSearchResult;
};

/** 模型在聊天流中返回的文件事件。 */
export type StreamChatFileEvent =
  | {
      /** 以内联 base64 形式返回的文件。 */
      kind: 'base64';
      /** 文件内容的 base64 数据。 */
      data: string;
      /** 文件 MIME 类型。 */
      mediaType: string;
    }
  | {
      /** 以远端 URL 形式返回的文件。 */
      kind: 'url';
      /** 可直接下载或展示的远端地址。 */
      url: string;
      /** 可选：文件 MIME 类型。 */
      mediaType?: string;
      /** 可选：文件名。 */
      name?: string;
    };

/** streamChat 的参数与回调（UI 侧使用） */
export interface StreamChatOptions {
  /** 可选：显式指定请求 ID，便于和上层事务/调试事件保持同一个链路标识。 */
  requestId?: string;
  /** 消息列表（UI 侧会按上下文长度裁剪） */
  messages: Msg[];
  /** 模型标识："providerId/modelId" */
  model: string;
  /** 温度采样 */
  temperature: number;
  /** Top-p 采样 */
  topP: number;
  /** 最大输出 tokens */
  maxTokens: number;
  /** 模型参数（通用 JSON 透传；由后台按 provider/type 做“尽力而为”处理） */
  modelParams?: Record<string, unknown>;
  /** 文本增量回调（用于拼接 assistant 回复） */
  onDelta: (text: string) => void;
  /** 推理增量回调（用于展示 reasoning 内容） */
  onReasoning?: (text: string) => void;
  /** 工具调用回调（用于展示"正在调用工具"） */
  onToolCall?: (event: ToolCallEvent) => void;
  /** 工具结果回调（用于展示工具输出/调试） */
  onToolResult?: (event: ToolResultEvent) => void;
  /** 工具错误回调（用于展示工具执行失败/审批超时等） */
  onToolError?: (event: ToolErrorEvent) => void;
  /** 来源引用回调（用于展示 provider-native citations/sources） */
  onSource?: (event: SourceEvent) => void;
  /** 文件/图片回调（模型内联返回的图片，如 Gemini 生图） */
  onFile?: (event: StreamChatFileEvent) => void;
  /** 可选：调试事件回调（透传 AI SDK 的原始元数据/响应体等） */
  onDebug?: (event: { requestId: string; kind: string; payload: unknown }) => void;
  /** 远端成功完成回调（仅 `chat/done` 触发） */
  onDone: (usage?: ChatUsage) => void;
  /** 本地用户取消回调（仅本地 abort 触发） */
  onAbort?: () => void;
  /** 错误回调（可展示给用户）。调用方在 UI 层按当前语言渲染。 */
  onError: (err: I18nText, details?: ChatErrorDetails) => void;
  /** 可选：取消信号（用户停止生成时触发） */
  signal?: AbortSignal;
  /** 可选：开启调试透传（会额外回传 chat/debug 事件，可能包含请求/响应元数据） */
  debug?: boolean;

  /** 话题请求类型：主聊天固定为 topic；内部辅助调用可不传。 */
  topicKind?: 'topic';
  /** 当前话题的 MCP 服务选择模型。 */
  mcpSelection?: McpServerSelection;
  /** 是否启用图片生成（Gemini image 等内联生图模型） */
  enableGenerateImage?: boolean;
  /** 是否启用联网搜索（支持 web search 的模型专用） */
  enableWebSearch?: boolean;
  /** 外部联网搜索 Provider ID（工具式，按需触发；按当前实现 assistant.webSearchProviderId） */
  webSearchProviderId?: string;
  /** 外部联网搜索全局设置（API 密钥、maxResults 等） */
  webSearchSettings?: WebSearchSettings;

  /** 全局记忆：随本次对话传给后台（SW）用于工具注入与后台写入 */
  memory?: ChatMemoryParams;
}

/**
 * 前端侧的"流式聊天适配层"
 * - 扩展环境：通过 Port 把请求交给 Service Worker，由后台请求模型并回传 delta
 * - 非扩展环境：直接报错（避免把 Key 暴露在页面里，也避免出现"假流式"误导）
 *
 * 当前统一使用 `chat/stream-v1` 协议，基于 Vercel AI SDK，支持推理增量与用量信息
 */
/** 判断当前页面是否运行在真正的浏览器扩展上下文中。 */
function isExtensionRuntime(): boolean {
  const chromeApi = (globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome;
  return Boolean(chromeApi?.runtime?.id && chromeApi?.runtime?.connect);
}

/** Service Worker → UI：通过 Port 回传的原始消息（未做强类型校验） */
type PortMsg = {
  /** 事件类型（例如 "chat/delta"、"chat/done"） */
  type?: unknown;
  /** 请求 ID：用于同一 Port 上多路复用 */
  requestId?: unknown;
  /** 增量文本（delta/reasoning-delta） */
  delta?: unknown;
  /** 错误信息（error） */
  error?: unknown;
  /** 可选：结构化错误详情（用于"详情"弹窗） */
  details?: unknown;
  /** 用量信息（done 时可能携带） */
  usage?: unknown;
  /** 工具调用 ID（tool-call/tool-result） */
  toolCallId?: unknown;
  /** 工具名称（tool-call/tool-result） */
  toolName?: unknown;
  /** 工具入参（tool-call） */
  args?: unknown;
  /** 工具输出（tool-result） */
  result?: unknown;
  /** 调试分类（chat/debug） */
  kind?: unknown;
  /** 调试负载（chat/debug） */
  payload?: unknown;
  /** 非正文流进度阶段（chat/progress） */
  stage?: unknown;
  /** 文件数据 base64（chat/file） */
  data?: unknown;
  /** 文件 MIME 类型（chat/file） */
  mediaType?: unknown;
  /** 远端文件 URL（chat/file-url） */
  url?: unknown;
  /** 文件名（chat/file-url） */
  name?: unknown;
  /** 来源引用（chat/source） */
  source?: unknown;
};

/** 从 Port 原始消息里提取结构化错误详情。 */
function parseErrorDetails(m: PortMsg): ChatErrorDetails | undefined {
  const d = m.details;
  if (!isPlainRecord(d)) return undefined;
  const out: ChatErrorDetails = {};
  if (typeof d.name === "string" && d.name.trim()) out.name = d.name;
  if (isI18nText(d.messageI18n)) out.messageI18n = d.messageI18n;
  if (typeof d.message === "string" && d.message.trim()) out.message = d.message;
  if (typeof d.stack === "string" && d.stack.trim()) out.stack = d.stack;
  if (typeof d.cause === "string" && d.cause.trim()) out.cause = d.cause;
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * 将单条 Port 消息分发给对应回调；若为终态（done/error）则返回 true。
 *
 * 说明：
 * - 这里只负责“协议层分发”，不做业务状态管理；
 * - `cleanup()` 只会在终态或上层主动 abort 后生效一次。
 */
function dispatchPortMessage(m: PortMsg, cbs: StreamChatOptions, cleanup: () => void, isCleaned: () => boolean): boolean {
  // 瑕疵-8 修复：abort 后 cleanup 已执行，忽略后续到达的消息，避免 onDone/onError 双重触发
  if (isCleaned()) return false;
  if (IS_E2E && (m.type === "chat/error" || m.type === "chat/done")) {
    logger.chat.debug("E2E chat stream terminal", { type: m.type, requestId: m.requestId, error: m.error, usage: m.usage });
  }
  if (m.type === "chat/debug") {
    const kind = typeof m.kind === "string" ? m.kind : "";
    const payload = (m as unknown as { payload?: unknown }).payload;
    const requestId = typeof m.requestId === 'string' ? m.requestId : '';
    // 默认直接打到前端控制台，方便快速定位 Provider/BaseURL/HTTP 返回等问题。
    // API 调用失败已经作为聊天错误展示给用户，这里只保留 warn 级诊断，避免点亮扩展级错误入口。
    if (kind.includes("apicall-error")) {
      logger.chat.warn(`chat debug ${kind}`, { payload });
    } else {
      logger.chat.debug(`chat debug ${kind}`, { payload });
    }
    cbs.onDebug?.({ requestId, kind, payload });
    return false;
  }
  if (m.type === "memory/changed") {
    try {
      window.dispatchEvent(new CustomEvent("olyq:memory-changed", { detail: { requestId: m.requestId, payload: m.payload } }));
    } catch {
      // 忽略：事件派发失败不影响主流程
    }
    return false;
  }
  if (m.type === "memory/error") {
    try {
      window.dispatchEvent(new CustomEvent("olyq:memory-error", { detail: { requestId: m.requestId, payload: m.payload } }));
    } catch {
      // 忽略：事件派发失败不影响主流程
    }
    return false;
  }
  if (m.type === "chat/delta") {
    if (IS_E2E && typeof m.delta === "string" && m.delta) {
      const d = m.delta.length > 80 ? `${m.delta.slice(0, 80)}…` : m.delta;
      logger.chat.debug("E2E chat stream delta", { requestId: m.requestId, delta: d });
    }
    if (typeof m.delta === "string" && m.delta) cbs.onDelta(m.delta);
    return false;
  }
  if (m.type === "chat/reasoning") {
    if (typeof m.delta === "string" && m.delta) cbs.onReasoning?.(m.delta);
    return false;
  }
  if (m.type === 'chat/progress') {
    return false;
  }
  if (m.type === "chat/tool-call") {
    cbs.onToolCall?.(parseToolId(m));
    return false;
  }
  if (m.type === "chat/tool-result") {
    cbs.onToolResult?.({ ...parseToolId(m), result: m.result });
    return false;
  }
  if (m.type === "chat/tool-error") {
    cbs.onToolError?.({
      ...parseToolId(m),
      error: normalizeI18nText(m.error, { key: 'errors.toolExecutionFailed' }),
    });
    return false;
  }
  if (m.type === 'chat/source') {
    const source = isPlainRecord(m.source) ? m.source : {};
    const url = typeof source.url === 'string' ? source.url.trim() : '';
    if (url) {
      cbs.onSource?.({
        source: {
          title: typeof source.title === 'string' ? source.title : '',
          url,
          snippet: typeof source.snippet === 'string' ? source.snippet : '',
        },
      });
    }
    return false;
  }
  if (m.type === "chat/file") {
    if (typeof m.data === 'string' && typeof m.mediaType === 'string' && m.data && m.mediaType) {
      cbs.onFile?.({ kind: 'base64', data: m.data, mediaType: m.mediaType });
    }
    return false;
  }
  if (m.type === "chat/file-url") {
    const url = typeof m.url === 'string' ? m.url.trim() : '';
    if (url) {
      cbs.onFile?.({
        kind: 'url',
        url,
        ...(typeof m.mediaType === 'string' && m.mediaType.trim() ? { mediaType: m.mediaType.trim() } : {}),
        ...(typeof m.name === 'string' && m.name.trim() ? { name: m.name.trim() } : {}),
      });
    }
    return false;
  }
  if (m.type === "chat/done") {
    cleanup();
    cbs.onDone(m.usage as ChatUsage | undefined);
    return true;
  }
  if (m.type === "chat/error") {
    cleanup();
    cbs.onError(normalizeI18nText(m.error), parseErrorDetails(m));
    return true;
  }
  return false;
}

/** 从原始 Port 消息里提取工具调用标识字段。 */
function parseToolId(m: PortMsg): ToolCallEvent {
  return {
    toolCallId: typeof m.toolCallId === "string" ? m.toolCallId : "",
    toolName: typeof m.toolName === "string" ? m.toolName : "",
    args: m.args,
  };
}

/**
 * 内部函数：`isEffectiveChatEventType`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function isEffectiveChatEventType(type: unknown): boolean {
  return type === 'chat/progress'
    || type === 'chat/delta'
    || type === 'chat/reasoning'
    || type === 'chat/tool-call'
    || type === 'chat/tool-result'
    || type === 'chat/tool-error'
    || type === 'chat/source'
    || type === 'chat/file'
    || type === 'chat/file-url'
    || type === 'chat/done'
    || type === 'chat/error';
}

/**
 * 内部函数：`isTerminalChatEventType`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function isTerminalChatEventType(type: unknown): boolean {
  return type === 'chat/done' || type === 'chat/error';
}

/**
 * 扩展环境下的聊天流实现：通过 UI Port 把请求转发给 Service Worker。
 *
 * 说明：
 * - UI 侧只负责发送轻量消息协议和消费事件流；
 * - 模型请求、工具注入、联网搜索、记忆写回等都在后台完成。
 */
async function streamChatViaExtension(opts: StreamChatOptions): Promise<void> {
  const requestId = opts.requestId || createId();
  const breadcrumbEnabled = import.meta.env.DEV || Boolean(useChatSettingsStore.getState().settings.enableDeveloperMode);
    /**
   * 内部函数变量：`logBreadcrumb`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const logBreadcrumb = (message: string, data?: Record<string, unknown>) => {
    if (!breadcrumbEnabled) return;
    logger.chat.debug(message, data);
    emitDeveloperDebugEvent({
      requestId,
      source: 'chat-topic',
      kind: message,
      payload: data,
    });
  };
  const port = await ensureUiPortReady();
  if (!port) {
    logBreadcrumb('chat_stream_port_unavailable', { model: opts.model, requestId: opts.requestId });
    opts.onError({ key: 'errors.extensionPortUnavailable' });
    return;
  }

  let cleaned = false;
  let accepted = false;
  let sawEffectiveEvent = false;
  let acceptTimer: ReturnType<typeof setTimeout> | null = null;
  let firstEventTimer: ReturnType<typeof setTimeout> | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const portOnDisconnect = port.onDisconnect;
  const removePortDisconnectListener =
    portOnDisconnect && typeof portOnDisconnect.removeListener === 'function'
      ? (listener: () => void) => portOnDisconnect.removeListener(listener)
      : null;

  const debugEnabled = (() => {
    if (typeof opts.debug === "boolean") return opts.debug;
    return Boolean(useChatSettingsStore.getState().settings.enableDeveloperMode);
  })();

    /**
   * 内部函数变量：`clearAcceptTimer`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const clearAcceptTimer = () => {
    if (!acceptTimer) return;
    clearTimeout(acceptTimer);
    acceptTimer = null;
  };

    /**
   * 内部函数变量：`clearFirstEventTimer`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const clearFirstEventTimer = () => {
    if (!firstEventTimer) return;
    clearTimeout(firstEventTimer);
    firstEventTimer = null;
  };

    /**
   * 内部函数变量：`clearIdleTimer`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const clearIdleTimer = () => {
    if (!idleTimer) return;
    clearTimeout(idleTimer);
    idleTimer = null;
  };

    /**
   * 内部函数变量：`clearAllWatchdogs`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const clearAllWatchdogs = () => {
    clearAcceptTimer();
    clearFirstEventTimer();
    clearIdleTimer();
  };

    /**
   * 内部函数变量：`failWatchdog`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const failWatchdog = (kind: 'accept' | 'first_event' | 'idle') => {
    if (cleaned) return;
    const breadcrumb =
      kind === 'accept'
        ? 'chat_stream_accept_timeout'
        : kind === 'first_event'
          ? 'chat_stream_first_event_timeout'
          : 'chat_stream_idle_timeout';
    logBreadcrumb(breadcrumb, { requestId, model: opts.model });
    cleanup();
    opts.onError({ key: 'errors.requestTimedOutOrDisconnected' });
  };

    /**
   * 内部函数变量：`armAcceptTimeout`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const armAcceptTimeout = () => {
    clearAcceptTimer();
    acceptTimer = setTimeout(() => {
      if (accepted || sawEffectiveEvent) return;
      failWatchdog('accept');
    }, CHAT_ACCEPT_TIMEOUT_MS);
  };

    /**
   * 内部函数变量：`armFirstEventTimeout`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const armFirstEventTimeout = () => {
    clearFirstEventTimer();
    firstEventTimer = setTimeout(() => {
      if (sawEffectiveEvent) return;
      failWatchdog('first_event');
    }, CHAT_FIRST_EVENT_TIMEOUT_MS);
  };

    /**
   * 内部函数变量：`armIdleTimeout`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const armIdleTimeout = () => {
    clearIdleTimer();
    idleTimer = setTimeout(() => {
      failWatchdog('idle');
    }, CHAT_IDLE_TIMEOUT_MS);
  };

    /**
   * 内部函数变量：`markAccepted`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const markAccepted = (source: 'explicit' | 'implicit', eventType?: string) => {
    if (accepted) return;
    accepted = true;
    clearAcceptTimer();
    logBreadcrumb('chat_stream_accepted', {
      requestId,
      model: opts.model,
      source,
      ...(eventType ? { eventType } : {}),
    });
    if (!sawEffectiveEvent) armFirstEventTimeout();
  };

    /**
   * 内部函数变量：`markEffectiveEvent`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const markEffectiveEvent = (eventType: string) => {
    if (!accepted) markAccepted('implicit', eventType);
    clearFirstEventTimer();
    sawEffectiveEvent = true;
    if (isTerminalChatEventType(eventType)) {
      clearIdleTimer();
      return;
    }
    armIdleTimeout();
  };

  /** 清理当前请求的消息监听与 abort 监听，确保终态只收一次。 */
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    clearAllWatchdogs();
    off();
    if (removePortDisconnectListener) removePortDisconnectListener(onPortDisconnect);
    if (opts.signal) opts.signal.removeEventListener("abort", onAbort);
  };

    /**
   * 内部函数变量：`onPortDisconnect`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const onPortDisconnect = () => {
    if (cleaned) return;
    logBreadcrumb('chat_stream_port_disconnected', { requestId, model: opts.model });
    cleanup();
    opts.onError({ key: 'errors.serviceWorkerRestarted' });
  };

  /** 用户主动停止生成时通知后台中止，并走本地 abort 终态。 */
  const onAbort = () => {
    if (IS_E2E) {
      logger.chat.debug("E2E chat stream abort", { requestId });
    }
    logBreadcrumb('chat_stream_terminal_aborted', { requestId, model: opts.model });
    postUiPortMessage({ type: "chat/abort", requestId });
    cleanup();
    opts.onAbort?.();
  };

  const off = onUiPortMessage((msg) => {
    const m = msg as PortMsg | null;
    if (!m || typeof m.type !== "string") return;
    // 说明（P1-5）：SW 重启时清理所有挂起请求，避免 UI 侧永久处于加载状态
    if (m.type === "sw/restarted") {
      if (!cleaned) {
        logBreadcrumb('chat_stream_sw_restarted', { requestId, model: opts.model });
        cleanup();
        opts.onError({ key: 'errors.serviceWorkerRestarted' });
      }
      return;
    }
    if (m.requestId !== requestId) return;
    if (m.type === 'chat/accepted') {
      markAccepted('explicit');
      return;
    }
    if (isEffectiveChatEventType(m.type)) {
      markEffectiveEvent(m.type);
    }
    if (m.type === 'chat/done') {
      logBreadcrumb('chat_stream_terminal_done', { requestId, model: opts.model });
    }
    if (m.type === 'chat/error') {
      logBreadcrumb('chat_stream_terminal_error', { requestId, model: opts.model });
    }
    dispatchPortMessage(m, opts, cleanup, () => cleaned);
  });

  if (opts.signal) opts.signal.addEventListener("abort", onAbort, { once: true });
  if (portOnDisconnect && typeof portOnDisconnect.addListener === 'function') {
    portOnDisconnect.addListener(onPortDisconnect);
  }

  if (IS_E2E) {
    logger.chat.debug("E2E chat stream start", { requestId, modelSelected: Boolean(opts.model), topicKind: opts.topicKind });
  }
  if (debugEnabled && (opts.enableWebSearch || opts.webSearchProviderId || opts.memory?.enabled)) {
    const ws = (opts.webSearchSettings ?? undefined) as unknown as Record<string, unknown> | undefined;
    const maxResults = typeof ws?.maxResults === "number" && Number.isFinite(ws.maxResults) ? ws.maxResults : undefined;
    const searchWithTime = typeof ws?.searchWithTime === "boolean" ? ws.searchWithTime : undefined;
    const excludeDomainsCount = Array.isArray(ws?.excludeDomains) ? ws?.excludeDomains.length : undefined;
    logger.chat.debug('chat stream send request', {
      requestId,
      topicKind: opts.topicKind,
      modelSelected: Boolean(opts.model),
      enableWebSearch: Boolean(opts.enableWebSearch),
      externalWebSearchConfigured: Boolean(opts.webSearchProviderId),
      webSearch: opts.webSearchProviderId ? { maxResults, searchWithTime, excludeDomainsCount } : undefined,
      memory: opts.memory
        ? {
            enabled: Boolean(opts.memory.enabled),
            topK: opts.memory.topK,
          }
        : undefined,
      mcpSelectionMode: opts.mcpSelection?.mode,
      mcpManualServerIdsCount: opts.mcpSelection?.mode === 'manual' ? opts.mcpSelection.manualServerIds.length : undefined,
    });
    if (opts.webSearchProviderId && !opts.webSearchSettings) {
      logger.chat.warn('chat stream web search provider missing settings', {
        requestId,
        externalWebSearchConfigured: true,
      });
    }
  }
  const ok = postUiPortMessage({
    type: "chat/stream-v1",
    requestId,
    payload: {
      messages: opts.messages, model: opts.model, temperature: opts.temperature,
      topP: opts.topP, maxTokens: opts.maxTokens,
      modelParams: opts.modelParams,
      topicKind: opts.topicKind,
      mcpSelection: opts.mcpSelection,
      enableGenerateImage: opts.enableGenerateImage,
      enableWebSearch: opts.enableWebSearch,
      webSearchProviderId: opts.webSearchProviderId,
      webSearchSettings: opts.webSearchSettings,
      memory: opts.memory,
      debug: debugEnabled,
    },
  });
  if (ok) {
    logBreadcrumb('chat_stream_posted', { requestId, model: opts.model, topicKind: opts.topicKind });
    armAcceptTimeout();
  }
  if (!ok) {
    logBreadcrumb('chat_stream_post_failed', { requestId, model: opts.model });
    cleanup();
    opts.onError({ key: 'errors.chatRequestSendFailed' });
  }
}

/**
 * 聊天流入口。
 *
 * 说明：
 * - 扩展环境下会把请求转发给 Service Worker 执行真实模型调用；
 * - 非扩展环境直接返回明确错误，避免页面假装已发送但实际没有后台能力。
 */
export async function streamChat(opts: StreamChatOptions) {
  if (isExtensionRuntime()) {
    await streamChatViaExtension(opts);
    return;
  }

  opts.onError({ key: 'errors.extensionRuntimeUnavailable' });
}
