/**
 * 说明：`useQuickPanelMenus` 组件模块。
 *
 * 职责：
 * - 承载 `useQuickPanelMenus` 相关的当前文件实现与模块边界；
 * - 对外暴露 `useQuickPanelMenus` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useMemo } from 'react';
import { AtSign, BotMessageSquare, Hammer, Plus, Settings2, Sparkles, X, Zap } from 'lucide-react';

import { ProviderIcon } from '@/components/ui/ProviderIcon';
import { WebSearchProviderIcon } from '@/components/icons/webSearchProviders';
import type { QuickPhrase } from '@/lib/quick-phrases/phrase-store';
import { defaultConversationModelFilter, isVisionModelLike } from '@/lib/ai/model-filters';
import { pickProviderUiMeta } from '@/lib/ai/provider-ui-meta';
import {
  createAutoMcpServerSelection,
  createDisabledMcpServerSelection,
  createManualMcpServerSelection,
} from '@/lib/mcp/selection';
import {
  isWebSearchProviderUsable,
  type WebSearchProviderAvailabilityKind,
  WEB_SEARCH_PROVIDER_REGISTRY,
} from '@/lib/web-search/provider-registry';

import type {
  QuickPanelItem,
  QuickPanelMenu,
  QuickPanelSlashCommand,
  TranslateFn,
  UseQuickPanelControllerOptions,
} from './types';

type UseQuickPanelMenusParams = Pick<
  UseQuickPanelControllerOptions,
  | 'attachmentsHaveImage'
  | 'models'
  | 'providers'
  | 'onOpenModelManager'
  | 'canBindAssistant'
  | 'canBuiltinWebSearch'
  | 'builtinWebSearchEnabled'
  | 'selectedWebSearchProviderId'
  | 'webSearchSettings'
  | 'onToggleBuiltinWebSearch'
  | 'onSelectExternalWebSearchProvider'
  | 'onOpenWebSearchSettings'
  | 'onOpenNativeWebSearchSettings'
  | 'enabledMcpServers'
  | 'mcpSettingsConfig'
  | 'activeMcpSelection'
  | 'setActiveMcpSelection'
  | 'onOpenMcpSettings'
  | 'assistantRegularPhrases'
  | 'onOpenQuickPhraseCreator'
> & {
  phrases: QuickPhrase[];
  slashCommands: QuickPanelSlashCommand[];
  mentionModels: string[];
  manualMcpServerIds: string[];
  toggleMentionModel: (modelId: string) => void;
  t: TranslateFn;
};

/**
 * 导出 Hook：`useQuickPanelMenus`。
 *
 * @remarks
 * 对外暴露可复用的状态、派生值或副作用封装，调用方应遵守 Hook 调用约束。
 */
