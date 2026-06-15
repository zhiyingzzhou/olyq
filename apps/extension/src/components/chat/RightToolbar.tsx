/**
 * 说明：`RightToolbar` 组件模块。
 *
 * 职责：
 * - 承载 `RightToolbar` 相关的当前文件实现与模块边界；
 * - 对外暴露 `RightToolbarProps`、`RightToolbar` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useTranslation } from 'react-i18next';
import {
  Settings, Eraser, Languages, GitCompare,
  MousePointerClick, Zap, FileDown, SlidersHorizontal,
  Search, LayoutGrid, Camera,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { useChatStore } from '@/hooks/useChatStore';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useModelOptions } from '@/hooks/useModelOptions';
import { useAssistantStore } from '@/hooks/useAssistantStore';
import { useChatSettingsStore } from '@/hooks/useChatSettingsStore';
import { ThemeToggle } from '@/components/chat/ThemeToggle';
import { confirmClearTopicMessages } from '@/components/chat/confirmClearTopicMessages';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ProviderIcon } from '@/components/ui/ProviderIcon';
import { pickProviderUiMeta } from '@/lib/ai/provider-ui-meta';
import { exportTopic } from '@/lib/export';
import { resolveAssistantTopic } from '@/lib/chat/topic-tree';
import { buildResolvedConversationContext, resolveTopicEffectiveModel } from '@/lib/chat/resolved-conversation';
import type { DialogState, DialogName } from '@/hooks/useDialogState';
import type { ResolvedConversationContext } from '@/types/chat';

/** 导出话题时允许选择的文档格式。 */
type ExportFormat = 'markdown' | 'html' | 'word';

/** 右侧工具条普通按钮动作的内部描述。 */
type ToolbarButtonAction = {
  /** 稳定动作 ID，用于列表渲染 key。 */
  readonly id: string;
  /** rail 按钮测试定位。 */
  readonly testId: string;
  /** 按钮的可访问名称。 */
  readonly label: string;
  /** tooltip 展示文案；禁用态可与可访问名称不同。 */
  readonly tooltip: string;
  /** 当前动作使用的 Lucide 图标。 */
  readonly icon: ComponentType<{ className?: string }>;
  /** 点击或选择时执行的受控回调。 */
  readonly onSelect: () => void;
  /** 是否禁用当前动作。 */
  readonly disabled?: boolean;
  /** 当前动作是否处于激活态。 */
  readonly active?: boolean;
  /** 激活态颜色是否使用 primary 语义。 */
  readonly activeTone?: 'accent' | 'primary';
};

/** 右侧工具条组件入参。 */
export interface RightToolbarProps {
  /** 页面级弹窗显隐状态，用于同步按钮高亮。 */
  dialogs: DialogState;
  /** 打开指定弹窗。 */
  open: (name: DialogName) => void;
  /** 通过页面路由层打开扩展设置入口。 */
  onOpenExtensionSettings: () => void;
  /** 切换指定弹窗开关。 */
  toggle: (name: DialogName) => void;
  /** 启动网页元素选择器。 */
  onStartElementPicker: () => void;
  /** 启动网页截图编辑器。 */
  onStartScreenshotEditor: () => void;
  /** 网页工具是否启用（划词助手/元素选择器等）；关闭时应禁用相关入口 */
  pageToolsEnabled?: boolean;
}

/**
 * 主聊天页右侧垂直工具条。
 *
 * 负责承载页面级快捷入口，包括：
 * - 话题参数、模型切换、导出与清空消息；
 * - 全局搜索、启动台、快捷短语、翻译等弹窗入口；
 * - 与网页工具相关的元素选择器入口。
 */
