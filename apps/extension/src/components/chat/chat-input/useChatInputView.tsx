/**
 * 说明：`useChatInputView` 组件模块。
 *
 * 职责：
 * - 承载 `useChatInputView` 相关的当前文件实现与模块边界；
 * - 对外暴露 `useChatInputView` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useTranslation } from 'react-i18next';

import { useChatAttachments } from '@/components/chat/hooks/useChatAttachments';
import { useChatTranslation } from '@/components/chat/hooks/useChatTranslation';
import { useQuickPanelController } from '@/components/chat/hooks/useQuickPanelController';
import { QuickPhraseCreateDialog, type QuickPhraseCreateScope } from '@/components/chat/QuickPhraseCreateDialog';
import { scheduleBrowserContextWork } from '@/lib/browser-context';
import { normalizeMentionModelIds } from '@/lib/chat/mentioned-models-store';
import { addQuickPhrase } from '@/lib/quick-phrases/phrase-store';
import { createId } from '@/lib/utils/id';
import { useChatStore } from '@/hooks/useChatStore';
import { useChatSettingsStore } from '@/hooks/useChatSettingsStore';
import { useModelOptions } from '@/hooks/useModelOptions';
import { ChatInputLayout } from './ChatInputLayout';
import { useChatInputIntegrationState } from './useChatInputIntegrationState';
import { useChatInputExternalDraft } from './useChatInputExternalDraft';
import { useInputLayoutState } from './useInputLayoutState';
import type { ChatInputProps } from './types';
import { useMentionedModelsDraft } from './useMentionedModelsDraft';
import type { ChatInputElementDraftCard } from './element-draft-markdown';

/**
 * 聊天输入区视图控制器。
 *
 * 说明：
 * - 统一编排输入框文本、附件队列、快捷面板、联网搜索、MCP 选择、翻译与发送动作；
 * - 只负责输入区交互层，不直接执行模型请求，真正发送由 `onSend` 交给上层话题控制器。
 */
