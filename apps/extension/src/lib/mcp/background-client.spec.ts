/**
 * 说明：`background-client.spec` 基础能力模块。
 *
 * 职责：
 * - 承载 `background-client.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  sendMessageMock,
} = vi.hoisted(() => ({
  sendMessageMock: vi.fn(),
}));

describe('background-client', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete (globalThis as { chrome?: typeof chrome }).chrome;
  });

  it('在非扩展页面中应直接拒绝访问 Service Worker MCP 通道', async () => {
    const client = await import('./background-client');

    await expect(client.getSharedMcpServerStates()).rejects.toMatchObject({ reason: 'runtime-unavailable' });
    await expect(client.connectSharedMcpServer('srv-1')).rejects.toMatchObject({ reason: 'runtime-unavailable' });
    await expect(client.listSharedMcpServerTools('srv-1')).rejects.toMatchObject({ reason: 'runtime-unavailable' });
    await expect(client.callSharedMcpTool('srv-1', 'fetch', { url: 'https://example.com' })).rejects.toMatchObject({ reason: 'runtime-unavailable' });
    await expect(client.disconnectSharedMcpServer('srv-1')).rejects.toMatchObject({ reason: 'runtime-unavailable' });
  });

  it('在扩展环境中继续走 Service Worker 消息通道', async () => {
    sendMessageMock.mockImplementation((message: unknown, callback: (response: unknown) => void) => {
      callback({
        ok: true,
        payload: {
          meta: {
            protocolVersion: '2025-11-25',
            serverName: 'bridge-server',
            serverVersion: '2.0.0',
          },
          tools: [{ name: 'fetch', description: 'remote tool' }],
        },
      });
      return undefined;
    });

    (globalThis as { chrome?: typeof chrome }).chrome = {
      runtime: {
        sendMessage: sendMessageMock as unknown as typeof chrome.runtime.sendMessage,
        lastError: undefined,
      },
    } as typeof chrome;

    const client = await import('./background-client');
    const result = await client.connectSharedMcpServer('srv-1');

    expect(sendMessageMock).toHaveBeenCalledWith(
      {
        type: 'mcp/server/connect',
        payload: { serverId: 'srv-1' },
      },
      expect.any(Function),
    );
    expect(result).toEqual({
      meta: {
        protocolVersion: '2025-11-25',
        serverName: 'bridge-server',
        serverVersion: '2.0.0',
      },
      tools: [{ name: 'fetch', description: 'remote tool' }],
    });
  });
});
