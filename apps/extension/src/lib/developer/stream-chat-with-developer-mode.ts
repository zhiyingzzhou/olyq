/**
 * 说明：`stream-chat-with-developer-mode` 基础能力模块。
 *
 * 职责：
 * - 承载 `stream-chat-with-developer-mode` 相关的当前文件实现与模块边界；
 * - 对外暴露 `StreamChatWithDeveloperModeOptions`、`streamChatWithDeveloperMode` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useChatSettingsStore } from '@/hooks/useChatSettingsStore';
import { useDeveloperToolsStore, type DeveloperDebugSource } from '@/hooks/useDeveloperToolsStore';
import { streamChat, type StreamChatOptions } from '@/lib/chat-stream';

/** 开发者模式感知版聊天参数。 */
export type StreamChatWithDeveloperModeOptions = StreamChatOptions & {
  /** 调试事件来源。 */
  developerSource?: DeveloperDebugSource;
};

/**
 * 在不改变业务发送逻辑的前提下，把 debug 透传统一收口到开发者模式。
 *
 * 说明：
 * - 若调用方显式传入 `debug`，优先使用显式值；
 * - 否则默认跟随 `enableDeveloperMode`；
 * - 统一把 `chat/debug` 事件写入开发者事件 store，并保留原调用方 `onDebug`。
 */
export async function streamChatWithDeveloperMode(opts: StreamChatWithDeveloperModeOptions): Promise<void> {
  const { developerSource = 'unknown', onDebug, debug, ...rest } = opts;
  const developerModeEnabled = Boolean(useChatSettingsStore.getState().settings.enableDeveloperMode);
  const resolvedDebug = typeof debug === 'boolean' ? debug : developerModeEnabled;

  await streamChat({
    ...rest,
    debug: resolvedDebug,
    onDebug: (event) => {
      useDeveloperToolsStore.getState().pushEvent({
        requestId: event.requestId,
        source: developerSource,
        kind: event.kind,
        payload: event.payload,
      });
      onDebug?.(event);
    },
  });
}

