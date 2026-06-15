/**
 * 说明：`readable-dom-frames` 后台 frame 正文采集汇总器。
 *
 * 职责：
 * - 先采集顶层 frame 的正文；
 * - 顶层正文不达标时，按需枚举普通 http/https iframe 并在 frame 自身上下文读取 DOM；
 * - 在短预算内选择最高质量正文，避免把广告、登录或统计 iframe 注入 prompt。
 *
 * 边界：
 * - 本模块只做 Service Worker 内的短链路汇总，不持久化 iframe 正文；
 * - 不从父页面跨源穿透读取 iframe DOM，真实 DOM 抽取仍由对应 frame 的 content script 完成；
 * - 不解析站点 hydration script，也不实现站点白名单。
 */
import type {
  BrowserContextReadableDomIntent,
  BrowserContextReadableDomPayload,
  BrowserContextReadableDomSourceKind,
} from '@/types/sw-messages';
import {
  isExtensionTabMessageError,
  sendExtensionTabMessage,
} from '@/lib/extension/runtime-api';

const READABLE_DOM_TOP_FRAME_ID = 0;
const READABLE_DOM_TOP_PARENT_FRAME_ID = -1;
const MAX_EMBEDDED_FRAME_CANDIDATES = 6;
const EMBEDDED_FRAME_CONCURRENCY = 2;
/** 顶层正文不达标后，iframe 补采集允许使用的独立短预算。 */
export const EMBEDDED_FRAME_EXTRA_BUDGET_MS = 1_500;
const FRAME_RESPONSE_GRACE_MS = 250;

const LOW_VALUE_FRAME_URL_MARKERS = [
  'adservice',
  'adsystem',
  'analytics',
  'captcha',
  'doubleclick',
  'facebook.com/tr',
  'googletagmanager',
  'google-analytics',
  'login',
  'oauth',
  'payment',
  'paypal',
  'recaptcha',
  'stripe',
  'tracking',
  'turnstile',
];

/** 后台 readable-dom one-shot 响应。 */
export interface ReadableDomFrameResponse {
  /** 成功正文；失败或降级时为空。 */
  payload: BrowserContextReadableDomPayload | null;
  /** 稳定失败或降级原因。 */
  error?: string;
}

/** frame 正文采集入口参数。 */
export interface CollectReadableDomFromTabArgs {
  /** 目标 tab。 */
  tabId: number;
  /** 正文采集意图。 */
  intent: BrowserContextReadableDomIntent;
  /** 本轮页面稳定等待预算。 */
  stableWaitMs: number;
}

/** Chrome webNavigation frame 的最小结构。 */
export interface ReadableDomFrameInfo {
  /** frame ID。 */
  frameId: number;
  /** 父 frame ID；顶层 frame 为 -1。 */
  parentFrameId: number;
  /** frame URL。 */
  url: string;
}

/** 单个 frame 采集后的内部候选。 */
export interface ReadableDomFrameCandidate {
  /** frame 元信息。 */
  frame: ReadableDomFrameInfo;
  /** frame 内正文 payload。 */
  payload: BrowserContextReadableDomPayload;
}

/** 顶层页面里可见 iframe 的轻量摘要。 */
interface VisibleIframeSummary {
  /** iframe src。 */
  src: string;
  /** iframe title/name。 */
  title: string;
  /** iframe 可见面积。 */
  area: number;
  /** 是否在当前视口内。 */
  inViewport: boolean;
}

/**
 * 判断正文 payload 是否真正包含可注入正文。
 *
 * @param payload - 内容脚本返回的正文 payload。
 * @returns 有正文时返回 true。
 */
function hasReadableBody(payload: BrowserContextReadableDomPayload | null | undefined): payload is BrowserContextReadableDomPayload {
  return Boolean(payload?.text?.trim());
}

/**
 * 判断 URL 是否为普通网页 URL。
 *
 * @param url - 待判断 URL。
 * @returns http/https 返回 true。
 */
function isHttpFrameUrl(url: string): boolean {
  return /^https?:\/\//i.test(String(url || '').trim());
}

