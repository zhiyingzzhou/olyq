/**
 * 说明：`ChatAreaContent` 组件模块。
 *
 * 职责：
 * - 承载 `ChatAreaContent` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ChatAreaContent` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useEffect, useRef, useState } from "react";
import { Bot, ChevronDown, Shrink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ProviderIcon } from "@/components/ui/ProviderIcon";
import { pickProviderUiMeta } from "@/lib/ai/provider-ui-meta";
import { isInlineImageModelLike } from "@/lib/ai/model-filters";
import {
  buildModelParamsWithProviderReasoning,
  resolveProviderReasoningDescriptor,
} from "@/lib/ai/provider-reasoning";
import { ContentSearch } from "@/components/chat/ContentSearch";
import { ChatInput } from "@/components/chat/ChatInput";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { MessageGroupView } from "@/components/chat/MessageGroupView";
import { MultiSelectToolbar } from "@/components/chat/MultiSelectToolbar";
import { PageContextBar } from "@/components/chat/PageContextBar";
import { WelcomeEmptyState } from "@/components/chat/WelcomeEmptyState";
import { CHAT_READING_COLUMN_CLASS } from "@/components/chat/chat-layout-classes";
import type { ChatInputReasoningViewModel } from "@/components/chat/chat-input/types";
import { MessageNavigationFloatingPanel } from "./MessageNavigationFloatingPanel";
import type { ChatAreaController } from "./useChatAreaController";
import { useChatScrollIntentListeners } from "./useChatScrollIntentListeners";
import type { TransportProtocol } from "@/lib/ai/types";

type Props = {
  controller: ChatAreaController;
};

/**
 * 导出组件：`ChatAreaContent`。
 *
 * @remarks
 * 负责承载当前文件对应的界面渲染、交互编排和视图层边界。
 */
