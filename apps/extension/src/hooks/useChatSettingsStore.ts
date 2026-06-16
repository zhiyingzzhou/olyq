/**
 * 说明：`useChatSettingsStore` Hook 模块。
 *
 * 职责：
 * - 承载 `useChatSettingsStore` 相关的当前文件实现与模块边界；
 * - 对外暴露 `UseChatSettingsStore`、`useChatSettingsStore` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { createWithEqualityFn } from 'zustand/traditional';
import { subscribeWithSelector } from 'zustand/middleware';
import type { ChatSettings } from '@/types/chat';
import { getDefaultSettings } from '@/types/chat';
import i18n from '@/i18n';
import { normalizeChatSettings } from '@/lib/chat/chat-settings-normalize';
import {
  CHAT_SETTINGS_STORAGE_KEY,
  hasExtensionPageStartupStorageValue,
  readExtensionPageStartupValue,
} from '@/lib/extension/extension-page-startup';
import {
  readStoredJsonWithBootstrapMirror,
  subscribeStoredKeys,
  writeStoredJsonWithBootstrapMirrorInBackground,
} from '@/lib/storage/json-storage';
import { consumeBackgroundStoragePromise } from '@/lib/storage/background-storage';
import { subscribeStoreReloadSignal } from '@/lib/storage/reload-signal';

/**
 * 说明：useChatSettingsStore——全局聊天默认设置（从 useChatStore 拆分）。
 *
 * - 状态：`settings`（ChatSettings）
 * - 方法：setSettings / reloadFromStorage
 * - 持久化：storage adapter 为主真源；localStorage 只保留 bootstrap mirror
 */

const STORAGE_KEY = CHAT_SETTINGS_STORAGE_KEY;

/** 读取当前 UI 语言下的聊天设置默认值，避免把默认系统提示词提前固化成单一语言。 */
function getLocalizedDefaultSettings(): ChatSettings {
  return getDefaultSettings(i18n.t.bind(i18n));
}

/**
 * 内部函数：`serializeSettings`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function serializeSettings(settings: ChatSettings) {
  try {
    return JSON.stringify(settings);
  } catch {
    return '';
  }
}

/**
 * 内部函数：`loadNormalizedSettingsFromStorage`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
async function loadNormalizedSettingsFromStorage(): Promise<ChatSettings> {
  const defaultSettings = getLocalizedDefaultSettings();
  const rawSettings = await readStoredJsonWithBootstrapMirror<unknown>(STORAGE_KEY, defaultSettings, (value) => value);
  const nextSettings = normalizeChatSettings((rawSettings as ChatSettings) ?? defaultSettings);
  if (JSON.stringify(rawSettings ?? null) !== serializeSettings(nextSettings)) {
    writeStoredJsonWithBootstrapMirrorInBackground(STORAGE_KEY, nextSettings, 'useChatSettingsStore.normalizeSettings');
  }
  return nextSettings;
}

/**
 * 聊天默认设置 store 状态。
 *
 * 说明：
 * - 这是全局默认值，不直接代表某个具体话题的即时设置；
 * - 变更后会自动写回 storage adapter，并通过统一 reload 事件支持云同步后的回流。
 */
interface ChatSettingsStore {
  /** 全局默认聊天设置（自动持久化到 storage adapter） */
  settings: ChatSettings;
  /** 更新全局默认设置 */
  setSettings: (next: ChatSettings) => void;
  /** 从 storage adapter 重新加载（用于云同步/恢复后刷新内存态） */
  reloadFromStorage: () => void;
}

/**
 * 内部函数：`readInitialSettings`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function readInitialSettings(): ChatSettings {
  const defaultSettings = getLocalizedDefaultSettings();
  const rawSettings = readExtensionPageStartupValue(
    STORAGE_KEY,
    defaultSettings,
    (raw) => (raw as ChatSettings) ?? defaultSettings,
  );
  return normalizeChatSettings(rawSettings);
}

/**
 * 将全局默认 system prompt 切换为当前 UI 语言的内置默认值。
 *
 * 说明：
 * - 语言是产品内置 prompt 的唯一 owner，切换语言时直接覆盖默认 system prompt；
 * - 用户仍可在设置页手动编辑该字段，但下一次语言切换会按当前语言重新落回内置默认值；
 * - 这里只改 `olyq.chat.settings.v1` 这份共享配置，不触碰助手、话题或历史消息。
 */
function applyLocalizedDefaultSystemPrompt(store: ChatSettingsStoreHook): void {
  const current = store.getState().settings;
  const defaultSystemPrompt = getLocalizedDefaultSettings().defaultSystemPrompt;
  if (current.defaultSystemPrompt === defaultSystemPrompt) return;
  store.setState({
    settings: normalizeChatSettings({
      ...current,
      defaultSystemPrompt,
    }),
  });
}

