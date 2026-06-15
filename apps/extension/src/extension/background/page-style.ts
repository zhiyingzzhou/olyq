/**
 * 说明：`page-style` 后台页面设计信号辅助模块。
 *
 * 职责：
 * - 为 browser-context 的“风格模式”提供内容脚本调用封装；
 * - 把页面设计信号读取集中到后台短链路 helper，避免 one-shot handler 直接处理浏览器消息细节；
 * - 负责页面视觉截图的滚动编排与 `captureVisibleTab` 调度，供聊天发送链路按需附加视觉上下文；
 * - 统一错误收敛，保证页面风格信号只作为可降级上下文，不阻断主聊天流程。
 *
 * 边界：
 * - 本模块只返回 data URL 级视觉样本，不直接操作聊天附件存储；
 * - 页面 DOM/CSS 的真实抽样仍由 content script 负责；
 * - 不持久化任何页面设计信号结果。
 */
import { I18nError } from '@/lib/i18n/error';
import {
  recordBrowserContextCaptureCoalescing,
  recordBrowserContextCaptureQueueWait,
  recordBrowserContextCaptureQuotaRetry,
  recordBrowserContextCaptureRequest,
} from '@/lib/browser-context/metrics';
import {
  getExtensionTab,
  isExtensionTabMessageError,
  sendExtensionTabMessage,
} from '@/lib/extension/runtime-api';
import type {
  PageStyleCapturesPayload,
  PageStyleCaptureFramePayload,
  PageStyleLayoutMetricsPayload,
  PageStyleSignalsPayload,
} from '@/types/sw-messages';

const DEFAULT_PAGE_STYLE_CAPTURE_LIMIT = 5;
const MAX_PAGE_STYLE_CAPTURE_LIMIT = 8;
const PAGE_STYLE_CAPTURE_SETTLE_DELAY_MS = 160;
const PAGE_STYLE_CAPTURE_VISIBLE_TAB_MIN_INTERVAL_MS = 700;
const PAGE_STYLE_CAPTURE_VISIBLE_TAB_QUOTA_RETRY_LIMIT = 3;
const PAGE_STYLE_CAPTURE_VISIBLE_TAB_QUOTA_ERROR_MARKER = 'MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND';
const PAGE_STYLE_CAPTURE_VISIBLE_TAB_QUOTA_RETRY_BACKOFF_MS = 700;
const DEFAULT_PAGE_STYLE_CAPTURE_PRIORITY = 1;

let lastPageStyleCaptureStartedAt = 0;
let nextCaptureQueueSequence = 0;
let captureQueueRunning = false;

