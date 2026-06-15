/**
 * 说明：browser-context source manifest 到 preview 的合并 helper。
 *
 * 职责：
 * - 将 source manifest 中的 issue 合并到本轮 collection preview；
 * - 在只有 manifest issue、没有正文 preview 时构造失败态 preview；
 * - 对重复 issue 做 source/code 维度去重。
 *
 * 边界：
 * - 本模块不负责 source 采集、prompt 渲染或 runtime 写回；
 * - issue message 只保留稳定 code，不在底层格式化成当前 UI 语言。
 */
import type { BuiltBrowserContextPromptPayload } from './collectors-prompt';
import type {
  BrowserContextCollectedSource,
  BrowserContextCollectionIssue,
  BrowserContextCollectionPreview,
  BrowserContextMetadataSnapshot,
  BrowserContextSourceManifest,
} from './types';

/**
 * 将 manifest 里的 issue 合并进 preview。
 *
 * @param args - 预览合并参数。
 * @returns 合并后的 preview。
 */
export function mergeManifestIssuesIntoPreview(args: {
  metadata: BrowserContextMetadataSnapshot | null;
  promptResult: BuiltBrowserContextPromptPayload;
  manifest: BrowserContextSourceManifest;
  preview: BrowserContextCollectionPreview | null;
  sources: BrowserContextCollectedSource[];
}): BrowserContextCollectionPreview | null {
  const manifestIssues = Object.values(args.manifest)
    .filter((entry) => entry.issueCode)
    .map((entry) => ({
      sourceId: entry.sourceId,
      code: entry.issueCode!,
      message: entry.issueCode!,
    }));
  if (!args.preview && manifestIssues.length < 1) return null;
  if (!args.preview) {
    return {
      status: 'failed',
      captureMode: 'metadata-only',
      sources: args.sources.filter((item) => item.ok && item.data).map((item) => item.sourceId),
      issues: manifestIssues,
      bodyAvailable: false,
      snippet: '',
      headings: [],
      bodyChars: 0,
      promptChars: args.promptResult.promptChars,
      collectedAt: args.metadata?.extractedAt ?? Date.now(),
      promptTruncated: args.promptResult.promptTruncated,
      styleCapture: null,
    };
  }
  const dedupedIssues = new Map<string, BrowserContextCollectionIssue>();
  for (const issue of [...args.preview.issues, ...manifestIssues]) {
    dedupedIssues.set(`${issue.sourceId}:${issue.code}`, issue);
  }
  return {
    ...args.preview,
    status: dedupedIssues.size > 0 && args.preview.status === 'success' ? 'partial' : args.preview.status,
    issues: Array.from(dedupedIssues.values()),
  };
}