export function RightToolbar({
  dialogs,
  open,
  onOpenExtensionSettings,
  toggle,
  onStartElementPicker,
  onStartScreenshotEditor,
  pageToolsEnabled = true,
}: RightToolbarProps) {
  const { t } = useTranslation();
  const { confirm, ConfirmDialogPortal } = useConfirmDialog();
  const { providers, getModelShortLabel } = useModelOptions();

  const activeConversationKey = useChatStore((s) => s.activeConversationKey);
  const activeMessagesLoading = useChatStore((s) => s.activeMessagesLoading);
  const assistants = useAssistantStore((s) => s.assistants);
  const chatSettings = useChatSettingsStore((s) => s.settings);

  const resolvedConversation = resolveAssistantTopic(assistants, activeConversationKey);
  const hasResolvedTopic = Boolean(resolvedConversation && activeConversationKey);
  const activeTopicId = hasResolvedTopic ? activeConversationKey : null;
  const topicActionsDisabled = activeMessagesLoading;
  const activeModel = resolvedConversation
    ? resolveTopicEffectiveModel(resolvedConversation.topic, chatSettings)
    : '';

  const activeProviderId = String(activeModel || '').split('/')[0] || '';
  const activeProviderLogo = providers.find((p) => p.id === activeProviderId)?.logo;
  const activeProviderUi = pickProviderUiMeta(activeProviderId);
  const activeShortLabel = getModelShortLabel(activeModel);
  const gatedActionClass = topicActionsDisabled
    ? 'text-muted-foreground/40 cursor-not-allowed'
    : 'text-muted-foreground hover:bg-accent hover:text-foreground transition-colors';

  /**
   * 根据动作状态解析工具条图标按钮的视觉类。
   *
   * @param action - 当前按钮动作。
   * @returns 复用 Olyq 当前右侧工具条风格的 className。
   */
  const resolveToolbarButtonClassName = (action: ToolbarButtonAction) => {
    const activeClassName = action.activeTone === 'primary'
      ? 'bg-primary/10 text-primary'
      : 'bg-accent text-accent-foreground';
    const stateClassName = action.disabled
      ? 'text-muted-foreground/40 cursor-not-allowed'
      : action.active
        ? activeClassName
        : 'text-muted-foreground hover:bg-accent hover:text-foreground';
    return `w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${stateClassName}`;
  };

  /**
   * 渲染 rail 上的单个图标按钮。
   *
   * @param action - 当前按钮动作描述。
   * @returns 带 tooltip、可访问名称和稳定 test id 的按钮节点。
   */
  const renderToolbarButton = (action: ToolbarButtonAction) => {
    const Icon = action.icon;
    return (
      <Tooltip key={action.id}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={action.onSelect}
            data-testid={action.testId}
            disabled={action.disabled}
            aria-label={action.label}
            className={resolveToolbarButtonClassName(action)}
          >
            <Icon className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left"><p className="text-xs">{action.tooltip}</p></TooltipContent>
      </Tooltip>
    );
  };

  /**
   * 导出当前激活话题。
   *
   * 说明：
   * - 当前主聊天只会导出 topic，并先映射为 `TopicConversation` 契约；
   * - 若当前话题尚未加载完成，则直接跳过，避免导出不完整内容。
   *
   * @param format - 目标导出格式。
   */
  const exportActiveConversation = async (format: ExportFormat) => {
    const chat = useChatStore.getState();
    if (!chat.activeConversationKey || chat.activeMessagesLoading) return;

    const key = chat.activeConversationKey;
    const messages = Array.isArray(chat.activeMessages) ? chat.activeMessages : [];
    const settings = useChatSettingsStore.getState().settings;

    const resolved = resolveAssistantTopic(useAssistantStore.getState().assistants, key);
    if (!resolved) return;
    const { assistantId, topic, assistant } = resolved;

    // 话题聊天需要将 assistant 默认配置与 topic 元数据合并后再导出。
    const sess: ResolvedConversationContext = buildResolvedConversationContext({
      assistant,
      topic: { ...topic, assistantId },
      messages,
      settings,
    });
    await exportTopic(sess, format);
  };

  const topicSettingsAction: ToolbarButtonAction | null = hasResolvedTopic
    ? {
        id: 'topic-settings',
        testId: 'toolbar-topic-settings',
        label: t('topicSettings.title'),
        tooltip: t('topicSettings.title'),
        icon: SlidersHorizontal,
        onSelect: () => toggle('showSettings'),
        active: dialogs.showSettings,
        activeTone: 'primary',
      }
    : null;

  const clearMessagesAction: ToolbarButtonAction | null = hasResolvedTopic && activeTopicId
    ? {
        id: 'clear-messages',
        testId: 'toolbar-clear-messages',
        label: t('chat.clear'),
        tooltip: t('chat.clear'),
        icon: Eraser,
        onSelect: () => {
          void confirmClearTopicMessages({
            confirm,
            disabled: topicActionsDisabled,
            t,
            topicId: activeTopicId,
          });
        },
        disabled: topicActionsDisabled,
      }
    : null;

  const compareAction: ToolbarButtonAction | null = hasResolvedTopic
    ? {
        id: 'compare',
        testId: 'toolbar-compare',
        label: t('compare.title'),
        tooltip: t('compare.title'),
        icon: GitCompare,
        onSelect: () => open('showCompare'),
        active: dialogs.showCompare && !topicActionsDisabled,
        disabled: topicActionsDisabled,
      }
    : null;

  const globalSearchAction: ToolbarButtonAction = {
    id: 'global-search',
    testId: 'toolbar-global-search',
    label: t('search.globalTitle'),
    tooltip: t('search.globalTitle'),
    icon: Search,
    onSelect: () => open('showGlobalSearch'),
    active: dialogs.showGlobalSearch,
  };

  const launchpadAction: ToolbarButtonAction = {
    id: 'launchpad',
    testId: 'toolbar-launchpad',
    label: t('launchpad.title'),
    tooltip: t('launchpad.title'),
    icon: LayoutGrid,
    onSelect: () => open('showLaunchpad'),
    active: dialogs.showLaunchpad,
  };

  const elementPickerAction: ToolbarButtonAction = {
    id: 'element-picker',
    testId: 'toolbar-element-picker',
    label: t('elementPicker.title'),
    tooltip: pageToolsEnabled ? t('elementPicker.title') : t('sitePermissionsPanel.pageTools.disabledHint'),
    icon: MousePointerClick,
    onSelect: () => void onStartElementPicker(),
    disabled: !pageToolsEnabled,
  };

  const screenshotEditorAction: ToolbarButtonAction = {
    id: 'screenshot-editor',
    testId: 'toolbar-screenshot-editor',
    label: t('screenshotEditor.title'),
    tooltip: pageToolsEnabled ? t('screenshotEditor.title') : t('sitePermissionsPanel.pageTools.disabledHint'),
    icon: Camera,
    onSelect: () => void onStartScreenshotEditor(),
    disabled: !pageToolsEnabled,
  };

  const phrasesAction: ToolbarButtonAction = {
    id: 'phrases',
    testId: 'toolbar-phrases',
    label: t('quickPhrase.manageTitle'),
    tooltip: t('quickPhrase.manageTitle'),
    icon: Zap,
    onSelect: () => open('showPhrases'),
    active: dialogs.showPhrases,
  };

  const translationAction: ToolbarButtonAction = {
    id: 'translation',
    testId: 'toolbar-translation',
    label: t('translation.title'),
    tooltip: t('translation.title'),
    icon: Languages,
    onSelect: () => toggle('showTranslation'),
    active: dialogs.showTranslation,
  };

  const extensionSettingsAction: ToolbarButtonAction = {
    id: 'extension-settings',
    testId: 'toolbar-extension-settings',
    label: t('settings.title'),
    tooltip: t('settings.title'),
    icon: Settings,
    onSelect: onOpenExtensionSettings,
    active: dialogs.showExtSettings,
  };

  /**
   * 渲染导出格式菜单项。
   *
   * @param testIdPrefix - 测试定位前缀。
   * @returns 三种导出格式对应的菜单项。
   */
  const renderExportMenuItems = (testIdPrefix: string) => (
    <>
      <DropdownMenuItem data-testid={`${testIdPrefix}-markdown`} onClick={() => { void exportActiveConversation('markdown'); }}>
        {t('exportTopic.formatMarkdown')}
      </DropdownMenuItem>
      <DropdownMenuItem data-testid={`${testIdPrefix}-html`} onClick={() => { void exportActiveConversation('html'); }}>
        {t('exportTopic.formatHtml')}
      </DropdownMenuItem>
      <DropdownMenuItem data-testid={`${testIdPrefix}-word`} onClick={() => { void exportActiveConversation('word'); }}>
        {t('exportTopic.formatWord')}
      </DropdownMenuItem>
    </>
  );

  /** 渲染 rail 上的导出按钮。 */
  const renderExportToolbarButton = () => {
    if (!hasResolvedTopic) return null;
    return (
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                data-testid="toolbar-export-topic"
                disabled={topicActionsDisabled}
                aria-label={t('exportTopic.title')}
                className={`w-9 h-9 rounded-xl flex items-center justify-center ${gatedActionClass}`}
              >
                <FileDown className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="left"><p className="text-xs">{t('exportTopic.title')}</p></TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" side="left" className="w-36">
          {renderExportMenuItems('toolbar-export')}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  /** 渲染当前模型切换入口。 */
  const renderModelButton = () => {
    if (!hasResolvedTopic || !activeTopicId) return null;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="w-9">
            <button
              type="button"
              onClick={() => open('showModelPicker')}
              data-testid="toolbar-model-picker"
              className="relative w-9 h-9 p-0 border-0 bg-transparent hover:bg-accent rounded-xl flex items-center justify-center"
              aria-label={t('chat.switchModel')}
            >
              <ProviderIcon
                providerId={activeProviderId}
                customLogo={activeProviderLogo}
                fallbackIcon={activeProviderUi.icon}
                fallbackColor={activeProviderUi.color}
                size="sm"
              />
              <span
                className="absolute -bottom-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-background/80 border border-border/60 text-[10px] leading-4 font-semibold text-foreground shadow-sm flex items-center justify-center"
                aria-hidden
              >
                {activeShortLabel}
              </span>
            </button>
          </div>
        </TooltipTrigger>
        <TooltipContent side="left"><p className="text-xs">{t('chat.switchModel')}</p></TooltipContent>
      </Tooltip>
    );
  };

  return (
    <>
      <div data-chat-right-toolbar className="w-12 h-full min-h-0 flex-shrink-0 border-l border-border/60 bg-sidebar flex flex-col">
        <div className="chat-right-toolbar-main flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto overflow-x-hidden py-3">
          {renderModelButton()}

          <div className="w-5 h-px bg-border/60 my-1" />

          {topicSettingsAction ? renderToolbarButton(topicSettingsAction) : null}
          {clearMessagesAction ? renderToolbarButton(clearMessagesAction) : null}
          {compareAction ? renderToolbarButton(compareAction) : null}
          {renderToolbarButton(globalSearchAction)}
          {renderExportToolbarButton()}
          {renderToolbarButton(launchpadAction)}
          {renderToolbarButton(elementPickerAction)}
          {renderToolbarButton(screenshotEditorAction)}
          {renderToolbarButton(phrasesAction)}
          {renderToolbarButton(translationAction)}
        </div>

        <div className="chat-right-toolbar-footer flex shrink-0 flex-col items-center gap-1 border-t border-border/60 py-3">
          {renderToolbarButton(extensionSettingsAction)}

          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <ThemeToggle className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="left"><p className="text-xs">{t('appearance.toggleTheme')}</p></TooltipContent>
          </Tooltip>
        </div>
      </div>
      <ConfirmDialogPortal />
    </>
  );
}