interface QueuedPageStyleCaptureTask<T> {
  id: number;
  priority: number;
  queuedAt: number;
  run: () => Promise<T>;
  isObsolete: () => Promise<boolean> | boolean;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

const pendingPageStyleCaptureTasks: QueuedPageStyleCaptureTask<PageStyleCapturesPayload>[] = [];
const inFlightPageStyleCaptureRequests = new Map<string, Promise<PageStyleCapturesPayload>>();

/**
 * 将统一 tabs/message contract 错误映射为页面风格链路可消费的国际化错误。
 *
 * @param error - 共享 runtime contract 错误。
 * @returns 页面风格链路约定的稳定 I18nError。
 */
function toPageStyleMessageError(error: unknown): I18nError {
  if (isExtensionTabMessageError(error)) {
    if (error.reason === 'tab-unavailable') {
      return new I18nError('errors.pageStyleTabUnavailable', undefined, { cause: error });
    }
    if (error.detail) {
      return new I18nError('errors.pageStyleContentScriptUnavailableWithDetail', { detail: error.detail }, { cause: error });
    }
    return new I18nError('errors.pageStyleContentScriptUnavailable', undefined, { cause: error });
  }
  return new I18nError('errors.pageStyleContentScriptUnavailable', undefined, { cause: error });
}

/**
 * 统一向内容脚本发请求。
 *
 * @param tabId - 目标标签页。
 * @param message - 要发送的消息。
 * @returns 内容脚本返回值。
 */
async function sendPageStyleMessage<T>(tabId: number, message: Record<string, unknown>): Promise<T> {
  try {
    return await sendExtensionTabMessage<T>(tabId, message);
  } catch (error) {
    throw toPageStyleMessageError(error);
  }
}

/**
 * 请求页面设计信号。
 *
 * @param tabId - 目标标签页。
 * @param options - 页面侧稳定窗口等待参数。
 * @returns 设计信号结构。
 */
export async function requestPageStyleSignals(
  tabId: number,
  options: { stableWaitMs?: number } = {},
): Promise<PageStyleSignalsPayload> {
  const response = await sendPageStyleMessage<{ payload?: PageStyleSignalsPayload | null; error?: string }>(tabId, {
    type: 'page-style/signals/get',
    payload: { stableWaitMs: options.stableWaitMs },
  });
  if (response?.error === 'timeout') throw new Error('timeout');
  if (!response?.payload) throw new I18nError('errors.pageStyleSignalsUnavailable');
  return response.payload;
}

/**
 * 请求页面布局度量。
 *
 * @param tabId - 目标标签页。
 * @returns 页面高度、视口高度与当前滚动位置。
 */
export async function requestPageStyleLayoutMetrics(tabId: number): Promise<PageStyleLayoutMetricsPayload> {
  const response = await sendPageStyleMessage<{ payload?: PageStyleLayoutMetricsPayload | null }>(tabId, { type: 'page-style/layout/get' });
  if (!response?.payload) throw new I18nError('errors.pageStyleLayoutUnavailable');
  return response.payload;
}

/**
 * 设置页面滚动位置。
 *
 * @param tabId - 目标标签页。
 * @param top - 目标滚动位置。
 * @returns 滚动完成后的页面度量。
 */
export async function setPageStyleScrollPosition(tabId: number, top: number): Promise<PageStyleLayoutMetricsPayload> {
  const response = await sendPageStyleMessage<{ payload?: PageStyleLayoutMetricsPayload | null }>(tabId, {
    type: 'page-style/scroll-to',
    payload: { top },
  });
  if (!response?.payload) throw new I18nError('errors.pageStyleLayoutUnavailable');
  return response.payload;
}

/**
 * 归一化截图预算。
 *
 * @param value - 原始预算。
 * @returns 合法张数。
 */
function normalizeCaptureLimit(value: number | undefined): number {
  const raw = Math.floor(Number.isFinite(value) ? Number(value) : DEFAULT_PAGE_STYLE_CAPTURE_LIMIT);
  if (raw < 1) return 1;
  return Math.min(raw, MAX_PAGE_STYLE_CAPTURE_LIMIT);
}

/**
 * 规划整页截图的滚动采样点。
 *
 * @param metrics - 页面布局度量。
 * @param maxCaptures - 最大截图张数。
 * @returns 去重后的滚动位置列表。
 */
export function planPageStyleCaptureOffsets(
  metrics: Pick<PageStyleLayoutMetricsPayload, 'documentHeight' | 'viewportHeight'>,
  maxCaptures = DEFAULT_PAGE_STYLE_CAPTURE_LIMIT,
): number[] {
  const documentHeight = Math.max(0, Math.round(metrics.documentHeight || 0));
  const viewportHeight = Math.max(1, Math.round(metrics.viewportHeight || 0));
  const normalizedLimit = normalizeCaptureLimit(maxCaptures);
  const maxScroll = Math.max(0, documentHeight - viewportHeight);
  if (maxScroll <= 0) return [0];

  const requiredScreens = Math.max(1, Math.ceil(documentHeight / viewportHeight));
  const captureCount = Math.min(normalizedLimit, requiredScreens);
  if (captureCount <= 1) return [0];

  const offsets: number[] = [];
  for (let index = 0; index < captureCount; index += 1) {
    const ratio = captureCount === 1 ? 0 : index / (captureCount - 1);
    offsets.push(Math.round(maxScroll * ratio));
  }
  return Array.from(new Set(offsets));
}

/**
 * 读取标签页详情。
 *
 * @param tabId - 目标标签页。
 * @returns 标签页详情。
 */
async function getTabById(tabId: number): Promise<chrome.tabs.Tab> {
  const tab = await getExtensionTab(tabId);
  if (!tab) {
    throw new I18nError('errors.pageStyleTabUnavailable');
  }
  return tab;
}

/**
 * 等待指定毫秒数。
 *
 * @param ms - 等待时长。
 */
async function waitMs(ms: number): Promise<void> {
  const duration = Math.max(0, Math.round(ms));
  await new Promise<void>((resolve) => {
    globalThis.setTimeout(() => resolve(), duration);
  });
}

/**
 * 等待页面滚动后的渲染稳定。
 */
async function waitForCaptureSettle(): Promise<void> {
  await waitMs(PAGE_STYLE_CAPTURE_SETTLE_DELAY_MS);
}

/**
 * 判断浏览器返回的截图失败信息是否属于配额节流。
 *
 * @param detail - 浏览器错误详情。
 * @returns 是否命中 `captureVisibleTab` 的频率限制。
 */
function isPageStyleCaptureQuotaDetail(detail: string | null | undefined): boolean {
  return String(detail || '').includes(PAGE_STYLE_CAPTURE_VISIBLE_TAB_QUOTA_ERROR_MARKER);
}

/**
 * 把浏览器原生截图错误归一化成扩展侧错误。
 *
 * @param detail - 浏览器 `lastError.message`。
 * @returns 用户可见的国际化错误。
 */
function createPageStyleCaptureError(detail: string | null | undefined): I18nError {
  const normalizedDetail = String(detail || '').trim();
  if (isPageStyleCaptureQuotaDetail(normalizedDetail)) {
    return new I18nError('errors.pageStyleScreenshotsRateLimited');
  }
  if (normalizedDetail) {
    return new I18nError('errors.pageStyleScreenshotsUnavailableWithDetail', { detail: normalizedDetail });
  }
  return new I18nError('errors.pageStyleScreenshotsUnavailable');
}

/**
 * 为过期截图任务生成稳定错误。
 *
 * @returns 统一的 stale capture 错误。
 */
function createStalePageStyleCaptureError(): I18nError {
  return new I18nError('errors.pageStyleScreenshotsUnavailableWithDetail', { detail: 'stale-capture-request' });
}

/**
 * 归一化截图任务优先级。
 *
 * @param value - 原始优先级输入。
 * @returns 非负整数优先级。
 */
function normalizeCapturePriority(value: number | undefined): number {
  const raw = Math.round(Number.isFinite(value) ? Number(value) : DEFAULT_PAGE_STYLE_CAPTURE_PRIORITY);
  return Math.max(0, raw);
}

/**
 * 驱动全局截图队列串行执行。
 *
 * 说明：
 * - 同一时刻只允许一个 `captureVisibleTab` 任务运行；
 * - 开始前先按优先级与 FIFO 顺序排序；
 * - 已经判定过期的任务直接拒绝，不允许晚到结果继续回写当前会话。
 *
 * @returns 队列清空后返回。
 */
async function pumpPageStyleCaptureQueue(): Promise<void> {
  if (captureQueueRunning) return;
  captureQueueRunning = true;
  try {
    while (pendingPageStyleCaptureTasks.length > 0) {
      pendingPageStyleCaptureTasks.sort((left, right) => {
        if (left.priority === right.priority) return left.id - right.id;
        return right.priority - left.priority;
      });
      const task = pendingPageStyleCaptureTasks.shift()!;
      try {
        if (await task.isObsolete()) {
          task.reject(createStalePageStyleCaptureError());
          continue;
        }
        recordBrowserContextCaptureQueueWait(Date.now() - task.queuedAt);
        task.resolve(await task.run());
      } catch (error: unknown) {
        task.reject(error);
      }
    }
  } finally {
    captureQueueRunning = false;
  }
}

/**
 * 判断当前错误是否属于 `captureVisibleTab` 的频率节流。
 *
 * @param error - 待判断错误。
 * @returns 是否可安全重试。
 */
function isPageStyleCaptureQuotaError(error: unknown): boolean {
  return error instanceof I18nError && error.i18n.key === 'errors.pageStyleScreenshotsRateLimited';
}

/**
 * 串行化 `captureVisibleTab` 调用，并为浏览器原生节流留出最小间隔。
 *
 * 说明：
 * - Chrome 对 `captureVisibleTab` 有每秒调用配额；
 * - 这里按“全局串行 + 最小开始间隔”调度，避免同一页面多段截图或多个并发请求互相撞限。
 *
 * @param task - 实际截图任务。
 * @returns 任务结果。
 */
async function runInPageStyleCaptureSlot<T>(task: () => Promise<T>): Promise<T> {
  const waitDuration = Math.max(0, lastPageStyleCaptureStartedAt + PAGE_STYLE_CAPTURE_VISIBLE_TAB_MIN_INTERVAL_MS - Date.now());
  if (waitDuration > 0) {
    await waitMs(waitDuration);
  }
  lastPageStyleCaptureStartedAt = Date.now();
  return await task();
}

/**
 * 调用浏览器截图 API。
 *
 * @param windowId - 目标窗口 ID。
 * @returns PNG data URL。
 */
async function captureVisibleTabOnce(windowId: number | undefined): Promise<string> {
  recordBrowserContextCaptureRequest();
  return await new Promise<string>((resolve, reject) => {
    try {
      /**
       * 统一处理浏览器截图 API 的回调结果。
       *
       * @param dataUrl - 截图返回的 data URL。
       */
      const onCaptured = (dataUrl?: string) => {
        const lastError = chrome.runtime.lastError?.message ?? '';
        if (lastError) {
          reject(createPageStyleCaptureError(lastError));
          return;
        }
        if (!dataUrl) {
          reject(new I18nError('errors.pageStyleScreenshotsUnavailable'));
          return;
        }
        resolve(dataUrl);
      };

      if (typeof windowId === 'number') {
        chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, onCaptured);
        return;
      }
      chrome.tabs.captureVisibleTab({ format: 'png' }, onCaptured);
    } catch (error: unknown) {
      reject(new I18nError('errors.pageStyleScreenshotsUnavailable', undefined, { cause: error }));
    }
  });
}

