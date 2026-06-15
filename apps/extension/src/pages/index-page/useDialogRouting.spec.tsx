/**
 * 说明：`useDialogRouting.spec` 页面模块。
 *
 * 职责：
 * - 承载 `useDialogRouting` 相关回归测试，守住启动台路由分发语义；
 * - 覆盖“助手商店”入口与现有 `translate / files / paint` 分支，避免行为漂移。
 *
 * 边界：
 * - 本文件只验证页面级路由编排，不扩展到完整 IndexPageView store 依赖装配。
 */
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AssistantPresetSection } from '@/data/role-templates';
import { useDialogState } from '@/hooks/useDialogState';
import type { AssistantPreset } from '@/types/assistant';

import { AssistantStoreDialog } from '@/components/chat/AssistantStoreDialog';
import { LaunchpadDialog } from '@/components/launchpad/LaunchpadDialog';
import { useDialogRouting } from './useDialogRouting';

const { displaySettingsOpenMode } = vi.hoisted(() => ({
  displaySettingsOpenMode: { current: 'dialog' as 'dialog' | 'workspace' },
}));

vi.mock('@/lib/display-settings', () => ({
  loadDisplaySettings: vi.fn(() => ({
    sidebarPosition: 'left',
    sidebarCollapsed: false,
    sidebarTab: 'topics',
    clickAssistantToShowTopic: true,
    assistantsTabSortType: 'list',
    pinTopicsToTop: false,
    extensionSettingsOpenMode: displaySettingsOpenMode.current,
  })),
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
          'launchpad.title': '启动台',
          'launchpad.description': '快速进入常用模块。',
          'launchpad.sections.apps': '模块',
          'launchpad.items.store': '助手商店',
          'launchpad.items.translate': '翻译',
          'launchpad.items.files': '文件',
          'launchpad.items.paint': '绘画',
          'launchpad.hints.store': '浏览/管理 AI 助手',
          'launchpad.hints.translate': '快速翻译与润色',
          'launchpad.hints.files': '管理附件与导出文件',
          'launchpad.hints.paint': '文生图 / 图生图工作台',
          'assistant.store.title': '助手商店',
          'assistant.store.description': '商店说明',
          'assistant.store.library': '预设分组',
          'assistant.store.mine': '我的预设',
          'assistant.store.browser': '浏览器场景',
          'assistant.store.general': '通用助手',
          'assistant.store.searchPlaceholder': '搜索全部预设、描述、提示词或标签…',
          'assistant.store.import': '导入',
          'assistant.store.manage': '管理',
          'assistant.store.createPreset': '新增预设',
          'assistant.store.searchResults': '搜索结果',
          'assistant.store.sectionSummary': '当前结果 1 条',
          'assistant.store.searchSummary': '全库命中 1 条',
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
          'pageContext.profileCatalog.minimalPage.title': '轻量页面',
          'pageContext.profileCatalog.minimalPage.description': 'desc',
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
];

const sections: AssistantPresetSection[] = [
  {
    key: 'browser',
    title: '浏览器场景',
    categories: ['解读'],
    presets: templates.filter((item) => item.scenario === 'browser'),
  },
  {
    key: 'general',
    title: '通用助手',
    categories: ['写作'],
    presets: templates.filter((item) => item.id === 'draft-writer'),
  },
];

const noopNavigate = (() => undefined) as NavigateFunction;

/**
 * 测试辅助组件：`LaunchpadStoreHarness`。
 *
 * @remarks
 * 复用真实 `LaunchpadDialog + useDialogRouting + AssistantStoreDialog`，
 * 验证启动台点击“助手商店”后的页面级交互收口结果。
 */
function LaunchpadStoreHarness() {
  const { dialogs, open, close } = useDialogState();
  const [sidebarTab, setSidebarTab] = useState<'assistants' | 'topics'>('topics');

  useEffect(() => {
    open('showLaunchpad');
  }, [open]);

  /**
   * 测试辅助函数：`openAssistantStore`。
   *
   * @remarks
 * 用于模拟页面层统一“打开助手商店”动作：
 * 先切到助手侧栏，再打开完整助手商店 overlay。
  */
  const openAssistantStore = () => {
    setSidebarTab('assistants');
    open('showAssistantStore');
  };

  const { openLaunchpadTarget } = useDialogRouting({
    close,
    navigate: noopNavigate,
    open,
    openAssistantStore,
  });

  return (
    <>
      <div data-testid="sidebar-tab">{sidebarTab}</div>
      <LaunchpadDialog
        open={dialogs.showLaunchpad}
        onClose={() => close('showLaunchpad')}
        onOpenTarget={openLaunchpadTarget}
      />
      <AssistantStoreDialog
        open={dialogs.showAssistantStore}
        builtinPresets={templates}
        userPresets={[]}
        presetSections={sections}
        onClose={() => close('showAssistantStore')}
        onCreateAssistantFromPreset={() => {}}
        onCreatePreset={() => ''}
        onUpdatePreset={() => {}}
        onDeletePresets={() => {}}
        onImportPresets={() => []}
        onExportPresets={() => []}
      />
    </>
  );
}

describe('useDialogRouting', () => {
  beforeEach(() => {
    displaySettingsOpenMode.current = 'dialog';
  });

  it('扩展设置默认 tab 已切到 appearance', () => {
    const close = vi.fn();
    const navigate = vi.fn() as unknown as NavigateFunction;
    const open = vi.fn();
    const openAssistantStore = vi.fn();

    const { result } = renderHook(() => useDialogRouting({
      close,
      navigate,
      open,
      openAssistantStore,
    }));

    expect(result.current.extSettingsTab).toBe('appearance');
  });

  it('设置打开方式为 dialog 时保持打开扩展设置弹窗', () => {
    const close = vi.fn();
    const navigate = vi.fn() as unknown as NavigateFunction;
    const open = vi.fn();
    const openAssistantStore = vi.fn();

    const { result } = renderHook(() => useDialogRouting({
      close,
      navigate,
      open,
      openAssistantStore,
    }));

    act(() => {
      result.current.openExtensionSettings('models');
    });

    expect(result.current.extSettingsTab).toBe('models');
    expect(open).toHaveBeenCalledWith('showExtSettings');
    expect(close).not.toHaveBeenCalledWith('showExtSettings');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('设置打开方式为 workspace 时导航到工作区设置路由并携带目标 tab', () => {
    displaySettingsOpenMode.current = 'workspace';
    const close = vi.fn();
    const navigate = vi.fn() as unknown as NavigateFunction;
    const open = vi.fn();
    const openAssistantStore = vi.fn();

    const { result } = renderHook(() => useDialogRouting({
      close,
      navigate,
      open,
      openAssistantStore,
    }));

    act(() => {
      result.current.openModelManager();
    });

    expect(result.current.extSettingsTab).toBe('models');
    expect(close).toHaveBeenCalledWith('showExtSettings');
    expect(navigate).toHaveBeenCalledWith('/settings?tab=models');
    expect(open).not.toHaveBeenCalledWith('showExtSettings');
  });

  it('store 分支会复用 openAssistantStore，不再只聚焦助手 tab', () => {
    const close = vi.fn();
    const navigate = vi.fn() as unknown as NavigateFunction;
    const open = vi.fn();
    const openAssistantStore = vi.fn();

    const { result } = renderHook(() => useDialogRouting({
      close,
      navigate,
      open,
      openAssistantStore,
    }));

    act(() => {
      result.current.openLaunchpadTarget('store');
    });

    expect(openAssistantStore).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('translate / files / paint 分支保持现有语义，不会误走助手商店回调', () => {
    const close = vi.fn();
    const navigate = vi.fn() as unknown as NavigateFunction;
    const open = vi.fn();
    const openAssistantStore = vi.fn();

    const { result } = renderHook(() => useDialogRouting({
      close,
      navigate,
      open,
      openAssistantStore,
    }));

    act(() => {
      result.current.openLaunchpadTarget('translate');
      result.current.openLaunchpadTarget('files');
      result.current.openLaunchpadTarget('paint');
    });

    expect(open).toHaveBeenNthCalledWith(1, 'showTranslation');
    expect(open).toHaveBeenNthCalledWith(2, 'showFiles');
    expect(navigate).toHaveBeenCalledWith('/paint');
    expect(openAssistantStore).not.toHaveBeenCalled();
  });

  it('点击启动台中的助手商店后会关闭启动台并打开助手商店弹窗', async () => {
    render(<LaunchpadStoreHarness />);

    expect(await screen.findByText('启动台')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /助手商店/ }));

    expect(await screen.findByText('助手商店')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-tab')).toHaveTextContent('assistants');
    await waitFor(() => {
      expect(screen.queryByText('启动台')).not.toBeInTheDocument();
    });
  });
});
