/**
 * 说明：`collectors-operations` 浏览器上下文公共操作模块。
 *
 * 职责：
 * - 暴露 prompt render、被动预热、发送前 preflight 和手动刷新入口；
 * - 统一 runtime 状态写回、降级语义和 source manifest 到 preview 的映射；
 * - 保持“采集 source”与“拼 prompt”分层，不再让 metadata 跟随直接触发 full rebuild 语义回潮。
 *
 * 边界：
 * - 本模块不直接注册 collector，也不管理 source cache store；
 * - 不直接调用浏览器 API，页面采集仍经由 `collectors-sources`；
 * - 截图附件只消费 `page-style-context` 的快照结果，不在这里管理 capture 队列。
 */
import { useAssistantStore } from '@/hooks/useAssistantStore';
import { getCurrentLanguage } from '@/i18n';
import { normalizePromptLanguage, type PromptLanguage } from '@/lib/prompt-language';
import { resolveBrowserContextEffectiveState } from './effective-state';
import {
  loadStoredPageStyleCaptureFrames,
  resolvePageStyleContextSnapshot,
} from './page-style-context';
import { getBrowserContextCollector } from './collectors-registry';
import {
  buildCollectionPreview,
  buildPromptFromCollected,
} from './collectors-prompt';
import { mergeManifestIssuesIntoPreview } from './collectors-preview';
import {
  invalidateBrowserContextPromptCacheForTab,
  restoreCollectedSourcesFromManifest,
} from './collectors-source-cache';
import {
  recordBrowserContextSendPreflightLatency,
  recordBrowserContextWarmStartLatency,
} from './metrics';
import {
  collectSources,
  resolvePageIdentity,
  resolvePageIdentitySeed,
} from './collectors-sources';
import {
  mergeBrowserContextSourceManifest,
  resolveTechnologyStackSourceForSend,
} from './technology-stack-send-preflight';
import {
  getBrowserContextMetadata,
  getBrowserContextSourceManifest,
  setBrowserContextCollecting,
  setBrowserContextLastCollection,
  setBrowserContextProfile,
  setBrowserContextSourceManifest,
  setBrowserContextStatus,
} from './runtime';
import type {
  BrowserContextCollectionIssueCode,
  BrowserContextCollectionPreview,
  BrowserContextMetadataSnapshot,
  BrowserContextProfile,
  BrowserContextPromptResult,
  BrowserContextSourceId,
  BrowserContextSourceManifest,
  BrowserContextStyleCapturePreview,
  BrowserContextViewStatus,
  BrowserContextWorkReason,
} from './types';
import {
  cloneBrowserContextSourceManifest,
  createEmptyBrowserContextSourceManifest,
} from './types';

interface BrowserContextSendResolutionResult {
  browserContext: BrowserContextPromptResult;
  captureFrames: import('@/types/sw-messages').PageStyleCaptureFramePayload[];
  captureWarning: string | null;
  styleCapture: BrowserContextStyleCapturePreview | null;
  degraded: boolean;
  status: BrowserContextViewStatus;
}

/**
 * 创建一个空的 prompt 结果。
 *
 * @param profile - 当前生效 profile。
 * @param metadata - 当前 metadata。
 * @returns 空结果。
 */
function createEmptyPromptResult(
  profile: BrowserContextProfile,
  metadata: BrowserContextMetadataSnapshot | null,
): BrowserContextPromptResult {
  return {
    prompt: null,
    profile: { ...profile, sources: [...profile.sources] },
    metadata,
    collected: [],
    sourceManifest: createEmptyBrowserContextSourceManifest(),
    preview: null,
  };
}

/**
 * 判断当前结果是否仍然允许回写到 runtime preview。
 *
 * @param metadata - 本轮解析使用的 metadata。
 * @returns 仍指向当前页面时返回 `true`。
 */
function shouldApplyPromptPreview(metadata: BrowserContextMetadataSnapshot | null): boolean {
  const current = getBrowserContextMetadata();
  if (!metadata || !current) return metadata === current;
  return current.tabId === metadata.tabId
    && current.url === metadata.url
    && (current.technologyStackPageKey ?? '') === (metadata.technologyStackPageKey ?? '');
}

/**
 * 判断当前采集任务是否已经被外层调度器取消。
 *
 * @param signal - 调度器传入的取消信号。
 * @returns 已取消时返回 `true`。
 */