/** 创建聊天默认设置 store。 */
function createChatSettingsStore() {
  return createWithEqualityFn<ChatSettingsStore>()(
    subscribeWithSelector((set) => ({
      settings: readInitialSettings(),

      setSettings: (next) => {
        set({ settings: normalizeChatSettings(next) });
      },

      reloadFromStorage: () => {
        consumeBackgroundStoragePromise((async () => {
          const nextSettings = await loadNormalizedSettingsFromStorage();
          set({ settings: nextSettings });
        })(), {
          key: STORAGE_KEY,
          operation: 'reload',
          owner: 'useChatSettingsStore.reloadFromStorage',
        });
      },
    })),
  );
}

/** `createChatSettingsStore()` 返回的 zustand hook 类型。 */
type ChatSettingsStoreHook = ReturnType<typeof createChatSettingsStore>;

/**
 * 说明：Dev/HMR 场景下，把 store 缓存在 globalThis，避免重复创建导致订阅重复与状态丢失。
 */
interface GlobalThisWithChatSettingsStore {
  /** HMR/多次模块执行时复用的全局 store 单例。 */
  __olyqUseChatSettingsStoreV1__?: ChatSettingsStoreHook;
  /** 标记持久化订阅与 reload 监听是否已经初始化。 */
  __olyqUseChatSettingsStoreV1Inited__?: boolean;
  /** 当前绑定到 i18n 的语言切换监听器，用于 HMR / 测试重建时卸载旧闭包。 */
  __olyqUseChatSettingsStoreV1LanguageHandler__?: () => void;
}

const globalForChatSettingsStore = globalThis as unknown as GlobalThisWithChatSettingsStore;
const chatSettingsStore =
  globalForChatSettingsStore.__olyqUseChatSettingsStoreV1__ ?? createChatSettingsStore();
globalForChatSettingsStore.__olyqUseChatSettingsStoreV1__ = chatSettingsStore;

/**
 * 初始化全局唯一的聊天设置 store。
 *
 * 说明：
 * - 只在首次模块执行时绑定持久化与全局 reload 监听；
 * - HMR 下若重复订阅，会导致一次修改写入多次，因此这里必须做单次初始化保护。
 */
function initChatSettingsStoreOnce(store: ChatSettingsStoreHook): void {
  if (globalForChatSettingsStore.__olyqUseChatSettingsStoreV1Inited__) return;
  globalForChatSettingsStore.__olyqUseChatSettingsStoreV1Inited__ = true;

  if (typeof window === 'undefined') return;
  const settingsHydratedFromStartupStorage = hasExtensionPageStartupStorageValue(STORAGE_KEY);
  let persistedSnapshot = serializeSettings(store.getState().settings);

  store.subscribe(
    (s) => s.settings,
    (value) => {
      const serialized = serializeSettings(value);
      if (serialized === persistedSnapshot) return;
      persistedSnapshot = serialized;
      writeStoredJsonWithBootstrapMirrorInBackground(STORAGE_KEY, value, 'useChatSettingsStore');
    },
  );

    /**
   * 内部函数变量：`reload`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const reload = () => {
    consumeBackgroundStoragePromise((async () => {
      const nextSettings = await loadNormalizedSettingsFromStorage();
      persistedSnapshot = serializeSettings(nextSettings);
      store.setState({ settings: nextSettings });
    })(), {
      key: STORAGE_KEY,
      operation: 'reload',
      owner: 'useChatSettingsStore.reload',
    });
  };
  subscribeStoredKeys([STORAGE_KEY], reload);
  subscribeStoreReloadSignal(reload);
  if (globalForChatSettingsStore.__olyqUseChatSettingsStoreV1LanguageHandler__) {
    i18n.off('languageChanged', globalForChatSettingsStore.__olyqUseChatSettingsStoreV1LanguageHandler__);
  }
  /**
   * i18n 语言切换监听器。
   *
   * 说明：
   * - HMR 或测试重建 store 时，旧闭包可能仍短暂挂在同一个 i18n 实例上；
   * - 只有全局 store 单例仍指向当前 store 时，才允许按当前 UI 语言重写默认 system prompt。
   */
  const languageHandler = () => {
    if (globalForChatSettingsStore.__olyqUseChatSettingsStoreV1__ !== store) return;
    applyLocalizedDefaultSystemPrompt(store);
  };
  globalForChatSettingsStore.__olyqUseChatSettingsStoreV1LanguageHandler__ = languageHandler;
  i18n.on('languageChanged', languageHandler);
  if (!settingsHydratedFromStartupStorage) reload();
}

initChatSettingsStoreOnce(chatSettingsStore);

/** 暴露给非 React 场景复用的 store API 子集。 */
type ChatSettingsStoreApi = Pick<
  ChatSettingsStoreHook,
  'getState' | 'setState' | 'subscribe' | 'getInitialState'
>;

/**
 * 说明：useChatSettingsStore 的安全导出类型：
 * - 强制传 selector，避免误用 `useChatSettingsStore()` 订阅整个 state
 * - 同时保留 getState/setState/subscribe：便于非 React 场景复用
 */
export type UseChatSettingsStore = {
  /** 订阅 store 中某个切片。 */
  <T>(selector: (state: ChatSettingsStore) => T, equalityFn?: (a: T, b: T) => boolean): T;
} & ChatSettingsStoreApi;

/** 聊天默认设置的全局 zustand hook。 */
export const useChatSettingsStore: UseChatSettingsStore = chatSettingsStore;
