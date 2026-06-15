/**
 * 说明：`exa-mcp` 基础能力模块。
 *
 * 职责：
 * - 承载 `exa-mcp` 相关的当前文件实现与模块边界；
 * - 对外暴露 `createExaMcpProvider` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { WebSearchProvider, WebSearchResult } from '../types';
import { I18nError } from '@/lib/i18n/error';

/**
 * 发往 Exa MCP 端点的最小 JSON-RPC 请求体。
 *
 * 当前 Provider 只调用 `tools/call`，并固定使用 `web_search_exa` 工具。
 */
type McpCallRequest = {
  /** JSON-RPC 协议版本。 */
  jsonrpc: '2.0';
  /** 当前请求 ID；本实现固定传递单数字以便简单关联。 */
  id: number;
  /** MCP 工具调用方法。 */
  method: 'tools/call';
  /** 目标工具与入参。 */
  params: {
    /** MCP 工具名称。 */
    name: string;
    /** 传给 MCP 工具的 arguments 对象。 */
    arguments: Record<string, unknown>;
  };
};

/**
 * Exa MCP 常见响应结构的最小子集。
 *
 * 这里只保留 Provider 实际会读取的 `result.content[].text` 字段，
 * 以便在 JSON 与 SSE 两类响应里统一提取文本结果。
 */
type McpCallResponse = {
  /** JSON-RPC 协议版本；脏响应下允许缺失。 */
  jsonrpc?: unknown;
  /** MCP 调用成功后的结果体。 */
  result?: {
    /** 文本/富内容数组；这里只读取首个文本块。 */
    content?: Array<{ type?: unknown; text?: unknown }>;
  };
};

const DEFAULT_ENDPOINT = 'https://mcp.exa.ai/mcp';
const DEFAULT_TIMEOUT_MS = 25_000;

/**
 * 从 MCP 响应里提取首个文本内容块。
 *
 * @param obj - 已解析的 JSON 对象。
 * @returns MCP `result.content` 中第一段文本；解析不到时返回空串。
 */
function firstTextFromMcpResponse(obj: unknown): string {
  const data = obj as McpCallResponse;
  const text = data?.result?.content?.find((c) => c && typeof c === 'object' && (c as { text?: unknown }).text)?.text;
  return typeof text === 'string' ? text : '';
}

/**
 * 从类 SSE 文本响应中提取 MCP 返回的文本内容。
 *
 * Exa 公共端点偶尔会返回 `text/event-stream` 风格的多行数据，
 * 这里逐行解析 `data:` 前缀并尝试恢复其中的 JSON-RPC 结果。
 *
 * @param raw - 原始响应文本。
 * @returns 提取到的首段文本；若未命中则返回空串。
 */
function parseSseLikeResponse(raw: string): string {
  // 兼容 text/event-stream：逐行找 data: {...}
  const lines = raw.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const payload = trimmed.replace(/^data:\s*/, '');
    try {
      const parsed = JSON.parse(payload) as unknown;
      const t = firstTextFromMcpResponse(parsed);
      if (t) return t;
    } catch {
      // 忽略：非 JSON 行（或脏数据）直接跳过
    }
  }
  return '';
}

/**
 * 将 Exa MCP 文本结果解析为标准搜索结果列表。
 *
 * 文本通常由多个空行分隔的区块组成，每个区块内含 `Title`、`URL`、`Text`
 * 等标签字段；这里会做去重、截断与空块过滤，供统一的联网搜索 UI 使用。
 *
 * @param text - MCP 返回的文本结果。
 * @param maxResults - 最多保留的结果数量。
 * @returns 规范化后的搜索结果数组。
 */
function parseLabeledBlocks(text: string, maxResults: number): WebSearchResult[] {
  if (!text.trim()) return [];

  // 说明：Exa MCP 返回的文本通常是多个块（空行分隔），每块含 Title/URL/Text 等标签。
  const blocks = text.split(/\n{2,}/g);
  const out: WebSearchResult[] = [];
  const seen = new Set<string>();

  for (const block of blocks) {
    if (out.length >= maxResults) break;
    const title = block.match(/^Title:\s*(.+)$/m)?.[1]?.trim() ?? '';
    const url = block.match(/^URL:\s*(.+)$/m)?.[1]?.trim() ?? '';
    const textStart = block.match(/^Text:\s*([\s\S]*)$/m)?.[1]?.trim() ?? '';
    const snippet = textStart.replace(/\s+/g, ' ').slice(0, 320);

    const key = url || `${title}:${snippet.slice(0, 60)}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);

    if (!title && !url && !snippet) continue;
    out.push({ title, url, snippet });
  }

  return out;
}

/**
 * 说明：Exa MCP Provider（免费公共端点）
 * - 通过 MCP JSON-RPC 调用 Exa 的 web_search_exa 工具
 * - 尽力而为地解析 SSE / JSON 响应，提取标题/链接/摘要
 */
export function createExaMcpProvider(endpointOverride?: string): WebSearchProvider {
  const endpoint = String(endpointOverride || '').trim() || DEFAULT_ENDPOINT;

  return {
    id: 'exa-mcp',
    name: 'ExaMCP',
    /**
     * 通过 Exa MCP 执行联网搜索。
     *
     * @param query - 搜索关键字。
     * @param options - 搜索选项，主要包含结果数与外部中断信号。
     * @returns 标准化后的搜索结果列表。
     */
    async search(query, options) {
      const maxResults = options?.maxResults ?? 5;
      const q = String(query || '').trim();
      if (!q) return [];

      const req: McpCallRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'web_search_exa',
          arguments: {
            query: q,
            type: 'auto',
            numResults: Math.max(1, Math.min(20, maxResults)),
            livecrawl: 'fallback',
          },
        },
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
      let cleanupAbortListener: (() => void) | undefined;
      const abortSignal = options?.signal;
      if (abortSignal) {
        if (abortSignal.aborted) {
          controller.abort();
        } else {
          // 将调用方的中断信号桥接到内部超时控制器，保证 UI 取消可立即终止请求。
          /**
           * 将外层取消信号桥接到内部请求控制器。
           *
           * 说明：
           * - 这样 UI 停止生成时，当前 Exa MCP HTTP 请求也会立即中断；
           * - 避免外层已取消但底层 fetch 仍继续占用网络和超时资源。
           */
          const onAbort = () => controller.abort();
          abortSignal.addEventListener('abort', onAbort, { once: true });
          cleanupAbortListener = () => abortSignal.removeEventListener('abort', onAbort);
        }
      }

      try {
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: {
            accept: 'application/json, text/event-stream',
            'content-type': 'application/json',
          },
          body: JSON.stringify(req),
          signal: controller.signal,
        });

        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          const detail = String(text || '').trim().slice(0, 500);
          throw detail
            ? new I18nError('errors.webSearchProviderHttpErrorWithDetail', { provider: 'Exa MCP', status: resp.status, detail })
            : new I18nError('errors.webSearchProviderHttpError', { provider: 'Exa MCP', status: resp.status });
        }

        const raw = await resp.text();
        let extracted = '';

        // 1) 先尝试直接 JSON
        try {
          extracted = firstTextFromMcpResponse(JSON.parse(raw) as unknown);
        } catch {
          // 忽略：非标准响应则继续走 SSE/文本兜底解析
        }

        // 2) 退化：SSE 行
        if (!extracted) extracted = parseSseLikeResponse(raw);

        return parseLabeledBlocks(extracted || raw, maxResults);
      } finally {
        clearTimeout(timeoutId);
        cleanupAbortListener?.();
      }
    },
  };
}
