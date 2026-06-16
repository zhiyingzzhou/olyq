/**
 * 说明：`workspace-startup-state` 聊天工作区启动状态模块。
 *
 * 职责：
 * - 为主工作区打开新扩展页宿主前提供单一启动状态写入入口；
 * - 将 assistants 与 chat runtime 同步写入共享 JSON 真源；
 * - 避免页面动作模块直接 import 底层 `json-storage` helper。
 *
 * 边界：
 * - 本文件只处理当前工作区启动快照需要的轻量共享状态；
 * - 聊天消息正文仍由 IndexedDB 与 `flushChatStorePendingWrites()` 负责。
 */
import type { RuntimeState } from '@/lib/chat/runtime-selection';
import { ASSISTANTS_STORAGE_KEY, CHAT_RUNTIME_STORAGE_KEY } from '@/lib/legal/preset-remediation';
import { writeStoredJsonWithBootstrapMirror } from '@/lib/storage/json-storage';
import type { Assistant } from '@/types/assistant';

/**
 * 写入新扩展页宿主启动前必须可见的工作区状态。
 *
 * @remarks
 * 这里故意保持顺序写入：先写助手树，再写 runtime。新宿主启动快照会用 runtime
 * 反查助手与话题归属；若顺序反过来，极端时序下可能先读到新 runtime 和旧助手树。
 */
export async function writeWorkspaceStartupState(
  assistants: Assistant[],
  runtime: RuntimeState,
): Promise<void> {
  await writeStoredJsonWithBootstrapMirror(ASSISTANTS_STORAGE_KEY, assistants);
  await writeStoredJsonWithBootstrapMirror(CHAT_RUNTIME_STORAGE_KEY, runtime);
}
