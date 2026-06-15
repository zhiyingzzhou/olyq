/**
 * 说明：Content Script / 页面工具 runtime 通信 guard。
 *
 * 职责：
 * - 禁止 page-facing 业务代码重新直连扩展 runtime send/connect；
 * - 强制 Content Script、截图插件、MCP UI client 和 bridge 层统一使用 typed client；
 * - 防止后续绕过当前 Promise 化 one-shot 与 typed Port contract。
 *
 * 边界：
 * - 只扫描生产 `.ts/.tsx` 文件；
 * - `lib/extension/runtime-api.ts`、typed Port client 这类底层封装不在本 guard 范围内。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GUARDED_DIRECTORIES = [
  'extension/content-script',
  'plugins/page-tools/screenshot-capture/content',
  'extension/bridge',
  'lib/mcp',
];
const BLOCKED_RUNTIME_METHODS = new Set(['sendMessage', 'connect']);

/** 递归列出 guard 目录下的生产 TypeScript 文件。 */
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

/** 判断表达式是否是 `chrome.runtime.<method>` 或 `<runtime>.sendMessage/connect` 调用。 */
function readBlockedRuntimeCall(expression: ts.Expression): string | null {
  if (!ts.isPropertyAccessExpression(expression)) return null;
  const method = expression.name.text;
  if (!BLOCKED_RUNTIME_METHODS.has(method)) return null;
  const owner = expression.expression;
  if (
    ts.isPropertyAccessExpression(owner)
    && ts.isIdentifier(owner.expression)
    && owner.expression.text === 'chrome'
    && owner.name.text === 'runtime'
  ) {
    return `chrome.runtime.${method}`;
  }
  if (ts.isIdentifier(owner) && owner.text === 'runtime') {
    return `runtime.${method}`;
  }
  return null;
}

/** 收集单个文件里的 direct runtime 调用。 */
function collectDirectRuntimeCalls(relativePath: string): string[] {
  const absolutePath = path.join(SRC_ROOT, relativePath);
  const sourceText = fs.readFileSync(absolutePath, 'utf8');
  const sourceFile = ts.createSourceFile(absolutePath, sourceText, ts.ScriptTarget.Latest, true, relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const hits: string[] = [];

  /** 深度遍历 AST。 */
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const call = readBlockedRuntimeCall(node.expression);
      if (call) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        hits.push(`${call}:${line + 1}`);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return hits;
}

describe('content script runtime messaging guard', () => {
  it('forbids direct runtime send/connect in page-facing business code', () => {
    const offenders = GUARDED_DIRECTORIES
      .flatMap(listRuntimeFiles)
      .map((relativePath) => {
        const hits = collectDirectRuntimeCalls(relativePath);
        return hits.length > 0 ? `${relativePath}: ${hits.join(', ')}` : null;
      })
      .filter((item): item is string => Boolean(item));

    expect(offenders).toEqual([]);
  });
});
