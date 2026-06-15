/**
 * 说明：`chat-utils.test` 基础能力模块。
 *
 * 职责：
 * - 承载 `chat-utils.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { describe, expect, it } from 'vitest';
import type { Message } from '@/types/chat';
import { isEmptyAssistantShellMessage, pickContextMessages, shouldIncludeMessageInModelContext } from './chat-utils';

/**
 * 测试辅助函数：`makeMessage`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function makeMessage(overrides?: Partial<Message>): Message {
  return {
    id: 'm1',
    role: 'assistant',
    content: '',
    createdAt: 1,
    ...overrides,
  };
}

describe('chat-utils context filtering', () => {
  it('会识别失败后残留的空 assistant 壳消息', () => {
    expect(isEmptyAssistantShellMessage(makeMessage())).toBe(true);
    expect(shouldIncludeMessageInModelContext(makeMessage())).toBe(false);
  });

  it('带 reasoning、toolCalls、attachments 或 content 的 assistant 不会被误删', () => {
    expect(shouldIncludeMessageInModelContext(makeMessage({
      trace: [{ kind: 'reasoning', text: 'thinking' }],
    }))).toBe(true);
    expect(
      shouldIncludeMessageInModelContext(
        makeMessage({
          trace: [{ kind: 'tool-call', toolCallId: 'tc1', toolName: 'demo', args: {}, status: 'done' }],
        }),
      ),
    ).toBe(true);
    expect(
      shouldIncludeMessageInModelContext(
        makeMessage({
          attachments: [{ type: 'image', id: 'a1', name: 'demo.png', mime: 'image/png', size: 1 }],
        }),
      ),
    ).toBe(true);
    expect(shouldIncludeMessageInModelContext(makeMessage({ content: 'hello' }))).toBe(true);
  });

  it('pickContextMessages 不会把空 assistant 壳消息带入下一轮上下文', () => {
    const messages: Message[] = [
      { id: 'u1', role: 'user', content: 'first', createdAt: 1 },
      makeMessage({ id: 'a1' }),
      { id: 'u2', role: 'user', content: 'hello', createdAt: 2 },
    ];

    expect(pickContextMessages(messages, 10).map((message) => message.id)).toEqual(['u1', 'u2']);
  });
});
