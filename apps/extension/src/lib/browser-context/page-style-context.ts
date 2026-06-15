/**
 * 说明：`page-style-context` 页面风格上下文快照模块。
 *
 * 职责：
 * - 按 topic 维度持久化页面风格快照，作为风格模式唯一可复用真源；
 * - 统一收口“设计信号 + 隐藏截图资产”的获取、复用、刷新与清理；
 * - 为 collector、视觉附件输入和后续上下文恢复提供同一份稳定数据。
 *
 * 边界：
 * - 设计信号快照存共享 JSON；隐藏截图二进制继续复用现有附件库；
 * - 本模块不直接拼装系统 prompt，也不直接改 UI 状态；
 * - 若当前页面不可达，只在 topic 已有快照时回退到 stored，不伪造新的 live 结果。
 */
import { blobToDataUrl, dataUrlToBlob, deleteAttachments, getAttachmentBlob, putImageAttachment } from '@/lib/attachments';
import {
  requestBrowserContextPageStyleCaptures,
  requestBrowserContextPageStyleLayout,
  requestBrowserContextPageStyleSignals,
  type BrowserContextPageStyleCapturesRuntimeResponse,
  type BrowserContextPageStyleLayoutRuntimeResponse,
  type BrowserContextPageStyleSignalsRuntimeResponse,
} from '@/lib/extension/browser-context-api';
import { toI18nTextFromError } from '@/lib/i18n/error';
import { i18nText, isI18nText } from '@/lib/i18n/text';
import { readStoredJson, writeStoredJson } from '@/lib/storage/json-storage';
import { clonePageStyleSignalsPayload } from './page-style-signals-payload';
import type {
  BrowserContextMetadataSnapshot,
} from './types';
import type { I18nText } from '@/types/i18n';
import type {
  PageStyleCaptureFramePayload,
  PageStyleCapturesPayload,
  PageStyleSignalsPayload,
} from '@/types/sw-messages';

/** 页面风格快照存储 key。 */
export const PAGE_STYLE_CONTEXT_SNAPSHOTS_STORAGE_KEY = 'olyq.browser-context.page-style-snapshots.v1';

/** 隐藏截图附件引用。 */
export interface HiddenPageStyleCaptureAttachmentRef {
  /** 附件 ID。 */
  id: string;
  /** 展示名。 */
  name: string;
  /** MIME 类型。 */
  mime: string;
  /** 字节大小。 */
  size: number;
  /** 截图时对应的滚动位置。 */
  scrollY: number;
}

/** topic 级页面风格上下文快照。 */
export interface PageStyleContextSnapshot {
  /** 归属 topic ID。 */
  topicId: string;
  /** 当前页面标题。 */
  title: string;
  /** 当前页面 URL。 */
  url: string;
  /** 当前页面稳定指纹。 */
  pageFingerprint: string;
  /** 最近一次设计信号真源。 */
  signals: PageStyleSignalsPayload;
  /** 隐藏截图附件引用。 */
  captures: HiddenPageStyleCaptureAttachmentRef[];
  /** 首次建立时间。 */
  capturedAt: number;
  /** 最近更新时间。 */
  updatedAt: number;
}

/** 快照持久层。 */
export type PageStyleContextStore = Record<string, PageStyleContextSnapshot>;

/** 页面风格快照解析结果。 */
export interface ResolvedPageStyleContextSnapshot {
  /** 快照本体。 */
  snapshot: PageStyleContextSnapshot | null;
  /** 本次解析结果来源。 */
  snapshotSource: 'live' | 'stored' | null;
  /** live 页面不可用时的失败码。 */
  liveError: string | null;
  /** 视觉截图相关的降级提示。 */
  captureWarning: I18nText | null;
}

type SwPageStyleSignalsResponse = BrowserContextPageStyleSignalsRuntimeResponse;
type SwPageStyleCapturesResponse = BrowserContextPageStyleCapturesRuntimeResponse;
type SwPageStyleLayoutResponse = BrowserContextPageStyleLayoutRuntimeResponse;

/**
 * 判断 URL 是否可用于页面风格采集。
 *
 * @param url - 当前页面地址。
 * @returns 是否属于普通网页。
 */
function isCollectableUrl(url: string | null | undefined): boolean {
  const normalized = String(url || '').trim();
  if (!normalized) return false;
  return !(
    normalized.startsWith('chrome://')
    || normalized.startsWith('chrome-extension://')
    || normalized.startsWith('about:')
    || normalized.startsWith('moz-extension://')
  );
}