/**
 * 调用浏览器截图 API，并在命中浏览器配额时做有限重试。
 *
 * @param windowId - 目标窗口 ID。
 * @returns PNG data URL。
 */
async function captureVisibleTab(windowId: number | undefined): Promise<string> {
  let lastQuotaError: unknown = null;
  for (let attempt = 0; attempt < PAGE_STYLE_CAPTURE_VISIBLE_TAB_QUOTA_RETRY_LIMIT; attempt += 1) {
    try {
      return await runInPageStyleCaptureSlot(() => captureVisibleTabOnce(windowId));
    } catch (error: unknown) {
      if (!isPageStyleCaptureQuotaError(error)) {
        throw error;
      }
      lastQuotaError = error;
      if (attempt >= PAGE_STYLE_CAPTURE_VISIBLE_TAB_QUOTA_RETRY_LIMIT - 1) {
        break;
      }
      recordBrowserContextCaptureQuotaRetry();
      // 命中浏览器原生配额时，额外退避一段时间再重试，避免连续短时间触发同一限制。
      await waitMs(PAGE_STYLE_CAPTURE_VISIBLE_TAB_QUOTA_RETRY_BACKOFF_MS * (attempt + 1));
    }
  }
  throw lastQuotaError ?? new I18nError('errors.pageStyleScreenshotsRateLimited');
}

