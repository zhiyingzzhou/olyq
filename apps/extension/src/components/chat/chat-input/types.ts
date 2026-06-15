/**
 * 说明：`types` 组件模块。
 *
 * 职责：
 * - 承载 `types` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ChatInputSendPayload`、`ChatInputProps` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { MessageAttachment, MessageContextReference } from '@/types/chat';
import type { McpServerSelection } from '@/lib/mcp/selection';
import type { ProviderReasoningDescriptor, ProviderReasoningValue } from '@/lib/ai/provider-reasoning';
import type { ElementActionPayload, PickedElement } from '@/types/element-picker';
import type { ScreenshotEditorAction, ScreenshotEditorSourcePayload } from '@/plugins/page-tools/screenshot-capture/contracts';

/** 外部截图草稿的原始图片输入。 */
export type ChatInputExternalImageDataUrl = {
  /** 图片 data URL。 */
  dataUrl: string;
  /** 展示 / 落库文件名。 */
  name?: string;
  /** 图片 MIME。 */
  mime?: string;
};

/** 外部草稿消费结果。 */
export type ChatInputExternalDraftAcceptResult =
  | { ok: true }
  | { ok: false; error?: unknown };

/** 发送消息时的 payload（文本 + 可选图片附件引用） */
export type ChatInputSendPayload = {
  /** 用户输入的文本（已 trim；可能为空） */
  text: string;
  /** 仅发送给模型的隐藏上下文，不渲染到用户消息正文。 */
  modelContext?: string;
  /** 用户消息历史里可见的上下文引用卡。 */
  contextReferences?: MessageContextReference[];
  /** 可选：图片附件引用（存储在附件表的 id） */
  attachments?: MessageAttachment[];
  /** 可选：本次消息 \@ 提及的模型列表（用于多模型并行回复） */
  mentionModels?: string[];
};

/** 外部运行时插入到聊天输入区的页面元素草稿。 */
export type ChatInputElementExternalDraft = {
  /** 草稿唯一 ID，用于定位引用卡、隐藏上下文和卡片拥有的附件。 */
  id: string;
  /** 草稿类型：页面元素结构化上下文。 */
  kind: 'element';
  /** 被选择的页面元素结构化内容；展示文案和模型上下文在消费时按当前语言生成。 */
  element: PickedElement;
  /** 来源页面基础信息。 */
  source?: ElementActionPayload['source'];
  /** 已落库但尚未发送的附件引用。 */
  attachments?: MessageAttachment[];
};

/** 外部运行时插入到聊天输入区的截图草稿。 */
export type ChatInputScreenshotExternalDraft = {
  /** 草稿唯一 ID，用于抵御 StrictMode effect 重放导致的重复插入。 */
  id: string;
  /** 草稿类型：网页截图编辑器输出。 */
  kind: 'screenshot';
  /** 用户在截图工具条中选择的动作。 */
  action: ScreenshotEditorAction;
  /** OCR 这类动作需要预填的输入区提示。 */
  prompt?: string;
  /** 来源页面基础信息，仅用于后续需要展示或诊断时保留轻量结构。 */
  source?: ScreenshotEditorSourcePayload;
  /** 原始截图 data URL；必须由 ChatInput 附件系统统一校验大小、数量并落库。 */
  image: ChatInputExternalImageDataUrl;
};

/** 外部运行时插入到聊天输入区的提示词模板草稿。 */
export type ChatInputPromptTemplateExternalDraft = {
  /** 草稿唯一 ID，用于抵御 StrictMode effect 重放导致的重复插入。 */
  id: string;
  /** 草稿类型：提示词库模板文本。 */
  kind: 'prompt-template';
  /** 用户从提示词库选择的模板正文，只进入输入框，不参与 system prompt 持久化。 */
  content: string;
};

/** 外部运行时插入到聊天输入区的草稿。 */
export type ChatInputExternalDraft =
  | ChatInputElementExternalDraft
  | ChatInputScreenshotExternalDraft
  | ChatInputPromptTemplateExternalDraft;

/** ChatInput 组件入参：负责输入/发送/停止/快捷功能（\@切换模型、/快捷短语、图片附件） */
export type ChatInputReasoningViewModel = ProviderReasoningDescriptor;

/** ChatInput 组件入参：负责输入/发送/停止/快捷功能（\@切换模型、/快捷短语、图片附件） */
export interface ChatInputProps {
  /** 发送消息回调 */
  onSend: (payload: ChatInputSendPayload) => void;
  /** 停止生成回调（由上层终止流式请求） */
  onStop: () => void;
  /** 是否正在生成中（用于禁用输入/发送按钮） */
  isLoading: boolean;
  /** 打开提示词/模板面板 */
  onOpenPrompts: () => void;
  /** 可选：通过 \@mention 切换模型时回调（保留；chat-dialog 彻底切换后默认不再使用） */
  onModelSwitch?: (modelId: string) => void;
  /** 可选：当前模型（用于 UI 提示） */
  currentModel?: string;
  /** 可选：当前话题绑定的 assistantId（用于联网搜索等“助手级开关”） */
  assistantId?: string;
  /**
   * 可选：从"选择模型"弹窗跳转到模型管理（扩展设置 → 模型管理）。
   * - 用于 \@mention 选模型弹窗里的"模型管理"按钮。
   */
  onOpenModelManager?: () => void;
  /** 可选：跳转到扩展设置 → 联网搜索 */
  onOpenWebSearchSettings?: () => void;
  /** 可选：打开当前话题设置中的模型内置搜索参数入口。 */
  onOpenNativeWebSearchSettings?: () => void;
  /** 可选：跳转到扩展设置 → MCP */
  onOpenMcpSettings?: () => void;
  /** 可选：跳转到扩展设置 → 全局记忆 */
  onOpenMemorySettings?: () => void;
  /** 当前话题的 MCP 选择模型 */
  mcpSelection?: McpServerSelection;
  /** 更新 MCP 选择模型 */
  onChangeMcpSelection?: (selection: McpServerSelection) => void;

  /** 可选：/ QuickPanel 的命令列表 */
  slashCommands?: Array<{ id: string; name: string; description?: string; action: () => void }>;

  /** 当前模型是否支持图片生成 */
  canGenerateImage?: boolean;
  /** 图片生成开关状态 */
  enableGenerateImage?: boolean;
  /** 切换图片生成开关 */
  onToggleGenerateImage?: () => void;

  /** 当前 provider-aware 推理状态。 */
  reasoningState?: ChatInputReasoningViewModel;
  /** 切换 provider-aware 推理菜单值。 */
  onChangeReasoningState?: (value: ProviderReasoningValue) => void;

  /** 插入新上下文分隔线 */
  onInsertContextDivider?: () => void;

  /** 清空当前话题消息 */
  onClearMessages?: () => void;
  /** 是否有消息（用于决定是否显示清空按钮） */
  hasMessages?: boolean;
  /** 外部运行时请求插入的输入草稿。 */
  externalDraft?: ChatInputExternalDraft | null;
  /** 当前外部草稿被输入区真实接受或拒绝后的确认回调。 */
  onExternalDraftAccepted?: (draftId: string, result: ChatInputExternalDraftAcceptResult) => void;
}
