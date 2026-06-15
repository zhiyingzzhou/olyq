/**
 * 说明：`collectors-readable-markdown` 正文 HTML 轻量 Markdown 转换模块。
 *
 * 职责：
 * - 将 `article` 模式返回的 HTML 正文转换成 prompt 可读 Markdown；
 * - 保持无额外重依赖的轻量 DOM reducer；
 * - 转换失败时回退到正文纯文本，不阻断聊天主链路。
 *
 * 边界：
 * - 本模块只处理已抽取正文片段，不访问 browser-context runtime、source cache 或 DOM 页面状态。
 */

/**
 * 递归把文章 HTML 节点树压平成轻量 Markdown。
 *
 * @param node - 当前节点。
 * @param depth - 当前深度，仅用于有序列表的简化编号。
 * @returns 节点对应的 Markdown 片段。
 */
function convertReadableNodeToMarkdown(node: Node, depth = 0): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
  if (!(node instanceof Element)) return '';
  const childrenText = Array.from(node.childNodes)
    .map((child) => convertReadableNodeToMarkdown(child, depth + 1))
    .join('');
  const text = childrenText.replace(/[ \t]+\n/g, '\n');
  const tag = node.tagName.toLowerCase();
  if (tag === 'h1') return `# ${text.trim()}\n\n`;
  if (tag === 'h2') return `## ${text.trim()}\n\n`;
  if (tag === 'h3') return `### ${text.trim()}\n\n`;
  if (tag === 'p') return `${text.trim()}\n\n`;
  if (tag === 'br') return '\n';
  if (tag === 'strong' || tag === 'b') return `**${text.trim()}**`;
  if (tag === 'em' || tag === 'i') return `*${text.trim()}*`;
  if (tag === 'code' && node.parentElement?.tagName.toLowerCase() !== 'pre') return `\`${text.trim()}\``;
  if (tag === 'pre') {
    const code = node.textContent?.trim() || '';
    const match = (node.querySelector('code')?.className || '').match(/language-([a-z0-9_-]+)/i);
    return `\`\`\`${match?.[1] || ''}\n${code}\n\`\`\`\n\n`;
  }
  if (tag === 'blockquote') return `${text.trim().split('\n').map((line) => `> ${line}`).join('\n')}\n\n`;
  if (tag === 'li') return `${node.parentElement?.tagName.toLowerCase() === 'ol' ? `${depth}. ` : '- '}${text.trim()}\n`;
  if (tag === 'ul' || tag === 'ol') return `${text.trimEnd()}\n\n`;
  if (tag === 'a') {
    const href = node.getAttribute('href') || '';
    const label = text.trim() || href;
    return href ? `[${label}](${href})` : label;
  }
  if (tag === 'hr') return '\n---\n\n';
  return tag === 'div' || tag === 'section' || tag === 'article' ? `${text.trim()}\n\n` : text;
}

/**
 * 把 HTML 正文转成轻量 Markdown。
 *
 * @param html - 文章模式产出的正文 HTML。
 * @param fallbackText - 当 HTML 解析失败时的纯文本兜底。
 * @returns 轻量 Markdown 文本。
 */
export function convertReadableHtmlToMarkdown(html: string | undefined, fallbackText: string): string {
  const normalizedHtml = String(html || '').trim();
  if (!normalizedHtml) return String(fallbackText || '').trim();
  try {
    const doc = new DOMParser().parseFromString(normalizedHtml, 'text/html');
    const markdown = Array.from(doc.body.childNodes).map((child) => convertReadableNodeToMarkdown(child)).join('');
    return markdown.replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim() || String(fallbackText || '').trim();
  } catch {
    return String(fallbackText || '').trim();
  }
}
