/**
 * 说明：`mcp-chat-tools.spec` 后台运行时模块。
 *
 * 职责：
 * - 固化 MCP chat tools 的 disabled/manual/auto 注入边界；
 * - 防止 auto router 失败时回退为全量列工具。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatStreamParams } from '../../lib/ai/types';
import type { McpServerConfig } from '../../types/mcp';

const {
  loadMcpSettingsConfigMock,
  loadMcpServersMock,
  reconcileSessionPoolMock,
  listToolsFromPoolMock,
  callToolFromPoolMock,
  routeMcpServersForChatMock,
} = vi.hoisted(() => ({
  loadMcpSettingsConfigMock: vi.fn(),
  loadMcpServersMock: vi.fn(),
  reconcileSessionPoolMock: vi.fn(),
  listToolsFromPoolMock: vi.fn(),
  callToolFromPoolMock: vi.fn(),
  routeMcpServersForChatMock: vi.fn(),
}));

vi.mock('../../lib/mcp/storage', () => ({
  appendMcpAudit: vi.fn(async () => undefined),
  loadMcpSettingsConfig: loadMcpSettingsConfigMock,
  loadMcpServers: loadMcpServersMock,
}));

vi.mock('../../lib/storage/storage-adapter', () => ({
  getStorageAdapter: () => ({ onChange: vi.fn() }),
}));

vi.mock('./mcp-session-pool', () => ({
  callToolFromPool: callToolFromPoolMock,
  listToolsFromPool: listToolsFromPoolMock,
  reconcileSessionPool: reconcileSessionPoolMock,
}));

vi.mock('./mcp-auto-router', () => ({
  routeMcpServersForChat: routeMcpServersForChatMock,
}));

/** 构造启用状态的远程 MCP server 配置。 */
function makeServer(id: string, name = id): McpServerConfig {
  return {
    id,
    name,
    enabled: true,
    type: 'streamable-http',
    url: `https://example.com/${id}`,
    headers: {},
    oauth: {
      enabled: false,
      registrationStrategy: 'dynamic',
      scopes: [],
      tokenEndpointAuthMethod: 'none',
    },
  };
}

/** 构造带指定 MCP 选择模型的聊天请求参数。 */
function makeParams(mcpSelection: ChatStreamParams['mcpSelection']): ChatStreamParams {
  return {
    model: 'provider/model',
    messages: [{ role: 'user', content: 'hello' }],
    temperature: 0.7,
    topP: 0.9,
    maxTokens: 256,
    topicKind: 'topic',
    mcpSelection,
  };
}

/** 重新加载模块并执行一次 MCP tool 收集，隔离模块级缓存。 */
async function collect(params: ChatStreamParams) {
  vi.resetModules();
  const mod = await import('./mcp-chat-tools');
  return mod.collectMcpToolsForChat({
    requestId: 'req-1',
    params,
    signal: new AbortController().signal,
  });
}

