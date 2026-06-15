/**
 * 说明：`readable-dom` 可见页面与结构列表候选模块。
 *
 * 职责：
 * - 将当前已渲染 DOM 按阅读顺序转换成可见页面正文；
 * - 为论坛、搜索、商品、目录和表格类页面识别重复结构列表；
 * - 在结构列表与普通可见正文之间选择更稳定的页面级候选。
 *
 * 边界：
 * - 本模块不调用 Readability，也不决定 metadata-only 降级原因；
 * - 只采集当前 DOM，不滚动页面，不伪造未渲染内容。
 */
import {
  calculateNaturalLanguageRatio,
  extractCodeLanguage,
  extractElementText,
  extractHeadingsFromBlocks,
  getElementVisibleArea,
  getComposedChildNodes,
  hasStructuralElementChild,
  isCollectableElement,
  isElement,
  isStatusStreamLikeText,
  isTextNode,
  listToMarkdown,
  MAX_STRUCTURED_ITEMS,
  MIN_STRUCTURED_PAGE_CHARS,
  MIN_VISIBLE_PAGE_CHARS,
  normalizeInlineText,
  normalizeText,
  tableToMarkdown,
  TEXT_BLOCK_TAGS,
  type ExtractionCandidate,
  type StructuredCandidate,
  type StructuredCandidateSignal,
  type TextBlock,
} from './readable-dom-helpers';

/**
 * 遍历当前可见 DOM，按阅读顺序采集结构化文本块。
 *
 * @param root - 起始节点。
 * @param blocks - 输出文本块。
 */
function collectVisibleBlocks(root: Node | null, blocks: TextBlock[]): void {
  if (!root || blocks.length >= 600) return;
  if (isTextNode(root)) return;
  if (!isElement(root)) {
    for (const child of Array.from(root.childNodes)) collectVisibleBlocks(child, blocks);
    return;
  }
  if (!isCollectableElement(root, { excludeNoise: true })) return;
  const tag = root.tagName.toLowerCase();
  if (/^h[1-6]$/.test(tag)) {
    const text = normalizeInlineText(root.textContent || '');
    if (text.length >= 2) blocks.push({ kind: 'heading', text, level: tag === 'h1' ? 1 : tag === 'h2' ? 2 : 3 });
    return;
  }
  if (tag === 'pre') {
    const text = normalizeText(root.textContent || '');
    if (text.length >= 2) blocks.push({ kind: 'code', text, language: extractCodeLanguage(root) });
    return;
  }
  if (tag === 'table') {
    const table = tableToMarkdown(root);
    if (table.length >= 8) blocks.push({ kind: 'table', text: table });
    return;
  }
  if (tag === 'ul' || tag === 'ol') {
    const list = listToMarkdown(root);
    if (list.itemCount >= 2 && list.text.length >= 12) {
      blocks.push({ kind: 'list', text: list.text });
      return;
    }
  }
  if (TEXT_BLOCK_TAGS.has(tag)) {
    const text = normalizeText(root.textContent || '');
    if (text.length >= 12) blocks.push({ kind: tag === 'blockquote' ? 'quote' : 'paragraph', text });
    return;
  }
  const text = normalizeText(root.textContent || '');
  if (text.length >= 24 && !hasStructuralElementChild(root) && ['article', 'section', 'main', 'div', 'span', 'a'].includes(tag)) {
    blocks.push({ kind: 'paragraph', text });
    return;
  }
  for (const child of getComposedChildNodes(root)) collectVisibleBlocks(child, blocks);
}

/**
 * 将文本块渲染成轻量 Markdown。
 *
 * @param blocks - 文本块列表。
 * @param maxLen - 最大字符数。
 * @returns Markdown 正文。
 */
