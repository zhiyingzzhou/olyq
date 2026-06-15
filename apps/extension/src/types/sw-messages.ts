/**
 * 说明：`sw-messages` 类型定义模块。
 *
 * 职责：
 * - 承载 `sw-messages` 相关的当前文件实现与模块边界；
 * - 对外暴露 `SwMsg_SelectionAction`、`SwMsg_ElementAction` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 需求 M-1：Service Worker 消息类型安全
 *
 * 集中定义所有发送到 Service Worker 的 one-shot 消息类型，
 * 替代原来 `{ type: string; payload?: unknown }` 的弱类型定义。
 */

import type { ElementActionPayload, ElementPickerAction } from './element-picker';
import type { ScreenshotEditorActionPayload } from '@/plugins/page-tools/screenshot-capture/contracts';
import type { I18nText } from './i18n';
import type { BackupProfile } from '@/lib/persistence/types';
import type { BrowserContextHeading } from '@/lib/browser-context/types';
import type { LinkPreviewErrorCode, LinkPreviewMetadata } from '@/lib/link-preview/types';
import type { TechnologyPageSignals, TechnologyStackResult } from '@/lib/technology-stack/types';
import type { SwMcpInboundMessage } from './sw-messages-mcp';
export type {
  SwMcpInboundMessage,
  SwMsg_McpServerConnect,
  SwMsg_McpServerDisconnect,
  SwMsg_McpServerOAuthAuthorize,
  SwMsg_McpServerOAuthClear,
  SwMsg_McpServerTools,
  SwMsg_McpServersStatusGet,
  SwMsg_McpToolCall,
} from './sw-messages-mcp';

/** 网页工具会话类型。 */
export type PageToolSessionTool = 'element-picker' | 'screenshot-editor';

/** 网页工具关闭原因。 */
export type PageToolSessionCloseReason = 'cancel' | 'close' | 'escape' | 'complete' | 'replace';

/* ═══════════════════════════════════════════════════════════
 * 1. SW 入站消息（→ Service Worker）
 * ═══════════════════════════════════════════════════════════ */

/** 内容脚本的"选择助手"动作 */
export interface SwMsg_SelectionAction {
  /** 消息类型：处理当前页面选区。 */
  type: 'selection/action';
  /** 划词/选区动作的结构化负载。 */
  payload: {
    /** 动作类型（例如“引用选区/总结/翻译”等；可由内容脚本或 UI 扩展） */
    action: ElementPickerAction | string;
    /** 选区文本 */
    text: string;
    /** 可选：来源页面信息（内容脚本侧收集，尽力而为） */
    source?: {
      /** 来源 URL（可选） */
      url?: string;
      /** 来源标题（可选） */
      title?: string;
    };
  };
}

/** 内容脚本的"元素选择器"动作 */
export interface SwMsg_ElementAction {
  /** 消息类型：处理元素选择器返回的结构化元素。 */
  type: 'element/action';
  /** 元素选择器回传的结构化元素动作负载。 */
  payload: ElementActionPayload;
}

/** UI 请求启动元素选择器（由 SW 插件处理） */
export interface SwMsg_ElementPickerStart {
  /** 消息类型：请求启动元素选择器。 */
  type: 'element/picker/start';
  /** 可选：指定在哪个标签页中启动元素选择器。 */
  payload?: {
    /** 可选：指定 tabId；为空时默认作用于当前激活标签页 */
    tabId?: number;
    /** 本次选择结束后是否回到 sidepanel；sidepanel 入口默认开启。 */
    returnToPanel?: boolean;
  };
}

/** UI 请求启动截图编辑器（由 SW 插件处理） */
export interface SwMsg_ScreenshotEditorStart {
  /** 消息类型：请求启动网页截图编辑器。 */
  type: 'screenshot/editor/start';
  /** 可选：指定在哪个标签页中启动截图编辑器。 */
  payload?: {
    /** 可选：指定 tabId；为空时默认作用于当前激活标签页。 */
    tabId?: number;
    /** 本次截图结束后是否回到 sidepanel；sidepanel 入口默认开启。 */
    returnToPanel?: boolean;
  };
}

/** Content script 提交截图编辑器动作 */
export interface SwMsg_ScreenshotAction {
  /** 消息类型：将截图结果交给后台转发到 UI。 */
  type: 'screenshot/action';
  /** 截图结果与动作语义。 */
  payload: ScreenshotEditorActionPayload;
}

