/**
 * 说明：`useChatAreaSendActions` 组件模块。
 *
 * 职责：
 * - 承载 `useChatAreaSendActions` 相关的当前文件实现与模块边界；
 * - 对外暴露 `useChatAreaSendActions` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { TFunction } from "i18next";
import { createId } from "@/lib/utils/id";
import { buildChatSystemContent } from "@/lib/chat/context-pipeline";
import { resolveBrowserContextEffectiveState, resolveBrowserContextForSend } from "@/lib/browser-context";
import { useChatStore } from "@/hooks/useChatStore";
import { useAssistantStore } from "@/hooks/useAssistantStore";
import { useChatSettingsStore } from "@/hooks/useChatSettingsStore";
import { toast } from "@/hooks/useToast";
import i18n from "@/i18n";
import { formatI18nText } from "@/lib/i18n/format";
import { toI18nTextFromError } from "@/lib/i18n/error";
import { isDedicatedImageModelLike } from "@/lib/ai/model-filters";
import { blobToDataUrl, getAttachmentBlob } from "@/lib/attachments";
import type { ApiAttachment, ApiFileAttachment, Msg as ApiMsg } from "@/lib/chat-stream";
import type { Message, ResolvedConversationContext, UpdateTopicMessages } from "@/types/chat";
import { getActiveMessages } from "@/types/chat";
import { toAutoRenameErrorText } from "@/lib/chat/auto-rename";
import { pickContextMessages, shouldIncludeMessageInModelContext } from "@/lib/chat/chat-utils";
import { normalizeMessageContextReferences } from "@/lib/chat/message-context-references";
import { runStreamChat, type BuildApiMessagesOptions, type SendMessageParams } from "@/lib/chat/run-stream-chat";
import { isLikelyTextAttachment } from "@/lib/chat/attachment-media";
import { normalizeOutboundApiAttachments, normalizeOutboundImageBlobToApiAttachment } from "@/lib/chat/outbound-image-normalization";
import { buildPageStyleVisionAttachmentsFromFrames, supportsPageStyleVisionInput } from "./page-style-input";
import { collectInputImagesFromAttachments, generateImageReplyAttachments, runAutoRename } from "./shared";
import { executeMultiTargetChatTransaction } from "./multi-target-chat-executor";
import { resolveBrowserContextSendPreflightBudgetMs } from "./browser-context-send-budget";
import {
  buildUserModelContent,
  isAudioFileAttachment,
  normalizeSendMessageInput,
  resolveBuildApiMessagesTargetContext,
  shouldUseNativeFileAttachment,
  type NormalizedSendMessageInput,
} from "./useChatAreaSendActions.helpers";

/**
 * 导出 Hook：`useChatAreaSendActions`。
 *
 * @remarks
 * 对外暴露可复用的状态、派生值或副作用封装，调用方应遵守 Hook 调用约束。
 */