/**
 * 抓取当前标签页的可见视口截图。
 *
 * @param windowId - 目标窗口 ID；为空时使用浏览器当前窗口。
 * @returns PNG data URL，供元素选择器视觉区域在 UI 侧继续裁剪。
 */
export async function captureVisibleViewportFrame(windowId: number | undefined): Promise<string> {
  return await captureVisibleTab(windowId);
}

/**
 * 抓取当前页面的视觉分段截图。
 *
 * @param tabId - 目标标签页。
 * @param options - 可选截图预算。
 * @returns 页面截图响应。
 */
export async function capturePageStyleFrames(
  tabId: number,
  options?: {
    maxCaptures?: number;
    captureRequestKey?: string;
    expectedPageFingerprint?: string;
    priority?: number;
  },
): Promise<PageStyleCapturesPayload> {
  const captureRequestKey = String(options?.captureRequestKey || '').trim();
  if (captureRequestKey) {
    const existing = inFlightPageStyleCaptureRequests.get(captureRequestKey);
    if (existing) {
      recordBrowserContextCaptureCoalescing(true);
      return existing;
    }
    recordBrowserContextCaptureCoalescing(false);
  }

  const task = new Promise<PageStyleCapturesPayload>((resolve, reject) => {
    const queuedTask: QueuedPageStyleCaptureTask<PageStyleCapturesPayload> = {
      id: nextCaptureQueueSequence++,
      priority: normalizeCapturePriority(options?.priority),
      queuedAt: Date.now(),
      isObsolete: async () => {
        if (!options?.expectedPageFingerprint) return false;
        try {
          const currentMetrics = await requestPageStyleLayoutMetrics(tabId);
          return currentMetrics.pageFingerprint !== options.expectedPageFingerprint;
        } catch {
          return false;
        }
      },
      run: async () => {
        const tab = await getTabById(tabId);
        const initialMetrics = await requestPageStyleLayoutMetrics(tabId);
        if (
          options?.expectedPageFingerprint
          && initialMetrics.pageFingerprint !== options.expectedPageFingerprint
        ) {
          throw createStalePageStyleCaptureError();
        }

        const offsets = planPageStyleCaptureOffsets(initialMetrics, options?.maxCaptures);
        const frames: PageStyleCaptureFramePayload[] = [];

        try {
          for (let index = 0; index < offsets.length; index += 1) {
            const targetTop = offsets[index] ?? 0;
            const currentMetrics = await setPageStyleScrollPosition(tabId, targetTop);
            if (
              options?.expectedPageFingerprint
              && currentMetrics.pageFingerprint !== options.expectedPageFingerprint
            ) {
              throw createStalePageStyleCaptureError();
            }
            await waitForCaptureSettle();
            const dataUrl = await captureVisibleTab(tab.windowId);
            frames.push({
              name: `page-style-${String(index + 1).padStart(2, '0')}.png`,
              mime: 'image/png',
              dataUrl,
              scrollY: currentMetrics.scrollY,
            });
          }
        } finally {
          try {
            await setPageStyleScrollPosition(tabId, initialMetrics.scrollY);
          } catch {
            // 忽略恢复失败：采集已经结束，主流程不应因此再抛出第二个错误覆盖原始原因。
          }
        }

        return {
          title: initialMetrics.title,
          url: initialMetrics.url,
          pageFingerprint: initialMetrics.pageFingerprint,
          routeKey: initialMetrics.routeKey,
          stableWindowVersion: initialMetrics.stableWindowVersion,
          extractedAt: Date.now(),
          frames,
        };
      },
      resolve,
      reject,
    };
    pendingPageStyleCaptureTasks.push(queuedTask);
    void pumpPageStyleCaptureQueue();
  });

  if (captureRequestKey) {
    inFlightPageStyleCaptureRequests.set(captureRequestKey, task);
    /**
     * 清理当前 ask/page 对应的 in-flight 截图 Promise。
     *
     * 说明：这里用 `then(success, failure)` 而不是 detached `finally()`，避免截图失败时派生
     * Promise 继承 rejection 并在调用方已处理原始任务后继续触发未处理 Promise 错误。
     */
    const cleanupInFlightCaptureRequest = () => {
      if (inFlightPageStyleCaptureRequests.get(captureRequestKey) === task) {
        inFlightPageStyleCaptureRequests.delete(captureRequestKey);
      }
    };
    void task.then(cleanupInFlightCaptureRequest, cleanupInFlightCaptureRequest);
  }

  return task;
}

