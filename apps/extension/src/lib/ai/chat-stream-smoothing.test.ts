/**
 * 说明：`chat-stream-smoothing.test` AI 能力模块。
 *
 * 职责：
 * - 覆盖主聊天平滑 chunk detector 的可见粒度；
 * - 覆盖 AI SDK transform 对正文、reasoning 与非文本事件的结构保持。
 *
 * 边界：
 * - 测试只验证本地 chunking contract，不访问真实 provider。
 */
import { describe, expect, it, vi } from 'vitest';

import {
  createChatSmoothStreamTransform,
  detectChatSmoothChunk,
} from './chat-stream-smoothing';

/**
 * 按 detector 规则耗尽一段输入，并在 detector 等待更多字符时模拟终态 flush。
 *
 * @param input - 要切分的完整测试文本。
 * @returns 依次释放给用户可见层的 chunk。
 */
function drainDetectedChunks(input: string): string[] {
  const chunks: string[] = [];
  let buffer = input;
  while (buffer.length > 0) {
    const chunk = detectChatSmoothChunk(buffer);
    if (chunk == null) {
      chunks.push(buffer);
      break;
    }
    chunks.push(chunk);
    buffer = buffer.slice(chunk.length);
  }
  return chunks;
}

/**
 * 把一组 AI SDK stream part 穿过主聊天 smoothing transform 并收集输出。
 *
 * @param parts - 输入 transform 的 stream part 序列。
 * @returns transform 排空后的输出 part 序列。
 */
async function collectThroughSmoothTransform(parts: readonly unknown[]): Promise<unknown[]> {
  const transform = createChatSmoothStreamTransform({
    delayInMs: null,
    delay: async () => undefined,
  })({ tools: {}, stopStream: vi.fn() }) as TransformStream<unknown, unknown>;
  const stream = new ReadableStream<unknown>({
    /**
     * 将测试输入同步压入 ReadableStream，避免计时器影响 transform 顺序断言。
     *
     * @param controller - 当前测试 ReadableStream 的控制器。
     */
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  }).pipeThrough(transform);
  const reader = stream.getReader();
  const output: unknown[] = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    output.push(value);
  }

  return output;
}

/**
 * 从未知 stream part 中读取 `text` 字段，供测试断言避免使用 `any`。
 *
 * @param part - 待检查的输出 part。
 * @returns part 上的 `text` 字段；非文本 part 返回 `undefined`。
 */
function readPartText(part: unknown): unknown {
  return part && typeof part === 'object' && 'text' in part
    ? (part as { readonly text?: unknown }).text
    : undefined;
}

/**
 * 从未知 stream part 中读取 `type` 字段，供测试断言事件顺序。
 *
 * @param part - 待检查的输出 part。
 * @returns part 上的 `type` 字段；非对象返回 `undefined`。
 */
function readPartType(part: unknown): unknown {
  return part && typeof part === 'object' && 'type' in part
    ? (part as { readonly type?: unknown }).type
    : undefined;
}

describe('chat-stream-smoothing', () => {
  it('中文按字素逐个释放', () => {
    expect(drainDetectedChunks('你好世界')).toEqual(['你', '好', '世', '界']);
  });

  it('英文按词释放并保留词后的空格', () => {
    expect(drainDetectedChunks('hello world')).toEqual(['hello ', 'world']);
  });

  it('中英混排不会把英文模型名拆成逐字母', () => {
    expect(drainDetectedChunks('你好 GPT-5')).toEqual(['你', '好', ' ', 'GPT-5']);
  });

  it('标点、换行、emoji 与组合字符保持稳定短片段', () => {
    expect(drainDetectedChunks('Hi,\n👨‍👩‍👧‍👦 cafe\u0301!')).toEqual([
      'Hi',
      ',',
      '\n',
      '👨‍👩‍👧‍👦',
      ' ',
      'cafe\u0301',
      '!',
    ]);
  });

  it('transform 跨上游 chunk 边界也不会拆坏 emoji 组合字素', async () => {
    const output = await collectThroughSmoothTransform([
      { type: 'text-delta', id: 'text-1', text: '👨' },
      { type: 'text-delta', id: 'text-1', text: '\u200D👩\u200D👧\u200D👦 1' },
      { type: 'text-delta', id: 'text-1', text: '\uFE0F\u20E3 ok' },
      {
        type: 'finish-step',
        response: {},
        usage: { inputTokens: 1, outputTokens: 1 },
        finishReason: 'stop',
        rawFinishReason: 'stop',
        providerMetadata: {},
      },
    ]);

    expect(output.map(readPartType)).toEqual([
      'text-delta',
      'text-delta',
      'text-delta',
      'text-delta',
      'text-delta',
      'finish-step',
    ]);
    expect(output.slice(0, 5).map(readPartText)).toEqual([
      '👨‍👩‍👧‍👦',
      ' ',
      '1️⃣',
      ' ',
      'ok',
    ]);
  });

  it('transform 同时平滑 text-delta 与 reasoning-delta', async () => {
    const output = await collectThroughSmoothTransform([
      { type: 'text-delta', id: 'text-1', text: '你好' },
      { type: 'reasoning-delta', id: 'reason-1', text: '思考' },
      {
        type: 'finish-step',
        response: {},
        usage: { inputTokens: 1, outputTokens: 1 },
        finishReason: 'stop',
        rawFinishReason: 'stop',
        providerMetadata: {},
      },
    ]);

    expect(output.map(readPartType)).toEqual([
      'text-delta',
      'text-delta',
      'reasoning-delta',
      'reasoning-delta',
      'finish-step',
    ]);
    expect(output.slice(0, 4).map(readPartText)).toEqual(['你', '好', '思', '考']);
  });

  it('非文本事件不会被伪造成正文，并会触发前置文本 flush', async () => {
    const sourcePart = {
      type: 'source',
      sourceType: 'url',
      id: 'source-1',
      url: 'https://example.com',
      title: 'Example',
    };
    const output = await collectThroughSmoothTransform([
      { type: 'text-delta', id: 'text-1', text: 'hello' },
      sourcePart,
      {
        type: 'finish-step',
        response: {},
        usage: { inputTokens: 1, outputTokens: 1 },
        finishReason: 'stop',
        rawFinishReason: 'stop',
        providerMetadata: {},
      },
    ]);

    expect(output.map(readPartType)).toEqual(['text-delta', 'source', 'finish-step']);
    expect(readPartText(output[0])).toBe('hello');
    expect(output[1]).toBe(sourcePart);
  });
});
