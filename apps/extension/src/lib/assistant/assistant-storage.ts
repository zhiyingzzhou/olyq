/**
 * 说明：`assistant-storage` 助手持久化规整模块。
 *
 * 职责：
 * - 统一清洗共享存储中的助手、话题与其嵌套配置；
 * - 为启动快照、助手 store 和同步侧读取提供同一套无副作用 helper；
 * - 避免多个运行时继续复制“助手树持久化协议”的容错逻辑。
 *
 * 边界：
 * - 这里只做结构规整与最小不变量修复，不承载 store、副作用或 i18n 状态；
 * - 是否补默认助手、如何决定首屏入口，属于上层编排语义，不在这里处理。
 */
import { normalizeAssistantIconId } from '@/lib/assistant-icons';
import {
  getDefaultBrowserContextConversationModeForScenario,
  normalizeBrowserContextConversationMode,
} from '@/lib/browser-context/types';
import {
  createTopicRecordWithFallback,
  DEFAULT_TOPIC_TITLE_FALLBACK,
  sortAssistants,
} from '@/lib/chat/topic-tree-core';
import { sanitizeMcpServerSelection } from '@/lib/mcp/selection';
import { normalizeQuickPhrases } from '@/lib/quick-phrases/phrase-normalize';
import { isPlainRecord } from '@/lib/utils/type-guards';
import { normalizeAssistantScenario, type Assistant } from '@/types/assistant';
import type { Topic } from '@/types/chat';

/** 助手持久化清洗选项。 */
export interface SanitizeAssistantsOptions {
  /** 是否对结果执行稳定排序。 */
  readonly sort?: boolean;
  /** 当某个助手缺少合法话题时，是否自动补一个默认入口话题。 */
  readonly fallbackToDefaultTopics?: boolean;
  /** 自动补默认入口话题时使用的兜底标题。 */
  readonly fallbackTopicTitle?: string;
}

/**
 * 把任意输入收敛为非空字符串数组。
 *
 * @remarks
 * 助手配置会同时经历表单态、restore、sync 与 bootstrap seed 四种入口；
 * 这里统一清掉空值与非数组输入，避免把脏数据带进运行时。
 */
export function normalizeStringArray(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const values = raw.map((item) => String(item || '').trim()).filter(Boolean);
  return values.length > 0 ? values : undefined;
}

/**
 * 把任意原始对象规整为可持久化的话题记录。
 *
 * @remarks
 * 该 helper 只负责最小协议修复：
 * - 主键为空则丢弃；
 * - 时间戳与排序值缺失时补稳定默认值；
 * - 只保留当前 Topic schema 字段，旧字段直接丢弃。
 */
export function sanitizeTopic(
  raw: unknown,
  assistantId: string,
  {
    assistantScenario = 'general',
    fallbackTopicTitle = DEFAULT_TOPIC_TITLE_FALLBACK,
  }: Pick<SanitizeAssistantsOptions, 'fallbackTopicTitle'> & {
    assistantScenario?: Parameters<typeof getDefaultBrowserContextConversationModeForScenario>[0];
  } = {},
): Topic | null {
  if (!isPlainRecord(raw)) return null;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!id) return null;
  const createdAt = typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now();
  const updatedAt = typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : createdAt;
  const topicPrompt = typeof raw.topicPrompt === 'string' ? raw.topicPrompt : undefined;
  const modelParams = isPlainRecord(raw.modelParams) ? (raw.modelParams as Record<string, unknown>) : undefined;
  const browserContextMode = isPlainRecord(raw.browserContextMode)
    ? normalizeBrowserContextConversationMode(
      raw.browserContextMode,
      getDefaultBrowserContextConversationModeForScenario(assistantScenario),
    )
    : undefined;
  return createTopicRecordWithFallback({
    id,
    assistantId,
    name: raw.name,
    createdAt,
    updatedAt,
    pinned: typeof raw.pinned === 'boolean' ? raw.pinned : false,
    topicPrompt,
    model: typeof raw.model === 'string' ? raw.model.trim() || undefined : undefined,
    temperature: typeof raw.temperature === 'number' && Number.isFinite(raw.temperature) ? raw.temperature : undefined,
    topP: typeof raw.topP === 'number' && Number.isFinite(raw.topP) ? raw.topP : undefined,
    maxTokens: typeof raw.maxTokens === 'number' && Number.isFinite(raw.maxTokens) ? raw.maxTokens : undefined,
    contextLength: typeof raw.contextLength === 'number' && Number.isFinite(raw.contextLength) ? raw.contextLength : undefined,
    modelParams,
    browserContextMode,
    isNameManuallyEdited: typeof raw.isNameManuallyEdited === 'boolean' ? raw.isNameManuallyEdited : false,
    order: typeof raw.order === 'number' && Number.isFinite(raw.order) ? raw.order : createdAt,
    fallbackTitle: fallbackTopicTitle,
  });
}

