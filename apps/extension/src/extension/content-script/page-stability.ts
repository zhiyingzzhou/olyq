/**
 * 说明：`page-stability` 内容脚本页面稳定窗口模块。
 *
 * 职责：
 * - 为 readable-dom 与 page-style signals 提供统一的“稳定窗口”判断；
 * - 收口 DOM 结构、布局与路由变化的脏标记，避免每个采集链路各自实现等待逻辑；
 * - 对外暴露当前稳定窗口版本和等待 helper，供 source 级缓存 key 复用。
 *
 * 边界：
 * - 本模块不直接执行正文提取或页面风格分析；
 * - 只维护当前内容脚本生命周期内的轻量内存态；
 * - 不参与聊天 UI、SW 调度或截图资产持久化。
 */
import {
  getCurrentDocumentHeight,
  getCurrentRouteKey,
  getCurrentViewportHeight,
  getCurrentViewportWidth,
} from './page-style-sampling-core';

const PAGE_STABILITY_QUIET_WINDOW_MS = 300;
const PAGE_STABILITY_LAYOUT_FRAMES = 2;
const DEFAULT_PAGE_STABILITY_MAX_WAIT_MS = 8_000;
const READABLE_DOM_STABILITY_SAMPLE_MS = 100;
const READABLE_DOM_TEXT_CHAR_BUCKET = 160;

/**
 * 页面稳定窗口等待超时错误。
 *
 * 说明：content script 只负责判断页面侧稳定性；当页面持续 mutation、
 * 后台标签页暂停 rAF 或 load 长期不完成时，必须用稳定错误码退出，
 * 交给 browser-context source cache 做降级，而不是伪造一个稳定正文。
 */
export class PageStableWindowTimeoutError extends Error {
  constructor() {
    super('page-stability-timeout');
    this.name = 'PageStableWindowTimeoutError';
  }
}

interface PageStabilityRuntimeState {
  observersInstalled: boolean;
  mutationObserver: MutationObserver | null;
  resizeObserver: ResizeObserver | null;
  resizeListener: (() => void) | null;
  hashChangeListener: (() => void) | null;
  popStateListener: (() => void) | null;
  lastDirtyAt: number;
  lastRouteKey: string;
  stableWindowVersion: number;
  lastStableSignature: string | null;
  readableStableWindowVersion: number;
  lastReadableStableSignature: string | null;
}

/**
 * 当前页面稳定窗口快照。
 */
export interface PageStableWindowSnapshot {
  routeKey: string;
  stableWindowVersion: number;
  pageFingerprint: string;
  documentHeight: number;
  viewportHeight: number;
  viewportWidth: number;
  stabilizedAt: number;
}

const runtimeState: PageStabilityRuntimeState = {
  observersInstalled: false,
  mutationObserver: null,
  resizeObserver: null,
  resizeListener: null,
  hashChangeListener: null,
  popStateListener: null,
  lastDirtyAt: Date.now(),
  lastRouteKey: getCurrentRouteKey(),
  stableWindowVersion: 0,
  lastStableSignature: null,
  readableStableWindowVersion: 0,
  lastReadableStableSignature: null,
};

/**
 * 标记页面已发生结构或布局脏变更。
 */
function markPageDirty(): void {
  runtimeState.lastRouteKey = getCurrentRouteKey();
  runtimeState.lastDirtyAt = Date.now();
  runtimeState.lastStableSignature = null;
}

/**
 * 检查路由是否已变化，并在变化时打脏当前稳定窗口。
 */
function ensureRouteFresh(): void {
  const currentRouteKey = getCurrentRouteKey();
  if (currentRouteKey !== runtimeState.lastRouteKey) {
    markPageDirty();
  }
}

/**
 * 基于路由和布局度量构建稳定窗口指纹。
 *
 * @param args - 指纹构建输入。
 * @returns 当前稳定窗口指纹。
 */
function buildStableFingerprint(args: {
  routeKey: string;
  documentHeight: number;
  viewportHeight: number;
  viewportWidth: number;
}): string {
  const body = document.body;
  const docEl = document.documentElement;
  return [
    args.routeKey,
    String(args.documentHeight),
    String(args.viewportHeight),
    String(args.viewportWidth),
    String(body?.childElementCount ?? 0),
    String(docEl?.childElementCount ?? 0),
    typeof body?.className === 'string' ? body.className : '',
  ].join('::');
}

