/**
 * 说明：`TopicSidebarHeader` 组件模块。
 *
 * 职责：
 * - 承载 `TopicSidebarHeader` 相关的当前文件实现与模块边界；
 * - 对外暴露 `TopicSidebarHeader` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { Bot, ListChecks, Plus, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Assistant } from '@/types/assistant';
import { AssistantIcon } from '../AssistantIcon';

/** 话题侧边栏头部属性。 */
interface TopicSidebarHeaderProps {
  /** 当前激活的助手 ID。 */
  readonly activeAssistantId: string | null;
  /** 全量助手列表，用于回显当前助手。 */
  readonly assistants: Assistant[];
  /** 是否处于批量管理模式。 */
  readonly manageMode: boolean;
  /** 管理模式下是否启用专用搜索。 */
  readonly manageSearchMode: boolean;
  /** 当前搜索关键词。 */
  readonly search: string;
  /** 更新搜索关键词。 */
  readonly onChangeSearch: (value: string) => void;
  /** 新建普通话题。 */
  readonly onCreateTopic: () => void;
  /** 切换到助手标签页。 */
  readonly onOpenAssistantTab: () => void;
  /** 打开或关闭批量管理模式。 */
  readonly onToggleManageMode: () => void;
}

/**
 * 话题侧边栏头部。
 *
 * 聚合新建、助手切换和搜索入口。
 * 这里只做纯展示和事件转发，不直接持有业务状态。
 */
export function TopicSidebarHeader({
  activeAssistantId,
  assistants,
  manageMode,
  manageSearchMode,
  search,
  onChangeSearch,
  onCreateTopic,
  onOpenAssistantTab,
  onToggleManageMode,
}: TopicSidebarHeaderProps) {
  const { t } = useTranslation();
  /** 当前已选助手，用于回显按钮文案和图标。 */
  const activeAssistant = assistants.find((assistant) => assistant.id === activeAssistantId) ?? null;

  return (
    <div className="space-y-2 px-3 pb-3 pt-2">
      <div className="flex items-center gap-2">
        <Button
          onClick={onCreateTopic}
          className="flex-1"
          size="sm"
          disabled={!activeAssistantId}
        >
          <Plus className="h-4 w-4 mr-1" />
          {t('sidebar.newTopic')}
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onToggleManageMode}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                manageMode ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <ListChecks className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p className="text-xs">{t('sidebar.manage')}</p>
          </TooltipContent>
        </Tooltip>
      </div>

      <button
        type="button"
        onClick={onOpenAssistantTab}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border/60 hover:bg-accent/60 hover:border-border transition-colors text-sm text-left"
      >
        <AssistantIcon
          iconId={activeAssistant?.iconId}
          className="flex-shrink-0"
          size={16}
          iconClassName="h-4 w-4"
        />
        <span className="flex-1 truncate font-medium" title={activeAssistant?.name ?? t('sidebar.selectAssistant')}>
          {activeAssistant?.name ?? t('sidebar.selectAssistant')}
        </span>
        <Bot className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
      </button>

      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => onChangeSearch(event.target.value)}
          placeholder={t('sidebar.searchTopics')}
          className="pl-8 h-8 text-xs"
          disabled={manageMode && manageSearchMode}
        />
      </div>
    </div>
  );
}
