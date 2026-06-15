/**
 * 说明：`openWorkspaceInNewTab` 页面动作模块。
 *
 * 职责：
 * - 在打开新的 sidepanel 扩展页宿主前，先把当前工作区启动状态写回共享真源；
 * - 保证新标签页读取启动快照时看到的是当前 assistants、runtime 与消息库状态；
 * - 保持底层 `openSidepanelPageInNewTab()` 只作为纯扩展页打开 primitive。
 *
 * 边界：
 * - 本文件属于主工作区页面层，可以读取 Zustand store；
 * - 不直接调用 browser tabs API，实际打开仍经由 `ui-actions` 共享 contract。
 */
import { useAssistantStore } from '@/hooks/useAssistantStore';
import { flushChatStorePendingWrites, useChatStore } from '@/hooks/useChatStore';
import { resolveAssistantTopic } from '@/lib/chat/topic-tree';
import type { RuntimeState } from '@/lib/chat/runtime-selection';
import { sanitizeRuntime } from '@/lib/chat/runtime-selection';
import { writeWorkspaceStartupState } from '@/lib/chat/workspace-startup-state';
import { openSidepanelPageInNewTab } from '@/lib/extension/ui-actions';

/**
 * 解析当前工作区用于新宿主启动快照的 runtime。
 *
 * @remarks
 * `activeConversationKey` 是当前页面内“真正正在显示的话题”，它可能领先于尚未落盘的
 * `runtime.activeTopicId`。打开新标签页前必须以它为准，并反查助手归属，避免新宿主读到
 * 旧 runtime 后停在错误话题或进入 loading 壳。
 */
function resolveCurrentWorkspaceRuntime(): RuntimeState {
  const assistants = useAssistantStore.getState().assistants;
  const chatState = useChatStore.getState();
  const activeTopicId = String(chatState.activeConversationKey || chatState.runtime.activeTopicId || '').trim();
  const resolved = resolveAssistantTopic(assistants, activeTopicId);

  return sanitizeRuntime({
    activeAssistantId: resolved?.assistantId ?? chatState.runtime.activeAssistantId,
    activeTopicId: resolved?.topic.id ?? activeTopicId,
  });
}

/**
 * 打开携带当前工作区启动快照的新 sidepanel 标签页。
 *
 * @remarks
 * 顺序是产品语义的一部分：先同步写入 assistants 与 chat runtime，再等待聊天消息
 * IndexedDB 待写队列冲刷完成，最后才创建新标签页。这样新宿主的 startup snapshot
 * 不依赖旧宿主尚未落盘的异步 store 写回。
 */
export async function openCurrentWorkspaceInNewTab(): Promise<chrome.tabs.Tab | null> {
  const assistants = useAssistantStore.getState().assistants;
  const runtime = resolveCurrentWorkspaceRuntime();

  await writeWorkspaceStartupState(assistants, runtime);
  await flushChatStorePendingWrites();

  return await openSidepanelPageInNewTab();
}
