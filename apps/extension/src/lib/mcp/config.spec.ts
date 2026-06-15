/**
 * 说明：`config.spec` 基础能力模块。
 *
 * 职责：
 * - 承载 `config.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { describe, expect, it } from 'vitest';

import {
  normalizeMcpServerDraft,
  normalizeLooseMcpServerDraft,
  parseSingleLooseMcpServerDraft,
  parseSingleMcpServerConfig,
  stringifySingleMcpServerConfig,
} from './config';

describe('mcp config normalizer', () => {
  it('严格解析标准 mcpServers 配置时，必须显式提供 streamable-http type', () => {
    const parsed = parseSingleMcpServerConfig({
      mcpServers: {
        exa: {
          type: 'streamable-http',
          headers: { Authorization: 'Bearer token' },
          url: 'https://example.com/mcp',
        },
      },
    });

    expect(parsed.alias).toBe('exa');
    expect(parsed.server).toEqual({
      name: 'exa',
      type: 'streamable-http',
      url: 'https://example.com/mcp',
      headers: { Authorization: 'Bearer token' },
      oauth: {
        enabled: false,
        registrationStrategy: 'dynamic',
        scopes: [],
        tokenEndpointAuthMethod: 'none',
      },
    });
  });

  it('严格草稿规范化仍要求显式 type', () => {
    expect(() =>
      normalizeMcpServerDraft({
        name: 'legacy',
        url: 'https://example.com/events',
        headers: {},
      }),
    ).toThrowError();
  });

  it('严格保存层不再接受 transport/type http 别名或 URL 自动推断', () => {
    expect(() =>
      parseSingleMcpServerConfig({
        mcpServers: {
          remote: {
            transport: 'http',
            type: 'streamable-http',
            url: 'https://example.com/mcp',
          },
        },
      }),
    ).toThrowError();

    expect(() =>
      parseSingleMcpServerConfig({
        mcpServers: {
          remote: {
            type: 'http',
            url: 'https://example.com/mcp',
          },
        },
      }),
    ).toThrowError();

    expect(() =>
      parseSingleMcpServerConfig({
        mcpServers: {
          remote: {
            url: 'https://example.com/mcp',
          },
        },
      }),
    ).toThrowError();
  });

  it('旧字段 baseUrl 不再被接受', () => {
    expect(() =>
      parseSingleMcpServerConfig({
        mcpServers: {
          exa: {
            type: 'streamable-http',
            baseUrl: 'https://example.com/mcp',
            headers: { Authorization: 'Bearer token' },
          },
        },
      }),
    ).toThrowError();
  });

  it('旧版 stdio 共享配置不再被接受', () => {
    expect(() =>
      parseSingleMcpServerConfig({
        mcpServers: {
          filesystem: {
            command: 'npx',
            args: ['@modelcontextprotocol/server-filesystem', '/tmp'],
          },
        },
      }),
    ).toThrowError();
  });

  it('宽松草稿解析允许当前弹窗把未填完的 remote-only JSON 回填到表单', () => {
    const parsed = parseSingleLooseMcpServerDraft({
      mcpServers: {
        draft: {
          headers: { Authorization: 'Bearer token' },
        },
      },
    });

    expect(parsed).toEqual({
      alias: 'draft',
      server: {
        name: 'draft',
        type: 'streamable-http',
        url: '',
        headers: { Authorization: 'Bearer token' },
        oauth: {
          enabled: false,
          registrationStrategy: 'dynamic',
          scopes: [],
          tokenEndpointAuthMethod: 'none',
        },
      },
    });
  });

  it('宽松草稿解析也不会接受 stdio 或其他旧 transport 字段', () => {
    expect(() =>
      normalizeLooseMcpServerDraft({
        name: 'filesystem',
        command: 'npx',
      }),
    ).toThrowError();
  });

  it('serializes to the standard mcpServers wrapper', () => {
    const raw = stringifySingleMcpServerConfig({
      name: 'filesystem',
      type: 'streamable-http',
      url: 'https://example.com/mcp',
      headers: { Authorization: 'Bearer token' },
      oauth: {
        enabled: true,
        registrationStrategy: 'dynamic',
        scopes: ['tools.read'],
        tokenEndpointAuthMethod: 'none',
      },
    });

    expect(JSON.parse(raw)).toEqual({
      mcpServers: {
        filesystem: {
          type: 'streamable-http',
          url: 'https://example.com/mcp',
          headers: { Authorization: 'Bearer token' },
          oauth: {
            enabled: true,
            registrationStrategy: 'dynamic',
            scopes: ['tools.read'],
            tokenEndpointAuthMethod: 'none',
          },
        },
      },
    });
  });
});
