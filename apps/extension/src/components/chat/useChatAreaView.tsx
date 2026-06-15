/**
 * 说明：`useChatAreaView` 组件模块。
 *
 * 职责：
 * - 承载 `useChatAreaView` 相关的当前文件实现与模块边界；
 * - 对外暴露 `useChatAreaView` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { ForwardedRef } from "react";
import { ChatAreaContent } from "./chat-area/ChatAreaContent";
import { useChatAreaController } from "./chat-area/useChatAreaController";
import type { ChatAreaHandle, ChatAreaProps } from "./chat-area/types";

export type { ChatAreaHandle, ChatAreaProps } from "./chat-area/types";

/**
 * 导出 Hook：`useChatAreaView`。
 *
 * @remarks
 * 对外暴露可复用的状态、派生值或副作用封装，调用方应遵守 Hook 调用约束。
 */
export function useChatAreaView(props: ChatAreaProps, ref: ForwardedRef<ChatAreaHandle>) {
  const controller = useChatAreaController(props, ref);
  return <ChatAreaContent controller={controller} />;
}
