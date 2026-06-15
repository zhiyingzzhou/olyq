/**
 * 说明：`TopicSidebarContent` 组件模块。
 *
 * 职责：
 * - 承载 `TopicSidebarContent` 相关的当前文件实现与模块边界；
 * - 对外暴露 `TopicSidebarContent` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useTranslation } from 'react-i18next';

import type { Assistant } from '@/types/assistant';
import type { TopicSummary } from '@/types/chat';

import { TopicSidebarManageFooter } from './TopicSidebarManageFooter';
import { TopicSidebarTopicItem } from './TopicSidebarTopicItem';
import type { SidebarPosition, TopicGroup } from './types';

type TopicSidebarRow =
  | {
      readonly kind: 'section';
      readonly key: string;
      readonly label: string;
    }
  | {
      readonly kind: 'topic';
      readonly key: string;
      readonly topic: TopicSummary;
      readonly topicGroup: TopicGroup;
    }
  | {
      readonly kind: 'empty';
      readonly key: 'topic-empty';
    };

/** 话题侧边栏主体内容属性。 */
interface TopicSidebarContentProps {
  /** 当前激活助手 ID。 */
  readonly activeAssistantId: string | null;
  /** 当前激活话题 ID。 */
  readonly activeTopicId: string | null;
  /** 全量助手列表。 */
  readonly assistants: Assistant[];
  /** 自动重命名状态表。 */
  readonly autoRenameState: Record<string, { loading?: boolean; error?: string } | undefined>;
  /** 当前是否允许拖拽排序。 */
  readonly canDragSort: boolean;
  /** 当前拖拽悬停目标 ID。 */
  readonly dragOverId: string | null;
  /** 当前拖拽中的话题信息。 */
  readonly dragState: { id: string; group: TopicGroup } | null;
  /** 筛选后的普通话题列表。 */
  readonly filteredTopics: TopicSummary[];
  /** 是否处于批量管理模式。 */
  readonly manageMode: boolean;
  /** 管理模式下是否展示搜索输入。 */
  readonly manageSearchMode: boolean;
  /** 管理模式搜索词。 */
  readonly manageSearchText: string;
  /** 当前重命名输入框值。 */
  readonly renameText: string;
  /** 当前自动重命名中的话题 ID。 */
  readonly renamingAutoId: string | null;
  /** 当前手动重命名中的话题 ID。 */
  readonly renamingId: string | null;
  /** 当前可被批量选择的话题 ID 列表。 */
  readonly selectableIds: string[];
  /** 当前已选中的话题 ID 集合。 */
  readonly selectedIds: Set<string>;
  /** 侧边栏停靠位置。 */
  readonly sidebarPosition: SidebarPosition;
  /** 非置顶话题列表。 */
  readonly topicNormal: TopicSummary[];
  /** 置顶话题列表。 */
  readonly topicPinned: TopicSummary[];
  /** 触发 AI 自动重命名。 */
  readonly onAutoRename: (id: string) => void;
  /** 更新管理模式搜索词。 */
  readonly onChangeManageSearchText: (value: string) => void;
  /** 更新重命名文本。 */
  readonly onChangeRenameText: (value: string) => void;
  /** 清空当前批量选择。 */
  readonly onClearSelection: () => void;
  /** 关闭批量管理模式。 */
  readonly onCloseManageMode: () => void;
  /** 关闭管理模式搜索。 */
  readonly onCloseSearchMode: () => void;
  /** 复制单个话题的 Markdown。 */
  readonly onCopyMarkdown: (id: string) => void;
  /** 删除话题。 */
  readonly onDelete: (id: string, options?: { pinned?: boolean }) => void;
  /** 删除当前选中的全部话题。 */
  readonly onDeleteSelected: () => void;
  /** 导出单个话题。 */
  readonly onExport: (id: string, format: 'markdown' | 'html' | 'word') => void;
  /** 提交重命名。 */
  readonly onFinishRename: () => void;
  /** 批量移动到指定助手。 */
  readonly onMoveSelectedToAssistant: (assistantId: string) => void;
  /** 把单个话题移动到指定助手。 */
  readonly onMoveToAssistant: (topicId: string, assistantId: string) => void;
  /** 打开话题 Prompt 编辑器。 */
  readonly onOpenPromptEditor: (id: string) => void;
  /** 打开管理模式搜索。 */
  readonly onOpenSearchMode: () => void;
  /** 请求清空话题消息。 */
  readonly onRequestClearMessages: (id: string) => void;
  /** 选中某个话题。 */
  readonly onSelect: (id: string) => void;
  /** 更新拖拽悬停目标。 */
  readonly onSetDragOverId: (id: string | null) => void;
  /** 更新当前拖拽状态。 */
  readonly onSetDragState: (state: { id: string; group: TopicGroup } | null) => void;
  /** 展示重命名错误提示。 */
  readonly onShowRenameError: (message: string) => void;
  /** 开始重命名某个话题。 */
  readonly onStartRename: (topic: TopicSummary) => void;
  /** 切换置顶状态。 */
  readonly onTogglePin: (id: string) => void;
  /** 全选或取消全选。 */
  readonly onToggleSelectAll: () => void;
  /** 切换单个选中状态。 */
  readonly onToggleSelected: (id: string) => void;
  /** 执行拖拽排序。 */
  readonly onTopicReorder: (sourceId: string, targetId: string, group: TopicGroup) => void;
  /** 切换侧边栏停靠位置。 */
  readonly onToggleSidebarPosition: () => void;
}

