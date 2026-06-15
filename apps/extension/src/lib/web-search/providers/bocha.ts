/**
 * 说明：`bocha` 基础能力模块。
 *
 * 职责：
 * - 承载 `bocha` 相关的当前文件实现与模块边界；
 * - 对外暴露 `createBochaProvider` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { WebSearchProvider, WebSearchResult } from '../types';
import { I18nError } from '@/lib/i18n/error';

/**
 * 说明：Bocha AI 搜索 API——中文友好的 AI 搜索引擎。
 * 需要 API 密钥，访问 https://bochaai.com 注册获取。
 */
export function createBochaProvider(apiKey: string): WebSearchProvider {
  return {
    id: 'bocha',
    name: 'Bocha',
        /**
     * 内部方法：`search`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async search(query, options) {
      const maxResults = options?.maxResults ?? 5;
      const response = await fetch('https://api.bochaai.com/v1/web-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          query,
          count: maxResults,
          freshness: 'noLimit',
        }),
        signal: options?.signal,
      });

      if (!response.ok) {
        throw new I18nError('errors.webSearchProviderHttpError', { provider: 'Bocha', status: response.status });
      }

      const data = await response.json() as {
        data?: {
          webPages?: {
            value?: Array<{ name?: string; url?: string; snippet?: string }>;
          };
        };
      };

      return (data.data?.webPages?.value ?? []).map((r): WebSearchResult => ({
        title: r.name ?? '',
        url: r.url ?? '',
        snippet: r.snippet ?? '',
      }));
    },
  };
}
