/**
 * 说明：`message-handlers` 后台运行时模块。
 *
 * 职责：
 * - 承载 `message-handlers` 相关的当前文件实现与模块边界；
 * - 对外暴露 `createMessageHandlerMap`、`createOneShotHandlerMap` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 消息处理器映射表：UI Port / one-shot 消息路由。
 *
 * 薄入口文件，只负责维持 service worker 的稳定导出路径。
 */

import { createOneShotHandlers } from "./message-handlers/one-shot-handlers";
import { createPortChatHandlerMap } from "./message-handlers/port-chat-handlers";
import { createPortTaskHandlerMap } from "./message-handlers/port-task-handlers";
import type { HandlerContext, OneShotHandlerMap, PortMessageHandlerMap } from "./message-handlers/types";

export type {
  ActiveHealthCheckEntry,
  ActiveRequestEntry,
  HandlerContext,
  OneShotHandler,
  OneShotHandlerMap,
  PortMessageHandlerMap,
} from "./message-handlers/types";

/**
 * 导出函数：`createMessageHandlerMap`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function createMessageHandlerMap(ctx: HandlerContext): PortMessageHandlerMap {
  return {
    ...createPortTaskHandlerMap(ctx),
    ...createPortChatHandlerMap(ctx),
  };
}

/**
 * 导出函数：`createOneShotHandlerMap`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function createOneShotHandlerMap(ctx: HandlerContext): OneShotHandlerMap {
  return createOneShotHandlers(ctx);
}
