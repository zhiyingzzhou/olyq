/**
 * 说明：`zhipu` 基础能力模块。
 *
 * 职责：
 * - 承载 `zhipu` 相关的当前文件实现与模块边界；
 * - 对外暴露 `createZhipuProvider` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { WebSearchProvider, WebSearchResult } from '../types';
import { I18nError } from '@/lib/i18n/error';

/**
 * 智谱 AI 联网搜索 API（web_search 工具）。
 * 需要 API 密钥，访问 https://bigmodel.cn 注册获取。
 */
export function createZhipuProvider(apiKey: string): WebSearchProvider {
  return {
    id: 'zhipu',
    name: '智谱 AI',
        /**
     * 内部方法：`search`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async search(query, options) {
      const response = await fetch('https://open.bigmodel.cn/api/paas/v4/web_search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ query }),
        signal: options?.signal,
      });

      if (!response.ok) {
        throw new I18nError('errors.webSearchProviderHttpError', { provider: 'Zhipu', status: response.status });
      }

      const data = await response.json() as {
        search_result?: Array<{ title?: string; link?: string; content?: string; media?: string }>;
      };

      const maxResults = options?.maxResults ?? 5;
      return (data.search_result ?? []).slice(0, maxResults).map((r): WebSearchResult => ({
        title: r.title ?? '',
        url: r.link ?? '',
        snippet: r.content ?? '',
      }));
    },
  };
}
