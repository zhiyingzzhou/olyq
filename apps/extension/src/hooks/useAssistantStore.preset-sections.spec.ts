/**
 * 说明：`useAssistantStore.preset-sections.spec` Hook 模块。
 *
 * 职责：
 * - 承载 `useAssistantStore.preset-sections.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  browserTemplate,
  builtinTemplate,
  generalTemplate,
  loadAssistantPresetCatalogMock,
  loadAssistantPresetsMock,
} = vi.hoisted(() => ({
  builtinTemplate: {
    id: '__builtin_default_role__',
    name: '默认助手',
    prompt: 'builtin prompt',
    iconId: 'bot',
  },
  browserTemplate: {
    id: 'browser-briefing',
    name: '网页解读',
    prompt: 'browser prompt',
    tags: ['解读'],
  },
  generalTemplate: {
    id: 'draft-writer',
    name: '草稿起笔',
    prompt: 'general prompt',
    tags: ['写作'],
  },
  loadAssistantPresetsMock: vi.fn(),
  loadAssistantPresetCatalogMock: vi.fn(),
}));

vi.mock('@/data/role-templates', () => ({
  buildAssistantPresetCatalogScaffold: () => ([
    { key: 'browser', title: '浏览器场景', categories: ['解读', '研究'], presets: [] },
    { key: 'general', title: '通用助手', categories: ['写作', '开发'], presets: [] },
  ]),
  buildBuiltinDefaultAssistantPreset: () => builtinTemplate,
  loadAssistantPresetCatalog: loadAssistantPresetCatalogMock,
  loadAssistantPresets: loadAssistantPresetsMock,
}));

vi.mock('@/lib/sync/sync-engine', () => ({
  recordAssistantDeletion: vi.fn(),
  recordAssistantFieldChange: vi.fn(),
  recordTopicDeletion: vi.fn(),
  recordTopicFieldChange: vi.fn(),
}));

/**
 * 测试辅助函数：`resetAssistantStoreGlobals`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function resetAssistantStoreGlobals() {
  const globalForStore = globalThis as typeof globalThis & {
    __olyqUseAssistantStoreV1__?: unknown;
    __olyqUseAssistantStoreV1Inited__?: boolean;
    __olyqUseAssistantStoreV1LangBound__?: boolean;
    __olyqUseAssistantStoreV1ReloadBound__?: boolean;
  };
  delete globalForStore.__olyqUseAssistantStoreV1__;
  delete globalForStore.__olyqUseAssistantStoreV1Inited__;
  delete globalForStore.__olyqUseAssistantStoreV1LangBound__;
  delete globalForStore.__olyqUseAssistantStoreV1ReloadBound__;
}

describe('useAssistantStore preset sections', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('olyq.legal.preset-remediation.v1', JSON.stringify({
      presetSet: 'olyq-browser-v1',
      appliedAt: 1,
    }));
    resetAssistantStoreGlobals();
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.stubGlobal('chrome', undefined);
    vi.stubGlobal('indexedDB', undefined);
    loadAssistantPresetsMock.mockReset();
    loadAssistantPresetCatalogMock.mockReset();
  });

  it('会同时加载扁平 presets 和分区化 presetSections', async () => {
    loadAssistantPresetsMock.mockResolvedValue([builtinTemplate, browserTemplate, generalTemplate]);
    loadAssistantPresetCatalogMock.mockResolvedValue([
      { key: 'browser', title: '浏览器场景', categories: ['解读', '研究'], presets: [browserTemplate] },
      { key: 'general', title: '通用助手', categories: ['写作', '开发'], presets: [generalTemplate] },
    ]);

    const { useAssistantStore } = await import('./useAssistantStore');

    await waitFor(() => {
      expect(useAssistantStore.getState().presets.map((item) => item.id)).toEqual([
        '__builtin_default_role__',
        'browser-briefing',
        'draft-writer',
      ]);
      expect(useAssistantStore.getState().presetSections).toEqual([
        expect.objectContaining({
          key: 'browser',
          presets: [expect.objectContaining({ id: 'browser-briefing' })],
        }),
        expect.objectContaining({
          key: 'general',
          presets: [expect.objectContaining({ id: 'draft-writer' })],
        }),
      ]);
    });
  });

  it('catalog 某个分区为空时会保留其他分区与默认助手', async () => {
    loadAssistantPresetsMock.mockResolvedValue([builtinTemplate, browserTemplate]);
    loadAssistantPresetCatalogMock.mockResolvedValue([
      { key: 'browser', title: '浏览器场景', categories: ['解读', '研究'], presets: [browserTemplate] },
      { key: 'general', title: '通用助手', categories: ['写作', '开发'], presets: [] },
    ]);

    const { useAssistantStore } = await import('./useAssistantStore');

    await waitFor(() => {
      expect(useAssistantStore.getState().presets.map((item) => item.id)).toEqual([
        '__builtin_default_role__',
        'browser-briefing',
      ]);
      expect(useAssistantStore.getState().presetSections[0]?.presets.map((item) => item.id)).toEqual(['browser-briefing']);
      expect(useAssistantStore.getState().presetSections[1]?.presets).toEqual([]);
    });
  });
});
