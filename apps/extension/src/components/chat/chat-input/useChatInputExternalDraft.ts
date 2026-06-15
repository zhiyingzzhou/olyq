/**
 * 说明：`useChatInputExternalDraft` 输入区外部草稿消费模块。
 *
 * 职责：
 * - 消费 content script / sidepanel bridge 写入的页面元素与截图草稿；
 * - 将截图草稿转为普通图片附件与可选 OCR 提示；
 * - 将元素草稿转为结构化引用卡和隐藏附件归属。
 * - 将提示词库模板写入输入框文本，保持它是用户提示模板而不是 system prompt。
 *
 * 边界：
 * - 本模块只操作输入区瞬态状态，不发送消息、不持久化草稿、不执行 OCR。
 */
import { type Dispatch, type MutableRefObject, type SetStateAction, useEffect } from 'react';
import type { MessageAttachment } from '@/types/chat';
import { createElementDraftCard, type ChatInputElementDraftCard } from './element-draft-markdown';
import type { ChatInputExternalDraft, ChatInputExternalDraftAcceptResult } from './types';

/** 已有附件进入当前输入区队列时使用的异步入口。 */
export type AddExistingChatInputAttachments = (items: MessageAttachment[]) => Promise<MessageAttachment[]>;

/** 将图片 data URL 加入当前输入区附件队列。 */
export type AddImageDataUrlChatInputAttachment = (item: {
  dataUrl: string;
  name?: string;
  mime?: string;
}) => Promise<MessageAttachment[]>;

/** `useChatInputExternalDraft` 的入参集合。 */
export type UseChatInputExternalDraftOptions = {
  /** 外部运行时请求插入的输入草稿。 */
  externalDraft?: ChatInputExternalDraft | null;
  /** 当前外部草稿被输入区真实接受或拒绝后的确认回调。 */
  onExternalDraftAccepted?: (draftId: string, result: ChatInputExternalDraftAcceptResult) => void;
  /** 已消费草稿 ID 集合，用于抵御 StrictMode effect 重放。 */
  consumedDraftIdsRef: MutableRefObject<Set<string>>;
  /** 组件挂载状态，避免附件异步完成后写入已卸载输入区。 */
  mountedRef: MutableRefObject<boolean>;
  /** 将已有附件加入输入区待发送队列。 */
  addExistingAttachments: AddExistingChatInputAttachments;
  /** 将截图 data URL 交给输入区附件系统统一校验并入队。 */
  addImageDataUrlAttachment: AddImageDataUrlChatInputAttachment;
  /** 当前输入文本 setter。 */
  setText: Dispatch<SetStateAction<string>>;
  /** 页面元素引用卡 setter。 */
  setElementDraftCards: Dispatch<SetStateAction<ChatInputElementDraftCard[]>>;
  /** 安全聚焦输入框。 */
  focusInput: () => void;
};

/**
 * 消费聊天输入区外部草稿。
 *
 * @param options - 输入区状态和附件队列入口。
 */
export function useChatInputExternalDraft({
  externalDraft,
  onExternalDraftAccepted,
  consumedDraftIdsRef,
  mountedRef,
  addExistingAttachments,
  addImageDataUrlAttachment,
  setText,
  setElementDraftCards,
  focusInput,
}: UseChatInputExternalDraftOptions) {
  useEffect(() => {
    if (!externalDraft) return;
    if (consumedDraftIdsRef.current.has(externalDraft.id)) return;
    consumedDraftIdsRef.current.add(externalDraft.id);

    if (externalDraft.kind === 'prompt-template') {
      const prompt = String(externalDraft.content || '').trim();
      if (prompt) {
        setText((currentText) => {
          const normalizedCurrent = currentText.trim();
          if (!normalizedCurrent) return prompt;
          return `${currentText}${currentText.endsWith('\n') ? '' : '\n'}${prompt}`;
        });
      }
      focusInput();
      onExternalDraftAccepted?.(externalDraft.id, { ok: true });
      return;
    }

    if (externalDraft.kind === 'screenshot') {
      void (async () => {
        try {
          const accepted = await addImageDataUrlAttachment(externalDraft.image);
          if (accepted.length === 0) throw new Error('screenshot attachment rejected');
          if (!mountedRef.current) return;
          const prompt = String(externalDraft.prompt || '').trim();
          if (prompt) {
            setText((currentText) => {
              const normalizedCurrent = currentText.trim();
              if (!normalizedCurrent) return prompt;
              return `${currentText}${currentText.endsWith('\n') ? '' : '\n'}${prompt}`;
            });
          }
          focusInput();
          onExternalDraftAccepted?.(externalDraft.id, { ok: true });
        } catch (error: unknown) {
          onExternalDraftAccepted?.(externalDraft.id, { ok: false, error });
        }
      })();
      return;
    }

    const externalAttachments = externalDraft.attachments ?? [];
    if (externalAttachments.length === 0) {
      try {
        const card = createElementDraftCard(externalDraft, []);
        if (card) setElementDraftCards((current) => [...current, card]);
        focusInput();
        onExternalDraftAccepted?.(externalDraft.id, { ok: true });
      } catch (error: unknown) {
        onExternalDraftAccepted?.(externalDraft.id, { ok: false, error });
      }
      return;
    }

    void (async () => {
      try {
        const accepted = await addExistingAttachments(externalAttachments);
        if (!mountedRef.current) return;
        const card = createElementDraftCard(externalDraft, accepted.map((attachment) => attachment.id));
        if (card) setElementDraftCards((current) => [...current, card]);
        focusInput();
        onExternalDraftAccepted?.(externalDraft.id, { ok: true });
      } catch (error: unknown) {
        onExternalDraftAccepted?.(externalDraft.id, { ok: false, error });
      }
    })();
  }, [
    addExistingAttachments,
    addImageDataUrlAttachment,
    consumedDraftIdsRef,
    externalDraft,
    focusInput,
    mountedRef,
    onExternalDraftAccepted,
    setElementDraftCards,
    setText,
  ]);
}