export function useQuickPanelMenus({
  attachmentsHaveImage,
  models,
  providers,
  onOpenModelManager,
  canBindAssistant,
  canBuiltinWebSearch,
  builtinWebSearchEnabled,
  selectedWebSearchProviderId,
  webSearchSettings,
  onToggleBuiltinWebSearch,
  onSelectExternalWebSearchProvider,
  onOpenWebSearchSettings,
  onOpenNativeWebSearchSettings,
  enabledMcpServers,
  mcpSettingsConfig,
  activeMcpSelection,
  setActiveMcpSelection,
  onOpenMcpSettings,
  assistantRegularPhrases = [],
  onOpenQuickPhraseCreator,
  phrases,
  slashCommands,
  mentionModels,
  manualMcpServerIds,
  toggleMentionModel,
  t,
}: UseQuickPanelMenusParams) {
  const providerMap = useMemo(
    () => new Map((providers ?? []).map((provider) => [provider.id, provider])),
    [providers],
  );

  const visibleExternalWebSearchProviders = useMemo(() => {
    return WEB_SEARCH_PROVIDER_REGISTRY
      .filter((provider) => isWebSearchProviderUsable(provider.id, webSearchSettings))
      .map((provider) => ({ ...provider, label: t(provider.labelKey) }));
  }, [t, webSearchSettings]);

  const quickRootMenu = useMemo<QuickPanelMenu>(() => {
    const commandItems: QuickPanelItem[] = slashCommands.map((command) => ({
      id: `cmd:${command.id}`,
      kind: 'action',
      name: command.name,
      description: command.description,
      action: command.action,
    }));

    const assistantPhraseItems: QuickPanelItem[] = assistantRegularPhrases.map((phrase) => ({
      id: `assistant-phrase:${phrase.id}`,
      kind: 'action',
      name: phrase.title,
      description: phrase.content,
      sectionKey: 'assistant',
      sectionLabel: t('quickPhrase.assistantSection'),
      icon: <BotMessageSquare className="h-4 w-4" />,
      insertText: phrase.content,
    }));

    const globalPhraseItems: QuickPanelItem[] = phrases.map((phrase) => ({
      id: `global-phrase:${phrase.id}`,
      kind: 'action',
      name: phrase.title,
      description: phrase.content,
      sectionKey: 'global',
      sectionLabel: t('quickPhrase.globalSection'),
      icon: <Zap className="h-4 w-4" />,
      insertText: phrase.content,
    }));

    const phraseItems: QuickPanelItem[] = [
      ...assistantPhraseItems,
      ...globalPhraseItems,
      {
        id: 'phrase:add',
        kind: 'action',
        name: t('quickPhrase.add'),
        description: t('quickPhrase.addFromInputDesc'),
        icon: <Plus className="h-4 w-4" />,
        presentation: 'settings',
        action: () => onOpenQuickPhraseCreator?.(),
      },
    ];

    const rootItems: QuickPanelItem[] = [];
    if (commandItems.length > 0) rootItems.push(...commandItems);
    rootItems.push({
      id: 'menu:phrases',
      kind: 'menu',
      name: t('chat.qp.phrases'),
      description: t('chat.qp.phrasesDesc'),
      icon: <Zap className="h-4 w-4" />,
      menu: {
        id: 'phrases',
        title: t('chat.qp.phrases'),
        placeholderLabel: t('chat.qp.phrases'),
        emptyTitle: t('search.noResults'),
        emptyDesc: t('chat.qp.phrasesDesc'),
        items: phraseItems,
      },
      children: phraseItems,
    });

    return {
      id: 'root',
      title: t('chat.qp.root'),
      subtitle: t('chat.qp.root'),
      placeholderLabel: t('chat.qp.root'),
      items: rootItems,
    };
  }, [assistantRegularPhrases, onOpenQuickPhraseCreator, phrases, slashCommands, t]);

  const phrasesQuickMenu = useMemo<QuickPanelMenu>(() => {
    const assistantItems: QuickPanelItem[] = assistantRegularPhrases.map((phrase) => ({
      id: `assistant-phrase:${phrase.id}`,
      kind: 'action',
      name: phrase.title,
      description: phrase.content,
      sectionKey: 'assistant',
      sectionLabel: t('quickPhrase.assistantSection'),
      icon: <BotMessageSquare className="h-4 w-4" />,
      insertText: phrase.content,
    }));

    const globalItems: QuickPanelItem[] = phrases.map((phrase) => ({
      id: `global-phrase:${phrase.id}`,
      kind: 'action',
      name: phrase.title,
      description: phrase.content,
      sectionKey: 'global',
      sectionLabel: t('quickPhrase.globalSection'),
      icon: <Zap className="h-4 w-4" />,
      insertText: phrase.content,
    }));

    return {
      id: 'phrases-root',
      title: t('quickPhrase.title'),
      subtitle: t('quickPhrase.hint'),
      headerIcon: <Zap className="h-4 w-4" />,
      placeholderLabel: t('quickPhrase.title'),
      emptyTitle: t('quickPhrase.empty'),
      emptyDesc: t('quickPhrase.addFromInputDesc'),
      items: [
        ...assistantItems,
        ...globalItems,
        {
          id: 'phrase:add',
          kind: 'action',
          name: t('quickPhrase.add'),
          description: t('quickPhrase.addFromInputDesc'),
          icon: <Plus className="h-4 w-4" />,
          presentation: 'settings',
          action: () => onOpenQuickPhraseCreator?.(),
        },
      ],
    };
  }, [assistantRegularPhrases, onOpenQuickPhraseCreator, phrases, t]);

  const mentionModelFilter = useCallback((model: (typeof models)[number]) => {
    if (!defaultConversationModelFilter(model)) return false;
    if (!attachmentsHaveImage) return true;
    return isVisionModelLike(model);
  }, [attachmentsHaveImage]);

  const mentionQuickMenu = useMemo<QuickPanelMenu>(() => {
    const items: QuickPanelItem[] = [
      {
        id: 'mention:clear',
        kind: 'action',
        name: t('chat.clear'),
        description: t('modelSelect.clear'),
        icon: <X className="h-4 w-4" />,
        alwaysVisible: true,
        keepOpen: true,
        presentation: 'clear',
        action: () => {
          toggleMentionModel('__clear__');
        },
      },
    ];

    const selectedSet = new Set(mentionModels);
    const visibleModels = models.filter(mentionModelFilter);

    for (const model of visibleModels) {
      const provider = providerMap.get(model.providerId);
      const providerUi = pickProviderUiMeta(model.providerId);
      items.push({
        id: `mention:model:${model.id}`,
        kind: 'action',
        name: model.name,
        description: model.providerName,
        icon: (
          <ProviderIcon
            providerId={model.providerId}
            customLogo={provider?.logo}
            fallbackIcon={providerUi.icon}
            fallbackColor={providerUi.color}
            size="sm"
          />
        ),
        selected: selectedSet.has(model.id),
        keepOpen: true,
        action: () => toggleMentionModel(model.id),
      });
    }

    if (onOpenModelManager) {
      items.push({
        id: 'mention:manage',
        kind: 'action',
        name: t('modelSelect.manageModels'),
        description: t('settings.title'),
        icon: <Settings2 className="h-4 w-4" />,
        presentation: 'settings',
        action: () => onOpenModelManager(),
      });
    }

    return {
      id: 'mention-root',
      title: t('modelSelect.title'),
      subtitle: t('modelSelect.title'),
      headerIcon: <AtSign className="h-4 w-4" />,
      placeholderLabel: t('modelSelect.title'),
      emptyTitle: t('search.noResults'),
      emptyDesc: t('modelSelect.emptyDesc'),
      items,
    };
  }, [mentionModelFilter, mentionModels, models, onOpenModelManager, providerMap, t, toggleMentionModel]);

  const renderKindSuffix = useCallback((kind: WebSearchProviderAvailabilityKind) => {
    const label =
      kind === 'free'
        ? t('chat.webSearchProviderFree')
        : kind === 'url'
          ? t('chat.webSearchProviderUrl')
          : t('chat.webSearchProviderApiKey');

    return (
      <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
        {label}
      </span>
    );
  }, [t]);

  const webSearchQuickMenu = useMemo<QuickPanelMenu>(() => {
    const items: QuickPanelItem[] = [];

    if (canBindAssistant && canBuiltinWebSearch) {
      items.push({
        id: 'websearch:builtin',
        kind: 'action',
        name: t('chat.webSearchBuiltinLabel'),
        description: t('chat.webSearchBuiltinDesc'),
        sectionKey: 'builtin',
        sectionLabel: t('chat.webSearchBuiltinTitle'),
        icon: <WebSearchProviderIcon className="h-4 w-4" />,
        selected: builtinWebSearchEnabled,
        action: () => onToggleBuiltinWebSearch(),
      });

      if (onOpenNativeWebSearchSettings) {
        items.push({
          id: 'websearch:builtin-settings',
          kind: 'action',
          name: t('chat.webSearchBuiltinSettings'),
          description: t('chat.webSearchBuiltinSettingsDesc'),
          sectionKey: 'builtin',
          sectionLabel: t('chat.webSearchBuiltinTitle'),
          icon: <Settings2 className="h-4 w-4" />,
          presentation: 'settings',
          action: () => onOpenNativeWebSearchSettings(),
        });
      }
    }

    for (const provider of visibleExternalWebSearchProviders) {
      items.push({
        id: `websearch:${provider.id}`,
        kind: 'action',
        name: provider.label,
        description:
          provider.kind === 'free'
            ? t('chat.webSearchProviderFree')
            : provider.kind === 'url'
              ? t('chat.webSearchProviderUrl')
              : t('chat.webSearchProviderApiKey'),
        sectionKey: 'provider',
        sectionLabel: t('chat.webSearchProviderTitle'),
        icon: <WebSearchProviderIcon pid={provider.id} className="h-4 w-4" />,
        suffix: renderKindSuffix(provider.kind),
        selected: selectedWebSearchProviderId === provider.id,
        action: () => onSelectExternalWebSearchProvider(provider.id),
      });
    }

    if (onOpenWebSearchSettings) {
      items.push({
        id: 'websearch:settings',
        kind: 'action',
        name: t('chat.openWebSearchSettings'),
        description: t('settings.title'),
        icon: <Settings2 className="h-4 w-4" />,
        presentation: 'settings',
        action: () => onOpenWebSearchSettings(),
      });
    }

    return {
      id: 'web-search-root',
      title: t('chat.webSearch'),
      subtitle: t('chat.webSearch'),
      headerIcon: <WebSearchProviderIcon pid={selectedWebSearchProviderId} className="h-4 w-4" />,
      placeholderLabel: t('chat.webSearch'),
      emptyTitle: canBindAssistant ? t('chat.webSearchUnavailable') : t('chat.webSearchNeedAssistant'),
      emptyDesc: canBindAssistant ? t('chat.webSearchAutoHint') : t('chat.webSearchNeedAssistant'),
      items,
    };
  }, [
    builtinWebSearchEnabled,
    canBindAssistant,
    canBuiltinWebSearch,
    onOpenWebSearchSettings,
    onOpenNativeWebSearchSettings,
    onSelectExternalWebSearchProvider,
    onToggleBuiltinWebSearch,
    renderKindSuffix,
    selectedWebSearchProviderId,
    t,
    visibleExternalWebSearchProviders,
  ]);

  const mcpManualMenu = useMemo<QuickPanelMenu>(() => {
    const selectedSet = new Set(manualMcpServerIds);
    const items: QuickPanelItem[] = enabledMcpServers.map((server) => ({
      id: `mcp:server:${server.id}`,
      kind: 'action',
      name: server.name,
      description: server.url || '',
      icon: <Hammer className="h-4 w-4" />,
      selected: selectedSet.has(server.id),
      keepOpen: true,
      action: () => {
        const next = new Set(selectedSet);
        if (next.has(server.id)) next.delete(server.id);
        else next.add(server.id);
        setActiveMcpSelection(createManualMcpServerSelection(Array.from(next)));
      },
    }));

    if (onOpenMcpSettings) {
      items.push({
        id: 'mcp:settings',
        kind: 'action',
        name: t('mcpBridgePanel.title'),
        description: t('settings.title'),
        icon: <Settings2 className="h-4 w-4" />,
        presentation: 'settings',
        action: () => onOpenMcpSettings(),
      });
    }

    return {
      id: 'mcp-manual',
      title: t('mcpSelection.mcpServers'),
      subtitle: t('mcpSelection.mcpServers'),
      headerIcon: <Hammer className="h-4 w-4" />,
      placeholderLabel: t('mcpSelection.mcpServers'),
      emptyTitle: t('mcpSelection.noMcpServers'),
      emptyDesc: onOpenMcpSettings ? t('settings.title') : t('mcpSelection.mcpModeDesc'),
      items,
    };
  }, [enabledMcpServers, manualMcpServerIds, onOpenMcpSettings, setActiveMcpSelection, t]);

  const mcpQuickMenu = useMemo<QuickPanelMenu>(() => {
    const items: QuickPanelItem[] = [
      {
        id: 'mcp:disabled',
        kind: 'action',
        name: t('mcpSelection.mcpModes.disabled'),
        description: t('mcpSelection.mcpModeDesc'),
        icon: <X className="h-4 w-4" />,
        selected: activeMcpSelection.mode === 'disabled',
        action: () => setActiveMcpSelection(createDisabledMcpServerSelection()),
      },
      {
        id: 'mcp:auto',
        kind: 'action',
        name: t('mcpSelection.mcpModes.auto'),
        description: t('mcpSelection.mcpModeDesc'),
        icon: <Sparkles className="h-4 w-4" />,
        selected: activeMcpSelection.mode === 'auto',
        action: () => setActiveMcpSelection(createAutoMcpServerSelection()),
      },
      {
        id: 'mcp:manual',
        kind: 'menu',
        name: t('mcpSelection.mcpModes.manual'),
        description: t('mcpSelection.mcpServers'),
        icon: <Hammer className="h-4 w-4" />,
        selected: activeMcpSelection.mode === 'manual',
        menu: mcpManualMenu,
        children: mcpManualMenu.items,
      },
    ];

    if (mcpSettingsConfig && !mcpSettingsConfig.chatToolsEnabled && onOpenMcpSettings) {
      items.push({
        id: 'mcp:settings',
        kind: 'action',
        name: t('mcpBridgePanel.title'),
        description: t('mcpSelection.mcpModeDesc'),
        icon: <Settings2 className="h-4 w-4" />,
        presentation: 'settings',
        action: () => onOpenMcpSettings(),
      });
    }

    return {
      id: 'mcp-root',
      title: t('mcpBridgePanel.title'),
      subtitle: t('mcpSelection.mcpServers'),
      headerIcon: <Hammer className="h-4 w-4" />,
      placeholderLabel: t('mcpSelection.mcpServers'),
      emptyTitle: t('mcpSelection.noMcpServers'),
      emptyDesc: t('mcpSelection.mcpModeDesc'),
      items,
    };
  }, [activeMcpSelection.mode, mcpSettingsConfig, mcpManualMenu, onOpenMcpSettings, setActiveMcpSelection, t]);

  return {
    quickRootMenu,
    mentionQuickMenu,
    webSearchQuickMenu,
    mcpQuickMenu,
    phrasesQuickMenu,
  };
}
