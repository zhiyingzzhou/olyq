/**
 * 说明：`isFailedAssistant` 组件模块。
 *
 * 职责：
 * - 承载 `isFailedAssistant` 相关的当前文件实现与模块边界；
 * - 对外暴露 `isFailedAssistant` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { Message } from '@/types/chat';
import { hasMessageToolCalls } from '@/lib/chat/message-trace';

/**
 * 导出函数：`isFailedAssistant`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function isFailedAssistant(message: Message) {
  if (message.role !== 'assistant') return false;
  if (message.status === 'pending' || message.status === 'preparing' || message.status === 'processing') return false;
  if (message.status === 'error') return true;
  const hasText = Boolean(String(message.content || '').trim());
  const hasTool = hasMessageToolCalls(message);
  const hasAttachments = (message.attachments?.length ?? 0) > 0;
  return !hasText && !hasTool && !hasAttachments;
}
