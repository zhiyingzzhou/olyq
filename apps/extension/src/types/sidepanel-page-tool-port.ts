/**
 * 说明：Side Panel 页面工具专用 Port 协议。
 *
 * 职责：
 * - 定义 `olyq:sidepanel` 专用长连接上的命令与回执；
 * - 让页面工具结果投递不再复用共享 `olyq:ui` 流式通道；
 * - 用 `generation` 表达单 owner 会话，旧命令不能完成新会话。
 *
 * 边界：
 * - 本文件只定义协议类型，不创建 Port、不访问浏览器 API；
 * - `command` 仍复用后台 UiEvent 结构，业务处理归 Sidepanel React bridge。
 */
import type { UiEvent } from '@/extension/background/port-manager';
import type { I18nText } from './i18n';

/** Side Panel 专用 Port 名称。 */
export const SIDEPANEL_PAGE_TOOL_PORT_NAME = 'olyq:sidepanel';

/** SW 发往 Sidepanel：要求主工作区处理一次页面工具结果或错误。 */
export type SidePanelPageToolCommandMessage = {
  /** 消息类型。 */
  type: 'sidepanel/page-tool-command';
  /** SW 生成的命令 ID。 */
  requestId: string;
  /** 当前单 owner 会话代际。 */
  generation: number;
  /** 页面工具事件。 */
  command: UiEvent;
};

/** SW 发往 Sidepanel：要求当前 React bridge 用指定 generation 重新确认 ready。 */
export type SidePanelPageToolReadyRequestMessage = {
  /** 消息类型。 */
  type: 'sidepanel/page-tool-ready-request';
  /** 当前单 owner 会话代际。 */
  generation: number;
};

/** Sidepanel 发往 SW：页面工具命令处理完成。 */
export type SidePanelPageToolCommandAckMessage = {
  /** 消息类型。 */
  type: 'sidepanel/page-tool-command-ack';
  /** 对应命令 ID。 */
  requestId: string;
  /** 对应单 owner 会话代际。 */
  generation: number;
  /** 处理结果；只有 ChatInput / toast 真实完成后才允许 ok。 */
  payload: {
    ok: boolean;
    error?: I18nText;
  };
};

/** Sidepanel 发往 SW：React bridge 已完成命令订阅，可以接收页面工具命令。 */
export type SidePanelPageToolBridgeReadyMessage = {
  /** 消息类型。 */
  type: 'sidepanel/page-tool-bridge-ready';
  /** 若由 SW ready request 触发，则带回当前单 owner 会话代际。 */
  generation?: number;
};

/** Sidepanel 专用 Port 从 SW 收到的消息。 */
export type SidePanelPageToolInboundMessage =
  | SidePanelPageToolReadyRequestMessage
  | SidePanelPageToolCommandMessage;

/** Sidepanel 专用 Port 发往 SW 的消息。 */
export type SidePanelPageToolOutboundMessage =
  | SidePanelPageToolBridgeReadyMessage
  | SidePanelPageToolCommandAckMessage;
