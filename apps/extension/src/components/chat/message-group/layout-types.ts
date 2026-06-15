/**
 * 说明：`layout-types` 组件模块。
 *
 * 职责：
 * - 承载 `layout-types` 相关的当前文件实现与模块边界；
 * - 对外暴露 `MessageGroupLayoutProps` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { Message } from '@/types/chat';
import type { ModelOption } from '@/hooks/useModelOptions';

import type { MessageGroupLayout as LayoutMode, MessageGroupPresentation } from './types';

/** 导出类型：`MessageGroupLayoutProps`。 */
export interface MessageGroupLayoutProps {
  readonly availableModels: ModelOption[];
  readonly availableHeight?: number;
  readonly confirmRegenerate?: boolean;
  readonly currentModelId?: string;
  readonly failedCount: number;
  readonly foldMode: 'compact' | 'expanded';
  readonly getModelLabel: (id: string) => string;
  readonly getModelShortLabel?: (id: string) => string;
  readonly getProviderLogo?: (providerId: string) => string | undefined;
  readonly gridColumns: number;
  readonly gridColumnsDraft: number;
  readonly gridPopoverTrigger: 'hover' | 'click';
  readonly isLoading: boolean;
  readonly browserContextPreflightPhase?: 'style-capture' | null;
  readonly layout: LayoutMode;
  readonly presentation: MessageGroupPresentation;
  readonly mentionVisionOnly: boolean;
  readonly multiSelectMode: boolean;
  readonly onClearTranslations?: (assistantMsgId: string) => void;
  readonly onCloseFullscreen?: () => void;
  readonly onDeleteGroup: () => void;
  readonly onOpenFullscreen?: () => void;
  readonly onGridColumnsDraftChange: (value: number) => void;
  readonly onMentionModel?: (modelId: string) => void;
  readonly onOpenModelManager?: () => void;
  readonly onRegenerateAssistant?: (assistantMsgId: string) => void;
  readonly onRemoveTranslation?: (assistantMsgId: string, language: string) => void;
  readonly onRetryFailedAll: () => void;
  readonly onSpeakAssistant?: (assistantMsgId: string) => void;
  readonly onThinkingExpandedChange?: (assistantMsgId: string, next: boolean) => void;
  readonly onToggleSelect: (assistantMsgId: string) => void;
  readonly onToggleUseful: (assistantMsgId: string) => void;
  readonly onToolAbort?: (toolCallId: string) => void;
  readonly onTranslate?: (assistantMsgId: string, language: string) => void;
  readonly onUpdatePrefs: (patch: Record<string, unknown>) => void;
  readonly selected: Message;
  readonly selectedIds: ReadonlySet<string>;
  readonly selectedModelId: string;
  readonly showOutline: boolean;
  readonly sortedAssistants: Message[];
  readonly thinkingExpandedIds?: Set<string>;
  readonly translateLanguages?: string[];
}
