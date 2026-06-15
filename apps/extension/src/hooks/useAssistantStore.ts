/**
 * 说明：`useAssistantStore` Hook 模块。
 *
 * 职责：
 * - 承载 `useAssistantStore` 相关的当前文件实现与模块边界；
 * - 对外暴露 `UseAssistantStore`、`useAssistantStore` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * Assistant Store（V1）：
 * - `Assistant` 是唯一主业务实体；
 * - `Topic` 直接挂在 `assistant.topics[]` 下；
 * - `AssistantPreset` 只用于创建助手实例；
 * - 不再维护旧的独立话题索引或模板偏好结构。
 */

import { createWithEqualityFn } from 'zustand/traditional';
import { subscribeWithSelector } from 'zustand/middleware';

import {
  ASSISTANT_PRESETS_STORAGE_KEY,
  buildStoredAssistantPresetRecord,
  normalizeImportedStoredAssistantPresets,
  sanitizeStoredAssistantPresets,
  type StoredAssistantPresetDraft,
} from '@/lib/assistant/preset-storage';
import {
  buildAssistantPresetCatalogScaffold as buildAssistantPresetCatalogScaffoldFromData,
  buildBuiltinDefaultAssistantPreset as buildBuiltinDefaultAssistantPresetFromData,
  loadAssistantPresetCatalog as loadAssistantPresetCatalogFromData,
  loadAssistantPresets as loadAssistantPresetsFromData,
  type AssistantPresetSection,
} from '@/data/role-templates';
import i18n from '@/i18n';
import {
  normalizeStringArray,
  sanitizeAssistants,
  sanitizeTopicList,
} from '@/lib/assistant/assistant-storage';
import { normalizeAssistantIconId } from '@/lib/assistant-icons';
import { normalizeBrowserContextConversationMode } from '@/lib/browser-context/types';
import { createTopicRecord, normalizeTopicName, sortAssistants } from '@/lib/chat/topic-tree';
import { DEFAULT_TOPIC_TITLE_FALLBACK } from '@/lib/chat/topic-tree-core';
import { normalizeQuickPhrases } from '@/lib/quick-phrases/phrase-normalize';
import { sanitizeMcpServerSelection } from '@/lib/mcp/selection';
import {
  recordAssistantDeletion,
  recordAssistantFieldChange,
  recordTopicDeletion,
  recordTopicFieldChange,
} from '@/lib/sync/sync-engine';
import { createId } from '@/lib/utils/id';
import { isPlainRecord } from '@/lib/utils/type-guards';
import {
  readStoredJson,
  subscribeStoredKeys,
  writeStoredJsonInBackground,
} from '@/lib/storage/json-storage';
import { consumeBackgroundStoragePromise } from '@/lib/storage/background-storage';
import {
  getExtensionPageStartupSnapshot,
  readExtensionPageStartupValue,
} from '@/lib/extension/extension-page-startup';
import { subscribeStoreReloadSignal } from '@/lib/storage/reload-signal';
import {
  normalizeAssistantScenario,
  type Assistant,
  type AssistantConfig,
  type AssistantPreset,
  type StoredAssistantPreset,
} from '@/types/assistant';
import {
  ASSISTANTS_STORAGE_KEY,
  ensureLegalPresetRemediation,
} from '@/lib/legal/preset-remediation';
import { removeBrowserContextAssistantOverride, seedBrowserContextAssistantOverride } from '@/lib/browser-context/policy';
import { BROWSER_CONTEXT_PRESET_PROFILE_MAP } from '@/lib/browser-context/types';
import {
  BUILTIN_DEFAULT_ROLE_TEMPLATE_ID,
  DEFAULT_ASSISTANT_ID,
} from '@/types/assistant';
import type { Topic } from '@/types/chat';

const STORAGE_KEY = ASSISTANTS_STORAGE_KEY;
const PRESET_STORAGE_KEY = ASSISTANT_PRESETS_STORAGE_KEY;

// 说明：助手列表的真源已经统一落到共享 JSON 存储。
// 这里仍然允许从 bootstrap seed 启动，是为了在首帧渲染前尽早拿到一份可用快照；
// 真正的纠偏和法务修复仍然以后续异步 reload 结果为准。

/**
 * 将助手列表序列化为稳定快照字符串。
 *
 * @remarks
 * 这里只用于“是否发生变更”的轻量比较，不承担持久化协议职责。
 * 一旦序列化失败，返回空字符串，让后续写入逻辑走保守分支。
 */
function serializeAssistants(assistants: Assistant[]) {
  try {
    return JSON.stringify(assistants);
  } catch {
    return '';
  }
}

/**
 * 将用户预设列表序列化为稳定快照字符串。
 *
 * @remarks
 * 只用于判断“我的预设”是否发生变化，避免重复写入共享存储。
 */
function serializeStoredPresets(presets: StoredAssistantPreset[]) {
  try {
    return JSON.stringify(presets);
  } catch {
    return '';
  }
}

/**
 * 返回当前语言下的话题兜底标题。
 *
 * @remarks
 * 助手 store 负责用户可见的默认入口话题，因此这里要优先跟随当前 i18n 语言，
 * 只有在资源尚未就绪时才回退到内置常量。
 */
function getTopicFallbackTitle(): string {
  return i18n.t('chat.defaultTopicTitle') || DEFAULT_TOPIC_TITLE_FALLBACK;
}

