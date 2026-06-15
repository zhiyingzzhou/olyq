/**
 * 说明：`scheduler` 浏览器上下文统一调度模块。
 *
 * 职责：
 * - 收口 metadata 跟随、面板可见预热、输入意图预热与手动刷新；
 * - 把旧的“metadata 变化即 full rebuild”彻底切成“身份跟随 + 按意图采集”；
 * - 保证预热任务可取消，避免快速切页/切会话后晚到结果回写当前页。
 *
 * 边界：
 * - 发送前 authoritative preflight 不走这里，而是走 `resolveBrowserContextForSend()`；
 * - 本模块不直接拼 system prompt，也不处理截图附件；
 * - 这里只负责任务调度与 runtime 状态维护。
 */
import { useAssistantStore } from '@/hooks/useAssistantStore';
import { resolveAssistantTopic } from '@/lib/chat/topic-tree';
import { buildBrowserContextPrompt } from './collectors';
import { resolveBrowserContextEffectiveState } from './effective-state';
import { recordBrowserContextMetadataToStaleLatency } from './metrics';
import {
  getBrowserContextSourceManifest,
  setBrowserContextLastCollection,
  setBrowserContextCollecting,
  setBrowserContextSourceManifest,
  setBrowserContextStatus,
} from './runtime';
import type { BrowserContextSourceManifest, BrowserContextWorkReason } from './types';

let activeWarmTaskController: AbortController | null = null;
let activeWarmTaskTimeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;

type WarmBrowserContextWorkReason = Exclude<BrowserContextWorkReason, 'send-preflight' | 'metadata-follow'>;

/** 自动上下文预热任务的总超时预算。 */
const BROWSER_CONTEXT_WARM_TASK_TIMEOUT_MS: Record<WarmBrowserContextWorkReason, number> = {
  'panel-visible': 6_000,
  'input-intent': 4_000,
  'manual-refresh': 12_000,
};

/**
 * 把现有 manifest 全量标记为 stale。
 *
 * @param manifest - 当前 source manifest。
 * @returns 标记为 stale 的新 manifest。
 */
function markManifestStale(manifest: BrowserContextSourceManifest): BrowserContextSourceManifest {
  return {
    'tab-meta': {
      ...manifest['tab-meta'],
      freshness: manifest['tab-meta'].payloadRef ? 'stale' : manifest['tab-meta'].freshness,
      issueCode: manifest['tab-meta'].payloadRef ? 'stale' : manifest['tab-meta'].issueCode,
    },
    'technology-stack': {
      ...manifest['technology-stack'],
      freshness: manifest['technology-stack'].payloadRef ? 'stale' : manifest['technology-stack'].freshness,
      issueCode: manifest['technology-stack'].payloadRef ? 'stale' : manifest['technology-stack'].issueCode,
    },
    'readable-dom': {
      ...manifest['readable-dom'],
      freshness: manifest['readable-dom'].payloadRef ? 'stale' : manifest['readable-dom'].freshness,
      issueCode: manifest['readable-dom'].payloadRef ? 'stale' : manifest['readable-dom'].issueCode,
    },
    'page-style-signals': {
      ...manifest['page-style-signals'],
      freshness: manifest['page-style-signals'].payloadRef ? 'stale' : manifest['page-style-signals'].freshness,
      issueCode: manifest['page-style-signals'].payloadRef ? 'stale' : manifest['page-style-signals'].issueCode,
    },
    'selection-snapshot': {
      ...manifest['selection-snapshot'],
      freshness: manifest['selection-snapshot'].payloadRef ? 'stale' : manifest['selection-snapshot'].freshness,
      issueCode: manifest['selection-snapshot'].payloadRef ? 'stale' : manifest['selection-snapshot'].issueCode,
    },
    'element-snapshot': {
      ...manifest['element-snapshot'],
      freshness: manifest['element-snapshot'].payloadRef ? 'stale' : manifest['element-snapshot'].freshness,
      issueCode: manifest['element-snapshot'].payloadRef ? 'stale' : manifest['element-snapshot'].issueCode,
    },
  };
}

/**
 * 根据 conversationKey 定位当前会话助手。
 *
 * @param conversationKey - 当前会话 key。
 * @returns 命中的助手；未找到时返回 `null`。
 */
