/**
 * 说明：`search-service` 基础能力模块。
 *
 * 职责：
 * - 承载 `search-service` 相关的当前文件实现与模块边界；
 * - 对外暴露 `executeWebSearch`、`formatSearchResultsForPrompt` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { WebSearchProvider, WebSearchProviderId, WebSearchResult, WebSearchSettings } from './types';
import { createLocalGoogleProvider } from './providers/local-google';
import { createLocalBingProvider } from './providers/local-bing';
import { createLocalBaiduProvider } from './providers/local-baidu';
import { createTavilyProvider } from './providers/tavily';
import { createSearXNGProvider } from './providers/searxng';
import { createExaProvider } from './providers/exa';
import { createExaMcpProvider } from './providers/exa-mcp';
import { createBochaProvider } from './providers/bocha';
import { createZhipuProvider } from './providers/zhipu';
import { I18nError } from '@/lib/i18n/error';
import { getWebSearchNetworkHostMatchPatterns } from './host-match-patterns';

/**
 * 根据设置创建搜索 provider 实例。
 *
 * 说明：
 * - 这里同时承担“按 providerId 路由”和“校验最小必要配置”两项职责；
 * - 缺少 API key / URL 时直接抛出可国际化错误，由上游统一处理。
 */
function getProvider(settings: WebSearchSettings): WebSearchProvider {
  switch (settings.providerId) {
    case 'tavily':
      if (!settings.tavilyApiKey) throw new I18nError('errors.webSearchTavilyApiKeyRequired');
      return createTavilyProvider(settings.tavilyApiKey);
    case 'exa':
      if (!settings.exaApiKey) throw new I18nError('errors.webSearchExaApiKeyRequired');
      return createExaProvider(settings.exaApiKey);
    case 'exa-mcp':
      return createExaMcpProvider(settings.exaMcpUrl);
    case 'bocha':
      if (!settings.bochaApiKey) throw new I18nError('errors.webSearchBochaApiKeyRequired');
      return createBochaProvider(settings.bochaApiKey);
    case 'zhipu':
      if (!settings.zhipuApiKey) throw new I18nError('errors.webSearchZhipuApiKeyRequired');
      return createZhipuProvider(settings.zhipuApiKey);
    case 'searxng':
      if (!settings.searxngUrl) throw new I18nError('errors.webSearchSearxngUrlRequired');
      return createSearXNGProvider(settings.searxngUrl);
    case 'local-bing':
      return createLocalBingProvider();
    case 'local-baidu':
      return createLocalBaiduProvider();
    case 'local-google':
    default:
      return createLocalGoogleProvider();
  }
}

/**
 * 执行一次联网搜索，并返回原始结果列表。
 *
 * 新增逻辑：
 * - `searchWithTime`：在查询中追加当前日期前缀（偏向时效性结果）
 * - `excludeDomains`：过滤结果中命中黑名单域名的条目
 */
export async function executeWebSearch(
  query: string,
  settings: WebSearchSettings,
  signal?: AbortSignal,
): Promise<WebSearchResult[]> {
  const q = String(query || '').trim();
  if (!q) return [];

  // 功能 searchWithTime：在查询前追加今天的日期，引导搜索引擎偏向最新内容
  // 格式约定：日期前缀 + '\r\n' + 原始查询，本地 provider 会从中剥离日期部分再构建 URL
  const effectiveQuery = settings.searchWithTime
    ? `today is ${new Date().toISOString().slice(0, 10)}\r\n${q}`
    : q;

  // 安装期 host access 已覆盖普通 http/https；这里仅让 provider 配置校验保持在真实请求之前。
  const pid = String(settings.providerId || '').trim() as WebSearchProviderId;
  const patterns = getWebSearchNetworkHostMatchPatterns(pid, settings);
  if (patterns.length > 0) {
    void patterns;
  }

  // Provider 创建放在 URL 配置校验之后，避免明显无效的端点继续初始化 provider。
  const provider = getProvider(settings);
  const results = await provider.search(effectiveQuery, { maxResults: settings.maxResults, signal });

  // 域名黑名单过滤
  const excludes = Array.isArray(settings.excludeDomains)
    ? settings.excludeDomains.map(d => String(d || '').trim().toLowerCase()).filter(Boolean)
    : [];

  if (excludes.length === 0) return results;

  return results.filter((r) => {
    try {
      const hostname = new URL(r.url).hostname.replace(/^www\./, '').toLowerCase();
      return !excludes.some((ex) => hostname === ex || hostname.endsWith(`.${ex}`));
    } catch {
      return true; // URL 解析失败则保留，避免误伤 provider 返回的非常规链接。
    }
  });
}

/**
 * 将搜索结果格式化为可注入 system prompt 的上下文文本。
 *
 * 说明：
 * - 该函数主要服务于“直接把结果塞进提示词”的场景；
 * - 若调用方采用更结构化的引用方式，可绕过此函数自行组装上下文。
 */
export function formatSearchResultsForPrompt(results: WebSearchResult[]): string {
  if (results.length === 0) return '';

  const items = results.map((r, i) =>
    `[${i + 1}] ${r.title}\n    URL: ${r.url}\n    ${r.snippet}`
  ).join('\n\n');

  return `以下是与用户问题相关的网络搜索结果，请参考这些信息来回答（如果适用）：\n\n${items}\n\n请根据以上搜索结果和你的知识综合回答用户的问题。如果引用了搜索结果，请注明来源。`;
}