/**
 * 内部函数：`getBuiltinDefaultAssistantPreset`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function getBuiltinDefaultAssistantPreset(): AssistantPreset {
  return buildBuiltinDefaultAssistantPresetFromData(i18n.language || 'zh-CN');
}

/**
 * 内部函数：`getEmptyPresetSections`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function getEmptyPresetSections(): AssistantPresetSection[] {
  return buildAssistantPresetCatalogScaffoldFromData(i18n.language || 'zh-CN');
}

/**
 * 选择默认兜底用的助手预设。
 *
 * @remarks
 * 当持久化数据被清空、法务修复移除了非法预设，或者 i18n 资源尚未加载完成时，
 * store 仍然需要一个稳定的“至少一个助手”来源。
 */
function pickDefaultAssistantPreset(presets: AssistantPreset[]): AssistantPreset {
  return (
    presets.find((preset) => preset.id === BUILTIN_DEFAULT_ROLE_TEMPLATE_ID)
    ?? presets[0]
    ?? getBuiltinDefaultAssistantPreset()
  );
}

/**
 * 按更新时间降序排列用户预设。
 *
 * @remarks
 * “我的预设”列表默认把最近维护的项放在前面，管理模式和普通浏览都共用这套排序。
 */
function sortStoredPresets(presets: StoredAssistantPreset[]): StoredAssistantPreset[] {
  return [...presets].sort((left, right) => {
    if (right.updatedAt !== left.updatedAt) return right.updatedAt - left.updatedAt;
    if (right.createdAt !== left.createdAt) return right.createdAt - left.createdAt;
    return left.name.localeCompare(right.name);
  });
}

/**
 * 在“内置 + 用户”全集里查找指定预设。
 *
 * @remarks
 * 新的助手商店支持从内置预设和用户预设创建助手，因此这里不能再只查内置列表。
 */
function findAssistantPresetById(
  builtinPresets: AssistantPreset[],
  userPresets: StoredAssistantPreset[],
  presetId: string,
): AssistantPreset | StoredAssistantPreset | null {
  const normalizedPresetId = String(presetId || '').trim();
  if (!normalizedPresetId) return null;
  return builtinPresets.find((item) => item.id === normalizedPresetId)
    ?? userPresets.find((item) => item.id === normalizedPresetId)
    ?? null;
}

interface AssistantDraft extends Omit<Assistant, 'id' | 'order' | 'createdAt' | 'updatedAt' | 'topics'> {
  topics?: Topic[];
}

/**
 * 从草稿配置构造可落盘的助手记录。
 *
 * @remarks
 * 该函数承担“创建态统一收口点”的职责：
 * - 生成或规范化主键；
 * - 修正互斥字段；
 * - 补足时间戳、排序值和默认话题。
 */
function buildAssistantRecord(
  data: AssistantDraft,
  {
    assistantId = createId(),
    createdAt = Date.now(),
    order = createdAt,
  }: { assistantId?: string; createdAt?: number; order?: number } = {},
): Assistant {
  const normalizedAssistantId = String(assistantId || '').trim() || createId();
  let enableWebSearch = data.enableWebSearch;
  let webSearchProviderId = typeof data.webSearchProviderId === 'string' ? data.webSearchProviderId.trim() || undefined : undefined;
  if (webSearchProviderId) enableWebSearch = false;
  if (enableWebSearch) webSearchProviderId = undefined;
  const regularPhrases = normalizeQuickPhrases(data.regularPhrases);

  return {
    id: normalizedAssistantId,
    scenario: normalizeAssistantScenario(data.scenario),
    name: String(data.name || '').trim(),
    description: typeof data.description === 'string' ? data.description : undefined,
    iconId: normalizeAssistantIconId(data.iconId),
    prompt: String(data.prompt || '').trim(),
    mcpSelection: sanitizeMcpServerSelection(data.mcpSelection, 'auto'),
    enableWebSearch,
    webSearchProviderId,
    enableGenerateImage: typeof data.enableGenerateImage === 'boolean' ? data.enableGenerateImage : undefined,
    enableMemory: typeof data.enableMemory === 'boolean' ? data.enableMemory : undefined,
    tags: normalizeStringArray(data.tags),
    ...(regularPhrases.length > 0 ? { regularPhrases } : {}),
    topics: sanitizeTopicList(data.topics, normalizedAssistantId, {
      fallbackTopicTitle: getTopicFallbackTitle(),
    }),
    order: typeof order === 'number' && Number.isFinite(order) ? order : createdAt,
    createdAt,
    updatedAt: createdAt,
  };
}

/**
 * 从预设物化出一个实际助手实例。
 *
 * @remarks
 * 预设本身只表示模板，不应该直接进入运行时列表。
 * 这里会把模板字段复制到一份真正可编辑、可同步、可落盘的助手对象上。
 */
function materializeAssistantFromPreset(
  preset: AssistantPreset,
  overrides?: { assistantId?: string; createdAt?: number; order?: number },
): Assistant {
  return buildAssistantRecord(
    {
      scenario: preset.scenario,
      name: preset.name,
      description: preset.description,
      iconId: preset.iconId,
      prompt: preset.prompt,
      mcpSelection: preset.mcpSelection,
      enableWebSearch: preset.enableWebSearch,
      webSearchProviderId: preset.webSearchProviderId,
      enableGenerateImage: preset.enableGenerateImage,
      enableMemory: preset.enableMemory,
      regularPhrases: preset.regularPhrases,
      tags: preset.tags,
    },
    overrides,
  );
}

