/**
 * 说明：`useModelManagerPanelController` 组件模块。
 *
 * 职责：
 * - 承载 `useModelManagerPanelController` 相关的当前文件实现与模块边界；
 * - 对外暴露 `useModelManagerPanelController`、`ModelManagerPanelController` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { useModelManagerApiKeys } from "@/components/chat/settings/model-manager/useModelManagerApiKeys";
import { useModelManagerHealth } from "@/components/chat/settings/model-manager/useModelManagerHealth";
import { useModelManagerCatalog } from "./useModelManagerCatalog";
import { useModelManagerHeadersDialog } from "./useModelManagerHeadersDialog";
import { useModelManagerModelDialog } from "./useModelManagerModelDialog";
import { useModelManagerProviderDialog } from "./useModelManagerProviderDialog";
import { useModelManagerProvidersState } from "./useModelManagerProvidersState";

/**
 * 导出 Hook：`useModelManagerPanelController`。
 *
 * @remarks
 * 对外暴露可复用的状态、派生值或副作用封装，调用方应遵守 Hook 调用约束。
 */
export function useModelManagerPanelController() {
  const { t } = useTranslation();
  const { confirm, ConfirmDialogPortal } = useConfirmDialog();
  const providersState = useModelManagerProvidersState(t);
  const {
    apiKeysForUi,
    buildResolvedRegistryView,
    getProviderDisplayName,
    getResolvedProviderHostPatterns,
    persistProvidersNow,
    providers,
    resolveModelView,
    resolveSystemModelMeta,
    selected,
    updateProvider,
  } = providersState;

  const health = useModelManagerHealth({
    apiKeysForUi,
    getResolvedProviderHostPatterns,
    persistProvidersNow,
    providers,
    selected,
    t,
  });

  const apiKeys = useModelManagerApiKeys({
    apiKeyCheckModelId: health.apiKeyCheckModelId,
    apiKeysForUi,
    isAnyApiKeyChecking: health.isAnyApiKeyChecking,
    resetApiKeyHealthState: health.resetApiKeyHealthState,
    retainApiKeyConnectivity: health.retainApiKeyConnectivity,
    selected,
    setApiKeyCheckModelId: health.setApiKeyCheckModelId,
    t,
    updateProvider,
  });

  const headersDialog = useModelManagerHeadersDialog({ selected, t, updateProvider });
  const providerDialog = useModelManagerProviderDialog({
    commitProviders: providersState.commitProviders,
    confirm,
    getProviderDisplayName,
    providers,
    selectedId: providersState.selectedId,
    setSelectedId: providersState.setSelectedId,
    t,
    updateProvider,
  });
  const modelDialog = useModelManagerModelDialog({
    buildResolvedRegistryView,
    getProviderDisplayName,
    resolveModelView,
    resolveSystemModelMeta,
    selected,
    t,
    updateProvider,
  });
  const catalog = useModelManagerCatalog({
    getProviderDisplayName,
    isModelCatalogSupported: providersState.isModelCatalogSupported,
    resolveModelView,
    selected,
    t,
    updateProvider,
  });

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = useCallback((group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }, []);

  return {
    ConfirmDialogPortal,
    apiKeys,
    catalog,
    collapsedGroups,
    headersDialog,
    health,
    modelDialog,
    providerDialog,
    providersState,
    t,
    toggleGroup,
  };
}

/** 导出类型：`ModelManagerPanelController`。 */
export type ModelManagerPanelController = ReturnType<typeof useModelManagerPanelController>;
