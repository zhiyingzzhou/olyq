/**
 * 说明：`use-mcp-servers-resource.spec` 基础能力模块。
 *
 * 职责：
 * - 承载 `use-mcp-servers-resource.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpServerConfig } from '@/types/mcp';
import { useMcpServersResource } from './use-mcp-servers-resource';

const { loadMcpServersResult } = vi.hoisted(() => ({
  loadMcpServersResult: vi.fn(),
}));

vi.mock('@/lib/mcp/storage', () => ({
  loadMcpServersResult,
}));

/**
 * 测试辅助函数：`deferred`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/**
 * 测试辅助函数：`makeServer`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function makeServer(id: string): McpServerConfig {
  return {
    id,
    name: id,
    enabled: true,
    type: 'streamable-http',
    url: `https://${id}.example/mcp`,
    headers: {},
    oauth: {
      enabled: false,
      registrationStrategy: 'dynamic',
      scopes: [],
      tokenEndpointAuthMethod: 'none',
    },
  };
}

describe('useMcpServersResource', () => {
  beforeEach(() => {
    loadMcpServersResult.mockReset();
  });

  it('ignores stale reload results when a newer request finishes first', async () => {
    const first = deferred<{ ok: true; data: McpServerConfig[] }>();
    const second = deferred<{ ok: true; data: McpServerConfig[] }>();

    loadMcpServersResult
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const { result } = renderHook(() => useMcpServersResource(false));

    await act(async () => {
      void result.current.reload();
      void result.current.reload();
    });

    await act(async () => {
      second.resolve({ ok: true, data: [makeServer('new')] });
      await second.promise;
    });

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
      expect(result.current.data).toEqual([makeServer('new')]);
    });

    await act(async () => {
      first.resolve({ ok: true, data: [makeServer('old')] });
      await first.promise;
    });

    expect(result.current.status).toBe('ready');
    expect(result.current.data).toEqual([makeServer('new')]);
  });
});
