/**
 * 说明：`inline-output` 内容脚本内联响应展示归一化模块。
 *
 * 职责：
 * - 为 page-facing 内联响应卡片提供最终可见文案规范化；
 * - 把容易膨胀的展示规则从 content script 主入口拆出，保持主入口只负责运行时编排。
 *
 * 边界：
 * - 不访问 DOM、runtime、storage 或 i18n；
 * - 不改写模型请求内容，只处理页面卡片展示文本。
 */

/** 翻译内联结果允许清理的整段包裹引号，只处理一层包装。 */
const TRANSLATION_WRAPPING_QUOTE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['"', '"'],
  ['“', '”'],
  ['‘', '’'],
  ["'", "'"],
];

/**
 * 归一化页内流式结果的可见文案。
 *
 * 说明：
 * - 当前只对翻译动作生效，避免解释 / 总结里的引用表达被误删；
 * - 流式输出里开头包装引号一出现就先隐藏，避免页面先闪 `"xxx` 再替换成 `xxx`；
 * - 最终若末尾出现匹配的收尾引号，也只移除这一层，正文内部引号保持原样。
 *
 * @param action - 当前划词内联动作。
 * @param content - 模型流式累积出的原始文本。
 * @returns 可直接写入内联响应卡片的展示文本。
 */
export function normalizeInlineOutputForDisplay(action: string, content: string): string {
  if (action !== "translate") return content;
  const candidate = content.trimStart();
  for (const [openQuote, closeQuote] of TRANSLATION_WRAPPING_QUOTE_PAIRS) {
    if (candidate.startsWith(openQuote)) {
      const body = candidate.slice(openQuote.length);
      if (body.endsWith(closeQuote)) {
        return body.slice(0, body.length - closeQuote.length);
      }
      return body;
    }
  }
  return content;
}
