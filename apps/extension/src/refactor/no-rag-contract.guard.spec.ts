/**
 * 说明：`no-rag-contract.guard.spec` 源码模块。
 *
 * 职责：
 * - 防止已删除的本地知识库检索产品语义再次进入扩展运行时代码；
 * - 防止助手 schema、设置页文案和性能页存储说明重新出现旧命名；
 * - 把“全局记忆只按 memory/tool 语义表达”的约束固化成静态校验。
 *
 * 边界：
 * - 只扫描 `src` 下非测试源码与 locale JSON；
 * - 不限制 docs 对历史决策的中文说明。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const BLOCKED_TERMS = [
  ['knowledge', 'Bases'].join(''),
  ['local', 'Rag'].join(''),
  ['rag', 'Memory'].join(''),
] as const;
const BLOCKED_ACRONYM = String.fromCharCode(82, 65, 71);
const BLOCKED_ACRONYM_PATTERN = new RegExp(`\\b${BLOCKED_ACRONYM}\\b`);

/**
 * 递归列出 `src` 下需要守护的源码文件。
 *
 * @param relativeDirectory - 相对 `src` 的目录。
 * @returns 当前目录及其子目录下所有非测试源码。
 */
function listGuardedFiles(relativeDirectory = ''): string[] {
  const absoluteDirectory = path.join(SRC_ROOT, relativeDirectory);
  return fs.readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = relativeDirectory
      ? path.posix.join(relativeDirectory, entry.name)
      : entry.name;
    if (entry.isDirectory()) return listGuardedFiles(relativePath);
    if (!entry.isFile()) return [];
    if (!/\.(ts|tsx|js|jsx|json)$/.test(entry.name)) return [];
    if (/\.(spec|test)\.(ts|tsx|js|jsx)$/.test(entry.name)) return [];
    return [relativePath];
  });
}

/**
 * 收集旧检索命名违规点。
 *
 * @returns 文件、行号与命中的稳定摘要。
 */
function collectRetrievalNamingOffenders(): string[] {
  return listGuardedFiles().flatMap((relativePath) => {
    const sourceText = fs.readFileSync(path.join(SRC_ROOT, relativePath), 'utf8');
    return sourceText.split(/\r?\n/).flatMap((line, index) => {
      const hits = [
        ...BLOCKED_TERMS.filter((term) => line.includes(term)),
        ...(BLOCKED_ACRONYM_PATTERN.test(line) ? [BLOCKED_ACRONYM] : []),
      ];
      return hits.length > 0 ? [`${relativePath}:${index + 1} ${hits.join(', ')}`] : [];
    });
  });
}

describe('no local retrieval naming contract guard', () => {
  it('disallows deleted retrieval naming in runtime source', () => {
    expect(collectRetrievalNamingOffenders()).toEqual([]);
  });
});
