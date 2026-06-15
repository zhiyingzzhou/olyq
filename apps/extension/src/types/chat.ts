/**
 * 说明：`chat` 类型定义模块。
 *
 * 职责：
 * - 承载 `chat` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ToolCallInfo`、`MessageTranslation`、`MessageErrorDetails` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { McpServerSelection } from '@/lib/mcp/selection';
import type { BrowserContextConversationMode } from '@/lib/browser-context/types';
import type { ElementActionPayload, PickedElement } from '@/types/element-picker';
import type { I18nText } from '@/types/i18n';
import type { HLCTimestamp } from '@/lib/sync/hlc';

/** 模型在生成过程中发起的一次工具调用。 */
export interface ToolCallInfo {
  /** 工具调用 ID：用于将"调用事件"和"结果事件"关联起来 */
  toolCallId: string;
  /** 工具名称：通常是 MCP tool name（例如 "browser/screenshot"） */
  toolName: string;
  /** 工具入参：由模型生成，结构取决于工具的 inputSchema */
  args: unknown;
  /** 工具执行完成后填充 */
  result?: unknown;
  /**
   * 工具状态：
   * - calling：调用中
   * - done：已完成
   * - error：执行失败（工具侧错误/网络错误）
   * - expired：执行超时
   * - cancelled：用户中止/请求终止
   */
  status: 'calling' | 'done' | 'error' | 'expired' | 'cancelled';
  /** 可选：错误信息（status=error/expired/cancelled 时展示）。跨运行时只保存 i18n key，不提前格式化。 */
  error?: I18nText;
}

/** assistant trace 中的一段思考过程。 */
export interface MessageReasoningTraceItem {
  /** trace 条目类型：思考过程。 */
  kind: 'reasoning';
  /** 当前累计到该条目的 reasoning 文本。 */
  text: string;
}

/** assistant trace 中的一次工具调用。 */
export interface MessageToolCallTraceItem extends ToolCallInfo {
  /** trace 条目类型：工具调用。 */
  kind: 'tool-call';
}

/** assistant 内部过程的统一 trace 条目。 */
export type MessageTraceItem = MessageReasoningTraceItem | MessageToolCallTraceItem;

/** 单条翻译结果。 */
export interface MessageTranslation {
  /** 目标语言：通常使用 BCP 47 语言标签或 UI 配置里的语言名。 */
  language: string;
  /** 翻译状态：loading=进行中，success=成功，error=失败。 */
  status: 'loading' | 'success' | 'error';
  /** 翻译后的正文内容。 */
  content: string;
  /** 翻译失败时的摘要错误文案。跨运行时只保存 i18n key，不提前格式化。 */
  error?: I18nText;
  /** 翻译失败时的结构化错误详情。 */
  errorDetails?: MessageErrorDetails;
}

/** 消息错误详情。 */
export interface MessageErrorDetails {
  /** 错误名称（Error.name）。 */
  name?: string;
  /** 面向用户的国际化错误文案。 */
  messageI18n?: I18nText;
  /** 错误信息（Error.message）。 */
  message?: string;
  /** 堆栈信息（Error.stack）。 */
  stack?: string;
  /** 错误原因（Error.cause 等；已序列化/截断）。 */
  cause?: string;
}

/** 多模型分组展示偏好。 */
export interface MessageGroupPreferences {
  /** 分组布局模式。 */
  style: 'fold' | 'vertical' | 'horizontal' | 'grid';
  /** 折叠模式下的默认展开形式。 */
  foldDisplayMode?: 'compact' | 'expanded';
  /** 折叠模式当前选中的模型 ID。 */
  foldSelectedModelId?: string;
  /** 网格模式列数。 */
  gridColumns?: number;
  /** 网格模式详情浮层触发方式。 */
  gridPopoverTrigger?: 'hover' | 'click';
}

/** 联网搜索返回的单条结果。 */
export interface WebSearchResult {
  /** 结果标题。 */
  title: string;
  /** 结果来源 URL。 */
  url: string;
  /** 给用户展示的摘要片段。 */
  snippet: string;
}

