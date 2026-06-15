/**
 * 说明：`useSidebarPreferences` 页面模块。
 *
 * 职责：
 * - 承载 `useSidebarPreferences` 相关的当前文件实现与模块边界；
 * - 对外暴露 `useSidebarPreferences` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useEffect, useState } from 'react';

import { loadDisplaySettings, subscribeDisplaySettingsChange, updateDisplaySettings } from '@/lib/display-settings';

type SidebarTab = 'assistants' | 'topics';
type SidebarPosition = 'left' | 'right';

interface UseSidebarPreferencesResult {
  readonly clickAssistantToShowTopic: boolean;
  readonly focusAssistantTab: () => void;
  readonly focusTopicTab: () => void;
  readonly handleChangeSidebarTab: (tab: SidebarTab) => void;
  readonly handleToggleSidebarCollapse: () => void;
  readonly sidebarCollapsed: boolean;
  readonly sidebarPosition: SidebarPosition;
  readonly sidebarTab: SidebarTab;
}

/**
 * 导出 Hook：`useSidebarPreferences`。
 *
 * @remarks
 * 对外暴露可复用的状态、派生值或副作用封装，调用方应遵守 Hook 调用约束。
 */
export function useSidebarPreferences(): UseSidebarPreferencesResult {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => loadDisplaySettings().sidebarCollapsed);
  const [sidebarPosition, setSidebarPosition] = useState<SidebarPosition>(() => loadDisplaySettings().sidebarPosition);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>(() => loadDisplaySettings().sidebarTab);
  const [clickAssistantToShowTopic, setClickAssistantToShowTopic] = useState(() => loadDisplaySettings().clickAssistantToShowTopic);

  useEffect(() => {
    return subscribeDisplaySettingsChange(() => {
      const next = loadDisplaySettings();
      setSidebarCollapsed(next.sidebarCollapsed);
      setSidebarPosition(next.sidebarPosition);
      setSidebarTab(next.sidebarTab);
      setClickAssistantToShowTopic(next.clickAssistantToShowTopic);
    });
  }, []);

  const focusAssistantTab = useCallback(() => {
    setSidebarCollapsed(false);
    setSidebarTab('assistants');
    updateDisplaySettings({
      sidebarCollapsed: false,
      sidebarTab: 'assistants',
    });
  }, []);

  const focusTopicTab = useCallback(() => {
    setSidebarCollapsed(false);
    setSidebarTab('topics');
    updateDisplaySettings({
      sidebarCollapsed: false,
      sidebarTab: 'topics',
    });
  }, []);

  const handleChangeSidebarTab = useCallback((tab: SidebarTab) => {
    if (tab === 'assistants') {
      focusAssistantTab();
      return;
    }
    focusTopicTab();
  }, [focusAssistantTab, focusTopicTab]);

  const handleToggleSidebarCollapse = useCallback(() => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    updateDisplaySettings({ sidebarCollapsed: next });
  }, [sidebarCollapsed]);

  return {
    clickAssistantToShowTopic,
    focusAssistantTab,
    focusTopicTab,
    handleChangeSidebarTab,
    handleToggleSidebarCollapse,
    sidebarCollapsed,
    sidebarPosition,
    sidebarTab,
  };
}
