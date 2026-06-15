/**
 * 说明：`message-utils` 基础能力模块。
 *
 * 职责：
 * - 承载 `message-utils` 相关的当前文件实现与模块边界；
 * - 对外暴露 `getActiveMessages` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { TopicConversation, Message } from '@/types/chat';

/** 获取当前话题下的消息 */
export function getActiveMessages(topic: TopicConversation): Message[] {
  return Array.isArray(topic.messages) ? topic.messages : [];
}