function isCollectionAborted(signal: AbortSignal | undefined): boolean {
  return Boolean(signal?.aborted);
}

/**
 * 根据 manifest 和 preview 解析页面上下文展示状态。
 *
 * @param args - 状态构建参数。
 * @returns UI 可消费的 view status。
 */
function buildBrowserContextViewStatus(args: {
  metadata: BrowserContextMetadataSnapshot | null;
  manifest: BrowserContextSourceManifest;
  preview: BrowserContextCollectionPreview | null;
  degraded?: boolean;
}): BrowserContextViewStatus {
  if (!args.metadata) return 'unavailable';
  const issueCodes = Object.values(args.manifest)
    .map((entry) => entry.issueCode)
    .filter((issue): issue is BrowserContextCollectionIssueCode => Boolean(issue));
  if (issueCodes.length > 0 && issueCodes.every((issue) => issue === 'page-uncollectable' || issue === 'tab-unavailable')) {
    return 'unavailable';
  }
  if (args.degraded || issueCodes.length > 0 || args.preview?.status === 'partial') return 'degraded';
  if (Object.values(args.manifest).some((entry) => entry.freshness === 'stale')) return 'stale';
  if (args.preview) return 'ready';
  return 'stale';
}

/**
 * 基于 source manifest 渲染 browser-context prompt。
 *
 * @param args - 渲染参数。
 * @returns prompt 结果。
 */
export function renderBrowserContextPrompt(args: {
  profile: BrowserContextProfile;
  metadata: BrowserContextMetadataSnapshot | null;
  sourceManifest: BrowserContextSourceManifest;
  requestedSources?: BrowserContextSourceId[];
  allowMetadataDegrade?: boolean;
  language?: string | null;
}): BrowserContextPromptResult {
  const requestedSources = args.requestedSources ?? [...args.profile.sources];
  const language: PromptLanguage = normalizePromptLanguage(args.language ?? getCurrentLanguage());
  const collected = restoreCollectedSourcesFromManifest({
    metadata: args.metadata,
    manifest: args.sourceManifest,
    requestedSources,
  });
  const promptResult = buildPromptFromCollected({
    profile: args.profile,
    metadata: args.metadata,
    collected,
    language,
    allowMetadataDegrade: args.allowMetadataDegrade,
    buildPrompt: ({ metadata, profile, source, language }) => (
      getBrowserContextCollector(source.sourceId)?.buildPrompt({ profile, metadata, source, language }) ?? null
    ),
  });
  const preview = mergeManifestIssuesIntoPreview({
    metadata: args.metadata,
    manifest: args.sourceManifest,
    promptResult,
    preview: buildCollectionPreview(args.metadata, collected, promptResult),
    sources: collected,
  });
  return {
    prompt: promptResult.prompt,
    profile: { ...args.profile, sources: [...args.profile.sources] },
    metadata: args.metadata,
    collected,
    sourceManifest: cloneBrowserContextSourceManifest(args.sourceManifest),
    preview,
  };
}

/**
 * 构建当前 conversation 的 browser-context prompt。
 *
 * @param options - 构建参数。
 * @returns 本轮 browser-context prompt 结果。
 */
