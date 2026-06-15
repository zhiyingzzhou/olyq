/**
 * 说明：`extension-page-startup` 扩展页启动模块。
 *
 * 职责：
 * - 统一 Side Panel 扩展页的启动期存储预取；
 * - 生成单次页面会话内可复用的启动快照；
 * - 在 React 挂载前修正主题与显示相关的根节点属性，并控制首屏 reveal 时机。
 *
 * 边界：
 * - 这里只处理扩展页启动期的轻量快照与首帧 DOM 协调；
 * - 不负责业务 store 的长期同步，也不在这里承载 React 级状态管理。
 */
import { sanitizeAssistants } from '@/lib/assistant/assistant-storage';
import { ASSISTANT_PRESETS_STORAGE_KEY } from '@/lib/assistant/preset-storage';
import { getTopicMessages } from '@/lib/chat/messages-db';
import { resolveRuntimeSelection, sanitizeRuntime } from '@/lib/chat/runtime-selection';
import { ASSISTANTS_STORAGE_KEY, CHAT_RUNTIME_STORAGE_KEY, LEGAL_PRESET_REMEDIATION_MARKER_KEY } from '@/lib/legal/preset-remediation';
import { runStartupPersistenceMigrations } from '@/lib/persistence/schema-migration-engine';
import {
  readBootstrapStoredJsonSeed,
  removeBootstrapStoredJsonMirror,
  writeBootstrapStoredJsonMirror,
} from '@/lib/storage/json-storage';
import { getStorageAdapter } from '@/lib/storage/storage-adapter';
import type { Message } from '@/types/chat';
import { applyDarkThemeColorSelectionToDom } from '@/lib/dark-theme-colors';
import { THEME_STORAGE_KEY, normalizeTheme } from '@/lib/theme-schema';
import { DISPLAY_SETTINGS_STORAGE_KEY } from '@/lib/display-settings-schema';

export { THEME_STORAGE_KEY } from '@/lib/theme-schema';
export { DISPLAY_SETTINGS_STORAGE_KEY } from '@/lib/display-settings-schema';

/** 深色主题色存储 key。 */
export const DARK_THEME_COLOR_STORAGE_KEY = 'olyq.dark-theme-color.v1';
/** i18n 语言存储 key。 */
export const LANGUAGE_STORAGE_KEY = 'olyq.language.v1';
/** 全局聊天默认设置存储 key。 */
export const CHAT_SETTINGS_STORAGE_KEY = 'olyq.chat.settings.v1';
/** 扩展页 ready 标记属性。 */
export const EXTENSION_PAGE_READY_ATTRIBUTE = 'data-extension-page-ready';

const STARTUP_KEYS = [
  LEGAL_PRESET_REMEDIATION_MARKER_KEY,
  THEME_STORAGE_KEY,
  DARK_THEME_COLOR_STORAGE_KEY,
  DISPLAY_SETTINGS_STORAGE_KEY,
  LANGUAGE_STORAGE_KEY,
  ASSISTANTS_STORAGE_KEY,
  ASSISTANT_PRESETS_STORAGE_KEY,
  CHAT_RUNTIME_STORAGE_KEY,
  CHAT_SETTINGS_STORAGE_KEY,
] as const;

type ExtensionPageStartupKey = (typeof STARTUP_KEYS)[number];
type ExtensionPageStartupSource = 'storage' | 'bootstrap' | 'default';

/** 单个启动期 key 的来源和值。 */
export interface ExtensionPageStartupSnapshotEntry {
  source: ExtensionPageStartupSource;
  value?: unknown;
}

/** 当前扩展页启动期预取到的快照。 */
export interface ExtensionPageStartupSnapshot {
  createdAt: number;
  entries: Record<ExtensionPageStartupKey, ExtensionPageStartupSnapshotEntry>;
  activeConversation: ExtensionPageStartupActiveConversation;
}

