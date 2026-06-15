/**
 * 说明：`AssistantGeneralPresetCard` 组件模块。
 *
 * 职责：
 * - 承载通用助手 preset 的统一轻量卡片展示；
 * - 复用 role picker 与助手商店内置 general 分区的同一套卡片结构；
 * - 支持默认助手在通用分区第一项里的轻量强调状态。
 *
 * 边界：
 * - 本组件不承担浏览器场景 badge 逻辑；
 * - 不承载用户预设管理态、勾选态或预览弹窗状态。
 */
import { useTranslation } from 'react-i18next';

import type { AssistantPreset } from '@/types/assistant';

import { AssistantBuiltinPresetCard } from './AssistantBuiltinPresetCard';

/** 通用助手轻量卡片入参。 */
export interface AssistantGeneralPresetCardProps {
  /** 当前通用助手预设。 */
  preset: AssistantPreset;
  /** 卡片底部动作提示文案。 */
  actionLabel: string;
  /** 点击卡片后的上层回调。 */
  onClick: (presetId: string) => void;
  /** 是否作为 featured 卡展示。 */
  featured?: boolean;
  /** 是否把卡片撑满当前虚拟行高度。 */
  stretchToRow?: boolean;
}

/**
 * 通用助手统一卡片。
 *
 * @remarks
 * `AssistantRolePickerDialog` 与 `AssistantStoreDialog` 的内置 general 列表都必须复用它，
 * 避免再次出现“轻量选择器一套、完整商店另一套”的展示漂移。
 */
export function AssistantGeneralPresetCard({
  preset,
  actionLabel,
  onClick,
  featured = false,
  stretchToRow = false,
}: AssistantGeneralPresetCardProps) {
  const { t } = useTranslation();

  return (
    <AssistantBuiltinPresetCard
      preset={preset}
      actionLabel={actionLabel}
      featured={featured}
      stretchToRow={stretchToRow}
      featuredBadge={featured ? t('assistant.defaultAssistant') : undefined}
      metaBadges={preset.tags ?? []}
      onClick={onClick}
    />
  );
}