/**
 * 等待指定毫秒数。
 *
 * @param duration - 等待时长。
 */
async function waitMs(duration: number): Promise<void> {
  const timeout = Math.max(0, Math.round(duration));
  await new Promise<void>((resolve) => {
    globalThis.setTimeout(() => resolve(), timeout);
  });
}

/** 构建当前稳定窗口等待的截止时间。 */
function createDeadline(maxWaitMs?: number): number {
  const waitMs = Number.isFinite(maxWaitMs) && Number(maxWaitMs) > 0
    ? Number(maxWaitMs)
    : DEFAULT_PAGE_STABILITY_MAX_WAIT_MS;
  return Date.now() + Math.max(1, Math.round(waitMs));
}

/** 读取距离截止时间的剩余毫秒数。 */
function getRemainingMs(deadlineAt: number): number {
  return Math.max(0, deadlineAt - Date.now());
}

/** 截止时间已过时抛出稳定 timeout。 */
function assertDeadline(deadlineAt: number): void {
  if (getRemainingMs(deadlineAt) <= 0) {
    throw new PageStableWindowTimeoutError();
  }
}

/**
 * 等待若干连续动画帧。
 *
 * @param count - 需要等待的帧数。
 */
async function waitForAnimationFrames(count = PAGE_STABILITY_LAYOUT_FRAMES, deadlineAt: number): Promise<void> {
  const total = Math.max(1, Math.floor(count));
  for (let index = 0; index < total; index += 1) {
    assertDeadline(deadlineAt);
    await new Promise<void>((resolve, reject) => {
      const timeout = globalThis.setTimeout(() => {
        reject(new PageStableWindowTimeoutError());
      }, getRemainingMs(deadlineAt));
      window.requestAnimationFrame(() => {
        globalThis.clearTimeout(timeout);
        resolve();
      });
    });
  }
}

/**
 * 等待文档进入 `readyState=complete`。
 */
async function waitForDocumentComplete(deadlineAt: number): Promise<void> {
  if (document.readyState === 'complete') return;
  await new Promise<void>((resolve, reject) => {
    let timeout: ReturnType<typeof globalThis.setTimeout> | null = null;
    /**
     * 在 readyState/load 进入 complete 时结束等待。
     */
    const cleanup = () => {
      document.removeEventListener('readystatechange', onReady);
      window.removeEventListener('load', onReady);
      if (timeout) globalThis.clearTimeout(timeout);
    };
    /**
     * 文档完成加载时结束等待。
     */
    const onReady = () => {
      if (document.readyState !== 'complete') return;
      cleanup();
      resolve();
    };
    document.addEventListener('readystatechange', onReady);
    window.addEventListener('load', onReady, { once: true });
    timeout = globalThis.setTimeout(() => {
      cleanup();
      reject(new PageStableWindowTimeoutError());
    }, getRemainingMs(deadlineAt));
  });
  markPageDirty();
}

/**
 * 安装稳定窗口脏标记所需的 observer 与事件监听。
 */
function ensureObserversInstalled(): void {
  if (runtimeState.observersInstalled) return;

  runtimeState.mutationObserver = new MutationObserver((records) => {
    if (records.length < 1) return;
    markPageDirty();
  });
  runtimeState.mutationObserver.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'src', 'href', 'data-theme'],
  });

  if (typeof ResizeObserver === 'function') {
    runtimeState.resizeObserver = new ResizeObserver(() => {
      markPageDirty();
    });
    runtimeState.resizeObserver.observe(document.documentElement);
    if (document.body) {
      runtimeState.resizeObserver.observe(document.body);
    }
  }

  runtimeState.resizeListener = () => {
    markPageDirty();
  };
  runtimeState.hashChangeListener = () => {
    markPageDirty();
  };
  runtimeState.popStateListener = () => {
    markPageDirty();
  };
  window.addEventListener('resize', runtimeState.resizeListener, { passive: true });
  window.addEventListener('hashchange', runtimeState.hashChangeListener, { passive: true });
  window.addEventListener('popstate', runtimeState.popStateListener, { passive: true });
  runtimeState.observersInstalled = true;
}

