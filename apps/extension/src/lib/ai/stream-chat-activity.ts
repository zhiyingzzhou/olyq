/**
 * 说明：`stream-chat-activity` AI 能力模块。
 *
 * 职责：
 * - 统一把 AI SDK 语义流事件与已验证 raw chunk 归一为内部活跃信号；
 * - 决定哪些 transport 需要为了 watchdog 消费而内部开启 raw chunks；
 * - 保持活跃信号与用户可见输出解耦，避免把非正文进度伪造成回复内容。
 *
 * 边界：
 * - 本模块只输出 `StreamChatProgressStage`，不发事件、不拼正文、不处理终态；
 * - raw chunk 只认官方或已验证契约字段，不把任意未知 chunk 当 heartbeat。
 */
import type { StreamChatProgressStage } from './stream-chat-types';
import type { TransportProtocol } from './types';

/** 流活动归一化所需的最小运行时上下文。 */
export interface StreamChatActivityContext {
  /** 当前模型实际使用的 transport。 */
  readonly transportProtocol?: TransportProtocol;
}

/** AI SDK stream part 的最小结构，避免本模块依赖完整 SDK union 细节。 */
export interface StreamChatActivityPart {
  /** AI SDK fullStream part 类型。 */
  readonly type?: unknown;
}

/**
 * 判断当前 transport 是否需要为了内部 activity detector 开启 raw chunks。
 *
 * @param ctx - 当前流式请求的最小 transport 上下文。
 * @returns 需要内部消费 raw chunk 时返回 true。
 */
export function shouldIncludeRawChunksForActivity(ctx: StreamChatActivityContext): boolean {
  return ctx.transportProtocol === 'openai-responses' || ctx.transportProtocol === 'openai-chat';
}

/**
 * 从 AI SDK 已结构化的 stream part 中读取内部活跃阶段。
 *
 * @param part - AI SDK `fullStream` 产出的单个 part。
 * @returns 可用于 `chat/progress` 的阶段；不可作为活跃信号时返回 null。
 */
export function readActivityFromAiSdkPart(part: StreamChatActivityPart): StreamChatProgressStage | null {
  switch (part.type) {
    case 'start-step':
      return 'stream-start';
    case 'text-start':
      return 'text-start';
    case 'reasoning-start':
      return 'reasoning-start';
    case 'reasoning-end':
      return 'reasoning-end';
    case 'tool-input-start':
      return 'tool-input-start';
    case 'tool-input-delta':
      return 'tool-input-delta';
    case 'tool-input-end':
      return 'tool-input-end';
    default:
      return null;
  }
}

/**
 * 从 provider raw chunk 中读取内部活跃阶段。
 *
 * @param rawValue - AI SDK `raw` part 暴露的 provider 原始 chunk。
 * @param ctx - 当前流式请求的最小 transport 上下文。
 * @returns 可用于 `chat/progress` 的阶段；不可作为活跃信号时返回 null。
 */
export function readActivityFromRawChunk(
  rawValue: unknown,
  ctx: StreamChatActivityContext,
): StreamChatProgressStage | null {
  switch (ctx.transportProtocol) {
    case 'openai-responses':
      return readOpenAiResponsesRawActivity(rawValue);
    case 'openai-chat':
      return readOpenAiChatRawActivity(rawValue);
    default:
      return null;
  }
}

/**
 * OpenAI Responses raw activity。
 *
 * 这些事件只证明流已经开始或仍在推进，不代表用户可见输出。
 */
function readOpenAiResponsesRawActivity(rawValue: unknown): StreamChatProgressStage | null {
  if (!isRecord(rawValue)) return null;
  if (rawValue.type === 'response.created') return 'stream-start';
  if (rawValue.type === 'response.in_progress' || rawValue.type === 'keepalive') {
    return 'response-in-progress';
  }

  if (rawValue.type !== 'response.output_item.added' && rawValue.type !== 'output_item.added') {
    return null;
  }
  const item = rawValue.item;
  if (!isRecord(item)) return null;
  return item.type === 'reasoning' ? 'response-in-progress' : null;
}

/**
 * OpenAI Chat / OpenAI-compatible raw activity。
 *
 * DeepSeek、DashScope、SiliconFlow 等兼容 Chat Completions 的思考流会先在
 * `choices[].delta.reasoning_content` 中输出思考片段；OpenRouter 使用
 * `choices[].delta.reasoning_details`。这里只把这些已验证的非正文字段
 * 归一成 watchdog activity，不把内容暴露给 UI。
 */
function readOpenAiChatRawActivity(rawValue: unknown): StreamChatProgressStage | null {
  if (!isRecord(rawValue)) return null;
  const choices = rawValue.choices;
  if (!Array.isArray(choices)) return null;

  for (const choice of choices) {
    if (!isRecord(choice)) continue;
    const delta = choice.delta;
    if (!isRecord(delta)) continue;
    if (
      hasMeaningfulReasoningValue(delta.reasoning_content)
      || hasMeaningfulReasoningValue(delta.reasoning_details)
      || hasMeaningfulReasoningValue(delta.reasoning)
    ) {
      return 'response-in-progress';
    }
  }

  return null;
}

/** 判断 unknown 是否为普通可读对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/**
 * 判断原生 reasoning/thinking 字段是否携带有效片段。
 *
 * 说明：
 * - 字符串必须非空；
 * - 数组或对象只要出现结构化片段即可证明上游仍在推进；
 * - boolean / number 不作为 activity，避免误把标志位当心跳。
 */
function hasMeaningfulReasoningValue(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.keys(value).length > 0;
  return false;
}
