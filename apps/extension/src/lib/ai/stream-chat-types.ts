/**
 * 说明：`stream-chat-types` AI 能力模块。
 *
 * 职责：
 * - 承载 `stream-chat-types` 相关的当前文件实现与模块边界；
 * - 对外暴露 `StreamChatUsage`、`StreamChatDeltaEvent`、`StreamChatReasoningEvent` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { ToolSet } from 'ai';

import { generateText as aiGenerateText, streamText as aiStreamText } from 'ai';
import { buildRuntimeCallPlan, resolveStreamContext } from './stream-chat-context';
import type { ChatStreamParams } from './types';
import type { I18nText } from '@/types/i18n';
import type { WebSearchResult } from '@/types/chat';

/** AI SDK 返回的用量信息（不同 Provider 可能返回不同字段；这里做统一收敛） */
export interface StreamChatUsage {
  inputTokens: number;
  outputTokens: number;
}

/** 导出类型：`StreamChatDeltaEvent`。 */
export interface StreamChatDeltaEvent {
  type: 'chat/delta';
  requestId: string;
  delta: string;
}

/** 导出类型：`StreamChatReasoningEvent`。 */
export interface StreamChatReasoningEvent {
  type: 'chat/reasoning';
  requestId: string;
  delta: string;
}

/** 流仍在推进、但暂时还没有可见正文时使用的后台进度阶段。 */
export type StreamChatProgressStage =
  | 'stream-start'
  | 'response-in-progress'
  | 'web-search-planning'
  | 'web-search-execution'
  | 'tool-collection'
  | 'mcp-tool-listing'
  | 'memory-tool-execution'
  | 'text-start'
  | 'reasoning-start'
  | 'reasoning-end'
  | 'tool-input-start'
  | 'tool-input-delta'
  | 'tool-input-end'
  | 'tool-execution';

/** 导出类型：`StreamChatProgressEvent`。 */
export interface StreamChatProgressEvent {
  type: 'chat/progress';
  requestId: string;
  stage: StreamChatProgressStage;
}

/** 导出类型：`StreamChatToolCallEvent`。 */
export interface StreamChatToolCallEvent {
  type: 'chat/tool-call';
  requestId: string;
  toolCallId: string;
  toolName: string;
  args: unknown;
}

/** 导出类型：`StreamChatToolResultEvent`。 */
export interface StreamChatToolResultEvent {
  type: 'chat/tool-result';
  requestId: string;
  toolCallId: string;
  toolName: string;
  result: unknown;
}

/** 导出类型：`StreamChatToolErrorEvent`。 */
export interface StreamChatToolErrorEvent {
  type: 'chat/tool-error';
  requestId: string;
  toolCallId: string;
  toolName: string;
  args: unknown;
  error: I18nText;
}

/** 导出类型：`StreamChatSourceEvent`。 */
export interface StreamChatSourceEvent {
  type: 'chat/source';
  requestId: string;
  source: WebSearchResult;
}

/** 导出类型：`StreamChatDoneEvent`。 */
export interface StreamChatDoneEvent {
  type: 'chat/done';
  requestId: string;
  usage?: StreamChatUsage;
}

/** 导出类型：`StreamChatErrorEvent`。 */
export interface StreamChatErrorEvent {
  type: 'chat/error';
  requestId: string;
  error: I18nText;
  details?: import('./stream-chat-errors').StreamChatErrorDetails;
}

/** 导出类型：`StreamChatDebugEvent`。 */
export interface StreamChatDebugEvent {
  type: 'chat/debug';
  requestId: string;
  kind: string;
  payload: unknown;
}

/** 导出类型：`StreamChatFileEvent`。 */
export interface StreamChatFileEvent {
  type: 'chat/file';
  requestId: string;
  data: string;
  mediaType: string;
}

/** 导出类型：`StreamChatFileUrlEvent`。 */
export interface StreamChatFileUrlEvent {
  type: 'chat/file-url';
  requestId: string;
  url: string;
  mediaType?: string;
  name?: string;
}

/** 导出类型：`StreamChatMemoryChangedEvent`。 */
export interface StreamChatMemoryChangedEvent {
  type: 'memory/changed';
  requestId: string;
  payload: unknown;
}

/** 导出类型：`StreamChatMemoryErrorEvent`。 */
export interface StreamChatMemoryErrorEvent {
  type: 'memory/error';
  requestId: string;
  payload: unknown;
}

/** 导出类型：`StreamChatEvent`。 */
export type StreamChatEvent =
  | StreamChatProgressEvent
  | StreamChatDeltaEvent
  | StreamChatReasoningEvent
  | StreamChatToolCallEvent
  | StreamChatToolResultEvent
  | StreamChatToolErrorEvent
  | StreamChatSourceEvent
  | StreamChatFileEvent
  | StreamChatFileUrlEvent
  | StreamChatMemoryChangedEvent
  | StreamChatMemoryErrorEvent
  | StreamChatDoneEvent
  | StreamChatErrorEvent
  | StreamChatDebugEvent;

/** `streamChat` 依赖注入项，主要用于测试与局部覆写。 */
export interface StreamChatDeps {
  streamText: typeof aiStreamText;
  generateText: typeof aiGenerateText;
  resolveStreamContext: typeof resolveStreamContext;
  buildRuntimeCallPlan: typeof buildRuntimeCallPlan;
}

/** `streamChat` 的入参。 */
export interface StreamChatOptions {
  requestId: string;
  params: ChatStreamParams;
  onEvent: (event: StreamChatEvent) => void;
  signal: AbortSignal;
  tools?: ToolSet;
  deps?: Partial<StreamChatDeps>;
}
