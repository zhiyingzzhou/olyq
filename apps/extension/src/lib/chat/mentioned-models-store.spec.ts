/**
 * 说明：`mentioned-models-store.spec` 测试模块。
 *
 * 职责：
 * - 验证聊天输入区 `@` 提及模型助手级草稿的当前 schema；
 * - 覆盖去空、去重、助手隔离、清空删除与 shared JSON 配置通道回流语义。
 *
 * 边界：
 * - 本测试只覆盖 `olyq.chat-mentioned-models.v1`；
 * - 每条用户消息的 `Message.mentions` fan-out 由聊天发送与重发测试覆盖。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('mentioned-models-store', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    storageMock.reset();
    storageMock.get.mockClear();
    storageMock.set.mockClear();
    storageMock.onChange.mockClear();
  });

  it('只接受当前 assistantId -> modelId[] schema 并规整模型列表', async () => {
    const {
      normalizeMentionModelIds,
      normalizeMentionedModelsByAssistant,
    } = await import('./mentioned-models-store');

    expect(normalizeMentionModelIds([' a ', '', 'a', 1, 'b'])).toEqual(['a', 'b']);
    expect(normalizeMentionedModelsByAssistant({
      ' assistant-a ': [' openai/gpt-5.4 ', '', 'openai/gpt-5.4', 'anthropic/claude-sonnet-4-6'],
      'assistant-b': 'legacy-string',
      '': ['ignored'],
    })).toEqual({
      'assistant-a': ['openai/gpt-5.4', 'anthropic/claude-sonnet-4-6'],
    });
    expect(normalizeMentionedModelsByAssistant([
      ['assistant-a', ['openai/gpt-5.4']],
    ])).toEqual({});
  });

  it('按助手读写提及模型草稿，空列表会删除当前助手项', async () => {
    const store = await import('./mentioned-models-store');
    await Promise.resolve();
    const listener = vi.fn();
    const unsubscribe = store.subscribeMentionedModels(listener);

    expect(store.getMentionedModelsForAssistant('assistant-a')).toEqual([]);

    expect(store.setMentionedModelsForAssistant('assistant-a', [
      ' openai/gpt-5.4 ',
      'openai/gpt-5.4',
      'anthropic/claude-sonnet-4-6',
    ])).toEqual(['openai/gpt-5.4', 'anthropic/claude-sonnet-4-6']);
    expect(store.getMentionedModelsForAssistant('assistant-a')).toEqual([
      'openai/gpt-5.4',
      'anthropic/claude-sonnet-4-6',
    ]);
    expect(store.getMentionedModelsForAssistant('assistant-b')).toEqual([]);

    store.setMentionedModelsForAssistant('assistant-a', []);
    expect(store.getMentionedModelsForAssistant('assistant-a')).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(storageMock.set).toHaveBeenLastCalledWith({
      [store.MENTIONED_MODELS_STORAGE_KEY]: {},
    });

    unsubscribe();
  });

  it('从共享存储刷新时按当前 schema 丢弃非法助手项', async () => {
    const MENTIONED_MODELS_STORAGE_KEY = 'olyq.chat-mentioned-models.v1';
    storageMock.state.values.set(MENTIONED_MODELS_STORAGE_KEY, {
      'assistant-a': [' openai/gpt-5.4 ', '', 'openai/gpt-5.4'],
      'assistant-b': 'legacy-string',
      'assistant-c': ['anthropic/claude-sonnet-4-6'],
    });

    const store = await import('./mentioned-models-store');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(store.getMentionedModelsForAssistant('assistant-a')).toEqual(['openai/gpt-5.4']);
    expect(store.getMentionedModelsForAssistant('assistant-b')).toEqual([]);
    expect(store.getMentionedModelsForAssistant('assistant-c')).toEqual(['anthropic/claude-sonnet-4-6']);
  });
});
