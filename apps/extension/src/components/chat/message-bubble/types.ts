/**
 * 说明：`types` 组件模块。
 *
 * 职责：
 * - 承载 `types` 相关的当前文件实现与模块边界；
 * - 对外暴露 `MessageBubbleProps`、`FileRef`、`ImageUrlItem` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { ModelOption } from '@/hooks/useModelOptions';
import type { ChatSettings, Message } from '@/types/chat';

/** 消息气泡组件入参 */
export interface MessageBubbleProps {
  message: Message;
  onDelete: () => void;
  onEdit: (content: string) => void;
  onRegenerate?: () => void;
  isLast: boolean;
  isLoading: boolean;
  modelId?: string;
  getModelLabel?: (id: string) => string;
  getProviderLogo?: (providerId: string) => string | undefined;
  confirmDelete?: boolean;
  confirmRegenerate?: boolean;
  translateLanguages?: string[];
  onTranslate?: (language: string) => void;
  onSpeak?: () => void;
  onClearTranslations?: () => void;
  onRemoveTranslation?: (language: string) => void;
  onMentionModel?: (modelId: string) => void;
  availableModels?: ModelOption[];
  mentionVisionOnly?: boolean;
  onOpenModelManager?: () => void;
  onNewBranch?: () => void;
  onEnterMultiSelect?: () => void;
  exportMenuOptions?: ChatSettings['exportMenuOptions'];
  multiSelectMode?: boolean;
  isSelected?: boolean;
  isNavigationActive?: boolean;
  onToggleSelect?: () => void;
  thinkingExpanded?: boolean;
  onThinkingExpandedChange?: (next: boolean) => void;
  /** 当前发送前 browser-context 临时阶段；仅用于解释尚未进入模型流的等待来源，不持久化。 */
  browserContextPreflightPhase?: 'style-capture' | null;
  showOutline?: boolean;
  onToolAbort?: (toolCallId: string) => void;
  /** 根消息行额外样式，用于接入主聊天阅读列但不改变消息内部 lane 契约。 */
  rowClassName?: string;
}

/** 导出类型：`FileRef`。 */
export interface FileRef {
  id: string;
  name: string;
  mime: string;
  size: number;
}

/** 导出类型：`ImageUrlItem`。 */
export interface ImageUrlItem {
  id: string;
  url: string;
  name: string;
}