/**
 * 将页面风格截图错误收敛成 browser-context 可消费的稳定 reason code。
 *
 * @param error - 原始错误。
 * @returns 稳定 reason code。
 */
export function normalizePageStyleCaptureFailureCode(error: unknown): string {
  if (error instanceof I18nError) {
    if (error.i18n.key === 'errors.pageStyleScreenshotsRateLimited') {
      return 'capture-quota-limited';
    }
    if (error.i18n.key === 'errors.pageStyleTabUnavailable') {
      return 'tab-unavailable';
    }
    if (error.i18n.key === 'errors.pageStyleScreenshotsUnavailableWithDetail') {
      return error.i18n.params?.detail === 'stale-capture-request'
        ? 'stale'
        : 'collector-unavailable';
    }
    if (
      error.i18n.key === 'errors.pageStyleContentScriptUnavailable'
      || error.i18n.key === 'errors.pageStyleContentScriptUnavailableWithDetail'
    ) {
      return 'content-script-unreachable';
    }
  }
  return 'collector-unavailable';
}

/**
 * 重置后台截图编排运行时，仅供测试和 benchmark 使用。
 */
export function resetPageStyleCaptureRuntimeForTesting(): void {
  lastPageStyleCaptureStartedAt = 0;
  nextCaptureQueueSequence = 0;
  captureQueueRunning = false;
  pendingPageStyleCaptureTasks.splice(0, pendingPageStyleCaptureTasks.length);
  inFlightPageStyleCaptureRequests.clear();
}
