/**
 * 说明：`exa` 基础能力模块。
 *
 * 职责：
 * - 承载 `exa` 相关的当前文件实现与模块边界；
 * - 对外暴露 `createExaProvider` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { WebSearchProvider, WebSearchResult } from '../types';
import { I18nError } from '@/lib/i18n/error';

/**
 * 说明：Exa AI 搜索 API——专为 AI 设计的语义搜索引擎。
 * 需要 API 密钥，访问 https://exa.ai 注册获取。
 */
export function createExaProvider(apiKey: string): WebSearchProvider {
  return {
    id: 'exa',
    name: 'Exa',
        /**
     * 内部方法：`search`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async search(query, options) {
      const maxResults = options?.maxResults ?? 5;
      const response = await fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          query,
          num_results: maxResults,
          use_autoprompt: true,
          contents: { text: { max_characters: 1000 } },
        }),
        signal: options?.signal,
      });

      if (!response.ok) {
        throw new I18nError('errors.webSearchProviderHttpError', { provider: 'Exa', status: response.status });
      }

      const data = await response.json() as {
        results?: Array<{ title?: string; url?: string; text?: string; highlights?: string[] }>;
      };

      return (data.results ?? []).map((r): WebSearchResult => ({
        title: r.title ?? '',
        url: r.url ?? '',
        snippet: r.highlights?.join(' ') ?? r.text?.slice(0, 300) ?? '',
      }));
    },
  };
}