function resolveScheduledAssistant(conversationKey: string) {
  const assistants = useAssistantStore.getState().assistants;
  return resolveAssistantTopic(assistants, conversationKey)?.assistant ?? null;
}

/**
 * 清理当前预热任务的总超时定时器。
 */
function clearWarmTaskTimeout(): void {
  if (!activeWarmTaskTimeoutId) return;
  globalThis.clearTimeout(activeWarmTaskTimeoutId);
  activeWarmTaskTimeoutId = null;
}

/**
 * 取消当前预热任务。
 */
function cancelWarmTask(): void {
  const controller = activeWarmTaskController;
  if (!controller) return;
  clearWarmTaskTimeout();
  controller.abort();
  activeWarmTaskController = null;
  // 调度器是预热任务生命周期 owner；取消发生在 collector 外层时，也必须同步结束刷新旋转态。
  setBrowserContextCollecting(false);
}

/**
 * 为预热任务安装总超时。
 *
 * 说明：collector 内部的稳定窗口超时只能覆盖页面侧等待；如果 content script
 * one-shot 或更内层 promise 因浏览器后台节流长期不返回，调度器必须拥有整条预热
 * 链路的最后回收点，确保刷新按钮不会无限旋转。
 *
 * @param controller - 当前预热任务的 AbortController。
 * @param reason - 当前预热原因。
 */
function installWarmTaskTimeout(controller: AbortController, reason: WarmBrowserContextWorkReason): void {
  clearWarmTaskTimeout();
  const timeoutMs = BROWSER_CONTEXT_WARM_TASK_TIMEOUT_MS[reason];
  activeWarmTaskTimeoutId = globalThis.setTimeout(() => {
    if (activeWarmTaskController !== controller || controller.signal.aborted) return;
    controller.abort();
    activeWarmTaskController = null;
    activeWarmTaskTimeoutId = null;
    setBrowserContextCollecting(false);
    setBrowserContextStatus('degraded');
  }, timeoutMs);
}

/**
 * 统一调度 browser-context 工作。
 *
 * @param options - 调度参数。
 */
export function scheduleBrowserContextWork(options: {
  reason: Exclude<BrowserContextWorkReason, 'send-preflight'>;
  conversationKey: string;
  priority?: number;
  abortSignal?: AbortSignal;
}): void {
  void options.priority;
  const conversationKey = String(options.conversationKey || '').trim();
  if (!conversationKey) {
    cancelWarmTask();
    return;
  }

  const assistant = resolveScheduledAssistant(conversationKey);
  const effectiveState = resolveBrowserContextEffectiveState({
    assistant,
    conversationKey,
  });
  if (!effectiveState.effective) {
    cancelWarmTask();
    setBrowserContextLastCollection(null);
    setBrowserContextStatus('unavailable');
    return;
  }

  if (options.reason === 'metadata-follow') {
    const startedAt = performance.now();
    cancelWarmTask();
    setBrowserContextSourceManifest(markManifestStale(getBrowserContextSourceManifest()));
    setBrowserContextLastCollection(null);
    setBrowserContextStatus('stale');
    recordBrowserContextMetadataToStaleLatency(performance.now() - startedAt);
    return;
  }

  if (!assistant?.id) {
    cancelWarmTask();
    return;
  }

  cancelWarmTask();
  const controller = new AbortController();
  activeWarmTaskController = controller;
  installWarmTaskTimeout(controller, options.reason);
  if (options.abortSignal) {
    options.abortSignal.addEventListener('abort', () => {
      if (activeWarmTaskController !== controller) return;
      controller.abort();
      clearWarmTaskTimeout();
      activeWarmTaskController = null;
      setBrowserContextCollecting(false);
    }, { once: true });
  }

  void buildBrowserContextPrompt({
    assistantId: assistant.id,
    conversationKey,
    force: options.reason === 'manual-refresh',
    signal: controller.signal,
    reason: options.reason,
  }).catch(() => {
    if (controller.signal.aborted) return;
    setBrowserContextStatus('degraded');
  }).finally(() => {
    if (activeWarmTaskController === controller) {
      clearWarmTaskTimeout();
      activeWarmTaskController = null;
      setBrowserContextCollecting(false);
    }
  });
}

/**
 * 取消当前所有预热任务。
 */
export function cancelScheduledBrowserContextWork(): void {
  cancelWarmTask();
}
