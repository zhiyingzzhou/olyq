/**
 * 说明：`runtime-tabs-contract.guard.spec` 源码模块。
 *
 * 职责：
 * - 防止 background / sw plugin / browser-context 再次散落 direct `chrome.tabs.get/query/sendMessage`；
 * - 强制相关运行时通过共享 `runtime-api` 统一收敛 tabs/message 语义；
 * - 把本轮审计收口后的 contract 边界变成静态 guard。
 *
 * 边界：
 * - 只约束指定目录下的运行时代码；
 * - 测试文件不在本 guard 范围内。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GUARDED_DIRECTORIES = [
  'extension/background',
  'plugins/sw',
  'lib/browser-context',
];

/**
 * 递归列出 guard 目录下所有运行时代码文件。
 *
 * @param relativeDirectory - 相对 `src` 根目录的目录路径。
 * @returns 当前目录及其子目录下所有非测试 `.ts/.tsx` 文件。
 */
function listRuntimeFiles(relativeDirectory: string): string[] {
  const absoluteDirectory = path.join(SRC_ROOT, relativeDirectory);
  return fs.readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) return listRuntimeFiles(relativePath);
    if (!entry.isFile()) return [];
    if (!/\.(ts|tsx)$/.test(entry.name)) return [];
    if (/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) return [];
    return [relativePath];
  });
}

/**
 * 收集 direct `chrome.tabs.get/query/sendMessage` 调用。
 *
 * @param relativePath - 相对 `src` 根目录的文件路径。
 * @returns 命中的 tabs API 调用名列表。
 */
function collectDirectTabsCalls(relativePath: string): string[] {
  const absolutePath = path.join(SRC_ROOT, relativePath);
  const sourceText = fs.readFileSync(absolutePath, 'utf8');
  const sourceFile = ts.createSourceFile(absolutePath, sourceText, ts.ScriptTarget.Latest, true);
  const hits: string[] = [];

  /**
   * 深度遍历 AST，定位 direct `chrome.tabs.get/query/sendMessage`。
   *
   * @param node - 当前 AST 节点。
   */
  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && ts.isPropertyAccessExpression(node.expression.expression)
      && ts.isIdentifier(node.expression.expression.expression)
      && node.expression.expression.expression.text === 'chrome'
      && node.expression.expression.name.text === 'tabs'
    ) {
      const method = node.expression.name.text;
      if (method === 'get' || method === 'query' || method === 'sendMessage') {
        hits.push(`chrome.tabs.${method}`);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return hits;
}

describe('runtime tabs contract guard', () => {
  it('disallows direct chrome.tabs.get/query/sendMessage in guarded runtime directories', () => {
    const offenders = GUARDED_DIRECTORIES
      .flatMap(listRuntimeFiles)
      .map((relativePath) => {
        const hits = collectDirectTabsCalls(relativePath);
        return hits.length > 0 ? `${relativePath}: ${hits.join(', ')}` : null;
      })
      .filter((item): item is string => Boolean(item));

    expect(offenders).toEqual([]);
  });
});
