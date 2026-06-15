/**
 * 说明：`runtime-line-count.guard.spec` 源码模块。
 *
 * 职责：
 * - 基于当前审计快照约束 runtime 热点文件不再继续膨胀；
 * - 对未进入 baseline 豁免的运行时代码继续执行 `<= 500 LOC` 的硬限制；
 * - 在测试失败时输出可读的文件与阈值信息，避免 guard 变成黑盒。
 *
 * 边界：
 * - 这里只统计运行时代码文件，不覆盖测试文件；
 * - 历史热点文件本轮不要求一次性拆完，只要求不得继续增长。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const DEFAULT_MAX_RUNTIME_LINES = 500;
const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GENERATED_RUNTIME_DATA_FILES = new Set<string>();

/**
 * 当前审计确认过的历史热点文件 baseline。
 *
 * 说明：
 * - 这些文件暂时允许超过 500 行，但行数不允许继续上涨；
 * - 任何不在此名单里的运行时代码，一律维持 `<= 500` 的硬限制。
 */
const AUDITED_BASELINE_LIMITS: Record<string, number> = {
  'components/chat/AssistantBrowserContent.tsx': 697,
  'components/chat/AssistantStoreDialog.tsx': 686,
  'components/chat/MarkdownRendererImpl.tsx': 563,
  'components/chat/PageContextBar.tsx': 523,
  'components/chat/TopicPanel.tsx': 616,
  'components/chat/settings/DefaultModelPanel.tsx': 521,
  'components/chat/useAssistantEditorView.tsx': 567,
  'extension/content-script/element-picker.ts': 577,
  'extension/content-script/index.ts': 632,
  'hooks/useAssistantStore.ts': 844,
  'hooks/useChatStore.ts': 644,
  'lib/ai/fetch-models.ts': 640,
  'lib/ai/provider-reasoning.ts': 840,
  'lib/browser-context/collectors.ts': 1022,
  'lib/export/document-builder.ts': 515,
  'lib/persistence/domains.ts': 735,
  'lib/sync/sync-engine.ts': 515,
  'types/sw-messages.ts': 514,
};

/**
 * 递归列出 `src` 下所有运行时代码文件。
 *
 * @param relativeDirectory - 相对 `src` 根目录的子目录。
 * @returns 当前目录及其子目录下所有非测试 `.ts/.tsx` 文件。
 */
function listRuntimeFiles(relativeDirectory = ''): string[] {
  const absoluteDirectory = path.join(SRC_ROOT, relativeDirectory);
  return fs.readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = relativeDirectory
      ? path.posix.join(relativeDirectory, entry.name)
      : entry.name;
    const absolutePath = path.join(SRC_ROOT, relativePath);
    if (entry.isDirectory()) return listRuntimeFiles(relativePath);
    if (!entry.isFile()) return [];
    if (!/\.(ts|tsx)$/.test(entry.name)) return [];
    if (/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) return [];
    if (GENERATED_RUNTIME_DATA_FILES.has(relativePath)) return [];
    return [relativePath];
  });
}

/**
 * 统计运行时代码的有效实现行数。
 *
 * @param relativePath - 相对 `src` 根目录的文件路径。
 * @returns 该文件的有效代码行数。
 */
function countEffectiveLines(relativePath: string): number {
  const absolutePath = path.join(SRC_ROOT, relativePath);
  const lines = fs.readFileSync(absolutePath, 'utf8').split(/\r?\n/);
  let inBlockComment = false;
  let codeLines = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (inBlockComment) {
      if (trimmed.includes('*/')) inBlockComment = false;
      continue;
    }

    if (trimmed.startsWith('//')) continue;

    if (trimmed.startsWith('/*')) {
      if (!trimmed.includes('*/')) inBlockComment = true;
      continue;
    }

    codeLines += 1;
  }

  return codeLines;
}

describe('runtime line-count guard', () => {
  it('keeps new runtime files within 500 LOC and prevents audited hotspots from growing', () => {
    const offenders = listRuntimeFiles()
      .map((relativePath) => {
        const lines = countEffectiveLines(relativePath);
        const baselineLimit = AUDITED_BASELINE_LIMITS[relativePath] ?? DEFAULT_MAX_RUNTIME_LINES;
        if (lines <= baselineLimit) return null;
        const reason = relativePath in AUDITED_BASELINE_LIMITS
          ? `超过 audited baseline ${baselineLimit} LOC，当前 ${lines} LOC`
          : `未进入 baseline 豁免却超过 ${DEFAULT_MAX_RUNTIME_LINES} LOC，当前 ${lines} LOC`;
        return `${relativePath}: ${reason}`;
      })
      .filter((item): item is string => Boolean(item));

    expect(offenders).toEqual([]);
  });
});
