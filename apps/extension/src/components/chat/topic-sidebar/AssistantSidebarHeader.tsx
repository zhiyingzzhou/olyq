/**
 * 说明：`AssistantSidebarHeader` 组件模块。
 *
 * 职责：
 * - 承载 `AssistantSidebarHeader` 相关的当前文件实现与模块边界；
 * - 对外暴露 `AssistantSidebarHeader` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback } from 'react';
import { AlignJustify, Bot, Plus, Tags } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { useAssistantBrowserDragSession } from '../AssistantBrowserContent.drag-session';
import type { AssistantsTabSortType } from './types';

interface AssistantSidebarHeaderProps {
  onCreateAssistant: () => void;
  sortType: AssistantsTabSortType;
  onChangeSortType: (sortType: AssistantsTabSortType) => void;
}

/** 助手标签页头部：新建助手入口与实例语义说明。 */
export function AssistantSidebarHeader({
  onCreateAssistant,
  sortType,
  onChangeSortType,
}: AssistantSidebarHeaderProps) {
  const { t } = useTranslation();
  const { locked: dragSessionLocked } = useAssistantBrowserDragSession();
  const handleCreateAssistant = useCallback(() => {
    if (dragSessionLocked) return;
    onCreateAssistant();
  }, [dragSessionLocked, onCreateAssistant]);
  const handleChangeSortType = useCallback((nextSortType: AssistantsTabSortType) => {
    if (dragSessionLocked) return;
    onChangeSortType(nextSortType);
  }, [dragSessionLocked, onChangeSortType]);

  return (
    <div className="space-y-2 px-3 pb-3 pt-2">
      <Button aria-disabled={dragSessionLocked} onClick={handleCreateAssistant} className="w-full" size="sm">
        <Plus className="mr-1 h-4 w-4" />
        {t('assistant.createNew')}
      </Button>

      <div className="flex items-center gap-2 rounded-lg border border-border/60 px-2 py-1.5">
        <span className="px-1 text-xs font-medium text-muted-foreground">{t('assistant.viewMode')}</span>
        <button
          type="button"
          aria-disabled={dragSessionLocked}
          data-testid="assistant-view-mode-list"
          onClick={() => handleChangeSortType('list')}
          className={`flex h-8 flex-1 items-center justify-center gap-1 rounded-md text-xs transition-colors ${
            sortType === 'list'
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          }`}
        >
          <AlignJustify className="h-3.5 w-3.5" />
          {t('assistant.viewList')}
        </button>
        <button
          type="button"
          aria-disabled={dragSessionLocked}
          data-testid="assistant-view-mode-tags"
          onClick={() => handleChangeSortType('tags')}
          className={`flex h-8 flex-1 items-center justify-center gap-1 rounded-md text-xs transition-colors ${
            sortType === 'tags'
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          }`}
        >
          <Tags className="h-3.5 w-3.5" />
          {t('assistant.viewTags')}
        </button>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm text-muted-foreground">
        <Bot className="h-4 w-4" />
        <span>{t('assistant.selectDesc')}</span>
      </div>
    </div>
  );
}
