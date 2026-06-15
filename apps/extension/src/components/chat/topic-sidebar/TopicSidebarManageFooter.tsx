/**
 * 说明：`TopicSidebarManageFooter` 组件模块。
 *
 * 职责：
 * - 承载 `TopicSidebarManageFooter` 相关的当前文件实现与模块边界；
 * - 对外暴露 `TopicSidebarManageFooter` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { Search, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TooltipAction } from '@/components/ui/tooltip-action';
import type { Assistant } from '@/types/assistant';
import { AssistantIcon } from '../AssistantIcon';

/** 侧边栏批量管理底栏属性。 */
interface TopicSidebarManageFooterProps {
  /** 当前激活助手 ID，用于过滤“移动到助手”目标列表。 */
  readonly activeAssistantId: string | null;
  /** 全量助手列表。 */
  readonly assistants: Assistant[];
  /** 是否处于管理模式搜索态。 */
  readonly manageSearchMode: boolean;
  /** 管理模式搜索词。 */
  readonly manageSearchText: string;
  /** 当前可被选择的话题 ID 列表。 */
  readonly selectableIds: string[];
  /** 当前已选择的话题数量。 */
  readonly selectedCount: number;
  /** 更新管理模式搜索词。 */
  readonly onChangeManageSearchText: (value: string) => void;
  /** 清空当前选择。 */
  readonly onClearSelection: () => void;
  /** 关闭批量管理模式。 */
  readonly onCloseManageMode: () => void;
  /** 关闭管理模式搜索。 */
  readonly onCloseSearchMode: () => void;
  /** 批量删除已选话题。 */
  readonly onDeleteSelected: () => void;
  /** 批量移动已选话题到指定助手。 */
  readonly onMoveSelectedToAssistant: (assistantId: string) => void;
  /** 打开管理模式搜索。 */
  readonly onOpenSearchMode: () => void;
  /** 全选或取消全选。 */
  readonly onToggleSelectAll: () => void;
}

/**
 * 话题侧边栏批量管理底栏。
 *
 * 在批量管理模式下提供搜索、全选、跨助手移动和批量删除操作。
 */
export function TopicSidebarManageFooter({
  activeAssistantId,
  assistants,
  manageSearchMode,
  manageSearchText,
  selectableIds,
  selectedCount,
  onChangeManageSearchText,
  onClearSelection,
  onCloseManageMode,
  onCloseSearchMode,
  onDeleteSelected,
  onMoveSelectedToAssistant,
  onOpenSearchMode,
  onToggleSelectAll,
}: TopicSidebarManageFooterProps) {
  const { t } = useTranslation();
  /** 当前是否已全选全部可选话题。 */
  const allSelected = selectedCount > 0 && selectedCount === selectableIds.length;

  return (
    <div className="border-t border-border bg-background/60 backdrop-blur-sm p-2 space-y-2">
      {manageSearchMode ? (
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            value={manageSearchText}
            onChange={(event) => onChangeManageSearchText(event.target.value)}
            placeholder={t('sidebar.searchTopics')}
            className="h-8 text-xs"
            autoFocus
            onKeyDown={(event) => {
              if (event.key === 'Escape') onCloseSearchMode();
            }}
          />
          <TooltipAction tooltip={t('common.close')}>
            <button
              onClick={onCloseSearchMode}
              className="p-1.5 rounded hover:bg-accent text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </TooltipAction>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleSelectAll}
            className="px-2 py-1.5 rounded-lg text-xs hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            {allSelected ? t('sidebar.unselectAll') : t('sidebar.selectAll')}
          </button>
          <TooltipAction tooltip={t('sidebar.clearSelection')}>
            <button
              onClick={onClearSelection}
              className="px-2 py-1.5 rounded-lg text-xs hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            >
              {t('sidebar.selected', { count: selectedCount })}
            </button>
          </TooltipAction>
          <div className="flex-1" />
          <TooltipAction tooltip={t('sidebar.search')}>
            <button
              onClick={onOpenSearchMode}
              className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            >
              <Search className="h-4 w-4" />
            </button>
          </TooltipAction>
        </div>
      )}

      {!manageSearchMode && (
        <div className="flex items-center gap-2">
          <Select value="" onValueChange={onMoveSelectedToAssistant}>
            <SelectTrigger className="h-8 text-xs w-44" disabled={selectedCount === 0}>
              <SelectValue placeholder={t('sidebar.moveToAssistant')} />
            </SelectTrigger>
            <SelectContent>
              {assistants
                .filter((assistant) => assistant.id !== activeAssistantId)
                .map((assistant) => (
                  <SelectItem key={assistant.id} value={assistant.id} className="text-xs">
                    <span className="inline-flex items-center gap-2">
                      <AssistantIcon
                        iconId={assistant.iconId}
                        size={14}
                        iconClassName="h-3.5 w-3.5"
                      />
                      <span>{assistant.name}</span>
                    </span>
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>

          <Button
            size="sm"
            variant="destructive"
            className="h-8 text-xs"
            disabled={selectedCount === 0}
            onClick={onDeleteSelected}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            {t('sidebar.delete')}
          </Button>

          <Button size="sm" variant="outline" className="h-8 text-xs ml-auto" onClick={onCloseManageMode}>
            {t('common.cancel')}
          </Button>
        </div>
      )}
    </div>
  );
}
