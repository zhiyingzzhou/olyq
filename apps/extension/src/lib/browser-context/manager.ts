/**
 * 说明：`manager` 浏览器上下文 UI 桥接模块。
 *
 * 职责：
 * - 承载 UI Port 与 SW 之间的 metadata 监听、首次请求和缓存失效编排；
 * - 让 `browser-context` 运行时只关心状态，而消息桥接与当前会话的自动重建语义集中在一个地方；
 * - 在 SW 推送 tab 切换 / 页面加载 metadata 时，及时清理旧 body cache，并驱动当前会话自动上下文跟随新页面重建。
 *
 * 边界：
 * - 本文件负责 bridge 编排与“当前活跃会话”的自动重建触发，不持有正文采集细节；
 * - selection / element 快照由上层 UI 事件入口写入 runtime，不在这里处理。
 */
import { useAssistantStore } from '@/hooks/useAssistantStore';
import { resolveAssistantTopic } from '@/lib/chat/topic-tree';
import { onUiPortMessage, postUiPortMessage } from '@/extension/bridge/ui-port';
import {
  invalidateBrowserContextPromptCacheForTab,
  invalidateBrowserContextSourceCache,
  upsertTechnologyStackSourceCacheFromRuntimeUpdate,
} from './collectors';
import { resolveBrowserContextEffectiveState } from './effective-state';
import { scheduleBrowserContextWork } from './scheduler';
import {
  getBrowserContextActiveConversationKey,
  getBrowserContextMetadata,
  resetBrowserContextRuntime,
  setBrowserContextMetadata,
  setBrowserContextElementSnapshot,
  setBrowserContextLastCollection,
  setBrowserContextSelectionSnapshot,
} from './runtime';
import { getBrowserContextSettings } from './settings';
import type { BrowserContextMetadataSnapshot } from './types';
import type { TechnologyStackResult } from '@/lib/technology-stack/types';

let inited = false;
let disposePortListener: (() => void) | null = null;

/**
 * 解析 SW 推送的 metadata 负载。
 *
 * @param payload - Port 负载。
 * @returns 标准化 metadata；无效时返回 `null`。
 */
function parseMetadataPayload(payload: unknown): BrowserContextMetadataSnapshot | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  const url = typeof record.url === 'string' ? record.url : '';
  const tabId = typeof record.tabId === 'number' ? record.tabId : 0;
  if (!url || !tabId) return null;
  const technologyStackPageKey = typeof record.technologyStackPageKey === 'string' ? record.technologyStackPageKey : '';
  return {
    title: typeof record.title === 'string' ? record.title : '',
    url,
    favicon: typeof record.favicon === 'string' ? record.favicon : '',
    tabId,
    extractedAt: typeof record.extractedAt === 'number' ? record.extractedAt : Date.now(),
    ...(technologyStackPageKey ? { technologyStackPageKey } : {}),
  };
}

/**
 * 判断两份 metadata 是否仍指向同一个网页 tab。
 *
 * @param left - 旧 metadata。
 * @param right - 新 metadata。
 * @returns 是否仍为同一页面身份。
 */
function isSameMetadataIdentity(
  left: BrowserContextMetadataSnapshot | null,
  right: BrowserContextMetadataSnapshot | null,
): boolean {
  if (!left || !right) return false;
  return left.tabId === right.tabId && left.url === right.url;
}

/** 判断两份 metadata 是否绑定同一个技术栈页面身份。 */
function isSameTechnologyStackPageIdentity(
  left: BrowserContextMetadataSnapshot | null,
  right: BrowserContextMetadataSnapshot | null,
): boolean {
  return (left?.technologyStackPageKey ?? '') === (right?.technologyStackPageKey ?? '');
}

/** 解析当前活跃会话里 technology-stack source 的缓存 TTL。 */
function resolveActiveTechnologyStackCacheTtlMs(): number | null {
  const conversationKey = getBrowserContextActiveConversationKey();
  if (!conversationKey || !getBrowserContextSettings().enabled) return null;

  const assistants = useAssistantStore.getState().assistants;
  const resolved = resolveAssistantTopic(assistants, conversationKey);
  if (!resolved) return null;

  const effectiveState = resolveBrowserContextEffectiveState({
    assistant: resolved.assistant,
    conversationKey,
  });
  if (!effectiveState.effective || !effectiveState.profile.sources.includes('technology-stack')) return null;
  return effectiveState.profile.cacheTtlMs;
}

