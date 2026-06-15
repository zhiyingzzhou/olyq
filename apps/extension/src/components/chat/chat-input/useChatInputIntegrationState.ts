/**
 * 说明：`useChatInputIntegrationState` 组件模块。
 *
 * 职责：
 * - 承载 `useChatInputIntegrationState` 相关的当前文件实现与模块边界；
 * - 对外暴露 `useChatInputIntegrationState` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAssistantStore } from '@/hooks/useAssistantStore';
import { toast } from '@/hooks/useToast';
import { isWebSearchModelLike } from '@/lib/ai/model-filters';
import { loadMcpSettingsConfig } from '@/lib/mcp/storage';
import { MCP_SERVERS_STORAGE_KEY, MCP_SETTINGS_STORAGE_KEY } from '@/lib/mcp/constants';
import { sanitizeMcpServerSelection, type McpServerSelection } from '@/lib/mcp/selection';
import { useMcpServersResource } from '@/lib/mcp/use-mcp-servers-resource';
import { getStorageAdapter } from '@/lib/storage/storage-adapter';
import { subscribeStoreReloadSignal } from '@/lib/storage/reload-signal';
import { getWebSearchNetworkHostMatchPatterns } from '@/lib/web-search/host-match-patterns';
import { resolveWebSearchProviderId } from '@/lib/web-search/provider-registry';
import { loadWebSearchSettings, subscribeWebSearchSettingsChange } from '@/lib/web-search/settings';
import type { WebSearchProviderId, WebSearchSettings } from '@/lib/web-search/types';
import type { ModelOption } from '@/hooks/useModelOptions';
import type { McpSettingsConfig } from '@/types/mcp';

interface UseChatInputIntegrationStateOptions {
  readonly assistantId?: string;
  readonly currentModel?: string;
  readonly models: ModelOption[];
  readonly mcpSelection?: McpServerSelection;
  readonly onChangeMcpSelection?: (selection: McpServerSelection) => void;
  readonly t: (key: string) => string;
}

/**
 * 导出 Hook：`useChatInputIntegrationState`。
 *
 * @remarks
 * 对外暴露可复用的状态、派生值或副作用封装，调用方应遵守 Hook 调用约束。
 */