/**
 * 保证运行时助手列表始终非空且顺序稳定。
 *
 * @remarks
 * UI、聊天入口、同步域和恢复逻辑都默认助手列表至少有一个元素。
 * 因此“空数组”不是合法稳态，而是一个需要立即兜底的过渡态。
 */
function ensureAssistantList(assistants: Assistant[], presets: AssistantPreset[]): Assistant[] {
  if (assistants.length > 0) return sortAssistants(assistants);
  return sortAssistants([
    materializeAssistantFromPreset(pickDefaultAssistantPreset(presets), { assistantId: DEFAULT_ASSISTANT_ID }),
  ]);
}

/**
 * 内部函数：`sortTopics`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function sortTopics(topics: Topic[]): Topic[] {
  return [...topics].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    const ao = typeof a.order === 'number' ? a.order : a.updatedAt;
    const bo = typeof b.order === 'number' ? b.order : b.updatedAt;
    return bo - ao;
  });
}

/**
 * 内部函数：`applyReorderedTopicOrder`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function applyReorderedTopicOrder(topics: Topic[]): Topic[] {
  const base = Date.now();
  return topics.map((topic, index) => ({
    ...topic,
    order: base - index,
  }));
}

/**
 * 内部函数：`applyReorderedAssistantOrder`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function applyReorderedAssistantOrder(assistants: Assistant[]): Assistant[] {
  const base = Date.now();
  return assistants.map((assistant, index) => ({
    ...assistant,
    order: base - index,
  }));
}

/**
 * 内部函数：`reorderItemsByIds`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function reorderItemsByIds<T extends { id: string }>(items: T[], orderedIds: string[]): T[] {
  const normalizedIds = orderedIds.map((item) => String(item || '').trim()).filter(Boolean);
  const idSet = new Set(normalizedIds);
  if (idSet.size < 1) return items;

  const itemMap = new Map(items.map((item) => [item.id, item]));
  const orderedItems = normalizedIds
    .map((id) => itemMap.get(id) ?? null)
    .filter(Boolean) as T[];
  if (orderedItems.length < 1) return items;

  let cursor = 0;
  return items.map((item) => {
    if (!idSet.has(item.id)) return item;
    const replacement = orderedItems[cursor] ?? item;
    cursor += 1;
    return replacement;
  });
}

/**
 * 内部函数：`replaceAssistantTopics`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function replaceAssistantTopics(assistants: Assistant[], assistantId: string, topics: Topic[]): Assistant[] {
  const now = Date.now();
  const normalizedTopics = sortTopics(sanitizeTopicList(topics, assistantId, {
    fallbackTopicTitle: getTopicFallbackTitle(),
  }));
  return assistants.map((assistant) => (
    assistant.id === assistantId
      ? { ...assistant, topics: normalizedTopics, updatedAt: now }
      : assistant
  ));
}

interface AssistantStore {
  presets: AssistantPreset[];
  presetSections: AssistantPresetSection[];
  userPresets: StoredAssistantPreset[];
  assistants: Assistant[];

  getAssistant: (id: string) => Assistant | null;
  loadAssistantPresets: () => Promise<void>;
  createPreset: (draft: StoredAssistantPresetDraft) => string;
  updatePreset: (presetId: string, updates: Partial<StoredAssistantPresetDraft>) => void;
  deletePresets: (presetIds: string[]) => void;
  importPresets: (input: unknown) => StoredAssistantPreset[];
  exportPresets: (presetIds?: string[]) => StoredAssistantPreset[];
  createAssistantFromPreset: (presetId: string) => string;
  updateAssistantConfig: (id: string, updates: Partial<AssistantConfig>) => void;
  deleteAssistant: (id: string) => void;
  reorderAssistants: (assistantIds: string[]) => void;
  reloadFromStorage: () => void;

  createTopic: (assistantId: string, name?: string) => string;
  deleteTopic: (topicId: string) => void;
  renameTopic: (topicId: string, name: string, markManuallyEdited?: boolean) => void;
  updateTopicMeta: (topicId: string, patch: Partial<Omit<Topic, 'id' | 'assistantId'>>) => void;
  togglePinTopic: (topicId: string) => void;
  moveTopicToAssistant: (topicId: string, toAssistantId: string) => void;
  reorderTopics: (assistantId: string, topicIds: string[]) => void;
}

/**
 * 创建助手 store，并把同步、预设和话题操作统一收口在同一个状态机里。
 *
 * @remarks
 * 这里不直接在模块顶层写存储，是为了兼顾：
 * - SSR / test 环境下的惰性初始化；
 * - 单例 store 只初始化一次；
 * - bootstrap seed 可在首帧提供最小可用状态。
 */