/**
 * 判断 frame URL 是否明显不适合作为正文来源。
 *
 * @param url - frame URL。
 * @returns 低价值 frame 返回 true。
 */
function isLowValueFrameUrl(url: string): boolean {
  const normalized = String(url || '').toLowerCase();
  if (!normalized) return true;
  return LOW_VALUE_FRAME_URL_MARKERS.some((marker) => normalized.includes(marker));
}

/**
 * 归一化 URL host，解析失败时返回空字符串。
 *
 * @param url - 原始 URL。
 * @returns 小写 hostname。
 */
function normalizeUrlHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * 判断 frame 是否能和父页面里的可见 iframe 元素对应上。
 *
 * @param frame - webNavigation frame。
 * @param summaries - 顶层页面可见 iframe 摘要。
 * @returns 可见时返回 true。
 */
function matchesVisibleIframeSummary(frame: ReadableDomFrameInfo, summaries: VisibleIframeSummary[]): boolean {
  if (summaries.length < 1) return true;
  const frameUrl = String(frame.url || '');
  const frameHost = normalizeUrlHost(frameUrl);
  return summaries.some((summary) => {
    const src = String(summary.src || '');
    if (!src) return false;
    if (src === frameUrl || frameUrl.startsWith(src) || src.startsWith(frameUrl)) return true;
    const summaryHost = normalizeUrlHost(src);
    return Boolean(frameHost && summaryHost && frameHost === summaryHost);
  });
}

/**
 * 给正文 payload 补齐 frame 来源字段。
 *
 * @param payload - 内容脚本正文 payload。
 * @param frame - frame 元信息。
 * @param sourceKind - frame 来源类型。
 * @returns 带 frame 来源的 payload。
 */
function withReadableFrameSource(
  payload: BrowserContextReadableDomPayload,
  frame: ReadableDomFrameInfo,
  sourceKind: BrowserContextReadableDomSourceKind,
): BrowserContextReadableDomPayload {
  const frameUrl = frame.url || payload.url;
  return {
    ...payload,
    sourceKind,
    frameId: frame.frameId,
    parentFrameId: frame.parentFrameId,
    frameUrl,
    frameTitle: payload.articleTitle || payload.title || '',
    isTopFrame: sourceKind === 'top-frame',
  };
}

/**
 * 给异步任务加短超时，避免单个 frame 阻塞本轮发送。
 *
 * @param task - 正在执行的任务。
 * @param timeoutMs - 超时时间。
 * @returns 任务结果或 timeout 标记。
 */
async function raceReadableFrameTask<T>(task: Promise<T>, timeoutMs: number): Promise<T | { timeout: true }> {
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
  const timeoutTask = new Promise<{ timeout: true }>((resolve) => {
    timeoutId = globalThis.setTimeout(() => resolve({ timeout: true }), timeoutMs);
  });
  try {
    return await Promise.race([task, timeoutTask]);
  } finally {
    if (timeoutId) globalThis.clearTimeout(timeoutId);
  }
}

/** 判断 frame 任务是否超时。 */
function isReadableFrameTimeout(value: unknown): value is { timeout: true } {
  return Boolean(value && typeof value === 'object' && (value as { timeout?: unknown }).timeout === true);
}

/**
 * 向指定 frame 请求正文。
 *
 * @param tabId - 目标 tab。
 * @param frame - 目标 frame。
 * @param intent - 正文采集意图。
 * @param stableWaitMs - frame 内稳定等待预算。
 * @param sourceKind - frame 来源类型。
 * @returns 正文响应。
 */
