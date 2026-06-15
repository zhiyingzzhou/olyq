/**
 * 说明：`types` 组件模块。
 *
 * 职责：
 * - 承载 `types` 相关的当前文件实现与模块边界；
 * - 对外暴露 `TranslateFn`、`QuickPanelActionItem`、`QuickPanelMenuItem` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type {
  Dispatch,
  KeyboardEvent,
  ReactNode,
  RefObject,
  SetStateAction,
} from 'react';

import type { SelectionPanelHint } from '@/components/chat/SelectionPanelShared';
import type { ModelOption } from '@/hooks/useModelOptions';
import type { ProviderConfig } from '@/lib/ai/types';
import type { McpServerSelection } from '@/lib/mcp/selection';
import type { WebSearchProviderId, WebSearchSettings } from '@/lib/web-search/types';
import type { McpServerConfig, McpSettingsConfig } from '@/types/mcp';
import type { QuickPhrase } from '@/types/quick-phrase';

/** 导出类型：`TranslateFn`。 */
export type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

/** 导出类型：`QuickPanelActionItem`。 */
export interface QuickPanelActionItem {
  id: string;
  kind: 'action';
  name: string;
  description?: string;
  sectionKey?: string;
  sectionLabel?: string;
  icon?: ReactNode;
  suffix?: ReactNode;
  selected?: boolean;
  keepOpen?: boolean;
  alwaysVisible?: boolean;
  disabled?: boolean;
  presentation?: 'default' | 'clear' | 'settings';
  insertText?: string;
  action?: () => void;
}

/** 导出类型：`QuickPanelMenuItem`。 */
export interface QuickPanelMenuItem {
  id: string;
  kind: 'menu';
  name: string;
  description?: string;
  sectionKey?: string;
  sectionLabel?: string;
  icon?: ReactNode;
  suffix?: ReactNode;
  selected?: boolean;
  keepOpen?: boolean;
  alwaysVisible?: boolean;
  disabled?: boolean;
  presentation?: 'default' | 'clear' | 'settings';
  action?: () => void;
  menu?: QuickPanelMenu;
  children: QuickPanelItem[];
}

/** 导出类型：`QuickPanelItem`。 */
export type QuickPanelItem = QuickPanelActionItem | QuickPanelMenuItem;

/** 导出类型：`QuickPanelMenu`。 */
export type QuickPanelMenu = {
  id: string;
  title: string;
  subtitle?: string;
  headerIcon?: ReactNode;
  placeholderLabel?: string;
  hints?: SelectionPanelHint[];
  emptyTitle?: string;
  emptyDesc?: string;
  items: QuickPanelItem[];
};

/** 导出类型：`QuickPanelKind`。 */
export type QuickPanelKind = 'slash' | 'mention' | 'web-search' | 'mcp' | 'phrases';

/** 导出类型：`MentionTrigger`。 */
export type MentionTrigger = {
  type: 'input' | 'button';
  position?: number;
} | null;

/** 导出类型：`QuickPanelSlashCommand`。 */
export interface QuickPanelSlashCommand {
  id: string;
  name: string;
  description?: string;
  action: () => void;
}

/** 导出类型：`UseQuickPanelControllerOptions`。 */
export interface UseQuickPanelControllerOptions {
  t: TranslateFn;
  text: string;
  setText: Dispatch<SetStateAction<string>>;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  slashCommands: QuickPanelSlashCommand[];
  attachmentsHaveImage: boolean;
  models: ModelOption[];
  providers: ProviderConfig[];
  onOpenModelManager?: () => void;
  canBindAssistant: boolean;
  canBuiltinWebSearch: boolean;
  builtinWebSearchEnabled: boolean;
  selectedWebSearchProviderId?: WebSearchProviderId;
  webSearchSettings: WebSearchSettings;
  onToggleBuiltinWebSearch: () => void;
  onSelectExternalWebSearchProvider: (pid: WebSearchProviderId) => void;
  onOpenWebSearchSettings?: () => void;
  onOpenNativeWebSearchSettings?: () => void;
  enabledMcpServers: McpServerConfig[];
  mcpSettingsConfig: McpSettingsConfig | null;
  activeMcpSelection: McpServerSelection;
  setActiveMcpSelection: (selection: McpServerSelection) => void;
  onOpenMcpSettings?: () => void;
  /** 当前助手的常用短语。 */
  assistantRegularPhrases?: QuickPhrase[];
  /** 打开快捷短语新增弹窗。 */
  onOpenQuickPhraseCreator?: () => void;
  /** 当前输入区已选择的 `@` 提及模型，由 ChatInput 按助手维度持有。 */
  mentionModels: string[];
  /** 更新当前输入区的 `@` 提及模型草稿。 */
  onChangeMentionModels: (next: string[]) => void;
}

/** 导出类型：`QuickPanelOpenOptions`。 */
export interface QuickPanelOpenOptions {
  kind: QuickPanelKind;
  start?: number;
  filter?: string;
  mentionTrigger?: MentionTrigger;
}

/** 导出类型：`UseQuickPanelControllerResult`。 */
export interface UseQuickPanelControllerResult {
  quickPanelRef: RefObject<HTMLDivElement | null>;
  quickPanelOpen: boolean;
  quickPanelKind: QuickPanelKind | null;
  quickActiveMenu: QuickPanelMenu;
  filteredQuickItems: QuickPanelItem[];
  quickPanelHints: SelectionPanelHint[];
  quickPanelFooterLabel: string;
  quickPanelInlineSymbol: '@' | '/' | null;
  hasInlineQuery: boolean;
  quickPanelIndex: number;
  canGoBack: boolean;
  mentionModels: string[];
  setQuickPanelIndex: Dispatch<SetStateAction<number>>;
  toggleMentionModel: (modelId: string) => void;
  openQuickPanel: (options: QuickPanelOpenOptions) => void;
  toggleQuickPanel: (options: QuickPanelOpenOptions) => void;
  closeQuickPanel: (options?: { restoreFocus?: boolean }) => void;
  goBackQuickMenu: () => void;
  selectQuickItem: (item: QuickPanelItem) => void;
  handleQuickPanelKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => boolean;
  handleInputChange: (value: string, cursorPos: number) => void;
  handleInputBlur: () => void;
  resolveTextForSend: (currentText: string) => string;
}
