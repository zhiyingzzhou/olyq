/**
 * 说明：`export-html` 基础能力模块。
 *
 * 职责：
 * - 承载 `export-html` 相关的当前文件实现与模块边界；
 * - 对外暴露 `exportToHtml` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 将聊天消息导出为 HTML。
 */

import type { ResolvedConversationContext } from '@/types/chat';
import { getActiveMessages } from '@/types/chat';
import { buildHtmlExportDocument } from './document-builder';

/**
 * 将话题导出为 HTML 文本。
 *
 * @param topic - 要导出的话题快照。
 * @returns 可直接写入 `.html` 文件的完整 HTML 内容。
 */
export async function exportToHtml(topic: ResolvedConversationContext): Promise<string> {
  return await buildHtmlExportDocument({
    title: topic.title || '聊天记录',
    messages: getActiveMessages(topic),
    includeReasoning: true,
    fallbackAssistantModelLabel: topic.model,
  });
}
