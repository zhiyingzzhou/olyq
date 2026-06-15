/**
 * 说明：`AssistantStoreDialog.spec` 组件模块。
 *
 * 职责：
 * - 承载完整助手商店 overlay 的交互回归；
 * - 覆盖三组导航、全库搜索、预览创建、导入、管理模式与批量动作；
 * - 避免入口回退到旧的即点即建 role picker 语义。
 *
 * 边界：
 * - 本文件只验证商店组件本身的行为，不延伸到页面级路由编排。
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AssistantPresetSection } from '@/data/role-templates';
import type { AssistantPreset, StoredAssistantPreset } from '@/types/assistant';

import { AssistantStoreDialog } from './AssistantStoreDialog';

const {
  confirmMock,
  downloadTextMock,
  toastErrorMock,
  toastSuccessMock,
  virtualWindowRef,
} = vi.hoisted(() => ({
  confirmMock: vi.fn(async () => true),
  downloadTextMock: vi.fn(async () => undefined),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  virtualWindowRef: {
    current: null as null | { startIndex: number; endIndex: number },
  },
}));

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: Record<string, unknown>) => {
        const messages: Record<string, string> = {
          'assistant.createFromRole': '从该角色创建助手',
          'assistant.browserPresetBadges.webSearch': '联网搜索',
          'assistant.browserPresetBadges.mcp': 'MCP',
          'assistant.store.title': '助手商店',
          'assistant.store.description': '商店说明',
          'assistant.store.library': '预设分组',
          'assistant.store.mine': '我的预设',
          'assistant.store.browser': '浏览器场景',
          'assistant.store.general': '通用助手',
          'assistant.store.searchResults': '搜索结果',
          'assistant.store.searchPlaceholder': '搜索全部预设、描述、提示词或标签…',
          'assistant.store.import': '导入',
          'assistant.store.manage': '管理',
          'assistant.store.createPreset': '新增预设',
          'assistant.store.previewPreset': `预览预设 ${options?.name ?? ''}`,
          'assistant.store.sectionSummary': `当前结果 ${options?.count ?? 0} 条`,
          'assistant.store.searchSummary': `全库命中 ${options?.count ?? 0} 条`,
          'assistant.store.noDescription': '暂时没有描述',
          'assistant.store.enableWebSearch': '联网搜索',
          'assistant.store.enableGenerateImage': '生成图片',
          'assistant.enableMemory': '启用记忆',
          'assistant.store.emptyTitle': '这里还没有预设',
          'assistant.store.emptyDesc': '空态说明',
          'assistant.store.searchEmptyTitle': '没有找到匹配的预设',
          'assistant.store.searchEmptyDesc': '搜索空态说明',
          'assistant.store.addToAssistant': '添加到助手',
          'assistant.store.scenario': '场景',
          'assistant.store.scenarioBrowser': '浏览器场景',
          'assistant.store.scenarioGeneral': '通用助手',
          'assistant.model': '模型',
          'assistant.useDefault': '使用默认',
          'assistant.systemPrompt': '系统提示词',
          'assistant.store.editPreset': '编辑预设',
          'assistant.store.exportPreset': '导出',
          'assistant.store.deletePreset': '删除',
          'assistant.store.capabilities': '能力开关',
          'assistant.store.importTitle': '导入预设',
          'assistant.store.importDesc': '导入说明',
          'assistant.store.importFromUrl': '从 URL 导入',
          'assistant.store.importUrlPlaceholder': 'https://example.com/assistant-presets.json',
          'assistant.store.importFromFile': '从 JSON 文件导入',
          'assistant.store.pickJsonFile': '选择 JSON 文件',
          'assistant.store.selectedCount': `已选 ${options?.count ?? 0} 项`,
          'assistant.store.exportSelected': '导出已选',
          'assistant.store.deleteSelected': '删除已选',
          'assistant.store.deleteSelectedTitle': '删除选中的预设？',
          'assistant.store.deleteSelectedDesc': `将删除 ${options?.count ?? 0} 个用户预设，此操作不可撤销。`,
          'assistant.store.deletePresetTitle': '删除这个预设？',
          'assistant.store.deletePresetDesc': `将删除「${options?.name ?? ''}」，此操作不可撤销。`,
          'assistant.store.exportEmpty': '没有可导出的预设',
          'assistant.store.exportSuccess': `已导出 ${options?.count ?? 0} 个预设`,
          'assistant.store.presetDeleted': '已删除选中的预设',
          'assistant.store.presetDeletedOne': '已删除预设',
          'assistant.store.importEmpty': '没有导入到任何有效预设',
          'assistant.store.importSuccess': `已导入 ${options?.count ?? 0} 个预设`,
          'assistant.store.importFailed': '导入失败',
          'assistant.store.presetCreated': '已创建预设',
          'assistant.store.presetUpdated': '已更新预设',
          'assistant.store.selectPreset': `选择预设 ${options?.name ?? ''}`,
          'pageContext.profileCatalog.minimalPage.title': '轻量页面',
          'pageContext.profileCatalog.deepPage.title': '深度页面',
          'pageContext.profileCatalog.structuredExtraction.title': '结构提取',
          'pageContext.profileCatalog.workflowAware.title': '工作流感知',
          'pageContext.profileCatalog.minimalPage.description': 'desc',
          'pageContext.profileCatalog.deepPage.description': 'desc',
          'pageContext.profileCatalog.structuredExtraction.description': 'desc',
          'pageContext.profileCatalog.workflowAware.description': 'desc',
          'pageContext.profileCatalog.detail.promptBudget': '预算',
          'pageContext.profileCatalog.detail.pageOnly': '仅页面正文',
          'pageContext.profileCatalog.detail.selection': '含最近选区',
          'pageContext.profileCatalog.detail.element': '含最近元素',
          'pageContext.profileCatalog.detail.selectionAndElement': '含选区与元素',
          'common.cancel': '取消',
          'common.delete': '删除',
        };
        if (key === 'assistant.browserPresetBadges.profile') return `上下文：${options?.title}`;
        return messages[key] ?? key;
      },
    }),
  };
});

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({
    count,
    estimateSize,
    getItemKey,
  }: {
    count: number;
    estimateSize?: number | ((index: number) => number);
    getItemKey?: (index: number) => string | number;
  }) => {
    /** 为当前虚拟窗口计算每一行的估算高度。 */
    const resolveSize = (index: number) => {
      if (typeof estimateSize === 'function') return estimateSize(index);
      if (typeof estimateSize === 'number') return estimateSize;
      return 200;
    };

    let total = 0;
    const starts = Array.from({ length: count }, (_, index) => {
      const start = total;
      total += resolveSize(index);
      return start;
    });
    const windowRange = virtualWindowRef.current;
    const startIndex = count < 1 ? 0 : Math.max(0, Math.min(windowRange?.startIndex ?? 0, count - 1));
    const endIndex = count < 1
      ? -1
      : Math.max(startIndex, Math.min(windowRange?.endIndex ?? count - 1, count - 1));

    return {
      getTotalSize: () => total,
      getVirtualItems: () => (
        count < 1 || endIndex < startIndex
          ? []
          : Array.from({ length: endIndex - startIndex + 1 }, (_, offset) => {
              const index = startIndex + offset;
              return {
                index,
                key: getItemKey?.(index) ?? `row-${index}`,
                start: starts[index] ?? 0,
              };
            })
      ),
      measure: () => undefined,
      measureElement: () => undefined,
      scrollToIndex: vi.fn(),
    };
  },
}));

