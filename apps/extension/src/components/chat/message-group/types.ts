/**
 * 说明：`types` 组件模块。
 *
 * 职责：
 * - 承载 `types` 相关的当前文件实现与模块边界；
 * - 对外暴露 `GroupPrefs`、`MessageGroupLayout`、`MessageGroupViewProps` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { ModelOption } from '@/hooks/useModelOptions';
import type { Message } from '@/types/chat';

/** 多模型分组视图所用的 groupPrefs 结构。 */
export type GroupPrefs = NonNullable<Message['groupPrefs']>;

/** 多模型分组支持的布局模式。 */
export type MessageGroupLayout = GroupPrefs['style'];

/** 多模型分组当前承载壳体模式。 */
export type MessageGroupPresentation = 'inline' | 'fullscreen';

/**
 * 多模型消息分组视图的入参。
 *
 * 说明：
 * - 该组件负责承接同一 askId 下多条 assistant 回复的布局、重试、翻译和工具交互；
 * - props 同时覆盖展示数据、偏好设置以及所有上抛动作，是分组视图的完整契约。
 */
export interface MessageGroupViewProps {
  /** askId（用于持久化 groupPrefs） */
  askId: string;
  /** 当前聊天滚动区可用高度，用于固定横向比较面板高度。 */
  availableHeight?: number;
  /** 当前分组渲染所处的承载壳体模式。 */
  presentation?: MessageGroupPresentation;
  /** 分组内 assistant 消息（至少 2 条才会显示 MessageGroup UI） */
  assistants: Message[];
  /** 分组偏好（存储在对应 user 消息上） */
  prefs: GroupPrefs;
  /** 是否仍在生成中（本组任一模型 streaming 视为 true） */
  isLoading: boolean;
  /** 当前发送前 browser-context 临时阶段；仅用于解释尚未进入模型流的等待来源，不持久化。 */
  browserContextPreflightPhase?: 'style-capture' | null;
  /** modelId → 展示名 */
  getModelLabel: (id: string) => string;
  /** modelId → 短标签（可选，用于 fold compact） */
  getModelShortLabel?: (id: string) => string;
  /** providerId → Provider.logo（用于消息卡片上的模型图标） */
  getProviderLogo?: (providerId: string) => string | undefined;

  /** 更新 groupPrefs（由上层落盘到 user message） */
  onUpdatePrefs: (patch: Partial<GroupPrefs>) => void;
  /** 打开当前视口 compare 全屏。 */
  onOpenFullscreen?: () => void;
  /** 关闭当前视口 compare 全屏。 */
  onCloseFullscreen?: () => void;
  /** 删除整组（user + all assistants） */
  onDeleteGroup: () => void;
  /** 失败重试：重试所有失败 assistant */
  onRetryFailedAll: () => void;
  /** Useful 标记 */
  onToggleUseful: (assistantMsgId: string) => void;
  /** 当前是否处于多选模式。 */
  multiSelectMode: boolean;
  /** 当前已选中的消息 ID 集合。 */
  selectedIds: ReadonlySet<string>;
  /** 切换某条 assistant 消息的选中状态。 */
  onToggleSelect: (assistantMsgId: string) => void;

  /** 可选：提及模型（对该 askId 追加一条回复） */
  onMentionModel?: (modelId: string) => void;
  /** 可选：用于判断是否有可提及模型（避免弹空列表） */
  availableModels?: ModelOption[];
  /** 可选：提及模型时是否强制"仅视觉模型"（当关联 user ask 带图时） */
  mentionVisionOnly?: boolean;
  /** 可选：当前话题模型（用于弹窗默认高亮） */
  currentModelId?: string;
  /** 可选：打开模型管理（供"选择模型"弹窗跳转） */
  onOpenModelManager?: () => void;

  /** 重试/重发是否二次确认 */
  confirmRegenerate?: boolean;
  /** 翻译语言列表 */
  translateLanguages?: string[];
  /** 翻译单条 assistant 消息 */
  onTranslate?: (assistantMsgId: string, language: string) => void;
  /** 清空翻译块 */
  onClearTranslations?: (assistantMsgId: string) => void;
  /** 移除单个翻译条目。 */
  onRemoveTranslation?: (assistantMsgId: string, language: string) => void;
  /** 重试单条 assistant 消息（replace） */
  onRegenerateAssistant?: (assistantMsgId: string) => void;
  /** 朗读单条 assistant 消息。 */
  onSpeakAssistant?: (assistantMsgId: string) => void;

  /** 可选：受控展开"思考过程" */
  thinkingExpandedIds?: Set<string>;
  /** 某条 assistant 的思考区块展开状态变化回调。 */
  onThinkingExpandedChange?: (assistantMsgId: string, next: boolean) => void;

  /** 显示消息大纲（来自 chat-dialog 设置） */
  showOutline?: boolean;

  /** MCP/工具：Abort */
  onToolAbort?: (toolCallId: string) => void;
}
