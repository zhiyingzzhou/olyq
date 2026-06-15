/**
 * 说明：`runtime` 浏览器上下文运行时模块。
 *
 * 职责：
 * - 承载浏览器上下文的轻量 metadata、选择快照、元素快照和订阅广播；
 * - 为 UI 状态条与上下文流水线提供共享的运行时真源；
 * - 只维护事件驱动的内存态，不把跨重启配置放在这里。
 *
 * 边界：
 * - 本文件不直接调用浏览器 API 采集正文，正文采集由 collector registry 按需完成；
 * - Service Worker / content script 的消息桥接通过上层 listener 调用注入。
 */
import type {
  BrowserContextCollectionPreview,
  BrowserContextElementSnapshot,
  BrowserContextMetadataSnapshot,
  BrowserContextProfile,
  BrowserContextSelectionSnapshot,
  BrowserContextSourceManifest,
  BrowserContextViewStatus,
  BrowserContextViewState,
} from './types';
import { getBrowserContextConversationMode } from './conversation-mode';
import {
  getBrowserContextSettings,
  isBrowserContextEnabled,
  setBrowserContextEnabled,
} from './settings';
import {
  cloneBrowserContextSourceManifest,
  createEmptyBrowserContextSourceManifest,
  getDefaultBrowserContextProfile,
} from './types';

type BrowserContextListener = (state: BrowserContextViewState) => void;

let metadataSnapshot: BrowserContextMetadataSnapshot | null = null;
let selectionSnapshot: BrowserContextSelectionSnapshot | null = null;
let elementSnapshot: BrowserContextElementSnapshot | null = null;
let effectiveProfile: BrowserContextProfile | null = getDefaultBrowserContextProfile();
let collecting = false;
let status: BrowserContextViewStatus = 'unavailable';
let lastCollection: BrowserContextCollectionPreview | null = null;
let sourceManifest: BrowserContextSourceManifest = createEmptyBrowserContextSourceManifest();
let activeConversationKey: string | null = null;
const listeners = new Set<BrowserContextListener>();

/**
 * 构建最新的视图状态。
 *
 * @returns 当前运行时快照。
 */
function getCurrentState(): BrowserContextViewState {
  const conversationMode = getBrowserContextConversationMode(activeConversationKey);
  return {
    enabled: conversationMode.enabled,
    masterEnabled: isBrowserContextEnabled(),
    metadata: metadataSnapshot ? { ...metadataSnapshot } : null,
    status,
    profile: effectiveProfile ? { ...effectiveProfile, sources: [...effectiveProfile.sources] } : null,
    loaded: true,
    collecting,
    conversationMode,
    sourceManifest: cloneBrowserContextSourceManifest(sourceManifest),
    lastCollection: lastCollection
      ? {
          ...lastCollection,
          headings: lastCollection.headings.map((item) => ({ ...item })),
          issues: lastCollection.issues.map((item) => ({ ...item })),
          sources: [...lastCollection.sources],
          styleCapture: lastCollection.styleCapture ? { ...lastCollection.styleCapture } : null,
        }
      : null,
  };
}

/** 获取当前浏览器上下文视图状态快照。 */
export function getBrowserContextViewState(): BrowserContextViewState {
  return getCurrentState();
}

/**
 * 广播当前运行时快照。
 */
function notify(): void {
  const state = getCurrentState();
  for (const listener of listeners) listener(state);
}

