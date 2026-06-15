/**
 * 说明：`types` 后台运行时模块。
 *
 * 职责：
 * - 承载 `types` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ActiveRequestEntry`、`ActiveHealthCheckEntry`、`MessageHandler` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { UiEvent } from "../port-manager";
import type { PageToolSessionTool } from "@/types/sw-messages";
import type { SwInboundMessage } from "@/types/sw-messages";
import type { UiPortOutboundMessage } from "@/types/sw-port-messages";
import type {
  SidePanelOwnerClaimResult,
  SidePanelOwnerRecord,
  SidePanelPageToolCommandResult,
} from "../side-panel-service";
import type { SwKeepAliveConfig } from "@/lib/extension/sw-keepalive-config";

/** 当前活跃请求条目。 */
export type ActiveRequestEntry = {
  /** 本次请求的 AbortController。 */
  controller: AbortController;
  /** 与请求绑定的 UI Port。 */
  port: chrome.runtime.Port;
  /** 本次请求里产生过的 toolCallId 集合。 */
  toolCallIds: Set<string>;
};

/** 当前活跃健康检查请求条目。 */
export type ActiveHealthCheckEntry = {
  /** 对应健康检查任务的取消控制器。 */
  controller: AbortController;
  /** 发起该健康检查的 UI Port。 */
  port: chrome.runtime.Port;
};

/** UI Port 消息处理器。 */
export type MessageHandler = (port: chrome.runtime.Port, msg: Record<string, unknown>) => void;

/** 一次性消息处理器。 */
export type OneShotHandler = (
  msg: Record<string, unknown>,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
) => boolean | void;

/** UI Port handler 映射；key 只能来自当前 Port 协议联合类型。 */
export type PortMessageHandlerMap = Partial<Record<UiPortOutboundMessage['type'], MessageHandler>>;

/** one-shot handler 映射；key 只能来自当前 SW one-shot 协议联合类型。 */
export type OneShotHandlerMap = Partial<Record<SwInboundMessage['type'], OneShotHandler>>;

/**
 * Handler 工厂上下文。
 *
 * 说明：
 * - 由 `service-worker.ts` 注入所有运行时状态与宿主能力；
 * - `message-handlers.ts` 只负责路由与编排，不在模块内部自行维护全局状态。
 */
export interface HandlerContext {
  /** 正在进行中的聊天请求表。 */
  activeChats: Map<string, ActiveRequestEntry>;
  /** 正在进行中的图片生成请求表。 */
  activeImages: Map<string, ActiveRequestEntry>;
  /** 正在进行中的音频转写请求表。 */
  activeTranscriptions: Map<string, ActiveRequestEntry>;
  /** 正在进行中的语音合成请求表。 */
  activeSpeeches: Map<string, ActiveRequestEntry>;
  /** 正在进行中的结构化对象生成请求表。 */
  activeObjects: Map<string, ActiveRequestEntry>;
  /** toolCallId 到请求 ID 的反向映射。 */
  toolCallToRequestId: Map<string, string>;
  /** 正在进行中的健康检查请求表。 */
  activeHealthChecks: Map<string, ActiveHealthCheckEntry>;

  /** 确保侧边栏已打开。 */
  ensurePanel: (tabId?: number | null) => Promise<void>;
  /** 在 content-script 用户手势链路里立即打开当前 tab 主面板。 */
  openPanelForTabFromUserGesture: (tabId: number, pageToolGeneration?: number) => Promise<void>;
  /** 获取当前激活标签页 ID。 */
  getActiveTabId: () => Promise<number | null>;
  /** 把当前页面 metadata 推送到 UI。 */
  pushBrowserContextMetadataForTab: (tabId: number) => Promise<void>;
  /** 获取 Service Worker 当前状态快照。 */
  getSwStatus: () => Promise<Record<string, unknown>>;
  /** 应用 SW 保活配置。 */
  applyKeepAliveConfig: (cfg: SwKeepAliveConfig) => Promise<void>;
  /** 向全部 UI 端口广播事件。 */
  postToAllUi: (evt: UiEvent) => void;
  /** 开始 Side Panel 单 owner 页面工具会话。 */
  beginPageToolSidePanelOwner: (params: { tabId: number; tool: PageToolSessionTool; sessionId?: string }) => SidePanelOwnerRecord;
  /** 取消当前 Side Panel 页面工具 owner。 */
  cancelPageToolSidePanelOwner: (generation?: number) => void;
  /** 认领当前 Side Panel 页面工具 owner。 */
  claimPageToolSidePanelOwner: (params: {
    sessionId?: string | null;
    tool?: PageToolSessionTool | null;
    fallbackTabId?: number | null;
    returnToPanel?: boolean;
  }) => SidePanelOwnerClaimResult;
  /** 向单 owner Side Panel 投递页面工具命令并等待业务 ack。 */
  postPageToolCommandToSidePanel: (generation: number, evt: UiEvent) => Promise<SidePanelPageToolCommandResult>;
  /** 读取当前 SW 保活配置。 */
  loadKeepAliveConfig: () => Promise<SwKeepAliveConfig>;
}