/**
 * 构建当前稳定窗口快照。
 *
 * @param stabilizedAt - 本次确认稳定的时间戳。
 * @returns 当前稳定窗口快照。
 */
function buildCurrentStableWindowSnapshot(stabilizedAt: number, stableWindowVersion = runtimeState.stableWindowVersion): PageStableWindowSnapshot {
  const routeKey = getCurrentRouteKey();
  const documentHeight = getCurrentDocumentHeight();
  const viewportHeight = getCurrentViewportHeight();
  const viewportWidth = getCurrentViewportWidth();
  return {
    routeKey,
    stableWindowVersion,
    pageFingerprint: buildStableFingerprint({
      routeKey,
      documentHeight,
      viewportHeight,
      viewportWidth,
    }),
    documentHeight,
    viewportHeight,
    viewportWidth,
    stabilizedAt,
  };
}

/**
 * 构建 readable-dom 使用的正文稳定签名。
 *
 * 说明：
 * - 正文采集只需要当前可读 DOM 足够稳定，不应被纯动画 `style` 写入拖到超时；
 * - 文本长度按桶归一，避免打字机、计时器等小幅装饰性字符变化不断重置等待窗口；
 * - 大块正文迟到、路由切换、视口/文档高度变化仍会改变签名并继续等待。
 *
 * @returns 正文采集稳定签名。
 */
function buildReadableDomStableSignature(): string {
  const body = document.body;
  const docEl = document.documentElement;
  const text = (body?.innerText || docEl?.textContent || '').replace(/\s+/g, ' ').trim();
  return [
    getCurrentRouteKey(),
    String(getCurrentDocumentHeight()),
    String(getCurrentViewportHeight()),
    String(getCurrentViewportWidth()),
    String(body?.childElementCount ?? 0),
    String(docEl?.childElementCount ?? 0),
    String(Math.floor(text.length / READABLE_DOM_TEXT_CHAR_BUCKET)),
  ].join('::');
}

/**
 * 等待页面进入稳定窗口。
 *
 * 说明：
 * - 先等待 `load complete`；
 * - 再要求至少 300ms 无结构/布局脏变更；
 * - 最后要求连续 2 帧布局信息不变。
 *
 * @returns 当前稳定窗口快照。
 */
export async function waitForPageStableWindow(options: { maxWaitMs?: number } = {}): Promise<PageStableWindowSnapshot> {
  ensureObserversInstalled();
  const deadlineAt = createDeadline(options.maxWaitMs);
  await waitForDocumentComplete(deadlineAt);

  while (true) {
    assertDeadline(deadlineAt);
    ensureRouteFresh();
    const quietDuration = Date.now() - runtimeState.lastDirtyAt;
    if (quietDuration < PAGE_STABILITY_QUIET_WINDOW_MS) {
      await waitMs(Math.min(PAGE_STABILITY_QUIET_WINDOW_MS - quietDuration, getRemainingMs(deadlineAt)));
      continue;
    }

    const firstRouteKey = getCurrentRouteKey();
    const firstDocumentHeight = getCurrentDocumentHeight();
    const firstViewportHeight = getCurrentViewportHeight();
    const firstViewportWidth = getCurrentViewportWidth();
    const firstDirtyAt = runtimeState.lastDirtyAt;
    await waitForAnimationFrames(PAGE_STABILITY_LAYOUT_FRAMES, deadlineAt);
    ensureRouteFresh();

    const secondRouteKey = getCurrentRouteKey();
    const secondDocumentHeight = getCurrentDocumentHeight();
    const secondViewportHeight = getCurrentViewportHeight();
    const secondViewportWidth = getCurrentViewportWidth();

    if (
      runtimeState.lastDirtyAt !== firstDirtyAt
      || firstRouteKey !== secondRouteKey
      || firstDocumentHeight !== secondDocumentHeight
      || firstViewportHeight !== secondViewportHeight
      || firstViewportWidth !== secondViewportWidth
    ) {
      continue;
    }

    const stabilizedAt = Date.now();
    const stableSignature = buildStableFingerprint({
      routeKey: secondRouteKey,
      documentHeight: secondDocumentHeight,
      viewportHeight: secondViewportHeight,
      viewportWidth: secondViewportWidth,
    });
    if (runtimeState.lastStableSignature !== stableSignature) {
      runtimeState.stableWindowVersion += 1;
      runtimeState.lastStableSignature = stableSignature;
    }
    return buildCurrentStableWindowSnapshot(stabilizedAt);
  }
}