/** 订阅浏览器上下文视图状态变化。 */
export function onBrowserContextChange(listener: BrowserContextListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 获取当前 metadata。 */
export function getBrowserContextMetadata(): BrowserContextMetadataSnapshot | null {
  return metadataSnapshot ? { ...metadataSnapshot } : null;
}

/** 获取当前 selection 快照。 */
export function getBrowserContextSelectionSnapshot(): BrowserContextSelectionSnapshot | null {
  return selectionSnapshot ? { ...selectionSnapshot } : null;
}

/** 获取当前 element 快照。 */
export function getBrowserContextElementSnapshot(): BrowserContextElementSnapshot | null {
  return elementSnapshot ? { ...elementSnapshot } : null;
}

/** 获取当前有效 profile。 */
export function getBrowserContextProfile(): BrowserContextProfile | null {
  return effectiveProfile ? { ...effectiveProfile, sources: [...effectiveProfile.sources] } : null;
}

/** 获取最近一次正文采集预览。 */
export function getBrowserContextLastCollection(): BrowserContextCollectionPreview | null {
  return lastCollection
    ? {
        ...lastCollection,
        headings: lastCollection.headings.map((item) => ({ ...item })),
        issues: lastCollection.issues.map((item) => ({ ...item })),
        sources: [...lastCollection.sources],
        styleCapture: lastCollection.styleCapture ? { ...lastCollection.styleCapture } : null,
      }
    : null;
}

/** 获取当前 source manifest。 */
export function getBrowserContextSourceManifest(): BrowserContextSourceManifest {
  return cloneBrowserContextSourceManifest(sourceManifest);
}

/** 获取当前声明为活跃的会话 ID。 */
export function getBrowserContextActiveConversationKey(): string | null {
  return activeConversationKey;
}

/**
 * 设置当前有效 profile。
 *
 * @param profile - 新 profile。
 */
export function setBrowserContextProfile(profile: BrowserContextProfile | null): void {
  effectiveProfile = profile ? { ...profile, sources: [...profile.sources] } : null;
  notify();
}

/**
 * 更新 metadata 快照。
 *
 * @param next - 新 metadata。
 */
export function setBrowserContextMetadata(next: BrowserContextMetadataSnapshot | null): void {
  metadataSnapshot = next ? { ...next } : null;
  if (!metadataSnapshot && status !== 'warming') status = 'unavailable';
  notify();
}

/**
 * 更新当前 source manifest。
 *
 * @param next - 新 manifest。
 */
export function setBrowserContextSourceManifest(next: BrowserContextSourceManifest): void {
  sourceManifest = cloneBrowserContextSourceManifest(next);
  notify();
}

/**
 * 更新当前 browser-context 视图状态。
 *
 * @param next - 新状态。
 */
export function setBrowserContextStatus(next: BrowserContextViewStatus): void {
  status = next;
  notify();
}

/**
 * 更新最近一次正文采集预览。
 *
 * @param next - 新预览。
 */
export function setBrowserContextLastCollection(next: BrowserContextCollectionPreview | null): void {
  lastCollection = next
    ? {
        ...next,
        headings: next.headings.map((item) => ({ ...item })),
        issues: next.issues.map((item) => ({ ...item })),
        sources: [...next.sources],
        styleCapture: next.styleCapture ? { ...next.styleCapture } : null,
      }
    : null;
  notify();
}

/**
 * 声明当前正在展示的会话。
 *
 * @param conversationKey - 当前会话 ID。
 */
export function setBrowserContextActiveConversationKey(conversationKey: string | null | undefined): void {
  const normalizedKey = String(conversationKey || '').trim();
  const nextKey = normalizedKey || null;
  if (activeConversationKey === nextKey) return;
  activeConversationKey = nextKey;
  lastCollection = null;
  notify();
}

/**
 * 更新最近一次选区快照。
 *
 * @param next - 新快照。
 */
export function setBrowserContextSelectionSnapshot(next: BrowserContextSelectionSnapshot | null): void {
  selectionSnapshot = next ? { ...next } : null;
}

/**
 * 更新最近一次元素快照。
 *
 * @param next - 新快照。
 */
export function setBrowserContextElementSnapshot(next: BrowserContextElementSnapshot | null): void {
  elementSnapshot = next ? { ...next } : null;
}

/**
 * 写入当前采集中状态。
 *
 * @param next - 是否采集中。
 */
export function setBrowserContextCollecting(next: boolean): void {
  collecting = Boolean(next);
  if (collecting) status = 'warming';
  notify();
}

/**
 * 获取当前总开关设置快照。
 *
 * @returns 最新设置。
 */
export function getBrowserContextViewSettings() {
  return getBrowserContextSettings();
}

/**
 * 更新总开关，并在关闭时清空 metadata 视图快照。
 *
 * @param enabled - 是否启用。
 */
export function toggleBrowserContextEnabled(enabled: boolean): void {
  setBrowserContextEnabled(Boolean(enabled));
  if (!enabled) {
    metadataSnapshot = null;
    collecting = false;
    status = 'unavailable';
    lastCollection = null;
    sourceManifest = createEmptyBrowserContextSourceManifest();
  }
  notify();
}

/**
 * 清空运行时缓存快照。
 *
 * 说明：
 * - 不影响持久化策略中心；
 * - 用于 tab 切换、手动刷新和权限丢失后做快速失效。
 */
export function resetBrowserContextRuntime(): void {
  metadataSnapshot = null;
  selectionSnapshot = null;
  elementSnapshot = null;
  collecting = false;
  status = 'unavailable';
  lastCollection = null;
  sourceManifest = createEmptyBrowserContextSourceManifest();
  notify();
}