/** Content script 通知后台网页工具会话已关闭 */
export interface SwMsg_PageToolSessionClosed {
  /** 消息类型：结束一个页面级网页工具会话。 */
  type: 'page-tool/session/closed';
  /** 关闭原因与会话身份。 */
  payload?: {
    /** 页面工具会话 ID。 */
    sessionId?: string;
    /** 关闭的工具类型。 */
    tool?: PageToolSessionTool;
    /** 关闭原因。 */
    reason?: PageToolSessionCloseReason;
    /** SW 会话丢失时是否仍应按 sender.tab 恢复 sidepanel。 */
    returnToPanel?: boolean;
    /** 来源页面信息。 */
    source?: { url?: string; title?: string };
  };
}

/** UI 请求确保 Offscreen Document 存在 */
export interface SwMsg_OffscreenEnsure {
  /** 消息类型：确保 Offscreen Document 已创建。 */
  type: 'offscreen/ensure';
}

/** UI 请求关闭 Offscreen Document */
export interface SwMsg_OffscreenClose {
  /** 消息类型：请求关闭 Offscreen Document。 */
  type: 'offscreen/close';
}

/** UI 请求获取 keepalive 配置 */
export interface SwMsg_KeepAliveGet {
  /** 消息类型：读取 SW keepalive 当前配置。 */
  type: 'sw/keepalive/get';
}

/** 本地自动快照配置快照。 */
export interface LocalBackupScheduleConfigPayload {
  /** 自动快照周期，单位分钟；`0` 表示关闭。 */
  syncInterval: number;
  /** 最多保留的本地快照数量；`0` 表示不限。 */
  maxBackups: number;
  /** 当前快照档位。 */
  backupProfile: BackupProfile;
}

/** 本地自动快照最近一次执行模式。 */
export type LocalBackupScheduleStatusMode =
  | 'snapshot_ok'
  | 'snapshot_ok/file_export_degraded'
  | 'snapshot_error';

/** 本地自动快照失败详情。 */
export interface LocalBackupScheduleFailureDetailPayload {
  /** 详情记录时间。 */
  at: number;
  /** 自动任务类型。 */
  taskType: 'local-backup/auto' | 'webdav/auto' | 's3/auto' | string;
  /** 执行所在运行时。 */
  runtime: 'offscreen' | 'service-worker';
  /** 失败发生阶段。 */
  phase: string;
  /** 本次后台 RPC 请求 ID。 */
  requestId?: string;
  /** 稳定错误 key。 */
  errorKey?: string;
  /** 错误插值参数的安全快照。 */
  errorParams?: Record<string, string | number | boolean | null>;
  /** 原始错误类型名。 */
  errorName?: string;
  /** 可读错误信息。 */
  message?: string;
  /** 原始 cause 的可读信息。 */
  causeMessage?: string;
  /** 额外诊断说明。 */
  note?: string;
}

/** 本地自动快照最近一次执行状态。 */
export interface LocalBackupScheduleStatusPayload {
  /** 最近一次任务落盘时间。 */
  lastRunAt: number;
  /** 最近一次任务是否成功完成 IndexedDB 快照。 */
  ok: boolean;
  /** 最近一次任务模式；目录权限降级和失败会显式区分。 */
  mode?: LocalBackupScheduleStatusMode;
  /** 本次任务清理的旧快照数量。 */
  trimmedCount?: number;
  /** 失败时的稳定国际化错误。 */
  error?: I18nText;
  /** 失败详情；用于设置页“详情”入口展示可诊断信息。 */
  errorDetail?: LocalBackupScheduleFailureDetailPayload;
}

/** 本地自动快照 alarm 快照。 */
export interface LocalBackupScheduleAlarmPayload {
  /** alarm 名称。 */
  name: string;
  /** 浏览器计划的下次触发时间；不可用时为 `null`。 */
  scheduledTime: number | null;
  /** 周期分钟数；一次性 alarm 或不可用时为 `null`。 */
  periodInMinutes: number | null;
}

/** 本地自动快照可观测状态。 */
export interface LocalBackupSchedulePayload {
  /** 当前配置真源。 */
  config: LocalBackupScheduleConfigPayload;
  /** 最近一次执行状态；从未执行过时为 `null`。 */
  status: LocalBackupScheduleStatusPayload | null;
  /** 当前浏览器 alarm；关闭或运行时不可用时为 `null`。 */
  alarm: LocalBackupScheduleAlarmPayload | null;
}

