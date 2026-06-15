/**
 * 说明：technology-stack 扩展运行时 API。
 *
 * 职责：
 * - 为 UI 与 browser-context collector 提供统一的 Service Worker one-shot 请求入口；
 * - 避免组件或 collector 分散拼接 `chrome.runtime.sendMessage`；
 * - 保持技术栈插件可插拔，运行时 contract 集中在本模块。
 */
import type { TechnologyStackResult } from '@/lib/technology-stack/types';
import type { TechnologyStackErrorCode } from '@/lib/technology-stack/errors';
import type { SwMsg_TechnologyStackGet, SwMsg_TechnologyStackRefresh } from '@/types/sw-messages';
import { ensureUiPortReady, onUiPortMessage } from '@/extension/bridge/ui-port';
import { getExtensionRuntime, sendExtensionMessage } from './runtime-api';

/** technology-stack 后台响应。 */
export interface TechnologyStackRuntimeResponse {
  /** 请求是否成功到达后台。 */
  ok?: boolean;
  /** 技术栈结果。 */
  payload?: TechnologyStackResult | null;
  /** 内部页面身份与增强状态；只供运行时缓存和发送前上下文质量判断。 */
  meta?: {
    /** Service Worker 页面生命周期身份。 */
    pageKey: string;
    /** 当前 payload 是否已经完成 delayed JS / external snippets 增强。 */
    enhanced: boolean;
  };
  /** 稳定错误码。 */
  error?: TechnologyStackErrorCode;
}

/** technology-stack 内存缓存更新后的运行时通知负载。 */
export interface TechnologyStackResultUpdatedPayload {
  /** Service Worker 页面生命周期身份，用于 UI 判断结果是否仍属于当前页面。 */
  pageKey: string;
  /** 当前结果是否已完成后台增强；不作为用户可见产品态。 */
  enhanced: boolean;
  /** 结构化结果，不包含页面原文或 cookie 值。 */
  result: TechnologyStackResult;
}

/** technology-stack 内存缓存更新后的运行时通知消息。 */
export interface TechnologyStackResultUpdatedMessage {
  /** 通知类型。 */
  type: 'technology-stack/result-updated';
  /** 技术栈结果更新负载。 */
  payload?: TechnologyStackResultUpdatedPayload | null;
}

/** 判断未知 payload 是否像一个技术栈结果。 */
function isTechnologyStackResultPayload(payload: unknown): payload is TechnologyStackResult {
  if (!payload || typeof payload !== 'object') return false;
  const value = payload as Partial<TechnologyStackResult>;
  return (
    typeof value.status === 'string'
    && (typeof value.tabId === 'number' || value.tabId === null)
    && typeof value.url === 'string'
    && typeof value.pageFingerprint === 'string'
    && Array.isArray(value.technologies)
  );
}

/** 判断未知 payload 是否像一个技术栈更新事件。 */
function isTechnologyStackResultUpdatedPayload(payload: unknown): payload is TechnologyStackResultUpdatedPayload {
  if (!payload || typeof payload !== 'object') return false;
  const value = payload as Partial<TechnologyStackResultUpdatedPayload>;
  return typeof value.pageKey === 'string'
    && typeof value.enhanced === 'boolean'
    && isTechnologyStackResultPayload(value.result);
}

/** 请求当前页面技术栈。 */
export async function requestTechnologyStack(
  payload?: SwMsg_TechnologyStackGet['payload'],
): Promise<TechnologyStackRuntimeResponse | undefined> {
  return await sendExtensionMessage<TechnologyStackRuntimeResponse | undefined>({
    type: 'technology-stack/get',
    payload,
  });
}

/** 强制刷新当前页面技术栈。 */
export async function refreshTechnologyStack(
  payload?: SwMsg_TechnologyStackRefresh['payload'],
): Promise<TechnologyStackRuntimeResponse | undefined> {
  return await sendExtensionMessage<TechnologyStackRuntimeResponse | undefined>({
    type: 'technology-stack/refresh',
    payload,
  });
}

/**
 * 订阅技术栈内存缓存更新事件。
 *
 * @param listener - 收到当前页面候选结果时调用。
 * @returns 取消订阅函数；非扩展环境下为空操作。
 */
export function onTechnologyStackResultUpdated(listener: (payload: TechnologyStackResultUpdatedPayload) => void): () => void {
  const runtime = getExtensionRuntime();
  if (!runtime) return () => {};

  void ensureUiPortReady();

  /** 只接收后台技术栈结果更新事件，其它 Port 消息交回各自 owner。 */
  const handleMessage = (message: unknown) => {
    if (!message || typeof message !== 'object') return;
    const candidate = message as TechnologyStackResultUpdatedMessage;
    if (candidate.type !== 'technology-stack/result-updated') return;
    if (!isTechnologyStackResultUpdatedPayload(candidate.payload)) return;
    listener(candidate.payload);
  };

  return onUiPortMessage(handleMessage);
}
