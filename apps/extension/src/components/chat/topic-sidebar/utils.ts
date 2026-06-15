/**
 * 说明：`utils` 组件模块。
 *
 * 职责：
 * - 承载 `utils` 相关的当前文件实现与模块边界；
 * - 对外暴露 `sortByPinnedAndOrder`、`clampTitle`、`autoRenameWithModel` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { TopicConversation, TopicSummary } from '@/types/chat';
import { generateAutoRenameTitle } from '@/lib/chat/auto-rename';

/** 按置顶状态和排序权重对话题摘要排序。 */
export function sortByPinnedAndOrder(a: TopicSummary, b: TopicSummary) {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  const ao = typeof a.order === 'number' ? a.order : a.updatedAt;
  const bo = typeof b.order === 'number' ? b.order : b.updatedAt;
  return bo - ao;
}

/** 用指定模型为话题自动生成标题。 */
export async function autoRenameWithModel(modelId: string, messages: TopicConversation['messages']) {
  const topicMessages = Array.isArray(messages) ? messages : [];
  if (topicMessages.length < 2) return '';
  return await generateAutoRenameTitle(modelId, topicMessages);
}

/**
 * 为批量删除话题构建执行计划。
 *
 * 当删除集合会覆盖到最后一个话题时，会保留当前激活话题（如果它也在选中集合里），
 * 否则保留选中列表里的第一个有效话题，并把它转成“清空消息”而不是直接删除。
 */
export function buildTopicBatchDeletePlan(options: {
  readonly activeTopicId?: string | null;
  readonly selectedIds: ReadonlySet<string>;
  readonly totalTopicCount: number;
}) {
  const selectedTopicIds = [...options.selectedIds].map((id) => String(id || '').trim()).filter(Boolean);
  if (selectedTopicIds.length < 1) {
    return { deleteIds: [], retainedTopicId: null, clearsLastTopic: false } as const;
  }
  if (options.totalTopicCount - selectedTopicIds.length >= 1) {
    return { deleteIds: selectedTopicIds, retainedTopicId: null, clearsLastTopic: false } as const;
  }

  const activeTopicKey = String(options.activeTopicId || '').trim();
  const retainedTopicId = (
    activeTopicKey && selectedTopicIds.includes(activeTopicKey)
      ? activeTopicKey
      : selectedTopicIds[0]
  ) || null;
  if (!retainedTopicId) {
    return { deleteIds: [], retainedTopicId: null, clearsLastTopic: false } as const;
  }

  return {
    deleteIds: selectedTopicIds.filter((id) => id !== retainedTopicId),
    retainedTopicId,
    clearsLastTopic: true,
  } as const;
}