/**
 * 用户消息中可见的上下文引用。
 *
 * 说明：
 * - 页面元素引用只保存结构化真源，不持久化已经格式化好的标题、摘要或 Markdown；
 * - 引用卡和模型隐藏上下文都在消费时按当前 UI 语言即时生成；
 * - `attachmentIds` 表示该引用拥有的附件，渲染普通消息附件时应过滤这些 ID，避免重复展示。
 */
export interface MessageContextReference {
  /** 引用唯一 ID；同一条消息内稳定即可。 */
  id: string;
  /** 引用类型；当前只允许页面元素结构化上下文。 */
  kind: 'element';
  /** 被选择的页面元素结构化内容。 */
  element: PickedElement;
  /** 来源页面基础信息。 */
  source?: ElementActionPayload['source'];
  /** 该引用拥有的附件 ID。 */
  attachmentIds: string[];
}

/**
 * 聊天消息实体。
 *
 * 说明：
 * - 同一个话题内的 user / assistant / system 消息统一使用这套结构持久化；
 * - 部分字段只对特定角色或特定渲染模式生效，不同角色不会强行补齐无意义字段；
 * - 所有字段都要求可序列化，便于 IndexedDB 持久化与跨页面同步。
 */
export interface Message {
  /** 消息 ID：用于列表渲染与增量更新 */
  id: string;
  /**
   * 消息级同步修订号。
   *
   * 说明：
   * - 新写入的消息由消息库基于 HLC 生成；
   * - 多设备同步合并同 ID 消息时只比较该稳定修订号，不再依赖不存在的 `updatedAt` 字段。
   */
  revision?: string;
  /** 消息级同步修订时钟，便于调试和未来冲突分析。 */
  revisionClock?: HLCTimestamp;
  /** 消息角色：user/assistant/system */
  role: 'user' | 'assistant' | 'system';
  /**
   * 关联问题 ID（用于多模型分组 MessageGroup）
   * - user 消息：通常等于自身 id（作为 askId）
   * - assistant 消息：等于对应 user 消息的 askId
   */
  askId?: string;
  /** 消息正文（纯文本） */
  content: string;
  /**
   * 用户消息的隐藏模型上下文。
   *
   * 说明：
   * - 仅对 `role='user'` 有意义；
   * - 不参与聊天气泡正文渲染，只在构造模型 API message 时拼入当前轮输入；
   * - 用于页面元素引用卡这类“用户可见为卡片、模型需要完整结构化内容”的上下文。
   */
  modelContext?: string;
  /**
   * 用户可见的上下文引用卡。
   *
   * 说明：
   * - 仅对 `role='user'` 有意义；
   * - 不写入 `content`，复制、编辑和导出用户正文时仍保持纯净；
   * - 当前主要承载“选择元素”插入的页面元素引用。
   */
  contextReferences?: MessageContextReference[];
  /**
   * assistant 内部过程 trace。
   *
   * 说明：
   * - 只对 `role='assistant'` 有意义；
   * - reasoning / tool call 都按真实到达顺序写入这里；
   * - UI、导出、搜索和消息动作必须只从这一个真源消费。
   */
  trace?: MessageTraceItem[];
  /** 翻译块（Message Menubar -\> Translate） */
  translations?: MessageTranslation[];
  /** 附件列表（当前仅支持图片） */
  attachments?: MessageAttachment[];
  /**
   * 可选：用户消息提及的模型列表（\@mention，多模型并行回复）。
   *
   * 说明：
   * - 仅对 role='user' 有意义（assistant/system 会忽略）。
   * - 按当前实现：重发用户消息（Resend）需要依赖该字段来恢复"多模型回复"。
   */
  mentions?: string[];
  /** 生成该消息的模型 ID（用于多模型对比展示） */
  modelId?: string;
  /** 仅对 assistant 消息：是否为同组"有用"版本（Useful） */
  useful?: boolean;
  /** 消息状态（用于 loading/paused/error 等展示） */
  status?: 'pending' | 'preparing' | 'processing' | 'success' | 'paused' | 'error';
  /**
   * 可选：渲染提示（在缺少模型元信息时也能选对 UI 形态）。
   *
   * 目前仅用于图片回复：
   * - image：按“图片回复/图片生成占位”渲染（聊天页 ImageMessageCard）。
   */
  renderHint?: 'image';
  /** 可选：system 消息子类型（例如新上下文分隔） */
  subtype?: 'context-divider';
  /** 可选：错误信息（status=error 时）。跨运行时只保存 i18n key，不提前格式化。 */
  error?: I18nText;
  /** 可选：错误详情（用于"详情"弹窗；字段均为字符串，便于持久化与避免序列化问题） */
  errorDetails?: MessageErrorDetails;
  /** 消息创建时间（毫秒时间戳） */
  createdAt: number;
  /** 可选：多模型分组展示偏好（按 askId 持久化在 user 消息上） */
  groupPrefs?: MessageGroupPreferences;
  /** 可选：联网搜索结果（用于折叠展示引用来源） */
  webSearchResults?: WebSearchResult[];
  /** 可选：联网搜索状态（searching=搜索中，done=已完成） */
  webSearchStatus?: 'searching' | 'done';
  /** 可选：本次联网搜索使用的 Provider（用于 UI 展示图标/来源） */
  webSearchProviderId?: string;
  /** 可选：本次联网搜索使用的查询词（用于 UI 展示/调试） */
  webSearchQuery?: string;
  /** 可选：联网搜索错误信息（用于 UI 兜底展示；搜索失败时不应让用户“无感”）。 */
  webSearchError?: I18nText;
}

