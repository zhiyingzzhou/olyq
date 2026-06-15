/**
 * 说明：`AssistantRolePickerDialog.spec` 组件模块。
 *
 * 职责：
 * - 承载轻量选择弹窗的回归测试；
 * - 守住浏览器分区固定排序、通用分区过滤与直接创建语义。
 *
 * 边界：
 * - 本文件只验证轻量选择弹窗本身，不扩展到完整商店或页面级入口路由。
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AssistantPresetSection } from '@/data/role-templates';
import type { AssistantPreset } from '@/types/assistant';

import { AssistantRolePickerDialog } from './AssistantRolePickerDialog';

const { virtualWindowRef } = vi.hoisted(() => ({
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
        if (key === 'assistant.roleSectionTab') return `${options?.title} (${options?.count})`;
        if (key === 'assistant.browserPresetBadges.profile') return `上下文：${options?.title}`;
        const messages: Record<string, string> = {
          'assistant.chooseRole': '选择内置助手角色',
          'assistant.chooseRoleDesc': '角色选择说明',
          'assistant.roleSearch': '搜索当前分区角色…',
          'assistant.defaultAssistant': '默认助手',
          'assistant.allCategories': '全部',
          'assistant.createFromRole': '从该角色创建助手',
          'assistant.noResults': '未找到匹配的助手',
          'assistant.browserPresetBadges.webSearch': '联网搜索',
          'assistant.browserPresetBadges.mcp': 'MCP',
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
        };
        return messages[key] ?? key;
      },
    }),
  };
});

vi.mock('@tanstack/react-virtual', async () => {
  const React = await vi.importActual<typeof import('react')>('react');

  return {
    useVirtualizer: ({
      count,
      estimateSize,
      getItemKey,
      getScrollElement,
    }: {
      count: number;
      estimateSize?: number | ((index: number) => number);
      getItemKey?: (index: number) => string | number;
      getScrollElement?: () => Element | null;
    }) => {
      const [, forceRender] = React.useReducer((value: number) => value + 1, 0);
      const stateRef = React.useRef({
        count,
        estimateSize,
        getItemKey,
        getScrollElement,
        hasVisibleMeasurement: false,
      });

      stateRef.current.count = count;
      stateRef.current.estimateSize = estimateSize;
      stateRef.current.getItemKey = getItemKey;
      stateRef.current.getScrollElement = getScrollElement;

      const instanceRef = React.useRef<{
        getTotalSize: () => number;
        getVirtualItems: () => Array<{ index: number; key: string | number; start: number }>;
        measure: () => void;
        measureElement: () => void;
        scrollToIndex: ReturnType<typeof vi.fn>;
      } | null>(null);

      if (!instanceRef.current) {
        instanceRef.current = {
          getTotalSize: () => {
            let total = 0;
            for (let index = 0; index < stateRef.current.count; index += 1) {
              if (typeof stateRef.current.estimateSize === 'function') {
                total += stateRef.current.estimateSize(index);
              } else if (typeof stateRef.current.estimateSize === 'number') {
                total += stateRef.current.estimateSize;
              } else {
                total += 188;
              }
            }
            return total;
          },
          getVirtualItems: () => {
            const currentCount = stateRef.current.count;
            if (currentCount < 1 || !stateRef.current.hasVisibleMeasurement) return [];

            /** 复用当前虚拟列表的估算高度规则，便于稳定构造测试行起点。 */
            const resolveSize = (index: number) => {
              if (typeof stateRef.current.estimateSize === 'function') return stateRef.current.estimateSize(index);
              if (typeof stateRef.current.estimateSize === 'number') return stateRef.current.estimateSize;
              return 188;
            };

            let total = 0;
            const starts = Array.from({ length: currentCount }, (_, index) => {
              const start = total;
              total += resolveSize(index);
              return start;
            });

            const windowRange = virtualWindowRef.current;
            const startIndex = Math.max(0, Math.min(windowRange?.startIndex ?? 0, currentCount - 1));
            const endIndex = Math.max(startIndex, Math.min(windowRange?.endIndex ?? currentCount - 1, currentCount - 1));

            return Array.from({ length: endIndex - startIndex + 1 }, (_, offset) => {
              const index = startIndex + offset;
              return {
                index,
                key: stateRef.current.getItemKey?.(index) ?? `row-${index}`,
                start: starts[index] ?? 0,
              };
            });
          },
          measure: () => {
            if (!stateRef.current.getScrollElement?.()) return;
            if (stateRef.current.hasVisibleMeasurement) return;
            stateRef.current.hasVisibleMeasurement = true;
            forceRender();
          },
          measureElement: () => undefined,
          scrollToIndex: vi.fn(),
        };
      }

      React.useEffect(() => {
        if (stateRef.current.getScrollElement?.()) return;
        stateRef.current.hasVisibleMeasurement = false;
      });

      return instanceRef.current;
    },
  };
});

