/**
 * 说明：`ChatArea` 组件模块。
 *
 * 职责：
 * - 承载 `ChatArea` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ChatArea` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { forwardRef } from 'react';

import { useChatAreaView, type ChatAreaHandle, type ChatAreaProps } from './useChatAreaView';

export type { ChatAreaHandle, ChatAreaProps } from './useChatAreaView';

/** ChatArea 薄入口组件。 */
export const ChatArea = forwardRef<ChatAreaHandle, ChatAreaProps>(function ChatArea(props, ref) {
  return useChatAreaView(props, ref);
});
