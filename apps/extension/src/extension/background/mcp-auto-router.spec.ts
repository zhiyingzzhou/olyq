/**
 * 说明：`mcp-auto-router.spec` 后台运行时模块。
 *
 * 职责：
 * - 固化 MCP 自动路由在普通聊天、候选 server、无匹配和失败场景下的安全行为；
 * - 防止自动模式重新退化成“全量注入全部 MCP”。
 */
import { describe, expect, it, vi } from 'vitest';

import {
  normalizeMcpRouterDecision,
  routeMcpServersForChat,
  summarizeMcpServersForRouter,
} from './mcp-auto-router';
import type { ChatStreamParams } from '../../lib/ai/types';
import type { McpServerConfig } from '../../types/mcp';

/** 构造最小聊天参数，便于不同路由意图复用。 */
function makeParams(content = 'hello'): ChatStreamParams {
  return {
    model: 'provider/model',
    messages: [{ role: 'user', content }],
    temperature: 0.7,
    topP: 0.9,
    maxTokens: 256,
    topicKind: 'topic',
  };
}

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

describe('mcp auto router', () => {
  it('summarizes servers without leaking headers or oauth secrets', () => {
    const summary = summarizeMcpServersForRouter([{
      ...makeServer('github', 'GitHub'),
      headers: { Authorization: 'secret' },
      oauth: {
        enabled: true,
        registrationStrategy: 'preregistered',
        scopes: ['repo'],
        preregClientSecret: 'secret',
        tokenEndpointAuthMethod: 'client_secret_post',
      },
    }]);

    expect(summary).toEqual([{ id: 'github', name: 'GitHub', url: 'https://example.com/github' }]);
  });

  it('normalizes ordinary chat to no MCP', () => {
    expect(normalizeMcpRouterDecision({
      needsMcp: false,
      serverIds: [],
      confidence: 0.99,
      intent: 'none',
      reason: 'greeting',
    }, new Set(['github']))).toEqual({
      needsMcp: false,
      serverIds: [],
      confidence: 1,
      intent: 'none',
      reason: 'greeting',
    });
  });

  it('keeps only enabled candidate servers for external queries', () => {
    expect(normalizeMcpRouterDecision({
      needsMcp: true,
      serverIds: ['github', 'unknown', 'github'],
      confidence: 0.91,
      intent: 'read',
      reason: 'PR status needs GitHub',
    }, new Set(['github']))).toEqual({
      needsMcp: true,
      serverIds: ['github'],
      confidence: 0.91,
      intent: 'read',
      reason: 'PR status needs GitHub',
    });
  });

  it('accepts single server field from real-world router output', () => {
    expect(normalizeMcpRouterDecision({
      needsMcp: true,
      server: 'amap-maps-streamableHTTP',
      confidence: 0.9,
      intent: 'read',
      reason: 'coordinate lookup needs map MCP',
    }, new Set(['amap-maps-streamableHTTP']))).toEqual({
      needsMcp: true,
      serverIds: ['amap-maps-streamableHTTP'],
      confidence: 0.9,
      intent: 'read',
      reason: 'coordinate lookup needs map MCP',
    });
  });

  it('accepts router output without confidence and intent when serverIds match', () => {
    expect(normalizeMcpRouterDecision({
      needsMcp: true,
      serverIds: ['ceca9edd-d388-490a-a2d6-eef1491f78b8'],
      reason: '用户提供了具体地点名称“上海国华金融中心”，是在请求地图位置/坐标查询，且已启用地图类 MCP server。',
    }, new Set(['ceca9edd-d388-490a-a2d6-eef1491f78b8']))).toEqual({
      needsMcp: true,
      serverIds: ['ceca9edd-d388-490a-a2d6-eef1491f78b8'],
      confidence: 0.8,
      intent: 'unknown',
      reason: '用户提供了具体地点名称“上海国华金融中心”，是在请求地图位置/坐标查询，且已启用地图类 MCP server。',
    });
  });

  it('returns no MCP when no enabled server matches', () => {
    expect(normalizeMcpRouterDecision({
      needsMcp: true,
      serverIds: ['jira'],
      confidence: 0.9,
      intent: 'read',
      reason: 'Jira requested',
    }, new Set(['github']))).toMatchObject({
      needsMcp: false,
      serverIds: [],
      reason: 'router-no-enabled-server-match',
    });
  });

  it('falls back to no MCP on router timeout or model failure', async () => {
    const decision = await routeMcpServersForChat({
      requestId: 'req-1',
      params: makeParams('查一下 GitHub PR 状态'),
      enabledServers: [makeServer('github')],
      signal: new AbortController().signal,
      timeoutMs: 10,
      resolveContext: vi.fn(async () => ({}) as never),
      buildPlan: vi.fn(async () => ({ languageModel: {}, callSettings: {} }) as never),
      generateText: vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { output: { needsMcp: true, serverIds: ['github'], confidence: 1, intent: 'read', reason: '' } } as never;
      }),
    });

    expect(decision).toMatchObject({
      needsMcp: false,
      serverIds: [],
      reason: 'router-failed',
    });
  });

  it('returns routed candidates from structured model output', async () => {
    const generateText = vi.fn(async () => ({
      output: {
        needsMcp: true,
        serverIds: ['github'],
        confidence: 0.92,
        intent: 'read',
        reason: 'needs GitHub PR state',
      },
    }) as never);
    const buildPlan = vi.fn(async () => ({
      languageModel: {},
      callSettings: { maxOutputTokens: 128 },
    }) as never);
    const decision = await routeMcpServersForChat({
      requestId: 'req-1',
      params: makeParams('查一下 GitHub PR 状态'),
      enabledServers: [makeServer('github'), makeServer('snyk')],
      signal: new AbortController().signal,
      resolveContext: vi.fn(async () => ({}) as never),
      buildPlan,
      generateText,
    });

    expect(decision).toEqual({
      needsMcp: true,
      serverIds: ['github'],
      confidence: 0.92,
      intent: 'read',
      reason: 'needs GitHub PR state',
    });
    expect(buildPlan).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      temperature: 0,
      maxTokens: 128,
    }))
    expect(generateText).toHaveBeenCalledWith(expect.not.objectContaining({
      temperature: 0,
    }))
    expect(generateText).toHaveBeenCalledWith(expect.objectContaining({
      maxOutputTokens: 128,
    }))
  });
});