/**
 * 克隆隐藏截图附件引用。
 *
 * @param ref - 原始引用。
 * @returns 克隆结果。
 */
function cloneHiddenCaptureRef(ref: HiddenPageStyleCaptureAttachmentRef): HiddenPageStyleCaptureAttachmentRef {
  return {
    id: String(ref.id || '').trim(),
    name: String(ref.name || '').trim(),
    mime: String(ref.mime || '').trim(),
    size: Number(ref.size || 0),
    scrollY: Number.isFinite(ref.scrollY) ? Math.round(ref.scrollY) : 0,
  };
}

/**
 * 克隆页面风格快照。
 *
 * @param snapshot - 原始快照。
 * @returns 深拷贝结果。
 */
function clonePageStyleContextSnapshot(snapshot: PageStyleContextSnapshot): PageStyleContextSnapshot {
  return {
    ...snapshot,
    signals: clonePageStyleSignalsPayload(snapshot.signals),
    captures: snapshot.captures.map((ref) => cloneHiddenCaptureRef(ref)),
  };
}

/**
 * 归一化隐藏截图附件引用。
 *
 * @param value - 原始值。
 * @returns 合法引用；非法时返回 `null`。
 */
function normalizeHiddenCaptureRef(value: unknown): HiddenPageStyleCaptureAttachmentRef | null {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  if (!record) return null;
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  const mime = typeof record.mime === 'string' ? record.mime.trim() : '';
  if (!id || !name || !mime) return null;
  const size = typeof record.size === 'number' && Number.isFinite(record.size) ? record.size : 0;
  const scrollY = typeof record.scrollY === 'number' && Number.isFinite(record.scrollY) ? Math.round(record.scrollY) : 0;
  return { id, name, mime, size, scrollY };
}

/**
 * 归一化页面风格快照。
 *
 * @param topicId - topic ID。
 * @param value - 原始快照。
 * @returns 规整后的快照；非法时返回 `null`。
 */
function normalizePageStyleContextSnapshot(topicId: string, value: unknown): PageStyleContextSnapshot | null {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  if (!record) return null;
  const normalizedTopicId = String(topicId || '').trim();
  const signals = record.signals && typeof record.signals === 'object' && !Array.isArray(record.signals)
    ? record.signals as PageStyleSignalsPayload
    : null;
  const pageFingerprint = typeof record.pageFingerprint === 'string'
    ? record.pageFingerprint.trim()
    : typeof signals?.pageFingerprint === 'string'
      ? signals.pageFingerprint.trim()
      : '';
  const title = typeof record.title === 'string' ? record.title : String(signals?.title || '');
  const url = typeof record.url === 'string' ? record.url : String(signals?.url || '');
  if (!normalizedTopicId || !signals || !pageFingerprint || !url) return null;
  const capturedAt = typeof record.capturedAt === 'number' && Number.isFinite(record.capturedAt) ? record.capturedAt : Date.now();
  const updatedAt = typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt) ? record.updatedAt : capturedAt;
  const captures = Array.isArray(record.captures)
    ? record.captures.map((item) => normalizeHiddenCaptureRef(item)).filter(Boolean) as HiddenPageStyleCaptureAttachmentRef[]
    : [];
  return {
    topicId: normalizedTopicId,
    title,
    url,
    pageFingerprint,
    signals,
    captures,
    capturedAt,
    updatedAt,
  };
}

/**
 * 读取快照存储。
 *
 * @returns 归一化后的快照 map。
 */
async function readPageStyleContextStore(): Promise<PageStyleContextStore> {
  const raw = await readStoredJson<unknown>(PAGE_STYLE_CONTEXT_SNAPSHOTS_STORAGE_KEY, {}, (value) => value);
  const record = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const store: PageStyleContextStore = {};
  for (const [topicId, value] of Object.entries(record)) {
    const normalized = normalizePageStyleContextSnapshot(topicId, value);
    if (normalized) store[topicId] = normalized;
  }
  return store;
}

/**
 * 写回快照存储。
 *
 * @param store - 目标 store。
 */
async function writePageStyleContextStore(store: PageStyleContextStore): Promise<void> {
  await writeStoredJson(PAGE_STYLE_CONTEXT_SNAPSHOTS_STORAGE_KEY, store);
}

/**
 * 统一把错误值归一为字符串 code。
 *
 * @param error - 原始错误。
 * @param fallback - 默认失败码。
 * @returns 供 collector 使用的错误码。
 */
