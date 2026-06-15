/**
 * 说明：聊天话题清空确认动作模块。
 *
 * 职责：
 * - 统一承载“二次确认后清空当前话题消息”的交互语义；
 * - 确认通过后只调用 `clearTopicMessages` 这一条状态 owner。
 *
 * 边界：
 * - 本模块不直接渲染弹窗，只消费调用方提供的命令式 confirm；
 * - 消息正文仍由 IndexedDB 清空，话题标题重置等元信息语义继续归 `useChatStore.clearTopicMessages` 拥有。
 */
import { useChatStore } from '@/hooks/useChatStore';

/** 清空确认动作需要的最小翻译函数。 */
type ClearTopicMessagesT = (key: string) => string;

/** 清空消息确认弹窗只需要危险确认这一种配置。 */
type ClearTopicMessagesConfirm = (options: {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant: 'destructive';
}) => Promise<boolean>;

/** 确认并清空话题消息的入参。 */
export interface ConfirmClearTopicMessagesOptions {
  /** 当前调用方的命令式确认弹窗。 */
  readonly confirm: ClearTopicMessagesConfirm;
  /** 当前 UI 语言下的翻译函数。 */
  readonly t: ClearTopicMessagesT;
  /** 待清空的话题 ID。 */
  readonly topicId: string | null | undefined;
  /** 调用方是否处在禁止清空的临时状态，例如消息恢复中或生成中。 */
  readonly disabled?: boolean;
}

/**
 * 确认后清空指定话题消息。
 *
 * @param options - 当前入口提供的确认弹窗、翻译函数和话题 ID。
 * @returns `true` 表示用户确认且已提交清空动作；`false` 表示被禁用、无话题或用户取消。
 */
export async function confirmClearTopicMessages(options: ConfirmClearTopicMessagesOptions): Promise<boolean> {
  const topicId = String(options.topicId || '').trim();
  if (options.disabled || !topicId) return false;

  const ok = await options.confirm({
    title: options.t('chat.clearMessages'),
    description: options.t('chat.clearMessagesConfirmDesc'),
    confirmLabel: options.t('common.clear'),
    cancelLabel: options.t('common.cancel'),
    variant: 'destructive',
  });
  if (!ok) return false;

  useChatStore.getState().clearTopicMessages(topicId);
  return true;
}
