/**
 * 说明：`phrase-store` 基础能力模块。
 *
 * 职责：
 * - 管理全局快捷短语的当前持久化格式；
 * - 通过 `shared-json-config-channel` 复用浏览器扩展的小型 JSON 配置通道；
 * - 向聊天输入区、全局管理弹窗和备份恢复链路提供同一份同步快照。
 *
 * 边界：
 * - 本模块只处理全局短语，当前助手常用短语属于 `Assistant.regularPhrases`；
 * - 不保留旧 `name` 字段或历史格式兼容，非法条目会在读取时直接丢弃；
 * - 不直接访问 raw browser storage，所有读写都经 shared channel。
 */
import { createSharedJsonConfigChannel } from '@/lib/storage/shared-json-config-channel';
import { createId } from '@/lib/utils/id';
import { normalizeQuickPhrases } from './phrase-normalize';
import type { QuickPhrase, QuickPhraseDraft } from '@/types/quick-phrase';

export type { QuickPhrase, QuickPhraseDraft } from '@/types/quick-phrase';
export { normalizeQuickPhrase, normalizeQuickPhrases, sortQuickPhrases } from './phrase-normalize';

const STORAGE_KEY = 'olyq.quick-phrases.v1';

const quickPhrasesChannel = createSharedJsonConfigChannel<QuickPhrase[]>({
  storageKey: STORAGE_KEY,
  fallback: [],
  normalize: normalizeQuickPhrases,
  clone: (phrases) => phrases.map((phrase) => ({ ...phrase })),
  bootstrap: {
    bootstrapSource: 'bootstrap-mirror',
  },
  sameWindowSignal: {
    type: 'none',
  },
});

/** 获取当前全部全局快捷短语。 */
export function getQuickPhrases(): QuickPhrase[] {
  return quickPhrasesChannel.getSnapshot();
}

/**
 * 订阅全局快捷短语变化。
 *
 * @param callback - 短语快照变化时触发的回调。
 * @returns 取消订阅函数。
 */
export function subscribeQuickPhrases(callback: () => void): () => void {
  return quickPhrasesChannel.subscribe(callback);
}

/**
 * 创建新的全局快捷短语。
 *
 * @param draft - 标题与正文。
 * @returns 新建后的短语。
 */
export function addQuickPhrase(draft: QuickPhraseDraft): QuickPhrase {
  const now = Date.now();
  const phrases = getQuickPhrases();
  const phrase: QuickPhrase = {
    id: createId(),
    title: draft.title.trim(),
    content: draft.content.trim(),
    createdAt: now,
    updatedAt: now,
    order: now,
  };
  quickPhrasesChannel.save([phrase, ...phrases]);
  return phrase;
}

/**
 * 更新指定全局快捷短语。
 *
 * @param id - 短语 ID。
 * @param updates - 标题或正文更新。
 */
export function updateQuickPhrase(id: string, updates: Partial<QuickPhraseDraft>): void {
  const normalizedId = String(id || '').trim();
  if (!normalizedId) return;
  const now = Date.now();
  const next = getQuickPhrases().map((phrase) => {
    if (phrase.id !== normalizedId) return phrase;
    return {
      ...phrase,
      ...(typeof updates.title === 'string' ? { title: updates.title.trim() } : {}),
      ...(typeof updates.content === 'string' ? { content: updates.content.trim() } : {}),
      updatedAt: now,
    };
  });
  quickPhrasesChannel.save(next);
}

/**
 * 删除指定全局快捷短语。
 *
 * @param id - 短语 ID。
 */
export function deleteQuickPhrase(id: string): void {
  const normalizedId = String(id || '').trim();
  if (!normalizedId) return;
  quickPhrasesChannel.save(getQuickPhrases().filter((phrase) => phrase.id !== normalizedId));
}

/**
 * 按当前 UI 展示顺序重写全局快捷短语排序。
 *
 * @param phrases - 新的展示顺序，数组第一项会获得最高 `order`。
 */
export function reorderQuickPhrases(phrases: QuickPhrase[]): void {
  const now = Date.now();
  const length = phrases.length;
  quickPhrasesChannel.save(
    phrases.map((phrase, index) => ({
      ...phrase,
      order: length - index,
      updatedAt: now,
    })),
  );
}

void quickPhrasesChannel.refreshFromStorage();
