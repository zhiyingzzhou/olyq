/**
 * 说明：`MessageTraceBlocks` 组件模块。
 *
 * 职责：
 * - 按 assistant `trace` 的真实顺序渲染 reasoning / tool-call 区块；
 * - 让消息气泡、ModelCard 和其它消费方复用同一套 trace 展示逻辑；
 * - 杜绝 UI 再把 reasoning 固定挪到 tool-call 前面。
 *
 * 边界：
 * - 本文件只负责 trace 区块渲染；
 * - 不处理正文 markdown、图片附件、web search 或错误块布局。
 */
import type { Message } from '@/types/chat';
import { getMessageTraceSegments } from '@/lib/chat/message-trace';

import { ThinkingBlock } from './ThinkingBlock';
import { ToolCallBlock } from './ToolCallBlock';

interface MessageTraceBlocksProps {
  /** 当前 assistant 消息。 */
  message: Message;
  /** 是否仍在流式输出 reasoning。 */
  isStreamingReasoning?: boolean;
  /** 受控展开态；当前按 message 维度复用。 */
  thinkingExpanded?: boolean;
  /** reasoning 展开态变更回调。 */
  onThinkingExpandedChange?: (next: boolean) => void;
  /** 中止某条工具调用。 */
  onToolAbort?: (toolCallId: string) => void;
}

/** 按 trace 真源渲染 assistant 内部过程。 */
export function MessageTraceBlocks({
  message,
  isStreamingReasoning,
  thinkingExpanded,
  onThinkingExpandedChange,
  onToolAbort,
}: MessageTraceBlocksProps) {
  const segments = getMessageTraceSegments(message);
  if (segments.length === 0) return null;

  return (
    <>
      {segments.map((segment) => (
        segment.kind === 'reasoning' ? (
          <ThinkingBlock
            key={segment.key}
            content={segment.text}
            isStreaming={isStreamingReasoning}
            expanded={thinkingExpanded}
            onExpandedChange={onThinkingExpandedChange}
          />
        ) : (
          <ToolCallBlock
            key={segment.key}
            toolCalls={[segment.toolCall]}
            onAbort={onToolAbort}
          />
        )
      ))}
    </>
  );
}