vi.mock('@/hooks/useAssistantStore', () => ({
  useAssistantStore: <T,>(selector: (state: { assistants: Array<{ id: string; tags?: string[] }> }) => T) => selector({
    assistants: [{ id: 'assistant-1', tags: ['共享标签'] }],
  }),
}));

vi.mock('@/hooks/useConfirmDialog', () => ({
  useConfirmDialog: () => ({
    confirm: confirmMock,
    ConfirmDialogPortal: () => null,
  }),
}));

vi.mock('@/hooks/useToast', () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
    info: vi.fn(),
  },
}));

vi.mock('@/lib/export/download', () => ({
  downloadText: downloadTextMock,
}));

vi.mock('./PresetEditorDialog', () => ({
  PresetEditorDialog: ({ open, preset }: { open: boolean; preset: StoredAssistantPreset | null }) => (
    open ? <div data-testid="preset-editor">{preset ? 'edit-preset' : 'create-preset'}</div> : null
  ),
}));

const builtinPresets: AssistantPreset[] = [
  {
    id: '__builtin_default_role__',
    scenario: 'general',
    name: '默认助手',
    prompt: 'builtin',
    description: '默认卡片',
    iconId: 'bot',
  },
  {
    id: 'browser-research',
    scenario: 'browser',
    name: '研究核验',
    prompt: 'browser research',
    description: '浏览器研究角色',
    iconId: 'search',
    tags: ['研究'],
    enableWebSearch: true,
  },
  {
    id: 'draft-writer',
    scenario: 'general',
    name: '草稿起笔',
    prompt: 'general draft',
    description: '通用写作角色',
    iconId: 'file-pen',
    tags: ['写作'],
  },
  {
    id: 'email-composer',
    scenario: 'general',
    name: '邮件撰写',
    prompt: 'general email',
    description: '通用沟通角色',
    iconId: 'mail',
    tags: ['沟通'],
  },
];

