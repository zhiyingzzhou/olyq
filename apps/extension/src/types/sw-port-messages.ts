/**
 * 说明：UI Port 与 Service Worker 的长连接消息契约。
 *
 * 职责：
 * - 集中定义 `olyq:ui` Port 上 UI 到 SW 与 SW 到 UI 的消息类型；
 * - 承载聊天、媒体生成、embedding、健康检查、SW 状态等长任务事件；
 * - 与 one-shot `sw-messages.ts` 分离，不通过旧总入口转发 Port 协议。
 *
 * 边界：
 * - 本文件只定义 Port 协议，不定义 `runtime.sendMessage` one-shot 协议；
 * - message type 与 payload 形状必须保持稳定，调用方必须从本模块导入 Port 类型。
 */
import type { HealthCheckEvent, HealthCheckRequestPayload } from '@/extension/background/health-check';
import type { ImageGenerateEvent, ImageGenerateRequest } from '@/extension/background/image';
import type { ObjectGenerateEvent, ObjectGenerateRequest } from '@/extension/background/object-gen';
import type { UiEvent } from '@/extension/background/port-manager';
import type { SpeechEvent, SpeechRequest } from '@/extension/background/speech';
import type { TranscriptionEvent, TranscriptionRequest } from '@/extension/background/transcription';
import type { StreamChatEvent } from '@/lib/ai/stream-chat';
import type { EmbeddingInputItem } from '@/lib/embedding';
import type { ChatMemoryParams } from '@/lib/memory/types';
import type { McpServerSelection } from '@/lib/mcp/selection';
import type { TechnologyStackResult } from '@/lib/technology-stack/types';
import type { WebSearchSettings } from '@/lib/web-search/types';
import type { I18nText } from './i18n';

/** UI Port 上共享的页面来源信息。 */
export type UiPortSource = {
  /** 来源页面 URL。 */
  url?: string;
  /** 来源页面标题。 */
  title?: string;
};

/** 浏览器上下文 metadata 更新负载。 */
export type UiPortBrowserContextMetadataPayload = {
  /** 当前标签页标题。 */
  title?: string;
  /** 当前标签页 URL。 */
  url: string;
  /** 当前标签页 favicon。 */
  favicon?: string;
  /** 标签页 ID。 */
  tabId?: number;
  /** 提取时间戳。 */
  extractedAt?: number;
  /** 技术栈页面生命周期身份；由 Service Worker epoch 派生，不持久化页面原文。 */
  technologyStackPageKey?: string;
};

/** UI -\> SW：开始一条聊天流请求。 */
export type UiPortMsg_ChatStreamV1 = {
  type: 'chat/stream-v1';
  requestId: string;
  payload: {
    messages: unknown[];
    model: string;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    modelParams?: Record<string, unknown>;
    topicKind?: 'topic';
    mcpSelection?: McpServerSelection;
    enableGenerateImage?: boolean;
    enableWebSearch?: boolean;
    webSearchProviderId?: string;
    webSearchSettings?: WebSearchSettings;
    memory?: ChatMemoryParams;
    debug?: boolean;
  };
};

/** UI -\> SW：中止聊天流。 */
export type UiPortMsg_ChatAbort = {
  type: 'chat/abort';
  requestId: string;
};

/** UI -\> SW：按 toolCallId 中止工具调用关联的聊天流。 */
export type UiPortMsg_ChatToolAbort = {
  type: 'chat/tool-abort';
  toolCallId: string;
};

/** UI -\> SW：发起图片生成。 */
export type UiPortMsg_ImageGenerate = {
  type: 'image/generate';
  requestId: string;
  payload: Omit<ImageGenerateRequest, 'requestId'>;
};

/** UI -\> SW：中止图片生成。 */
export type UiPortMsg_ImageAbort = {
  type: 'image/abort';
  requestId: string;
};