/**
 * 规范化某个助手下的话题列表。
 *
 * @remarks
 * 是否在“空话题列表”时补默认入口，取决于调用方所在运行时：
 * - UI store 需要稳定入口，可启用 `fallbackToDefaultTopics`；
 * - 同步或只读场景只需忠实反映持久化结果，可关闭该选项。
 */
export function sanitizeTopicList(
  raw: unknown,
  assistantId: string,
  {
    assistantScenario = 'general',
    fallbackToDefaultTopics = true,
    fallbackTopicTitle = DEFAULT_TOPIC_TITLE_FALLBACK,
  }: Pick<SanitizeAssistantsOptions, 'fallbackToDefaultTopics' | 'fallbackTopicTitle'> & {
    assistantScenario?: Parameters<typeof getDefaultBrowserContextConversationModeForScenario>[0];
  } = {},
): Topic[] {
  const topics = Array.isArray(raw)
    ? raw.map((item) => sanitizeTopic(item, assistantId, {
      assistantScenario,
      fallbackTopicTitle,
    })).filter(Boolean) as Topic[]
    : [];
  if (topics.length > 0) return topics;
  if (!fallbackToDefaultTopics) return [];
  return [createTopicRecordWithFallback({ assistantId, fallbackTitle: fallbackTopicTitle })];
}

/**
 * 把任意原始值规范化为助手实体。
 *
 * @remarks
 * 这里同时修复两个关键不变量：
 * - `enableWebSearch` 与 `webSearchProviderId` 互斥；
 * - 嵌套话题、标签、知识库等聚合字段在进入运行时前完成清洗。
 */
export function sanitizeAssistant(
  raw: unknown,
  {
    fallbackToDefaultTopics = true,
    fallbackTopicTitle = DEFAULT_TOPIC_TITLE_FALLBACK,
  }: Pick<SanitizeAssistantsOptions, 'fallbackToDefaultTopics' | 'fallbackTopicTitle'> = {},
): Assistant | null {
  if (!isPlainRecord(raw)) return null;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const prompt = typeof raw.prompt === 'string' ? raw.prompt.trim() : '';
  if (!id || !name || !prompt) return null;

  const now = Date.now();
  let enableWebSearch = typeof raw.enableWebSearch === 'boolean' ? raw.enableWebSearch : undefined;
  const providerId = typeof raw.webSearchProviderId === 'string' ? raw.webSearchProviderId.trim() : '';
  let webSearchProviderId = providerId || undefined;
  if (webSearchProviderId) enableWebSearch = false;
  if (enableWebSearch) webSearchProviderId = undefined;

  const createdAt = typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : now;
  const updatedAt = typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : createdAt;
  const order = typeof raw.order === 'number' && Number.isFinite(raw.order) ? raw.order : createdAt;
  const scenario = normalizeAssistantScenario(raw.scenario);
  const regularPhrases = normalizeQuickPhrases(raw.regularPhrases);

  return {
    id,
    scenario,
    name,
    prompt,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    iconId: normalizeAssistantIconId(raw.iconId),
    mcpSelection: sanitizeMcpServerSelection(raw.mcpSelection, 'auto'),
    enableWebSearch,
    webSearchProviderId,
    enableGenerateImage: typeof raw.enableGenerateImage === 'boolean' ? raw.enableGenerateImage : undefined,
    enableMemory: typeof raw.enableMemory === 'boolean' ? raw.enableMemory : undefined,
    tags: normalizeStringArray(raw.tags),
    ...(regularPhrases.length > 0 ? { regularPhrases } : {}),
    topics: sanitizeTopicList(raw.topics, id, {
      assistantScenario: scenario,
      fallbackToDefaultTopics,
      fallbackTopicTitle,
    }),
    order,
    createdAt,
    updatedAt,
  };
}

/**
 * 批量清洗助手数组。
 *
 * @remarks
 * 返回结果只保证结构合法，不负责额外补默认助手或写回存储；
 * 是否排序由调用方显式决定，避免不同运行时被动共享副作用。
 */
export function sanitizeAssistants(
  raw: unknown,
  {
    sort = false,
    fallbackToDefaultTopics = true,
    fallbackTopicTitle = DEFAULT_TOPIC_TITLE_FALLBACK,
  }: SanitizeAssistantsOptions = {},
): Assistant[] {
  if (!Array.isArray(raw)) return [];
  const assistants = raw
    .map((item) => sanitizeAssistant(item, { fallbackToDefaultTopics, fallbackTopicTitle }))
    .filter(Boolean) as Assistant[];
  return sort ? sortAssistants(assistants) : assistants;
}
