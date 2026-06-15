/**
 * 说明：`useChatStore.utils` Hook 辅助模块。
 *
 * 职责：
 * - 承载聊天 store 的纯计算与轻量环境判断；
 * - 避免 `useChatStore.ts` 继续膨胀成跨职责热点文件。
 *
 * 边界：
 * - 本文件不创建 Zustand store，不注册监听器，也不触发持久化写入。
 */
import type { RuntimeState } from '@/lib/chat/runtime-selection';
import { sanitizeRuntime } from '@/lib/chat/runtime-selection';
import {
  getExtensionPageStartupSnapshot,
  readExtensionPageStartupValue,
} from '@/lib/extension/extension-page-startup';
import {
  CHAT_RUNTIME_STORAGE_KEY,
  LEGAL_PRESET_REMEDIATION_MARKER_KEY,
} from '@/lib/legal/preset-remediation';
import type { Assistant } from '@/types/assistant';
import type { Message } from '@/types/chat';

/** 聊天 store 首屏激活态。 */
export type InitialChatConversationState = 'none' | 'resolving' | 'ready';

/** 聊天 store 启动快照。 */
export interface InitialChatStoreSnapshot {
  /** 当前运行时选择态。 */
  runtime: RuntimeState;
  /** 当前激活话题 ID。 */
  activeConversationKey: string | null;
  /** 当前话题首屏消息。 */
  activeMessages: Message[];
  /** 当前话题消息是否仍在加载。 */
  activeMessagesLoading: boolean;
  /** 当前话题首屏解析状态。 */
  activeConversationState: InitialChatConversationState;
}

/**
 * 读取聊天 store 的首轮启动快照。
 *
 * @remarks
 * 扩展页入口会在 React 挂载前完成启动快照预取；这里只消费该快照，
 * 不触发 storage 订阅或 IndexedDB 读取，保证首屏状态可由启动真源直接决定。
 */
export function readInitialChatSnapshot(hasRuntimeStartupSeed: boolean): InitialChatStoreSnapshot {
  const runtime = hasRuntimeStartupSeed
    ? sanitizeRuntime(readExtensionPageStartupValue(CHAT_RUNTIME_STORAGE_KEY, null, sanitizeRuntime))
    : { activeAssistantId: null, activeTopicId: null };
  const startupSnapshot = getExtensionPageStartupSnapshot();

  if (!startupSnapshot) {
    return {
      runtime,
      activeConversationKey: null,
      activeMessages: [],
      activeMessagesLoading: false,
      activeConversationState: 'none',
    };
  }

  if (startupSnapshot.activeConversation.status === 'ready') {
    return {
      runtime: {
        activeAssistantId: startupSnapshot.activeConversation.assistantId,
        activeTopicId: startupSnapshot.activeConversation.topicId,
      },
      activeConversationKey: startupSnapshot.activeConversation.topicId,
      activeMessages: Array.isArray(startupSnapshot.activeConversation.messages)
        ? startupSnapshot.activeConversation.messages
        : [],
      activeMessagesLoading: false,
      activeConversationState: 'ready',
    };
  }

  if (startupSnapshot.activeConversation.status === 'loading-fallback') {
    return {
      runtime: {
        activeAssistantId: startupSnapshot.activeConversation.assistantId,
        activeTopicId: startupSnapshot.activeConversation.topicId,
      },
      activeConversationKey: startupSnapshot.activeConversation.topicId,
      activeMessages: [],
      activeMessagesLoading: true,
      activeConversationState: 'resolving',
    };
  }

  return {
    runtime: { activeAssistantId: null, activeTopicId: null },
    activeConversationKey: null,
    activeMessages: [],
    activeMessagesLoading: false,
    activeConversationState: 'none',
  };
}

/**
 * 将聊天运行时选择态序列化为可比较快照。
 *
 * @remarks
 * 这里只用于去重写入 `chrome.storage.local`，不是备份协议，也不是同步协议。
 */
export function serializeRuntime(runtime: RuntimeState) {
  try {
    return JSON.stringify(runtime);
  } catch {
    return '';
  }
}

/**
 * 判断当前页面是否已经拿到法务修复 marker 的启动期快照。
 *
 * @remarks
 * 启动链路改成“storage 真源快照优先”后，marker 可能只存在于：
 * - 当前页刚预取到的 storage 快照；
 * - 或 bootstrap mirror。
 * 这里不能再只看旧的 bootstrap seed，否则会把已持久化的 runtime 误判成“不可读”。
 */
export function hasStartupLegalPresetRemediationMarker(): boolean {
  const marker = readExtensionPageStartupValue<unknown>(
    LEGAL_PRESET_REMEDIATION_MARKER_KEY,
    null,
    (raw) => raw,
  );
  return marker !== null && marker !== undefined;
}

/**
 * 从消息快照中提取所有附件 ID。
 *
 * @remarks
 * 话题删除后的附件回收依赖这里的结果，但最终是否删除还要结合“其他话题是否仍引用”二次判断。
 */
export function collectAttachmentIdsFromMessages(messages: Message[]) {
  const ids: string[] = [];
  for (const message of messages) {
    for (const attachment of message.attachments || []) {
      if ((attachment?.type === 'image' || attachment?.type === 'file') && attachment.id) ids.push(attachment.id);
    }
  }
  return Array.from(new Set(ids));
}

/** 判断当前运行时是否具备 IndexedDB 能力。 */
export function hasIndexedDbSupport() {
  return typeof indexedDB !== 'undefined';
}

/** 收集消息 ID，供消息覆盖写回时计算删除差集。 */
function collectMessageIds(messages: Message[]): Set<string> {
  return new Set(
    (Array.isArray(messages) ? messages : [])
      .map((message) => String(message?.id || '').trim())
      .filter(Boolean),
  );
}

/**
 * 计算下一份消息快照相对上一份快照删除了哪些消息 ID。
 *
 * @remarks
 * 同步域需要知道“哪些 message 被删掉了”，而不只是整话题发生过更新。
 */
export function getDeletedMessageIds(previousMessages: Message[], nextMessages: Message[]): string[] {
  const nextIds = collectMessageIds(nextMessages);
  const deletedIds: string[] = [];
  for (const message of Array.isArray(previousMessages) ? previousMessages : []) {
    const messageId = String(message?.id || '').trim();
    if (messageId && !nextIds.has(messageId)) deletedIds.push(messageId);
  }
  return deletedIds;
}

/** 展平助手树里的 topic ID，用于识别被删除的话题。 */
export function flattenTopicIds(assistants: Assistant[]): Set<string> {
  const ids = new Set<string>();
  for (const assistant of assistants) {
    for (const topic of assistant.topics) ids.add(topic.id);
  }
  return ids;
}