/** UI -\> SW：发起音频转写。 */
export type UiPortMsg_TranscriptionGenerate = {
  type: 'transcription/generate';
  requestId: string;
  payload: Omit<TranscriptionRequest, 'requestId'>;
};

/** UI -\> SW：中止音频转写。 */
export type UiPortMsg_TranscriptionAbort = {
  type: 'transcription/abort';
  requestId: string;
};

/** UI -\> SW：发起语音合成。 */
export type UiPortMsg_SpeechGenerate = {
  type: 'speech/generate';
  requestId: string;
  payload: Omit<SpeechRequest, 'requestId'>;
};

/** UI -\> SW：中止语音合成。 */
export type UiPortMsg_SpeechAbort = {
  type: 'speech/abort';
  requestId: string;
};

/** UI -\> SW：发起结构化对象生成。 */
export type UiPortMsg_ObjectGenerate = {
  type: 'object/generate';
  requestId: string;
  payload: Omit<ObjectGenerateRequest, 'requestId'>;
};

/** UI -\> SW：发起结构化对象流式生成。 */
export type UiPortMsg_ObjectStream = {
  type: 'object/stream';
  requestId: string;
  payload: Omit<ObjectGenerateRequest, 'requestId'>;
};

/** UI -\> SW：中止结构化对象生成。 */
export type UiPortMsg_ObjectAbort = {
  type: 'object/abort';
  requestId: string;
};

/** UI -\> SW：生成单条 embedding。 */
export type UiPortMsg_EmbeddingGenerate = {
  type: 'embedding/generate';
  requestId: string;
  payload: {
    items: EmbeddingInputItem[];
    options: {
      model: string;
      normalize?: boolean;
    };
  };
};

/** UI -\> SW：批量生成 embedding。 */
export type UiPortMsg_EmbeddingGenerateMany = {
  type: 'embedding/generateMany';
  requestId: string;
  payload: {
    itemsList: EmbeddingInputItem[][];
    options: {
      model: string;
      normalize?: boolean;
    };
  };
};

/** UI -\> SW：请求刷新当前 active tab 或指定 tab 的 metadata。 */
export type UiPortMsg_BrowserContextMetadataRequest = {
  type: 'browser-context/metadata/request';
  payload?: {
    /** 可选：显式指定要绑定的普通网页 tab，主要供产品截图生成脚本避免焦点漂移。 */
    tabId?: number;
  };
};

/** UI -\> SW：确保 offscreen document 存在。 */
export type UiPortMsg_OffscreenEnsure = {
  type: 'offscreen/ensure';
};

/** UI -\> SW：获取 SW 状态。 */
export type UiPortMsg_SwStatusGet = {
  type: 'sw/status/get';
  requestId: string;
};

/** UI -\> SW：设置 SW keepalive 配置。 */
export type UiPortMsg_SwKeepaliveSet = {
  type: 'sw/keepalive/set';
  requestId: string;
  payload: {
    alarmsEnabled: boolean;
    periodInMinutes: number;
  };
};

/** UI -\> SW：发起模型健康检查。 */
export type UiPortMsg_HealthCheck = {
  type: 'health/check';
  requestId: string;
  payload: HealthCheckRequestPayload;
};

/** UI -\> SW：中止模型健康检查。 */
export type UiPortMsg_HealthAbort = {
  type: 'health/abort';
  requestId: string;
};

/** UI -\> SW：轻量 ping，用于 keepalive。 */
export type UiPortMsg_Ping = {
  type: 'ping';
  ts: number;
};

