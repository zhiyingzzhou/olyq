/**
 * 说明：`ChatInputToolbar` 组件模块。
 *
 * 职责：
 * - 承载 `ChatInputToolbar` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ChatInputToolbar` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { AtSign, Brain, Hammer, Image as ImageIcon, ImagePlus, Languages, Loader2, MoreHorizontal, Scissors, Send, Sparkles, Square, Trash2, Zap } from 'lucide-react';
import type { ReactNode, RefObject } from 'react';
import { ChatQuickPanel } from '@/components/chat/ChatQuickPanel';
import { MemoryButton } from '@/components/chat/MemoryButton';
import type { SelectionPanelHint } from '@/components/chat/SelectionPanelShared';
import type { QuickPanelItem, QuickPanelKind, QuickPanelMenu } from '@/components/chat/hooks/useQuickPanelController';
import { WebSearchProviderIcon } from '@/components/icons/webSearchProviders';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { WebSearchProviderId } from '@/lib/web-search/types';
import type { ChatInputReasoningViewModel } from '@/components/chat/chat-input/types';

/** 聊天工具栏使用的最小翻译函数签名。 */
type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

type AnchoredQuickPanelKind = Extract<QuickPanelKind, 'mention' | 'web-search' | 'mcp' | 'phrases'>;

type AnchoredQuickPanelConfig = {
  /** 快捷面板根节点引用。 */
  readonly panelRef: RefObject<HTMLDivElement | null>;
  /** 当前激活菜单。 */
  readonly activeMenu: QuickPanelMenu;
  /** 当前渲染的条目。 */
  readonly items: QuickPanelItem[];
  /** 当前高亮索引。 */
  readonly activeIndex: number;
  /** 行内触发符号。 */
  readonly inlineSymbol: string | null;
  /** 底部标签。 */
  readonly footerLabel: string;
  /** 是否展示查询 badge。 */
  readonly showFooterBadge: boolean;
  /** 快捷键提示。 */
  readonly hints: SelectionPanelHint[];
  /** 是否可返回上一级。 */
  readonly canGoBack: boolean;
  /** 返回上一级。 */
  readonly onGoBack: () => void;
  /** 选中条目。 */
  readonly onSelectItem: (item: QuickPanelItem) => void;
};

/** 聊天输入工具栏属性。 */
type ChatInputToolbarProps = {
  /** i18n 翻译函数。 */
  readonly t: TranslateFn;
  /** 当前绑定的助手 ID；某些能力如记忆开关依赖助手上下文。 */
  readonly assistantId?: string;
  /** 打开提示词库。 */
  readonly onOpenPrompts: () => void;
  /** 隐藏文件输入框引用，用于点击按钮时触发选择文件。 */
  readonly fileRef: RefObject<HTMLInputElement | null>;
  /** 处理用户新添加的附件文件。 */
  readonly onAddFiles: (files: FileList | null) => void | Promise<void>;
  /** 当前联网搜索是否已经启用。 */
  readonly webSearchActive: boolean;
  /** 快捷面板是否打开。 */
  readonly quickPanelOpen: boolean;
  /** 当前快捷面板的类型，用于高亮对应入口。 */
  readonly quickPanelKind: QuickPanelKind | null;
  /** 锚点快捷面板渲染所需的最小受控数据。 */
  readonly anchoredQuickPanel?: AnchoredQuickPanelConfig;
  /** 输入区锚点 quick panel 的确定性开关回调。 */
  readonly onQuickPanelOpenChange: (kind: AnchoredQuickPanelKind, nextOpen: boolean) => void;
  /** 联网搜索按钮 tooltip 文案。 */
  readonly webSearchButtonTooltip: string;
  /** 当前已选中的联网搜索 Provider。 */
  readonly selectedWebSearchProviderId?: WebSearchProviderId;
  /** 打开全局记忆设置面板。 */
  readonly onOpenMemorySettings?: () => void;
  /** 当前已 mention 的模型列表，用于入口高亮。 */
  readonly mentionModels: string[];
  /** MCP 工具面板当前是否激活。 */
  readonly mcpButtonActive: boolean;
  /** provider-aware 推理菜单状态。 */
  readonly reasoningState?: ChatInputReasoningViewModel;
  /** 修改 provider-aware 推理菜单值。 */
  readonly onChangeReasoningState?: (value: ChatInputReasoningViewModel['value']) => void;
  /** 插入上下文分隔线。 */
  readonly onInsertContextDivider?: () => void;
  /** 当前是否正在生成回复。 */
  readonly isLoading: boolean;
  /** 当前模型是否支持图片生成。 */
  readonly canGenerateImage?: boolean;
  /** 当前是否已开启图片生成模式。 */
  readonly enableGenerateImage?: boolean;
  /** 切换图片生成模式。 */
  readonly onToggleGenerateImage?: () => void;
  /** 当前话题是否已有消息。 */
  readonly hasMessages?: boolean;
  /** 清空当前话题消息。 */
  readonly onClearMessages?: () => void;
  /** 当前已添加的附件数量。 */
  readonly attachmentCount: number;
  /** 当前翻译目标语言展示文本。 */
  readonly resolvedTranslateTargetLanguage: string;
  /** 请求将输入内容翻译到目标语言。 */
  readonly onRequestTranslate: () => void;
  /** 当前是否正在执行翻译。 */
  readonly isTranslating: boolean;
  /** 翻译按钮是否禁用。 */
  readonly translateDisabled: boolean;
  /** 停止当前生成。 */
  readonly onStop: () => void;
  /** 发送当前输入内容。 */
  readonly onSend: () => void;
  /** 发送按钮是否禁用。 */
  readonly sendDisabled: boolean;
};

