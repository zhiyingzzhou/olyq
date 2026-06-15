/**
 * 说明：`phrase-store.spec` 测试模块。
 *
 * 职责：
 * - 验证全局快捷短语 store 的当前结构、CRUD、订阅和排序语义；
 * - 覆盖旧 `name` 字段被规整层丢弃的硬切换行为；
 * - 确认实现仍经由 shared JSON 配置通道访问存储。
 *
 * 边界：
 * - 本测试只覆盖全局 `olyq.quick-phrases.v1`；
 * - 助手级 `regularPhrases` 由助手清洗与编辑器测试覆盖。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storageMock = vi.hoisted(() => {
  const state = {
    values: new Map<string, unknown>(),
    listeners: new Set<(changes: Record<string, { oldValue?: unknown; newValue?: unknown }>) => void>(),
  };

  return {
    state,
    get: vi.fn(async (keys: string[]) => {
      const result: Record<string, unknown> = {};
      for (const key of keys) {
        if (state.values.has(key)) result[key] = state.values.get(key);
      }
      return result;
    }),
    set: vi.fn(async (entries: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(entries)) {
        state.values.set(key, value);
      }
    }),
    onChange: vi.fn((callback: (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>) => void) => {
      state.listeners.add(callback);
      return () => state.listeners.delete(callback);
    }),
    reset: () => {
      state.values.clear();
      state.listeners.clear();
    },
  };
});

vi.mock('@/lib/storage/storage-adapter', () => ({
  getStorageAdapter: () => ({
    get: storageMock.get,
    set: storageMock.set,
    onChange: storageMock.onChange,
  }),
}));

describe('phrase-store', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useRealTimers();
    localStorage.clear();
    storageMock.reset();
    storageMock.get.mockClear();
    storageMock.set.mockClear();
    storageMock.onChange.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('只规整当前 title/content/order 结构并丢弃旧 name 字段', async () => {
    const { normalizeQuickPhrases } = await import('./phrase-store');

    const phrases = normalizeQuickPhrases([
      { id: 'legacy', name: 'legacy title', content: 'legacy content', createdAt: 1, updatedAt: 1, order: 3 },
      { id: 'low', title: 'Low', content: 'low content', createdAt: 1, updatedAt: 1, order: 1 },
      { id: 'high', title: 'High', content: 'high content', createdAt: 1, updatedAt: 2, order: 2 },
      { id: 'empty', title: 'Empty', content: '   ', createdAt: 1, updatedAt: 1, order: 4 },
    ]);

    expect(phrases.map((phrase) => phrase.id)).toEqual(['high', 'low']);
  });

  it('支持新增、更新、删除并通知订阅者', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const store = await import('./phrase-store');
    await Promise.resolve();
    const listener = vi.fn();
    const unsubscribe = store.subscribeQuickPhrases(listener);

    const added = store.addQuickPhrase({ title: '  Greeting  ', content: '  Hello there  ' });
    expect(added).toEqual(expect.objectContaining({
      title: 'Greeting',
      content: 'Hello there',
      createdAt: 1_000,
      updatedAt: 1_000,
      order: 1_000,
    }));
    expect(store.getQuickPhrases()).toEqual([added]);

    vi.setSystemTime(2_000);
    store.updateQuickPhrase(added.id, { title: 'Updated', content: 'Updated content' });
    expect(store.getQuickPhrases()[0]).toEqual(expect.objectContaining({
      id: added.id,
      title: 'Updated',
      content: 'Updated content',
      updatedAt: 2_000,
    }));

    store.deleteQuickPhrase(added.id);
    expect(store.getQuickPhrases()).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
  });

  it('按传入展示顺序稳定重排，第一项 order 最大', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const store = await import('./phrase-store');
    await Promise.resolve();
    const first = store.addQuickPhrase({ title: 'First', content: 'first content' });
    const second = store.addQuickPhrase({ title: 'Second', content: 'second content' });

    vi.setSystemTime(3_000);
    store.reorderQuickPhrases([first, second]);

    expect(store.getQuickPhrases().map((phrase) => ({
      id: phrase.id,
      order: phrase.order,
      updatedAt: phrase.updatedAt,
    }))).toEqual([
      { id: first.id, order: 2, updatedAt: 3_000 },
      { id: second.id, order: 1, updatedAt: 3_000 },
    ]);
  });

  it('从存储刷新时会丢弃非法数据并保留合法当前结构', async () => {
    storageMock.state.values.set('olyq.quick-phrases.v1', [
      { id: 'legacy', name: 'legacy title', content: 'legacy content', createdAt: 1, updatedAt: 1, order: 2 },
      { id: 'valid', title: 'Valid', content: 'valid content', createdAt: 1, updatedAt: 1, order: 1 },
    ]);

    const store = await import('./phrase-store');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(store.getQuickPhrases()).toEqual([
      {
        id: 'valid',
        title: 'Valid',
        content: 'valid content',
        createdAt: 1,
        updatedAt: 1,
        order: 1,
      },
    ]);
  });
});
