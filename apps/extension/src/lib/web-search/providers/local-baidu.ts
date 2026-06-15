/**
 * 说明：`local-baidu` 基础能力模块。
 *
 * 职责：
 * - 承载 `local-baidu` 相关的当前文件实现与模块边界；
 * - 对外暴露 `createLocalBaiduProvider` 等公开能力，供同层或上层模块复用；
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
 * 百度本地搜索结果提取器。
 *
 * 说明：
 * - 这里只负责从百度结果页提取结构化条目；
 * - 临时标签页的打开、等待和关闭统一交给共享 contract。
 */
function extractLocalBaiduResults(max: number) {
  const results: Array<{ title: string; url: string; snippet: string }> = [];
  const items = document.querySelectorAll('#content_left .result, #content_left .result-op');
  for (const item of items) {
    if (results.length >= max) break;
    const linkEl = item.querySelector('h3 a');
    const snippetEl = item.querySelector('.c-abstract, .c-gap-top-small');
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
 * 本地百度搜索：打开后台标签访问百度，提取结果后关闭。
 * 无需 API 密钥，但需要浏览器扩展环境。
 */
export function createLocalBaiduProvider(): WebSearchProvider {
  return {
    id: 'local-baidu',
    name: '百度 (本地)',
        /**
     * 内部方法：`search`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async search(query, options) {
      const maxResults = options?.maxResults ?? 5;
      const cleanQuery = normalizeLocalWebSearchQuery(query);
      const searchUrl = `https://www.baidu.com/s?wd=${encodeURIComponent(cleanQuery)}`;
      return await runLocalWebSearchInTemporaryTab<[number], WebSearchResult[]>({
        provider: 'Baidu',
        searchUrl,
        active: false,
        extractor: extractLocalBaiduResults,
        args: [maxResults],
      });
    },
  };
}
