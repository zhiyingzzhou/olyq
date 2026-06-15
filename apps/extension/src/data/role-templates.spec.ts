/**
 * 说明：`role-templates.spec` 静态数据模块。
 *
 * 职责：
 * - 承载 `role-templates.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildBuiltinDefaultAssistantPreset,
  loadAssistantPresetCatalog,
  loadAssistantPresets,
  resetAssistantPresetLoaderCacheForTests,
} from './role-templates';

const fetchMock = vi.fn();

describe('assistant presets loader', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('chrome', {
      runtime: {
        getURL: (path: string) => `chrome-extension://test/${path}`,
      },
    });
    resetAssistantPresetLoaderCacheForTests();
  });

  it('会按语言同时加载浏览器分区与通用分区文件', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('assistant-presets.browser.zh-CN.json')) {
        return {
          ok: true,
          json: async () => ([
            {
              id: 'browser-briefing',
              name: '网页解读',
              description: '浏览器核心角色',
              iconId: 'compass',
              group: ['解读'],
              prompt: 'browser prompt',
              enableWebSearch: true,
            },
          ]),
        };
      }
      if (url.endsWith('assistant-presets.general.zh-CN.json')) {
        return {
          ok: true,
          json: async () => ([
            {
              id: 'draft-writer',
              name: '草稿起笔',
              description: '通用角色',
              iconId: 'file-pen',
              group: ['写作'],
              prompt: 'general prompt',
              enableMemory: true,
            },
          ]),
        };
      }
      throw new Error(`unexpected url: ${url}`);
    });

    const templates = await loadAssistantPresets('zh-CN');
    const sections = await loadAssistantPresetCatalog('zh-CN');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'chrome-extension://test/data/assistant-presets.browser.zh-CN.json',
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'chrome-extension://test/data/assistant-presets.general.zh-CN.json',
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(templates[1]).toEqual(expect.objectContaining({
      id: 'browser-briefing',
      name: '网页解读',
      description: '浏览器核心角色',
      iconId: 'compass',
      prompt: 'browser prompt',
      tags: ['解读'],
      enableWebSearch: true,
    }));
    expect(templates[2]).toEqual(expect.objectContaining({
      id: 'draft-writer',
      name: '草稿起笔',
      iconId: 'file-pen',
      tags: ['写作'],
      enableMemory: true,
    }));
    expect(sections).toEqual([
      expect.objectContaining({
        key: 'browser',
        title: '浏览器场景',
        categories: ['解读', '研究', '提取', '执行'],
        presets: [expect.objectContaining({ id: 'browser-briefing' })],
      }),
      expect.objectContaining({
        key: 'general',
        title: '通用助手',
        categories: ['写作', '学习', '开发', '分析', '规划', '创意', '沟通', '效率'],
        presets: [expect.objectContaining({ id: 'draft-writer' })],
      }),
    ]);
  });

  it('单个分区加载失败时，只让该分区回退为空', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('assistant-presets.browser.en.json')) {
        return {
          ok: true,
          json: async () => ([
            {
              id: 'browser-briefing',
              name: 'Page Briefing',
              group: ['Briefing'],
              prompt: 'browser prompt',
            },
          ]),
        };
      }
      return {
        ok: false,
        json: async () => ([]),
      };
    });

    const templates = await loadAssistantPresets('en-US');
    const sections = await loadAssistantPresetCatalog('en-US');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(templates).toHaveLength(2);
    expect(templates[0]).toEqual(expect.objectContaining({
      id: '__builtin_default_role__',
    }));
    expect(templates[1]).toEqual(expect.objectContaining({
      id: 'browser-briefing',
    }));
    expect(sections[0]).toEqual(expect.objectContaining({
      key: 'browser',
      presets: [expect.objectContaining({ id: 'browser-briefing' })],
    }));
    expect(sections[1]).toEqual(expect.objectContaining({
      key: 'general',
      presets: [],
    }));
  });

  it('两个分区都加载失败时只回退到默认助手与空分区壳', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ([]),
    });

    const templates = await loadAssistantPresets('zh-CN');
    const sections = await loadAssistantPresetCatalog('zh-CN');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(templates).toHaveLength(1);
    expect(sections).toEqual([
      expect.objectContaining({ key: 'browser', presets: [] }),
      expect.objectContaining({ key: 'general', presets: [] }),
    ]);
  });

  it('内置默认助手保持场景无关，不绑定浏览器前提', () => {
    const zhPreset = buildBuiltinDefaultAssistantPreset('zh-CN');
    const enPreset = buildBuiltinDefaultAssistantPreset('en-US');

    expect(zhPreset).toMatchObject({
      id: '__builtin_default_role__',
      scenario: 'general',
      name: '默认助手',
      description: expect.stringContaining('统一默认助手'),
    });
    expect(zhPreset.prompt).toContain('默认助手');
    expect(zhPreset.prompt).not.toContain('默认浏览器助手');

    expect(enPreset).toMatchObject({
      id: '__builtin_default_role__',
      scenario: 'general',
      name: 'Default Assistant',
      description: expect.stringContaining('default assistant'),
    });
    expect(enPreset.prompt.toLowerCase()).toContain("default assistant");
    expect(enPreset.prompt.toLowerCase()).not.toContain('default browser assistant');
  });
});
