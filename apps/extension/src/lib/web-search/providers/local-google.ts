/**
 * 说明：`local-google` 基础能力模块。
 *
 * 职责：
 * - 承载 `local-google` 相关的当前文件实现与模块边界；
 * - 对外暴露 `createLocalGoogleProvider` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { WebSearchProvider, WebSearchResult } from '../types';
import {
  normalizeLocalWebSearchQuery,
  runLocalWebSearchInTemporaryTab,
} from './local-web-search-tabs';

/**
 * Google 本地搜索结果提取器。
 *
 * 说明：
 * - 只负责在已打开的搜索页 DOM 里抽取结构化结果；
 * - 不处理标签页开关、等待加载和焦点恢复，这些都交给共享标签页 contract。
 */
function extractLocalGoogleResults(max: number) {
  // 多级兜底选择器：覆盖新旧 Google DOM 结构
  const ITEM_SELECTOR_LIST = [
    '.tF2Cxc', // 现代 Google 结果卡片
    '#rso .g', // 旧版
    '#search .g',
    '.MjjYud > div[class]', // 另一种常见容器
    '#rso > div[data-hveid]', // 带 hveid 的顶层块
  ];
  const SNIPPET_SELECTORS = '.VwiC3b, [data-sncf="1"], [data-sncf="2"], span[style*="-webkit-line-clamp"], .yDYNvb';

  // 逐个尝试选择器，取第一个能匹配到内容的
  let items: NodeListOf<Element> | Element[] = [];
  for (const sel of ITEM_SELECTOR_LIST) {
    const found = document.querySelectorAll(sel);
    if (found.length > 0) {
      items = found;
      break;
    }
  }
  const results: Array<{ title: string; url: string; snippet: string }> = [];
  const seen = new Set<string>();

  for (const item of items) {
    if (results.length >= max) break;
    // 优先取带 ping 属性的链接（Google 标准搜索结果链接）
    const linkEl = item.querySelector('a[ping]') ?? item.querySelector('a[href^="http"]');
    const titleEl = item.querySelector('h3');
    if (!linkEl || !titleEl) continue;
    const url = linkEl.getAttribute('href') ?? '';
    if (!url.startsWith('http') || seen.has(url)) continue;
    seen.add(url);
    const snippetEl = item.querySelector(SNIPPET_SELECTORS);
    results.push({
      title: titleEl.textContent?.trim() ?? '',
      url,
      snippet: snippetEl?.textContent?.trim() ?? '',
    });
  }
  return results;
}

/**
 * 仅浏览器扩展可用的搜索 Provider：
 * - 打开一个后台临时标签页访问 Google
 * - 等待页面完成加载并留出 DOM 渲染窗口后执行脚本提取搜索结果
 * - 完成后关闭搜索标签页
 * 无需 API 密钥。
 */
export function createLocalGoogleProvider(): WebSearchProvider {
  return {
    id: 'local-google',
    name: 'Google (本地)',
        /**
     * 内部方法：`search`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async search(query, options) {
      const maxResults = options?.maxResults ?? 5;
      const cleanQuery = normalizeLocalWebSearchQuery(query);
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(cleanQuery)}&num=${maxResults + 2}`;
      return await runLocalWebSearchInTemporaryTab<[number], WebSearchResult[]>({
        provider: 'Google',
        searchUrl,
        active: false,
        settleMs: 500,
        extractor: extractLocalGoogleResults,
        args: [maxResults],
      });
    },
  };
}