/**
 * 聊天消息写回选项。
 *
 * 说明：
 * - 默认情况下，消息写回会同步触碰 topic `updatedAt`，让侧边栏和其他依赖 topic meta 的视图感知更新；
 * - 高频流式增量场景可显式关闭 `touchTopicMeta`，只更新消息正文，避免 assistant/topic store 级联重渲染。
 */
export interface MessageUpdateOptions {
  /** 是否同步触碰 topic 元数据；默认 `true`。 */
  touchTopicMeta?: boolean;
}

/** 统一的消息写回函数签名。 */
export type UpdateTopicMessages = (
  topicId: string,
  messages: Message[],
  options?: MessageUpdateOptions,
) => void;

/** 消息附件（以附件表 ID 引用，当前支持图片和文件）。 */
export type MessageAttachment =
  | {
      /** 附件类型：目前仅支持图片 */
      type: 'image';
      /** 附件在 IndexedDB 附件表中的 ID（引用） */
      id: string;
      /** 原始文件名/展示名 */
      name: string;
      /** MIME 类型（例如 "image/png"） */
      mime: string;
      /** 字节大小（用于展示与校验） */
      size: number;
    }
  | {
      /** 附件类型：文件（用于"粘贴长文本转文件"等场景） */
      type: 'file';
      /** 附件在 IndexedDB 附件表中的 ID（引用） */
      id: string;
      /** 原始文件名/展示名 */
      name: string;
      /** MIME 类型（例如 "text/plain"） */
      mime: string;
      /** 字节大小（用于展示与校验） */
      size: number;
    };

/**
 * 话题聊天快照。
 *
 * 说明：
 * - 这是话题自身的可持久化元数据 + 消息视图，不包含助手默认配置；
 * - 真正参与发送链路的完整上下文见 `ResolvedConversationContext`。
 */
export interface TopicConversation {
  /** 话题 ID */
  id: string;
  /** 话题标题（用于侧边栏列表展示） */
  title: string;
  /** 话题消息列表 */
  messages: Message[];
  /** 所属文件夹 ID（null 表示未归档） */
  folderId: string | null;
  /** 是否置顶 */
  pinned: boolean;
  /** 创建时间（毫秒时间戳） */
  createdAt: number;
  /** 最近更新时间（毫秒时间戳） */
  updatedAt: number;
  /**
   * 创建该话题时使用的助手 ID。
   *
   * 约定：
   * - 普通话题必须绑定一个 assistantId。
   */
  assistantId: string;

  /** Topic Prompt（话题级提示词） */
  topicPrompt?: string;
  /** 话题级模型覆盖；缺失时使用全局默认模型。 */
  model?: string;
  /** 话题级温度覆盖；缺失时使用全局默认温度。 */
  temperature?: number;
  /** 话题级 Top-p 覆盖；缺失时使用全局默认 Top-p。 */
  topP?: number;
  /** 话题级最大输出 tokens 覆盖；缺失时使用全局默认最大输出。 */
  maxTokens?: number;
  /** 话题级上下文消息条数覆盖；缺失时使用全局默认上下文长度。 */
  contextLength?: number;
  /** 话题级模型参数（通用 JSON 透传）。 */
  modelParams?: Record<string, unknown>;
  /** 话题级浏览器上下文模式覆盖；缺失时回落到助手场景默认值。 */
  browserContextMode?: BrowserContextConversationMode;
  /** 话题名是否为手动编辑（用于自动命名逻辑） */
  isNameManuallyEdited?: boolean;
  /** 自定义排序权重（用于拖拽排序持久化；越小越靠前） */
  order?: number;
}