function renderBlocksToMarkdown(blocks: TextBlock[], maxLen: number): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.kind === 'heading') {
      const level = Math.max(1, Math.min(3, block.level || 3));
      parts.push(`${'#'.repeat(level)} ${normalizeInlineText(block.text)}`);
    } else if (block.kind === 'code') {
      parts.push(`\`\`\`${block.language || ''}\n${normalizeText(block.text)}\n\`\`\``);
    } else if (block.kind === 'quote') {
      parts.push(normalizeText(block.text).split('\n').map((line) => `> ${line}`).join('\n'));
    } else {
      parts.push(normalizeText(block.text));
    }
    if (parts.join('\n\n').length >= maxLen) break;
  }
  return normalizeText(parts.join('\n\n')).slice(0, maxLen).trim();
}

/**
 * 构建可见页面正文候选。
 *
 * @param maxLen - 最大字符数。
 * @param visibleTextChars - 页面可见文本总量。
 * @returns 可见页面候选；无法达标时返回 `null`。
 */
export function buildVisiblePageCandidate(maxLen: number, visibleTextChars: number): ExtractionCandidate | null {
  const blocks: TextBlock[] = [];
  collectVisibleBlocks(document.body || document.documentElement, blocks);
  const text = renderBlocksToMarkdown(blocks, maxLen);
  const plainText = normalizeText(blocks.map((block) => block.text).join('\n'));
  const contentChars = plainText.length;
  if (contentChars < MIN_VISIBLE_PAGE_CHARS || text.length < MIN_VISIBLE_PAGE_CHARS) return null;
  return {
    mode: 'visible-page',
    text,
    headings: extractHeadingsFromBlocks(blocks),
    contentChars,
    visibleTextChars,
    score: contentChars + blocks.length * 12,
  };
}

/**
 * 为结构列表候选查找临近标题。
 *
 * @param element - 候选元素。
 * @returns 上下文标题。
 */
function findNearbyHeadingText(element: Element): string {
  let current: Element | null = element;
  while (current && current !== document.body) {
    const ownHeading = Array.from(current.querySelectorAll(':scope > h1, :scope > h2, :scope > h3'))
      .map((heading) => normalizeInlineText(heading.textContent || ''))
      .find(Boolean);
    if (ownHeading) return ownHeading;
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (/^h[1-3]$/i.test(sibling.tagName)) {
        const text = normalizeInlineText(sibling.textContent || '');
        if (text) return text;
      }
      sibling = sibling.previousElementSibling;
    }
    current = current.parentElement;
  }
  return normalizeInlineText(document.querySelector('h1')?.textContent || document.title || '');
}

/**
 * 采集 DOM 中可作为结构列表候选的元素。
 *
 * @param root - 起始节点。
 * @param out - 输出元素数组。
 */
function collectStructuredCandidateElements(root: Node | null, out: Element[]): void {
  if (!root) return;
  if (!isElement(root)) {
    for (const child of Array.from(root.childNodes)) collectStructuredCandidateElements(child, out);
    return;
  }
  if (!isCollectableElement(root, { excludeNoise: true })) return;
  const tag = root.tagName.toLowerCase();
  if (['ul', 'ol', 'table', 'main', 'section', 'article', 'div'].includes(tag)) out.push(root);
  for (const child of getComposedChildNodes(root)) collectStructuredCandidateElements(child, out);
}

/**
 * 把多条 item 文本格式化成保序结构列表。
 *
 * @param title - 结构标题。
 * @param items - 条目文本。
 * @returns Markdown 列表。
 */
function formatStructuredItems(title: string, items: string[]): string {
  const header = title ? [`## ${title}`] : [];
  const body = items.slice(0, MAX_STRUCTURED_ITEMS).map((item, index) => {
    const lines = normalizeText(item).split('\n').map((line) => normalizeInlineText(line)).filter(Boolean);
    const [first, ...rest] = lines.length > 0 ? lines : [normalizeInlineText(item)];
    const meta = rest.map((line) => `   ${line}`).join('\n');
    return [`${index + 1}. ${first}`, meta].filter(Boolean).join('\n');
  });
  return normalizeText([...header, ...body].join('\n\n'));
}