export function useChatInputIntegrationState({
  assistantId,
  currentModel,
  models,
  mcpSelection,
  onChangeMcpSelection,
  t,
}: UseChatInputIntegrationStateOptions) {
  const assistant = useAssistantStore((state) => (assistantId ? state.getAssistant(assistantId) : null));
  const updateAssistantConfig = useAssistantStore((state) => state.updateAssistantConfig);
  /** 当前缓存的联网搜索设置快照。 */
  const [webSearchSettings, setWebSearchSettings] = useState<WebSearchSettings>(() => loadWebSearchSettings());
  /** 当前 MCP 全局设置快照。 */
  const [mcpSettingsConfig, setMcpSettingsConfig] = useState<McpSettingsConfig | null>(null);
  const mcpServersResource = useMcpServersResource(true);
  const reloadMcpServersResource = mcpServersResource.reload;

  useEffect(() => {
    /**
 * 内部函数变量：`reloadWebSearch`。
 *
 * @remarks
 * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
 */
// 联网搜索和 MCP 配置都可能被设置面板、云同步恢复等多个入口修改，因此统一监听回流。
    const reloadWebSearch = () => setWebSearchSettings(loadWebSearchSettings());
        /**
     * 内部函数变量：`reloadMcp`。
     *
     * @remarks
     * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
     */
    const reloadMcp = () => {
      void loadMcpSettingsConfig().then(setMcpSettingsConfig).catch(() => setMcpSettingsConfig(null));
      void reloadMcpServersResource();
    };

    reloadWebSearch();
    reloadMcp();

    const unsubscribeStorage = getStorageAdapter().onChange((changes) => {
      if (changes[MCP_SETTINGS_STORAGE_KEY] || changes[MCP_SERVERS_STORAGE_KEY]) {
        reloadMcp();
      }
    });
    const unsubscribeWebSearch = subscribeWebSearchSettingsChange(reloadWebSearch);
    const unsubscribeStoreReload = subscribeStoreReloadSignal(() => {
      reloadWebSearch();
      reloadMcp();
    });

    return () => {
      unsubscribeStorage();
      unsubscribeWebSearch();
      unsubscribeStoreReload();
    };
  }, [reloadMcpServersResource]);

  const enabledMcpServers = mcpServersResource.enabledServers;
  const activeMcpSelection = useMemo(() => sanitizeMcpServerSelection(mcpSelection, 'auto'), [mcpSelection]);

  /** 当前主模型对应的模型选项快照。 */
  const modelOption = useMemo(() => {
    const id = String(currentModel || '').trim();
    if (!id) return null;
    return models.find((model) => model.id === id) ?? null;
  }, [currentModel, models]);

  /** 当前是否具备“助手级设置”上下文。 */
  const canBindAssistant = Boolean(assistantId && assistant);
  /** 当前主模型是否支持内置联网搜索。 */
  const canBuiltinWebSearch = Boolean(modelOption && isWebSearchModelLike(modelOption));
  /** 当前助手绑定的外部联网搜索 Provider。 */
  const selectedWebSearchProviderId = canBindAssistant
    ? resolveWebSearchProviderId(assistant?.webSearchProviderId)
    : undefined;
  /** 当前联网搜索是否已激活。 */
  const webSearchActive = Boolean(canBindAssistant && ((assistant?.enableWebSearch && canBuiltinWebSearch) || assistant?.webSearchProviderId));
  /** 当前可用模型 ID 列表，用于翻译模型兜底。 */
  const availableModelIds = useMemo(() => models.map((model) => model.id), [models]);

  /**
   * 更新当前话题生效的 MCP 选择策略。
   *
   * 说明：
   * - 若上层显式提供 `onChangeMcpSelection`，优先回写到当前话题；
   * - 否则回退到绑定助手，沿用助手级 MCP 配置。
   */
  const setActiveMcpSelection = useCallback((next: McpServerSelection) => {
    if (onChangeMcpSelection) {
      onChangeMcpSelection(next);
      return;
    }
    if (!assistantId || !assistant) return;
    updateAssistantConfig(assistantId, { mcpSelection: next });
  }, [assistant, assistantId, onChangeMcpSelection, updateAssistantConfig]);

  /** 切换模型内置联网搜索开关。 */
  const toggleBuiltinWebSearch = useCallback(() => {
    if (!assistantId || !assistant || !canBuiltinWebSearch) return;
    updateAssistantConfig(assistantId, {
      webSearchProviderId: undefined,
      enableWebSearch: !assistant.enableWebSearch,
    });
  }, [assistant, assistantId, canBuiltinWebSearch, updateAssistantConfig]);

  /**
   * 选择或取消外部联网搜索 Provider。
   *
   * 说明：
   * - 选择前会校验 Provider URL 配置；网页访问权限已由 manifest 安装期声明；
   * - 外部 Provider 与模型内置联网互斥，启用外部后会显式关闭 `enableWebSearch`。
   */
  const selectExternalWebSearchProvider = useCallback((providerId: WebSearchProviderId) => {
    if (!assistantId || !assistant) return;
    void (async () => {
      const next = assistant.webSearchProviderId === providerId ? undefined : providerId;
      if (next) {
        try {
          getWebSearchNetworkHostMatchPatterns(next, webSearchSettings);
        } catch {
          toast.error(t('chat.webSearchUnavailable'));
          return;
        }
      }
      updateAssistantConfig(assistantId, {
        webSearchProviderId: next,
        enableWebSearch: false,
      });
    })();
  }, [assistant, assistantId, t, updateAssistantConfig, webSearchSettings]);

  return {
    activeMcpSelection,
    assistant,
    availableModelIds,
    canBindAssistant,
    canBuiltinWebSearch,
    enabledMcpServers,
    mcpSettingsConfig,
    mcpButtonActive: activeMcpSelection.mode !== 'disabled',
    modelOption,
    reloadMcpServersResource,
    selectedWebSearchProviderId,
    selectExternalWebSearchProvider,
    setActiveMcpSelection,
    toggleBuiltinWebSearch,
    updateAssistantConfig,
    webSearchActive,
    webSearchButtonTooltip: !canBindAssistant ? t('chat.webSearchNeedAssistant') : t('chat.webSearch'),
    webSearchSettings,
  };
}