async function requestReadableDomFromFrame(
  tabId: number,
  frame: ReadableDomFrameInfo,
  intent: BrowserContextReadableDomIntent,
  stableWaitMs: number,
  sourceKind: BrowserContextReadableDomSourceKind,
  timeoutMs: number = stableWaitMs + FRAME_RESPONSE_GRACE_MS,
): Promise<ReadableDomFrameResponse> {
  try {
    const boundedTimeoutMs = Math.max(1, Math.round(timeoutMs));
    const result = await raceReadableFrameTask(sendExtensionTabMessage<{
      payload?: BrowserContextReadableDomPayload | null;
      error?: string;
    } | undefined>(tabId, {
      type: 'browser-context/getReadableDom',
      payload: { intent, stableWaitMs },
    }, { frameId: frame.frameId }), boundedTimeoutMs);
    if (isReadableFrameTimeout(result)) {
      return { payload: null, error: 'timeout' };
    }
    const payload: BrowserContextReadableDomPayload | null = result?.payload ?? null;
    const degradeReason = payload?.degradeReason;
    if (!hasReadableBody(payload)) {
      return { payload: null, error: degradeReason || result?.error || 'empty-body' };
    }
    return {
      payload: withReadableFrameSource(payload, frame, sourceKind),
    };
  } catch (error) {
    if (isExtensionTabMessageError(error)) {
      return { payload: null, error: error.reason };
    }
    return { payload: null, error: 'content-script-unreachable' };
  }
}

/**
 * 采集顶层 frame 正文。
 *
 * @param args - 采集参数。
 * @returns 顶层 frame 响应。
 */
export async function collectTopFrameReadableDom(args: CollectReadableDomFromTabArgs): Promise<ReadableDomFrameResponse> {
  return await requestReadableDomFromFrame(
    args.tabId,
    { frameId: READABLE_DOM_TOP_FRAME_ID, parentFrameId: READABLE_DOM_TOP_PARENT_FRAME_ID, url: '' },
    args.intent,
    args.stableWaitMs,
    'top-frame',
  );
}

/**
 * 从顶层 frame 读取可见 iframe 摘要。
 *
 * @param tabId - 目标 tab。
 * @returns 可见 iframe 摘要；读取失败时返回空数组。
 */
async function collectTopFrameVisibleIframes(tabId: number): Promise<VisibleIframeSummary[]> {
  try {
    const response = await sendExtensionTabMessage<{ payload?: VisibleIframeSummary[] | null } | undefined>(
      tabId,
      { type: 'page/getVisibleFrames' },
      { frameId: READABLE_DOM_TOP_FRAME_ID },
    );
    return Array.isArray(response?.payload) ? response.payload : [];
  } catch {
    return [];
  }
}

/**
 * 通过 webNavigation 枚举当前 tab 下的 frame。
 *
 * @param tabId - 目标 tab。
 * @returns frame 列表；API 不可用或失败时返回空数组。
 */
async function getAllFramesForTab(tabId: number): Promise<ReadableDomFrameInfo[]> {
  const webNavigationApi = chrome.webNavigation;
  if (typeof webNavigationApi?.getAllFrames !== 'function') return [];
  return await new Promise<ReadableDomFrameInfo[]>((resolve) => {
    try {
      webNavigationApi.getAllFrames({ tabId }, (frames) => {
        const lastError = chrome.runtime?.lastError;
        if (lastError || !Array.isArray(frames)) {
          resolve([]);
          return;
        }
        resolve(frames.map((frame) => ({
          frameId: Number(frame.frameId),
          parentFrameId: Number(frame.parentFrameId),
          url: String(frame.url || ''),
        })).filter((frame) => Number.isFinite(frame.frameId) && frame.frameId >= 0));
      });
    } catch {
      resolve([]);
    }
  });
}

/**
 * 收集可尝试的嵌入 frame 候选。
 *
 * @param tabId - 目标 tab。
 * @returns 已过滤并截断的 frame 候选。
 */
export async function collectEmbeddedFrameCandidates(tabId: number): Promise<ReadableDomFrameInfo[]> {
  const frames = await getAllFramesForTab(tabId);
  const visibleIframes = await collectTopFrameVisibleIframes(tabId);
  return frames
    .filter((frame) => frame.frameId !== READABLE_DOM_TOP_FRAME_ID)
    .filter((frame) => isHttpFrameUrl(frame.url))
    .filter((frame) => !isLowValueFrameUrl(frame.url))
    .filter((frame) => matchesVisibleIframeSummary(frame, visibleIframes))
    .slice(0, MAX_EMBEDDED_FRAME_CANDIDATES);
}

/**
 * 计算正文候选排序分。
 *
 * @param candidate - frame 正文候选。
 * @returns 分值越高越优先。
 */
