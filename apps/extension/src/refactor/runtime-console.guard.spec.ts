/**
 * 说明：`runtime-console.guard.spec` 源码模块。
 *
 * 职责：
 * - 禁止运行时代码继续新增裸 `console.log/info`；
 * - 仅对白名单内的 logger 实现文件与明确标记的 E2E 日志文件保留例外；
 * - 把日志边界固化成可回归验证的静态 guard。
 *
 * 边界：
 * - 测试文件不在本 guard 约束范围内；
 * - `console.warn/error/debug` 不由本 guard 管控，它们各自通过 logger 约束或显式 E2E 规则处理。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWED_CONSOLE_USAGE: Record<string, { requiredMarker?: string }> = {
  'extension/background/message-handlers/port-chat-handlers.ts': {
    requiredMarker: 'IS_E2E',
  },
  'lib/logger.ts': {},
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
    if (entry.isDirectory()) return listRuntimeFiles(relativePath);
    if (!entry.isFile()) return [];
    if (!/\.(ts|tsx)$/.test(entry.name)) return [];
    if (/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) return [];
    return [relativePath];
  });
}

/**
 * 提取单个文件中的裸 `console.log/info` 调用。
 *
 * @param relativePath - 相对 `src` 根目录的文件路径。
 * @returns 命中的 console 调用类型列表。
 */
function collectConsoleCalls(relativePath: string): string[] {
  const absolutePath = path.join(SRC_ROOT, relativePath);
  const sourceText = fs.readFileSync(absolutePath, 'utf8');
  const sourceFile = ts.createSourceFile(absolutePath, sourceText, ts.ScriptTarget.Latest, true);
  const calls: string[] = [];

  /**
   * 深度遍历 AST，收集裸 `console.log/info` 调用。
   *
   * @param node - 当前 AST 节点。
   */
  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && ts.isIdentifier(node.expression.expression)
      && node.expression.expression.text === 'console'
    ) {
      const method = node.expression.name.text;
      if (method === 'log' || method === 'info') {
        calls.push(`console.${method}`);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return calls;
}

describe('runtime console guard', () => {
  it('forbids bare console.log/info outside logger and explicit E2E files', () => {
    const offenders = listRuntimeFiles()
      .map((relativePath) => {
        const calls = collectConsoleCalls(relativePath);
        if (calls.length < 1) return null;

        const allowRule = ALLOWED_CONSOLE_USAGE[relativePath];
        if (allowRule) {
          if (!allowRule.requiredMarker) return null;
          const sourceText = fs.readFileSync(path.join(SRC_ROOT, relativePath), 'utf8');
          if (sourceText.includes(allowRule.requiredMarker)) return null;
          return `${relativePath}: 命中白名单但缺少 E2E 标记 ${allowRule.requiredMarker}`;
        }

        return `${relativePath}: 检测到 ${calls.join(', ')}`;
      })
      .filter((item): item is string => Boolean(item));

    expect(offenders).toEqual([]);
  });
});
