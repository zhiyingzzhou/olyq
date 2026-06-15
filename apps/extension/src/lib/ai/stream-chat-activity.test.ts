/**
 * 说明：`stream-chat-activity.test` AI 能力模块。
 *
 * 职责：
 * - 覆盖流活动归一化 helper 的 transport allowlist 与 raw chunk 判型；
 * - 确保非正文 activity 只作为 watchdog 心跳，不被任意 raw chunk 扩大。
 *
 * 边界：
 * - 本文件只验证纯 helper，不触发真实 provider 请求。
 */
import { describe, expect, it } from 'vitest';

import {
  readActivityFromAiSdkPart,
  readActivityFromRawChunk,
  shouldIncludeRawChunksForActivity,
} from './stream-chat-activity';

describe('stream-chat-activity', () => {
  it('只为已验证的流式 activity transport 内部开启 raw chunks', () => {
    expect(shouldIncludeRawChunksForActivity({ transportProtocol: 'openai-responses' })).toBe(true);
    expect(shouldIncludeRawChunksForActivity({ transportProtocol: 'openai-chat' })).toBe(true);
    expect(shouldIncludeRawChunksForActivity({ transportProtocol: 'anthropic-messages' })).toBe(false);
    expect(shouldIncludeRawChunksForActivity({ transportProtocol: 'unknown' })).toBe(false);
  });

  it('会把 AI SDK 的非正文语义事件归一为 chat/progress stage', () => {
    expect(readActivityFromAiSdkPart({ type: 'start-step' })).toBe('stream-start');
    expect(readActivityFromAiSdkPart({ type: 'reasoning-start' })).toBe('reasoning-start');
    expect(readActivityFromAiSdkPart({ type: 'tool-input-delta' })).toBe('tool-input-delta');
    expect(readActivityFromAiSdkPart({ type: 'text-delta' })).toBeNull();
  });

  it('会识别 OpenAI Responses raw progress，但不会把普通 output item 当心跳', () => {
    expect(readActivityFromRawChunk(
      { type: 'response.created', response: { id: 'resp_1' } },
      { transportProtocol: 'openai-responses' },
    )).toBe('stream-start');
    expect(readActivityFromRawChunk(
      { type: 'response.output_item.added', item: { type: 'reasoning' } },
      { transportProtocol: 'openai-responses' },
    )).toBe('response-in-progress');
    expect(readActivityFromRawChunk(
      { type: 'response.output_item.added', item: { type: 'message' } },
      { transportProtocol: 'openai-responses' },
    )).toBeNull();
  });

  it('会识别 OpenAI-compatible Chat reasoning raw chunk', () => {
    expect(readActivityFromRawChunk(
      { choices: [{ delta: { reasoning_content: 'thinking...' } }] },
      { transportProtocol: 'openai-chat' },
    )).toBe('response-in-progress');
    expect(readActivityFromRawChunk(
      { choices: [{ delta: { reasoning_details: [{ type: 'reasoning.text', text: 'step' }] } }] },
      { transportProtocol: 'openai-chat' },
    )).toBe('response-in-progress');
    expect(readActivityFromRawChunk(
      { choices: [{ delta: { reasoning: 'step' } }] },
      { transportProtocol: 'openai-chat' },
    )).toBe('response-in-progress');
  });

  it('不会把未知 raw chunk 或空 reasoning 字段扩大成 heartbeat', () => {
    expect(readActivityFromRawChunk(
      { choices: [{ delta: { content: 'hello' } }] },
      { transportProtocol: 'openai-chat' },
    )).toBeNull();
    expect(readActivityFromRawChunk(
      { choices: [{ delta: { reasoning_content: '   ', reasoning_details: [] } }] },
      { transportProtocol: 'openai-chat' },
    )).toBeNull();
    expect(readActivityFromRawChunk(
      { choices: [{ delta: { reasoning_content: 'thinking...' } }] },
      { transportProtocol: 'gemini-generate-content' },
    )).toBeNull();
  });
});