/**
 * 计算结构列表候选的通用质量信号。
 *
 * @param element - 候选根元素。
 * @param items - 已抽取的候选条目文本。
 * @param visibleTextChars - 当前页面可见正文总字符数。
 * @returns 结构候选质量信号。
 */
function buildStructuredCandidateSignal(
  element: Element,
  items: string[],
  visibleTextChars: number,
): StructuredCandidateSignal {
  const normalizedItems = items.map((item) => normalizeInlineText(item)).filter(Boolean);
  const total = normalizeText(normalizedItems.join('\n')).length;
  const uniqueCount = new Set(normalizedItems.map((item) => item.toLowerCase())).size;
  const statusLikeCount = normalizedItems.filter(isStatusStreamLikeText).length;
  return {
    visibleArea: getElementVisibleArea(element),
    statusLikeRatio: normalizedItems.length > 0 ? statusLikeCount / normalizedItems.length : 0,
    duplicateRatio: normalizedItems.length > 0 ? 1 - (uniqueCount / normalizedItems.length) : 0,
    naturalLanguageRatio: calculateNaturalLanguageRatio(normalizedItems.join('\n')),
    visibleTextRatio: total / Math.max(1, visibleTextChars),
  };
}

/**
 * 根据质量信号调整结构候选分数。
 *
 * 说明：重复状态流或部署日志在响应式营销页里经常形成很多短条目，旧打分会因为 item 数量
 * 把它们排到整页正文前面。这里改为通用质量降权，不绑定任何域名、URL 或框架。
 *
 * @param baseScore - 原始结构分。
 * @param signal - 质量信号。
 * @returns 调整后的分数。
 */
function scoreStructuredCandidate(baseScore: number, signal: StructuredCandidateSignal): number {
  let multiplier = 1;
  if (signal.statusLikeRatio >= 0.6) multiplier *= 0.38;
  else if (signal.statusLikeRatio >= 0.35) multiplier *= 0.62;
  if (signal.duplicateRatio >= 0.45) multiplier *= 0.7;
  if (signal.naturalLanguageRatio < 0.38) multiplier *= 0.72;
  if (signal.visibleTextRatio < 0.24) multiplier *= 0.78;
  if (signal.visibleArea === 0) multiplier *= 0.35;
  return Math.round(baseScore * multiplier);
}

/**
 * 判断结构候选是否应该让位给整页可见正文。
 *
 * @param structured - 结构候选。
 * @param visible - 可见正文候选。
 * @returns 应使用 visible-page 时返回 `true`。
 */
function shouldPreferVisiblePageForStructuredCandidate(
  structured: ExtractionCandidate,
  visible: ExtractionCandidate,
): boolean {
  const signal = structured.structuredSignal;
  if (!signal) return false;
  const visibleHasHeadings = visible.headings.length >= 2;
  const visibleIsMeaningfullyLarger = visible.contentChars >= structured.contentChars * 1.45;
  const structuredLooksLikeStatusStream = signal.statusLikeRatio >= 0.45
    && signal.naturalLanguageRatio < 0.58
    && signal.visibleTextRatio < 0.42;
  return visibleHasHeadings && visibleIsMeaningfullyLarger && structuredLooksLikeStatusStream;
}

/**
 * 从列表、表格和重复卡片中构建结构页面候选。
 *
 * @param maxLen - 最大字符数。
 * @param visibleTextChars - 页面可见文本总量。
 * @returns 最佳结构候选；没有达标列表时返回 `null`。
 */
