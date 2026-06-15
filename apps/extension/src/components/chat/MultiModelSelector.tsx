/**
 * 说明：`MultiModelSelector` 组件模块。
 *
 * 职责：
 * - 承载 `MultiModelSelector` 相关的当前文件实现与模块边界；
 * - 对外暴露 `MultiModelSelector` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { ModelPickerDialog } from '@/components/chat/ModelPickerDialog';
import { defaultConversationModelFilter } from '@/lib/ai/model-filters';

/** 多模型对比选择器入参 */
interface Props {
  /** 是否打开弹窗 */
  open: boolean;
  /** 关闭弹窗回调 */
  onClose: () => void;
  /** 当前模型（默认会被选中且不可全部取消） */
  currentModel: string;
  /** 确认回调：返回选中的模型 ID 列表（至少 2 个） */
  onConfirm: (modelIds: string[]) => void;
}

/**
 * 多模型对比选择弹窗。
 *
 * 说明：
 * - 默认带入当前话题模型，避免用户从空状态开始选择；
 * - 只有选中至少两个模型时才允许开始对比。
 */
export function MultiModelSelector({ open, onClose, currentModel, onConfirm }: Props) {
  const { t } = useTranslation();
  // 约束：对比至少需要 1 个默认选中项；沿用"当前话题模型"为默认值。
  const [values, setValues] = useState<string[]>(() => [currentModel]);

  useEffect(() => {
    if (open) setValues([currentModel]);
  }, [open, currentModel]);

  const selectedCount = values.length;
  const canStart = selectedCount >= 2;

  const handleChange = useCallback((next: string[]) => {
    // 约束：至少保留 1 个选中项，避免出现"空对比"。
    const normalized = Array.from(new Set(next.map((x) => String(x || '').trim()).filter(Boolean)));
    if (normalized.length === 0) {
      setValues([currentModel]);
      return;
    }
    setValues(normalized);
  }, [currentModel]);

  const handleConfirm = useCallback(() => {
    if (!canStart) return;
    onConfirm(values);
    onClose();
  }, [canStart, onClose, onConfirm, values]);

  const footer = useMemo(() => (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{t('compare.selected', { count: selectedCount })}</span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
        <Button size="sm" onClick={handleConfirm} disabled={!canStart} data-testid="compare-start">
          {t('compare.start')}
        </Button>
      </div>
    </div>
  ), [canStart, handleConfirm, onClose, selectedCount, t]);

  return (
    <ModelPickerDialog
      open={open}
      multiple
      values={values}
      onChange={handleChange}
      onClose={onClose}
      title={t('compare.title')}
      description={t('compare.description')}
      // 对齐"选择模型"弹窗：多模型对比也使用同款列表/分组/置顶能力。
      filter={(m) => defaultConversationModelFilter(m)}
      // 多模型对比：操作区在底部（取消/开始对比），因此隐藏默认的多选状态条。
      hideMultiStatusBar
      // 体验优化：对比弹窗内容密度更高，需要更宽的画布避免列表项被挤压。
      contentClassName="max-w-5xl w-[min(1280px,calc(100vw-1.5rem))]"
      footer={footer}
    />
  );
}
