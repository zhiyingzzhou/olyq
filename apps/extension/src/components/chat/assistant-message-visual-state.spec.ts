/**
 * 说明：`assistant-message-visual-state.spec` 组件模块。
 *
 * 职责：
 * - 承载 assistant 消息可视状态判定的回归测试；
 * - 锁定 preparing / replacement pending 的语义边界。
 *
 * 边界：
 * - 本文件只验证纯派生状态，不覆盖具体 UI 组件渲染。
 */
import { describe, expect, it } from 'vitest';

import type { Message } from '@/types/chat';

import { getAssistantMessageVisualState } from './assistant-message-visual-state';

/**
 * 测试辅助函数：`createAssistantMessage`。
 *
 * @remarks
 * 用于快速构造 assistant 消息样例，不作为运行时代码复用。
 */
function createAssistantMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'assistant-1',
    askId: 'ask-1',
    role: 'assistant',
    modelId: 'provider/model',
    content: '',
    status: 'success',
    createdAt: 1,
    ...overrides,
  };
}

describe('assistant-message-visual-state', () => {
  it('preparing 且保留旧输出时进入 replacement pending，而不是普通 preparing', () => {
    const state = getAssistantMessageVisualState(createAssistantMessage({
      status: 'preparing',
      content: '旧回复',
    }));

    expect(state.isBusyAssistant).toBe(true);
    expect(state.isPreparingReply).toBe(false);
    expect(state.isReplacementPending).toBe(true);
  });

  it('preparing 且没有旧输出时保留 stub preparing 占位', () => {
    const state = getAssistantMessageVisualState(createAssistantMessage({
      status: 'preparing',
      content: '',
      attachments: [],
      trace: [],
      translations: [],
      webSearchResults: [],
    }));

    expect(state.isBusyAssistant).toBe(true);
    expect(state.isPreparingReply).toBe(true);
    expect(state.isReplacementPending).toBe(false);
  });

  it('processing 不会被误判成 replacement pending', () => {
    const state = getAssistantMessageVisualState(createAssistantMessage({
      status: 'processing',
      content: '',
    }));

    expect(state.isBusyAssistant).toBe(true);
    expect(state.isPreparingReply).toBe(false);
    expect(state.isReplacementPending).toBe(false);
  });

  it('纯短态 assistant 会使用 full-width lane，而不是继续收缩成内容宽度', () => {
    const state = getAssistantMessageVisualState(createAssistantMessage({
      status: 'error',
      content: '',
      trace: [],
      attachments: [],
      translations: [],
      webSearchResults: [],
      error: { key: 'errors.unknownWithDetail', params: { detail: 'boom' } },
    }));

    expect(state.shouldUseFullWidthLane).toBe(true);
  });
});
