/**
 * 说明：`useAssistantStore.user-presets.spec` Hook 模块。
 *
 * 职责：
 * - 覆盖用户预设真源的持久化、导入归一化与创建助手入口；
 * - 守住 `olyq.assistant-presets.v1` 的当前 schema，不回退旧 `preset-prefs` 语义；
 * - 为完整助手商店的数据层提供回归保护。
 *
 * 边界：
 * - 本文件只验证助手 store 的用户预设 contract，不覆盖页面级 dialog 交互。
 */
import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  builtinDefaultPreset,
  browserBuiltinPreset,
  loadAssistantPresetCatalogMock,
  loadAssistantPresetsMock,
} = vi.hoisted(() => ({
  builtinDefaultPreset: {
    id: '__builtin_default_role__',
    scenario: 'general' as const,
    name: '默认助手',
    prompt: 'builtin prompt',
    iconId: 'bot' as const,
  },
  browserBuiltinPreset: {
    id: 'browser-research',
    scenario: 'browser' as const,
    name: '研究核验',
    prompt: 'builtin browser prompt',
    iconId: 'search' as const,
  },
  loadAssistantPresetsMock: vi.fn(),
  loadAssistantPresetCatalogMock: vi.fn(),
}));

vi.mock('@/data/role-templates', () => ({
  buildAssistantPresetCatalogScaffold: () => ([
    { key: 'browser', title: '浏览器场景', categories: ['研究'], presets: [] },
    { key: 'general', title: '通用助手', categories: ['写作'], presets: [] },
  ]),
  buildBuiltinDefaultAssistantPreset: () => builtinDefaultPreset,
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
 * `useAssistantStore` 是跨模块单例，测试间必须清掉全局句柄，避免上一次状态泄漏。
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

describe('useAssistantStore userPresets', () => {
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
    loadAssistantPresetsMock.mockResolvedValue([builtinDefaultPreset, browserBuiltinPreset]);
    loadAssistantPresetCatalogMock.mockResolvedValue([
      { key: 'browser', title: '浏览器场景', categories: ['研究'], presets: [browserBuiltinPreset] },
      { key: 'general', title: '通用助手', categories: ['写作'], presets: [] },
    ]);
  });

  it('会把用户预设写入共享存储，并在重新加载 store 后恢复', async () => {
    const { useAssistantStore } = await import('./useAssistantStore');

    const createdPresetId = useAssistantStore.getState().createPreset({
      scenario: 'general',
      name: '我的预设',
      description: '用户自定义预设',
      prompt: 'hello preset',
      tags: ['我的标签'],
      enableWebSearch: true,
    });

    expect(createdPresetId).toBeTruthy();

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('olyq.assistant-presets.v1') || '[]') as Array<{ id: string }>;
      expect(saved[0]?.id).toBe(createdPresetId);
    });

    resetAssistantStoreGlobals();
    vi.resetModules();
    localStorage.setItem('olyq.legal.preset-remediation.v1', JSON.stringify({
      presetSet: 'olyq-browser-v1',
      appliedAt: 1,
    }));

    const reloaded = await import('./useAssistantStore');

    await waitFor(() => {
      expect(reloaded.useAssistantStore.getState().userPresets).toEqual([
        expect.objectContaining({
          id: createdPresetId,
          name: '我的预设',
          prompt: 'hello preset',
          tags: ['我的标签'],
          enableWebSearch: true,
        }),
      ]);
    });
  });

  it('导入时接受单对象或数组，并为冲突 ID 直接生成新 ID', async () => {
    const { useAssistantStore } = await import('./useAssistantStore');

    useAssistantStore.setState({
      presets: [builtinDefaultPreset, browserBuiltinPreset],
      userPresets: [{
        id: 'user-existing',
        scenario: 'general',
        name: '已存在预设',
        prompt: 'existing prompt',
        createdAt: 1,
        updatedAt: 1,
      }],
    });

    const importedSingle = useAssistantStore.getState().importPresets({
      id: 'browser-research',
      scenario: 'browser',
      name: '单对象导入',
      prompt: 'single import',
      tags: ['研究'],
    });

    const importedBatch = useAssistantStore.getState().importPresets([
      {
        id: 'user-existing',
        scenario: 'general',
        name: '数组导入 A',
        prompt: 'batch import a',
      },
      {
        id: importedSingle[0]?.id,
        scenario: 'general',
        name: '数组导入 B',
        prompt: 'batch import b',
      },
    ]);

    expect(importedSingle).toHaveLength(1);
    expect(importedBatch).toHaveLength(2);
    expect(importedSingle[0]?.id).not.toBe('browser-research');
    expect(importedBatch[0]?.id).not.toBe('user-existing');
    expect(importedBatch[1]?.id).not.toBe(importedSingle[0]?.id);

    const allUserPresets = useAssistantStore.getState().userPresets;
    expect(allUserPresets.map((preset) => preset.name)).toEqual(expect.arrayContaining([
      '已存在预设',
      '单对象导入',
      '数组导入 A',
      '数组导入 B',
    ]));
  });
});