/**
 * 发送链路与聊天区使用的派生运行时上下文。
 *
 * 说明：
 * - 由 `assistant prompt/capabilities + topic generation settings + messages` 组合得到；
 * - 模型与生成参数的持久真源属于 topic。
 */
export interface ResolvedConversationContext extends TopicConversation {
  /** 当前轮使用的 system prompt 基线（全局对话提示词 + 助手默认，不含 topic/browser context） */
  systemPrompt: string;
  /** 当前使用的模型："providerId/modelId" */
  model: string;
  /** 温度采样参数 */
  temperature: number;
  /** Top-p 采样参数 */
  topP: number;
  /** 最大输出 tokens */
  maxTokens: number;
  /** 模型参数（通用 JSON 透传） */
  modelParams?: Record<string, unknown>;
  /** 上下文消息长度（UI 侧用于裁剪 messages） */
  contextLength: number;
  /** 是否启用图片生成（仅对支持生图的模型有效） */
  enableGenerateImage?: boolean;
  /** 是否启用联网搜索（仅对支持 web search 的模型有效） */
  enableWebSearch?: boolean;
  /** MCP 服务器选择模型：显式表达 auto / disabled / manual。 */
  mcpSelection?: McpServerSelection;
}

/**
 * 侧边栏/索引用的轻量话题元数据。
 *
 * 说明：
 * - 只保留列表渲染、排序、筛选需要的字段；
 * - 不包含 messages，避免在列表视图加载整段历史消息。
 */
export type TopicSummary = Pick<
  TopicConversation,
  'id'
  | 'title'
  | 'folderId'
  | 'pinned'
  | 'createdAt'
  | 'updatedAt'
  | 'assistantId'
  | 'order'
  | 'topicPrompt'
  | 'model'
  | 'temperature'
  | 'topP'
  | 'maxTokens'
  | 'contextLength'
  | 'modelParams'
  | 'browserContextMode'
  | 'isNameManuallyEdited'
>;

/** 话题文件夹。 */
export interface Folder {
  /** 文件夹 ID */
  id: string;
  /** 文件夹名称 */
  name: string;
  /** 创建时间（毫秒时间戳） */
  createdAt: number;
}

/** 提示词模板。 */
export interface PromptTemplate {
  /** 提示词模板 ID */
  id: string;
  /** 标题（用于列表展示） */
  title: string;
  /** 模板内容 */
  content: string;
  /** 分类（用于分组/过滤） */
  category: string;
  /** 是否为内置模板（内置模板不可删除/可重置） */
  isBuiltin: boolean;
  /** 创建时间（毫秒时间戳） */
  createdAt: number;
}

/**
 * 聊天设置快照。
 *
 * 说明：
 * - 这是一份“全局默认配置”，会被话题、助手或临时面板按需覆写；
 * - 字段大多直接映射到设置面板选项，因此要求保持可序列化与可持久化。
 */
export interface ChatSettings {
  /** 默认模型："providerId/modelId" */
  defaultModel: string;
  /** 默认温度 */
  defaultTemperature: number;
  /** 默认 Top-p */
  defaultTopP: number;
  /** 默认最大输出 tokens */
  defaultMaxTokens: number;
  /** 默认上下文长度 */
  defaultContextLength: number;
  /** 默认 system prompt */
  defaultSystemPrompt: string;
  /** 默认生图模型（undefined = 新建绘图时不预选） */
  defaultImageModel?: string;
  /** 默认转写模型（undefined = 发送音频附件时要求用户先配置） */
  defaultTranscriptionModel?: string;
  /** 默认语音合成模型（undefined = assistant 消息朗读时要求用户先配置） */
  defaultSpeechModel?: string;
  /** 默认语音合成 voice（undefined = 使用 provider 默认 voice） */
  defaultSpeechVoice?: string;
  /** 全局生图提示词前缀 */
  defaultImagePromptPrefix: string;
  /** 话题命名模型（undefined = 使用 defaultModel） */
  topicNamingModel?: string;
  /** 翻译模型（undefined = 使用 defaultModel） */
  translateModel?: string;
  /** 截图 OCR 模型（undefined = 使用 defaultModel，但运行时仍要求模型支持 vision-input） */
  ocrModel?: string;