/**
 * 等待 readable-dom 可用的正文稳定窗口。
 *
 * 说明：
 * - 与 `waitForPageStableWindow()` 不同，这里不把动画型 `style` 写入当成正文脏变更；
 * - 它用路由、布局尺寸、顶层子节点数量和正文长度桶做短采样，适合正文注入链路；
 * - 如果页面仍在大块加载正文或持续改变结构，仍会按 `PageStableWindowTimeoutError` 稳定退出。
 *
 * @param options - 稳定窗口等待选项。
 * @returns 当前正文稳定窗口快照。
 */
export async function waitForReadableDomStableWindow(options: { maxWaitMs?: number } = {}): Promise<PageStableWindowSnapshot> {
  const deadlineAt = createDeadline(options.maxWaitMs);
  await waitForDocumentComplete(deadlineAt);

  let lastSignature = '';
  let stableSince = Date.now();

  while (true) {
    assertDeadline(deadlineAt);
    ensureRouteFresh();
    const signature = buildReadableDomStableSignature();
    const now = Date.now();
    if (signature !== lastSignature) {
      lastSignature = signature;
      stableSince = now;
    }
    const stableDuration = now - stableSince;
    if (stableDuration >= PAGE_STABILITY_QUIET_WINDOW_MS) {
      if (runtimeState.lastReadableStableSignature !== signature) {
        runtimeState.readableStableWindowVersion += 1;
        runtimeState.lastReadableStableSignature = signature;
      }
      return buildCurrentStableWindowSnapshot(now, runtimeState.readableStableWindowVersion);
    }
    const remainingQuietMs = PAGE_STABILITY_QUIET_WINDOW_MS - stableDuration;
    await waitMs(Math.max(1, Math.min(
      READABLE_DOM_STABILITY_SAMPLE_MS,
      remainingQuietMs,
      getRemainingMs(deadlineAt),
    )));
  }
}

/**
 * 读取当前稳定窗口版本。
 *
 * @returns 当前版本号。
 */
export function getCurrentStableWindowVersion(): number {
  return runtimeState.stableWindowVersion;
}

/**
 * 读取当前页面的即时稳定状态快照。
 *
 * 说明：
 * - 这里不会等待稳定窗口，只返回当前页面的即时身份；
 * - 供 layout/capture 链路做过期校验与请求 key 拼接。
 *
 * @returns 当前即时快照。
 */
export function getCurrentPageStabilitySnapshot(): PageStableWindowSnapshot {
  ensureRouteFresh();
  return buildCurrentStableWindowSnapshot(Date.now());
}

/**
 * 重置稳定窗口运行时，仅供单测使用。
 */
export function resetPageStabilityRuntimeForTesting(): void {
  runtimeState.mutationObserver?.disconnect();
  runtimeState.resizeObserver?.disconnect();
  if (runtimeState.resizeListener) {
    window.removeEventListener('resize', runtimeState.resizeListener);
  }
  if (runtimeState.hashChangeListener) {
    window.removeEventListener('hashchange', runtimeState.hashChangeListener);
  }
  if (runtimeState.popStateListener) {
    window.removeEventListener('popstate', runtimeState.popStateListener);
  }
  runtimeState.observersInstalled = false;
  runtimeState.mutationObserver = null;
  runtimeState.resizeObserver = null;
  runtimeState.resizeListener = null;
  runtimeState.hashChangeListener = null;
  runtimeState.popStateListener = null;
  runtimeState.lastDirtyAt = Date.now();
  runtimeState.lastRouteKey = getCurrentRouteKey();
  runtimeState.stableWindowVersion = 0;
  runtimeState.lastStableSignature = null;
  runtimeState.readableStableWindowVersion = 0;
  runtimeState.lastReadableStableSignature = null;
}
