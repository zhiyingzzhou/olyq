/**
 * 说明：`phrase-normalize` 基础能力模块。
 *
 * 职责：
 * - 提供快捷短语当前格式的纯规整函数；
 * - 供全局短语 store、助手树清洗、同步恢复和测试共享；
 * - 避免在只需要类型/规整逻辑的模块里引入存储通道副作用。
 *
 * 边界：
 * - 这里只认当前 `QuickPhrase` 格式，不兼容旧字段。
 */
import type { QuickPhrase } from '@/types/quick-phrase';

/**
 * 规整单条快捷短语。
 *
 * @param raw - 未信任的存储值。
 * @returns 当前格式合法时返回短语，否则返回 `null`。
 */
export function normalizeQuickPhrase(raw: unknown): QuickPhrase | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  const title = typeof record.title === 'string' ? record.title.trim() : '';
  const content = typeof record.content === 'string' ? record.content : '';
  const createdAt = typeof record.createdAt === 'number' && Number.isFinite(record.createdAt) ? record.createdAt : NaN;
  const updatedAt = typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt) ? record.updatedAt : NaN;
  const order = typeof record.order === 'number' && Number.isFinite(record.order) ? record.order : NaN;
  if (!id || !title || !content.trim() || !Number.isFinite(createdAt) || !Number.isFinite(updatedAt) || !Number.isFinite(order)) {
    return null;
  }
  return { id, title, content, createdAt, updatedAt, order };
}

/**
 * 按当前顺序语义排序快捷短语。
 *
 * @param phrases - 待排序短语。
 * @returns 新数组，`order` 大的在前，同 order 时较新的更新时间在前。
 */
export function sortQuickPhrases(phrases: QuickPhrase[]): QuickPhrase[] {
  return phrases.slice().sort((left, right) => {
    if (right.order !== left.order) return right.order - left.order;
    if (right.updatedAt !== left.updatedAt) return right.updatedAt - left.updatedAt;
    return right.createdAt - left.createdAt;
  });
}

/**
 * 规整快捷短语数组。
 *
 * @param raw - 未信任的存储值。
 * @returns 当前格式的排序短语数组。
 */
export function normalizeQuickPhrases(raw: unknown): QuickPhrase[] {
  if (!Array.isArray(raw)) return [];
  return sortQuickPhrases(
    raw
      .map((entry) => normalizeQuickPhrase(entry))
      .filter((entry): entry is QuickPhrase => Boolean(entry)),
  );
}