/** 判断未知对象是否像技术栈结果。 */
function isTechnologyStackResultPayload(payload: unknown): payload is TechnologyStackResult {
  if (!payload || typeof payload !== 'object') return false;
  const value = payload as Partial<TechnologyStackResult>;
  return typeof value.status === 'string'
    && (typeof value.tabId === 'number' || value.tabId === null)
    && typeof value.url === 'string'
    && typeof value.pageFingerprint === 'string'
    && Array.isArray(value.technologies);
}

/** 将技术栈 runtime update 同步进 browser-context source cache。 */
function handleTechnologyStackRuntimeUpdate(payload: unknown): void {
  if (!payload || typeof payload !== 'object') return;
  const record = payload as Record<string, unknown>;
  const pageKey = typeof record.pageKey === 'string' ? record.pageKey : '';
  const enhanced = typeof record.enhanced === 'boolean' ? record.enhanced : false;
  const result = isTechnologyStackResultPayload(record.result) ? record.result : null;
  const metadata = getBrowserContextMetadata();
  if (!pageKey || !result || metadata?.technologyStackPageKey !== pageKey) return;

  const cacheTtlMs = resolveActiveTechnologyStackCacheTtlMs();
  if (!cacheTtlMs) return;

  upsertTechnologyStackSourceCacheFromRuntimeUpdate({
    pageKey,
    result: result as unknown as Record<string, unknown>,
    enhanced,
    cacheTtlMs,
  });
}

/**
 * 在当前活跃会话里同步 metadata 跟随语义。
 *
 * 说明：
 * - metadata update 不再直接触发 full rebuild；
 * - 这里只在当前活跃会话有效时发出统一调度原因，后续是否预热由 scheduler 决定。
 */
function followActiveConversationBrowserContextMetadata(): void {
  const conversationKey = getBrowserContextActiveConversationKey();
  if (!conversationKey || !getBrowserContextSettings().enabled) return;

  const assistants = useAssistantStore.getState().assistants;
  const resolved = resolveAssistantTopic(assistants, conversationKey);
  if (!resolved) return;

  const effectiveState = resolveBrowserContextEffectiveState({
    assistant: resolved.assistant,
    conversationKey,
  });
  if (!effectiveState.effective) return;

  scheduleBrowserContextWork({
    reason: 'metadata-follow',
    conversationKey,
  });
}

/**
 * 请求当前 active tab 的 metadata 快照。
 */
export function requestBrowserContextMetadata(): void {
  if (!getBrowserContextSettings().enabled) {
    resetBrowserContextRuntime();
    return;
  }
  postUiPortMessage({ type: 'browser-context/metadata/request' });
}

/**
 * 初始化 browser-context metadata 监听。
 *
 * 说明：
 * - React 严格模式和 HMR 下可能重复执行，因此这里做幂等收口；
 * - URL / tab 变化会立刻清理 selection / element 快照与正文缓存，避免跨页面污染。
 */
export function initBrowserContextListener(): void {
  if (!inited) {
    inited = true;
    disposePortListener = onUiPortMessage((msg) => {
      if (msg.type === 'technology-stack/result-updated') {
        handleTechnologyStackRuntimeUpdate((msg as { payload?: unknown }).payload);
        return;
      }
      if (msg.type !== 'browser-context/metadata/update') return;

      const previous = getBrowserContextMetadata();
      const next = parseMetadataPayload((msg as { payload?: unknown }).payload);

      if (!next) {
        resetBrowserContextRuntime();
        return;
      }

      const metadataChanged = !isSameMetadataIdentity(previous, next);
      if (metadataChanged) {
        invalidateBrowserContextPromptCacheForTab({ tabId: previous?.tabId ?? null, url: previous?.url ?? null });
        setBrowserContextSelectionSnapshot(null);
        setBrowserContextElementSnapshot(null);
        setBrowserContextLastCollection(null);
      } else if (!isSameTechnologyStackPageIdentity(previous, next)) {
        invalidateBrowserContextSourceCache({
          sourceId: 'technology-stack',
          identity: previous?.technologyStackPageKey ?? null,
          tabId: previous?.tabId ?? null,
          url: previous?.url ?? null,
        });
      }

      setBrowserContextMetadata(next);
      if (metadataChanged) {
        followActiveConversationBrowserContextMetadata();
      }
    });
  }

  requestBrowserContextMetadata();
}

/**
 * 释放监听，仅用于测试和 HMR 兜底。
 */
export function disposeBrowserContextListener(): void {
  disposePortListener?.();
  disposePortListener = null;
  inited = false;
}
