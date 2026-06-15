/**
 * 说明：`types` 组件模块。
 *
 * 职责：
 * - 承载 `types` 相关的当前文件实现与模块边界；
 * - 对外暴露 `SidebarTab`、`AssistantsTabSortType`、`TopicMetaUpdate` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { Assistant } from '@/types/assistant';
import type { Topic, TopicSummary } from '@/types/chat';

/** 侧边栏主标签。 */
export type SidebarTab = 'assistants' | 'topics';

/** 侧边栏完整面板的承载方式。 */
export type TopicSidebarPresentation = 'inline' | 'floating';

/** 助手标签页展示模式。 */
export type AssistantsTabSortType = 'list' | 'tags';

/** 侧边栏允许更新的话题元数据字段。 */
export type TopicMetaUpdate = Partial<Pick<
  Topic,
  'name' | 'pinned' | 'topicPrompt' | 'isNameManuallyEdited' | 'order'
>>;

/** TopicSidebar 组件入参：纯 Topic 侧边栏 + 批量管理。 */
export interface TopicSidebarProps {
  /** 当前侧边栏标签。 */
  readonly activeTab: SidebarTab;
  /** Topic 列表（已按 activeAssistant 过滤）。 */
  readonly topics: TopicSummary[];
  /** 助手列表（用于 Move to）。 */
  readonly assistants: Assistant[];
  /** 当前激活助手。 */
  readonly activeAssistantId: string | null;
  /** 当前激活话题 ID。 */
  readonly activeTopicId: string | null;
  /** 选择话题回调。 */
  readonly onSelect: (id: string) => void;
  /** 选择助手回调。 */
  readonly onSelectAssistant: (assistant: Assistant) => void;
  /** 新建 Topic。 */
  readonly onCreateTopic: () => void;
  /** 新建助手（具体创建来源由页面层决定，例如打开角色模板选择器）。 */
  readonly onCreateAssistant: () => void;
  /** 删除话题回调。 */
  readonly onDelete: (id: string) => void;
  /** 删除助手回调。 */
  readonly onDeleteAssistant: (id: string) => void;
  /** 手动重命名（会标记 isNameManuallyEdited=true）。 */
  readonly onRename: (id: string, name: string) => void;
  /** Patch 话题（用于 auto rename / prompt / sort 等元操作）。 */
  readonly onUpdateTopicMeta: (id: string, patch: TopicMetaUpdate) => void;
  /** 将话题移动到指定助手。 */
  readonly onMoveTopicToAssistant: (topicId: string, toAssistantId: string) => void;
  /** 以助手内原始数组顺序重排话题。 */
  readonly onReorderTopics: (assistantId: string, topicIds: string[]) => void;
  /** 重排助手实例数组顺序。 */
  readonly onReorderAssistants: (assistantIds: string[]) => void;
  /** 置顶/取消置顶。 */
  readonly onTogglePin: (id: string) => void;
  /** 清空话题消息。 */
  readonly onClearMessages: (id: string) => void;
  /** 编辑助手。 */
  readonly onEditAssistant: (assistant: Assistant) => void;
  /** 切换侧边栏标签。 */
  readonly onChangeTab: (tab: SidebarTab) => void;
  /** 是否收起侧边栏（mini 模式）。 */
  readonly collapsed?: boolean;
  /** 切换侧边栏收起状态。 */
  readonly onToggleCollapse?: () => void;
  /** 完整侧栏面板的承载方式。 */
  readonly presentation?: TopicSidebarPresentation;
  /** 覆盖式完整侧栏是否打开。 */
  readonly floatingOpen?: boolean;
  /** 更新覆盖式完整侧栏打开态。 */
  readonly onFloatingOpenChange?: (open: boolean) => void;
}

/** 侧边栏显示位置。 */
export type SidebarPosition = 'left' | 'right';

/** Topic 列表分组。 */
export type TopicGroup = 'pinned' | 'normal';

/** 当前拖拽中的话题信息。 */
export interface TopicSidebarDragState {
  /** 被拖拽的话题 ID。 */
  readonly id: string;
  /** 被拖拽话题所在分组。 */
  readonly group: TopicGroup;
}
