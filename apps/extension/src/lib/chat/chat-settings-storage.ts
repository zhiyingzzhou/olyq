/**
 * 说明：聊天默认设置共享存储 helper。
 *
 * 职责：
 * - 为非 React 运行时读取 `olyq.chat.settings.v1` 提供域级入口；
 * - 复用 shared JSON config channel，避免业务模块直接拼 `readStoredJson`；
 * - 保持 `normalizeChatSettings()` 作为 ChatSettings schema 归一化真源。
 *
 * 边界：
 * - 本模块只读取当前聊天默认设置，不创建 UI store，也不负责 same-window 订阅；
 * - 写入仍由 `useChatSettingsStore` 和对应设置 UI 拥有。
 */
import { normalizeChatSettings } from '@/lib/chat/chat-settings-normalize';
import { CHAT_SETTINGS_STORAGE_KEY } from '@/lib/extension/extension-page-startup';
import { createSharedJsonConfigChannel } from '@/lib/storage/shared-json-config-channel';
import { DEFAULT_SETTINGS, type ChatSettings } from '@/types/chat';

/** 深拷贝聊天设置快照，避免调用方误改 channel 缓存。 */
function cloneChatSettings(value: ChatSettings): ChatSettings {
  return normalizeChatSettings(JSON.parse(JSON.stringify(value)) as ChatSettings);
}

/** 将任意 storage 原始值归一化为当前 ChatSettings schema。 */
function normalizeChatSettingsFromStorage(raw: unknown): ChatSettings {
  return normalizeChatSettings((raw as ChatSettings) ?? DEFAULT_SETTINGS);
}

const chatSettingsChannel = createSharedJsonConfigChannel<ChatSettings>({
  storageKey: CHAT_SETTINGS_STORAGE_KEY,
  fallback: DEFAULT_SETTINGS,
  normalize: normalizeChatSettingsFromStorage,
  clone: cloneChatSettings,
});

/**
 * 从共享存储读取当前聊天默认设置。
 *
 * @returns 归一化后的 ChatSettings 快照。
 */
export async function readChatSettingsFromStorage(): Promise<ChatSettings> {
  const { value } = await chatSettingsChannel.refreshFromStorage();
  return value;
}