/**
 * 话题侧边栏主体列表区。
 *
 * 负责渲染 Topic 列表，并把批量管理、拖拽排序和单项操作事件分发给对应子项组件。
 */
export function TopicSidebarContent({
  activeAssistantId,
  activeTopicId,
  assistants,
  autoRenameState,
  canDragSort,
  dragOverId,
  dragState,
  filteredTopics,
  manageMode,
  manageSearchMode,
  manageSearchText,
  renameText,
  renamingAutoId,
  renamingId,
  selectableIds,
  selectedIds,
  sidebarPosition,
  topicNormal,
  topicPinned,
  onAutoRename,
  onChangeManageSearchText,
  onChangeRenameText,
  onClearSelection,
  onCloseManageMode,
  onCloseSearchMode,
  onCopyMarkdown,
  onDelete,
  onDeleteSelected,
  onExport,
  onFinishRename,
  onMoveSelectedToAssistant,
  onMoveToAssistant,
  onOpenPromptEditor,
  onOpenSearchMode,
  onRequestClearMessages,
  onSelect,
  onSetDragOverId,
  onSetDragState,
  onShowRenameError,
  onStartRename,
  onTogglePin,
  onToggleSelectAll,
  onToggleSelected,
  onTopicReorder,
  onToggleSidebarPosition,
}: TopicSidebarContentProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rows = useMemo<TopicSidebarRow[]>(() => {
    const next: TopicSidebarRow[] = [];

    if (topicPinned.length > 0) {
      next.push({
        kind: 'section',
        key: 'topic-section-pinned',
        label: t('sidebar.pinned'),
      });
      next.push(...topicPinned.map((topic) => ({
        kind: 'topic' as const,
        key: `topic-pinned-${topic.id}`,
        topic,
        topicGroup: 'pinned' as const,
      })));
    }

    next.push(...topicNormal.map((topic) => ({
      kind: 'topic' as const,
      key: `topic-normal-${topic.id}`,
      topic,
      topicGroup: 'normal' as const,
    })));

    if (filteredTopics.length === 0) {
      next.push({ kind: 'empty', key: 'topic-empty' });
    }

    return next;
  }, [filteredTopics.length, t, topicNormal, topicPinned]);
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const row = rows[index];
      if (!row) return 48;
      if (row.kind === 'section') return 28;
      if (row.kind === 'empty') return 96;
      return 48;
    },
    overscan: 10,
    getItemKey: (index) => rows[index]?.key ?? index,
    initialRect: {
      width: 0,
      height: 640,
    },
  });

  /** 渲染单条话题行，并把操作回调透传给话题项组件。 */
  const renderTopicRow = (topic: TopicSummary, topicGroup: TopicGroup) => (
    <TopicSidebarTopicItem
      key={topic.id}
      activeAssistantId={activeAssistantId}
      activeTopicId={activeTopicId}
      assistants={assistants}
      autoRenameError={autoRenameState[topic.id]?.error}
      autoRenameLoading={renamingAutoId === topic.id || Boolean(autoRenameState[topic.id]?.loading)}
      canDragSort={canDragSort}
      dragOverId={dragOverId}
      dragState={dragState}
      manageMode={manageMode}
      renameText={renameText}
      renamingAutoId={renamingAutoId}
      renamingId={renamingId}
      selected={selectedIds.has(topic.id)}
      topic={topic}
      sidebarPosition={sidebarPosition}
      topicGroup={topicGroup}
      onAutoRename={onAutoRename}
      onChangeRenameText={onChangeRenameText}
      onCopyMarkdown={onCopyMarkdown}
      onDelete={onDelete}
      onExport={onExport}
      onFinishRename={onFinishRename}
      onMoveToAssistant={onMoveToAssistant}
      onOpenPromptEditor={onOpenPromptEditor}
      onRequestClearMessages={onRequestClearMessages}
      onSelect={onSelect}
      onSetDragOverId={onSetDragOverId}
      onSetDragState={onSetDragState}
      onShowRenameError={onShowRenameError}
      onStartRename={onStartRename}
      onTogglePin={onTogglePin}
      onToggleSelected={onToggleSelected}
      onTopicReorder={onTopicReorder}
      onToggleSidebarPosition={onToggleSidebarPosition}
    />
  );

  return (
    <>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 pb-2">
        <div className="relative" style={{ height: rowVirtualizer.getTotalSize() }}>
          {rowVirtualizer.getVirtualItems().map((virtualItem) => {
            const row = rows[virtualItem.index];
            if (!row) return null;

            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={rowVirtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                {row.kind === 'section' ? (
                  <p className="px-2 py-1 text-xs font-medium text-muted-foreground">{row.label}</p>
                ) : row.kind === 'topic' ? (
                  renderTopicRow(row.topic, row.topicGroup)
                ) : (
                  <div className="px-3 py-6 text-center text-xs text-muted-foreground">{t('sidebar.emptyTopics')}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {manageMode && (
        <TopicSidebarManageFooter
          activeAssistantId={activeAssistantId}
          assistants={assistants}
          manageSearchMode={manageSearchMode}
          manageSearchText={manageSearchText}
          selectableIds={selectableIds}
          selectedCount={selectedIds.size}
          onChangeManageSearchText={onChangeManageSearchText}
          onClearSelection={onClearSelection}
          onCloseManageMode={onCloseManageMode}
          onCloseSearchMode={onCloseSearchMode}
          onDeleteSelected={onDeleteSelected}
          onMoveSelectedToAssistant={onMoveSelectedToAssistant}
          onOpenSearchMode={onOpenSearchMode}
          onToggleSelectAll={onToggleSelectAll}
        />
      )}
    </>
  );
}
