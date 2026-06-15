/**
 * 说明：`MultiSelectToolbar` 组件模块。
 *
 * 职责：
 * - 承载 `MultiSelectToolbar` 相关的当前文件实现与模块边界；
 * - 对外暴露 `MultiSelectToolbar` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

/** 批量选择工具栏属性。 */
interface MultiSelectToolbarProps {
  /** 当前已选中的消息数量。 */
  readonly selectedCount: number;
  /** 当前是否已全选全部可选消息。 */
  readonly allSelected: boolean;
  /** 批量复制已选消息。 */
  readonly onCopy: () => void;
  /** 批量保存已选消息。 */
  readonly onSave: () => void;
  /** 批量删除已选消息。 */
  readonly onDelete: () => void;
  /** 切换全选或取消全选。 */
  readonly onToggleSelectAll: () => void;
  /** 退出多选模式。 */
  readonly onClose: () => void;
}

/**
 * 聊天消息多选工具栏。
 *
 * 只负责展示批量操作入口和当前选择数，
 * 真正的复制、保存和删除逻辑由外层控制器处理。
 */
export function MultiSelectToolbar({
  selectedCount,
  allSelected,
  onCopy,
  onSave,
  onDelete,
  onToggleSelectAll,
  onClose,
}: MultiSelectToolbarProps) {
  const { t } = useTranslation();

  return (
    <div className="border-t border-border/60 bg-background/60 backdrop-blur-sm px-3 py-2 flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        className="h-8 px-3 text-xs font-medium rounded-lg border-border/70 bg-background/85 shadow-sm hover:bg-accent/60"
        onClick={onToggleSelectAll}
      >
        {allSelected ? t('sidebar.unselectAll') : t('sidebar.selectAll')}
      </Button>
      <div className="text-xs text-muted-foreground">
        {t('multiSelect.selectedCount', { count: selectedCount })}
      </div>
      <div className="flex-1" />
      <Button size="sm" variant="secondary" className="h-8" disabled={selectedCount === 0} onClick={onCopy}>
        {t('chat.copy')}
      </Button>
      <Button size="sm" variant="secondary" className="h-8" disabled={selectedCount === 0} onClick={onSave}>
        {t('common.save')}
      </Button>
      <Button size="sm" variant="destructive" className="h-8" disabled={selectedCount === 0} onClick={onDelete}>
        {t('common.delete')}
      </Button>
      <Button size="sm" variant="outline" className="h-8" onClick={onClose}>
        {t('common.close')}
      </Button>
    </div>
  );
}
