/**
 * 说明：`TopicSidebarTopicItem` 组件模块。
 *
 * 职责：
 * - 承载 `TopicSidebarTopicItem` 相关的当前文件实现与模块边界；
 * - 对外暴露 `TopicSidebarTopicItem` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useEffect, useRef, type FocusEvent, type MouseEvent } from 'react';
import { AlertCircle, Check, MessageSquare, Pin, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { TooltipAction } from '@/components/ui/tooltip-action';
import type { Assistant } from '@/types/assistant';
import type { TopicSummary } from '@/types/chat';

import { AssistantIcon } from '../AssistantIcon';
import type { SidebarPosition, TopicGroup } from './types';
import { useRenameableTopicRow } from './useRenameableTopicRow';

/** 刚进入重命名态时，短暂忽略由双击手势尾声带来的瞬时 blur。 */
const RENAME_INITIAL_BLUR_GUARD_MS = 80;

/** 话题列表项属性。 */
interface TopicSidebarTopicItemProps {
  /** 当前激活助手 ID。 */
  readonly activeAssistantId: string | null;
  /** 当前激活话题 ID。 */
  readonly activeTopicId: string | null;
  /** 全量助手列表，用于“移动到助手”菜单。 */
  readonly assistants: Assistant[];
  /** 自动重命名的错误信息。 */
  readonly autoRenameError?: string;
  /** 当前是否正在自动重命名。 */
  readonly autoRenameLoading: boolean;
  /** 当前是否允许拖拽排序。 */
  readonly canDragSort: boolean;
  /** 当前拖拽悬停目标 ID。 */
  readonly dragOverId: string | null;
  /** 当前拖拽状态。 */
  readonly dragState: { id: string; group: TopicGroup } | null;
  /** 是否处于批量管理模式。 */
  readonly manageMode: boolean;
  /** 当前重命名输入文本。 */
  readonly renameText: string;
  /** 当前自动重命名中的话题 ID。 */
  readonly renamingAutoId: string | null;
  /** 当前手动重命名中的话题 ID。 */
  readonly renamingId: string | null;
  /** 在管理模式下该话题是否已被选中。 */
  readonly selected: boolean;
  /** 当前项对应的话题摘要。 */
  readonly topic: TopicSummary;
  /** 侧边栏停靠位置。 */
  readonly sidebarPosition: SidebarPosition;
  /** 当前话题所属分组。 */
  readonly topicGroup: TopicGroup;
  /** 触发自动重命名。 */
  readonly onAutoRename: (id: string) => void;
  /** 更新重命名输入文本。 */
  readonly onChangeRenameText: (value: string) => void;
  /** 复制 Markdown。 */
  readonly onCopyMarkdown: (id: string) => void;
  /** 删除话题。 */
  readonly onDelete: (id: string, options: { pinned?: boolean }) => void;
  /** 导出话题。 */
  readonly onExport: (id: string, format: 'markdown' | 'html' | 'word') => void;
  /** 提交重命名。 */
  readonly onFinishRename: () => void;
  /** 把话题移动到指定助手。 */
  readonly onMoveToAssistant: (topicId: string, assistantId: string) => void;
  /** 打开话题 Prompt 编辑器。 */
  readonly onOpenPromptEditor: (id: string) => void;
  /** 请求清空消息。 */
  readonly onRequestClearMessages: (id: string) => void;
  /** 选中当前话题。 */
  readonly onSelect: (id: string) => void;
  /** 更新拖拽悬停目标。 */
  readonly onSetDragOverId: (id: string | null) => void;
  /** 更新拖拽状态。 */
  readonly onSetDragState: (state: { id: string; group: TopicGroup } | null) => void;
  /** 展示自动重命名错误。 */
  readonly onShowRenameError: (message: string) => void;
  /** 进入重命名态。 */
  readonly onStartRename: (topic: TopicSummary) => void;
  /** 切换置顶状态。 */
  readonly onTogglePin: (id: string) => void;
  /** 切换批量选中状态。 */
  readonly onToggleSelected: (id: string) => void;
  /** 执行拖拽排序。 */
  readonly onTopicReorder: (sourceId: string, targetId: string, group: TopicGroup) => void;
  /** 切换侧边栏位置。 */
  readonly onToggleSidebarPosition: () => void;
}

/**
 * 普通话题列表项。
 *
 * 支持：
 * - 单击选中 / 双击重命名
 * - 管理模式多选
 * - 置顶、拖拽排序、导出、复制、清空消息和移动到助手
 */