const templates: AssistantPreset[] = [
  {
    id: '__builtin_default_role__',
    scenario: 'general',
    name: '默认助手',
    prompt: 'builtin',
    description: '默认卡片',
    iconId: 'bot',
  },
  {
    id: 'browser-briefing',
    scenario: 'browser',
    name: '网页解读',
    prompt: 'browser summary',
    description: '浏览器解读角色',
    iconId: 'compass',
    tags: ['解读'],
  },
  {
    id: 'browser-research',
    scenario: 'browser',
    name: '研究核验',
    prompt: 'browser research',
    description: '浏览器研究角色',
    iconId: 'search',
    enableWebSearch: true,
    tags: ['研究'],
  },
  {
    id: 'browser-extractor',
    scenario: 'browser',
    name: '结构提取',
    prompt: 'browser extract',
    description: '浏览器提取角色',
    iconId: 'blocks',
    tags: ['提取'],
  },
  {
    id: 'browser-operator',
    scenario: 'browser',
    name: '任务执行',
    prompt: 'browser operator',
    description: '浏览器执行角色',
    iconId: 'wrench',
    mcpSelection: { mode: 'auto', manualServerIds: [] },
    tags: ['执行'],
  },
  {
    id: 'draft-writer',
    scenario: 'general',
    name: '草稿起笔',
    prompt: 'general draft writer',
    description: '通用写作角色',
    iconId: 'file-pen',
    tags: ['写作'],
  },
  {
    id: 'email-composer',
    scenario: 'general',
    name: '邮件撰写',
    prompt: 'general email helper',
    description: '通用沟通角色',
    iconId: 'mail',
    tags: ['沟通'],
  },
];

const sections: AssistantPresetSection[] = [
  {
    key: 'browser',
    title: '浏览器场景',
    categories: ['解读', '研究', '提取', '执行'],
    presets: templates.filter((item) => item.scenario === 'browser'),
  },
  {
    key: 'general',
    title: '通用助手',
    categories: ['写作', '沟通'],
    presets: templates.filter((item) => item.id === 'draft-writer' || item.id === 'email-composer'),
  },
];

/** 切换轻量选择弹窗的分区 tab。 */
function activateTab(name: string) {
  const tab = screen.getByRole('tab', { name });
  fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });
  fireEvent.click(tab);
}

