/**
 * 说明：`message-trace` 基础能力模块。
 *
 * 职责：
 * - 承载 assistant 消息内部过程 trace 的唯一读写 helper；
 * - 统一 reasoning / tool-call 的顺序化读取、写回与展示分段；
 * - 避免 UI、导出、搜索和消息动作各自重建第二套 owner。
 *
 * 边界：
 * - 本文件只处理 trace 的结构化读写与轻量格式化；
 * - 不负责消息正文 markdown、web search 或翻译块逻辑。
 */
import type {
  Message,
  MessageReasoningTraceItem,
  MessageToolCallTraceItem,
  MessageTraceItem,
  ToolCallInfo,
} from '@/types/chat';

/** trace 展示分段：连续 reasoning 会在这里合并成一个块。 */
export type MessageTraceSegment =
  | { kind: 'reasoning'; key: string; text: string }
  | { kind: 'tool-call'; key: string; toolCall: MessageToolCallTraceItem };

type TraceCarrier = Pick<Message, 'trace'> | { trace?: MessageTraceItem[] } | null | undefined;

/** 判断是否为 reasoning trace 条目。 */
export function isMessageReasoningTraceItem(item: MessageTraceItem): item is MessageReasoningTraceItem {
  return item.kind === 'reasoning';
}

/** 判断是否为 tool-call trace 条目。 */
export function isMessageToolCallTraceItem(item: MessageTraceItem): item is MessageToolCallTraceItem {
  return item.kind === 'tool-call';
}

/** 获取消息 trace；缺失时稳定回空数组。 */
export function getMessageTrace(message: TraceCarrier): MessageTraceItem[] {
  return Array.isArray(message?.trace) ? message.trace : [];
}

/** 从 trace 中拼出完整 reasoning 文本。 */
export function getTraceReasoningText(trace: MessageTraceItem[] | undefined | null): string {
  if (!Array.isArray(trace) || trace.length === 0) return '';
  let output = '';
  for (const item of trace) {
    if (item.kind !== 'reasoning') continue;
    output += item.text;
  }
  return output;
}

/** 从消息中拼出完整 reasoning 文本。 */
export function getMessageReasoningText(message: TraceCarrier): string {
  return getTraceReasoningText(getMessageTrace(message));
}

/** 提取 trace 内的全部工具调用。 */
export function getTraceToolCalls(trace: MessageTraceItem[] | undefined | null): MessageToolCallTraceItem[] {
  if (!Array.isArray(trace) || trace.length === 0) return [];
  return trace.filter(isMessageToolCallTraceItem);
}

/** 提取消息内的全部工具调用。 */
export function getMessageToolCalls(message: TraceCarrier): MessageToolCallTraceItem[] {
  return getTraceToolCalls(getMessageTrace(message));
}

/** 判断 trace 内是否存在 reasoning 条目。 */
export function hasReasoningTrace(trace: MessageTraceItem[] | undefined | null): boolean {
  if (!Array.isArray(trace)) return false;
  return trace.some((item) => item.kind === 'reasoning' && item.text.length > 0);
}

/** 判断消息内是否存在 reasoning 条目。 */
export function hasMessageReasoningTrace(message: TraceCarrier): boolean {
  return hasReasoningTrace(getMessageTrace(message));
}

/** 判断 trace 内是否存在工具调用。 */
export function hasToolCallTrace(trace: MessageTraceItem[] | undefined | null): boolean {
  if (!Array.isArray(trace)) return false;
  return trace.some((item) => item.kind === 'tool-call');
}

/** 判断消息内是否存在工具调用。 */
export function hasMessageToolCalls(message: TraceCarrier): boolean {
  return hasToolCallTrace(getMessageTrace(message));
}

/**
 * 追加 reasoning chunk。
 *
 * 说明：
 * - 若最后一项已经是 reasoning，则直接把 chunk 追加到该项；
 * - 否则新建一条 reasoning trace，保证事件顺序不被 UI 二次改写。
 */
