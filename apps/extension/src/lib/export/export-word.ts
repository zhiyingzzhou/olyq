/**
 * 说明：`export-word` 基础能力模块。
 *
 * 职责：
 * - 承载 `export-word` 相关的当前文件实现与模块边界；
 * - 对外暴露 `exportToWord` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 将聊天消息导出为 Word 兼容格式（用"类 docx 的 HTML"实现）。
 *
 * 由于运行在浏览器扩展环境，无法直接依赖 docx.js 等库，这里生成带有 Word 兼容样式的 HTML，
 * 并使用 `.doc` 扩展名触发下载，使其可被 Microsoft Word / WPS / LibreOffice 打开。
 * 这是常见且轻量的做法。
 */

import type { ResolvedConversationContext } from '@/types/chat';
import { getActiveMessages } from '@/types/chat';
import { buildWordExportDocument } from './document-builder';

/**
 * 将话题导出为 Word 兼容 HTML 文本。
 *
 * @param topic - 要导出的话题快照。
 * @returns 供 `.doc` 下载使用的 Word 兼容 HTML 内容。
 */
export async function exportToWord(topic: ResolvedConversationContext): Promise<string> {
  return await buildWordExportDocument({
    title: topic.title || '聊天记录',
    messages: getActiveMessages(topic),
    includeReasoning: true,
    fallbackAssistantModelLabel: topic.model,
  });
}
