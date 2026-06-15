/**
 * 说明：`mentioned-models-store` 基础能力模块。
 *
 * 职责：
 * - 管理聊天输入区 `@` 提及模型的助手级草稿状态；
 * - 通过 `shared-json-config-channel` 复用浏览器扩展的小型 JSON 配置通道；
 * - 只服务输入区默认多模型目标，不改变每条用户消息里的 `Message.mentions` 真源。
 *
 * 边界：
 * - 当前持久化结构固定为 `assistantId -> modelId[]`，不解析旧格式或其它 schema；
 * - 没有 `assistantId` 的输入区草稿由调用方保存在当前挂载期内存，本模块不写入无作用域状态；
 * - 不直接访问 raw browser storage，所有读写都经 shared channel。
 */
import { createSharedJsonConfigChannel } from '@/lib/storage/shared-json-config-channel';

/** `@` 提及模型助手级草稿的共享存储键。 */
export const MENTIONED_MODELS_STORAGE_KEY = 'olyq.chat-mentioned-models.v1';

/** 助手 ID 到已提及模型 ID 列表的当前持久化结构。 */
export type MentionedModelsByAssistant = Record<string, string[]>;

/**
 * 判断输入是否为普通对象。
 *
 * @param raw - 待判断的原始值。
 * @returns 是否可按当前 schema 的对象结构继续读取。
 */
function isPlainRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object'
    && raw !== null
    && !Array.isArray(raw)
    && Object.getPrototypeOf(raw) === Object.prototype;
}

/**
 * 规整模型 ID 列表。
 *
 * @param raw - 原始模型列表。
 * @returns 去空、去重并保持原顺序的模型 ID 列表。
 */
export function normalizeMentionModelIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const next: string[] = [];
  for (const item of raw) {
    const modelId = typeof item === 'string' ? item.trim() : '';
    if (!modelId || seen.has(modelId)) continue;
    seen.add(modelId);
    next.push(modelId);
  }
  return next;
}

/**
 * 规整助手级提及模型草稿。
 *
 * @param raw - 存储中读取到的原始 JSON。
 * @returns 当前 schema 下合法的助手级模型草稿。
 */
export function normalizeMentionedModelsByAssistant(raw: unknown): MentionedModelsByAssistant {
  if (!isPlainRecord(raw)) return {};
  const next: MentionedModelsByAssistant = {};
  for (const [rawAssistantId, rawModelIds] of Object.entries(raw)) {
    const assistantId = rawAssistantId.trim();
    if (!assistantId) continue;
    const modelIds = normalizeMentionModelIds(rawModelIds);
    if (modelIds.length > 0) next[assistantId] = modelIds;
  }
  return next;
}

const mentionedModelsChannel = createSharedJsonConfigChannel<MentionedModelsByAssistant>({
  storageKey: MENTIONED_MODELS_STORAGE_KEY,
  fallback: {},
  normalize: normalizeMentionedModelsByAssistant,
  clone: (value) => Object.fromEntries(
    Object.entries(value).map(([assistantId, modelIds]) => [assistantId, [...modelIds]]),
  ),
  bootstrap: {
    bootstrapSource: 'bootstrap-mirror',
  },
  sameWindowSignal: {
    type: 'none',
  },
});

/**
 * 读取指定助手的 `@` 提及模型草稿。
 *
 * @param assistantId - 当前输入区绑定的助手 ID；缺失时返回空列表。
 * @returns 该助手当前保留的模型 ID 列表。
 */
export function getMentionedModelsForAssistant(assistantId?: string): string[] {
  const normalizedAssistantId = String(assistantId || '').trim();
  if (!normalizedAssistantId) return [];
  return mentionedModelsChannel.getSnapshot()[normalizedAssistantId] ?? [];
}

/**
 * 写入指定助手的 `@` 提及模型草稿。
 *
 * @param assistantId - 当前输入区绑定的助手 ID。
 * @param modelIds - 下一组模型 ID；空列表会删除该助手的草稿项。
 * @returns 规整后的模型 ID 列表。
 */
export function setMentionedModelsForAssistant(assistantId: string, modelIds: string[]): string[] {
  const normalizedAssistantId = String(assistantId || '').trim();
  if (!normalizedAssistantId) return [];
  const normalizedModelIds = normalizeMentionModelIds(modelIds);
  const current = mentionedModelsChannel.getSnapshot();
  const next: MentionedModelsByAssistant = { ...current };
  if (normalizedModelIds.length > 0) {
    next[normalizedAssistantId] = normalizedModelIds;
  } else {
    delete next[normalizedAssistantId];
  }
  mentionedModelsChannel.save(next);
  return [...normalizedModelIds];
}

/**
 * 订阅助手级 `@` 提及模型草稿变化。
 *
 * @param callback - 任一助手草稿变化时触发的回调。
 * @returns 取消订阅函数。
 */
export function subscribeMentionedModels(callback: () => void): () => void {
  return mentionedModelsChannel.subscribe(callback);
}

void mentionedModelsChannel.refreshFromStorage();
