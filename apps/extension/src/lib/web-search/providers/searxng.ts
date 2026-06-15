/**
 * 说明：`searxng` 基础能力模块。
 *
 * 职责：
 * - 承载 `searxng` 相关的当前文件实现与模块边界；
 * - 对外暴露 `createSearXNGProvider` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { WebSearchProvider, WebSearchResult } from '../types';
import { I18nError } from '@/lib/i18n/error';

/**
 * 说明：SearXNG 自托管搜索引擎。
 * 无需 API 密钥，但需要自己部署 SearXNG 实例并填入 URL。
 * 官方文档：https://docs.searxng.org
 */
export function createSearXNGProvider(baseUrl: string): WebSearchProvider {
  return {
    id: 'searxng',
    name: 'SearXNG',
        /**
     * 内部方法：`search`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async search(query, options) {
      const maxResults = options?.maxResults ?? 5;
      // 去除末尾斜杠，统一格式
      const url = baseUrl.replace(/\/$/, '');
      const params = new URLSearchParams({
        q: query,
        format: 'json',
        categories: 'general',
      });

      const response = await fetch(`${url}/search?${params.toString()}`, {
        headers: { Accept: 'application/json' },
        signal: options?.signal,
      });

      if (!response.ok) {
        throw new I18nError('errors.webSearchProviderHttpError', { provider: 'SearXNG', status: response.status });
      }

      const data = await response.json() as {
        results?: Array<{ title?: string; url?: string; content?: string }>;
      };

      return (data.results ?? []).slice(0, maxResults).map((r): WebSearchResult => ({
        title: r.title ?? '',
        url: r.url ?? '',
        snippet: r.content ?? '',
      }));
    },
  };
}