  // ========== 对话交互设置（chat-dialog 规格） ==========
  /** 发送快捷键 */
  sendMessageShortcut?: 'enter' | 'ctrlEnter' | 'shiftEnter';
  /** 删除消息是否二次确认 */
  confirmDeleteMessage?: boolean;
  /** 重试/重发是否二次确认 */
  confirmRegenerateMessage?: boolean;
  /** 翻译语言列表（用于 MessageMenubar -\> Translate） */
  translateLanguages?: string[];
  /** 输入框翻译按钮：是否显示“覆盖原文”二次确认（默认开启；按当前实现） */
  showTranslateConfirm?: boolean;
  /** 输入框翻译按钮：目标语言（必须在 translateLanguages 内；按当前实现） */
  translateTargetLanguage?: string;
  /** 导出菜单开关 */
  exportMenuOptions?: Partial<Record<
    | 'copy_plain'
    | 'copy_image'
    | 'export_image'
    | 'markdown'
    | 'markdown_reason'
    | 'word',
    boolean
  >>;
  /** 粘贴长文本转文件 */
  pasteLongTextAsFile?: boolean;
  /** 长文本阈值（字符数） */
  pasteLongTextThreshold?: number;
  /** 三连空格触发翻译 */
  autoTranslateWithSpace?: boolean;
  /** 显示消息大纲（assistant message headings） */
  showMessageOutline?: boolean;
  /** 对话导航模式 */
  messageNavigation?: 'off' | 'buttons' | 'anchor';
  /** grid 布局的 popover 触发方式 */
  gridPopoverTrigger?: 'hover' | 'click';
  /** 开发者能力总闸（调试透传、实验功能入口、开发者面板） */
  enableDeveloperMode?: boolean;
}

/**
 * 话题元数据（不包含 messages）。
 *
 * 说明：
 * - 浏览器扩展主聊天彻底切换为 Assistant -\> Topic；
 * - Topic 是 Assistant 下的一等领域对象，消息继续单独保存在 IndexedDB。
 */
export interface Topic {
  /** 话题 ID。 */
  id: string;
  /** 绑定的助手 ID。 */
  assistantId: string;
  /** 话题标题。 */
  name: string;
  /** 创建时间（毫秒时间戳）。 */
  createdAt: number;
  /** 最近更新时间（毫秒时间戳）。 */
  updatedAt: number;
  /** 是否置顶。 */
  pinned?: boolean;
  /** 话题级 prompt 覆盖。 */
  topicPrompt?: string;
  /** 话题级模型覆盖；缺失时使用全局默认模型。 */
  model?: string;
  /** 话题级温度覆盖；缺失时使用全局默认温度。 */
  temperature?: number;
  /** 话题级 Top-p 覆盖；缺失时使用全局默认 Top-p。 */
  topP?: number;
  /** 话题级最大输出 tokens 覆盖；缺失时使用全局默认最大输出。 */
  maxTokens?: number;
  /** 话题级上下文消息条数覆盖；缺失时使用全局默认上下文长度。 */
  contextLength?: number;
  /** 话题级模型参数（通用 JSON 透传）。 */
  modelParams?: Record<string, unknown>;
  /** 话题级浏览器上下文模式覆盖。 */
  browserContextMode?: BrowserContextConversationMode;
  /** 标题是否由用户手动编辑过。 */
  isNameManuallyEdited?: boolean;
  /** 自定义排序权重（越小越靠前）；未设置时按 updatedAt 排序 */
  order?: number;
}

export {
  MODEL_PRESETS,
  BUILTIN_PROMPTS,
  DEFAULT_SETTINGS,
  getModelPresets,
  getBuiltinPrompts,
  getDefaultSettings,
  type ChatConstantsTranslate,
} from '@/lib/chat/constants';
export { getActiveMessages } from '@/lib/chat/message-utils';