describe('collectMcpToolsForChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadMcpSettingsConfigMock.mockResolvedValue({ chatToolsEnabled: true });
    loadMcpServersMock.mockResolvedValue([makeServer('github', 'GitHub'), makeServer('snyk', 'Snyk')]);
    reconcileSessionPoolMock.mockResolvedValue(undefined);
    callToolFromPoolMock.mockResolvedValue({ isError: false, content: 'ok' });
    listToolsFromPoolMock.mockResolvedValue({ tools: [{ name: 'search', description: 'Search', inputSchema: { type: 'object' } }] });
    routeMcpServersForChatMock.mockResolvedValue({
      needsMcp: true,
      serverIds: ['github'],
      confidence: 0.9,
      intent: 'read',
      reason: 'needs github',
    });
  });

  it('does not list tools when MCP is disabled', async () => {
    const tools = await collect(makeParams({ mode: 'disabled', manualServerIds: [] }));

    expect(tools).toBeUndefined();
    expect(routeMcpServersForChatMock).not.toHaveBeenCalled();
    expect(listToolsFromPoolMock).not.toHaveBeenCalled();
  });

  it('manual mode only lists explicitly selected servers', async () => {
    const tools = await collect(makeParams({ mode: 'manual', manualServerIds: ['snyk'] }));

    expect(Object.keys(tools ?? {})).toEqual(['mcp__snyk__search']);
    expect(routeMcpServersForChatMock).not.toHaveBeenCalled();
    expect(listToolsFromPoolMock).toHaveBeenCalledTimes(1);
    expect(listToolsFromPoolMock).toHaveBeenCalledWith('snyk', { ttlMs: 60_000 });
  });

  it('auto mode only lists router-selected candidate servers', async () => {
    const params = makeParams({ mode: 'auto', manualServerIds: [] });
    const tools = await collect(params);

    expect(Object.keys(tools ?? {})).toEqual(['mcp__github__search']);
    expect(params.forcedFirstToolName).toBe('mcp__github__search');
    expect(params.mcpAutoRouterState).toMatchObject({
      evaluated: true,
      needsMcp: true,
      serverIds: ['github'],
      selectedServerIds: ['github'],
      injectedToolNames: ['mcp__github__search'],
      forcedFirstToolName: 'mcp__github__search',
    });
    expect(routeMcpServersForChatMock).toHaveBeenCalledTimes(1);
    expect(listToolsFromPoolMock).toHaveBeenCalledTimes(1);
    expect(listToolsFromPoolMock).toHaveBeenCalledWith('github', { ttlMs: 60_000 });
  });

  it('emits progress heartbeat while MCP tool listing is pending', async () => {
    vi.useFakeTimers();
    try {
      let resolveList!: (value: { tools: Array<{ name: string; description: string; inputSchema: { type: string } }> }) => void;
      listToolsFromPoolMock.mockReturnValueOnce(new Promise((resolve) => {
        resolveList = resolve;
      }));
      const params = makeParams({ mode: 'auto', manualServerIds: [] });
      vi.resetModules();
      const mod = await import('./mcp-chat-tools');
      const progress = vi.fn();
      const run = mod.collectMcpToolsForChat({
        requestId: 'req-1',
        params,
        signal: new AbortController().signal,
        emitProgress: progress,
      });

      await vi.waitFor(() => {
        expect(progress).toHaveBeenCalledWith({ type: 'chat/progress', stage: 'mcp-tool-listing' });
      });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(progress).toHaveBeenCalledTimes(2);

      resolveList({ tools: [{ name: 'search', description: 'Search', inputSchema: { type: 'object' } }] });
      await expect(run).resolves.toBeDefined();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(progress).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('emits progress heartbeat while an MCP tool call is pending', async () => {
    vi.useFakeTimers();
    try {
      let resolveTool!: (value: { isError: false; content: string }) => void;
      callToolFromPoolMock.mockReturnValueOnce(new Promise((resolve) => {
        resolveTool = resolve;
      }));
      const params = makeParams({ mode: 'auto', manualServerIds: [] });
      vi.resetModules();
      const mod = await import('./mcp-chat-tools');
      const progress = vi.fn();
      const tools = await mod.collectMcpToolsForChat({
        requestId: 'req-1',
        params,
        signal: new AbortController().signal,
        emitProgress: progress,
      });
      const execute = (tools?.mcp__github__search as unknown as {
        execute: (args: unknown, options: { abortSignal?: AbortSignal }) => Promise<unknown>;
      }).execute;
      const run = execute({}, { abortSignal: new AbortController().signal });

      expect(progress).toHaveBeenCalledWith({ type: 'chat/progress', stage: 'tool-execution' });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(progress).toHaveBeenCalledWith({ type: 'chat/progress', stage: 'tool-execution' });

      resolveTool({ isError: false, content: 'ok' });
      await expect(run).resolves.toBe('ok');
      const callsAfterResolve = progress.mock.calls.length;
      await vi.advanceTimersByTimeAsync(10_000);
      expect(progress).toHaveBeenCalledTimes(callsAfterResolve);
    } finally {
      vi.useRealTimers();
    }
  });

  it('auto mode does not fall back to all servers when router says no MCP', async () => {
    routeMcpServersForChatMock.mockResolvedValueOnce({
      needsMcp: false,
      serverIds: [],
      confidence: 1,
      intent: 'none',
      reason: 'greeting',
    });

    const tools = await collect(makeParams({ mode: 'auto', manualServerIds: [] }));

    expect(tools).toBeUndefined();
    expect(listToolsFromPoolMock).not.toHaveBeenCalled();
  });

  it('throws when auto router selected server but tool listing fails', async () => {
    listToolsFromPoolMock.mockRejectedValueOnce(new Error('network down'));

    await expect(collect(makeParams({ mode: 'auto', manualServerIds: [] }))).rejects.toMatchObject({
      i18n: {
        key: 'errors.mcpAutoRouterToolListFailed',
        params: { server: 'GitHub' },
      },
    });
    expect(listToolsFromPoolMock).toHaveBeenCalledWith('github', { ttlMs: 60_000 });
  });

  it('throws when auto router selected server but no tools are available', async () => {
    listToolsFromPoolMock.mockResolvedValueOnce({ tools: [] });

    await expect(collect(makeParams({ mode: 'auto', manualServerIds: [] }))).rejects.toMatchObject({
      i18n: { key: 'errors.mcpAutoRouterNoTools' },
    });
  });
});
