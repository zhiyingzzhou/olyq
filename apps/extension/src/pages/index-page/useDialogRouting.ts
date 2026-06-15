/**
 * 说明：`useDialogRouting` 页面模块。
 *
 * 职责：
 * - 承载 `useDialogRouting` 相关的当前文件实现与模块边界；
 * - 对外暴露 `useDialogRouting` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import type { NavigateFunction } from 'react-router-dom';

import type { DialogName } from '@/hooks/useDialogState';
import type { LaunchpadTarget } from '@/components/launchpad/LaunchpadDialog';
import { loadDisplaySettings } from '@/lib/display-settings';

interface UseDialogRoutingOptions {
  readonly close: (name: DialogName) => void;
  readonly navigate: NavigateFunction;
  readonly open: (name: DialogName) => void;
  /** 打开扩展内的助手商店承载面，并负责切到助手侧栏。 */
  readonly openAssistantStore: () => void;
}

interface UseDialogRoutingResult {
  readonly extSettingsTab: string;
  readonly focusChat: () => void;
  readonly openLaunchpadTarget: (target: LaunchpadTarget) => void;
  readonly openExtensionSettings: (tab?: string) => void;
  readonly openMcpSettings: () => void;
  readonly openMemorySettings: () => void;
  readonly openModelManager: () => void;
  readonly openWebSearchSettings: () => void;
  readonly setExtSettingsTab: Dispatch<SetStateAction<string>>;
}

/**
 * 导出 Hook：`useDialogRouting`。
 *
 * @remarks
 * 对外暴露可复用的状态、派生值或副作用封装，调用方应遵守 Hook 调用约束。
 */
export function useDialogRouting({
  close,
  navigate,
  open,
  openAssistantStore,
}: UseDialogRoutingOptions): UseDialogRoutingResult {
  const [extSettingsTab, setExtSettingsTab] = useState('appearance');

  const openExtensionSettings = useCallback((tab = 'appearance') => {
    const targetTab = String(tab || '').trim() || 'appearance';
    setExtSettingsTab(targetTab);
    if (loadDisplaySettings().extensionSettingsOpenMode === 'workspace') {
      close('showExtSettings');
      navigate(`/settings?tab=${encodeURIComponent(targetTab)}`);
      return;
    }
    open('showExtSettings');
  }, [close, navigate, open]);

  const openModelManager = useCallback(() => {
    openExtensionSettings('models');
  }, [openExtensionSettings]);

  const openWebSearchSettings = useCallback(() => {
    openExtensionSettings('web-search');
  }, [openExtensionSettings]);

  const openMcpSettings = useCallback(() => {
    openExtensionSettings('mcp');
  }, [openExtensionSettings]);

  const openMemorySettings = useCallback(() => {
    openExtensionSettings('memory');
  }, [openExtensionSettings]);

  const focusChat = useCallback(() => {
    close('showTranslation');
    close('showLaunchpad');
    close('showFiles');
  }, [close]);

  const openLaunchpadTarget = useCallback((target: LaunchpadTarget) => {
    if (target === 'store') {
      openAssistantStore();
      return;
    }
    if (target === 'translate') {
      open('showTranslation');
      return;
    }
    if (target === 'files') {
      open('showFiles');
      return;
    }
    if (target === 'paint') {
      navigate('/paint');
    }
  }, [navigate, open, openAssistantStore]);

  return {
    extSettingsTab,
    focusChat,
    openExtensionSettings,
    openLaunchpadTarget,
    openMcpSettings,
    openMemorySettings,
    openModelManager,
    openWebSearchSettings,
    setExtSettingsTab,
  };
}
