/**
 * 说明：`host-match-patterns` 联网搜索网络目标模块。
 *
 * 职责：
 * - 承载联网搜索 Provider 到网络目标 match pattern 的归一化；
 * - 对外暴露 `DEFAULT_EXA_MCP_ENDPOINT`、`getWebSearchNetworkHostMatchPatterns` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { WebSearchProviderId, WebSearchSettings } from './types';
import { I18nError } from '@/lib/i18n/error';
import type { HostMatchPattern } from '@/lib/extension/host-match-patterns';
import { toHostMatchPatternFromUrl } from '@/lib/extension/host-match-patterns';

/**
 * Web Search 网络目标推导。
 *
 * 背景（安装期访问模型）：
 * - 外部 Web Search 由 Service Worker 编排执行（非用户手势），不会在执行时弹出网页授权；
 * - 这里只提前展示对应域名。
 */

export const DEFAULT_EXA_MCP_ENDPOINT = 'https://mcp.exa.ai/mcp';

/**
 * 计算指定联网搜索 Provider 在当前设置下会访问的网络目标列表。
 *
 * 说明：
 * - 本地搜索 Provider 返回的是本地搜索脚本会访问的搜索引擎域名；
 * - 远程 API / 可配置端点则按真实请求 URL 推导 match pattern。
 */
export function getWebSearchNetworkHostMatchPatterns(
  providerId: WebSearchProviderId,
  settings: WebSearchSettings,
): HostMatchPattern[] {
  const pid = String(providerId || '').trim() as WebSearchProviderId;

  // 本地抽取：需要对对应搜索引擎域名执行脚本（scripting.executeScript）。
  if (pid === 'local-google') return ['https://www.google.com/*'];
  if (pid === 'local-bing') return ['https://www.bing.com/*'];
  if (pid === 'local-baidu') return ['https://www.baidu.com/*'];

  // 远程 API：固定域名。
  if (pid === 'tavily') return ['https://api.tavily.com/*'];
  if (pid === 'exa') return ['https://api.exa.ai/*'];
  if (pid === 'bocha') return ['https://api.bochaai.com/*'];
  if (pid === 'zhipu') return ['https://open.bigmodel.cn/*'];

  // 自托管 / 可配置端点：按 URL 推导。
  if (pid === 'searxng') {
    const base = typeof settings.searxngUrl === 'string' ? settings.searxngUrl.trim() : '';
    if (!base) return [];
    const pat = toHostMatchPatternFromUrl(base);
    if (!pat) throw new I18nError('errors.invalidUrl', { url: base });
    return [pat];
  }

  if (pid === 'exa-mcp') {
    const endpoint = (typeof settings.exaMcpUrl === 'string' ? settings.exaMcpUrl.trim() : '') || DEFAULT_EXA_MCP_ENDPOINT;
    const pat = toHostMatchPatternFromUrl(endpoint);
    if (!pat) throw new I18nError('errors.invalidUrl', { url: endpoint });
    return [pat];
  }

  return [];
}