/** 扩展页启动时当前激活会话的首轮结果。 */
export interface ExtensionPageStartupActiveConversation {
  /**
   * 当前页启动阶段对激活会话的判定状态。
   *
   * 说明：
   * - `none`：启动期确认当前没有可进入的话题；
   * - `ready`：已拿到激活话题及其首轮消息，可直接作为首屏权威；
   * - `loading-fallback`：已解析出目标话题，但消息库暂时不可读，只允许退化成单一 loading 壳子。
   */
  status: 'none' | 'ready' | 'loading-fallback';
  /** 当前激活助手 ID。 */
  assistantId: string | null;
  /** 当前激活话题 ID。 */
  topicId: string | null;
  /** 启动期预取到的首轮消息快照。 */
  messages: Message[];
}

interface GlobalThisWithExtensionPageStartup {
  __olyqExtensionPageStartupSnapshotV1__?: ExtensionPageStartupSnapshot;
  __olyqExtensionPageStartupPromiseV1__?: Promise<ExtensionPageStartupSnapshot>;
}

const BOOTSTRAP_MISSING = Symbol('extension-page-startup-missing');

/**
 * 获取扩展页启动快照使用的全局槽位。
 *
 * @remarks
 * 这里故意不用模块顶层 `const` 缓存 `globalThis`，避免循环 import 时其它 shared channel
 * 在本模块初始化完成前读取启动值而触发 TDZ。
 */
function getExtensionPageStartupGlobal(): typeof globalThis & GlobalThisWithExtensionPageStartup {
  return globalThis as typeof globalThis & GlobalThisWithExtensionPageStartup;
}

/**
 * 判断启动期快照条目是否携带值。
 *
 * 说明：
 * - `default` 表示 storage 中明确缺失，且旧 mirror 已被清理；
 * - 因此此时不能再回退到 bootstrap mirror。
 */
function hasSnapshotValue(entry: ExtensionPageStartupSnapshotEntry | undefined): entry is ExtensionPageStartupSnapshotEntry & { value: unknown } {
  return !!entry && entry.source !== 'default' && 'value' in entry;
}

/**
 * 从 bootstrap mirror 读取某个 key 的回退值。
 *
 * 说明：
 * - 这里只读取 `__olyq.bootstrap__.*`，绝不读取旧 raw localStorage 真源；
 * - 若 mirror 缺失或过期，则返回 `default`。
 */
function readBootstrapEntry(key: ExtensionPageStartupKey): ExtensionPageStartupSnapshotEntry {
  const value = readBootstrapStoredJsonSeed(key, BOOTSTRAP_MISSING, (raw) => raw);
  if (value === BOOTSTRAP_MISSING) return { source: 'default' };
  return { source: 'bootstrap', value };
}

/**
 * 规范化主题值，供启动期根节点属性修正使用。
 *
 * 说明：
 * - 这里只做最小语义判断，避免为了启动前修正再引入完整主题模块。
 */
function normalizeThemeForBoot(raw: unknown): 'light' | 'dark' | null {
  return normalizeTheme(raw);
}

/**
 * 判断当前上下文是否可访问 IndexedDB。
 *
 * 说明：
 * - 扩展页启动阶段允许在 UI 挂载前直接预取消息；
 * - 但测试环境、极端浏览器异常或离屏限制下可能没有 IndexedDB，此时只能退化为 loading。
 */
function hasIndexedDbSupport(): boolean {
  return typeof indexedDB !== 'undefined';
}

/**
 * 从启动期 entries 中解析当前激活会话与首轮消息结果。
 *
 * 说明：
 * - 这里不会写回 mirror，也不会改动共享存储；
 * - 若消息库不可读，只返回 `loading-fallback`，让上层首屏显示单一稳定 loading；
 * - 若启动阶段确认当前没有有效话题，则返回 `none`，后续由业务 store 自己决定默认空工作区。
 */