export function useChatInputView({
  onSend,
  onStop,
  isLoading,
  onOpenPrompts,
  currentModel,
  assistantId,
  onOpenModelManager,
  onOpenWebSearchSettings,
  onOpenNativeWebSearchSettings,
  onOpenMcpSettings,
  onOpenMemorySettings,
  slashCommands = [],
  canGenerateImage,
  enableGenerateImage,
  onToggleGenerateImage,
  reasoningState,
  onChangeReasoningState,
  onInsertContextDivider,
  onClearMessages,
  hasMessages,
  mcpSelection,
  onChangeMcpSelection,
  externalDraft,
  onExternalDraftAccepted,
}: ChatInputProps) {
  const { t } = useTranslation();
  const activeTopicId = useChatStore((state) => state.activeConversationKey ?? state.runtime.activeTopicId);
  const { providers, models, getModelLabel } = useModelOptions();
  const {
    sendMessageShortcut,
    pasteLongTextAsFile,
    pasteLongTextThreshold,
    autoTranslateWithSpaceEnabled,
    translateLanguages,
    showTranslateConfirm,
    translateTargetLanguage,
    translateModel,
  } = useChatSettingsStore((state) => ({
    sendMessageShortcut: state.settings.sendMessageShortcut ?? 'enter',
    pasteLongTextAsFile: state.settings.pasteLongTextAsFile ?? true,
    pasteLongTextThreshold: state.settings.pasteLongTextThreshold ?? 2000,
    autoTranslateWithSpaceEnabled: (state.settings.enableDeveloperMode ?? false) && (state.settings.autoTranslateWithSpace ?? false),
    translateLanguages: Array.isArray(state.settings.translateLanguages) ? state.settings.translateLanguages : [],
    showTranslateConfirm: state.settings.showTranslateConfirm ?? true,
    translateTargetLanguage: typeof state.settings.translateTargetLanguage === 'string' ? state.settings.translateTargetLanguage : '',
    translateModel: state.settings.translateModel ?? state.settings.defaultModel,
  }), shallow);
  /** 当前输入框文本。 */
  const [text, setText] = useState('');
  const [elementDraftCards, setElementDraftCards] = useState<ChatInputElementDraftCard[]>([]);
  const [quickPhraseCreateOpen, setQuickPhraseCreateOpen] = useState(false);
  /** 文本输入框 DOM 引用。 */
  const ref = useRef<HTMLTextAreaElement>(null);
  /** 隐藏文件选择 input 引用。 */
  const fileRef = useRef<HTMLInputElement>(null);
  /** 连按空格自动翻译的计数器。 */
  const spaceClickCountRef = useRef(0);
  /** 连按空格自动翻译的计时窗口。 */
  const spaceClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 已消费的外部草稿 ID，用于抵御 StrictMode effect 重放导致的重复插入。 */
  const consumedExternalDraftIdsRef = useRef<Set<string>>(new Set());
  /** 组件挂载状态，用于避免外部附件异步入队完成后写入已卸载输入区。 */
  const mountedRef = useRef(true);

  /** 把焦点安全地还给输入框。 */
  const focusInput = useCallback(() => {
    ref.current?.focus();
  }, []);

  const {
    attachments,
    isDragging,
    addFiles,
    addExistingAttachments,
    addImageDataUrlAttachment,
    removeAttachmentAt,
    removeAttachmentsByIds,
    appendFileToInput,
    copyFileContent,
    handlePaste,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    consumeAttachments,
  } = useChatAttachments({
    t,
    pasteLongTextAsFile,
    pasteLongTextThreshold,
    setText,
    focusInput,
  });
  const elementAttachmentIds = useMemo(() => new Set(
    elementDraftCards.flatMap((card) => card.attachmentIds),
  ), [elementDraftCards]);
  const visibleAttachmentEntries = useMemo(() => (
    attachments
      .map((attachment, index) => ({ attachment, index }))
      .filter((entry) => !elementAttachmentIds.has(entry.attachment.ref.id))
  ), [attachments, elementAttachmentIds]);
  const visibleAttachments = useMemo(
    () => visibleAttachmentEntries.map((entry) => entry.attachment),
    [visibleAttachmentEntries],
  );
  const visibleHasImageAttachments = useMemo(
    () => visibleAttachments.some((attachment) => attachment.ref.type === 'image'),
    [visibleAttachments],
  );
  const removeVisibleAttachmentAt = useCallback((index: number) => {
    const entry = visibleAttachmentEntries[index];
    if (!entry) return;
    removeAttachmentAt(entry.index);
  }, [removeAttachmentAt, visibleAttachmentEntries]);
  const { composerShellHeight, startResize } = useInputLayoutState();
  const {
    activeMcpSelection,
    assistant,
    availableModelIds,
    canBindAssistant,
    canBuiltinWebSearch,
    enabledMcpServers,
    mcpSettingsConfig,
    mcpButtonActive,
    selectedWebSearchProviderId,
    selectExternalWebSearchProvider,
    setActiveMcpSelection,
    toggleBuiltinWebSearch,
    updateAssistantConfig,
    webSearchActive,
    webSearchButtonTooltip,
    webSearchSettings,
  } = useChatInputIntegrationState({
    assistantId,
    currentModel,
    models,
    mcpSelection,
    onChangeMcpSelection,
    t,
  });

  const { mentionModels, setMentionModelsForCurrentAssistant } = useMentionedModelsDraft(assistantId);

  useEffect(() => () => {
    if (spaceClickTimerRef.current) clearTimeout(spaceClickTimerRef.current);
    mountedRef.current = false;
  }, []);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  useChatInputExternalDraft({
    externalDraft,
    onExternalDraftAccepted,
    consumedDraftIdsRef: consumedExternalDraftIdsRef,
    mountedRef,
    addExistingAttachments,
    addImageDataUrlAttachment,
    setText,
    setElementDraftCards,
    focusInput,
  });

  const {
    quickPanelRef,
    quickPanelOpen,
    quickPanelKind,
    quickActiveMenu,
    filteredQuickItems,
    quickPanelHints,
    quickPanelFooterLabel,
    quickPanelInlineSymbol,
    hasInlineQuery,
    quickPanelIndex,
    canGoBack,
    toggleMentionModel,
    openQuickPanel,
    closeQuickPanel,
    goBackQuickMenu,
    selectQuickItem,
    handleQuickPanelKeyDown,
    handleInputChange,
    handleInputBlur,
    resolveTextForSend,
  } = useQuickPanelController({
    t,
    text,
    setText,
    inputRef: ref,
    slashCommands,
    attachmentsHaveImage: visibleHasImageAttachments,
    models,
    providers,
    onOpenModelManager,
    canBindAssistant,
    canBuiltinWebSearch,
    builtinWebSearchEnabled: Boolean(canBuiltinWebSearch && assistant?.enableWebSearch),
    selectedWebSearchProviderId,
    webSearchSettings,
    onToggleBuiltinWebSearch: toggleBuiltinWebSearch,
    onSelectExternalWebSearchProvider: selectExternalWebSearchProvider,
    onOpenWebSearchSettings,
    onOpenNativeWebSearchSettings,
    enabledMcpServers,
    mcpSettingsConfig,
    activeMcpSelection,
    setActiveMcpSelection,
    onOpenMcpSettings,
    assistantRegularPhrases: assistant?.regularPhrases ?? [],
    onOpenQuickPhraseCreator: () => setQuickPhraseCreateOpen(true),
    mentionModels,
    onChangeMentionModels: setMentionModelsForCurrentAssistant,
  });

  /** 关闭输入区相关临时弹层，但不强制恢复输入焦点。 */
  const closeAll = useCallback(() => {
    closeQuickPanel({ restoreFocus: false });
  }, [closeQuickPanel]);

  /** 输入区按钮锚点 quick panel 的确定性开关控制。 */
  const handleQuickPanelOpenChange = useCallback((kind: 'mention' | 'web-search' | 'mcp' | 'phrases', nextOpen: boolean) => {
    if (nextOpen) {
      openQuickPanel(
        kind === 'mention'
          ? { kind, mentionTrigger: { type: 'button' } }
          : { kind },
      );
      return;
    }

    if (quickPanelOpen && quickPanelKind === kind) {
      closeQuickPanel();
    }
  }, [closeQuickPanel, openQuickPanel, quickPanelKind, quickPanelOpen]);

  const {
    isTranslating,
    translateConfirmOpen,
    resolvedTranslateTargetLanguage,
    runTranslate,
    requestTranslateFromButton,
    cancelTranslateConfirm,
    confirmTranslateFromButton,
  } = useChatTranslation({
    t,
    text,
    setText,
    inputRef: ref,
    isLoading,
    currentModel,
    availableModelIds,
    translateLanguages,
    translateTargetLanguage,
    translateModel,
    showTranslateConfirm,
    closeAll,
  });

  /**
   * 输入框键盘事件处理器。
   *
   * 说明：
   * - 快捷面板优先消费方向键、回车等导航事件；
   * - 其余按键再依次处理删除附件、占位符跳转、三连空格翻译与发送快捷键。
   */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (handleQuickPanelKeyDown(event)) return;

    if (event.key === 'Backspace' && !text && visibleAttachmentEntries.length > 0) {
      event.preventDefault();
      removeVisibleAttachmentAt(visibleAttachmentEntries.length - 1);
      return;
    }

    if (event.key === 'Tab' && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey) {
      const element = ref.current;
      if (!element) return;
      const cursorPosition = element.selectionStart ?? 0;
      const placeholderRegex = /\$\{[^}]+\}/g;
      let match = placeholderRegex.exec(text);
      let picked: RegExpExecArray | null = null;
      while (match) {
        if (match.index >= cursorPosition) {
          picked = match;
          break;
        }
        match = placeholderRegex.exec(text);
      }
      if (!picked) {
        placeholderRegex.lastIndex = 0;
        picked = placeholderRegex.exec(text);
      }
      if (picked) {
        event.preventDefault();
        const start = picked.index + 2;
        const end = picked.index + picked[0].length - 1;
        queueMicrotask(() => element.setSelectionRange(start, end));
      }
      return;
    }

    if (autoTranslateWithSpaceEnabled && event.key === ' ' && resolvedTranslateTargetLanguage && !isLoading && !isTranslating) {
      spaceClickCountRef.current += 1;
      if (spaceClickTimerRef.current) clearTimeout(spaceClickTimerRef.current);
      spaceClickTimerRef.current = setTimeout(() => {
        spaceClickTimerRef.current = null;
        spaceClickCountRef.current = 0;
      }, 200);
      if (spaceClickCountRef.current >= 3) {
        spaceClickCountRef.current = 0;
        void runTranslate(text, 'auto');
        return;
      }
    }

    const isEnter = event.key === 'Enter';
    const shouldSend =
      sendMessageShortcut === 'enter'
        ? isEnter && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey
        : sendMessageShortcut === 'ctrlEnter'
          ? isEnter && (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey
          : sendMessageShortcut === 'shiftEnter'
            ? isEnter && event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey
            : false;

    if (shouldSend) {
      event.preventDefault();
      send();
    }
  };

  /**
   * 输入框内容变化处理器。
   *
   * 说明：
   * - 实际文本更新和 `/`、`\@` 触发符侦测统一交给 quick panel 控制器；
   * - 这样可以避免输入值和面板状态分散在两个地方维护。
   */
  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    const cursorPosition = event.target.selectionStart ?? value.length;
    if (activeTopicId && !text.trim() && value.trim()) {
      scheduleBrowserContextWork({
        reason: 'input-intent',
        conversationKey: activeTopicId,
      });
    }
    handleInputChange(value, cursorPosition);
  };

  const handleInputFocus = useCallback(() => {
    if (!activeTopicId) return;
    scheduleBrowserContextWork({
      reason: 'input-intent',
      conversationKey: activeTopicId,
    });
  }, [activeTopicId]);

  /**
   * 从输入区新增快捷短语。
   *
   * 说明：
   * - 助手级短语写入当前 `Assistant.regularPhrases`，跟随助手树同步与备份；
   * - 全局短语继续写入 `olyq.quick-phrases.v1` 的 shared JSON 配置通道。
   */
  const handleCreateQuickPhrase = useCallback((scope: QuickPhraseCreateScope, draft: { title: string; content: string }) => {
    if (scope === 'assistant' && assistantId && assistant) {
      const now = Date.now();
      const current = Array.isArray(assistant.regularPhrases) ? assistant.regularPhrases : [];
      updateAssistantConfig(assistantId, {
        regularPhrases: [
          {
            id: createId(),
            title: draft.title.trim(),
            content: draft.content.trim(),
            createdAt: now,
            updatedAt: now,
            order: now,
          },
          ...current,
        ],
      });
      return;
    }

    addQuickPhrase({ title: draft.title, content: draft.content });
  }, [assistant, assistantId, updateAssistantConfig]);

  /**
   * 删除输入区中的页面元素引用卡，并同步移除卡片拥有的隐藏上下文与待发送附件。
   *
   * @param draftId - 目标元素引用草稿 ID。
   */
  const removeElementDraftCard = useCallback((draftId: string) => {
    let attachmentIds: string[] = [];
    setElementDraftCards((current) => {
      const target = current.find((card) => card.id === draftId);
      attachmentIds = target?.attachmentIds ?? [];
      return current.filter((card) => card.id !== draftId);
    });
    removeAttachmentsByIds(attachmentIds);
    focusInput();
  }, [focusInput, removeAttachmentsByIds]);

  /**
   * 发送当前输入内容。
   *
   * 说明：
   * - 发送前会剔除快捷面板残留触发符并消费附件队列；
   * - 发送后只清空文本、附件与页面元素引用草稿；mention 模型作为助手级可见 draft 保留。
   */
  const send = useCallback(() => {
    const normalizedText = resolveTextForSend(text);
    const trimmed = normalizedText.trim();
    if ((!trimmed && visibleAttachmentEntries.length === 0) || isLoading || isTranslating) return;

    closeAll();
    const mention = normalizeMentionModelIds(mentionModels);
    const consumedAttachments = consumeAttachments();
    const contextReferences = elementDraftCards.map((card) => ({
      id: card.id,
      kind: card.kind,
      element: card.element,
      ...(card.source ? { source: card.source } : {}),
      attachmentIds: card.attachmentIds,
    }));

    onSend({
      text: trimmed,
      ...(contextReferences.length > 0 ? { contextReferences } : {}),
      attachments: consumedAttachments.length > 0 ? consumedAttachments : undefined,
      ...(mention.length > 0 ? { mentionModels: mention } : {}),
    });
    setText('');
    setElementDraftCards([]);
  }, [
    closeAll,
    consumeAttachments,
    elementDraftCards,
    isLoading,
    isTranslating,
    mentionModels,
    onSend,
    resolveTextForSend,
    text,
    visibleAttachmentEntries.length,
  ]);

  return (
    <>
    <ChatInputLayout
      addFiles={addFiles}
      appendFileToInput={appendFileToInput}
      assistantId={assistantId}
      attachmentCount={visibleAttachments.length}
      attachments={visibleAttachments}
      canGenerateImage={canGenerateImage}
      canGoBack={canGoBack}
      cancelTranslateConfirm={cancelTranslateConfirm}
      confirmTranslateFromButton={confirmTranslateFromButton}
      copyFileContent={copyFileContent}
      enableGenerateImage={enableGenerateImage}
      fileRef={fileRef}
      filteredQuickItems={filteredQuickItems}
      getModelLabel={getModelLabel}
      elementDraftCards={elementDraftCards}
      goBackQuickMenu={goBackQuickMenu}
      handleChange={handleChange}
      handleDragLeave={handleDragLeave}
      handleDragOver={handleDragOver}
      handleDrop={handleDrop}
      handleInputBlur={handleInputBlur}
      handleInputFocus={handleInputFocus}
      handleKeyDown={handleKeyDown}
      handlePaste={handlePaste}
      hasInlineQuery={hasInlineQuery}
      hasMessages={hasMessages}
      composerShellHeight={composerShellHeight}
      isDragging={isDragging}
      isLoading={isLoading}
      isTranslating={isTranslating}
      mcpButtonActive={mcpButtonActive}
      mentionModels={mentionModels}
      onChangeReasoningState={onChangeReasoningState}
      onClearMessages={onClearMessages}
      onInsertContextDivider={onInsertContextDivider}
      onOpenMemorySettings={onOpenMemorySettings}
      onOpenPrompts={onOpenPrompts}
      onQuickPanelOpenChange={handleQuickPanelOpenChange}
      onRequestTranslate={requestTranslateFromButton}
      onSend={send}
      onStop={onStop}
      onToggleGenerateImage={onToggleGenerateImage}
      quickActiveMenu={quickActiveMenu}
      quickPanelFooterLabel={quickPanelFooterLabel}
      quickPanelHints={quickPanelHints}
      quickPanelIndex={quickPanelIndex}
      quickPanelInlineSymbol={quickPanelInlineSymbol}
      quickPanelKind={quickPanelKind ?? null}
      quickPanelOpen={quickPanelOpen}
      quickPanelRef={quickPanelRef}
      reasoningState={reasoningState}
      inputRef={ref}
      onRemoveElementDraftCard={removeElementDraftCard}
      removeAttachmentAt={removeVisibleAttachmentAt}
      resolvedTranslateTargetLanguage={resolvedTranslateTargetLanguage}
      selectQuickItem={selectQuickItem}
      selectedWebSearchProviderId={selectedWebSearchProviderId}
      sendDisabled={isTranslating || (!text.trim() && visibleAttachmentEntries.length === 0)}
      startResize={startResize}
      t={t}
      text={text}
      toggleMentionModel={toggleMentionModel}
      translateConfirmOpen={translateConfirmOpen}
      translateDisabled={!text.trim() || isLoading || isTranslating}
      webSearchActive={webSearchActive}
      webSearchButtonTooltip={webSearchButtonTooltip}
    />
    <QuickPhraseCreateDialog
      open={quickPhraseCreateOpen}
      onOpenChange={setQuickPhraseCreateOpen}
      canSaveToAssistant={Boolean(assistantId && assistant)}
      t={t}
      onSubmit={handleCreateQuickPhrase}
    />
    </>
  );
}