function createAssistantStore() {
  const initialPresets = [getBuiltinDefaultAssistantPreset()];
  const initialPresetSections = getEmptyPresetSections();
  const initialUserPresets = sanitizeStoredAssistantPresets(
    readExtensionPageStartupValue<unknown>(PRESET_STORAGE_KEY, [], (raw) => raw),
  );
  // 说明：启动阶段先读 bootstrap seed，避免首屏闪烁为空列表；
  // 真正共享真源会在 `initAssistantStoreOnce` 的 reload 链路里二次覆盖。
  const initialAssistants = ensureAssistantList(
    sanitizeAssistants(readExtensionPageStartupValue<unknown>(STORAGE_KEY, [], (raw) => raw), {
      fallbackTopicTitle: getTopicFallbackTitle(),
    }),
    initialPresets,
  );

  return createWithEqualityFn<AssistantStore>()(
    subscribeWithSelector((set, get) => ({
      presets: initialPresets,
      presetSections: initialPresetSections,
      userPresets: initialUserPresets,
      assistants: initialAssistants,

      getAssistant: (id) => {
        const assistantId = String(id || '').trim();
        if (!assistantId) return null;
        return get().assistants.find((assistant) => assistant.id === assistantId) ?? null;
      },

      loadAssistantPresets: async () => {
        // 说明：预设目录可能被法务修复改写，因此每次加载前都先确保补丁已应用。
        await ensureLegalPresetRemediation();
        const lang = i18n.language || 'zh-CN';
        try {
          const [presets, presetSections] = await Promise.all([
            loadAssistantPresetsFromData(lang),
            loadAssistantPresetCatalogFromData(lang),
          ]);
          set((state) => ({
            presets,
            presetSections,
            userPresets: state.userPresets,
            assistants: ensureAssistantList(state.assistants, presets),
          }));
        } catch {
          const fallbackTemplates = [getBuiltinDefaultAssistantPreset()];
          const fallbackSections = buildAssistantPresetCatalogScaffoldFromData(lang);
          set((state) => ({
            presets: fallbackTemplates,
            presetSections: fallbackSections,
            userPresets: state.userPresets,
            assistants: ensureAssistantList(state.assistants, fallbackTemplates),
          }));
        }
      },

      createPreset: (draft) => {
        const preset = buildStoredAssistantPresetRecord(draft);
        if (!preset) return '';
        set((state) => ({
          userPresets: sortStoredPresets([preset, ...state.userPresets.filter((item) => item.id !== preset.id)]),
        }));
        return preset.id;
      },

      updatePreset: (presetId, updates) => {
        const normalizedPresetId = String(presetId || '').trim();
        if (!normalizedPresetId) return;
        const currentPreset = get().userPresets.find((item) => item.id === normalizedPresetId) ?? null;
        if (!currentPreset) return;

        const nextPreset = buildStoredAssistantPresetRecord(
          {
            scenario: 'scenario' in updates ? normalizeAssistantScenario(updates.scenario) : currentPreset.scenario,
            iconId: 'iconId' in updates ? updates.iconId : currentPreset.iconId,
            name: 'name' in updates ? String(updates.name || '').trim() : currentPreset.name,
            description: 'description' in updates ? updates.description : currentPreset.description,
            prompt: 'prompt' in updates ? String(updates.prompt || '') : currentPreset.prompt,
            tags: 'tags' in updates ? updates.tags : currentPreset.tags,
            enableWebSearch: 'enableWebSearch' in updates ? updates.enableWebSearch : currentPreset.enableWebSearch,
            enableGenerateImage: 'enableGenerateImage' in updates ? updates.enableGenerateImage : currentPreset.enableGenerateImage,
            enableMemory: 'enableMemory' in updates ? updates.enableMemory : currentPreset.enableMemory,
            mcpSelection: 'mcpSelection' in updates ? updates.mcpSelection : currentPreset.mcpSelection,
          },
          {
            presetId: currentPreset.id,
            createdAt: currentPreset.createdAt,
            updatedAt: Date.now(),
          },
        );
        if (!nextPreset) return;

        set((state) => ({
          userPresets: sortStoredPresets(
            state.userPresets.map((item) => (item.id === normalizedPresetId ? nextPreset : item)),
          ),
        }));
      },

      deletePresets: (presetIds) => {
        const normalizedIds = new Set(
          presetIds
            .map((item) => String(item || '').trim())
            .filter(Boolean),
        );
        if (normalizedIds.size < 1) return;
        set((state) => ({
          userPresets: state.userPresets.filter((item) => !normalizedIds.has(item.id)),
        }));
      },

      importPresets: (input) => {
        const state = get();
        const imported = normalizeImportedStoredAssistantPresets(input, {
          existingIds: [
            ...state.presets.map((item) => item.id),
            ...state.userPresets.map((item) => item.id),
          ],
        });
        if (imported.length < 1) return [];

        set((current) => ({
          userPresets: sortStoredPresets([...imported, ...current.userPresets]),
        }));
        return imported;
      },

      exportPresets: (presetIds) => {
        const normalizedIds = new Set(
          (presetIds ?? [])
            .map((item) => String(item || '').trim())
            .filter(Boolean),
        );
        const source = normalizedIds.size > 0
          ? get().userPresets.filter((item) => normalizedIds.has(item.id))
          : get().userPresets;
        return source.map((item) => ({ ...item }));
      },

      createAssistantFromPreset: (presetId) => {
        const normalizedPresetId = String(presetId || '').trim();
        if (!normalizedPresetId) return '';
        const preset = findAssistantPresetById(get().presets, get().userPresets, normalizedPresetId);
        if (!preset) return '';
        const assistant = materializeAssistantFromPreset(preset);
        set((state) => ({ assistants: sortAssistants([assistant, ...state.assistants]) }));
        const seededProfileId = BROWSER_CONTEXT_PRESET_PROFILE_MAP[normalizedPresetId];
        if (seededProfileId) seedBrowserContextAssistantOverride(assistant.id, seededProfileId);
        return assistant.id;
      },

      updateAssistantConfig: (id, updates) => {
        const assistantId = String(id || '').trim();
        if (!assistantId) return;
        const touchedFields = new Set<string>();

        set((state) => ({
          assistants: state.assistants.map((assistant) => {
            if (assistant.id !== assistantId) return assistant;

            // 说明：网页搜索的两套入口是互斥关系。
            // 显式 provider 优先级更高；一旦指定 provider，就不能再保留布尔开关态。
            let enableWebSearch = assistant.enableWebSearch;
            let webSearchProviderId = assistant.webSearchProviderId;
            const nextScenario = 'scenario' in updates
              ? normalizeAssistantScenario(updates.scenario)
              : assistant.scenario;
            if ('enableWebSearch' in updates) {
              enableWebSearch = typeof updates.enableWebSearch === 'boolean' ? updates.enableWebSearch : undefined;
            }
            if ('webSearchProviderId' in updates) {
              const providerId = typeof updates.webSearchProviderId === 'string' ? updates.webSearchProviderId.trim() : '';
              webSearchProviderId = providerId || undefined;
            }
            if (webSearchProviderId) enableWebSearch = false;
            if (enableWebSearch) webSearchProviderId = undefined;

            const nextName = typeof updates.name === 'string' ? updates.name.trim() : assistant.name;
            const nextPrompt = typeof updates.prompt === 'string' ? updates.prompt.trim() : assistant.prompt;
            const hasScenario = 'scenario' in updates;
            const hasName = 'name' in updates;
            const hasDescription = 'description' in updates;
            const hasIconId = 'iconId' in updates;
            const hasPrompt = 'prompt' in updates;
            const hasMcpSelection = 'mcpSelection' in updates;
            const hasEnableGenerateImage = 'enableGenerateImage' in updates;
            const hasEnableMemory = 'enableMemory' in updates;
            const hasTags = 'tags' in updates;
            const hasRegularPhrases = 'regularPhrases' in updates;
            const hasEnableWebSearch = 'enableWebSearch' in updates;
            const hasWebSearchProviderId = 'webSearchProviderId' in updates;

            // 说明：助手配置更新现在采用“显式字段覆盖”语义。
            // 只有调用方真的传了某个字段，才允许这里写回或清空；
            // 单纯更新 reasoningEffort 这类单字段场景，不再把其它可选字段误写成 undefined。
            if (hasScenario) touchedFields.add('scenario'); if (hasName && nextName) touchedFields.add('name');
            if (hasDescription) touchedFields.add('description'); if (hasIconId) touchedFields.add('iconId');
            if (hasPrompt) touchedFields.add('prompt');
            if (hasMcpSelection) touchedFields.add('mcpSelection');
            if (hasEnableGenerateImage) touchedFields.add('enableGenerateImage'); if (hasEnableMemory) touchedFields.add('enableMemory');
            if (hasTags) touchedFields.add('tags'); if (hasRegularPhrases) touchedFields.add('regularPhrases');
            if (hasEnableWebSearch) touchedFields.add('enableWebSearch'); if (hasWebSearchProviderId) touchedFields.add('webSearchProviderId');
            touchedFields.add('updatedAt');

            return {
              ...assistant,
              ...(hasScenario ? { scenario: nextScenario } : {}),
              ...(hasName && typeof updates.name === 'string' && nextName ? { name: nextName } : {}),
              ...(hasDescription && (typeof updates.description === 'string' || updates.description === undefined)
                ? { description: updates.description }
                : {}),
              ...(hasIconId
                ? { iconId: normalizeAssistantIconId(updates.iconId) }
                : {}),
              ...(hasPrompt && typeof updates.prompt === 'string' ? { prompt: nextPrompt } : {}),
              ...(hasMcpSelection
                ? { mcpSelection: sanitizeMcpServerSelection(updates.mcpSelection, 'auto') }
                : {}),
              ...(hasEnableGenerateImage
                ? { enableGenerateImage: typeof updates.enableGenerateImage === 'boolean' ? updates.enableGenerateImage : undefined }
                : {}),
              ...(hasEnableMemory
                ? { enableMemory: typeof updates.enableMemory === 'boolean' ? updates.enableMemory : undefined }
                : {}),
              ...(hasTags ? { tags: normalizeStringArray(updates.tags) } : {}),
              ...(hasRegularPhrases ? { regularPhrases: normalizeQuickPhrases(updates.regularPhrases) } : {}),
              enableWebSearch,
              webSearchProviderId,
              updatedAt: Date.now(),
            };
          }),
        }));

        // 说明：同步层按字段记录变更，后续才能用最小粒度生成 HLC/LWW 事件，
        // 避免每次编辑助手都被放大成整对象覆盖。
        for (const field of touchedFields) {
          recordAssistantFieldChange(assistantId, field);
        }
      },

      deleteAssistant: (id) => {
        const assistantId = String(id || '').trim();
        if (!assistantId) return;
        const deletedTopicIds: string[] = [];
        let deleted = false;
        set((state) => {
          const target = state.assistants.find((assistant) => assistant.id === assistantId) ?? null;
          if (!target) return {};
          deleted = true;
          deletedTopicIds.push(...target.topics.map((topic) => topic.id));
          const nextAssistants = state.assistants.filter((assistant) => assistant.id !== assistantId);
          if (nextAssistants.length === state.assistants.length) return {};
          return { assistants: ensureAssistantList(nextAssistants, state.presets) };
        });
        if (!deleted) return;
        removeBrowserContextAssistantOverride(assistantId);
        recordAssistantDeletion(assistantId);
        for (const topicId of deletedTopicIds) recordTopicDeletion(topicId);
      },

      reorderAssistants: (assistantIds) => {
        const normalizedIds = assistantIds.map((item) => String(item || '').trim()).filter(Boolean);
        if (normalizedIds.length < 1) return;
        let reorderedAssistants: Assistant[] = [];
        set((state) => {
          if (state.assistants.length < 2) return {};
          reorderedAssistants = applyReorderedAssistantOrder(reorderItemsByIds(state.assistants, normalizedIds));
          return {
            assistants: reorderedAssistants,
          };
        });
        for (const assistant of reorderedAssistants) {
          recordAssistantFieldChange(assistant.id, 'order');
        }
      },

      reloadFromStorage: () => {
        consumeBackgroundStoragePromise((async () => {
          await ensureLegalPresetRemediation();
          // 说明：reload 只信共享真源，不回读模块内缓存；
          // 这样跨窗口 restore / import / sync 回放后都能得到同一份结果。
          const [assistantsRaw, userPresetsRaw] = await Promise.all([
            readStoredJson<unknown>(STORAGE_KEY, [], (raw) => raw),
            readStoredJson<unknown>(PRESET_STORAGE_KEY, [], (raw) => raw),
          ]);
          const assistants = ensureAssistantList(
            sanitizeAssistants(assistantsRaw, {
              fallbackTopicTitle: getTopicFallbackTitle(),
            }),
            get().presets,
          );
          const userPresets = sanitizeStoredAssistantPresets(userPresetsRaw);
          set({ assistants, userPresets });
        })(), {
          key: [STORAGE_KEY, PRESET_STORAGE_KEY],
          operation: 'reload',
          owner: 'useAssistantStore.reloadFromStorage',
        });
      },

      createTopic: (assistantId, name) => {
        const normalizedAssistantId = String(assistantId || '').trim();
        if (!normalizedAssistantId) return '';
        const assistant = get().assistants.find((item) => item.id === normalizedAssistantId) ?? null;
        if (!assistant) return '';

        const topic = createTopicRecord({ assistantId: normalizedAssistantId, name });
        set((state) => ({
          assistants: replaceAssistantTopics(state.assistants, normalizedAssistantId, [topic, ...assistant.topics]),
        }));
        return topic.id;
      },

      deleteTopic: (topicId) => {
        const normalizedTopicId = String(topicId || '').trim();
        if (!normalizedTopicId) return;
        let deleted = false;

        set((state) => {
          const owner = state.assistants.find((assistant) => assistant.topics.some((topic) => topic.id === normalizedTopicId)) ?? null;
          if (!owner) return {};
          deleted = true;
          const remaining = owner.topics.filter((topic) => topic.id !== normalizedTopicId);
          return {
            assistants: replaceAssistantTopics(
              state.assistants,
              owner.id,
              remaining.length > 0 ? remaining : [createTopicRecord({ assistantId: owner.id })],
            ),
          };
        });
        if (deleted) recordTopicDeletion(normalizedTopicId);
      },

      renameTopic: (topicId, name, markManuallyEdited = true) => {
        const normalizedTopicId = String(topicId || '').trim();
        if (!normalizedTopicId) return;
        let touched = false;

        set((state) => {
          const owner = state.assistants.find((assistant) => assistant.topics.some((topic) => topic.id === normalizedTopicId)) ?? null;
          if (!owner) return {};
          const now = Date.now();
          touched = true;
          return {
            assistants: replaceAssistantTopics(
              state.assistants,
              owner.id,
              owner.topics.map((topic) => (
                topic.id === normalizedTopicId
                  ? {
                      ...topic,
                      name: normalizeTopicName(name),
                      isNameManuallyEdited: markManuallyEdited ? true : topic.isNameManuallyEdited,
                      updatedAt: now,
                    }
                  : topic
              )),
            ),
          };
        });
        if (!touched) return;
        recordTopicFieldChange(normalizedTopicId, 'name');
        if (markManuallyEdited) recordTopicFieldChange(normalizedTopicId, 'isNameManuallyEdited');
        recordTopicFieldChange(normalizedTopicId, 'updatedAt');
      },

      updateTopicMeta: (topicId, patch) => {
        const normalizedTopicId = String(topicId || '').trim();
        if (!normalizedTopicId) return;
        let touched = false;

        set((state) => {
          const owner = state.assistants.find((assistant) => assistant.topics.some((topic) => topic.id === normalizedTopicId)) ?? null;
          if (!owner) return {};
          const now = Date.now();
          touched = true;
          return {
            assistants: replaceAssistantTopics(
              state.assistants,
              owner.id,
              owner.topics.map((topic) => (
                topic.id === normalizedTopicId
                  ? {
                      ...topic,
                      ...patch,
                      name: patch.name !== undefined ? normalizeTopicName(patch.name) : topic.name,
                      topicPrompt: patch.topicPrompt !== undefined
                        ? (typeof patch.topicPrompt === 'string' ? patch.topicPrompt : undefined)
                        : topic.topicPrompt,
                      model: 'model' in patch
                        ? (typeof patch.model === 'string' ? patch.model.trim() || undefined : undefined)
                        : topic.model,
                      temperature: 'temperature' in patch
                        ? (typeof patch.temperature === 'number' && Number.isFinite(patch.temperature) ? patch.temperature : undefined)
                        : topic.temperature,
                      topP: 'topP' in patch
                        ? (typeof patch.topP === 'number' && Number.isFinite(patch.topP) ? patch.topP : undefined)
                        : topic.topP,
                      maxTokens: 'maxTokens' in patch
                        ? (typeof patch.maxTokens === 'number' && Number.isFinite(patch.maxTokens) ? patch.maxTokens : undefined)
                        : topic.maxTokens,
                      contextLength: 'contextLength' in patch
                        ? (typeof patch.contextLength === 'number' && Number.isFinite(patch.contextLength) ? patch.contextLength : undefined)
                        : topic.contextLength,
                      modelParams: 'modelParams' in patch
                        ? (isPlainRecord(patch.modelParams) ? (patch.modelParams as Record<string, unknown>) : undefined)
                        : topic.modelParams,
                      browserContextMode: 'browserContextMode' in patch
                        ? (patch.browserContextMode ? normalizeBrowserContextConversationMode(patch.browserContextMode) : undefined)
                        : topic.browserContextMode,
                      updatedAt: typeof patch.updatedAt === 'number' && Number.isFinite(patch.updatedAt) ? patch.updatedAt : now,
                    }
                  : topic
              )),
            ),
          };
        });
        if (!touched) return;
        for (const field of Object.keys(patch)) {
          recordTopicFieldChange(normalizedTopicId, field);
        }
        recordTopicFieldChange(normalizedTopicId, 'updatedAt');
      },

      togglePinTopic: (topicId) => {
        const normalizedTopicId = String(topicId || '').trim();
        if (!normalizedTopicId) return;
        let touched = false;

        set((state) => {
          const owner = state.assistants.find((assistant) => assistant.topics.some((topic) => topic.id === normalizedTopicId)) ?? null;
          if (!owner) return {};
          const now = Date.now();
          const targetTopic = owner.topics.find((topic) => topic.id === normalizedTopicId) ?? null;
          if (!targetTopic) return {};
          touched = true;

          const updatedTopic: Topic = {
            ...targetTopic,
            pinned: !targetTopic.pinned,
            updatedAt: now,
          };
          let nextTopics: Topic[];

          if (targetTopic.pinned) {
            const pinnedTopics = owner.topics.filter((topic) => topic.pinned && topic.id !== normalizedTopicId);
            const unpinnedTopics = owner.topics.filter((topic) => !topic.pinned && topic.id !== normalizedTopicId);
            nextTopics = [...pinnedTopics, updatedTopic, ...unpinnedTopics];
          } else {
            const pinnedTopics = owner.topics.filter((topic) => topic.pinned);
            const unpinnedTopics = owner.topics.filter((topic) => !topic.pinned && topic.id !== normalizedTopicId);
            nextTopics = [updatedTopic, ...pinnedTopics, ...unpinnedTopics];
          }

          return {
            assistants: replaceAssistantTopics(state.assistants, owner.id, nextTopics),
          };
        });
        if (!touched) return;
        recordTopicFieldChange(normalizedTopicId, 'pinned');
        recordTopicFieldChange(normalizedTopicId, 'updatedAt');
      },

      moveTopicToAssistant: (topicId, toAssistantId) => {
        const normalizedTopicId = String(topicId || '').trim();
        const normalizedAssistantId = String(toAssistantId || '').trim();
        if (!normalizedTopicId || !normalizedAssistantId) return;
        let touched = false;

        set((state) => {
          const sourceAssistant = state.assistants.find((assistant) => assistant.topics.some((topic) => topic.id === normalizedTopicId)) ?? null;
          const targetAssistant = state.assistants.find((assistant) => assistant.id === normalizedAssistantId) ?? null;
          if (!sourceAssistant || !targetAssistant || sourceAssistant.id === targetAssistant.id) return {};

          const sourceTopic = sourceAssistant.topics.find((topic) => topic.id === normalizedTopicId) ?? null;
          if (!sourceTopic) return {};

          const now = Date.now();
          touched = true;
          const nextSourceTopics = sourceAssistant.topics.filter((topic) => topic.id !== normalizedTopicId);
          const movedTopic: Topic = {
            ...sourceTopic,
            assistantId: targetAssistant.id,
            updatedAt: now,
            order: now,
          };

          let assistants = replaceAssistantTopics(
            state.assistants,
            sourceAssistant.id,
            nextSourceTopics.length > 0 ? nextSourceTopics : [createTopicRecord({ assistantId: sourceAssistant.id })],
          );
          assistants = replaceAssistantTopics(
            assistants,
            targetAssistant.id,
            [movedTopic, ...targetAssistant.topics.filter((topic) => topic.id !== normalizedTopicId)],
          );
          return { assistants };
        });
        if (!touched) return;
        recordTopicFieldChange(normalizedTopicId, 'assistantId');
        recordTopicFieldChange(normalizedTopicId, 'order');
        recordTopicFieldChange(normalizedTopicId, 'updatedAt');
      },

      reorderTopics: (assistantId, topicIds) => {
        const normalizedAssistantId = String(assistantId || '').trim();
        if (!normalizedAssistantId) return;
        let reorderedTopics: Topic[] = [];

        set((state) => {
          const assistant = state.assistants.find((item) => item.id === normalizedAssistantId) ?? null;
          if (!assistant || assistant.topics.length < 2) return {};
          const nextTopics = applyReorderedTopicOrder(reorderItemsByIds(assistant.topics, topicIds));
          reorderedTopics = nextTopics;

          return {
            assistants: replaceAssistantTopics(state.assistants, assistant.id, nextTopics),
          };
        });
        for (const topic of reorderedTopics) {
          recordTopicFieldChange(topic.id, 'order');
        }
      },
    })),
  );
}