async function resolveStartupActiveConversation(
  entries: Record<ExtensionPageStartupKey, ExtensionPageStartupSnapshotEntry>,
): Promise<ExtensionPageStartupActiveConversation> {
  const assistants = hasSnapshotValue(entries[ASSISTANTS_STORAGE_KEY])
    ? sanitizeAssistants(entries[ASSISTANTS_STORAGE_KEY].value, {
      sort: true,
      fallbackToDefaultTopics: false,
    })
    : [];
  const runtime = hasSnapshotValue(entries[CHAT_RUNTIME_STORAGE_KEY])
    ? sanitizeRuntime(entries[CHAT_RUNTIME_STORAGE_KEY].value)
    : sanitizeRuntime(null);
  const resolved = resolveRuntimeSelection(assistants, runtime);

  if (!resolved) {
    return {
      status: 'none',
      assistantId: null,
      topicId: null,
      messages: [],
    };
  }

  if (!hasIndexedDbSupport()) {
    return {
      status: 'loading-fallback',
      assistantId: resolved.assistantId,
      topicId: resolved.topicId,
      messages: [],
    };
  }

  try {
    const messages = await getTopicMessages(resolved.topicId);
    return {
      status: 'ready',
      assistantId: resolved.assistantId,
      topicId: resolved.topicId,
      messages: Array.isArray(messages) ? messages : [],
    };
  } catch {
    return {
      status: 'loading-fallback',
      assistantId: resolved.assistantId,
      topicId: resolved.topicId,
      messages: [],
    };
  }
}

/**
 * 把启动期已知的主题立即应用到根节点。
 *
 * 说明：
 * - boot.js 只会读取 bootstrap mirror；
 * - 若 storage 真源与 mirror 不一致，这里会在 reveal 前再修正一次，确保首帧只显示最终状态。
 */
function applyBootDomStateFromSnapshot(snapshot: ExtensionPageStartupSnapshot): void {
  if (typeof document === 'undefined') return;

  const themeEntry = snapshot.entries[THEME_STORAGE_KEY];
  const themeMode = hasSnapshotValue(themeEntry)
    ? normalizeThemeForBoot(themeEntry.value)
    : null;
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? true;
  const finalThemeMode = themeMode ?? (prefersDark ? 'dark' : 'light');
  document.documentElement.classList.toggle('dark', finalThemeMode === 'dark');

  const darkThemeColorEntry = snapshot.entries[DARK_THEME_COLOR_STORAGE_KEY];
  applyDarkThemeColorSelectionToDom(
    hasSnapshotValue(darkThemeColorEntry) ? darkThemeColorEntry.value : null,
    finalThemeMode === 'dark',
  );
}

/**
 * 从 storage 真源批量预取启动关键 key，并同步维护 bootstrap mirror。
 *
 * 说明：
 * - 命中 storage 的 key：写回 mirror，记为 `storage`；
 * - storage 明确缺失的 key：清掉旧 mirror，记为 `default`；
 * - storage 整体不可用时：仅回退 bootstrap mirror，不回退旧 raw localStorage。
 */
async function readExtensionPageStartupEntries(): Promise<Record<ExtensionPageStartupKey, ExtensionPageStartupSnapshotEntry>> {
  const entries = {} as Record<ExtensionPageStartupKey, ExtensionPageStartupSnapshotEntry>;
  const storage = getStorageAdapter();

  try {
    const stored = await storage.get([...STARTUP_KEYS]);
    for (const key of STARTUP_KEYS) {
      if (key in stored) {
        const value = stored[key];
        writeBootstrapStoredJsonMirror(key, value);
        entries[key] = { source: 'storage', value };
        continue;
      }
      removeBootstrapStoredJsonMirror(key);
      entries[key] = { source: 'default' };
    }
    return entries;
  } catch {
    for (const key of STARTUP_KEYS) {
      entries[key] = readBootstrapEntry(key);
    }
    return entries;
  }
}

/**
 * 预取当前扩展页的启动快照。
 *
 * 说明：
 * - 同一页面会话内只执行一次；
 * - 先跑持久化迁移，再读 storage 真源，避免拿到迁移前的旧值。
 */
export async function bootstrapExtensionPageStartup(): Promise<ExtensionPageStartupSnapshot> {
  const globalForExtensionPageStartup = getExtensionPageStartupGlobal();
  if (globalForExtensionPageStartup.__olyqExtensionPageStartupSnapshotV1__) {
    return globalForExtensionPageStartup.__olyqExtensionPageStartupSnapshotV1__;
  }
  if (globalForExtensionPageStartup.__olyqExtensionPageStartupPromiseV1__) {
    return globalForExtensionPageStartup.__olyqExtensionPageStartupPromiseV1__;
  }

  globalForExtensionPageStartup.__olyqExtensionPageStartupPromiseV1__ = (async () => {
    await runStartupPersistenceMigrations();
    const entries = await readExtensionPageStartupEntries();
    const snapshot: ExtensionPageStartupSnapshot = {
      createdAt: Date.now(),
      entries,
      activeConversation: await resolveStartupActiveConversation(entries),
    };
    globalForExtensionPageStartup.__olyqExtensionPageStartupSnapshotV1__ = snapshot;
    applyBootDomStateFromSnapshot(snapshot);
    return snapshot;
  })();

  return globalForExtensionPageStartup.__olyqExtensionPageStartupPromiseV1__;
}