/** UI 请求读取本地自动快照计划与最近执行状态。 */
export interface SwMsg_LocalBackupScheduleGet {
  /** 消息类型：读取本地自动快照计划。 */
  type: 'local-backup/schedule/get';
}

/** UI 请求唤醒并确认 SW 监听器已经 ready。 */
export interface SwMsg_SwPing {
  /** 消息类型：轻量 ping，仅用于内部握手。 */
  type: 'sw/ping';
}

/** UI 请求获取 content script 静态注入状态 */
export interface SwMsg_ContentScriptStatusGet {
  /** 消息类型：读取 content script 静态注入状态。 */
  type: 'content-script/status/get';
}

/** UI 请求后台读取链接预览元数据。 */
export interface SwMsg_LinkPreviewMetadataGet {
  /** 消息类型：读取链接预览元数据。 */
  type: 'link-preview/metadata/get';
  /** 需要预览的链接。 */
  payload: {
    /** 原始链接 URL；后台只接受 http/https。 */
    url: string;
  };
}

/** UI / browser-context 请求后台按需提取当前页面正文。 */
export interface SwMsg_BrowserContextReadableDomGet {
  /** 消息类型：按需读取当前页面的可读正文。 */
  type: 'browser-context/readable-dom/get';
  /** 可选：指定要采集的标签页。 */
  payload?: {
    /** 目标标签页 ID；为空时由 SW 自行解析当前 active tab。 */
    tabId?: number;
    /** 正文采集意图：普通模式优先文章主体，全文模式优先可见页面结构。 */
    intent?: BrowserContextReadableDomIntent;
    /** 页面稳定窗口最长等待毫秒数；超时后返回 `timeout`，避免 UI 长期 pending。 */
    stableWaitMs?: number;
  };
}

/** UI / browser-context 请求后台按需提取当前页面的设计信号。 */
export interface SwMsg_BrowserContextPageStyleSignalsGet {
  /** 消息类型：按需读取当前页面的设计信号。 */
  type: 'browser-context/page-style-signals/get';
  /** 可选：指定要采集的标签页。 */
  payload?: {
    /** 目标标签页 ID；为空时由 SW 自行解析当前 active tab。 */
    tabId?: number;
    /** 页面稳定窗口最长等待毫秒数；超时后返回 `timeout`，避免 UI 长期 pending。 */
    stableWaitMs?: number;
  };
}

/** UI / browser-context 请求后台按需读取当前页面的布局指纹与滚动度量。 */
export interface SwMsg_BrowserContextPageStyleLayoutGet {
  /** 消息类型：按需读取当前页面的布局度量。 */
  type: 'browser-context/page-style-layout/get';
  /** 可选：指定要采集的标签页。 */
  payload?: {
    /** 目标标签页 ID；为空时由 SW 自行解析当前 active tab。 */
    tabId?: number;
  };
}

/** UI / browser-context 请求后台按需抓取当前页面的视觉分段截图。 */
export interface SwMsg_BrowserContextPageStyleCapturesGet {
  /** 消息类型：按需读取当前页面的视觉截图样本。 */
  type: 'browser-context/page-style-captures/get';
  /** 可选：指定要采集的标签页与截图预算。 */
  payload?: {
    /** 目标标签页 ID；为空时由 SW 自行解析当前 active tab。 */
    tabId?: number;
    /** 允许返回的最大截图张数；为空时由后台使用默认预算。 */
    maxCaptures?: number;
    /** 同一 ask/page 的截图合并 key。 */
    captureRequestKey?: string;
    /** 调用方预期的页面指纹；不匹配时直接丢弃过期任务。 */
    expectedPageFingerprint?: string;
    /** 调度优先级；数值越大越优先。 */
    priority?: number;
  };
}

/** UI / browser-context 请求后台读取当前页面技术栈。 */
export interface SwMsg_TechnologyStackGet {
  /** 消息类型：读取当前页面技术栈。 */
  type: 'technology-stack/get';
  /** 可选：指定标签页。 */
  payload?: {
    /** 目标标签页 ID；为空时由 SW 自行解析当前 active tab。 */
    tabId?: number;
    /** 内部最小探测阶段；默认 `fast`，browser-context 发送前可要求 bounded enhanced。 */
    minPass?: 'fast' | 'enhanced';
    /** 等待 enhanced 的最大毫秒数；仅 `minPass=enhanced` 生效。 */
    waitMs?: number;
  };
}

