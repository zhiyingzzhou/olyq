/**
 * 说明：`element-draft-markdown` 组件模块。
 *
 * 职责：
 * - 维护输入区页面元素草稿与历史引用卡之间的结构化真源转换；
 * - 保持引用卡 ID、元素结构、来源和附件归属稳定；
 * - 不在这里生成本地化标题、摘要或 Markdown，避免把当前语言字符串写入持久化消息。
 *
 * 边界：
 * - 本文件只做结构规整，不读取 DOM、不访问附件存储、不触发发送。
 */
import { sanitizeElementActionPayload } from '@/lib/element-context-draft';
import type { MessageContextReference } from '@/types/chat';
import type { ChatInputElementExternalDraft } from './types';

/** 输入区页面元素引用卡的本地展示模型。 */
export type ChatInputElementDraftCard = MessageContextReference;

/**
 * 将已消费的外部草稿转为结构化引用卡模型。
 *
 * @param draft - 外部元素上下文草稿。
 * @param attachmentIds - 已成功加入输入区附件队列的附件 ID。
 * @returns 可用于渲染和发送的当前 schema 引用卡数据。
 */
export function createElementDraftCard(draft: ChatInputElementExternalDraft, attachmentIds: string[]): ChatInputElementDraftCard | null {
  const payload = sanitizeElementActionPayload({ element: draft.element, source: draft.source });
  if (!payload) return null;
  return {
    id: draft.id,
    kind: 'element',
    element: payload.element,
    ...(payload.source ? { source: payload.source } : {}),
    attachmentIds,
  };
}
