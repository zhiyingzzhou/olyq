/**
 * 说明：`tavily` 基础能力模块。
 *
 * 职责：
 * - 承载 `tavily` 相关的当前文件实现与模块边界；
 * - 对外暴露 `createTavilyProvider` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { WebSearchProvider, WebSearchResult } from '../types';
import { I18nError } from '@/lib/i18n/error';

/**
 * Tavily Web Search Provider 实现。
 *
 * 说明：
 * - Tavily 以 POST JSON 方式调用；
 * - 当前仅返回 results 列表（不使用 answer 字段），并映射为统一的 WebSearchResult 结构；
 * - HTTP 非 2xx 时抛出 I18nError，交由上层统一展示错误信息。
 */

/** 创建 Tavily 搜索 Provider（需要 API Key）。 */
export function createTavilyProvider(apiKey: string): WebSearchProvider {
  return {
    id: 'tavily',
    name: 'Tavily',
        /**
     * 内部方法：`search`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async search(query, options) {
      const maxResults = options?.maxResults ?? 5;
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          max_results: maxResults,
          include_answer: false,
        }),
        signal: options?.signal,
      });

      if (!response.ok) {
        throw new I18nError('errors.webSearchProviderHttpError', { provider: 'Tavily', status: response.status });
      }

      const data = await response.json() as {
        results?: Array<{ title?: string; url?: string; content?: string }>;
      };

      return (data.results ?? []).map((r): WebSearchResult => ({
        title: r.title ?? '',
        url: r.url ?? '',
        snippet: r.content ?? '',
      }));
    },
  };
}
