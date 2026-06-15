/**
 * 说明：`types` 组件模块。
 *
 * 职责：
 * - 承载 `types` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ChatAreaProps`、`ChatAreaHandle` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type {
  MessageAttachment,
  ResolvedConversationContext,
  UpdateTopicMessages,
} from "@/types/chat";
import type { ChatInputExternalDraft, ChatInputExternalDraftAcceptResult } from "../chat-input/types";

/** 导出类型：`ChatAreaProps`。 */
export interface ChatAreaProps {
  topic: ResolvedConversationContext | null;
  /**
   * 当前聊天区的稳定态。
   *
   * 说明：
   * - `empty`：确认当前没有可进入的话题；
   * - `loading`：话题解析中或首轮消息尚未判明，只允许显示稳定 loading 壳子；
   * - `ready`：当前话题已经稳定，可根据消息是否为空决定欢迎态或消息列表。
   */
  conversationState?: 'empty' | 'loading' | 'ready';
  messagesLoading?: boolean;
  onUpdateMessages: UpdateTopicMessages;
  onOpenPrompts: () => void;
  onModelSwitch?: (modelId: string) => void;
  onOpenModelManager?: () => void;
  onOpenWebSearchSettings?: () => void;
  onOpenNativeWebSearchSettings?: () => void;
  onOpenMcpSettings?: () => void;
  onOpenMemorySettings?: () => void;
}

/** 导出类型：`ChatAreaHandle`。 */
export type ChatAreaHandle = {
  send: (text: string) => void;
  sendWithAttachments: (payload: { text: string; attachments: MessageAttachment[] }) => void;
  insertDraft: (draft: ChatInputExternalDraft) => void;
  acceptExternalDraft: (draft: ChatInputExternalDraft) => Promise<void>;
  completeExternalDraft: (draftId: string, result: ChatInputExternalDraftAcceptResult) => void;
  stop: () => void;
  sendCompare: (text: string, modelIds: string[]) => void;
  scrollToMessage?: (messageId: string) => void;
  openCompareFullscreen?: (askId: string) => void;
};