function normalizeResponseErrorCode(error: string | I18nText | undefined, fallback: string): string {
  if (typeof error === 'string' && error.trim()) return error.trim();
  if (isI18nText(error) && error.key) return error.key;
  return fallback;
}

/**
 * 将截图错误规整成面向用户的提示。
 *
 * @param error - 原始错误。
 * @returns 可直接展示的 i18n 文案。
 */
function normalizeCaptureWarning(error: string | I18nText | undefined): I18nText {
  if (isI18nText(error)) return error;
  const detail = typeof error === 'string' ? error.trim() : '';
  return detail
    ? i18nText('errors.pageStyleScreenshotsUnavailableWithDetail', { detail })
    : i18nText('errors.pageStyleScreenshotsUnavailable');
}

/**
 * 读取指定 topic 的页面风格快照。
 *
 * @param topicId - 目标 topic ID。
 * @returns 快照或 `null`。
 */
export async function getPageStyleContextSnapshot(topicId: string): Promise<PageStyleContextSnapshot | null> {
  const normalizedTopicId = String(topicId || '').trim();
  if (!normalizedTopicId) return null;
  const store = await readPageStyleContextStore();
  const snapshot = store[normalizedTopicId];
  return snapshot ? clonePageStyleContextSnapshot(snapshot) : null;
}

/**
 * 写入指定 topic 的页面风格快照，并清理被替换掉的隐藏截图附件。
 *
 * @param snapshot - 新快照。
 */
async function putPageStyleContextSnapshot(snapshot: PageStyleContextSnapshot): Promise<void> {
  const store = await readPageStyleContextStore();
  const previous = store[snapshot.topicId];
  store[snapshot.topicId] = clonePageStyleContextSnapshot(snapshot);
  await writePageStyleContextStore(store);

  const nextCaptureIds = new Set(snapshot.captures.map((capture) => capture.id));
  const staleCaptureIds = (previous?.captures ?? [])
    .map((capture) => capture.id)
    .filter((id) => !nextCaptureIds.has(id));
  if (staleCaptureIds.length > 0) {
    await deleteAttachments(staleCaptureIds).catch(() => undefined);
  }
}

/**
 * 删除某个 topic 的页面风格快照及其隐藏截图附件。
 *
 * @param topicId - 目标 topic ID。
 */
export async function deletePageStyleContextSnapshot(topicId: string): Promise<void> {
  const normalizedTopicId = String(topicId || '').trim();
  if (!normalizedTopicId) return;
  const store = await readPageStyleContextStore();
  const previous = store[normalizedTopicId];
  if (!previous) return;
  delete store[normalizedTopicId];
  await writePageStyleContextStore(store);
  if (previous.captures.length > 0) {
    await deleteAttachments(previous.captures.map((capture) => capture.id)).catch(() => undefined);
  }
}

/**
 * 将后台返回的截图帧写成隐藏附件引用。
 *
 * @param payload - 后台截图结果。
 * @returns 附件引用列表。
 */
async function persistHiddenCaptureFrames(payload: PageStyleCapturesPayload): Promise<HiddenPageStyleCaptureAttachmentRef[]> {
  const refs: HiddenPageStyleCaptureAttachmentRef[] = [];
  try {
    for (const frame of payload.frames) {
      const parsed = dataUrlToBlob(frame.dataUrl);
      const attachment = await putImageAttachment({
        blob: parsed.blob,
        name: frame.name,
        mime: frame.mime || parsed.mime,
      });
      refs.push({
        id: attachment.id,
        name: attachment.name,
        mime: attachment.mime,
        size: attachment.size,
        scrollY: frame.scrollY,
      });
    }
    return refs;
  } catch (error: unknown) {
    if (refs.length > 0) {
      await deleteAttachments(refs.map((ref) => ref.id)).catch(() => undefined);
    }
    throw error;
  }
}

/**
 * 请求 live 页面布局度量。
 *
 * @param metadata - 当前页面 metadata。
 * @returns 后台响应。
 */
async function requestPageStyleLayoutFromSw(
  metadata: BrowserContextMetadataSnapshot | null,
): Promise<SwPageStyleLayoutResponse> {
  const tabId = metadata?.tabId ?? 0;
  if (!tabId || !isCollectableUrl(metadata?.url)) {
    return { ok: true, payload: null, error: 'page-uncollectable' };
  }

  try {
    const response = await requestBrowserContextPageStyleLayout({ tabId });
    if (!response?.ok) return { ok: false, payload: null, error: response?.error };
    return response ?? { ok: true, payload: null, error: 'collector-unavailable' };
  } catch {
    return { ok: false, payload: null, error: 'content-script-unreachable' };
  }
}

