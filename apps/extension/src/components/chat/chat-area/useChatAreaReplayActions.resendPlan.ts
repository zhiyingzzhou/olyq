/**
 * 说明：`useChatAreaReplayActions.resendPlan` 历史用户消息重发计划模块。
 *
 * 职责：
 * - 为 `resendUserAsk` 计算需要重置的 assistant、需要插入的 stub 与 executor targets；
 * - 保持主 Hook 只负责事务编排、滚动/read marker 门面调用和错误收束。
 *
 * 边界：
 * - 本文件只做同步消息快照计算，不提交消息、不触发滚动、不读取 DOM；
 * - 生成的新 assistant stub 只服务当前重发事务，不引入持久化状态。
 */
import { isDedicatedImageModelLike } from "@/lib/ai/model-filters";
import { collectContiguousAskAssistants } from "@/lib/chat/chat-utils";
import { createId } from "@/lib/utils/id";
import type { Message } from "@/types/chat";

/** 导出类型：历史用户消息重发 executor 目标。 */
export interface ChatResendUserAskTarget {
  /** 将被 executor 更新的 assistant 消息 id。 */
  readonly assistantId: string;
  /** 归属的用户 ask id。 */
  readonly askId: string;
  /** 本次重发使用的模型 id。 */
  readonly modelId: string;
}

/** 导出类型：历史用户消息重发事务计划。 */
export interface ChatResendUserAskPlan {
  /** 规范化后的用户 ask id。 */
  readonly askId: string;
  /** 用户消息在当前消息快照里的位置。 */
  readonly userIndex: number;
  /** 被重发的用户消息。 */
  readonly userMsg: Message;
  /** 原本连续挂在该 ask 下的 assistant 数量。 */
  readonly existingAssistantCount: number;
  /** 本次因为 mention 或空回复组需要插入的 assistant stub 数量。 */
  readonly insertedModelCount: number;
  /** 已重置并插入 stub 后的事务初始消息快照。 */
  readonly workingMsgs: Message[];
  /** executor 需要逐个生成的目标。 */
  readonly targets: ChatResendUserAskTarget[];
}

/**
 * 构造历史用户消息重发事务计划。
 *
 * @returns 找不到对应用户消息时返回 `null`，调用方无需再重复扫描消息数组。
 */
export function createChatResendUserAskPlan(params: {
  readonly askId: string;
  readonly current: Message[];
  readonly modelMap: Map<string, unknown>;
  readonly topicModel: string;
}): ChatResendUserAskPlan | null {
  const { askId, current, modelMap, topicModel } = params;
  const userIndex = current.findIndex((message) => message.role === "user" && (message.askId || message.id) === askId);
  if (userIndex < 0) return null;

  const userMsg = current[userIndex]!;
  const existingAssistants = collectContiguousAskAssistants(current, userIndex, askId)
    .map((message) => ({ id: message.id, modelId: message.modelId }));
  const mentionList = Array.isArray(userMsg.mentions)
    ? Array.from(new Set(userMsg.mentions.map((item) => String(item || "").trim()).filter(Boolean)))
    : [];
  const overrideSingleModel = existingAssistants.length === 1 && mentionList.length === 0;
  const existingModelSet = new Set(existingAssistants.map((assistant) => assistant.modelId).filter(Boolean) as string[]);
  const modelsToInsert = existingAssistants.length === 0
    ? (mentionList.length > 0 ? mentionList : [topicModel])
    : mentionList.filter((modelId) => !existingModelSet.has(modelId));
  const newStubs: Message[] = modelsToInsert.map((modelId) => ({
    id: createId(),
    role: "assistant",
    askId,
    modelId,
    content: "",
    status: "preparing",
    ...(modelMap.get(modelId) && isDedicatedImageModelLike(modelMap.get(modelId) as never) ? { renderHint: "image" as const } : {}),
    createdAt: Date.now(),
  }));
  const existingAssistantIds = new Set(existingAssistants.map((assistant) => assistant.id));
  const resetMessages = current.map((message) => {
    if (message.role !== "assistant" || !existingAssistantIds.has(message.id)) return message;
    const nextModelId = overrideSingleModel ? topicModel : (message.modelId || topicModel);
    return {
      ...message,
      modelId: nextModelId,
      status: "preparing" as const,
      ...(modelMap.get(nextModelId) && isDedicatedImageModelLike(modelMap.get(nextModelId) as never) ? { renderHint: "image" as const } : { renderHint: undefined }),
      error: undefined,
      errorDetails: undefined,
    };
  });
  const insertIndex = userIndex + 1 + existingAssistants.length;
  const workingMsgs = newStubs.length > 0
    ? [...resetMessages.slice(0, insertIndex), ...newStubs, ...resetMessages.slice(insertIndex)]
    : resetMessages;
  const targets = [
    ...existingAssistants.map((assistant) => ({
      assistantId: assistant.id,
      askId,
      modelId: overrideSingleModel ? topicModel : (assistant.modelId || topicModel),
    })),
    ...newStubs.map((stub) => ({
      assistantId: stub.id,
      askId,
      modelId: stub.modelId || topicModel,
    })),
  ];

  return {
    askId,
    userIndex,
    userMsg,
    existingAssistantCount: existingAssistants.length,
    insertedModelCount: modelsToInsert.length,
    workingMsgs,
    targets,
  };
}