/** UI 主动刷新当前页面技术栈。 */
export interface SwMsg_TechnologyStackRefresh {
  /** 消息类型：强制刷新当前页面技术栈。 */
  type: 'technology-stack/refresh';
  /** 可选：指定标签页。 */
  payload?: {
    /** 目标标签页 ID；为空时由 SW 自行解析当前 active tab。 */
    tabId?: number;
    /** 内部最小探测阶段；默认 `fast`，browser-context 发送前可要求 bounded enhanced。 */
    minPass?: 'fast' | 'enhanced';
    /** 等待 enhanced 的最大毫秒数；仅 `minPass=enhanced` 生效。 */
    waitMs?: number;
  };
}

/** Content script 通知后台当前页面已进入可预热技术栈的 ready 状态。 */
export interface SwMsg_TechnologyStackPageReady {
  /** 消息类型：页面 ready 后触发后台技术栈自动预热。 */
  type: 'technology-stack/page-ready';
  /** 页面侧只上报结构化身份，不携带原始页面内容。 */
  payload?: {
    /** 当前页面 URL。 */
    url?: string;
    /** 当前页面标题。 */
    title?: string;
    /** document.readyState。 */
    readyState?: string;
    /** 触发原因。 */
    reason?: string;
    /** 页面侧上报时间。 */
    reportedAt?: number;
  };
}

/** 所有已知的 SW 入站消息联合类型 */
export type SwInboundMessage =
  | SwMsg_SelectionAction
  | SwMsg_ElementAction
  | SwMsg_ElementPickerStart
  | SwMsg_ScreenshotEditorStart
  | SwMsg_ScreenshotAction
  | SwMsg_PageToolSessionClosed
  | SwMsg_OffscreenEnsure
  | SwMsg_OffscreenClose
  | SwMsg_KeepAliveGet
  | SwMsg_LocalBackupScheduleGet
  | SwMsg_SwPing
  | SwMsg_ContentScriptStatusGet
  | SwMsg_LinkPreviewMetadataGet
  | SwMcpInboundMessage
  | SwMsg_BrowserContextReadableDomGet
  | SwMsg_BrowserContextPageStyleSignalsGet
  | SwMsg_BrowserContextPageStyleLayoutGet
  | SwMsg_BrowserContextPageStyleCapturesGet
  | SwMsg_TechnologyStackGet
  | SwMsg_TechnologyStackRefresh
  | SwMsg_TechnologyStackPageReady;

/** SW 入站消息的 type 字面量联合 */
export type SwInboundMessageType = SwInboundMessage['type'];

/** 自动页面上下文正文采集意图。 */
export type BrowserContextReadableDomIntent = 'normal' | 'full-page';

/** 自动页面上下文正文采集模式。 */
export type BrowserContextReadableDomMode =
  | 'article'
  | 'visible-page'
  | 'structured-page'
  | 'metadata-only';

/** 自动页面上下文正文来源 frame 类型。 */
export type BrowserContextReadableDomSourceKind = 'top-frame' | 'embedded-frame';

/** 自动页面上下文正文降级原因。 */
export type BrowserContextReadableDomDegradeReason =
  | 'empty-body'
  | 'login-wall'
  | 'challenge-page'
  | 'image-or-canvas-only'
  | 'low-quality-extraction'
  | 'collector-unavailable';

/** Content Script 返回的自动页面上下文正文载荷。 */
export interface BrowserContextReadableDomPayload {
  /** 当前采集使用的页面标题。 */
  title: string;
  /** 当前采集使用的页面地址。 */
  url: string;
  /** 采集时间戳。 */
  extractedAt: number;
  /** 当前页面稳定指纹。 */
  pageFingerprint: string;
  /** 当前稳定窗口绑定的 route key。 */
  routeKey: string;
  /** 当前稳定窗口版本。 */
  stableWindowVersion: number;
  /** 本轮采集意图。 */
  intent: BrowserContextReadableDomIntent;
  /** 提取方式。 */
  mode: BrowserContextReadableDomMode;
  /** 页面正文纯文本。 */
  text: string;
  /** 文章正文 HTML；仅 `article` 模式可能返回。 */
  html?: string;
  /** 文章标题或页面标题。 */
  articleTitle?: string;
  /** 作者信息。 */
  byline?: string;
  /** 摘要。 */
  excerpt?: string;
  /** 从正文中提取的结构标题。 */
  headings: BrowserContextHeading[];
  /** 正文字符数。 */
  contentChars: number;
  /** 当前页面可见文本总量，用于识别低质量短抽取。 */
  visibleTextChars: number;
  /** 结构列表模式下识别到的条目数量。 */
  structuredItemCount?: number;
  /** `metadata-only` 或低质量候选被拒绝时的稳定原因码。 */
  degradeReason?: BrowserContextReadableDomDegradeReason;
  /** 当前正文来自顶层页面还是嵌入 frame。 */
  sourceKind?: BrowserContextReadableDomSourceKind;
  /** 当前 frame ID；由后台汇总器补齐。 */
  frameId?: number;
  /** 父 frame ID；顶层 frame 为 `-1`。 */
  parentFrameId?: number;
  /** 当前 frame URL。 */
  frameUrl?: string;
  /** 当前 frame 标题。 */
  frameTitle?: string;
  /** 是否顶层 frame。 */
  isTopFrame?: boolean;
}

