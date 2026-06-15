/**
 * 说明：`assistant` 类型定义模块。
 *
 * 职责：
 * - 承载 `assistant` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ASSISTANT_ICON_IDS`、`AssistantIconId`、`isAssistantIconId` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { McpServerSelection } from '@/lib/mcp/selection';
import type { Topic } from '@/types/chat';
import type { QuickPhrase } from '@/types/quick-phrase';

/**
 * 导出常量：`ASSISTANT_ICON_IDS`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const ASSISTANT_ICON_IDS = [
  'bot',
  'compass',
  'book-open',
  'newspaper',
  'circle-help',
  'languages',
  'puzzle',
  'file-pen',
  'graduation-cap',
  'badge-check',
  'search',
  'scale',
  'shopping-cart',
  'blocks',
  'chart-column',
  'chart-line',
  'code-2',
  'image',
  'mail',
  'megaphone',
  'send',
  'wrench',
  'folders',
  'archive',
  'palette',
  'scissors',
  'sliders-horizontal',
  'brain',
  'calendar',
  'bug',
  'flask-conical',
  'plug',
  'globe',
  'map',
  'triangle-alert',
  'logs',
  'receipt-text',
  'route',
  'list-checks',
  'lightbulb',
  'sparkles',
  'tags',
  'presentation',
  'files',
  'messages-square',
  'handshake',
  'pin',
  'settings-2',
  'target',
  'microscope',
  'ruler',
  'zap',
] as const;

/** 导出类型：`AssistantIconId`。 */
export type AssistantIconId = (typeof ASSISTANT_ICON_IDS)[number];

/** 助手场景。 */
export type AssistantScenario = 'browser' | 'general';

/** 归一化助手场景；缺失或非法值一律回落为 `general`。 */
export function normalizeAssistantScenario(value: unknown): AssistantScenario {
  return value === 'browser' ? 'browser' : 'general';
}

/**
 * 导出函数：`isAssistantIconId`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function isAssistantIconId(value: unknown): value is AssistantIconId {
  return typeof value === 'string' && (ASSISTANT_ICON_IDS as readonly string[]).includes(value);
}

/**
 * 助手共享配置字段。
 *
 * 说明：
 * - `Assistant` 与 `AssistantPreset` 共用同一组配置字段；
 * - 字段值要求可持久化到浏览器存储，不允许放入函数、类实例等不可序列化内容；
 * - 未填写的可选字段表示“关闭对应能力”或使用能力自身默认值；
 * - 模型与生成参数属于 Topic，不属于 Assistant。
 */
export interface AssistantConfig {
  /** 助手所属场景：browser=浏览器场景，general=通用助手。 */
  scenario: AssistantScenario;
  /** 助手名称：用于 UI 展示 */
  name: string;
  /** 助手简介：用于列表/卡片展示 */
  description?: string;
  /** 可选：主图标 ID；跨平台稳定显示。 */
  iconId?: AssistantIconId;
  /** 助手 system prompt（会拼接/覆盖默认 system prompt） */
  prompt: string;
  /** MCP 服务器选择模型：显式表达 auto / disabled / manual。 */
  mcpSelection?: McpServerSelection;
  /**
   * 是否启用“模型内置”的联网搜索能力（仅对支持 web search 的模型有效）。
   *
   * 说明：
   * - 该字段仅代表“使用模型自带的 web search / grounding / search 插件能力”；
   * - 若同时选择了 `webSearchProviderId`（外部搜索 Provider），则应视为互斥：外部优先，内置应被关闭。
   */
  enableWebSearch?: boolean;
  /**
   * 外部联网搜索 Provider ID（例如：local-google / local-bing / local-baidu / exa-mcp）。
   *
   * 说明：
   * - 当该字段存在时，表示启用“工具式联网搜索”（由应用侧提供 web search tool）；
   * - 与 `enableWebSearch`（模型内置）互斥：选择外部 Provider 时会自动关闭内置开关。
   */
  webSearchProviderId?: string;
  /** 是否启用图片生成（仅对支持生图/内联图片的模型有效） */
  enableGenerateImage?: boolean;
  /**
   * 是否启用全局记忆（按当前实现 assistant.enableMemory）。
   *
   * 说明：
   * - 该开关只表示“此助手允许使用全局记忆能力”；
   * - 只有在全局记忆已开启且已配置 embedding/LLM 模型时才会真正生效。
   */
  enableMemory?: boolean;
  /** 标签：用于过滤/分组 */
  tags?: string[];
  /**
   * 当前助手的常用短语。
   *
   * 说明：
   * - 仅服务聊天输入区快速插入，不参与 system prompt 拼接；
   * - 与全局快捷短语共用 `QuickPhrase` 当前结构；
   * - `order` 越大越靠前。
   */
  regularPhrases?: QuickPhrase[];
}

/**
 * 助手预设。
 *
 * 说明：
 * - 预设只用于“创建助手实例”；
 * - 不参与主聊天 activeAssistant / activeTopic 运行时；
 * - 不携带真实 `topics`、时间戳等实例态字段。
 */
export interface AssistantPreset extends AssistantConfig {
  /** 预设 ID：用于角色选择器与实例创建。 */
  id: string;
}

/**
 * 用户持久化助手预设。
 *
 * 说明：
 * - 只用于 `chrome.storage.local` 中的“我的预设”真源；
 * - 结构仍复用 `AssistantPreset` 的配置字段，但会额外记录创建与更新时间；
 * - 不承载真实助手实例态字段，也不承载 browser-context override。
 */
export interface StoredAssistantPreset extends AssistantPreset {
  /** 创建时间（毫秒时间戳）。 */
  createdAt: number;
  /** 最近更新时间（毫秒时间戳）。 */
  updatedAt: number;
}

/**
 * 助手实例实体。
 *
 * 说明：
 * - 这是普通话题聊天的首要配置来源；
 * - `Assistant` 是顶层真实业务实体，下面直接承载 `topics[]`。
 */
export interface Assistant extends AssistantConfig {
  /** 助手 ID：用于话题绑定与配置引用 */
  id: string;
  /** 助手下的话题列表。 */
  topics: Topic[];
  /** 助手排序值：数值越大越靠前。 */
  order: number;
  /** 创建时间（毫秒时间戳） */
  createdAt: number;
  /** 最近更新时间（毫秒时间戳） */
  updatedAt: number;
}

/**
 * 内置默认助手预设 ID。
 *
 * 说明：
 * - 用于在扩展内构造“默认助手”模板；
 * - 助手预设不直接参与主聊天运行时。
 */
export const BUILTIN_DEFAULT_ROLE_TEMPLATE_ID = '__builtin_default_role__';

/**
 * 默认助手实例 ID。
 *
 * 说明：
 * - 当本地不存在任何真实助手实例时，会基于默认助手预设物化该实例；
 * - 若用户删除最后一个助手实例，也会自动补回一个新的默认助手实例。
 */
export const DEFAULT_ASSISTANT_ID = '__builtin_default__';