export function ChatAreaContent({ controller }: Props) {
  const { ConfirmDialogPortal, askIdHasImage, browserContextPreflightPhase, closeCompareFullscreen, conversationState, fullscreenCompareAskId, fullscreenCompareGroup, getModelLabel, getModelShortLabel, getProviderLogo, isLoading, keepInputVisibleForExternalDraft, layout, messagesAll, modelMap, modelName, models, onModelSwitch, onOpenMcpSettings, onOpenMemorySettings, onOpenModelManager, onOpenPrompts, onOpenWebSearchSettings, onOpenNativeWebSearchSettings, openCompareFullscreen, pendingInputDraft, replayActions, sendActions, settings, slashCommands, t, tokenEstimate, topic, updateAssistantConfig, updateTopicMeta } = controller;
  const { clearTranslations, closeSearch, effectiveSearchCaseSensitive, effectiveSearchWholeWord, flowOpen, handleKeyScrollIntent, handleScroll, handleScrollbarDragStart, handleTouchMove, handleTouchStart, handleTranscriptInteraction, handleWheelIntent, measureElement, multiSelectMode, navActiveAskId, navActiveIndex, navAnchors, navGoBottom, navGoNext, navGoPrev, navGoTop, navJumpToAnchor, navPanelOpen, onMultiSelectMouseDown, rows, scrollRef, scrollToBottom, searchActiveIndex, searchCanCaseSensitive, searchCanWholeWord, searchIncludeUser, searchMatches, searchNext, searchOpen, searchPrev, searchQuery, selectRect, selectedIds, setFlowOpen, setNavPanelOpen, setSearchCaseSensitive, setSearchIncludeUser, setSearchQuery, setSearchWholeWord, toggleSelect, toggleSelectAll, translateAssistantMessage, removeTranslation, expandedThinkingIds, virtualItems, virtualTotalSize } = layout;
  const fullscreenBodyRef = useRef<HTMLDivElement | null>(null);
  const [fullscreenBodyHeight, setFullscreenBodyHeight] = useState<number | null>(null);
  const shouldRenderMessageNavigation = settings.messageNavigation === "buttons" && navAnchors.length > 0 && !multiSelectMode;
  useChatScrollIntentListeners({
    handleKeyScrollIntent,
    handleScrollbarDragStart,
    handleTouchMove,
    handleTouchStart,
    handleTranscriptInteraction,
    handleWheelIntent,
    scrollRef,
  });

  useEffect(() => {
    const element = fullscreenBodyRef.current;
    if (!element) return;

    /**
     * 内部函数变量：`syncHeight`。
     *
     * @remarks
     * fullscreen compare 的 `horizontal` 面板高度需要跟随 dialog 主体可用高度；
     * 这里把 dialog body 的实际高度同步成稳定状态，供 `MessageGroupView` 继续沿用现有固定面板算法。
     */
    const syncHeight = () => {
      const nextHeight = element.clientHeight;
      setFullscreenBodyHeight((current) => (nextHeight <= 0 || current === nextHeight ? current : nextHeight));
    };

    syncHeight();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", syncHeight);
      return () => window.removeEventListener("resize", syncHeight);
    }

    const observer = new ResizeObserver(() => {
      syncHeight();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [fullscreenCompareAskId]);

  /**
   * 内部函数变量：`renderMessageGroup`。
   *
   * @remarks
   * inline 行内 compare 与 fullscreen workspace 共用同一套 `MessageGroupView` 内容；
   * 差异只通过承载模式和可用高度表达。
   */
  const renderMessageGroup = (
    row: {
      askId: string;
      assistants: typeof messagesAll;
      user: (typeof messagesAll)[number];
      isLoading: boolean;
    },
    options?: {
      presentation?: "inline" | "fullscreen";
      availableHeight?: number;
    },
  ) => (
    <MessageGroupView
      askId={row.askId}
      availableHeight={options?.availableHeight}
      presentation={options?.presentation ?? "inline"}
      assistants={row.assistants}
      prefs={{ style: row.user.groupPrefs?.style ?? "fold", foldDisplayMode: row.user.groupPrefs?.foldDisplayMode ?? "compact", foldSelectedModelId: row.user.groupPrefs?.foldSelectedModelId, gridColumns: row.user.groupPrefs?.gridColumns ?? 2, gridPopoverTrigger: row.user.groupPrefs?.gridPopoverTrigger ?? "hover" }}
      isLoading={row.isLoading}
      browserContextPreflightPhase={browserContextPreflightPhase}
      getModelLabel={getModelLabel}
      getModelShortLabel={getModelShortLabel}
      getProviderLogo={getProviderLogo}
      onUpdatePrefs={(patch) => layout.updateGroupPrefs(row.askId, patch)}
      onOpenFullscreen={() => openCompareFullscreen(row.askId)}
      onCloseFullscreen={options?.presentation === "fullscreen" ? closeCompareFullscreen : undefined}
      onDeleteGroup={() => controller.messageActions.deleteGroupAssistants(row.askId)}
      onRetryFailedAll={() => { void replayActions.retryFailedAll(row.askId); }}
      onToggleUseful={(assistantMsgId) => controller.messageActions.toggleUseful(row.askId, assistantMsgId)}
      multiSelectMode={multiSelectMode}
      selectedIds={selectedIds}
      onToggleSelect={toggleSelect}
      onMentionModel={(modelId) => { void replayActions.mentionModelForAsk(row.askId, modelId); }}
      availableModels={models}
      mentionVisionOnly={Boolean(row.user.attachments?.some((attachment) => attachment.type === "image"))}
      currentModelId={topic?.model}
      onOpenModelManager={onOpenModelManager}
      confirmRegenerate={settings.confirmRegenerateMessage}
      translateLanguages={settings.translateLanguages}
      onTranslate={(assistantMsgId, language) => { void translateAssistantMessage(assistantMsgId, language); }}
      onClearTranslations={(assistantMsgId) => clearTranslations(assistantMsgId)}
      onRemoveTranslation={(assistantMsgId, language) => removeTranslation(assistantMsgId, language)}
      onRegenerateAssistant={(assistantMsgId) => { void replayActions.regenerateAssistantMessage(assistantMsgId); }}
      onSpeakAssistant={(assistantMsgId) => { void controller.messageActions.speakMessage(assistantMsgId); }}
      thinkingExpandedIds={expandedThinkingIds}
      onThinkingExpandedChange={controller.messageActions.setThinkingExpanded}
      showOutline={settings.showMessageOutline}
      onToolAbort={controller.messageActions.handleToolAbort}
    />
  );

  if (conversationState === "empty") {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center space-y-4">
          <Bot className="h-16 w-16 mx-auto opacity-30" />
          <p className="text-lg">{t("chat.selectOrCreate")}</p>
        </div>
      </div>
    );
  }

  if (conversationState === "loading" && !pendingInputDraft && !keepInputVisibleForExternalDraft) {
    return (
      <div ref={layout.rootRef} className="flex flex-1 min-w-0 w-full flex-col" data-testid="chat-area-loading" aria-busy="true">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/60 bg-background/50 backdrop-blur-sm">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="font-medium truncate">{topic?.title || t("common.loading")}</h2>
            {topic ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-accent/80 text-muted-foreground font-mono flex-shrink-0">{modelName}</span>
            ) : null}
          </div>
          <span className="text-xs text-muted-foreground flex-shrink-0">{t("common.loading")}</span>
        </div>
        <PageContextBar />
        <div className="min-h-0 flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
          <div className={`${CHAT_READING_COLUMN_CLASS} min-w-0 px-4 py-5 space-y-4`}>
            <div className="rounded-2xl border border-border/60 bg-card/60 p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Bot className="h-4 w-4 opacity-60" /><span>{t("common.loading")}</span></div>
              <div className="mt-4 space-y-3"><Skeleton className="h-4 w-40" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-[92%]" /><Skeleton className="h-4 w-[76%]" /></div>
            </div>
            <div className="rounded-2xl border border-border/40 bg-background/50 p-4 space-y-3"><Skeleton className="h-4 w-28" /><Skeleton className="h-20 w-full rounded-xl" /></div>
          </div>
        </div>
      </div>
    );
  }

  if (!topic) return null;

  const activeModelOption = modelMap.get(topic.model) as { transportProtocol?: TransportProtocol } | undefined;
  const reasoningState: ChatInputReasoningViewModel | undefined = resolveProviderReasoningDescriptor({
    model: topic.model,
    transportProtocol: activeModelOption?.transportProtocol,
    modelParams: topic.modelParams,
  });

  return (
    <>
      <div ref={layout.rootRef} className="flex flex-1 min-w-0 w-full flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/60 bg-background/50 backdrop-blur-sm">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="font-medium truncate">{topic.title}</h2>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-accent/80 text-muted-foreground font-mono flex-shrink-0">{modelName}</span>
          </div>
          <button type="button" onClick={controller.messageActions.toggleNewContext} disabled={isLoading} className="text-xs text-muted-foreground flex-shrink-0 hover:text-foreground transition-colors disabled:opacity-50">
            ≈ {tokenEstimate} {t("chat.tokens")}
          </button>
        </div>
        <PageContextBar />
        <div className="relative flex-1 min-h-0 min-w-0 overflow-hidden">
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
            <ContentSearch
              open={searchOpen}
              query={searchQuery}
              includeUser={searchIncludeUser}
              caseSensitive={effectiveSearchCaseSensitive}
              canCaseSensitive={searchCanCaseSensitive}
              wholeWord={effectiveSearchWholeWord}
              canWholeWord={searchCanWholeWord}
              total={searchMatches.length}
              activeIndex={searchActiveIndex}
              onChangeQuery={setSearchQuery}
              onToggleIncludeUser={setSearchIncludeUser}
              onToggleCaseSensitive={setSearchCaseSensitive}
              onToggleWholeWord={setSearchWholeWord}
              onPrev={searchPrev}
              onNext={searchNext}
              onClose={closeSearch}
            />
          </div>
          <div
            ref={scrollRef}
            data-testid="chat-scroll-root"
            data-follow-bottom-intent={layout.hasFollowBottomIntent ? "true" : "false"}
            data-strict-bottom={layout.isStrictBottom ? "true" : "false"}
            data-bottom-banner-count={layout.newCount}
            className="absolute inset-0 min-w-0 w-full overflow-y-auto overflow-x-hidden"
            style={{ overflowAnchor: 'none' }}
            onWheelCapture={(event) => handleWheelIntent(event.deltaY)}
            onScroll={handleScroll}
            onMouseDown={onMultiSelectMouseDown}
          >
            {messagesAll.length === 0 ? (
              <WelcomeEmptyState modelName={modelName} />
            ) : (
              <div data-testid="chat-virtual-content" className="relative w-full min-w-0 [overflow-anchor:none]" style={{ height: virtualTotalSize }}>
                {virtualItems.map((virtualItem) => {
                  const row = rows[virtualItem.index];
                  if (!row) return null;
                  return (
                    <div key={virtualItem.key} data-index={virtualItem.index} ref={measureElement} style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${virtualItem.start}px)`, overflowAnchor: "none" }}>
                      {row.kind === "group" ? (
                        <div data-testid="message-group" data-ask-id={row.askId} className={CHAT_READING_COLUMN_CLASS}>
                          {renderMessageGroup(row, {
                            availableHeight: layout.messageViewportHeight ?? undefined,
                          })}
                        </div>
                      ) : row.kind === "message" ? (
                        <MessageBubble
                          message={row.message}
                          modelId={topic.model}
                          getModelLabel={getModelLabel}
                          getProviderLogo={getProviderLogo}
                          onDelete={() => controller.messageActions.deleteMessage(row.message.id)}
                          onEdit={(content) => controller.messageActions.editMessage(row.message.id, content)}
                          onRegenerate={row.message.role === "assistant" ? () => { void replayActions.regenerateAssistantMessage(row.message.id); } : row.message.role === "user" ? () => { void replayActions.resendUserAsk(row.message.askId || row.message.id); } : undefined}
                          confirmDelete={settings.confirmDeleteMessage}
                          confirmRegenerate={settings.confirmRegenerateMessage}
                          translateLanguages={settings.translateLanguages}
                          exportMenuOptions={settings.exportMenuOptions}
                          availableModels={models}
                          mentionVisionOnly={Boolean(row.message.role === "assistant" && row.message.askId && askIdHasImage.get(row.message.askId))}
                          onOpenModelManager={onOpenModelManager}
                          onTranslate={(language) => { void translateAssistantMessage(row.message.id, language); }}
                          onClearTranslations={() => clearTranslations(row.message.id)}
                          onRemoveTranslation={(language) => removeTranslation(row.message.id, language)}
                          onMentionModel={(modelId) => {
                            const askId = row.message.askId;
                            if (!askId) return;
                            void replayActions.mentionModelForAsk(askId, modelId);
                          }}
                          onSpeak={row.message.role === "assistant" ? () => { void controller.messageActions.speakMessage(row.message.id); } : undefined}
                          onNewBranch={() => controller.messageActions.createBranchFromMessage(row.message.id)}
                          onEnterMultiSelect={row.message.role === "assistant" ? () => layout.enterMultiSelect(row.message.id) : undefined}
                          multiSelectMode={multiSelectMode}
                          isNavigationActive={row.message.role === "user" && row.message.id === navActiveAskId}
                          isSelected={selectedIds.has(row.message.id)}
                          onToggleSelect={row.message.role === "system" ? undefined : () => toggleSelect(row.message.id)}
                          thinkingExpanded={expandedThinkingIds.has(row.message.id)}
                          onThinkingExpandedChange={(next) => controller.messageActions.setThinkingExpanded(row.message.id, next)}
                          browserContextPreflightPhase={browserContextPreflightPhase}
                          showOutline={settings.showMessageOutline}
                          onToolAbort={controller.messageActions.handleToolAbort}
                          isLast={row.index === messagesAll.length - 1}
                          isLoading={isLoading}
                          rowClassName={CHAT_READING_COLUMN_CLASS}
                        />
                      ) : row.kind === "divider" ? (
                        <div data-testid="context-divider-row" className={`${CHAT_READING_COLUMN_CLASS} px-4 py-5`}>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground/80">
                            <div className="h-px flex-1 bg-border/60" />
                            <span className="rounded-full border border-border/60 bg-background/80 px-3 py-1 font-medium shadow-sm">
                              {t("chat.newContext")}
                            </span>
                            <div className="h-px flex-1 bg-border/60" />
                          </div>
                        </div>
                      ) : (
                        <div className={`${CHAT_READING_COLUMN_CLASS} flex gap-3 px-4 py-4`}>
                          <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-muted/30 border border-border/60 flex items-center justify-center shadow-sm">
                            <ProviderIcon providerId={String(topic.model || "").split("/")[0] || ""} customLogo={getProviderLogo(String(topic.model || "").split("/")[0] || "")} fallbackIcon={pickProviderUiMeta(String(topic.model || "").split("/")[0] || "").icon} fallbackColor={pickProviderUiMeta(String(topic.model || "").split("/")[0] || "").color} size="sm" />
                          </div>
                          <div className="flex-1"><div className="mb-1.5"><span className="text-sm font-medium text-foreground/80">{modelName}</span></div><div className="flex items-center gap-1.5 text-muted-foreground text-sm"><span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} /><span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} /><span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} /><span className="ml-2">{browserContextPreflightPhase === "style-capture" ? t("chat.collectingPageScreenshots") : t("chat.thinking")}</span></div></div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {shouldRenderMessageNavigation && (
            <MessageNavigationFloatingPanel
              navPanelOpen={navPanelOpen}
              navActiveIndex={navActiveIndex}
              navAnchorCount={navAnchors.length}
              onOpenFlow={() => setFlowOpen(true)}
              navGoTop={navGoTop}
              navGoPrev={navGoPrev}
              navGoNext={navGoNext}
              navGoBottom={navGoBottom}
              setNavPanelOpen={setNavPanelOpen}
              t={t}
            />
          )}

          <Dialog open={flowOpen} onOpenChange={setFlowOpen}>
            <DialogContent className="max-w-2xl h-[70vh] p-0 overflow-hidden flex flex-col">
              <DialogHeader className="px-4 pt-4 pb-2"><DialogTitle>{t("navigation.flow")}</DialogTitle><DialogDescription className="sr-only">{t("navigation.flow")}</DialogDescription></DialogHeader>
              <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1">
                {navAnchors.slice().reverse().map((anchor) => (
                  <button key={anchor.messageId} type="button" onClick={() => { setFlowOpen(false); navJumpToAnchor(anchor.messageId); }} className="w-full text-left px-3 py-2 rounded-lg border border-border/60 bg-muted/10 hover:bg-accent/40 transition-colors">
                    <div className="text-xs text-muted-foreground mb-0.5">{new Date(anchor.createdAt).toLocaleString(undefined, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</div>
                    <div className="text-sm text-foreground/90 line-clamp-2" title={anchor.preview}>{anchor.preview || t("chat.roleYou")}</div>
                  </button>
                ))}
              </div>
            </DialogContent>
          </Dialog>

          <Dialog
            open={Boolean(fullscreenCompareAskId && fullscreenCompareGroup)}
            onOpenChange={(nextOpen) => {
              if (!nextOpen) closeCompareFullscreen();
            }}
          >
            <DialogContent
              data-testid="compare-fullscreen-dialog"
              className="flex min-h-0 min-w-0 max-w-none flex-col gap-0 overflow-hidden rounded-[1.5rem] border border-border/70 p-0 [&>button:last-child]:hidden h-[min(92vh,calc(100dvh-1.5rem))] max-h-[calc(100dvh-1.5rem)] w-[min(1600px,calc(100vw-1.5rem))]"
            >
              <DialogHeader className="border-b border-border/60 bg-background/85 px-6 py-4 backdrop-blur-xl">
                <div className="flex min-w-0 items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1 text-left">
                    <DialogTitle className="truncate">{t("compare.title")}</DialogTitle>
                    <DialogDescription className="line-clamp-2 text-xs text-muted-foreground">
                      {fullscreenCompareGroup
                        ? `${t("compare.models", { count: fullscreenCompareGroup.assistants.length })} · ${String(fullscreenCompareGroup.user.content || "").trim() || fullscreenCompareGroup.askId}`
                        : t("compare.description")}
                    </DialogDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1.5 rounded-xl"
                      onClick={closeCompareFullscreen}
                    >
                      <Shrink className="h-3.5 w-3.5" />
                      <span>{t("group.closeFullscreen")}</span>
                    </Button>
                  </div>
                </div>
              </DialogHeader>

              <div
                ref={fullscreenBodyRef}
                data-testid="compare-fullscreen-body"
                className="min-h-0 flex-1 overflow-hidden bg-[linear-gradient(180deg,hsl(var(--background)/0.98),hsl(var(--muted)/0.55))] px-4 py-4 sm:px-5"
              >
                {fullscreenCompareGroup ? renderMessageGroup(fullscreenCompareGroup, {
                  presentation: "fullscreen",
                  availableHeight: fullscreenBodyHeight ?? undefined,
                }) : null}
              </div>
            </DialogContent>
          </Dialog>

          {multiSelectMode && selectRect && <div className="pointer-events-none absolute border-2 border-primary/60 bg-primary/10 rounded-md" style={{ left: selectRect.left, top: selectRect.top, width: selectRect.width, height: selectRect.height }} />}
        </div>
        <div ref={layout.inputWrapRef} className="relative">
          {layout.showNewBanner && (
            <div className="absolute bottom-full left-0 right-0 mb-2 flex flex-col items-center gap-2 pointer-events-none z-20">
              <Button data-testid="chat-scroll-bottom-banner" variant="secondary" size="sm" onClick={scrollToBottom} className="pointer-events-auto shadow-md max-w-[95%]">
                <ChevronDown className="h-4 w-4" />
                <span className="truncate">
                  {t("chat.newMessagesWhileReading", { count: layout.newCount })}
                </span>
              </Button>
            </div>
          )}
          {multiSelectMode ? (
            <MultiSelectToolbar
              selectedCount={selectedIds.size}
              allSelected={layout.allSelected}
              onToggleSelectAll={toggleSelectAll}
              onCopy={() => { void layout.handleMultiSelectCopy(); }}
              onSave={() => { void layout.handleMultiSelectSave(); }}
              onDelete={() => { void layout.handleMultiSelectDelete(); }}
              onClose={layout.exitMultiSelect}
            />
          ) : (
            <ChatInput
              onSend={sendActions.sendMessage}
              onStop={controller.messageActions.stopGeneration}
              isLoading={isLoading}
              onOpenPrompts={onOpenPrompts}
              onModelSwitch={onModelSwitch}
              currentModel={topic.model}
              assistantId={topic.assistantId}
              onOpenModelManager={onOpenModelManager}
              onOpenWebSearchSettings={onOpenWebSearchSettings}
              onOpenNativeWebSearchSettings={onOpenNativeWebSearchSettings}
              onOpenMcpSettings={onOpenMcpSettings}
              onOpenMemorySettings={onOpenMemorySettings}
              mcpSelection={topic.mcpSelection}
              onChangeMcpSelection={(selection) => {
                if (!topic.assistantId) return;
                updateAssistantConfig(topic.assistantId, { mcpSelection: selection });
              }}
              slashCommands={slashCommands}
              canGenerateImage={Boolean(modelMap.get(topic.model) && isInlineImageModelLike(modelMap.get(topic.model) as never))}
              enableGenerateImage={topic.enableGenerateImage}
              onToggleGenerateImage={() => {
                if (!topic.assistantId) return;
                updateAssistantConfig(topic.assistantId, { enableGenerateImage: !topic.enableGenerateImage });
              }}
              reasoningState={reasoningState}
              onChangeReasoningState={(value) => {
                if (!topic.id || !reasoningState) return;

                updateTopicMeta(topic.id, {
                  modelParams: buildModelParamsWithProviderReasoning({
                    model: topic.model,
                    transportProtocol: activeModelOption?.transportProtocol,
                    modelParams: topic.modelParams,
                    draft: {
                      value,
                      budgetText: reasoningState.budget != null ? String(reasoningState.budget) : '',
                      exclude: reasoningState.exclude,
                    },
                  }),
                });
              }}
              onInsertContextDivider={controller.messageActions.toggleNewContext}
              hasMessages={messagesAll.length > 0}
              onClearMessages={() => { void controller.messageActions.clearMessages(); }}
              externalDraft={pendingInputDraft}
              onExternalDraftAccepted={controller.completeExternalDraft}
            />
          )}
        </div>
      </div>
      <ConfirmDialogPortal />
    </>
  );
}
