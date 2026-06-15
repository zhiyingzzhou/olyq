/**
 * 说明：`use-mcp-servers-resource` 基础能力模块。
 *
 * 职责：
 * - 承载 `use-mcp-servers-resource` 相关的当前文件实现与模块边界；
 * - 对外暴露 `McpServersResource`、`useMcpServersResource` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { McpServerConfig } from '@/types/mcp';
import { loadMcpServersResult } from '@/lib/mcp/storage';

/** MCP 服务器资源加载状态。 */
export type McpServersResource =
  | {
      /** 当前仍在加载。 */
      status: 'loading';
      /** 最近一次可用数据；首次加载前为空数组。 */
      data: McpServerConfig[];
      /** loading 态没有结构化错误。 */
      error: null;
      /** 已启用的服务器子集。 */
      enabledServers: McpServerConfig[];
      /** 主动重新加载服务器列表。 */
      reload: () => Promise<void>;
    }
  | {
      /** 当前已成功就绪。 */
      status: 'ready';
      data: McpServerConfig[];
      error: null;
      enabledServers: McpServerConfig[];
      reload: () => Promise<void>;
    }
  | {
      /** 当前加载失败。 */
      status: 'error';
      /** 失败时仍保留最近一次数据快照。 */
      data: McpServerConfig[];
      /** 本次加载错误。 */
      error: Error;
      enabledServers: McpServerConfig[];
      reload: () => Promise<void>;
    };

/**
 * 读取 MCP 服务器配置的资源型 hook。
 *
 * 会处理加载、失败和主动 reload，并自动派生启用中的服务器列表。
 */
export function useMcpServersResource(enabled = true): McpServersResource {
  /** 当前资源状态。 */
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(enabled ? 'loading' : 'ready');
  /** 当前服务器数据快照。 */
  const [data, setData] = useState<McpServerConfig[]>([]);
  /** 当前资源错误。 */
  const [error, setError] = useState<Error | null>(null);
  /** 请求版本号，用于丢弃过期请求结果。 */
  const requestVersionRef = useRef(0);

  /** 主动重新加载服务器列表。 */
  const reload = useCallback(async () => {
    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    setStatus('loading');
    setError(null);
    const result = await loadMcpServersResult();
    if (requestVersionRef.current !== requestVersion) return;
    if (!result.ok) {
      setData([]);
      setError(result.error);
      setStatus('error');
      return;
    }
    setData(result.data);
    setError(null);
    setStatus('ready');
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void reload();
  }, [enabled, reload]);

  const enabledServers = useMemo(() => data.filter((server) => server.enabled), [data]);

  if (status === 'error') {
    return {
      status: 'error',
      data,
      error: error ?? new Error('Unknown MCP storage error'),
      enabledServers,
      reload,
    };
  }

  if (status === 'loading') {
    return {
      status: 'loading',
      data,
      error: null,
      enabledServers,
      reload,
    };
  }

  return {
    status: 'ready',
    data,
    error: null,
    enabledServers,
    reload,
  };
}