/** UI Port 入站到 Service Worker 的联合消息。 */
export type UiPortOutboundMessage =
  | UiPortMsg_ChatStreamV1
  | UiPortMsg_ChatAbort
  | UiPortMsg_ChatToolAbort
  | UiPortMsg_ImageGenerate
  | UiPortMsg_ImageAbort
  | UiPortMsg_TranscriptionGenerate
  | UiPortMsg_TranscriptionAbort
  | UiPortMsg_SpeechGenerate
  | UiPortMsg_SpeechAbort
  | UiPortMsg_ObjectGenerate
  | UiPortMsg_ObjectStream
  | UiPortMsg_ObjectAbort
  | UiPortMsg_EmbeddingGenerate
  | UiPortMsg_EmbeddingGenerateMany
  | UiPortMsg_BrowserContextMetadataRequest
  | UiPortMsg_OffscreenEnsure
  | UiPortMsg_SwStatusGet
  | UiPortMsg_SwKeepaliveSet
  | UiPortMsg_HealthCheck
  | UiPortMsg_HealthAbort
  | UiPortMsg_Ping;

/** SW -\> UI：SW 重启通知。 */
export type UiPortMsg_SwRestarted = {
  type: 'sw/restarted';
};

/** SW -\> UI：SW 当前状态快照。 */
export type UiPortMsg_SwStatus = {
  type: 'sw/status';
  requestId: string;
  payload: Record<string, unknown>;
};

/** SW -\> UI：SW keepalive 设置回执。 */
export type UiPortMsg_SwKeepaliveAck = {
  type: 'sw/keepalive/ack';
  requestId: string;
  payload: {
    ok: boolean;
    error?: I18nText;
  };
};

/** SW -\> UI：聊天请求已被后台接单。 */
export type UiPortMsg_ChatAccepted = {
  type: 'chat/accepted';
  requestId: string;
};

/** SW -\> UI：浏览器上下文 metadata 更新事件。 */
export type UiPortMsg_BrowserContextMetadataUpdate = {
  type: 'browser-context/metadata/update';
  payload: UiPortBrowserContextMetadataPayload | null;
};

/** SW -\> UI：技术栈内存缓存更新事件。 */
export type UiPortMsg_TechnologyStackResultUpdated = {
  type: 'technology-stack/result-updated';
  payload: {
    /** 技术栈页面生命周期身份，用于 UI 丢弃旧导航晚到结果。 */
    pageKey: string;
    /** 当前结果是否已完成 delayed JS / external snippets 增强；仅供运行时缓存决策。 */
    enhanced: boolean;
    /** 结构化技术栈结果，不包含页面原文或 cookie 值。 */
    result: TechnologyStackResult;
  };
};

/** SW -\> UI：embedding 成功结果。 */
export type UiPortMsg_EmbeddingResult = {
  type: 'embedding/result';
  requestId: string;
  vector: number[];
};

/** SW -\> UI：embedding 批量结果。 */
export type UiPortMsg_EmbeddingResultMany = {
  type: 'embedding/resultMany';
  requestId: string;
  vectors: number[][];
};

/** SW -\> UI：embedding 失败结果。 */
export type UiPortMsg_EmbeddingError = {
  type: 'embedding/error';
  requestId: string;
  error: I18nText;
};

/** UI Port 从 Service Worker 返回给 UI 的联合消息。 */
export type UiPortInboundMessage =
  | UiEvent
  | UiPortMsg_SwRestarted
  | UiPortMsg_SwStatus
  | UiPortMsg_SwKeepaliveAck
  | UiPortMsg_ChatAccepted
  | UiPortMsg_BrowserContextMetadataUpdate
  | UiPortMsg_TechnologyStackResultUpdated
  | UiPortMsg_EmbeddingResult
  | UiPortMsg_EmbeddingResultMany
  | UiPortMsg_EmbeddingError
  | StreamChatEvent
  | ImageGenerateEvent
  | SpeechEvent
  | TranscriptionEvent
  | ObjectGenerateEvent
  | HealthCheckEvent;

/** UI Port 从 SW 发往 UI 的 type 字面量联合。 */
export type UiPortInboundMessageType = UiPortInboundMessage['type'];

/** UI Port 从 UI 发往 SW 的 type 字面量联合。 */
export type UiPortOutboundMessageType = UiPortOutboundMessage['type'];