type AssistantStoreHook = ReturnType<typeof createAssistantStore>;

interface GlobalThisWithAssistantStore {
  __olyqUseAssistantStoreV1__?: AssistantStoreHook;
  __olyqUseAssistantStoreV1Inited__?: boolean;
  __olyqUseAssistantStoreV1LangBound__?: boolean;
  __olyqUseAssistantStoreV1ReloadBound__?: boolean;
}

const globalForAssistantStore = globalThis as unknown as GlobalThisWithAssistantStore;
const assistantStore = globalForAssistantStore.__olyqUseAssistantStoreV1__ ?? createAssistantStore();
globalForAssistantStore.__olyqUseAssistantStoreV1__ = assistantStore;

/**
 * 为助手 store 绑定一次性的持久化、副作用和跨上下文重载监听。
 *
 * @remarks
 * 这里故意放在 store 创建之后再初始化，而不是混进 Zustand 构造函数：
 * - 避免模块导入时立即触发浏览器 API；
 * - 保证全局单例下所有监听器只绑定一次；
 * - 让测试可以单独验证纯 store 逻辑。
 */
function initAssistantStoreOnce(store: AssistantStoreHook): void {
  if (globalForAssistantStore.__olyqUseAssistantStoreV1Inited__) return;
  globalForAssistantStore.__olyqUseAssistantStoreV1Inited__ = true;

  if (typeof window === 'undefined') return;
  let persistedSnapshot = serializeAssistants(store.getState().assistants);
  let persistedUserPresetsSnapshot = serializeStoredPresets(store.getState().userPresets);
  store.subscribe((state) => state.assistants, (value) => {
    const serialized = serializeAssistants(value);
    if (serialized === persistedSnapshot) return;
    persistedSnapshot = serialized;
    writeStoredJsonInBackground(STORAGE_KEY, value, 'useAssistantStore.assistants');
  });
  store.subscribe((state) => state.userPresets, (value) => {
    const serialized = serializeStoredPresets(value);
    if (serialized === persistedUserPresetsSnapshot) return;
    persistedUserPresetsSnapshot = serialized;
    writeStoredJsonInBackground(PRESET_STORAGE_KEY, value, 'useAssistantStore.userPresets');
  });

  // 说明：预设目录是运行时资源，首轮进入页面后再异步加载即可；
  // 这不会影响已有助手数据的可用性，只会影响“从预设创建助手”的展示内容。
  void store.getState().loadAssistantPresets();

  if (!globalForAssistantStore.__olyqUseAssistantStoreV1LangBound__) {
    globalForAssistantStore.__olyqUseAssistantStoreV1LangBound__ = true;
    i18n.on('languageChanged', () => {
      void store.getState().loadAssistantPresets();
    });
  }

  if (!globalForAssistantStore.__olyqUseAssistantStoreV1ReloadBound__) {
    globalForAssistantStore.__olyqUseAssistantStoreV1ReloadBound__ = true;
    const startupSnapshot = getExtensionPageStartupSnapshot();
    const assistantsResolvedFromStartup = startupSnapshot
      ? startupSnapshot.entries[STORAGE_KEY].source !== 'bootstrap'
      : false;
    const userPresetsResolvedFromStartup = startupSnapshot
      ? startupSnapshot.entries[PRESET_STORAGE_KEY].source !== 'bootstrap'
      : false;
    /**
     * 从共享真源重新装载助手列表，并刷新本地去重快照。
     *
     * @remarks
     * 该闭包同时服务于两类入口：
     * - `chrome.storage` 的 key 级订阅；
     * - restore / import / migration 触发的全局 reload 信号。
     */
    const reload = () => {
      consumeBackgroundStoragePromise((async () => {
        await ensureLegalPresetRemediation();
        const [assistantsRaw, userPresetsRaw] = await Promise.all([
          readStoredJson<unknown>(STORAGE_KEY, [], (raw) => raw),
          readStoredJson<unknown>(PRESET_STORAGE_KEY, [], (raw) => raw),
        ]);
        const assistants = ensureAssistantList(
          sanitizeAssistants(assistantsRaw, {
            fallbackTopicTitle: getTopicFallbackTitle(),
          }),
          store.getState().presets,
        );
        const userPresets = sanitizeStoredAssistantPresets(userPresetsRaw);
        persistedSnapshot = serializeAssistants(assistants);
        persistedUserPresetsSnapshot = serializeStoredPresets(userPresets);
        store.setState({ assistants, userPresets });
      })(), {
        key: [STORAGE_KEY, PRESET_STORAGE_KEY],
        operation: 'reload',
        owner: 'useAssistantStore.reload',
      });
    };
    subscribeStoredKeys([STORAGE_KEY, PRESET_STORAGE_KEY], reload);
    subscribeStoreReloadSignal(reload);
    if (!(assistantsResolvedFromStartup && userPresetsResolvedFromStartup)) {
      reload();
    }
  }
}

initAssistantStoreOnce(assistantStore);

type AssistantStoreApi = Pick<AssistantStoreHook, 'getState' | 'setState' | 'subscribe' | 'getInitialState'>;

/** 导出类型：`UseAssistantStore`。 */
export type UseAssistantStore = {
  <T>(selector: (state: AssistantStore) => T, equalityFn?: (a: T, b: T) => boolean): T;
} & AssistantStoreApi;

/**
 * 导出 Hook：`useAssistantStore`。
 *
 * @remarks
 * 对外暴露可复用的状态、派生值或副作用封装，调用方应遵守 Hook 调用约束。
 */
export const useAssistantStore: UseAssistantStore = assistantStore;