/** 页面级配色与容器信号。 */
export interface PageStylePageSignals {
  /** 主背景色。 */
  backgroundColor: string;
  /** 主文本色。 */
  textColor: string;
  /** 链接色。 */
  linkColor: string;
  /** 按钮主色。 */
  primaryButtonColor: string;
  /** 常见边框色样本。 */
  borderColors: string[];
  /** 常见阴影样本。 */
  shadowSamples: string[];
  /** 常见圆角样本。 */
  radiusSamples: string[];
  /** 估计的最大内容宽度（px）。 */
  maxContentWidth: number | null;
  /** 页面是否偏居中布局。 */
  centeredLayout: boolean;
  /** 页面是否呈现大留白倾向。 */
  airyWhitespace: boolean;
}

/** 页面级排版信号。 */
export interface PageStyleTypographySignals {
  /** 主体字体族。 */
  bodyFontFamilies: string[];
  /** 标题字体族。 */
  headingFontFamilies: string[];
  /** 按钮字体族。 */
  buttonFontFamilies: string[];
  /** 正文字号。 */
  bodyFontSize: string;
  /** 正文行高。 */
  bodyLineHeight: string;
  /** 标题字号样本。 */
  headingFontSizes: string[];
  /** 按钮字号样本。 */
  buttonFontSizes: string[];
  /** 典型字重样本。 */
  fontWeights: string[];
}

/** 页面级布局信号。 */
export interface PageStyleLayoutSignals {
  /** 是否存在明显 hero 区。 */
  hasHero: boolean;
  /** 导航形态摘要。 */
  navStyle: string;
  /** 主区块数量。 */
  sectionCount: number;
  /** 常见 section 间距样本（px）。 */
  sectionGapSamples: number[];
  /** 卡片/栅格倾向。 */
  cardGridHint: string;
  /** 图片密度。 */
  imageDensity: 'none' | 'low' | 'medium' | 'high';
}

/** 组件风格信号。 */
export interface PageStyleComponentSignals {
  /** 代表性按钮样式摘要。 */
  buttonStyles: string[];
  /** 代表性卡片样式摘要。 */
  cardStyles: string[];
  /** 代表性输入框样式摘要。 */
  inputStyles: string[];
  /** 代表性标签/徽标样式摘要。 */
  tagStyles: string[];
  /** 代表性导航样式摘要。 */
  navStyles: string[];
}

/** 装饰语言信号。 */
export interface PageStyleDecorationSignals {
  /** 是否存在大图。 */
  hasLargeImages: boolean;
  /** 是否使用渐变。 */
  usesGradients: boolean;
  /** 是否倾向插画/大量 SVG。 */
  usesIllustrations: boolean;
  /** 是否显著使用边框。 */
  usesBorders: boolean;
  /** 是否有玻璃态 / backdrop blur。 */
  usesGlass: boolean;
  /** 是否显著使用阴影。 */
  usesShadows: boolean;
  /** 是否有 sticky/fixed header。 */
  hasStickyHeader: boolean;
}

/** 便于模型理解的样本与定位信息。 */
export interface PageStyleSampleSignals {
  /** 标题文本样本。 */
  headings: string[];
  /** 主区块选择器样本。 */
  sectionSelectors: string[];
  /** 卡片选择器样本。 */
  cardSelectors: string[];
}