export function useChatAreaSendActions(params: {
  abortControllersRef: MutableRefObject<Map<string, { controller: AbortController; topicId: string; kind: "chat" | "aux" }>>;
  isLoading: boolean;
  latestMessagesRef: MutableRefObject<Message[]>;
  modelMap: Map<string, unknown>;
  onUpdateMessages: UpdateTopicMessages;
  scrollToBottom: () => void;
  scrollToBottomIfFollowing?: () => boolean;
  scrollToBottomAfterNextCommit?: () => void;
  setBrowserContextPreflightPhase?: (phase: "style-capture" | null) => void;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  t: TFunction;
  topic: ResolvedConversationContext | null;
}) {
  const {
    abortControllersRef,
    isLoading,
    latestMessagesRef,
    modelMap,
    onUpdateMessages,
    scrollToBottom,
    scrollToBottomIfFollowing,
    scrollToBottomAfterNextCommit,
    setBrowserContextPreflightPhase,
    setIsLoading,
    t,
    topic,
  } = params;
  const continueBottomIntent = useCallback(() => {
    if (scrollToBottomIfFollowing) return scrollToBottomIfFollowing();
    scrollToBottom();
    return true;
  }, [scrollToBottom, scrollToBottomIfFollowing]);
  const scrollToLatestAfterNextCommit = scrollToBottomAfterNextCommit ?? scrollToBottom;

  const buildApiMessages = useCallback(async ({ modelId, systemContent, contextMessages, signal, ephemeralUserAttachments }: BuildApiMessagesOptions) => {
    const targetContext = await resolveBuildApiMessagesTargetContext(modelId);
    const extraAttachmentsByMessageId = new Map(
      (Array.isArray(ephemeralUserAttachments) ? ephemeralUserAttachments : [])
        .map((item) => {
          const messageId = String(item?.messageId || "").trim();
          const attachments = Array.isArray(item?.attachments) ? item.attachments : [];
          return messageId && attachments.length > 0 ? [messageId, attachments] as const : null;
        })
        .filter((item): item is readonly [string, ApiAttachment[]] => Boolean(item)),
    );
        /**
     * 内部函数变量：`toApiMsg`。
     *
     * @remarks
     * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
     */
    const toApiMsg = async (message: Message): Promise<ApiMsg | null> => {
      if (!shouldIncludeMessageInModelContext(message)) return null;
      const base: ApiMsg = {
        role: message.role,
        content: message.role === "user"
          ? buildUserModelContent({
            text: message.content,
            modelContext: message.modelContext,
            contextReferences: message.contextReferences,
            t,
          })
          : message.content,
      };
      if (message.role !== "user") return base;
      const attachments = Array.isArray(message.attachments) ? message.attachments : [];

      let content = base.content;
      const nativeAttachments: ApiAttachment[] = [];
      const rawEphemeralAttachments = extraAttachmentsByMessageId.get(message.id) ?? [];

      if (attachments.length > 0) {
        const fileParts: string[] = [];

        for (const attachment of attachments) {
          if (signal.aborted) break;
          if (!attachment?.id || typeof attachment.id !== "string" || !attachment.id.trim()) continue;

          if (attachment.type === "image") {
            const blob = await getAttachmentBlob(attachment.id);
            if (!blob) continue;
            nativeAttachments.push(await normalizeOutboundImageBlobToApiAttachment({
              blob,
              name: attachment.name,
              mime: attachment.mime,
              size: attachment.size,
              signal,
            }));
            continue;
          }

          if (attachment.type !== "file") continue;
          if (isAudioFileAttachment(attachment)) continue;

          const blob = await getAttachmentBlob(attachment.id);
          const mime = String(attachment.mime || (blob as { type?: string } | null)?.type || "").toLowerCase();
          const name = String(attachment.name || "file");

          if (blob && shouldUseNativeFileAttachment({ mime, context: targetContext })) {
            const dataUrl = await blobToDataUrl(blob);
            nativeAttachments.push({
              type: "file",
              dataUrl,
              mime,
              name,
              size: attachment.size,
            } satisfies ApiFileAttachment);
            continue;
          }

          const isText = isLikelyTextAttachment(name, mime);
          if (blob && isText) {
            const raw = await blob.text();
            fileParts.push(`\n\n[文件：${name}]\n${raw.length > 12_000 ? `${raw.slice(0, 12_000)}\n\n…（已截断）` : raw}`);
          } else {
            fileParts.push(`\n\n[文件：${name}，类型：${mime || "unknown"}，大小：${attachment.size || 0} bytes]`);
          }
        }

        if (fileParts.length > 0) {
          content = content ? `${content}${fileParts.join("")}` : fileParts.join("").trimStart();
        }
      }

      const ephemeralAttachments = rawEphemeralAttachments.length > 0
        ? await normalizeOutboundApiAttachments(rawEphemeralAttachments, signal)
        : [];

      return {
        ...base,
        content,
        ...(
          nativeAttachments.length > 0 || ephemeralAttachments.length > 0
            ? { attachments: [...nativeAttachments, ...ephemeralAttachments] }
            : {}
        ),
      };
    };

    return [
      ...(systemContent ? [{ role: "system" as const, content: systemContent } satisfies ApiMsg] : []),
      ...((await Promise.all(contextMessages.map(toApiMsg))).filter(Boolean) as ApiMsg[]),
    ];
  }, [t]);

  const sendMessage = useCallback(async ({ text, modelContext, contextReferences, attachments, mentionModels }: SendMessageParams) => {
    if (!topic || isLoading) return;
    const normalizedModelContext = String(modelContext || "").trim();
    const { references: normalizedContextReferences } = normalizeMessageContextReferences(contextReferences);
    const askId = createId();
    const normalizedMentions = Array.isArray(mentionModels) ? Array.from(new Set(mentionModels.map((item) => String(item || "").trim()).filter(Boolean))) : [];
    const shouldMultiModel = normalizedMentions.length > 0;
    const requestId = createId();
    const controller = new AbortController();
    abortControllersRef.current.set(requestId, { controller, topicId: topic.id, kind: "chat" });
    setIsLoading(true);

    let normalizedInput: NormalizedSendMessageInput;
    try {
      const audioAttachments = (Array.isArray(attachments) ? attachments : []).filter(isAudioFileAttachment);
      if (audioAttachments.length > 0) {
        const defaultTranscriptionModel = String(useChatSettingsStore.getState().settings.defaultTranscriptionModel || "").trim();
        if (!defaultTranscriptionModel) {
          toast({
            title: t("chat.transcriptionModelMissingTitle"),
            description: t("chat.transcriptionModelMissingDesc"),
            variant: "destructive",
          });
          return;
        }
        toast({ title: t("common.tip"), description: t("chat.transcriptionPreparing") });
      }
      normalizedInput = await normalizeSendMessageInput({
        text,
        attachments,
        signal: controller.signal,
        t,
      });
    } catch (error: unknown) {
      const cancelled = error instanceof DOMException && error.name === "AbortError";
      if (!cancelled) {
        toast({
          title: t("common.error"),
          description: formatI18nText(t, toI18nTextFromError(error)),
          variant: "destructive",
        });
      }
      abortControllersRef.current.delete(requestId);
      setIsLoading(false);
      return;
    }

    const userMsg: Message = {
      id: askId,
      role: "user",
      askId,
      content: normalizedInput.text,
      ...(normalizedModelContext ? { modelContext: normalizedModelContext } : {}),
      ...(normalizedContextReferences?.length ? { contextReferences: normalizedContextReferences } : {}),
      attachments: normalizedInput.attachments,
      createdAt: Date.now(),
      ...(shouldMultiModel ? { mentions: normalizedMentions } : {}),
    };
    const baseMsgsNoAssistants = [...getActiveMessages(topic), userMsg];

    if (shouldMultiModel) {
      const stubs: Message[] = normalizedMentions.map((modelId) => ({
        id: createId(),
        role: "assistant",
        askId,
        modelId,
        content: "",
        status: "processing",
        ...(modelMap.get(modelId) && isDedicatedImageModelLike(modelMap.get(modelId) as never) ? { renderHint: "image" as const } : {}),
        createdAt: Date.now(),
      }));
      await executeMultiTargetChatTransaction({
        abortControllersRef,
        buildApiMessages,
        contextMessages: pickContextMessages(baseMsgsNoAssistants, topic.contextLength),
        controller,
        imageSourceAttachments: normalizedInput.attachments,
        initialMessages: [...baseMsgsNoAssistants, ...stubs],
        latestMessagesRef,
        modelMap,
        onInitialMessagesCommitted: scrollToLatestAfterNextCommit,
        onUpdateMessages,
        query: normalizedInput.text,
        setBrowserContextPreflightPhase,
        setIsLoading,
        t,
        targets: stubs.map((stub) => ({
          assistantId: stub.id,
          askId,
          modelId: stub.modelId || topic.model,
        })),
        topic,
        transactionId: requestId,
        userMessage: userMsg,
      });
      return;
    }

    onUpdateMessages(topic.id, baseMsgsNoAssistants);
    scrollToLatestAfterNextCommit();

    if (modelMap.get(topic.model) && isDedicatedImageModelLike(modelMap.get(topic.model) as never)) {
      let stub: Message | null = null;
      try {
        const imagePrompt = buildUserModelContent({
          text: normalizedInput.text,
          modelContext: normalizedModelContext,
          contextReferences: normalizedContextReferences,
          t,
        });
        const inputImages = await collectInputImagesFromAttachments(normalizedInput.attachments, controller.signal);
        if (!imagePrompt.trim() && inputImages.length === 0) {
          abortControllersRef.current.delete(requestId);
          setIsLoading(false);
          toast({ title: t("chat.imagePromptEmptyTitle"), description: t("chat.imagePromptEmptyDesc"), variant: "destructive" });
          return;
        }
        if (inputImages.length > 0) {
          toast({ title: t("common.tip"), description: t("chat.imageInputNotice", { count: inputImages.length }) });
        }
        stub = { id: createId(), role: "assistant", askId, modelId: topic.model, content: "", status: "processing", renderHint: "image", createdAt: Date.now() };
        onUpdateMessages(topic.id, [...baseMsgsNoAssistants, stub]);
        continueBottomIntent();
        const outputAttachments = await generateImageReplyAttachments({ model: topic.model, prompt: imagePrompt, inputImages, signal: controller.signal });
        onUpdateMessages(topic.id, latestMessagesRef.current.map((message) => message.id === stub!.id ? { ...message, content: "", attachments: outputAttachments, status: "success", error: undefined } : message));
      } catch (error: unknown) {
        const cancelled = error instanceof DOMException && error.name === "AbortError";
        const errorText = cancelled ? t("chat.generationCancelled") : formatI18nText(t, toI18nTextFromError(error));
        const errorI18n = cancelled ? { key: "chat.generationCancelled" } : toI18nTextFromError(error);
        if (stub) {
          onUpdateMessages(topic.id, latestMessagesRef.current.map((item) => item.id === stub!.id ? { ...item, status: cancelled ? "paused" : "error", error: errorI18n } : item));
        } else {
          toast({ title: cancelled ? t("common.cancelled") : t("common.error"), description: errorText, variant: cancelled ? "default" : "destructive" });
        }
      } finally {
        abortControllersRef.current.delete(requestId);
        setIsLoading(false);
      }
      return;
    }

    try {
      const contextMsgs = pickContextMessages(baseMsgsNoAssistants, topic.contextLength);
      const browserContextEffectiveState = resolveBrowserContextEffectiveState({
        assistant: useAssistantStore.getState().assistants.find((assistant) => assistant.id === topic.assistantId) ?? null,
        conversationKey: topic.id,
      });
      const requireStyleSignals = browserContextEffectiveState.effective
        && browserContextEffectiveState.conversationMode.styleSignalsEnabled;
      const requireCaptures = requireStyleSignals && supportsPageStyleVisionInput(modelMap.get(topic.model));
      let preflight;
      try {
        if (requireCaptures) setBrowserContextPreflightPhase?.("style-capture");
        preflight = await resolveBrowserContextForSend({
          assistantId: topic.assistantId,
          conversationKey: topic.id,
          requireReadableDom: true,
          requireStyleSignals,
          requireCaptures,
          budgetMs: resolveBrowserContextSendPreflightBudgetMs({
            ...browserContextEffectiveState,
            requireCaptures,
          }),
          signal: controller.signal,
        });
      } finally {
        if (requireCaptures) setBrowserContextPreflightPhase?.(null);
      }
      const { systemContent } = await buildChatSystemContent({
        topic,
        query: normalizedInput.text,
        browserContextPrompt: preflight.browserContext.prompt,
        signal: controller.signal,
      });
      const pageStyleAttachments = requireCaptures && preflight.captureFrames.length > 0
        ? buildPageStyleVisionAttachmentsFromFrames(preflight.captureFrames)
        : undefined;
      const apiMsgs = await buildApiMessages({
        modelId: topic.model,
        systemContent,
        contextMessages: contextMsgs,
        signal: controller.signal,
        ephemeralUserAttachments: pageStyleAttachments
          ? [{ messageId: userMsg.id, attachments: pageStyleAttachments }]
          : undefined,
      });
      await runStreamChat({
        apiMsgs,
        topic,
        modelId: topic.model,
        askId,
        targetIndex: baseMsgsNoAssistants.length,
        mode: "replace",
        signal: controller.signal,
        baseMsgs: baseMsgsNoAssistants,
        topicId: topic.id,
        onUpdateMessages,
        onInitialAssistantSnapshotCommitted: () => {
          continueBottomIntent();
        },
        getLatestMessages: () => latestMessagesRef.current,
        onFinish: () => {
          const topicSnapshot = topic;
          const snapshotMessages = latestMessagesRef.current;
          if (!topicSnapshot?.isNameManuallyEdited && topicSnapshot?.title === i18n.t("chat.defaultTopicTitle") && snapshotMessages.filter((message) => message.role !== "system").length >= 2) {
            const store = useChatStore.getState();
            store.setAutoRenameState(topicSnapshot.id, { loading: true });
            void runAutoRename(topicSnapshot, snapshotMessages)
              .then((title) => {
                if (title) useAssistantStore.getState().updateTopicMeta(topicSnapshot.id, { name: title, isNameManuallyEdited: false });
                store.setAutoRenameState(topicSnapshot.id, null);
              })
              .catch((error: unknown) => {
                const message = formatI18nText(t, toAutoRenameErrorText(error));
                store.setAutoRenameState(topicSnapshot.id, { loading: false, error: message });
              });
          }
        },
        onError: () => undefined,
      });
    } catch (error: unknown) {
      const cancelled = error instanceof DOMException && error.name === "AbortError";
      if (!cancelled) {
        toast({
          title: t("common.error"),
          description: formatI18nText(t, toI18nTextFromError(error)),
          variant: "destructive",
        });
      }
    } finally {
      abortControllersRef.current.delete(requestId);
      setIsLoading(false);
    }
  }, [abortControllersRef, buildApiMessages, continueBottomIntent, isLoading, latestMessagesRef, modelMap, onUpdateMessages, scrollToLatestAfterNextCommit, setBrowserContextPreflightPhase, setIsLoading, t, topic]);

  const sendCompare = useCallback(async (text: string, modelIds: string[]) => {
    if (!topic || modelIds.length < 2) return;
    const askId = createId();
    const userMsg: Message = { id: askId, role: "user", askId, content: text, createdAt: Date.now() };
    const baseMsgs = [...getActiveMessages(topic), userMsg];
    setIsLoading(true);

    const requestId = createId();
    const controller = new AbortController();
    abortControllersRef.current.set(requestId, { controller, topicId: topic.id, kind: "chat" });
    const compareMessages = modelIds.map((modelId) => ({
      id: createId(),
      role: "assistant" as const,
      askId,
      modelId,
      content: "",
      status: "processing" as const,
      createdAt: Date.now(),
    }));

    await executeMultiTargetChatTransaction({
      abortControllersRef,
      buildApiMessages,
      contextMessages: pickContextMessages(baseMsgs, topic.contextLength),
      controller,
      initialMessages: [...baseMsgs, ...compareMessages],
      latestMessagesRef,
      modelMap,
      onInitialMessagesCommitted: scrollToLatestAfterNextCommit,
      onUpdateMessages,
      query: text,
      setBrowserContextPreflightPhase,
      setIsLoading,
      streamOptions: {
        developerSource: "chat-compare",
        useAssistantRuntimeFeatures: false,
        enableGenerateImageOverride: false,
        enableWebSearchOverride: false,
        webSearchProviderIdOverride: null,
        webSearchSettingsOverride: null,
        memoryOverride: null,
      },
      t,
      targets: compareMessages.map((message) => ({
        assistantId: message.id,
        askId,
        modelId: message.modelId || topic.model,
      })),
      topic,
      transactionId: requestId,
      userMessage: userMsg,
    });
  }, [abortControllersRef, buildApiMessages, latestMessagesRef, modelMap, onUpdateMessages, scrollToLatestAfterNextCommit, setBrowserContextPreflightPhase, setIsLoading, t, topic]);

  return {
    buildApiMessages,
    sendCompare,
    sendMessage,
  };
}