/**
 * 聊天输入区底部工具栏。
 *
 * 职责：
 * - 聚合提示词、附件、联网搜索、记忆、MCP、翻译、发送等入口；
 * - 根据当前话题能力控制按钮显隐和高亮；
 * - 作为纯受控组件，把所有副作用交给外层控制器处理。
 */
export function ChatInputToolbar({
  t,
  assistantId,
  onOpenPrompts,
  fileRef,
  onAddFiles,
  webSearchActive,
  quickPanelOpen,
  quickPanelKind,
  anchoredQuickPanel,
  onQuickPanelOpenChange,
  webSearchButtonTooltip,
  selectedWebSearchProviderId,
  onOpenMemorySettings,
  mentionModels,
  mcpButtonActive,
  reasoningState,
  onChangeReasoningState,
  onInsertContextDivider,
  isLoading,
  canGenerateImage,
  enableGenerateImage,
  onToggleGenerateImage,
  hasMessages,
  onClearMessages,
  attachmentCount,
  resolvedTranslateTargetLanguage,
  onRequestTranslate,
  isTranslating,
  translateDisabled,
  onStop,
  onSend,
  sendDisabled,
}: ChatInputToolbarProps) {
  /**
   * 内部函数变量：`renderAnchoredQuickPanel`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const renderAnchoredQuickPanel = (
    kind: AnchoredQuickPanelKind,
    trigger: ReactNode,
    tooltipText: string,
    testId: string,
  ) => {
    const open = quickPanelOpen && quickPanelKind === kind;
    const popoverTrigger = (
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            {trigger}
          </PopoverTrigger>
        </TooltipTrigger>
        {!open ? (
          <TooltipContent side="top"><p className="text-xs">{tooltipText}</p></TooltipContent>
        ) : null}
      </Tooltip>
    );

    return (
      <Popover
        open={open}
        onOpenChange={(nextOpen) => onQuickPanelOpenChange(kind, nextOpen)}
      >
        {popoverTrigger}

        {anchoredQuickPanel ? (
          <PopoverContent
            side="top"
            align="start"
            sideOffset={8}
            className="w-80 rounded-xl border border-border bg-background p-0 shadow-sm"
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => event.preventDefault()}
            data-testid={testId}
          >
            <ChatQuickPanel
              panelRef={anchoredQuickPanel.panelRef}
              activeMenu={anchoredQuickPanel.activeMenu}
              items={anchoredQuickPanel.items}
              placement="anchored"
              activeIndex={anchoredQuickPanel.activeIndex}
              inlineSymbol={anchoredQuickPanel.inlineSymbol}
              footerLabel={anchoredQuickPanel.footerLabel}
              showFooterBadge={anchoredQuickPanel.showFooterBadge}
              hints={anchoredQuickPanel.hints}
              canGoBack={anchoredQuickPanel.canGoBack}
              backLabel={t('common.prev')}
              emptyTitleFallback={t('search.noResults')}
              onGoBack={anchoredQuickPanel.onGoBack}
              onSelectItem={anchoredQuickPanel.onSelectItem}
            />
          </PopoverContent>
        ) : null}
      </Popover>
    );
  };

  const reasoningValue = reasoningState?.value ?? 'off';
  const reasoningTriggerActive = reasoningValue !== 'off';
  const reasoningOptions = reasoningState?.options ?? [];
  const showReasoningControl = reasoningOptions.length > 0;
  const showOverflowTools = showReasoningControl || Boolean(onInsertContextDivider) || Boolean(canGenerateImage) || Boolean(hasMessages && onClearMessages);

  /**
   * 内部函数变量：`renderReasoningRadioItems`。
   *
   * @remarks
   * 主菜单和更多菜单共用同一组 provider-aware 推理选项，避免两个入口出现
   * radio 状态、回调或测试标识漂移。
   */
  const renderReasoningRadioItems = (testIdPrefix: string) => (
    <DropdownMenuRadioGroup
      value={reasoningValue}
      onValueChange={(value) => onChangeReasoningState?.(value as ChatInputReasoningViewModel['value'])}
    >
      {reasoningOptions.map((option) => (
        <DropdownMenuRadioItem
          key={option.value}
          value={option.value}
          data-testid={`${testIdPrefix}-${option.value}`}
        >
          {t(option.labelKey)}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );

  return (
    <div data-chat-input-toolbar className="chat-input-toolbar flex flex-wrap items-end gap-x-2 gap-y-2">
      {/* 主路径工具由独立子区承载，窄宽时它可以先重排，不挤压发送操作区。 */}
      <div className="chat-input-toolbar-tools flex min-w-0 flex-[1_1_auto] flex-wrap items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onOpenPrompts}
            className="chat-input-tool-button p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          >
            <Sparkles className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top"><p className="text-xs">{t('prompt.library')}</p></TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => fileRef.current?.click()}
            className="chat-input-tool-button p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          >
            <ImagePlus className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top"><p className="text-xs">{t('chat.addAttachment')}</p></TooltipContent>
      </Tooltip>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,audio/*,.txt,.md,.json,.csv,.log,.yaml,.yml,.mp3,.wav,.m4a,.aac,.webm,.ogg,.oga,.flac,.mpga,.mpeg"
        multiple
        className="hidden"
        onChange={(event) => {
          // 读取后立即清空 input value，确保同一文件再次选择也能触发 change。
          void onAddFiles(event.target.files);
          event.currentTarget.value = '';
        }}
      />

      {renderAnchoredQuickPanel(
        'web-search',
        (
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            className={`chat-input-tool-button rounded p-1.5 transition-colors flex-shrink-0 ${
              webSearchActive || (quickPanelOpen && quickPanelKind === 'web-search')
                ? 'bg-primary/15 text-primary hover:bg-primary/25'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
            aria-label={t('chat.webSearch')}
          >
            <WebSearchProviderIcon pid={selectedWebSearchProviderId} className="h-4 w-4" />
          </button>
        ),
        webSearchButtonTooltip,
        'web-search-quick-panel-popover',
      )}

      <MemoryButton assistantId={assistantId} onOpenMemorySettings={onOpenMemorySettings} />

      {renderAnchoredQuickPanel(
        'mention',
        (
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            className={`chat-input-tool-button rounded p-1.5 transition-colors flex-shrink-0 ${
              mentionModels.length > 0 || (quickPanelOpen && quickPanelKind === 'mention')
                ? 'bg-primary/15 text-primary hover:bg-primary/25'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
            aria-label={t('message.mentionModel')}
          >
            <AtSign className="h-4 w-4" />
          </button>
        ),
        t('message.mentionModel'),
        'mention-quick-panel-popover',
      )}

      {renderAnchoredQuickPanel(
        'phrases',
        (
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            className={`chat-input-tool-button rounded p-1.5 transition-colors flex-shrink-0 ${
              quickPanelOpen && quickPanelKind === 'phrases'
                ? 'bg-primary/15 text-primary hover:bg-primary/25'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
            aria-label={t('quickPhrase.title')}
            data-testid="chat-toolbar-phrases"
          >
            <Zap className="h-4 w-4" />
          </button>
        ),
        t('quickPhrase.title'),
        'phrases-quick-panel-popover',
      )}

      {renderAnchoredQuickPanel(
        'mcp',
        (
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            className={`chat-input-tool-button rounded p-1.5 transition-colors flex-shrink-0 ${
              mcpButtonActive || (quickPanelOpen && quickPanelKind === 'mcp')
                ? 'bg-primary/15 text-primary hover:bg-primary/25'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
            aria-label={t('mcpBridgePanel.title')}
          >
            <Hammer className="h-4 w-4" />
          </button>
        ),
        t('mcpBridgePanel.title'),
        'mcp-quick-panel-popover',
      )}

      {showReasoningControl && (
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  data-testid="chat-reasoning-effort-trigger"
                  className={`chat-input-tool-button chat-input-secondary-tool p-2 rounded-lg transition-colors flex-shrink-0 ${
                    reasoningTriggerActive
                      ? 'bg-primary/15 text-primary hover:bg-primary/25'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  <Brain className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="top"><p className="text-xs">{t('chat.reasoningEffort')}</p></TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="start" side="top" className="w-44">
            {renderReasoningRadioItems('chat-reasoning-effort')}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {onInsertContextDivider && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              data-testid="chat-context-divider"
              onClick={onInsertContextDivider}
              disabled={isLoading}
              className="chat-input-tool-button chat-input-secondary-tool p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 flex-shrink-0"
            >
              <Scissors className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top"><p className="text-xs">{t('chat.newContext')}</p></TooltipContent>
        </Tooltip>
      )}

      {canGenerateImage && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              data-testid="chat-generate-image-toggle"
              onClick={onToggleGenerateImage}
              className={`chat-input-tool-button chat-input-secondary-tool p-2 rounded-lg transition-colors flex-shrink-0 ${
                enableGenerateImage
                  ? 'bg-primary/15 text-primary hover:bg-primary/25'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <ImageIcon className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top"><p className="text-xs">{t('chat.generateImage')}</p></TooltipContent>
        </Tooltip>
      )}

      {hasMessages && onClearMessages && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              data-testid="chat-clear-messages"
              onClick={onClearMessages}
              disabled={isLoading}
              className="chat-input-tool-button chat-input-secondary-tool p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 flex-shrink-0"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top"><p className="text-xs">{t('chat.clearMessages')}</p></TooltipContent>
        </Tooltip>
      )}
      </div>

      <div className="chat-input-toolbar-actions ml-auto flex shrink-0 items-center justify-end gap-2">
        {attachmentCount > 0 && (
          <span className="text-xs text-muted-foreground">{t('chat.imagesCount', { count: attachmentCount })}</span>
        )}
        {showOverflowTools && (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="chat-input-tool-button chat-input-more-tools-trigger rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    aria-label={t('chat.moreInputTools')}
                    data-testid="chat-input-more-tools-trigger"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="top"><p className="text-xs">{t('chat.moreInputTools')}</p></TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" side="top" className="w-52">
              {showReasoningControl ? (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger data-testid="chat-overflow-reasoning-trigger">
                    <Brain className="mr-2 h-4 w-4" />
                    <span>{t('chat.reasoningEffort')}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-44">
                    {renderReasoningRadioItems('chat-overflow-reasoning-effort')}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ) : null}

              {onInsertContextDivider ? (
                <DropdownMenuItem
                  disabled={isLoading}
                  onSelect={() => onInsertContextDivider()}
                  data-testid="chat-overflow-context-divider"
                >
                  <Scissors className="mr-2 h-4 w-4" />
                  <span>{t('chat.newContext')}</span>
                </DropdownMenuItem>
              ) : null}

              {canGenerateImage ? (
                <DropdownMenuCheckboxItem
                  checked={Boolean(enableGenerateImage)}
                  onCheckedChange={() => onToggleGenerateImage?.()}
                  data-testid="chat-overflow-generate-image-toggle"
                >
                  <ImageIcon className="mr-2 h-4 w-4" />
                  <span>{t('chat.generateImage')}</span>
                </DropdownMenuCheckboxItem>
              ) : null}

              {showReasoningControl || onInsertContextDivider || canGenerateImage ? (
                hasMessages && onClearMessages ? <DropdownMenuSeparator /> : null
              ) : null}

              {hasMessages && onClearMessages ? (
                <DropdownMenuItem
                  disabled={isLoading}
                  onSelect={() => onClearMessages()}
                  data-testid="chat-overflow-clear-messages"
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  <span>{t('chat.clearMessages')}</span>
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {resolvedTranslateTargetLanguage && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onRequestTranslate}
                disabled={translateDisabled}
                className="chat-input-tool-button p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 flex-shrink-0"
                aria-label={t('chat.translateTo', { language: resolvedTranslateTargetLanguage })}
              >
                {isTranslating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Languages className="h-4 w-4" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">{t('chat.translateTo', { language: resolvedTranslateTargetLanguage })}</p>
            </TooltipContent>
          </Tooltip>
        )}
        {isLoading ? (
          <Button
            size="sm"
            variant="destructive"
            onClick={onStop}
            data-testid="chat-stop"
            aria-label={t('chat.stop')}
            className="chat-input-send-button rounded-xl h-8 px-3 gap-1.5"
          >
            <Square className="h-3.5 w-3.5" />
            <span className="chat-input-send-label">{t('chat.stop')}</span>
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={onSend}
            data-testid="chat-send"
            disabled={sendDisabled}
            aria-label={t('chat.send')}
            className="chat-input-send-button rounded-xl h-8 px-3 gap-1.5"
          >
            <Send className="h-3.5 w-3.5" />
            <span className="chat-input-send-label">{t('chat.send')}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