/**
 * 请求 live 页面设计信号。
 *
 * @param metadata - 当前页面 metadata。
 * @returns 后台响应。
 */
async function requestPageStyleSignalsFromSw(
  metadata: BrowserContextMetadataSnapshot | null,
  stableWaitMs?: number,
): Promise<SwPageStyleSignalsResponse> {
  const tabId = metadata?.tabId ?? 0;
  if (!tabId || !isCollectableUrl(metadata?.url)) {
    return { ok: true, payload: null, error: 'page-uncollectable' };
  }

  try {
    const response = await requestBrowserContextPageStyleSignals({ tabId, stableWaitMs });
    if (!response?.ok) return { ok: false, payload: null, error: response?.error };
    return response ?? { ok: true, payload: null, error: 'collector-unavailable' };
  } catch {
    return { ok: false, payload: null, error: 'content-script-unreachable' };
  }
}

/**
 * 请求 live 页面截图。
 *
 * @param metadata - 当前页面 metadata。
 * @param maxCaptures - 最大截图预算。
 * @returns 后台响应。
 */
async function requestPageStyleCapturesFromSw(
  metadata: BrowserContextMetadataSnapshot | null,
  maxCaptures: number,
  options?: {
    captureRequestKey?: string;
    expectedPageFingerprint?: string;
    priority?: number;
  },
): Promise<SwPageStyleCapturesResponse> {
  const tabId = metadata?.tabId ?? 0;
  if (!tabId || !isCollectableUrl(metadata?.url)) {
    return { ok: true, payload: null, error: 'page-uncollectable' };
  }

  try {
    const response = await requestBrowserContextPageStyleCaptures({
      tabId,
      maxCaptures,
      captureRequestKey: options?.captureRequestKey,
      expectedPageFingerprint: options?.expectedPageFingerprint,
      priority: options?.priority,
    });
    if (!response?.ok) return { ok: false, payload: null, error: response?.error };
    return response ?? { ok: true, payload: null, error: 'collector-unavailable' };
  } catch (error: unknown) {
    return { ok: false, payload: null, error: toI18nTextFromError(error) };
  }
}

/**
 * 解析并在必要时刷新某个 topic 的页面风格快照。
 *
 * 规则：
 * - page fingerprint 未变时优先复用 stored snapshot；
 * - 当前页面不可达但 topic 已有快照时，允许降级返回 stored；
 * - `force=true` 时同时刷新 signals 与 captures，供“手动刷新”使用。
 * - `stableWaitMs` 只限制 live 设计信号的页面稳定窗口等待，不改变已存 snapshot 复用语义。
 *
 * @param params - 解析参数。
 * @returns 快照、来源与降级信息。
 */
