/**
 * 说明：`useMentionedModelsDraft` 组件模块。
 *
 * 职责：
 * - 承载聊天输入区 `@` 提及模型的助手级 draft 状态；
 * - 有 `assistantId` 时同步到 `mentioned-models-store`，没有 `assistantId` 时只保留当前挂载期内存；
 * - 向 ChatInput 和 quick panel 暴露受控模型列表与更新入口。
 *
 * 边界：
 * - 本 Hook 只管理输入区可见 chips，不修改每条用户消息里的 `Message.mentions`；
 * - 不直接访问 storage，持久化只经 `src/lib/chat/mentioned-models-store.ts`。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  getMentionedModelsForAssistant,
  normalizeMentionModelIds,
  setMentionedModelsForAssistant,
  subscribeMentionedModels,
} from '@/lib/chat/mentioned-models-store';

/** 聊天输入区提及模型 draft 控制器。 */
export interface MentionedModelsDraftController {
  /** 当前输入区可见的 `@` 提及模型 ID 列表。 */
  mentionModels: string[];
  /** 更新当前输入区的 `@` 提及模型列表。 */
  setMentionModelsForCurrentAssistant: (nextModelIds: string[]) => void;
}

/**
 * 判断两个模型 ID 列表是否完全一致。
 *
 * @param left - 左侧列表。
 * @param right - 右侧列表。
 * @returns 两个列表长度与顺序是否一致。
 */
function areModelIdListsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
}

/**
 * 聊天输入区 `@` 提及模型 draft 状态。
 *
 * @param assistantId - 当前输入区绑定的助手 ID。
 * @returns 当前模型列表与更新入口。
 */
export function useMentionedModelsDraft(assistantId?: string): MentionedModelsDraftController {
  const normalizedAssistantId = useMemo(() => String(assistantId || '').trim(), [assistantId]);
  const [mentionDraftsByAssistant, setMentionDraftsByAssistant] = useState<Record<string, string[]>>(() => (
    normalizedAssistantId
      ? { [normalizedAssistantId]: getMentionedModelsForAssistant(normalizedAssistantId) }
      : { '': [] }
  ));

  const mentionModels = useMemo(() => {
    if (Object.prototype.hasOwnProperty.call(mentionDraftsByAssistant, normalizedAssistantId)) {
      return mentionDraftsByAssistant[normalizedAssistantId] ?? [];
    }
    return normalizedAssistantId ? getMentionedModelsForAssistant(normalizedAssistantId) : [];
  }, [mentionDraftsByAssistant, normalizedAssistantId]);

  const setMentionModelsForCurrentAssistant = useCallback((nextModelIds: string[]) => {
    const normalizedModelIds = normalizeMentionModelIds(nextModelIds);
    setMentionDraftsByAssistant((current) => ({
      ...current,
      [normalizedAssistantId]: normalizedModelIds,
    }));
    if (normalizedAssistantId) {
      setMentionedModelsForAssistant(normalizedAssistantId, normalizedModelIds);
    }
  }, [normalizedAssistantId]);

  useEffect(() => {
    if (!normalizedAssistantId) {
      setMentionDraftsByAssistant((current) => (
        Object.prototype.hasOwnProperty.call(current, '')
          ? current
          : { ...current, '': [] }
      ));
      return;
    }

    /**
     * 从助手级共享配置同步当前输入区的 `@` 提及模型草稿。
     */
    const syncMentionModelsFromStore = () => {
      const nextModelIds = getMentionedModelsForAssistant(normalizedAssistantId);
      setMentionDraftsByAssistant((current) => {
        const currentModelIds = current[normalizedAssistantId] ?? [];
        if (areModelIdListsEqual(currentModelIds, nextModelIds)) return current;
        return {
          ...current,
          [normalizedAssistantId]: nextModelIds,
        };
      });
    };

    syncMentionModelsFromStore();
    return subscribeMentionedModels(syncMentionModelsFromStore);
  }, [normalizedAssistantId]);

  return {
    mentionModels,
    setMentionModelsForCurrentAssistant,
  };
}