const userPresets: StoredAssistantPreset[] = [
  {
    id: 'user-preset-1',
    scenario: 'general',
    name: '我的速写',
    prompt: 'user preset',
    description: '用户预设描述',
    iconId: 'sparkles',
    tags: ['共享标签', '个人'],
    createdAt: 1,
    updatedAt: 2,
  },
];

const presetSections: AssistantPresetSection[] = [
  {
    key: 'browser',
    title: '浏览器场景',
    categories: ['研究'],
    presets: [builtinPresets[1]],
  },
  {
    key: 'general',
    title: '通用助手',
    categories: ['写作', '沟通'],
    presets: [builtinPresets[2], builtinPresets[3]],
  },
];

describe('AssistantStoreDialog', () => {
  beforeEach(() => {
    confirmMock.mockClear();
    downloadTextMock.mockClear();
    toastSuccessMock.mockClear();
    toastErrorMock.mockClear();
    virtualWindowRef.current = null;
    vi.unstubAllGlobals();
  });

  it('展示三组导航，并在搜索时跨全库返回结果', async () => {
    render(
      <AssistantStoreDialog
        open
        builtinPresets={builtinPresets}
        userPresets={userPresets}
        presetSections={presetSections}
        onClose={() => {}}
        onCreateAssistantFromPreset={() => {}}
        onCreatePreset={() => ''}
        onUpdatePreset={() => {}}
        onDeletePresets={() => {}}
        onImportPresets={() => []}
        onExportPresets={() => []}
      />,
    );

    const dialog = screen.getByTestId('assistant-store-dialog');
    expect(dialog.className).toContain('rounded-lg');
    expect(dialog.className).toContain('h-[min(85vh,calc(100dvh-1.5rem))]');
    expect(dialog.className).toContain('w-[min(1024px,calc(100vw-1.5rem))]');
    expect(screen.getByRole('button', { name: /我的预设/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /浏览器场景/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /通用助手/ })).toBeInTheDocument();
    expect(screen.getByText('我的速写')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('搜索全部预设、描述、提示词或标签…'), {
      target: { value: '研究' },
    });

    expect(await screen.findByText('搜索结果')).toBeInTheDocument();
    expect(screen.getByText('研究核验')).toBeInTheDocument();
    expect(screen.queryByText('我的速写')).not.toBeInTheDocument();
  });

  it('我的预设卡片直接显示编辑入口，点击编辑不会打开预览', async () => {
    render(
      <AssistantStoreDialog
        open
        builtinPresets={builtinPresets}
        userPresets={userPresets}
        presetSections={presetSections}
        onClose={() => {}}
        onCreateAssistantFromPreset={() => {}}
        onCreatePreset={() => ''}
        onUpdatePreset={() => {}}
        onDeletePresets={() => {}}
        onImportPresets={() => []}
        onExportPresets={() => []}
      />,
    );

    const card = screen.getByTestId('assistant-store-user-preset-user-preset-1');
    fireEvent.click(within(card).getByRole('button', { name: '编辑预设' }));

    expect(await screen.findByTestId('preset-editor')).toHaveTextContent('edit-preset');
    expect(screen.queryByRole('button', { name: '添加到助手' })).not.toBeInTheDocument();
  });

  it('我的预设卡片支持单条导出和删除，操作按钮不触发预览', async () => {
    const onDeletePresets = vi.fn();
    const onExportPresets = vi.fn(() => userPresets);

    render(
      <AssistantStoreDialog
        open
        builtinPresets={builtinPresets}
        userPresets={userPresets}
        presetSections={presetSections}
        onClose={() => {}}
        onCreateAssistantFromPreset={() => {}}
        onCreatePreset={() => ''}
        onUpdatePreset={() => {}}
        onDeletePresets={onDeletePresets}
        onImportPresets={() => []}
        onExportPresets={onExportPresets}
      />,
    );

    const card = screen.getByTestId('assistant-store-user-preset-user-preset-1');
    fireEvent.click(within(card).getByRole('button', { name: '导出' }));

    await waitFor(() => {
      expect(onExportPresets).toHaveBeenCalledWith(['user-preset-1']);
      expect(downloadTextMock).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByRole('button', { name: '添加到助手' })).not.toBeInTheDocument();

    fireEvent.click(within(card).getByRole('button', { name: '删除' }));

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({
        title: '删除这个预设？',
        description: '将删除「我的速写」，此操作不可撤销。',
      }));
      expect(onDeletePresets).toHaveBeenCalledWith(['user-preset-1']);
    });
    expect(screen.queryByRole('button', { name: '添加到助手' })).not.toBeInTheDocument();
  });

  it('点击卡片会先打开预览，再显式确认添加到助手', async () => {
    const onCreateAssistantFromPreset = vi.fn();

    render(
      <AssistantStoreDialog
        open
        builtinPresets={builtinPresets}
        userPresets={userPresets}
        presetSections={presetSections}
        onClose={() => {}}
        onCreateAssistantFromPreset={onCreateAssistantFromPreset}
        onCreatePreset={() => ''}
        onUpdatePreset={() => {}}
        onDeletePresets={() => {}}
        onImportPresets={() => []}
        onExportPresets={() => []}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /浏览器场景/ }));
    fireEvent.click(screen.getByRole('button', { name: /研究核验/ }));

    expect(await screen.findByRole('button', { name: '添加到助手' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '添加到助手' }));

    expect(onCreateAssistantFromPreset).toHaveBeenCalledWith('browser-research');
  });

  it('浏览器场景分区复用和角色选择弹窗一致的浏览器卡片展示', () => {
    render(
      <AssistantStoreDialog
        open
        builtinPresets={builtinPresets}
        userPresets={userPresets}
        presetSections={presetSections}
        onClose={() => {}}
        onCreateAssistantFromPreset={() => {}}
        onCreatePreset={() => ''}
        onUpdatePreset={() => {}}
        onDeletePresets={() => {}}
        onImportPresets={() => []}
        onExportPresets={() => []}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /浏览器场景/ }));

    const grid = screen.getByTestId('assistant-store-browser-grid');
    expect(within(grid).getByText('上下文：深度页面')).toBeInTheDocument();
    expect(within(grid).getByText('联网搜索')).toBeInTheDocument();
    expect(within(grid).getAllByRole('button', { name: /从该角色创建助手/ }).length).toBeGreaterThan(0);
  });

  it('浏览器场景分区会按和角色选择弹窗一致的稳定顺序排列', () => {
    const orderedBrowserPresets: AssistantPreset[] = [
      {
        id: 'browser-operator',
        scenario: 'browser',
        name: '任务执行',
        prompt: 'browser operator',
        description: '浏览器执行角色',
        iconId: 'wrench',
      },
      {
        id: 'browser-research',
        scenario: 'browser',
        name: '研究核验',
        prompt: 'browser research',
        description: '浏览器研究角色',
        iconId: 'search',
        enableWebSearch: true,
      },
      {
        id: 'browser-briefing',
        scenario: 'browser',
        name: '网页解读',
        prompt: 'browser briefing',
        description: '浏览器解读角色',
        iconId: 'compass',
      },
      {
        id: 'browser-extractor',
        scenario: 'browser',
        name: '结构提取',
        prompt: 'browser extractor',
        description: '浏览器提取角色',
        iconId: 'blocks',
      },
    ];

    render(
      <AssistantStoreDialog
        open
        builtinPresets={orderedBrowserPresets}
        userPresets={[]}
        presetSections={[{
          key: 'browser',
          title: '浏览器场景',
          categories: ['解读', '研究', '提取', '执行'],
          presets: [
            orderedBrowserPresets[0],
            orderedBrowserPresets[1],
            orderedBrowserPresets[2],
            orderedBrowserPresets[3],
          ],
        }, {
          key: 'general',
          title: '通用助手',
          categories: [],
          presets: [],
        }]}
        onClose={() => {}}
        onCreateAssistantFromPreset={() => {}}
        onCreatePreset={() => ''}
        onUpdatePreset={() => {}}
        onDeletePresets={() => {}}
        onImportPresets={() => []}
        onExportPresets={() => []}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /浏览器场景/ }));

    const grid = screen.getByTestId('assistant-store-browser-grid');
    expect(within(grid).getByText('网页解读').compareDocumentPosition(within(grid).getByText('研究核验'))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(within(grid).getByText('研究核验').compareDocumentPosition(within(grid).getByText('结构提取'))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(within(grid).getByText('结构提取').compareDocumentPosition(within(grid).getByText('任务执行'))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('通用助手分区复用和角色选择弹窗一致的紧凑 tile 网格，并把默认助手作为第一项', () => {
    render(
      <AssistantStoreDialog
        open
        builtinPresets={builtinPresets}
        userPresets={userPresets}
        presetSections={presetSections}
        onClose={() => {}}
        onCreateAssistantFromPreset={() => {}}
        onCreatePreset={() => ''}
        onUpdatePreset={() => {}}
        onDeletePresets={() => {}}
        onImportPresets={() => []}
        onExportPresets={() => []}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /通用助手/ }));

    expect(screen.queryByTestId('assistant-store-general-featured')).not.toBeInTheDocument();
    const grid = screen.getByTestId('assistant-store-general-grid');
    const buttons = within(grid).getAllByRole('button');
    expect(buttons[0]).toHaveTextContent('默认助手');
    expect(within(grid).getByText('草稿起笔')).toBeInTheDocument();
    expect(within(grid).getByText('邮件撰写')).toBeInTheDocument();
    expect(within(grid).getByText('默认助手').compareDocumentPosition(within(grid).getByText('草稿起笔'))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(grid.className).toContain('sm:grid-cols-2');
    expect(grid.getAttribute('style') ?? '').not.toContain('grid-template-columns');
  });

  it('支持打开新增预设弹窗', async () => {
    render(
      <AssistantStoreDialog
        open
        builtinPresets={builtinPresets}
        userPresets={userPresets}
        presetSections={presetSections}
        onClose={() => {}}
        onCreateAssistantFromPreset={() => {}}
        onCreatePreset={() => ''}
        onUpdatePreset={() => {}}
        onDeletePresets={() => {}}
        onImportPresets={() => []}
        onExportPresets={() => []}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '新增预设' }));
    expect(await screen.findByTestId('preset-editor')).toHaveTextContent('create-preset');
  });

  it('支持打开导入弹窗，展示 JSON 文件入口，并可从 URL 导入', async () => {
    const onImportPresets = vi.fn(() => [{
      ...userPresets[0],
      id: 'user-imported',
    }]);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        name: '导入预设',
        prompt: 'imported prompt',
        scenario: 'general',
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AssistantStoreDialog
        open
        builtinPresets={builtinPresets}
        userPresets={userPresets}
        presetSections={presetSections}
        onClose={() => {}}
        onCreateAssistantFromPreset={() => {}}
        onCreatePreset={() => ''}
        onUpdatePreset={() => {}}
        onDeletePresets={() => {}}
        onImportPresets={onImportPresets}
        onExportPresets={() => []}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '导入' }));
    const importDialog = await screen.findByRole('dialog', { name: '导入预设' });
    expect(within(importDialog).getByRole('button', { name: '选择 JSON 文件' })).toBeInTheDocument();

    fireEvent.change(within(importDialog).getByPlaceholderText('https://example.com/assistant-presets.json'), {
      target: { value: 'https://example.com/presets.json' },
    });
    fireEvent.click(within(importDialog).getByRole('button', { name: '导入' }));

    await waitFor(() => {
      expect(onImportPresets).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith('https://example.com/presets.json', { cache: 'no-store' });
    });
  });

  it('我的预设支持管理模式、多选、批量导出和批量删除', async () => {
    const onDeletePresets = vi.fn();
    const onExportPresets = vi.fn(() => userPresets);

    render(
      <AssistantStoreDialog
        open
        builtinPresets={builtinPresets}
        userPresets={userPresets}
        presetSections={presetSections}
        onClose={() => {}}
        onCreateAssistantFromPreset={() => {}}
        onCreatePreset={() => ''}
        onUpdatePreset={() => {}}
        onDeletePresets={onDeletePresets}
        onImportPresets={() => []}
        onExportPresets={onExportPresets}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '管理' }));

    const card = screen.getByTestId('assistant-store-user-preset-user-preset-1');
    expect(within(card).queryByRole('button', { name: '编辑预设' })).not.toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: '导出' })).not.toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: '删除' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('选择预设 我的速写'));

    expect(screen.getByText('已选 1 项')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '导出已选' }));
    await waitFor(() => {
      expect(onExportPresets).toHaveBeenCalledWith(['user-preset-1']);
      expect(downloadTextMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: '删除已选' }));
    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledTimes(1);
      expect(onDeletePresets).toHaveBeenCalledWith(['user-preset-1']);
    });
  });

  it('1000+ 预设时只渲染虚拟窗口内的卡片', () => {
    virtualWindowRef.current = { startIndex: 0, endIndex: 4 };
    const massiveUserPresets: StoredAssistantPreset[] = Array.from({ length: 1200 }, (_, index) => ({
      id: `virtual-preset-${index}`,
      scenario: 'general',
      name: `虚拟预设 ${index}`,
      prompt: `prompt ${index}`,
      description: `描述 ${index}`,
      iconId: 'sparkles',
      createdAt: index,
      updatedAt: index,
    }));

    render(
      <AssistantStoreDialog
        open
        builtinPresets={builtinPresets}
        userPresets={massiveUserPresets}
        presetSections={presetSections}
        onClose={() => {}}
        onCreateAssistantFromPreset={() => {}}
        onCreatePreset={() => ''}
        onUpdatePreset={() => {}}
        onDeletePresets={() => {}}
        onImportPresets={() => []}
        onExportPresets={() => []}
      />,
    );

    expect(screen.getAllByRole('button', { name: /虚拟预设/ })).toHaveLength(5);
    expect(screen.queryByRole('button', { name: '虚拟预设 10' })).not.toBeInTheDocument();
  });
});
