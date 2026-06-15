/**
 * 说明：`debug-events` 基础能力模块。
 *
 * 职责：
 * - 承载 `debug-events` 相关的当前文件实现与模块边界；
 * - 对外暴露 `DeveloperDebugEventInput`、`shouldCaptureDeveloperEvents`、`emitDeveloperDebugEvent` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useChatSettingsStore } from '@/hooks/useChatSettingsStore';
import { useDeveloperToolsStore, type DeveloperDebugSource } from '@/hooks/useDeveloperToolsStore';

/** 导出类型：`DeveloperDebugEventInput`。 */
export type DeveloperDebugEventInput = {
  requestId: string;
  source: DeveloperDebugSource;
  kind: string;
  payload?: unknown;
};

/**
 * 导出函数：`shouldCaptureDeveloperEvents`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function shouldCaptureDeveloperEvents(): boolean {
  return import.meta.env.DEV || Boolean(useChatSettingsStore.getState().settings.enableDeveloperMode);
}

/**
 * 导出函数：`emitDeveloperDebugEvent`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function emitDeveloperDebugEvent(event: DeveloperDebugEventInput): void {
  if (!shouldCaptureDeveloperEvents()) return;
  useDeveloperToolsStore.getState().pushEvent({
    requestId: event.requestId,
    source: event.source,
    kind: event.kind,
    payload: event.payload,
  });
}
