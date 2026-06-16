/**
 * 说明：`markdown-table` Markdown 表格文本工具。
 *
 * 职责：
 * - 为 browser-context、元素选择器和元素引用卡片统一生成安全表格单元格；
 * - 避免各模块用不完整的正则替换分别处理 Markdown 分隔符。
 *
 * 边界：
 * - 本模块只处理纯文本到 Markdown table cell 的最小转义；
 * - 不承担完整 Markdown AST、HTML 清洗或 UI 渲染职责。
 */

/**
 * 将任意文本规整成 Markdown 表格单元格。
 *
 * @param value - 原始单元格文本。
 * @returns 已压缩空白并转义反斜杠和竖线的单元格文本。
 */
export function escapeMarkdownTableCell(value: string): string {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  let out = '';
  for (const char of normalized) {
    if (char === '\\' || char === '|') out += '\\';
    out += char;
  }
  return out;
}