/**
 * 读取某个 key 的启动期值。
 *
 * 说明：
 * - 若当前页已有启动快照，则以快照为准；
 * - 只有在当前页没有跑过 bootstrap 时，才回退 bootstrap mirror。
 */
export function readExtensionPageStartupValue<T>(
  key: ExtensionPageStartupKey,
  fallback: T,
  coerce?: (raw: unknown) => T,
): T {
  const snapshot = getExtensionPageStartupGlobal().__olyqExtensionPageStartupSnapshotV1__;
  if (!snapshot) return readBootstrapStoredJsonSeed(key, fallback, coerce);

  const entry = snapshot.entries[key];
  if (!hasSnapshotValue(entry)) return fallback;
  return coerce ? coerce(entry.value) : (entry.value as T);
}

/**
 * 判断当前页某个启动 key 是否已经从 storage 真源预取成功。
 *
 * 说明：
 * - 只有命中 `storage` 时，调用方才可以跳过模块初始化后的那次首轮 reload；
 * - 命中 `bootstrap` 说明当前页仍然只是使用预热 mirror，后续仍要异步回读真源纠偏。
 */
export function hasExtensionPageStartupStorageValue(key: ExtensionPageStartupKey): boolean {
  return getExtensionPageStartupGlobal().__olyqExtensionPageStartupSnapshotV1__?.entries[key]?.source === 'storage';
}

/**
 * 获取当前页启动快照。
 *
 * 说明：
 * - 只读返回当前全局快照，供调试或测试使用；
 * - 不会触发新的 bootstrap 流程。
 */
export function getExtensionPageStartupSnapshot(): ExtensionPageStartupSnapshot | null {
  return getExtensionPageStartupGlobal().__olyqExtensionPageStartupSnapshotV1__ ?? null;
}

/**
 * 在首个 React commit 完成后揭示扩展页根节点。
 */
export function revealExtensionPageRoot(): void {
  if (typeof document === 'undefined') return;
  document.body?.setAttribute(EXTENSION_PAGE_READY_ATTRIBUTE, 'true');
}

/**
 * 导出常量：`__extensionPageStartupTestUtils`。
 *
 * @remarks
 * 用于承载当前模块对外共享的测试辅助能力。
 */
export const __extensionPageStartupTestUtils = {
  /**
   * 重置扩展页启动快照测试环境。
   *
   * @remarks
   * 仅供测试代码清理全局单例使用，不在运行时代码中调用。
   */
  reset(): void {
    const globalForExtensionPageStartup = getExtensionPageStartupGlobal();
    delete globalForExtensionPageStartup.__olyqExtensionPageStartupSnapshotV1__;
    delete globalForExtensionPageStartup.__olyqExtensionPageStartupPromiseV1__;
  },
  /**
   * 注入一份测试专用启动快照，并同步维护 bootstrap mirror。
   *
   * @remarks
   * 用于让单测以“已经跑过真实 bootstrap”的方式启动目标模块。
   */
  setSnapshot(snapshot: ExtensionPageStartupSnapshot): void {
    const globalForExtensionPageStartup = getExtensionPageStartupGlobal();
    for (const key of STARTUP_KEYS) {
      const entry = snapshot.entries[key];
      if (hasSnapshotValue(entry)) writeBootstrapStoredJsonMirror(key, entry.value);
      else removeBootstrapStoredJsonMirror(key);
    }
    globalForExtensionPageStartup.__olyqExtensionPageStartupSnapshotV1__ = snapshot;
    delete globalForExtensionPageStartup.__olyqExtensionPageStartupPromiseV1__;
  },
};