export function TopicSidebarTopicItem({
  activeAssistantId,
  activeTopicId,
  assistants,
  autoRenameError,
  autoRenameLoading,
  canDragSort,
  dragOverId,
  dragState,
  manageMode,
  renameText,
  renamingAutoId,
  renamingId,
  selected,
  topic,
  sidebarPosition,
  topicGroup,
  onAutoRename,
  onChangeRenameText,
  onCopyMarkdown,
  onDelete,
  onExport,
  onFinishRename,
  onMoveToAssistant,
  onOpenPromptEditor,
  onRequestClearMessages,
  onSelect,
  onSetDragOverId,
  onSetDragState,
  onShowRenameError,
  onStartRename,
  onTogglePin,
  onToggleSelected,
  onTopicReorder,
  onToggleSidebarPosition,
}: TopicSidebarTopicItemProps) {
  const { t } = useTranslation();
  /** 当前项是否处于重命名态。 */
  const renaming = renamingId === topic.id;
  /** 管理模式下该项是否允许被选择。置顶项不参与批量选择。 */
  const manageSelectable = manageMode && !topic.pinned;
  /** 当前项是否就是拖拽源。 */
  const dragging = dragState?.id === topic.id;
  /** 当前项是否是拖拽悬停目标。 */
  const dragOver = dragOverId === topic.id && dragState?.group === topicGroup;
  const { handleClick, handleDoubleClick } = useRenameableTopicRow({
    disabled: manageMode || renaming,
    isActive: topic.id === activeTopicId,
    onSelect: () => onSelect(topic.id),
    onStartRename: () => onStartRename(topic),
  });
  const renameStartedAtRef = useRef(0);

  useEffect(() => {
    if (!renaming) {
      renameStartedAtRef.current = 0;
      return;
    }

    renameStartedAtRef.current = Date.now();
  }, [renaming]);

    /**
   * 内部函数变量：`handleRowClick`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const handleRowClick = (event: MouseEvent<HTMLDivElement>) => {
    if (renaming) return;

    if (manageMode) {
      if (!manageSelectable) return;
      onToggleSelected(topic.id);
      return;
    }

    handleClick(event);
  };

  /**
   * 处理重命名输入框失焦，必要时忽略双击尾声带来的瞬时 blur。
   *
   * @param event - 当前输入框 blur 事件。
   */
  const handleRenameBlur = (event: FocusEvent<HTMLInputElement>) => {
    const blurHappenedTooEarly = Date.now() - renameStartedAtRef.current < RENAME_INITIAL_BLUR_GUARD_MS;
    const stillUsingSeedTitle = renameText.trim() === topic.title.trim();
    if (blurHappenedTooEarly && stillUsingSeedTitle) {
      // 双击结束阶段偶发会把焦点从刚挂载的输入框抢走，这里只忽略这一次瞬时 blur。
      window.setTimeout(() => {
        event.currentTarget.focus();
      }, 0);
      return;
    }

    onFinishRename();
  };

  const body = (
    <div
      className={`group relative flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors text-sm ${
        topic.id === activeTopicId ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50 text-foreground'
      } ${manageMode ? 'pr-3' : 'pr-8'} ${dragOver ? 'ring-2 ring-primary/40' : ''} ${dragging ? 'opacity-70' : ''}`}
      onClick={handleRowClick}
      onDoubleClick={(event) => {
        if (renaming || manageMode) return;
        handleDoubleClick(event);
      }}
      draggable={canDragSort}
      onDragStart={(event) => {
        if (!canDragSort) return;
        // 只在同分组内排序，拖拽状态交给父层统一协调。
        onSetDragState({ id: topic.id, group: topicGroup });
        onSetDragOverId(null);
        try {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', topic.id);
        } catch {
          // 浏览器环境不保证 dataTransfer 始终可写，这里保持静默即可。
        }
      }}
      onDragOver={(event) => {
        if (!canDragSort || !dragState) return;
        if (dragState.group !== topicGroup || dragState.id === topic.id) return;
        event.preventDefault();
        onSetDragOverId(topic.id);
      }}
      onDrop={(event) => {
        if (!canDragSort) return;
        event.preventDefault();
        if (!dragState || dragState.group !== topicGroup || dragState.id === topic.id) return;
        onTopicReorder(dragState.id, topic.id, topicGroup);
      }}
      onDragEnd={() => {
        onSetDragState(null);
        onSetDragOverId(null);
      }}
      data-topic-id={topic.id}
    >
      {manageMode ? (
        <div
          className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
            !manageSelectable
              ? 'opacity-30'
              : selected
                ? 'bg-primary border-primary text-primary-foreground'
                : 'border-muted-foreground/30'
          }`}
        >
          {selected ? <Check className="h-3 w-3" /> : null}
        </div>
      ) : (
        <MessageSquare className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
      )}

      <div className="flex-1 min-w-0">
        {renaming ? (
          <input
            className="w-full bg-transparent border-b border-primary outline-none text-sm"
            value={renameText}
            onChange={(event) => onChangeRenameText(event.target.value)}
            onBlur={handleRenameBlur}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              const input = event.currentTarget;
              // 让当前按键事件完整结束后，再通过 blur 走统一提交流程，
              // 避免输入框在 `press('Enter')` 生命周期中被同步卸载。
              window.setTimeout(() => {
                input.blur();
              }, 0);
            }}
            autoFocus
            onClick={(event) => event.stopPropagation()}
          />
        ) : (
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="truncate">{topic.title}</span>
              {topic.pinned && <Pin className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
              {autoRenameLoading && (
                <span className="text-[10px] text-muted-foreground animate-pulse flex-shrink-0">
                  {t('sidebar.renaming')}
                </span>
              )}
              {autoRenameError && !autoRenameLoading && (
                <TooltipAction tooltip={autoRenameError}>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      onShowRenameError(autoRenameError);
                    }}
                    className="flex-shrink-0 text-destructive hover:opacity-70 transition-opacity"
                  >
                    <AlertCircle className="h-3.5 w-3.5" />
                  </button>
                </TooltipAction>
              )}
            </div>
            {topic.topicPrompt && topic.topicPrompt.trim() && (
              <div className="text-[11px] text-muted-foreground/70 truncate mt-0.5">
                {topic.topicPrompt.trim()}
              </div>
            )}
          </div>
        )}
      </div>

      {!manageMode && !topic.pinned && (
        <TooltipAction tooltip={t('common.delete')}>
          <button
            onClick={(event) => {
              event.stopPropagation();
              onDelete(topic.id, { pinned: topic.pinned });
            }}
            // 非管理模式下才展示悬浮删除，避免和多选勾选逻辑冲突。
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded transition-all invisible opacity-0 group-hover:visible group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </TooltipAction>
      )}
    </div>
  );

  if (manageMode) return body;

  const movableAssistants = assistants.filter((assistant) => assistant.id !== activeAssistantId);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{body}</ContextMenuTrigger>
      {/* 右键菜单收纳低频操作，保证列表默认态尽量轻。 */}
      <ContextMenuContent className="w-56">
        <ContextMenuItem onSelect={() => onAutoRename(topic.id)} disabled={renamingAutoId === topic.id}>
          {t('sidebar.autoRename')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onStartRename(topic)}>{t('sidebar.rename')}</ContextMenuItem>
        <ContextMenuItem onSelect={() => onOpenPromptEditor(topic.id)}>{t('sidebar.topicPrompt')}</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => onTogglePin(topic.id)}>
          {topic.pinned ? t('sidebar.unpin') : t('sidebar.pin')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onRequestClearMessages(topic.id)}>
          {t('sidebar.clearMessages')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger>{t('sidebar.copy')}</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-40">
            <ContextMenuItem onSelect={() => onCopyMarkdown(topic.id)}>
              {t('sidebar.copyMarkdown')}
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSub>
          <ContextMenuSubTrigger>{t('sidebar.export')}</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-40">
            <ContextMenuItem onSelect={() => onExport(topic.id, 'markdown')}>{t('exportTopic.formatMarkdown')}</ContextMenuItem>
            <ContextMenuItem onSelect={() => onExport(topic.id, 'html')}>{t('exportTopic.formatHtml')}</ContextMenuItem>
            <ContextMenuItem onSelect={() => onExport(topic.id, 'word')}>{t('exportTopic.formatWord')}</ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger>{t('sidebar.moveToAssistant')}</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-56">
            {movableAssistants.map((assistant) => (
              <ContextMenuItem
                key={assistant.id}
                onSelect={() => onMoveToAssistant(topic.id, assistant.id)}
              >
                <AssistantIcon
                  iconId={assistant.iconId}
                  className="mr-2"
                  size={14}
                  iconClassName="h-3.5 w-3.5"
                />
                <span className="truncate">{assistant.name}</span>
              </ContextMenuItem>
            ))}
            {movableAssistants.length === 0 && (
              <ContextMenuItem disabled>{t('sidebar.noOtherAssistants')}</ContextMenuItem>
            )}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem onSelect={onToggleSidebarPosition}>
          {t('sidebar.sidebarPosition')}：{sidebarPosition === 'left' ? t('sidebar.left') : t('sidebar.right')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        {!topic.pinned && (
          <ContextMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => onDelete(topic.id, { pinned: topic.pinned })}
          >
            <Trash2 className="h-3.5 w-3.5 mr-2" />
            {t('sidebar.delete')}
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
