/**
 * 说明：`AssistantBrowserPresetCard` 组件模块。
 *
 * 职责：
 * - 承载浏览器场景 preset 的统一卡片展示；
 * - 复用 profile / 联网搜索 / MCP badge 的派生规则；
 * - 作为 role picker 与助手商店浏览器分区的单一渲染真源。
 *
 * 边界：
 * - 这里只处理浏览器场景卡片本身，不承担弹窗级状态或创建/预览编排；
 * - 不承载用户预设与通用助手卡片样式。
 */
import { useTranslation } from 'react-i18next';

import {
  BROWSER_CONTEXT_PRESET_PROFILE_MAP,
  findBuiltinBrowserContextProfile,
} from '@/lib/browser-context/types';
import { getBrowserContextProfilePresentation } from '@/lib/browser-context/profile-presentation';
import type { AssistantPreset } from '@/types/assistant';

import { AssistantBuiltinPresetCard } from './AssistantBuiltinPresetCard';

/** 浏览器场景卡片入参。 */
export interface AssistantBrowserPresetCardProps {
  /** 当前浏览器场景预设。 */
  preset: AssistantPreset;
  /** 卡片底部动作提示文案。 */
  actionLabel: string;
  /** 点击卡片后的上层回调。 */
  onClick: (presetId: string) => void;
  /** 是否把卡片撑满当前虚拟行高度。 */
  stretchToRow?: boolean;
}

/**
 * 为浏览器场景预设派生稳定 badge 列表。
 *
 * @param preset - 当前浏览器场景预设。
 * @param t - 当前语言翻译函数。
 * @returns 当前卡片需要展示的 badge 文案。
 */
function deriveBrowserPresetBadges(
  preset: AssistantPreset,
  t: ReturnType<typeof useTranslation>['t'],
) {
  const profileId = BROWSER_CONTEXT_PRESET_PROFILE_MAP[preset.id];
  const profile = findBuiltinBrowserContextProfile(profileId);
  if (!profile) return [];

  const profilePresentation = getBrowserContextProfilePresentation(profile, t);
  const badges = [
    t('assistant.browserPresetBadges.profile', { title: profilePresentation.title }),
  ];

  if (preset.enableWebSearch) badges.push(t('assistant.browserPresetBadges.webSearch'));
  if (preset.mcpSelection && preset.mcpSelection.mode !== 'disabled') {
    badges.push(t('assistant.browserPresetBadges.mcp'));
  }

  return badges;
}

/**
 * 浏览器场景统一卡片。
 *
 * @remarks
 * role picker 与助手商店浏览器分区都必须复用这套结构，避免再次漂成两份展示规范。
 */
export function AssistantBrowserPresetCard({
  preset,
  actionLabel,
  onClick,
  stretchToRow = false,
}: AssistantBrowserPresetCardProps) {
  const { t } = useTranslation();
  const badges = deriveBrowserPresetBadges(preset, t);

  return (
    <AssistantBuiltinPresetCard
      preset={preset}
      actionLabel={actionLabel}
      stretchToRow={stretchToRow}
      metaBadges={badges}
      onClick={onClick}
    />
  );
}
