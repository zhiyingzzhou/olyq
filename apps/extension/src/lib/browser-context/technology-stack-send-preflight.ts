/**
 * 说明：browser-context 发送前技术栈 enhanced 等待 helper。
 *
 * 职责：
 * - 只在当前 profile 启用 `technology-stack` source 时等待 bounded enhanced；
 * - 超时后使用当前 source cache 渲染 best-effort fast 结果；
 * - 将技术栈 source manifest 合并回普通发送前 source manifest。
 *
 * 边界：
 * - 不读取用户输入文本，不做关键词或多语言意图判断；
 * - 等待预算只作用于 `technology-stack`，不扩大其它 source 的普通 preflight 预算；
 * - 只处理 source manifest，不直接拼 prompt 或写 runtime 状态。
 */
import { collectSources } from './collectors-sources';
import type {
  BrowserContextMetadataSnapshot,
  BrowserContextProfile,
  BrowserContextSourceManifest,
} from './types';
import { cloneBrowserContextSourceManifest } from './types';

/** 发送前技术栈 source 等待 enhanced 的最大时间；只作用于 technology-stack source。 */
export const TECHNOLOGY_STACK_SEND_ENHANCED_WAIT_MS = 6_500;

/**
 * 合并发送前技术栈 source manifest。
 *
 * 说明：
 * - 技术栈 enhanced 等待是独立于正文 / 风格 source 的旁路任务；
 * - 这里必须只替换 `technology-stack` 条目，避免把旁路任务返回的空白 manifest
 *   覆盖掉本轮已经采到的 `readable-dom`、`page-style-signals` 等 source。
 */
export function mergeBrowserContextSourceManifest(
  base: BrowserContextSourceManifest,
  overrides: BrowserContextSourceManifest,
): BrowserContextSourceManifest {
  const merged = cloneBrowserContextSourceManifest(base);
  merged['technology-stack'] = { ...overrides['technology-stack'] };
  return merged;
}

/** timeout 后用当前 source cache 渲染 technology-stack best-effort 条目。 */
export async function resolveTechnologyStackSourceForSend(args: {
  assistantId: string;
  conversationKey: string;
  profile: BrowserContextProfile;
  metadata: BrowserContextMetadataSnapshot | null;
  signal?: AbortSignal;
}): Promise<BrowserContextSourceManifest> {
  const liveTask = collectSources({
    assistantId: args.assistantId,
    conversationKey: args.conversationKey,
    profile: args.profile,
    metadata: args.metadata,
    requestedSources: ['technology-stack'],
    reason: 'send-preflight',
    allowLive: true,
    forceLive: false,
    technologyStackMinPass: 'enhanced',
    technologyStackWaitMs: TECHNOLOGY_STACK_SEND_ENHANCED_WAIT_MS,
    signal: args.signal,
  });

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutTask = new Promise<BrowserContextSourceManifest>((resolve) => {
    timeoutId = globalThis.setTimeout(() => {
      void collectSources({
        assistantId: args.assistantId,
        conversationKey: args.conversationKey,
        profile: args.profile,
        metadata: args.metadata,
        requestedSources: ['technology-stack'],
        reason: 'send-preflight',
        allowLive: false,
        forceLive: false,
        signal: args.signal,
      }).then((fallback) => resolve(fallback.manifest));
    }, TECHNOLOGY_STACK_SEND_ENHANCED_WAIT_MS);
  });

  try {
    return await Promise.race([
      liveTask.then((result) => result.manifest),
      timeoutTask,
    ]);
  } finally {
    if (timeoutId) globalThis.clearTimeout(timeoutId);
  }
}
