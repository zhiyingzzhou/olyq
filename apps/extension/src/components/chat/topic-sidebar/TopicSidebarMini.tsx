/**
 * 说明：`TopicSidebarMini` 组件模块。
 *
 * 职责：
 * - 承载 `TopicSidebarMini` 相关的当前文件实现与模块边界；
 * - 对外暴露 `TopicSidebarMini` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { Bot, MessageSquare, PanelLeftOpen, PanelRightOpen, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Assistant } from '@/types/assistant';
import type { TopicSummary } from '@/types/chat';

import { AssistantIcon } from '../AssistantIcon';
import type { SidebarPosition, SidebarTab } from './types';

/** 折叠态侧边栏属性。 */
interface TopicSidebarMiniProps {
  /** 当前激活标签。 */
  readonly activeTab: SidebarTab;
  /** 当前激活助手 ID。 */
  readonly activeAssistantId: string | null;
  /** 当前激活话题 ID。 */
  readonly activeTopicId: string | null;
  /** 要展示的精简助手列表。 */
  readonly assistants: Assistant[];
  /** 要展示的精简话题列表。 */
  readonly items: TopicSummary[];
  /** 侧边栏停靠位置。 */
  readonly sidebarPosition: SidebarPosition;
  /** 新建助手。 */
  readonly onCreateAssistant: () => void;
  /** 选择某个助手。 */
  readonly onSelectAssistant: (assistant: Assistant) => void;
  /** 切换标签。 */
  readonly onChangeTab: (tab: SidebarTab) => void;
  /** 新建普通话题。 */
  readonly onCreateTopic: () => void;
  /** 选中某个话题。 */
  readonly onSelect: (id: string) => void;
  /** 展开完整侧边栏。 */
  readonly onToggleCollapse?: () => void;
}

/**
 * 侧边栏折叠态导航。
 *
 * 只保留最小的新建、展开和最近话题跳转能力，
 * 避免在窄宽度下渲染完整列表与复杂操作。
 */
export function TopicSidebarMini({
  activeTab,
  activeAssistantId,
  activeTopicId,
  assistants,
  items,
  sidebarPosition,
  onCreateAssistant,
  onSelectAssistant,
  onChangeTab,
  onCreateTopic,
  onSelect,
  onToggleCollapse,
}: TopicSidebarMiniProps) {
  const { t } = useTranslation();
  const railTooltipSide = sidebarPosition === 'right' ? 'left' : 'right';
  const ExpandIcon = sidebarPosition === 'right' ? PanelRightOpen : PanelLeftOpen;

  return (
    <div
      data-testid="topic-sidebar-mini-rail"
      className={`w-12 h-full flex flex-col items-center border-border bg-sidebar py-3 gap-1 flex-shrink-0 ${
        sidebarPosition === 'right' ? 'border-l' : 'border-r'
      }`}
    >
      {onToggleCollapse && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={t('sidebar.expand')}
              data-testid="topic-sidebar-rail-expand"
              onClick={onToggleCollapse}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <ExpandIcon className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side={railTooltipSide}>
            <p className="text-xs">{t('sidebar.expand')}</p>
          </TooltipContent>
        </Tooltip>
      )}

      <div className="flex flex-col gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={t('assistant.tab')}
              onClick={() => onChangeTab('assistants')}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                activeTab === 'assistants'
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              }`}
            >
              <Bot className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side={railTooltipSide}>
            <p className="text-xs">{t('assistant.tab')}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={t('topic.tab')}
              onClick={() => onChangeTab('topics')}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                activeTab === 'topics'
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              }`}
            >
              <MessageSquare className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side={railTooltipSide}>
            <p className="text-xs">{t('topic.tab')}</p>
          </TooltipContent>
        </Tooltip>
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={activeTab === 'assistants' ? t('assistant.createNew') : t('sidebar.newTopic')}
            onClick={activeTab === 'assistants' ? onCreateAssistant : onCreateTopic}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-primary hover:bg-primary/10 transition-colors"
          >
            <Plus className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side={railTooltipSide}>
          <p className="text-xs">{activeTab === 'assistants' ? t('assistant.createNew') : t('sidebar.newTopic')}</p>
        </TooltipContent>
      </Tooltip>

      <div className="w-5 h-px bg-border/60 my-1" />

      <div className="flex-1 overflow-y-auto flex flex-col items-center gap-0.5 w-full px-1.5">
        {activeTab === 'assistants'
          ? assistants.slice(0, 30).map((assistant) => (
            <Tooltip key={assistant.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onSelectAssistant(assistant)}
                  aria-label={assistant.name}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors flex-shrink-0 ${
                    assistant.id === activeAssistantId
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                  }`}
                >
                  <AssistantIcon
                    iconId={assistant.iconId}
                    size={16}
                    iconClassName="h-4 w-4"
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent side={railTooltipSide}>
                <p className="text-xs">{assistant.name}</p>
              </TooltipContent>
            </Tooltip>
          ))
          : items.slice(0, 30).map((topic) => (
            <Tooltip key={topic.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={topic.title}
                  onClick={() => onSelect(topic.id)}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors flex-shrink-0 ${
                    topic.id === activeTopicId
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                  }`}
                >
                  <MessageSquare className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side={railTooltipSide}>
                <p className="text-xs">{topic.title}</p>
              </TooltipContent>
            </Tooltip>
          ))}
      </div>
    </div>
  );
}