export async function buildBrowserContextPrompt(options: {
  assistantId: string;
  conversationKey: string;
  force?: boolean;
  signal?: AbortSignal;
  reason?: Exclude<BrowserContextWorkReason, 'send-preflight' | 'metadata-follow'>;
}): Promise<BrowserContextPromptResult> {
  const assistantId = String(options.assistantId || '').trim();
  const conversationKey = String(options.conversationKey || '').trim();
  const assistant = assistantId
    ? useAssistantStore.getState().assistants.find((item) => item.id === assistantId) ?? null
    : null;
  const effectiveState = resolveBrowserContextEffectiveState({
    assistant,
    conversationKey,
  });
  const profile = effectiveState.profile;
  const reason: Exclude<BrowserContextWorkReason, 'send-preflight' | 'metadata-follow'> =
    options.reason ?? (options.force ? 'manual-refresh' : 'panel-visible');

  if (!assistantId || !effectiveState.effective) {
    setBrowserContextProfile(effectiveState.disabledByAssistant ? null : profile);
    setBrowserContextSourceManifest(createEmptyBrowserContextSourceManifest());
    setBrowserContextLastCollection(null);
    setBrowserContextStatus('unavailable');
    return createEmptyPromptResult(profile, getBrowserContextMetadata());
  }

  setBrowserContextProfile(profile);
  const metadata = await resolvePageIdentity({
    metadata: getBrowserContextMetadata(),
    force: options.force,
  });
  const startedAt = performance.now();

  setBrowserContextCollecting(true);
  try {
    const collected = await collectSources({
      assistantId,
      conversationKey,
      profile,
      metadata,
      reason,
      allowLive: true,
      forceLive: Boolean(options.force),
      signal: options.signal,
      readableDomIntent: effectiveState.conversationMode.fullPageEnabled ? 'full-page' : 'normal',
    });
    const result = renderBrowserContextPrompt({
      profile,
      metadata,
      sourceManifest: collected.manifest,
      requestedSources: profile.sources,
    });
    if (!isCollectionAborted(options.signal) && shouldApplyPromptPreview(metadata)) {
      setBrowserContextSourceManifest(result.sourceManifest);
      setBrowserContextLastCollection(result.preview);
      setBrowserContextStatus(buildBrowserContextViewStatus({
        metadata,
        manifest: result.sourceManifest,
        preview: result.preview,
      }));
    }
    return result;
  } finally {
    recordBrowserContextWarmStartLatency(reason, performance.now() - startedAt);
    setBrowserContextCollecting(false);
  }
}

/**
 * 为发送链路解析 browser-context 与隐藏截图附件。
 *
 * @param options - 发送前 preflight 参数。
 * @returns 发送前 browser-context 解析结果。
 */
