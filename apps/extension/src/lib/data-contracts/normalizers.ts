/**
 * 说明：`normalizers` 数据契约规整模块。
 *
 * 职责：
 * - 提供 Data Contract Registry v1 可复用的轻量 JSON schema 规整器；
 * - 把通用数组、布尔、数字、nullable string 和 chat settings 规整逻辑移出注册表主体；
 * - 保证备份、恢复和 structured sync 消费同一套当前 v1 结构。
 *
 * 边界：
 * - 本文件不登记任何 storage key；
 * - 不做 storage IO，也不保留旧结构兼容分支；
 * - 只返回可 JSON 序列化的当前契约值。
 */
import { DEFAULT_SETTINGS } from '@/lib/chat/constants';
import { normalizeChatSettings as normalizeChatSettingsSnapshot } from '@/lib/chat/chat-settings-normalize';
import {
  normalizeBackupProfileConfigSnapshot,
  type BackupProfileConfigSnapshot,
} from '@/lib/backup-config';
import { isPlainRecord } from '@/lib/utils/type-guards';

/**
 * 判断 JSON 值是否能安全序列化。
 *
 * @remarks
 * shared-storage 进入备份和云同步时都必须是普通 JSON；
 * 这里用一次 JSON round-trip 拦掉函数、循环引用和不可表达值。
 */
export function assertJsonSerializable(value: unknown): unknown {
  try {
    JSON.stringify(value);
    return value;
  } catch {
    throw new Error('data contract value must be JSON serializable');
  }
}

/**
 * 将原始值规整为普通 JSON record。
 *
 * @param value - 原始值。
 * @returns 普通对象副本；非法时返回空对象。
 */
export function normalizeJsonRecord(value: unknown): Record<string, unknown> {
  return isPlainRecord(value) ? { ...value } : {};
}

/**
 * 将原始值规整为去重后的字符串数组。
 *
 * @param value - 原始值。
 * @returns 去空白、去重后的字符串数组。
 */
export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item || '').trim()).filter(Boolean)));
}

/**
 * 将原始值规整为布尔值。
 *
 * @param value - 原始值。
 * @returns `Boolean(value)` 结果。
 */
export function normalizeBoolean(value: unknown): boolean {
  return Boolean(value);
}

/**
 * 将原始值规整为有限数字。
 *
 * @param value - 原始值。
 * @returns 有限数字；非法时返回 `0`。
 */
export function normalizeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * 将原始值规整为可空字符串。
 *
 * @param value - 原始值。
 * @returns trim 后的字符串；空白或非法时返回 `null`。
 */
export function normalizeNullableString(value: unknown): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
}

/**
 * 规整聊天默认设置。
 *
 * @param value - 原始聊天设置。
 * @returns 当前 v1 聊天设置快照。
 */
export function normalizeChatSettings(value: unknown): typeof DEFAULT_SETTINGS {
  return normalizeChatSettingsSnapshot({
    ...DEFAULT_SETTINGS,
    ...(isPlainRecord(value) ? value : {}),
  });
}

/**
 * 规整提示词模板数组。
 *
 * @param value - 原始模板列表。
 * @returns 当前 v1 模板数组。
 */
export function normalizePromptTemplates(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isPlainRecord)
    .map((item) => ({
      id: String(item.id || '').trim(),
      title: String(item.title || '').trim(),
      content: typeof item.content === 'string' ? item.content : '',
      category: String(item.category || '').trim(),
      isBuiltin: Boolean(item.isBuiltin),
      createdAt: normalizeNumber(item.createdAt),
    }))
    .filter((item) => item.id && item.title && item.content);
}

/**
 * 规整聊天输入区提及模型草稿。
 *
 * @param value - 原始 assistantId 到 modelId[] 的映射。
 * @returns 清理后的提及模型草稿。
 */
export function normalizeMentionedModelsDraft(value: unknown): Record<string, string[]> {
  if (!isPlainRecord(value)) return {};
  const out: Record<string, string[]> = {};
  for (const [assistantId, models] of Object.entries(value)) {
    const id = String(assistantId || '').trim();
    if (!id) continue;
    const normalizedModels = normalizeStringArray(models);
    if (normalizedModels.length > 0) out[id] = normalizedModels;
  }
  return out;
}

/**
 * 规整深色主题色选择。
 *
 * @param value - 原始选择值。
 * @returns 可序列化的当前选择值；缺失时保留 `null`。
 */
export function normalizeDarkThemeColor(value: unknown): unknown {
  return assertJsonSerializable(value ?? null);
}

/**
 * 规整备份配置。
 *
 * @param value - 原始备份配置。
 * @returns 当前 v1 备份配置快照。
 */
export function normalizeBackupProfileConfig(value: unknown): BackupProfileConfigSnapshot {
  return normalizeBackupProfileConfigSnapshot(value);
}