export async function resolvePageStyleContextSnapshot(params: {
  conversationKey: string;
  metadata: BrowserContextMetadataSnapshot | null;
  forceSignals?: boolean;
  forceCaptures?: boolean;
  requireCaptures?: boolean;
  stableWaitMs?: number;
  maxCaptures?: number;
  captureRequestKey?: string;
  capturePriority?: number;
}): Promise<ResolvedPageStyleContextSnapshot> {
  const conversationKey = String(params.conversationKey || '').trim();
  if (!conversationKey) {
    return {
      snapshot: null,
      snapshotSource: null,
      liveError: 'topic-unavailable',
      captureWarning: params.requireCaptures ? i18nText('errors.pageStyleScreenshotsUnavailable') : null,
    };
  }

  const storedSnapshot = await getPageStyleContextSnapshot(conversationKey);
  const liveLayoutResponse = await requestPageStyleLayoutFromSw(params.metadata);
  const liveLayout = liveLayoutResponse.payload ?? null;
  const liveError = liveLayout
    ? null
    : normalizeResponseErrorCode(liveLayoutResponse.error, 'collector-unavailable');

  if (!liveLayout) {
    if (storedSnapshot) {
      return {
        snapshot: storedSnapshot,
        snapshotSource: 'stored',
        liveError,
        captureWarning: params.requireCaptures && storedSnapshot.captures.length < 1
          ? normalizeCaptureWarning(liveLayoutResponse.error)
          : null,
      };
    }
    return {
      snapshot: null,
      snapshotSource: null,
      liveError,
      captureWarning: params.requireCaptures ? normalizeCaptureWarning(liveLayoutResponse.error) : null,
    };
  }

  const pageFingerprint = String(liveLayout.pageFingerprint || '').trim();
  const canReuseStored = Boolean(
    storedSnapshot
    && storedSnapshot.pageFingerprint === pageFingerprint,
  );
  const requireCaptures = Boolean(params.requireCaptures);
  const shouldForceSignals = Boolean(params.forceSignals);
  const shouldForceCaptures = Boolean(params.forceCaptures);
  const canDirectlyReuseStored = canReuseStored
    && !shouldForceSignals
    && (!requireCaptures || (!shouldForceCaptures && storedSnapshot!.captures.length > 0));

  if (canDirectlyReuseStored) {
    return {
      snapshot: storedSnapshot!,
      snapshotSource: 'stored',
      liveError: null,
      captureWarning: null,
    };
  }

  let liveSignals: PageStyleSignalsPayload;
  if (canReuseStored && !shouldForceSignals) {
    liveSignals = storedSnapshot!.signals;
  } else {
    const liveSignalsResponse = await requestPageStyleSignalsFromSw(params.metadata, params.stableWaitMs);
    const liveSignalsPayload = liveSignalsResponse.payload ?? null;
    if (!liveSignalsPayload) {
      if (storedSnapshot && canReuseStored) {
        return {
          snapshot: storedSnapshot,
          snapshotSource: 'stored',
          liveError: normalizeResponseErrorCode(liveSignalsResponse.error, 'collector-unavailable'),
          captureWarning: requireCaptures && storedSnapshot.captures.length < 1
            ? normalizeCaptureWarning(liveSignalsResponse.error)
            : null,
        };
      }
      return {
        snapshot: null,
        snapshotSource: null,
        liveError: normalizeResponseErrorCode(liveSignalsResponse.error, 'collector-unavailable'),
        captureWarning: requireCaptures ? normalizeCaptureWarning(liveSignalsResponse.error) : null,
      };
    }
    liveSignals = liveSignalsPayload;
  }

  let captureRefs = canReuseStored ? storedSnapshot!.captures : [];
  let captureWarning: I18nText | null = null;
  if (requireCaptures) {
    const shouldReuseStoredCaptures = canReuseStored && !shouldForceCaptures && storedSnapshot!.captures.length > 0;
    if (shouldReuseStoredCaptures) {
      captureRefs = storedSnapshot!.captures;
    } else {
      const capturesResponse = await requestPageStyleCapturesFromSw(
        params.metadata,
        params.maxCaptures ?? 5,
        {
          captureRequestKey: params.captureRequestKey,
          expectedPageFingerprint: pageFingerprint,
          priority: params.capturePriority,
        },
      );
      const capturesPayload = capturesResponse.payload ?? null;
      if (capturesPayload?.frames?.length) {
        captureRefs = await persistHiddenCaptureFrames(capturesPayload);
      } else {
        captureWarning = normalizeCaptureWarning(capturesResponse.error);
        if (!canReuseStored || storedSnapshot!.captures.length < 1) {
          captureRefs = [];
        }
      }
    }
  }

  const nextSnapshot: PageStyleContextSnapshot = {
    topicId: conversationKey,
    title: liveSignals.title || liveLayout.title || storedSnapshot?.title || '',
    url: liveSignals.url || liveLayout.url || storedSnapshot?.url || '',
    pageFingerprint,
    signals: liveSignals,
    captures: captureRefs,
    capturedAt: storedSnapshot?.capturedAt ?? Date.now(),
    updatedAt: Date.now(),
  };
  await putPageStyleContextSnapshot(nextSnapshot);

  return {
    snapshot: nextSnapshot,
    snapshotSource: 'live',
    liveError: null,
    captureWarning,
  };
}

/**
 * 读取快照里的隐藏截图并转回 data URL 帧。
 *
 * @param snapshot - 已存快照。
 * @returns 可直接转为临时 API 附件的帧列表。
 */
export async function loadStoredPageStyleCaptureFrames(
  snapshot: PageStyleContextSnapshot,
): Promise<PageStyleCaptureFramePayload[]> {
  const frames: PageStyleCaptureFramePayload[] = [];
  for (const capture of snapshot.captures) {
    const blob = await getAttachmentBlob(capture.id);
    if (!blob) continue;
    const dataUrl = await blobToDataUrl(blob);
    if (!dataUrl) continue;
    frames.push({
      name: capture.name,
      mime: capture.mime,
      dataUrl,
      scrollY: capture.scrollY,
    });
  }
  return frames;
}