export function appendReasoningTrace(
  trace: MessageTraceItem[] | undefined,
  chunkRaw: string,
): MessageTraceItem[] {
  const chunk = String(chunkRaw || '');
  if (!chunk) return Array.isArray(trace) ? trace : [];

  const next = Array.isArray(trace) ? [...trace] : [];
  const last = next.at(-1);
  if (last?.kind === 'reasoning') {
    next[next.length - 1] = { ...last, text: `${last.text}${chunk}` };
    return next;
  }
  next.push({ kind: 'reasoning', text: chunk });
  return next;
}

/** 追加一条新的工具调用 trace。 */
export function pushToolCallTrace(
  trace: MessageTraceItem[] | undefined,
  toolCall: ToolCallInfo,
): MessageTraceItem[] {
  const next = Array.isArray(trace) ? [...trace] : [];
  next.push({ kind: 'tool-call', ...toolCall });
  return next;
}

/**
 * 按 `toolCallId` 更新已有工具调用 trace。
 *
 * 说明：
 * - 只更新命中的那一条工具调用，不会改动其它 trace 项；
 * - 若目标不存在，则原样返回，避免意外制造第二条同 ID 工具记录。
 */
export function patchToolTrace(
  trace: MessageTraceItem[] | undefined,
  toolCallIdRaw: string,
  patch: Partial<ToolCallInfo>,
): MessageTraceItem[] {
  const toolCallId = String(toolCallIdRaw || '').trim();
  if (!toolCallId || !Array.isArray(trace) || trace.length === 0) return Array.isArray(trace) ? trace : [];

  const index = trace.findIndex((item) => item.kind === 'tool-call' && item.toolCallId === toolCallId);
  if (index < 0) return trace;

  const target = trace[index] as MessageToolCallTraceItem;
  const next = [...trace];
  next[index] = { ...target, ...patch, kind: 'tool-call', toolCallId: target.toolCallId };
  return next;
}

/**
 * 获取按渲染顺序合并后的 trace 分段。
 *
 * 说明：
 * - 连续 reasoning 在 UI 上应展示为一个 ThinkingBlock，因此这里会先合并；
 * - tool-call 保持一条 trace 对应一张卡片，顺序与原 trace 一致。
 */
export function getTraceSegments(trace: MessageTraceItem[] | undefined | null): MessageTraceSegment[] {
  if (!Array.isArray(trace) || trace.length === 0) return [];

  const segments: MessageTraceSegment[] = [];
  let reasoningBuffer = '';
  let reasoningStartIndex = -1;

  /** 把当前累计的 reasoning buffer 刷成一个独立分段。 */
  const flushReasoning = () => {
    if (!reasoningBuffer) return;
    segments.push({
      kind: 'reasoning',
      key: `reasoning-${reasoningStartIndex}`,
      text: reasoningBuffer,
    });
    reasoningBuffer = '';
    reasoningStartIndex = -1;
  };

  for (let index = 0; index < trace.length; index += 1) {
    const item = trace[index]!;
    if (item.kind === 'reasoning') {
      if (!reasoningBuffer) reasoningStartIndex = index;
      reasoningBuffer += item.text;
      continue;
    }

    flushReasoning();
    segments.push({
      kind: 'tool-call',
      key: `tool-${item.toolCallId}-${index}`,
      toolCall: item,
    });
  }

  flushReasoning();
  return segments;
}

/** 获取消息按渲染顺序合并后的 trace 分段。 */
export function getMessageTraceSegments(message: TraceCarrier): MessageTraceSegment[] {
  return getTraceSegments(getMessageTrace(message));
}

/**
 * 将工具调用格式化成搜索/导出可复用的纯文本。
 *
 * 说明：
 * - 保留 tool name、args、result、error 与 status；
 * - JSON 结构统一转成稳定字符串，避免不同消费方各自 stringify 出不同文本。
 */
export function formatToolCallTraceText(toolCall: Pick<ToolCallInfo, 'toolName' | 'args' | 'result' | 'error' | 'status'>): string {
  const parts = [
    String(toolCall.toolName || '').trim(),
    stringifyTraceValue(toolCall.args),
    toolCall.status === 'done' ? stringifyTraceValue(toolCall.result) : '',
    stringifyTraceValue(toolCall.error),
    String(toolCall.status || '').trim(),
  ];
  return parts.filter(Boolean).join('\n');
}

/** 把 trace 内的任意值转成稳定字符串。 */
function stringifyTraceValue(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
