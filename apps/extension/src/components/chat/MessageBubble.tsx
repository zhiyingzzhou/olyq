/**
 * 说明：`MessageBubble` 组件模块。
 *
 * 职责：
 * - 承载 `MessageBubble` 相关的当前文件实现与模块边界；
 * - 对外暴露 `MessageBubble` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { memo } from 'react';

import { useMessageBubbleView } from './message-bubble/useMessageBubbleView';
import type { MessageBubbleProps } from './message-bubble/types';

/** MessageBubble 薄入口组件。 */
export const MessageBubble = memo(function MessageBubble(props: MessageBubbleProps) {
  return useMessageBubbleView(props);
});