/** 文本降级模式下提取的页面设计信号。 */
export interface PageStyleSignalsPayload {
  /** 页面标题。 */
  title: string;
  /** 页面地址。 */
  url: string;
  /** 当前页面稳定指纹。 */
  pageFingerprint: string;
  /** 当前稳定窗口绑定的 route key。 */
  routeKey: string;
  /** 当前稳定窗口版本。 */
  stableWindowVersion: number;
  /** 采集时间。 */
  extractedAt: number;
  /** 页面级信号。 */
  page: PageStylePageSignals;
  /** 排版信号。 */
  typography: PageStyleTypographySignals;
  /** 布局信号。 */
  layout: PageStyleLayoutSignals;
  /** 组件信号。 */
  components: PageStyleComponentSignals;
  /** 装饰信号。 */
  decoration: PageStyleDecorationSignals;
  /** 样本与定位信息。 */
  samples: PageStyleSampleSignals;
}

/** 页面整页截图编排依赖的布局度量。 */
export interface PageStyleLayoutMetricsPayload {
  /** 当前页面标题。 */
  title: string;
  /** 当前页面地址。 */
  url: string;
  /** 当前页面稳定指纹。 */
  pageFingerprint: string;
  /** 当前稳定窗口绑定的 route key。 */
  routeKey: string;
  /** 当前稳定窗口版本。 */
  stableWindowVersion: number;
  /** 采集时间。 */
  extractedAt: number;
  /** 文档总高度。 */
  documentHeight: number;
  /** 当前视口高度。 */
  viewportHeight: number;
  /** 当前滚动位置。 */
  scrollY: number;
}

/** 单张页面视觉截图样本。 */
export interface PageStyleCaptureFramePayload {
  /** 建议展示名。 */
  name: string;
  /** 图片 MIME。 */
  mime: string;
  /** 图片 data URL。 */
  dataUrl: string;
  /** 截图时的页面滚动位置。 */
  scrollY: number;
}

/** 页面视觉分段截图响应。 */
export interface PageStyleCapturesPayload {
  /** 当前页面标题。 */
  title: string;
  /** 当前页面地址。 */
  url: string;
  /** 当前页面稳定指纹。 */
  pageFingerprint: string;
  /** 当前稳定窗口绑定的 route key。 */
  routeKey: string;
  /** 当前稳定窗口版本。 */
  stableWindowVersion: number;
  /** 采集时间。 */
  extractedAt: number;
  /** 本轮返回的截图帧。 */
  frames: PageStyleCaptureFramePayload[];
}

/* ═══════════════════════════════════════════════════════════
 * 2. 通用响应类型
 * ═══════════════════════════════════════════════════════════ */

/** 标准 ok/error 响应（大多数 SW 消息使用此格式） */
export interface SwOkResponse {
  /** 标记消息执行成功。 */
  ok: true;
}

/** SW 标准错误响应。 */
export interface SwErrorResponse {
  /** 标记消息执行失败。 */
  ok: false;
  /** 可选：错误信息（国际化 key + 参数），由 UI 侧渲染 */
  error?: I18nText;
}

/** SW 消息最常见的标准响应联合类型。 */
export type SwStdResponse = SwOkResponse | SwErrorResponse;

/** element/picker/start 的响应（可能带 warning） */
export interface SwPickerStartResponse extends SwOkResponse {
  /** 可选：非致命提示（国际化 key + 参数），由 UI 侧渲染 */
  warning?: I18nText;
}

/** technology-stack one-shot 标准响应。 */
export interface SwTechnologyStackResponse extends SwOkResponse {
  /** 技术栈结果。 */
  payload: TechnologyStackResult | null;
  /** 内部页面身份与增强状态，不进入 UI 产品态或 AI prompt。 */
  meta?: {
    /** Service Worker 页面生命周期身份。 */
    pageKey: string;
    /** 当前 payload 是否已经完成 delayed JS / external snippets 增强。 */
    enhanced: boolean;
  };
  /** 稳定失败码。 */
  error?: string;
}

/** link-preview one-shot 标准响应。 */
export type SwLinkPreviewMetadataResponse =
  | (SwOkResponse & {
    /** 链接预览元数据；无法获取时为 `null`。 */
    payload: LinkPreviewMetadata | null;
    /** 稳定失败码；成功时为空。 */
    error?: LinkPreviewErrorCode;
  })
  | SwErrorResponse;

/** Content Script 返回的技术栈页面信号载荷。 */
export interface TechnologyStackSignalsResponse {
  /** 页面信号；采集失败时为空。 */
  payload?: TechnologyPageSignals | null;
}