function scoreReadableFrameCandidate(candidate: ReadableDomFrameCandidate): number {
  const mode = candidate.payload.mode;
  const modeScore = mode === 'article'
    ? 40_000
    : mode === 'visible-page'
      ? 30_000
      : mode === 'structured-page'
        ? 20_000
        : 0;
  const lengthScore = Math.min(10_000, Math.max(0, candidate.payload.contentChars || candidate.payload.text.length));
  const title = String(candidate.payload.articleTitle || candidate.payload.title || '').trim();
  const titleScore = title ? Math.min(800, title.length * 8) : 0;
  const urlScore = isHttpFrameUrl(candidate.frame.url) ? 500 : 0;
  return modeScore + lengthScore + titleScore + urlScore;
}

/**
 * 从多个 frame 正文候选中选出最佳候选。
 *
 * @param candidates - 候选列表。
 * @returns 最佳 payload；没有可用候选时返回 null。
 */
export function rankReadableFramePayloads(
  candidates: ReadableDomFrameCandidate[],
): BrowserContextReadableDomPayload | null {
  const best = [...candidates].sort((left, right) => scoreReadableFrameCandidate(right) - scoreReadableFrameCandidate(left))[0];
  return best?.payload ?? null;
}

/**
 * 以固定并发采集嵌入 frame 正文。
 *
 * @param tabId - 目标 tab。
 * @param frames - frame 候选。
 * @param intent - 正文采集意图。
 * @param stableWaitMs - 单 frame 稳定等待预算。
 * @returns 成功的正文候选。
 */
async function collectEmbeddedReadableDomPayloads(
  tabId: number,
  frames: ReadableDomFrameInfo[],
  intent: BrowserContextReadableDomIntent,
  stableWaitMs: number,
  deadlineAtMs: number,
): Promise<ReadableDomFrameCandidate[]> {
  const candidates: ReadableDomFrameCandidate[] = [];
  let cursor = 0;

  /**
   * 消费 frame 队列并采集正文。
   *
   * @returns 当前 worker 完成信号。
   */
  async function worker(): Promise<void> {
    while (cursor < frames.length) {
      const remainingBudgetMs = Math.floor(deadlineAtMs - Date.now());
      if (remainingBudgetMs <= 0) return;
      const frame = frames[cursor];
      cursor += 1;
      const frameTimeoutMs = Math.min(stableWaitMs + FRAME_RESPONSE_GRACE_MS, remainingBudgetMs);
      const response = await requestReadableDomFromFrame(tabId, frame, intent, stableWaitMs, 'embedded-frame', frameTimeoutMs);
      if (response.payload) {
        candidates.push({ frame, payload: response.payload });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(EMBEDDED_FRAME_CONCURRENCY, frames.length) }, () => worker()));
  return candidates;
}

/**
 * 从 tab 中采集可用正文；顶层正文不足时自动尝试嵌入 frame。
 *
 * @param args - 采集参数。
 * @returns 可注入正文或稳定降级原因。
 */
export async function collectReadableDomFromTab(args: CollectReadableDomFromTabArgs): Promise<ReadableDomFrameResponse> {
  const topFrame = await collectTopFrameReadableDom(args);
  if (topFrame.payload) return topFrame;

  const frames = await collectEmbeddedFrameCandidates(args.tabId);
  if (frames.length < 1) return topFrame;

  const iframeStableWaitMs = EMBEDDED_FRAME_EXTRA_BUDGET_MS;
  // 顶层页面经常会等满稳定窗口后才返回 metadata-only；iframe 是失败后的补采集，
  // 预算必须独立且受硬上限约束，否则真实 preview 页会在开始扫 frame 前就被截断。
  const deadlineAtMs = Date.now() + EMBEDDED_FRAME_EXTRA_BUDGET_MS;
  const embeddedCandidates = await collectEmbeddedReadableDomPayloads(args.tabId, frames, args.intent, iframeStableWaitMs, deadlineAtMs);
  const bestEmbedded = rankReadableFramePayloads(embeddedCandidates);
  if (bestEmbedded) return { payload: bestEmbedded };
  return topFrame;
}