export function buildStructuredPageCandidate(maxLen: number, visibleTextChars: number): ExtractionCandidate | null {
  const elements: Element[] = [];
  collectStructuredCandidateElements(document.body || document.documentElement, elements);
  const candidates: StructuredCandidate[] = [];
  for (const element of elements) {
    const tag = element.tagName.toLowerCase();
    const headingText = findNearbyHeadingText(element);
    if (tag === 'ul' || tag === 'ol') {
      const items = Array.from(element.children)
        .filter((child) => child.tagName.toLowerCase() === 'li')
        .map((item) => normalizeText(extractElementText(item)))
        .filter((text) => text.length >= 8);
      const total = normalizeText(items.join('\n')).length;
      if (items.length >= 3 && total >= MIN_STRUCTURED_PAGE_CHARS) {
        const signal = buildStructuredCandidateSignal(element, items, visibleTextChars);
        const baseScore = total + items.length * 120;
        candidates.push({
          text: formatStructuredItems(headingText, items).slice(0, maxLen).trim(),
          headings: headingText ? [{ level: 2, text: headingText.slice(0, 160) }] : [],
          contentChars: total,
          itemCount: items.length,
          score: scoreStructuredCandidate(baseScore, signal),
          signal,
        });
      }
      continue;
    }
    if (tag === 'table') {
      const rows = Array.from(element.querySelectorAll('tr')).map((row) => normalizeInlineText(row.textContent || '')).filter((text) => text.length >= 8);
      const table = tableToMarkdown(element);
      const total = normalizeText(rows.join('\n')).length;
      if (rows.length >= 3 && table.length >= MIN_STRUCTURED_PAGE_CHARS) {
        const signal = buildStructuredCandidateSignal(element, rows, visibleTextChars);
        const baseScore = total + rows.length * 100;
        candidates.push({
          text: normalizeText([headingText ? `## ${headingText}` : '', table].filter(Boolean).join('\n\n')).slice(0, maxLen).trim(),
          headings: headingText ? [{ level: 2, text: headingText.slice(0, 160) }] : [],
          contentChars: total,
          itemCount: rows.length,
          score: scoreStructuredCandidate(baseScore, signal),
          signal,
        });
      }
      continue;
    }
    const childItems = Array.from(element.children)
      .filter((child) => isCollectableElement(child, { excludeNoise: true }))
      .map((child) => normalizeText(extractElementText(child)))
      .filter((text) => text.length >= 18 && text.length <= 900);
    const total = normalizeText(childItems.join('\n')).length;
    const uniqueCount = new Set(childItems.map((item) => item.toLowerCase())).size;
    if (childItems.length >= 4 && uniqueCount >= 3 && total >= MIN_STRUCTURED_PAGE_CHARS) {
      const signal = buildStructuredCandidateSignal(element, childItems, visibleTextChars);
      const baseScore = total + childItems.length * 80;
      candidates.push({
        text: formatStructuredItems(headingText, childItems).slice(0, maxLen).trim(),
        headings: headingText ? [{ level: 2, text: headingText.slice(0, 160) }] : [],
        contentChars: total,
        itemCount: childItems.length,
        score: scoreStructuredCandidate(baseScore, signal),
        signal,
      });
    }
  }
  const best = candidates.sort((left, right) => right.score - left.score)[0];
  if (!best || best.contentChars < MIN_STRUCTURED_PAGE_CHARS || best.itemCount < 3) return null;
  return {
    mode: 'structured-page',
    text: best.text,
    headings: best.headings,
    contentChars: best.contentChars,
    visibleTextChars,
    structuredItemCount: best.itemCount,
    structuredSignal: best.signal,
    score: best.score,
  };
}

/**
 * 在可见页面和结构列表候选之间选择更合适的页面正文策略。
 *
 * @param structured - 结构页面候选。
 * @param visible - 可见页面候选。
 * @returns 最佳页面候选。
 */
export function choosePageCandidate(
  structured: ExtractionCandidate | null,
  visible: ExtractionCandidate | null,
): ExtractionCandidate | null {
  if (structured && !visible) return structured;
  if (!structured && visible) return visible;
  if (!structured || !visible) return null;
  const structuredRatio = structured.contentChars / Math.max(1, visible.contentChars);
  if (shouldPreferVisiblePageForStructuredCandidate(structured, visible)) return visible;
  if ((structured.structuredItemCount ?? 0) >= 3 && structured.contentChars >= MIN_STRUCTURED_PAGE_CHARS && structuredRatio >= 0.28) {
    return structured;
  }
  return visible;
}