export async function resolveBrowserContextForSend(options: {
  assistantId: string;
  conversationKey: string;
  requireReadableDom: boolean;
  requireStyleSignals: boolean;
  requireCaptures: boolean;
  budgetMs: number;
  signal?: AbortSignal;
}): Promise<BrowserContextSendResolutionResult> {
  const assistantId = String(options.assistantId || '').trim();
  const conversationKey = String(options.conversationKey || '').trim();
  const assistant = assistantId
    ? useAssistantStore.getState().assistants.find((item) => item.id === assistantId) ?? null
    : null;
  const effectiveState = resolveBrowserContextEffectiveState({
    assistant,
    conversationKey,
  });
  const profile = effectiveState.profile;

  if (!assistantId || !effectiveState.effective) {
    return {
      browserContext: createEmptyPromptResult(profile, getBrowserContextMetadata()),
      captureFrames: [],
      captureWarning: null,
      styleCapture: null,
      degraded: false,
      status: 'unavailable',
    };
  }

  const metadata = await resolvePageIdentity({
    metadata: getBrowserContextMetadata(),
    force: false,
  });
  const startedAt = performance.now();
  const requestedSources = Array.from(new Set([
    ...profile.sources,
    ...(options.requireReadableDom ? ['readable-dom' as const] : []),
    ...(options.requireStyleSignals ? ['page-style-signals' as const] : []),
  ]));
  const shouldWaitTechnologyStack = requestedSources.includes('technology-stack');
  const baseRequestedSources = shouldWaitTechnologyStack
    ? requestedSources.filter((sourceId) => sourceId !== 'technology-stack')
    : requestedSources;

  const technologyStackTask = shouldWaitTechnologyStack
    ? resolveTechnologyStackSourceForSend({
        assistantId,
        conversationKey,
        profile,
        metadata,
        signal: options.signal,
      })
    : null;

  const liveTask = (async () => {
    const identitySeedResult = await resolvePageIdentitySeed(metadata);
    const captureRequestKey = (
      options.requireCaptures
      && identitySeedResult.seed
      && metadata
    )
      ? [
          conversationKey,
          identitySeedResult.seed.pageFingerprint,
          String(options.requireCaptures ? 5 : 0),
        ].join('::')
      : undefined;
    const pageStyleResolved = options.requireStyleSignals || options.requireCaptures
      ? await resolvePageStyleContextSnapshot({
          conversationKey,
          metadata,
          requireCaptures: options.requireCaptures,
          maxCaptures: 5,
          stableWaitMs: options.budgetMs,
          captureRequestKey,
          capturePriority: 2,
        })
      : null;
    const collected = await collectSources({
      assistantId,
      conversationKey,
      profile,
      metadata,
      requestedSources: baseRequestedSources,
      reason: 'send-preflight',
      allowLive: true,
      forceLive: false,
      stableWaitMs: options.budgetMs,
      pageIdentitySeed: identitySeedResult.seed,
      pageStyleResolved,
      signal: options.signal,
      readableDomIntent: effectiveState.conversationMode.fullPageEnabled ? 'full-page' : 'normal',
    });
    const browserContext = renderBrowserContextPrompt({
      profile,
      metadata,
      sourceManifest: collected.manifest,
      requestedSources: baseRequestedSources,
    });
    const captureFrames = options.requireCaptures && pageStyleResolved?.snapshot
      ? await loadStoredPageStyleCaptureFrames(pageStyleResolved.snapshot)
      : [];
    const captureWarning = typeof pageStyleResolved?.captureWarning === 'string'
      ? pageStyleResolved.captureWarning
      : pageStyleResolved?.captureWarning?.key ?? null;
    return {
      browserContext,
      captureFrames,
      captureWarning,
      styleCapture: options.requireStyleSignals
        ? {
            requested: options.requireCaptures,
            frameCount: captureFrames.length,
            target: options.requireCaptures ? 'vision-input' : 'style-signals-only',
            warningCode: captureWarning,
          }
        : null,
      degraded: false,
      status: buildBrowserContextViewStatus({
        metadata,
        manifest: browserContext.sourceManifest,
        preview: browserContext.preview,
      }),
    } satisfies BrowserContextSendResolutionResult;
  })();

  let result: BrowserContextSendResolutionResult;
  if (options.budgetMs > 0) {
    const timeoutTask = new Promise<BrowserContextSendResolutionResult>((resolve) => {
      globalThis.setTimeout(() => {
        const manifest = cloneBrowserContextSourceManifest(getBrowserContextSourceManifest());
        const browserContext = renderBrowserContextPrompt({
          profile,
          metadata,
          sourceManifest: manifest,
          requestedSources: baseRequestedSources,
          allowMetadataDegrade: true,
        });
        resolve({
          browserContext,
          captureFrames: [],
          captureWarning: 'timeout',
          styleCapture: options.requireStyleSignals
            ? {
                requested: options.requireCaptures,
                frameCount: 0,
                target: options.requireCaptures ? 'vision-input' : 'style-signals-only',
                warningCode: 'timeout',
              }
            : null,
          degraded: true,
          status: buildBrowserContextViewStatus({
            metadata,
            manifest,
            preview: browserContext.preview,
            degraded: true,
          }),
        });
      }, options.budgetMs);
    });
    result = await Promise.race([liveTask, timeoutTask]);
  } else {
    result = await liveTask;
  }

  if (technologyStackTask) {
    const technologyStackManifest = await technologyStackTask;
    const sourceManifest = mergeBrowserContextSourceManifest(result.browserContext.sourceManifest, technologyStackManifest);
    const browserContext = renderBrowserContextPrompt({
      profile,
      metadata,
      sourceManifest,
      requestedSources,
      allowMetadataDegrade: result.degraded,
    });
    result = {
      ...result,
      browserContext,
      status: buildBrowserContextViewStatus({
        metadata,
        manifest: browserContext.sourceManifest,
        preview: browserContext.preview,
        degraded: result.degraded,
      }),
    };
  }

  if (!isCollectionAborted(options.signal) && shouldApplyPromptPreview(metadata)) {
    const preview = result.browserContext.preview && result.styleCapture
      ? { ...result.browserContext.preview, styleCapture: result.styleCapture }
      : result.browserContext.preview;
    setBrowserContextSourceManifest(result.browserContext.sourceManifest);
    setBrowserContextLastCollection(preview);
    setBrowserContextStatus(result.status);
  }
  recordBrowserContextSendPreflightLatency(performance.now() - startedAt, result.degraded);
  return result;
}

/**
 * 手动刷新当前页面的 browser-context prompt。
 *
 * @param options - 刷新参数。
 * @returns 刷新后的 prompt 结果。
 */
export async function refreshBrowserContextPrompt(options: {
  assistantId: string;
  conversationKey: string;
  signal?: AbortSignal;
}): Promise<BrowserContextPromptResult> {
  const metadata = getBrowserContextMetadata();
  invalidateBrowserContextPromptCacheForTab({
    tabId: metadata?.tabId,
    url: metadata?.url,
  });
  return buildBrowserContextPrompt({
    assistantId: options.assistantId,
    conversationKey: options.conversationKey,
    force: true,
    signal: options.signal,
    reason: 'manual-refresh',
  });
}
