/**
 * 说明：`types` 基础能力模块。
 *
 * 职责：
 * - 承载 `types` 相关的当前文件实现与模块边界；
 * - 对外暴露 `WebSearchResult`、`WebSearchProvider`、`WebSearchOptions` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/** 单条网页搜索结果 */
export interface WebSearchResult {
  /** 标题 */
  title: string;
  /** 结果 URL */
  url: string;
  /** 摘要/片段 */
  snippet: string;
}

/** 网页搜索 Provider：统一不同搜索后端的接口 */
export interface WebSearchProvider {
  /** Provider ID（用于设置存储与路由） */
  id: string;
  /** UI 展示名 */
  name: string;
  /**
   * 执行一次搜索请求。
   *
   * @param query - 用户或系统生成的最终查询词
   * @param options - 可选搜索控制项，例如最大返回数和取消信号
   * @returns 标准化后的搜索结果列表
   */
  search(query: string, options?: WebSearchOptions): Promise<WebSearchResult[]>;
}

/** 网页搜索入参（可选项） */
export interface WebSearchOptions {
  /** 可选：最大返回条数（不传则由 provider 决定默认值） */
  maxResults?: number;
  /** 可选：取消信号（用户停止生成时中断搜索请求） */
  signal?: AbortSignal;
}

/** 支持的 Provider ID */
export type WebSearchProviderId =
  | 'local-google'
  | 'local-bing'
  | 'local-baidu'
  | 'tavily'
  | 'searxng'
  | 'exa'
  | 'exa-mcp'
  | 'bocha'
  | 'zhipu';

/** 网页搜索设置（由设置面板持久化） */
export interface WebSearchSettings {
  /**
   * 当前选中的 providerId（仅用于设置面板的“编辑对象”选择，非对话启用开关）。
   *
   * 说明：
   * - 按当前实现：对话是否启用联网搜索由 Assistant 上的 `webSearchProviderId` / `enableWebSearch` 决定
   * - 该字段只决定“设置面板当前在编辑哪个 provider 的配置”，以及默认展示项
   */
  providerId: WebSearchProviderId | string;
  /** Tavily API 密钥 */
  tavilyApiKey?: string;
  /** Exa API 密钥 */
  exaApiKey?: string;
  /** Exa MCP 端点（可选；为空则使用默认公共端点） */
  exaMcpUrl?: string;
  /** Bocha API 密钥 */
  bochaApiKey?: string;
  /** Zhipu API 密钥 */
  zhipuApiKey?: string;
  /** SearXNG 实例地址（自托管） */
  searxngUrl?: string;
  /** 最大返回条数（UI 侧限制） */
  maxResults: number;
  /** 是否在查询中追加当前日期（偏向时效性结果） */
  searchWithTime?: boolean;
  /** 域名黑名单：过滤包含这些域名的搜索结果 */
  excludeDomains?: string[];
}

/**
 * 导出常量：`DEFAULT_WEB_SEARCH_SETTINGS`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const DEFAULT_WEB_SEARCH_SETTINGS: WebSearchSettings = {
  providerId: 'exa-mcp',
  maxResults: 5,
  searchWithTime: true,
  excludeDomains: [],
};
