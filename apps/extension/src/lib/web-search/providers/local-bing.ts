/**
 * 说明：`local-bing` 基础能力模块。
 *
 * 职责：
 * - 承载 `local-bing` 相关的当前文件实现与模块边界；
 * - 对外暴露 `createLocalBingProvider` 等公开能力，供同层或上层模块复用；
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
 * Bing 本地搜索结果提取器。
 *
 * 说明：
 * - 这里只负责读取 Bing 搜索页里的标题、链接和摘要；
 * - 浏览器标签页编排统一复用共享 contract，不在这里继续碰 browser API。
 */
function extractLocalBingResults(max: number) {
  const results: Array<{ title: string; url: string; snippet: string }> = [];
  const items = document.querySelectorAll('#b_results .b_algo');
  for (const item of items) {
    if (results.length >= max) break;
    const linkEl = item.querySelector('h2 a');
    const snippetEl = item.querySelector('.b_caption p');
    if (!linkEl) continue;
    const url = linkEl.getAttribute('href') ?? '';
    if (!url.startsWith('http')) continue;
    results.push({
      title: linkEl.textContent ?? '',
      url,
      snippet: snippetEl?.textContent ?? '',
    });
  }
  return results;
}

/**
 * 本地 Bing 搜索：打开后台标签访问 Bing，提取结果后关闭。
 * 无需 API 密钥，但需要浏览器扩展环境。
 */
export function createLocalBingProvider(): WebSearchProvider {
  return {
    id: 'local-bing',
    name: 'Bing (本地)',
        /**
     * 内部方法：`search`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async search(query, options) {
      const maxResults = options?.maxResults ?? 5;
      const cleanQuery = normalizeLocalWebSearchQuery(query);
      const searchUrl = `https://cn.bing.com/search?q=${encodeURIComponent(cleanQuery)}&ensearch=1`;
      return await runLocalWebSearchInTemporaryTab<[number], WebSearchResult[]>({
        provider: 'Bing',
        searchUrl,
        active: false,
        extractor: extractLocalBingResults,
        args: [maxResults],
      });
    },
  };
}
