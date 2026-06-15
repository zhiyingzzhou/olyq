/**
 * 说明：`index` 基础能力模块。
 *
 * 职责：
 * - 承载 `index` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ExportFormat`、`exportTopic` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 话题导出统一入口：
 * - 支持 HTML / Markdown / Word 格式
 * - 扩展环境优先使用共享扩展下载 contract；否则回退到 \<a\> 触发下载
 */

import type { ResolvedConversationContext } from '@/types/chat';
import { exportToHtml } from './export-html';
import { exportToMarkdown } from './export-markdown';
import { exportToWord } from './export-word';
import { downloadBlob, sanitizeFilename } from './download';

/** 支持导出的话题格式。 */
export type ExportFormat = 'html' | 'markdown' | 'word';

/**
 * 根据导出格式获取文件扩展名。
 *
 * @param format - 导出格式。
 * @returns 与格式匹配的文件扩展名。
 */
function getExtension(format: ExportFormat): string {
  switch (format) {
    case 'html': return '.html';
    case 'markdown': return '.md';
    case 'word': return '.doc';
  }
}

/**
 * 根据导出格式获取 Blob MIME 类型。
 *
 * @param format - 导出格式。
 * @returns 用于下载文件的 MIME 类型。
 */
function getMimeType(format: ExportFormat): string {
  switch (format) {
    case 'html': return 'text/html';
    case 'markdown': return 'text/markdown';
    case 'word': return 'application/msword';
  }
}

/**
 * 按格式生成最终导出内容。
 *
 * @param topic - 要导出的话题。
 * @param format - 目标导出格式。
 * @returns 已渲染好的文本内容。
 */
async function generateContent(topic: ResolvedConversationContext, format: ExportFormat): Promise<string> {
  switch (format) {
    case 'html': return await exportToHtml(topic);
    case 'markdown': return await exportToMarkdown(topic);
    case 'word': return await exportToWord(topic);
  }
}

/**
 * 导出话题为指定格式并触发下载。
 *
 * 会统一做以下事情：
 * - 基于话题标题生成安全文件名；
 * - 按格式选择内容生成器与 MIME 类型；
 * - 通过浏览器扩展下载链路触发最终文件保存。
 *
 * @param topic - 要导出的话题。
 * @param format - 目标导出格式。
 */
export async function exportTopic(topic: ResolvedConversationContext, format: ExportFormat): Promise<void> {
  const content = await generateContent(topic, format);
  const filename = `${sanitizeFilename(topic.title || '聊天记录')}_${new Date().toISOString().slice(0, 10)}${getExtension(format)}`;
  const mime = getMimeType(format);

  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  await downloadBlob(blob, filename);
}
