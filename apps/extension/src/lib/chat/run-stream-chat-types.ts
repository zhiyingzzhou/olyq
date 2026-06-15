/**
 * 说明：`run-stream-chat-types` 基础能力模块。
 *
 * 职责：
 * - 承载 `run-stream-chat-types` 相关的当前文件实现与模块边界；
 * - 对外暴露 `RunStreamChatOptions`、`BuildApiMessagesOptions`、`SendMessageParams` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { type ApiAttachment, type Msg as ApiMsg } from '@/lib/chat-stream';
import type { ChatMemoryParams } from '@/lib/memory/types';
import type { WebSearchSettings } from '@/lib/web-search/types';
import type { DeveloperDebugSource } from '@/hooks/useDeveloperToolsStore';
import type {
  Message,
  MessageAttachment,
  MessageContextReference,
  MessageTraceItem,
  ResolvedConversationContext,
  UpdateTopicMessages,
} from '@/types/chat';
import type { I18nText } from '@/types/i18n';

/** runStreamChat 的入参：sendMessage/regenerate 共用的一次流式请求上下文 */
export interface RunStreamChatOptions {
  apiMsgs: ApiMsg[];
  topic: ResolvedConversationContext;
  modelId?: string;
  requestId?: string;
  developerSource?: DeveloperDebugSource;
  askId?: string;
  targetIndex: number;
  mode: 'insert' | 'replace';
  signal: AbortSignal;
  baseMsgs: Message[];
  topicId: string;
  onUpdateMessages: UpdateTopicMessages;
  /** assistant 首次真实写回 UI 后触发，用于把发送 latest intent 接到统一滚动命令门面。 */
  onInitialAssistantSnapshotCommitted?: () => void;
  onFinish: () => void;
  onError: (err: I18nText, details?: Message['errorDetails']) => void;
  onToolResultEvent?: (event: { toolCallId: string; toolName: string; result: unknown }) => void;
  getLatestMessages?: () => Message[];
  useAssistantRuntimeFeatures?: boolean;
  enableGenerateImageOverride?: boolean;
  enableWebSearchOverride?: boolean;
  webSearchProviderIdOverride?: string | null;
  webSearchSettingsOverride?: WebSearchSettings | null;
  memoryOverride?: ChatMemoryParams | null;
}

/** buildApiMessages 的入参：把系统提示词与上下文消息转换为后台协议的 ApiMsg 列表 */
export interface BuildApiMessagesOptions {
  modelId: string;
  systemContent: string;
  contextMessages: Message[];
  signal: AbortSignal;
  ephemeralUserAttachments?: Array<{
    messageId: string;
    attachments: ApiAttachment[];
  }>;
}

/** sendMessage 的入参：文本 + 可选附件引用 */
export type SendMessageParams = {
  text: string;
  modelContext?: string;
  contextReferences?: MessageContextReference[];
  attachments?: MessageAttachment[];
  mentionModels?: string[];
};

/** 导出类型：`PendingStreamFile`。 */
export type PendingStreamFile =
  | { kind: 'base64'; data: string; mediaType: string }
  | { kind: 'url'; url: string; mediaType?: string; name?: string };

/** 导出类型：`RunStreamAssistantState`。 */
export interface RunStreamAssistantState {
  attachments: MessageAttachment[];
  content: string;
  error?: I18nText;
  errorDetails?: Message['errorDetails'];
  status: Message['status'];
  trace: MessageTraceItem[];
  webSearchError?: Message['webSearchError'];
  webSearchProviderId?: Message['webSearchProviderId'];
  webSearchQuery?: Message['webSearchQuery'];
  webSearchResults?: Message['webSearchResults'];
  webSearchStatus?: Message['webSearchStatus'];
}