describe('AssistantRolePickerDialog', () => {
  beforeEach(() => {
    virtualWindowRef.current = null;
  });

  it('默认显示通用助手，并把浏览器场景作为第二个分区', async () => {
    render(
      <AssistantRolePickerDialog
        open
        templates={templates}
        sections={sections}
        onClose={() => {}}
        onSelectTemplate={() => {}}
      />,
    );

    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveTextContent('通用助手 (3)');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveTextContent('浏览器场景 (4)');
    expect(screen.getByRole('button', { name: /默认助手 默认卡片/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '全部' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /草稿起笔/ })).toBeInTheDocument();
    expect(screen.getByText('默认助手').compareDocumentPosition(screen.getByText('草稿起笔'))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.queryByRole('button', { name: /网页解读/ })).not.toBeInTheDocument();

    activateTab('浏览器场景 (4)');
    await waitFor(() => {
      expect(screen.getByText('上下文：轻量页面')).toBeInTheDocument();
      expect(screen.getByText('联网搜索')).toBeInTheDocument();
      expect(screen.getByText('MCP')).toBeInTheDocument();
      expect(screen.getByText('网页解读').compareDocumentPosition(screen.getByText('研究核验'))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(screen.getByText('研究核验').compareDocumentPosition(screen.getByText('结构提取'))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(screen.getByText('结构提取').compareDocumentPosition(screen.getByText('任务执行'))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(screen.queryByRole('button', { name: /默认助手 默认卡片/ })).not.toBeInTheDocument();
  });

  it('会继续在通用分区内按分类和搜索条件过滤，并返回选中的 presetId', async () => {
    const onSelectTemplate = vi.fn();

    render(
      <AssistantRolePickerDialog
        open
        templates={templates}
        sections={sections}
        onClose={() => {}}
        onSelectTemplate={onSelectTemplate}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '沟通' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: '沟通' }));

    expect(screen.getByRole('button', { name: /邮件撰写/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /草稿起笔/ })).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('搜索当前分区角色…'), {
      target: { value: 'draft' },
    });
    expect(screen.getByText('未找到匹配的助手')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '全部' }));
    expect(screen.getByRole('button', { name: /草稿起笔/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /草稿起笔/ }));
    expect(onSelectTemplate).toHaveBeenCalledWith('draft-writer');
  });

  it('从关闭态首次打开时，会立即测量并渲染默认通用分区卡片', async () => {
    const { rerender } = render(
      <AssistantRolePickerDialog
        open={false}
        templates={templates}
        sections={sections}
        onClose={() => {}}
        onSelectTemplate={() => {}}
      />,
    );

    expect(screen.queryByRole('button', { name: /默认助手/ })).not.toBeInTheDocument();

    rerender(
      <AssistantRolePickerDialog
        open
        templates={templates}
        sections={sections}
        onClose={() => {}}
        onSelectTemplate={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /默认助手/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /草稿起笔/ })).toBeInTheDocument();
    });
  });

  it('浏览器分区不受虚拟窗口裁切，切换后会直接渲染全部 4 张卡片', () => {
    virtualWindowRef.current = { startIndex: 0, endIndex: 0 };

    render(
      <AssistantRolePickerDialog
        open
        templates={templates}
        sections={sections}
        onClose={() => {}}
        onSelectTemplate={() => {}}
      />,
    );

    activateTab('浏览器场景 (4)');

    expect(screen.getByRole('button', { name: /网页解读/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /研究核验/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /结构提取/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /任务执行/ })).toBeInTheDocument();
    expect(screen.getByTestId('assistant-role-picker-browser-grid')).toHaveClass('sm:grid-cols-2');
  });

  it('通用助手常规规模列表不走虚拟窗口裁切，避免出现大空洞', async () => {
    virtualWindowRef.current = { startIndex: 0, endIndex: 0 };
    const mediumGeneralTemplates: AssistantPreset[] = Array.from({ length: 36 }, (_, index) => ({
      id: `general-medium-${index}`,
      scenario: 'general',
      name: `通用角色 ${index}`,
      prompt: `general prompt ${index}`,
      description: `通用角色描述 ${index}`,
      iconId: 'search',
      tags: ['分析'],
    }));
    const mediumSections: AssistantPresetSection[] = [
      {
        key: 'browser',
        title: '浏览器场景',
        categories: ['解读', '研究', '提取', '执行'],
        presets: templates.filter((item) => item.scenario === 'browser'),
      },
      {
        key: 'general',
        title: '通用助手',
        categories: ['分析'],
        presets: mediumGeneralTemplates,
      },
    ];

    render(
      <AssistantRolePickerDialog
        open
        templates={[templates[0]!, ...templates.filter((item) => item.scenario === 'browser'), ...mediumGeneralTemplates]}
        sections={mediumSections}
        onClose={() => {}}
        onSelectTemplate={() => {}}
      />,
    );

    activateTab('通用助手 (37)');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /通用角色 35/ })).toBeInTheDocument();
    });
    const grid = screen.getByTestId('assistant-role-picker-general-grid');
    expect(grid).toBeInTheDocument();
    expect(grid.className).toContain('sm:grid-cols-2');
    expect(grid.getAttribute('style') ?? '').not.toContain('grid-template-columns');
  });

  it('1000+ 通用角色时只渲染虚拟窗口内的卡片', async () => {
    virtualWindowRef.current = { startIndex: 0, endIndex: 2 };
    const featuredDefaultTemplate: AssistantPreset = {
      id: '__builtin_default_role__',
      scenario: 'general',
      name: '默认助手',
      prompt: 'default prompt',
      description: '默认卡片',
      iconId: 'bot',
    };
    const massiveGeneralTemplates: AssistantPreset[] = Array.from({ length: 1200 }, (_, index) => ({
      id: `general-virtual-${index}`,
      scenario: 'general',
      name: `虚拟角色 ${index}`,
      prompt: `general prompt ${index}`,
      description: `通用角色 ${index}`,
      iconId: 'search',
      tags: ['研究'],
    }));
    const massiveSections: AssistantPresetSection[] = [
      {
        key: 'browser',
        title: '浏览器场景',
        categories: ['解读', '研究', '提取', '执行'],
        presets: templates.filter((item) => item.scenario === 'browser'),
      },
      {
        key: 'general',
        title: '通用助手',
        categories: ['研究'],
        presets: massiveGeneralTemplates,
      },
    ];

    render(
      <AssistantRolePickerDialog
        open
        templates={[featuredDefaultTemplate, ...templates.filter((item) => item.scenario === 'browser'), ...massiveGeneralTemplates]}
        sections={massiveSections}
        onClose={() => {}}
        onSelectTemplate={() => {}}
      />,
    );

    activateTab('通用助手 (1201)');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /默认助手/ })).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /虚拟角色/ })).toHaveLength(2);
      expect(screen.queryByRole('button', { name: /虚拟角色 10/ })).not.toBeInTheDocument();
    });
  });
});
